import { normalizeEntry } from "../src/lib/analysis.js";
import { applyRateLimitHeaders, checkRateLimit, getClientIp, isAllowedOrigin } from "./_lib/security.js";
import { createEntry, listEntries } from "./_lib/database.js";

function sendJson(res, statusCode, payload) {
  res.status(statusCode);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(JSON.stringify(payload));
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      throw new Error("Invalid JSON body.");
    }
  }
  return body;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin, req)) {
    return sendJson(res, 403, { error: "Origin not allowed." });
  }

  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`entries:${clientIp}`);
  applyRateLimitHeaders(res, rateLimit);

  if (!rateLimit.allowed) {
    return sendJson(res, 429, { error: "Rate limit exceeded." });
  }

  try {
    if (req.method === "GET") {
      const payload = await listEntries();
      return sendJson(res, 200, payload);
    }

    if (req.method === "POST") {
      const contentType = req.headers["content-type"] || "";
      if (typeof contentType !== "string" || !contentType.toLowerCase().includes("application/json")) {
        return sendJson(res, 415, { error: "Content-Type must be application/json." });
      }

      const body = parseBody(req.body);
      const record = await createEntry(normalizeEntry(body?.entry || body));
      return sendJson(res, 201, { entry: record });
    }

    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
