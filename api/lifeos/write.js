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
        resolve({ rawBody: request.body });
      }
      return;
    }

    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk;
    });

    request.on("end", () => {
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        resolve({ rawBody });
      }
    });

    request.on("error", reject);
  });
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    console.log("[lifeos/write] non-POST request", {
      method: request.method
    });

    return sendJson(response, 200, {
      success: true
    });
  }

  try {
    const body = await readRequestBody(request);
    console.log("[lifeos/write] body", body);

    return sendJson(response, 200, {
      success: true
    });
  } catch (error) {
    console.log("[lifeos/write] unexpected error", {
      message: error.message
    });

    return sendJson(response, 200, {
      success: true
    });
  }
};
