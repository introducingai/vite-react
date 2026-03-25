import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_SESSION_DURATION_SECONDS = 60 * 60 * 12;
const DEFAULT_SESSION_COOKIE_NAME = "introducing_operator_session";
const DEFAULT_OPERATOR_ROLE = "admin";

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toBase64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input) {
  const normalized = String(input || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function safeTokenEquals(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length === 0 || rightBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function getSessionSecret() {
  return String(process.env.AUTH_SESSION_SECRET || process.env.OPERATOR_SESSION_SECRET || "").trim();
}

function getSessionCookieName() {
  return String(process.env.AUTH_SESSION_COOKIE_NAME || DEFAULT_SESSION_COOKIE_NAME).trim() || DEFAULT_SESSION_COOKIE_NAME;
}

function getSessionDurationSeconds() {
  return parsePositiveInt(process.env.AUTH_SESSION_DURATION_SECONDS, DEFAULT_SESSION_DURATION_SECONDS);
}

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return role || DEFAULT_OPERATOR_ROLE;
}

function parseOperatorAccountsJson() {
  const raw = String(process.env.OPERATOR_ACCOUNTS_JSON || "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => ({
        email: String(item?.email || "").trim().toLowerCase(),
        password: String(item?.password || "").trim(),
        passwordHash: String(item?.password_hash || item?.passwordHash || "").trim().toLowerCase(),
        role: normalizeRole(item?.role),
        name: String(item?.name || item?.email || "").trim(),
      }))
      .filter((item) => item.email && (item.password || item.passwordHash));
  } catch {
    return [];
  }
}

function getSingleOperatorConfig() {
  const email = String(process.env.OPERATOR_EMAIL || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.OPERATOR_PASSWORD || "").trim();
  const passwordHash = String(process.env.OPERATOR_PASSWORD_HASH || "").trim().toLowerCase();
  const role = normalizeRole(process.env.OPERATOR_ROLE || DEFAULT_OPERATOR_ROLE);
  const name = String(process.env.OPERATOR_NAME || email || "").trim();

  if (!email || !(password || passwordHash)) {
    return null;
  }

  return {
    email,
    password,
    passwordHash,
    role,
    name,
  };
}

function getOperatorConfig() {
  const sessionSecret = getSessionSecret();
  const accounts = parseOperatorAccountsJson();
  const single = getSingleOperatorConfig();
  const operatorAccounts = accounts.length > 0 ? accounts : single ? [single] : [];

  return {
    accounts: operatorAccounts,
    sessionSecret,
    configured: Boolean(sessionSecret && operatorAccounts.length > 0),
  };
}

function hashPassword(password) {
  return createHash("sha256").update(String(password || ""), "utf8").digest("hex");
}

function parseCookies(req) {
  const header = String(req.headers.cookie || "").trim();
  if (!header) return {};

  return header.split(";").reduce((acc, item) => {
    const separatorIndex = item.indexOf("=");
    if (separatorIndex === -1) return acc;
    const key = item.slice(0, separatorIndex).trim();
    const value = item.slice(separatorIndex + 1).trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function signPayload(encodedPayload, secret) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge != null) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  if (options.path) {
    parts.push(`Path=${options.path}`);
  }

  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  return parts.join("; ");
}

function buildSessionPayload() {
  const config = getOperatorConfig();
  const account = config.accounts[0];
  const now = Math.floor(Date.now() / 1000);
  const exp = now + getSessionDurationSeconds();

  return {
    sub: account.email,
    email: account.email,
    role: account.role,
    name: account.name,
    iat: now,
    exp,
  };
}

function encodeSession(payload) {
  const config = getOperatorConfig();
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, config.sessionSecret);
  return `${encodedPayload}.${signature}`;
}

function decodeSession(token) {
  const config = getOperatorConfig();
  if (!config.sessionSecret) return null;

  const [encodedPayload, providedSignature] = String(token || "").split(".");
  if (!encodedPayload || !providedSignature) return null;

  const expectedSignature = signPayload(encodedPayload, config.sessionSecret);
  if (!safeTokenEquals(providedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload));
    if (!payload?.email || !payload?.exp) {
      return null;
    }

    if (Number(payload.exp) <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function isOperatorPasswordAuthConfigured() {
  return getOperatorConfig().configured;
}

export function getOperatorAuthMetadata() {
  const config = getOperatorConfig();
  return {
    configured: config.configured,
    accounts: config.accounts.map((account) => ({
      email: account.email,
      role: account.role,
      name: account.name,
    })),
    cookieName: getSessionCookieName(),
  };
}

export function authenticateOperatorCredentials(email, password) {
  const config = getOperatorConfig();

  if (!config.configured) {
    return {
      ok: false,
      statusCode: 503,
      error: "Operator auth is not configured on the server.",
    };
  }

  const normalizedEmail = String(email || "").trim().toLowerCase();
  const rawPassword = String(password || "");

  if (!normalizedEmail || !rawPassword) {
    return {
      ok: false,
      statusCode: 400,
      error: "Email and password are required.",
    };
  }

  const account = config.accounts.find((item) => safeTokenEquals(normalizedEmail, item.email));
  if (!account) {
    return {
      ok: false,
      statusCode: 401,
      error: "Invalid operator credentials.",
    };
  }

  const passwordMatches = account.passwordHash
    ? safeTokenEquals(hashPassword(rawPassword), account.passwordHash)
    : safeTokenEquals(rawPassword, account.password);

  if (!passwordMatches) {
    return {
      ok: false,
      statusCode: 401,
      error: "Invalid operator credentials.",
    };
  }

  return {
    ok: true,
    session: {
      sub: account.email,
      email: account.email,
      role: account.role,
      name: account.name,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + getSessionDurationSeconds(),
    },
  };
}

export function getOperatorSessionFromRequest(req) {
  const cookies = parseCookies(req);
  return decodeSession(cookies[getSessionCookieName()]);
}

export function setOperatorSessionCookie(res, sessionPayload, options = {}) {
  const token = encodeSession(sessionPayload);
  const secure = options.secure ?? (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production");
  res.setHeader(
    "Set-Cookie",
    serializeCookie(getSessionCookieName(), token, {
      httpOnly: true,
      path: "/",
      sameSite: "Lax",
      secure,
      maxAge: getSessionDurationSeconds(),
    }),
  );
}

export function clearOperatorSessionCookie(res, options = {}) {
  const secure = options.secure ?? (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production");
  res.setHeader(
    "Set-Cookie",
    serializeCookie(getSessionCookieName(), "", {
      httpOnly: true,
      path: "/",
      sameSite: "Lax",
      secure,
      maxAge: 0,
    }),
  );
}
