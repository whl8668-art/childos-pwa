const AGNES_API_URL = process.env.AGNES_API_URL;
const AGNES_MODEL = process.env.AGNES_MODEL || "agnes";
const AGNES_API_KEY = process.env.AGNES_API_KEY;

const SYSTEM_PROMPT = `你是 ChildOS 的行动决策器。
你不是教育理论分析器，也不是心理咨询师。
你的任务是帮助妈妈在真实家庭场景中，立刻做出一个低压力、可执行、不伤害亲子关系的行动选择。

核心原则：
1. 每次只输出一个主要行动。
2. 先处理安全，再处理关系，再处理学习。
3. 不追责孩子人格，只聚焦具体行为。
4. 不输出多个方案。
5. 不做长篇分析。
6. 不制造新的任务负担。
7. 不扩展系统设计。
8. 不评价妈妈好坏，只帮助她收敛行动。
9. 如果妈妈正在焦虑，先帮助她停下扩大化思考。
10. 输出必须简短，适合手机上快速阅读。

孩子长期培养目标：
1. 独立生活能力
2. 真实责任感
3. 学习输出能力
4. 表达与关系能力
5. 稳定自我认同
6. 时代适应力

当前阶段目标：
学校任务保底，期末复习小步推进，课外班欠账不扩大，妈妈不爆炸。

系统边界：
ChildOS 不是用来要求孩子达到妈妈标准的系统。
它只帮助妈妈在当下少做冲动、少做过度干预、少把焦虑传给孩子。

输出必须严格使用 JSON，不要输出 markdown，不要输出解释文字。

JSON 格式：
{
  "current_judgment": "当前判断，1句话",
  "one_action": "现在只做，必须是一个明确动作",
  "do_not_do": "不要做，1句话",
  "say_to_child": "对孩子说，1-2句话，可直接照读",
  "review_point": "复盘点，1句话"
}`;

const REQUIRED_CARD_KEYS = [
  "current_judgment",
  "one_action",
  "do_not_do",
  "say_to_child",
  "review_point"
];

class AgnesError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "AgnesError";
    this.details = details;
    this.status = details.status || 502;
    this.rawResponse = details.rawResponse || details.bodyPreview || "";
  }
}

function getAgnesConfig() {
  return {
    apiUrl: AGNES_API_URL,
    model: AGNES_MODEL,
    hasApiKey: Boolean(AGNES_API_KEY),
    apiKeyLength: AGNES_API_KEY ? AGNES_API_KEY.length : 0
  };
}

function assertAgnesConfig() {
  if (!AGNES_API_URL) {
    throw new AgnesError("AGNES_API_URL is not configured", getAgnesConfig());
  }

  try {
    new URL(AGNES_API_URL);
  } catch (error) {
    throw new AgnesError("AGNES_API_URL is not a valid URL", getAgnesConfig());
  }

  if (!AGNES_API_KEY) {
    throw new AgnesError("AGNES_API_KEY is not configured", getAgnesConfig());
  }
}

function previewText(value, maxLength = 1200) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function maskHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => {
      if (/authorization|api-key|x-api-key/i.test(key)) {
        return [key, value ? "[hidden]" : ""];
      }

      return [key, value];
    })
  );
}

function logAgnesRequest(url, headers, requestBody) {
  console.log("[childos-decision][debug] Agnes request URL", url);
  console.log("[childos-decision][debug] Agnes request headers", maskHeaders(headers));
  console.log("[childos-decision][debug] Agnes request body", requestBody);
}

function logAgnesResponse(status, rawBody) {
  console.log("[childos-decision][debug] Agnes raw response", {
    status,
    text: rawBody
  });
}

function logAgnesError(error) {
  console.log("[childos-decision] Agnes error", {
    name: error.name,
    message: error.message,
    cause: error.cause?.message,
    details: error.details || null
  });
}

function getIncomingRequestUrl(request) {
  const host = request.headers?.host || "";
  const protocol = request.headers?.["x-forwarded-proto"] || "https";
  if (!host) return request.url || "";
  return `${protocol}://${host}${request.url || ""}`;
}

function logIncomingRequest(request, rawBody) {
  console.log("[childos-decision][debug] Incoming request URL", getIncomingRequestUrl(request));
  console.log("[childos-decision][debug] Incoming request headers", maskHeaders(request.headers || {}));
  console.log("[childos-decision][debug] Incoming request body", rawBody);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk;
      if (rawBody.length > 12000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });

    request.on("end", () => resolve(rawBody));
    request.on("error", reject);
  });
}

async function parseJsonBody(request) {
  const rawBody = await readRequestBody(request);
  try {
    return {
      rawBody,
      body: rawBody ? JSON.parse(rawBody) : {}
    };
  } catch (error) {
    throw new AgnesError("Invalid JSON body", {
      status: 400,
      rawResponse: rawBody
    });
  }
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function extractTextFromAgnes(payload) {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload.output_text === "string") return payload.output_text;
  if (typeof payload.content === "string") return payload.content;
  if (typeof payload.text === "string") return payload.text;

  const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
  if (typeof choice?.message?.content === "string") return choice.message.content;
  if (typeof choice?.text === "string") return choice.text;

  if (Array.isArray(payload.output)) {
    return payload.output
      .flatMap((item) => item.content || [])
      .map((item) => item.text || "")
      .join("");
  }

  if (Array.isArray(payload.data)) {
    return payload.data
      .map((item) => item.text || item.content || "")
      .join("");
  }

  return "";
}

function normalizeCard(rawCard) {
  if (!rawCard || typeof rawCard !== "object" || Array.isArray(rawCard)) {
    throw new Error("Agnes response is not a JSON object");
  }

  const card = {};
  for (const key of REQUIRED_CARD_KEYS) {
    if (typeof rawCard[key] !== "string" || !rawCard[key].trim()) {
      throw new Error(`Agnes response missing ${key}`);
    }
    card[key] = rawCard[key].trim();
  }

  return card;
}

function parseAgnesCard(payload) {
  if (payload && typeof payload === "object" && REQUIRED_CARD_KEYS.every((key) => key in payload)) {
    return normalizeCard(payload);
  }

  if (payload?.card && REQUIRED_CARD_KEYS.every((key) => key in payload.card)) {
    return normalizeCard(payload.card);
  }

  const text = extractTextFromAgnes(payload).trim();
  if (!text) {
    throw new Error("Agnes response is empty");
  }

  const cleanedText = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return normalizeCard(JSON.parse(cleanedText));
  } catch (error) {
    throw new AgnesError("Agnes response could not be parsed as the required JSON card", {
      status: 200,
      rawResponse: cleanedText
    });
  }
}

async function callAgnes(scene) {
  assertAgnesConfig();

  const requestBody = {
    model: AGNES_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: scene }
    ],
    response_format: { type: "json_object" }
  };

  const requestHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${AGNES_API_KEY}`,
    "X-API-Key": AGNES_API_KEY
  };

  logAgnesRequest(AGNES_API_URL, requestHeaders, requestBody);

  let agnesResponse;
  try {
    agnesResponse = await fetch(AGNES_API_URL, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(requestBody)
    });
  } catch (error) {
    throw new AgnesError("Agnes fetch failed before receiving a response", {
      status: 502,
      rawResponse: "",
      fetchError: error.message,
      cause: error.cause?.message,
      ...getAgnesConfig()
    });
  }

  const rawAgnesBody = await agnesResponse.text();
  logAgnesResponse(agnesResponse.status, rawAgnesBody);

  let agnesPayload = null;

  try {
    agnesPayload = rawAgnesBody ? JSON.parse(rawAgnesBody) : null;
  } catch (error) {
    agnesPayload = rawAgnesBody;
  }

  if (!agnesResponse.ok) {
    throw new AgnesError(`Agnes API returned HTTP ${agnesResponse.status}`, {
      status: agnesResponse.status,
      statusText: agnesResponse.statusText,
      rawResponse: rawAgnesBody,
      ...getAgnesConfig()
    });
  }

  try {
    return parseAgnesCard(agnesPayload);
  } catch (error) {
    throw new AgnesError(error.message, {
      status: agnesResponse.status,
      rawResponse: rawAgnesBody
    });
  }
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, {
      error: "Method not allowed",
      raw_response: "",
      status: 405
    });
  }

  try {
    const { body, rawBody } = await parseJsonBody(request);
    logIncomingRequest(request, rawBody);
    const scene = typeof body.scene === "string" ? body.scene.trim() : "";

    if (!scene) {
      return sendJson(response, 400, {
        error: "scene is required",
        raw_response: rawBody,
        status: 400
      });
    }

    const card = await callAgnes(scene);
    return sendJson(response, 200, { source: "ai", card });
  } catch (error) {
    logAgnesError(error);
    return sendJson(response, 502, {
      error: error.message,
      raw_response: error.rawResponse || "",
      status: error.status || 502
    });
  }
};
