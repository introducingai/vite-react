import { isAllowedOrigin } from "./_lib/security.js";
import { runSourceMonitorSweep } from "./_lib/sourceMonitor.js";

function sendJson(res, statusCode, payload) {
  res.status(statusCode);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin, req)) {
    return sendJson(res, 403, { error: "Origin not allowed." });
  }

  try {
    const payload = await runSourceMonitorSweep();
    return sendJson(res, 200, payload);
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
