import { applyRateLimitHeaders, applySecurityHeaders, checkRateLimit, getClientIp, getRouteRateLimitConfig, isAllowedOrigin, requireOperatorAccess } from "./_lib/security.js";
import { formatEntryAsThread, formatOpinionTweet, isXPostConfigured, postThread, postTweet } from "./_lib/xPost.js";

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
    try { return JSON.parse(body); } catch { throw new Error("Invalid JSON body."); }
  }
  return body;
}

export default async function handler(req, res) {
  applySecurityHeaders(res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin, req, { allowMissingOrigin: false })) {
    return sendJson(res, 403, { error: "Origin not allowed." });
  }

  // Operator auth required — only signed-in editors/admins can post
  const auth = requireOperatorAccess(req, ["editor", "admin"]);
  if (!auth.ok) {
    return sendJson(res, auth.statusCode || 401, { error: auth.error });
  }

  const clientIp = getClientIp(req);
  const rateLimit = await checkRateLimit(
    `x-post:${clientIp}`,
    getRouteRateLimitConfig("X_POST_RATE_LIMIT", { maxRequests: 20, windowMs: 60_000 })
  );
  applyRateLimitHeaders(res, rateLimit);

  if (!rateLimit.allowed) {
    res.setHeader("Retry-After", String(Math.max(Math.ceil((rateLimit.resetAt - Date.now()) / 1000), 1)));
    return sendJson(res, 429, { error: "Rate limit exceeded." });
  }

  if (!isXPostConfigured()) {
    return sendJson(res, 503, {
      error: "X posting not configured.",
      setup_hint: "Add X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET to environment variables.",
    });
  }

  try {
    const body = parseBody(req.body);
    const mode = String(body?.mode || "thread").toLowerCase();

    // mode: "thread" — post entry as a thread
    // mode: "opinion" — post editorial note as standalone tweet
    // mode: "custom" — post custom text supplied in body.text

    if (mode === "custom") {
      const text = String(body?.text || "").trim();
      if (!text) return sendJson(res, 400, { error: "text is required for custom mode." });
      const result = await postTweet(text);
      return sendJson(res, 200, { mode, tweets: [result] });
    }

    const entry = body?.entry;
    if (!entry || !entry.project_name) {
      return sendJson(res, 400, { error: "entry with project_name is required." });
    }

    if (mode === "opinion") {
      const text = formatOpinionTweet(entry);
      const result = await postTweet(text);
      return sendJson(res, 200, { mode, tweets: [result] });
    }

    // Default: thread
    const tweets = formatEntryAsThread(entry);
    const results = await postThread(tweets);
    return sendJson(res, 200, { mode, tweets: results, thread_url: results[0]?.url || "" });

  } catch (error) {
    const code = error?.code || "";
    if (code === "X_POST_AUTH_FAILED") return sendJson(res, 401, { error: "An unexpected error occurred. Please try again." });
    if (code === "X_POST_RATE_LIMITED") return sendJson(res, 429, { error: "An unexpected error occurred. Please try again." });
    return sendJson(res, 500, { error: "An unexpected error occurred. Please try again." });
  }
}
