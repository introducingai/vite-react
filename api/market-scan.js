import { applyRateLimitHeaders, applySecurityHeaders, checkRateLimit, getClientIp, getRouteRateLimitConfig, isAllowedOrigin } from "./_lib/security.js";
import { runMarketScan } from "./_lib/marketScan.js";

function sendJson(res, statusCode, payload) {
  res.status(statusCode);
  applySecurityHeaders(res);
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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin, req, { allowMissingOrigin: false })) {
    return sendJson(res, 403, { error: "Origin not allowed." });
  }

  try {
    const clientIp = getClientIp(req);
    const rateLimit = await checkRateLimit(`market-scan:${clientIp}`, getRouteRateLimitConfig("MARKET_SCAN_RATE_LIMIT", { maxRequests: 6, windowMs: 60_000 }));
    applyRateLimitHeaders(res, rateLimit);

    if (!rateLimit.allowed) {
      if (rateLimit.statusCode === 429) {
        res.setHeader("Retry-After", String(Math.max(Math.ceil((rateLimit.resetAt - Date.now()) / 1000), 1)));
      }
      return sendJson(res, rateLimit.statusCode || 429, { error: rateLimit.error || "Rate limit exceeded." });
    }

    const body = parseBody(req.body);
    const query = typeof body?.query === "string" ? body.query.trim() : "";

    if (!query) {
      return sendJson(res, 400, { error: "Query is required." });
    }

    if (query.length < 12) {
      return sendJson(res, 400, { error: "Query is too short for a useful market scan." });
    }

    const result = await runMarketScan(query);
    return sendJson(res, 200, { result });
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
