const buckets = new Map();

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 10;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }

  return "unknown";
}

export function getRateLimitConfig() {
  return {
    windowMs: parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS),
    maxRequests: parsePositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, DEFAULT_MAX_REQUESTS),
  };
}

export function checkRateLimit(key, config = getRateLimitConfig()) {
  const now = Date.now();
  const bucketKey = key || "unknown";
  const current = buckets.get(bucketKey);

  if (!current || now >= current.resetAt) {
    const fresh = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    buckets.set(bucketKey, fresh);
    return {
      allowed: true,
      remaining: Math.max(config.maxRequests - fresh.count, 0),
      resetAt: fresh.resetAt,
      limit: config.maxRequests,
    };
  }

  if (current.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt,
      limit: config.maxRequests,
    };
  }

  current.count += 1;
  buckets.set(bucketKey, current);

  return {
    allowed: true,
    remaining: Math.max(config.maxRequests - current.count, 0),
    resetAt: current.resetAt,
    limit: config.maxRequests,
  };
}

export function isAllowedOrigin(origin, req) {
  if (!origin) return true;

  const allowed = new Set();
  const envOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  for (const item of envOrigins) {
    allowed.add(item);
  }

  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
  if (vercelUrl) allowed.add(vercelUrl);

  const host = req.headers.host;
  if (host) {
    allowed.add(`https://${host}`);
    if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
      allowed.add(`http://${host}`);
    }
  }

  return allowed.size === 0 ? true : allowed.has(origin);
}

export function applyRateLimitHeaders(res, result) {
  res.setHeader("X-RateLimit-Limit", String(result.limit));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
}
