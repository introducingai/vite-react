import { timingSafeEqual } from "node:crypto";
import { getOperatorSessionFromRequest, isOperatorPasswordAuthConfigured } from "./auth.js";

const fallbackBuckets = new Map();
const OPERATOR_ROLE_ORDER = ["viewer", "moderator", "editor", "admin"];

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 10;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getRefererOrigin(req) {
  const referer = String(req.headers.referer || req.headers.referrer || "").trim();
  if (!referer) return "";

  try {
    return normalizeOrigin(new URL(referer).origin);
  } catch {
    return "";
  }
}

function isLocalHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function getRequestHost(req) {
  return String(req.headers.host || "").trim();
}

function getRequestProtocol(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").trim().toLowerCase();
  if (forwardedProto === "http" || forwardedProto === "https") {
    return forwardedProto;
  }

  const host = getRequestHost(req);
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return "http";
  }

  return "https";
}

function getUpstashConfig() {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/+$/, "");
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();

  return {
    url,
    token,
    enabled: Boolean(url && token),
  };
}

function getConfiguredAdminTokens() {
  return String(process.env.MODERATION_API_TOKEN || process.env.MODERATION_API_TOKENS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function isLegacyModerationTokenFallbackEnabled() {
  return String(process.env.ALLOW_LEGACY_MODERATION_TOKEN_FALLBACK || "true").trim().toLowerCase() !== "false";
}

function normalizeOperatorRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return OPERATOR_ROLE_ORDER.includes(role) ? role : "viewer";
}

function hasRequiredOperatorRole(role, allowedRoles = []) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    return true;
  }

  const normalizedRole = normalizeOperatorRole(role);
  const currentRank = OPERATOR_ROLE_ORDER.indexOf(normalizedRole);
  const requiredRanks = allowedRoles
    .map((item) => OPERATOR_ROLE_ORDER.indexOf(normalizeOperatorRole(item)))
    .filter((value) => value >= 0);

  if (requiredRanks.length === 0) {
    return true;
  }

  return currentRank >= Math.min(...requiredRanks);
}

function getAdminTokenFromRequest(req) {
  const authorization = String(req.headers.authorization || "").trim();
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  return String(req.headers["x-introducing-admin-token"] || "").trim();
}

function safeTokenEquals(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length === 0 || rightBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
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

export function getRouteRateLimitConfig(prefix = "RATE_LIMIT", fallback = {}) {
  const fallbackWindowMs = parsePositiveInt(fallback.windowMs, DEFAULT_WINDOW_MS);
  const fallbackMaxRequests = parsePositiveInt(fallback.maxRequests, DEFAULT_MAX_REQUESTS);

  return {
    windowMs: parsePositiveInt(process.env[`${prefix}_WINDOW_MS`], parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, fallbackWindowMs)),
    maxRequests: parsePositiveInt(process.env[`${prefix}_MAX_REQUESTS`], parsePositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, fallbackMaxRequests)),
  };
}

function checkLocalRateLimit(key, config) {
  const now = Date.now();
  const bucketKey = key || "unknown";
  const current = fallbackBuckets.get(bucketKey);

  if (!current || now >= current.resetAt) {
    const fresh = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    fallbackBuckets.set(bucketKey, fresh);
    return {
      allowed: true,
      remaining: Math.max(config.maxRequests - fresh.count, 0),
      resetAt: fresh.resetAt,
      limit: config.maxRequests,
      backend: "memory",
    };
  }

  if (current.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt,
      limit: config.maxRequests,
      backend: "memory",
      statusCode: 429,
      error: "Rate limit exceeded.",
    };
  }

  current.count += 1;
  fallbackBuckets.set(bucketKey, current);

  return {
    allowed: true,
    remaining: Math.max(config.maxRequests - current.count, 0),
    resetAt: current.resetAt,
    limit: config.maxRequests,
    backend: "memory",
  };
}

async function checkDistributedRateLimit(key, config) {
  const upstash = getUpstashConfig();
  const endpoint = `${upstash.url}/pipeline`;
  const bucketKey = `ratelimit:${key || "unknown"}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${upstash.token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify([
      ["INCR", bucketKey],
      ["PEXPIRE", bucketKey, String(config.windowMs), "NX"],
      ["PTTL", bucketKey],
    ]),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload)) {
    throw new Error("Distributed rate limiter request failed.");
  }

  const count = Number(payload[0]?.result || 0);
  const ttl = Number(payload[2]?.result || config.windowMs);
  const resetAt = Date.now() + (Number.isFinite(ttl) && ttl > 0 ? ttl : config.windowMs);

  if (!Number.isFinite(count) || count <= 0) {
    throw new Error("Distributed rate limiter returned an invalid counter.");
  }

  if (count > config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      limit: config.maxRequests,
      backend: "upstash",
      statusCode: 429,
      error: "Rate limit exceeded.",
    };
  }

  return {
    allowed: true,
    remaining: Math.max(config.maxRequests - count, 0),
    resetAt,
    limit: config.maxRequests,
    backend: "upstash",
  };
}

export async function checkRateLimit(key, config = getRouteRateLimitConfig()) {
  const upstash = getUpstashConfig();

  if (upstash.enabled) {
    return checkDistributedRateLimit(key, config);
  }

  if (isProductionRuntime()) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + config.windowMs,
      limit: config.maxRequests,
      backend: "unconfigured",
      statusCode: 503,
      error: "Distributed rate limiting is not configured.",
    };
  }

  return checkLocalRateLimit(key, config);
}

// Like checkRateLimit but never fails closed — uses in-memory when Upstash
// is not configured. Use this for read-only or non-sensitive endpoints.
export async function checkRateLimitWithFallback(key, config = getRouteRateLimitConfig()) {
  const upstash = getUpstashConfig();
  if (upstash.enabled) {
    return checkDistributedRateLimit(key, config);
  }
  return checkLocalRateLimit(key, config);
}

export function getAllowedOrigins(req) {
  const allowed = new Set();
  const envOrigins = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => normalizeOrigin(value))
    .filter(Boolean);

  for (const item of envOrigins) {
    allowed.add(item);
  }

  const vercelUrl = normalizeOrigin(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (vercelUrl) {
    allowed.add(vercelUrl);
  }

  const vercelProductionUrl = normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  if (vercelProductionUrl) {
    allowed.add(vercelProductionUrl);
  }

  const host = getRequestHost(req);
  if (host) {
    const protocol = getRequestProtocol(req);
    allowed.add(normalizeOrigin(`${protocol}://${host}`));

    const hostname = host.split(":")[0];
    if (!isProductionRuntime() && isLocalHost(hostname)) {
      allowed.add(normalizeOrigin(`http://${host}`));
      allowed.add(normalizeOrigin(`http://localhost:5173`));
      allowed.add(normalizeOrigin(`http://127.0.0.1:5173`));
      allowed.add(normalizeOrigin(`http://localhost:4173`));
      allowed.add(normalizeOrigin(`http://127.0.0.1:4173`));
    }
  }

  return allowed;
}

export function isAllowedOrigin(origin, req, options = {}) {
  const method = String(req.method || "GET").toUpperCase();
  const allowMissingOrigin = options.allowMissingOrigin ?? ["GET", "HEAD", "OPTIONS"].includes(method);
  const normalizedOrigin = normalizeOrigin(origin);
  const allowedOrigins = getAllowedOrigins(req);

  if (!normalizedOrigin) {
    if (allowMissingOrigin) {
      return true;
    }

    const refererOrigin = getRefererOrigin(req);
    const secFetchSite = String(req.headers["sec-fetch-site"] || "").trim().toLowerCase();
    return Boolean(refererOrigin && allowedOrigins.has(refererOrigin) && (secFetchSite === "same-origin" || secFetchSite === "same-site" || !secFetchSite));
  }

  return allowedOrigins.has(normalizedOrigin);
}

export function requireAdminAuth(req) {
  return requireOperatorAccess(req, ["admin"]);
}

export function requireOperatorAccess(req, allowedRoles = ["admin"]) {
  const session = getOperatorSessionFromRequest(req);
  if (session) {
    if (!hasRequiredOperatorRole(session.role, allowedRoles)) {
      return {
        ok: false,
        statusCode: 403,
        error: "Operator role is not allowed for this action.",
      };
    }

    return {
      ok: true,
      mode: "session",
      session,
      actor: {
        type: "operator-session",
        email: session.email,
        role: session.role,
        name: session.name || session.email,
      },
    };
  }

  const configuredTokens = getConfiguredAdminTokens();

  if (configuredTokens.length === 0) {
    if (isOperatorPasswordAuthConfigured()) {
      return {
        ok: false,
        statusCode: 401,
        error: "Operator authentication required.",
      };
    }

    if (!isProductionRuntime()) {
      return { ok: true, mode: "development-bypass" };
    }

    return {
      ok: false,
      statusCode: 503,
      error: "Moderation auth is not configured on the server.",
    };
  }

  const providedToken = getAdminTokenFromRequest(req);
  if (!providedToken) {
    return {
      ok: false,
      statusCode: 401,
      error: "Operator authentication required.",
    };
  }

  if (!isLegacyModerationTokenFallbackEnabled()) {
    return {
      ok: false,
      statusCode: 403,
      error: "Legacy moderation token fallback is disabled.",
    };
  }

  const matches = configuredTokens.some((token) => safeTokenEquals(providedToken, token));
  if (!matches) {
    return {
      ok: false,
      statusCode: 403,
      error: "Invalid moderation token.",
    };
  }

  if (!hasRequiredOperatorRole("admin", allowedRoles)) {
    return {
      ok: false,
      statusCode: 403,
      error: "Legacy moderation token does not satisfy this role requirement.",
    };
  }

  return {
    ok: true,
    mode: "token",
    actor: {
      type: "legacy-token",
      email: "legacy-token",
      role: "admin",
      name: "Legacy Token",
    },
  };
}

export function applyRateLimitHeaders(res, result) {
  res.setHeader("X-RateLimit-Limit", String(result.limit));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  if (result.backend) {
    res.setHeader("X-RateLimit-Backend", String(result.backend));
  }
}

export function applySecurityHeaders(res) {
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Origin-Agent-Cluster", "?1");
}
