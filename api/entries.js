import { normalizeEntry } from "../src/lib/analysis.js";
import { applyRateLimitHeaders, applySecurityHeaders, checkRateLimit, getClientIp, getRouteRateLimitConfig, isAllowedOrigin, requireOperatorAccess } from "./_lib/security.js";
import { createAuditLog, createEntry, listEntries } from "./_lib/database.js";

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
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin, req, { allowMissingOrigin: req.method === "GET" })) {
    return sendJson(res, 403, { error: "Origin not allowed." });
  }

  try {
    if (req.method === "GET") {
      const clientIp = getClientIp(req);
      const rateLimit = await checkRateLimit(`entries:read:${clientIp}`, getRouteRateLimitConfig("ENTRIES_READ_RATE_LIMIT", { maxRequests: 30, windowMs: 60_000 }));
      applyRateLimitHeaders(res, rateLimit);

      if (!rateLimit.allowed) {
        if (rateLimit.statusCode === 429) {
          res.setHeader("Retry-After", String(Math.max(Math.ceil((rateLimit.resetAt - Date.now()) / 1000), 1)));
        }
        return sendJson(res, rateLimit.statusCode || 429, { error: rateLimit.error || "Rate limit exceeded." });
      }

      const payload = await listEntries();
      return sendJson(res, 200, payload);
    }

    if (req.method === "POST") {
      const auth = requireOperatorAccess(req, ["editor", "admin"]);
      if (!auth.ok) {
        return sendJson(res, auth.statusCode || 401, { error: auth.error });
      }

      const contentType = req.headers["content-type"] || "";
      if (typeof contentType !== "string" || !contentType.toLowerCase().includes("application/json")) {
        return sendJson(res, 415, { error: "Content-Type must be application/json." });
      }

      const clientIp = getClientIp(req);
      const rateLimit = await checkRateLimit(`entries:write:${clientIp}`, getRouteRateLimitConfig("ENTRIES_WRITE_RATE_LIMIT", { maxRequests: 12, windowMs: 60_000 }));
      applyRateLimitHeaders(res, rateLimit);

      if (!rateLimit.allowed) {
        if (rateLimit.statusCode === 429) {
          res.setHeader("Retry-After", String(Math.max(Math.ceil((rateLimit.resetAt - Date.now()) / 1000), 1)));
        }
        return sendJson(res, rateLimit.statusCode || 429, { error: rateLimit.error || "Rate limit exceeded." });
      }

      const body = parseBody(req.body);
      const record = await createEntry(normalizeEntry(body?.entry || body));
      await createAuditLog({
        action: "entry.created",
        actorType: auth.actor?.type || auth.mode || "unknown",
        actorEmail: auth.actor?.email || "",
        actorRole: auth.actor?.role || "",
        targetType: "entry",
        targetId: String(record?.id || ""),
        metadata: {
          project_name: record?.project_name || "",
          category: record?.category || "",
          auth_mode: auth.mode || "unknown",
        },
      });
      return sendJson(res, 201, { entry: record });
    }

    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    // Surface validation/normalizer errors clearly so callers can debug
    const isValidation = msg.toLowerCase().includes("required") || msg.toLowerCase().includes("missing") || msg.toLowerCase().includes("field");
    return sendJson(res, isValidation ? 422 : 500, { error: "Entry write failed: " + msg });
  }
}
