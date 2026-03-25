import { applyRateLimitHeaders, applySecurityHeaders, checkRateLimit, getClientIp, getRouteRateLimitConfig, isAllowedOrigin, requireOperatorAccess } from "./_lib/security.js";
import { createAuditLog, createSubmission, listSubmissions, updateSubmissionStatus } from "./_lib/database.js";

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
  if (!isAllowedOrigin(origin, req, { allowMissingOrigin: false })) {
    return sendJson(res, 403, { error: "Origin not allowed." });
  }

  try {
    if (req.method === "GET") {
      const auth = requireOperatorAccess(req, ["moderator", "editor", "admin"]);
      if (!auth.ok) {
        return sendJson(res, auth.statusCode || 401, { error: auth.error });
      }

      const clientIp = getClientIp(req);
      const rateLimit = await checkRateLimit(`submissions:read:${clientIp}`, getRouteRateLimitConfig("MODERATION_RATE_LIMIT", { maxRequests: 30, windowMs: 60_000 }));
      applyRateLimitHeaders(res, rateLimit);

      if (!rateLimit.allowed) {
        if (rateLimit.statusCode === 429) {
          res.setHeader("Retry-After", String(Math.max(Math.ceil((rateLimit.resetAt - Date.now()) / 1000), 1)));
        }
        return sendJson(res, rateLimit.statusCode || 429, { error: rateLimit.error || "Rate limit exceeded." });
      }

      const payload = await listSubmissions();
      return sendJson(res, 200, payload);
    }

    const contentType = req.headers["content-type"] || "";
    if (typeof contentType !== "string" || !contentType.toLowerCase().includes("application/json")) {
      return sendJson(res, 415, { error: "Content-Type must be application/json." });
    }

    const body = parseBody(req.body);

    if (req.method === "POST") {
      const clientIp = getClientIp(req);
      const rateLimit = await checkRateLimit(`submissions:create:${clientIp}`, getRouteRateLimitConfig("SUBMISSIONS_PUBLIC_RATE_LIMIT", { maxRequests: 6, windowMs: 60_000 }));
      applyRateLimitHeaders(res, rateLimit);

      if (!rateLimit.allowed) {
        if (rateLimit.statusCode === 429) {
          res.setHeader("Retry-After", String(Math.max(Math.ceil((rateLimit.resetAt - Date.now()) / 1000), 1)));
        }
        return sendJson(res, rateLimit.statusCode || 429, { error: rateLimit.error || "Rate limit exceeded." });
      }

      const submission = await createSubmission(body);
      await createAuditLog({
        action: "submission.created",
        actorType: "public-submit",
        actorEmail: typeof submission?.contact === "string" ? submission.contact : "",
        actorRole: "public",
        targetType: "submission",
        targetId: String(submission?.id || ""),
        metadata: {
          project_name: submission?.project_name || "",
          category_hint: submission?.category_hint || "",
          project_url: submission?.project_url || "",
        },
      });
      return sendJson(res, 201, { submission });
    }

    if (req.method === "PATCH") {
      const auth = requireOperatorAccess(req, ["moderator", "editor", "admin"]);
      if (!auth.ok) {
        return sendJson(res, auth.statusCode || 401, { error: auth.error });
      }

      const clientIp = getClientIp(req);
      const rateLimit = await checkRateLimit(`submissions:write:${clientIp}`, getRouteRateLimitConfig("MODERATION_RATE_LIMIT", { maxRequests: 30, windowMs: 60_000 }));
      applyRateLimitHeaders(res, rateLimit);

      if (!rateLimit.allowed) {
        if (rateLimit.statusCode === 429) {
          res.setHeader("Retry-After", String(Math.max(Math.ceil((rateLimit.resetAt - Date.now()) / 1000), 1)));
        }
        return sendJson(res, rateLimit.statusCode || 429, { error: rateLimit.error || "Rate limit exceeded." });
      }

      const updated = await updateSubmissionStatus(body?.id, body);
      await createAuditLog({
        action: "submission.status_updated",
        actorType: auth.actor?.type || auth.mode || "unknown",
        actorEmail: auth.actor?.email || "",
        actorRole: auth.actor?.role || "",
        targetType: "submission",
        targetId: String(updated?.id || body?.id || ""),
        metadata: {
          status: updated?.status || body?.status || "",
          notes: updated?.notes || body?.notes || "",
          auth_mode: auth.mode || "unknown",
        },
      });
      return sendJson(res, 200, { submission: updated });
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(res, 500, { error: "An unexpected error occurred. Please try again." });
  }
}
