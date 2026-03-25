import { applyRateLimitHeaders, applySecurityHeaders, checkRateLimit, getClientIp, getRouteRateLimitConfig, isAllowedOrigin, requireOperatorAccess } from "./_lib/security.js";
import { listAuditLogs } from "./_lib/database.js";

function sendJson(res, statusCode, payload) {
  res.status(statusCode);
  applySecurityHeaders(res);
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
  if (!isAllowedOrigin(origin, req, { allowMissingOrigin: true })) {
    return sendJson(res, 403, { error: "Origin not allowed." });
  }

  const auth = requireOperatorAccess(req, ["moderator", "editor", "admin"]);
  if (!auth.ok) {
    return sendJson(res, auth.statusCode || 401, { error: auth.error });
  }

  const clientIp = getClientIp(req);
  const rateLimit = await checkRateLimit(`audit-logs:read:${clientIp}`, getRouteRateLimitConfig("AUDIT_LOGS_RATE_LIMIT", { maxRequests: 20, windowMs: 60_000 }));
  applyRateLimitHeaders(res, rateLimit);

  if (!rateLimit.allowed) {
    if (rateLimit.statusCode === 429) {
      res.setHeader("Retry-After", String(Math.max(Math.ceil((rateLimit.resetAt - Date.now()) / 1000), 1)));
    }
    return sendJson(res, rateLimit.statusCode || 429, { error: rateLimit.error || "Rate limit exceeded." });
  }

  try {
    const requestUrl = new URL(req.url, "http://localhost");
    const limit = Number.parseInt(requestUrl.searchParams.get("limit") || "20", 10);
    const payload = await listAuditLogs(limit);
    return sendJson(res, 200, payload);
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
