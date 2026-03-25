import { clearOperatorSessionCookie } from "../_lib/auth.js";
import { applyRateLimitHeaders, applySecurityHeaders, checkRateLimit, getClientIp, getRouteRateLimitConfig, isAllowedOrigin } from "../_lib/security.js";

function sendJson(res, statusCode, payload) {
  res.status(statusCode);
  applySecurityHeaders(res);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(JSON.stringify(payload));
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

  const clientIp = getClientIp(req);
  const rateLimit = await checkRateLimit(`auth:logout:${clientIp}`, getRouteRateLimitConfig("AUTH_LOGOUT_RATE_LIMIT", { maxRequests: 20, windowMs: 60_000 }));
  applyRateLimitHeaders(res, rateLimit);

  if (!rateLimit.allowed) {
    if (rateLimit.statusCode === 429) {
      res.setHeader("Retry-After", String(Math.max(Math.ceil((rateLimit.resetAt - Date.now()) / 1000), 1)));
    }
    return sendJson(res, rateLimit.statusCode || 429, { error: rateLimit.error || "Rate limit exceeded." });
  }

  clearOperatorSessionCookie(res);
  return sendJson(res, 200, { authenticated: false });
}
