const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const DATA_DIR = process.env.VERCEL ? path.join(os.tmpdir(), "data") : path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "lifeos.json");
const LIFEOS_INGEST_URL = process.env.LIFEOS_INGEST_URL;

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    if (request.body && typeof request.body === "object") {
      resolve(request.body);
      return;
    }

    if (typeof request.body === "string") {
      try {
        resolve(JSON.parse(request.body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
      return;
    }

    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk;
    });

    request.on("end", () => {
      try {
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });

    request.on("error", reject);
  });
}

async function readRecords() {
  try {
    const content = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeRecords(records) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}

function buildRecord(body) {
  return {
    id: crypto.randomUUID(),
    timestamp: typeof body.timestamp === "string" && body.timestamp.trim()
      ? body.timestamp.trim()
      : new Date().toISOString(),
    type: body.type || "childos_action",
    context: body.context || "",
    short_term_goal: body.short_term_goal || "",
    decision: body.decision || ""
  };
}

async function syncToLifeOS(record) {
  if (!LIFEOS_INGEST_URL) {
    console.warn("[lifeos/write] LifeOS ingest sync skipped", {
      sync: "fail",
      status: null
    });
    return;
  }

  try {
    const lifeosResponse = await fetch(LIFEOS_INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record)
    });

    if (!lifeosResponse.ok) {
      console.warn("[lifeos/write] LifeOS ingest returned non-OK status", {
        sync: "fail",
        status: lifeosResponse.status
      });
      return;
    }

    console.log("[lifeos/write] LifeOS ingest sync success", {
      sync: "success",
      status: lifeosResponse.status
    });
  } catch (error) {
    console.warn("[lifeos/write] LifeOS ingest request failed", {
      sync: "fail",
      status: null
    });
  }
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    return sendJson(response, 405, {
      success: false,
      error: "Only POST requests are supported"
    });
  }

  try {
    const body = await readRequestBody(request);
    const record = buildRecord(body);
    const records = await readRecords();

    records.push(record);
    await writeRecords(records);
    await syncToLifeOS(record);

    return sendJson(response, 200, {
      success: true,
      id: record.id,
      storage: DATA_FILE
    });
  } catch (error) {
    return sendJson(response, 500, {
      success: false,
      error: error.message
    });
  }
};
