// TEMPORARY debug endpoint — delete after fixing
// Only accessible to operator session
import { applySecurityHeaders, requireOperatorAccess } from "./_lib/security.js";

function sendJson(res, statusCode, payload) {
  res.status(statusCode);
  applySecurityHeaders(res);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(JSON.stringify(payload));
}

export default async function handler(req, res) {
  applySecurityHeaders(res);

  const auth = requireOperatorAccess(req, ["admin"]);
  if (!auth.ok) {
    return sendJson(res, 401, { error: "Admin only." });
  }

  // Report which X vars are present (not their values)
  return sendJson(res, 200, {
    X_API_KEY: Boolean(process.env.X_API_KEY),
    X_API_KEY_length: (process.env.X_API_KEY || "").length,
    X_API_SECRET: Boolean(process.env.X_API_SECRET),
    X_API_SECRET_length: (process.env.X_API_SECRET || "").length,
    X_ACCESS_TOKEN: Boolean(process.env.X_ACCESS_TOKEN),
    X_ACCESS_TOKEN_length: (process.env.X_ACCESS_TOKEN || "").length,
    X_ACCESS_SECRET: Boolean(process.env.X_ACCESS_SECRET),
    X_ACCESS_SECRET_length: (process.env.X_ACCESS_SECRET || "").length,
    X_BEARER_TOKEN: Boolean(process.env.X_BEARER_TOKEN),
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  });
}
