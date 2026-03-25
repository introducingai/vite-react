import { ANALYSIS_MODES, MAX_INPUT_CHARS, buildSystemPrompt, extractJsonObject, normalizeModePayload } from "../src/lib/analysis.js";
import { applyRateLimitHeaders, applySecurityHeaders, checkRateLimit, getClientIp, getRouteRateLimitConfig, isAllowedOrigin } from "./_lib/security.js";
import { getEnabledProviders, runCloudProvider } from "./_lib/providers.js";

const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4.1-mini",
  google: "gemini-2.0-flash",
  grok: "grok-3-mini",
};

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

  const contentType = req.headers["content-type"] || "";
  if (typeof contentType !== "string" || !contentType.toLowerCase().includes("application/json")) {
    return sendJson(res, 415, { error: "Content-Type must be application/json." });
  }

  const clientIp = getClientIp(req);
  const rateLimit = await checkRateLimit(`analyze:${clientIp}`, getRouteRateLimitConfig("ANALYZE_RATE_LIMIT", { maxRequests: 10, windowMs: 60_000 }));
  applyRateLimitHeaders(res, rateLimit);

  if (!rateLimit.allowed) {
    if (rateLimit.statusCode === 429) {
      res.setHeader("Retry-After", String(Math.max(Math.ceil((rateLimit.resetAt - Date.now()) / 1000), 1)));
    }
    return sendJson(res, rateLimit.statusCode || 429, { error: rateLimit.error || "Rate limit exceeded." });
  }

  try {
    const body = parseBody(req.body);
    const rawInput = typeof body?.input === "string" ? body.input.trim() : "";
    const mode = ANALYSIS_MODES.includes(body?.mode) ? body.mode : "digest";
    const provider = ["anthropic", "openai", "google", "grok"].includes(body?.provider) ? body.provider : "anthropic";
    const model = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_MODELS[provider];

    if (!getEnabledProviders()[provider]) {
      return sendJson(res, 503, { error: `${provider.toUpperCase()} is not configured on the server.` });
    }

    if (!rawInput) {
      return sendJson(res, 400, { error: "Input is required." });
    }

    if (rawInput.length < 20) {
      return sendJson(res, 400, { error: "Input is too short to analyze reliably." });
    }

    if (rawInput.length > MAX_INPUT_CHARS) {
      return sendJson(res, 413, { error: `Input exceeds ${MAX_INPUT_CHARS} characters.` });
    }

    const rawResponse = await runCloudProvider({
      provider,
      model,
      systemPrompt: buildSystemPrompt(mode),
      userInput: `Analyze this input:\n\n${rawInput}`,
    });

    if (!rawResponse) {
      return sendJson(res, 502, { error: "The analysis provider returned an empty response." });
    }

    const parsed = extractJsonObject(rawResponse);
    const result = normalizeModePayload(mode, parsed);

    return sendJson(res, 200, { mode, provider, model, result, availableProviders: getEnabledProviders() });
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    const safeMessage = statusCode === 400 || statusCode === 415 || statusCode === 429
      ? (error instanceof Error ? error.message : "Bad request.")
      : "An unexpected error occurred. Please try again.";
    return sendJson(res, statusCode, { error: safeMessage });
  }
}
