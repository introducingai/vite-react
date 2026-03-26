import { applyRateLimitHeaders, applySecurityHeaders, checkRateLimit, getClientIp, getRouteRateLimitConfig, isAllowedOrigin } from "./_lib/security.js";
import { buildBirdLaunchQueries, runBirdSearch } from "./_lib/bird.js";

function sendJson(res, statusCode, payload) {
  res.status(statusCode);
  applySecurityHeaders(res);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(JSON.stringify(payload));
}

function dedupeTweets(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const key = String(item?.id || item?.url || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin, req, { allowMissingOrigin: false })) {
    return sendJson(res, 403, { error: "Origin not allowed." });
  }

  try {
    const clientIp = getClientIp(req);
    const rateLimit = await checkRateLimit(`x-search:${clientIp}`, getRouteRateLimitConfig("MONITOR_RATE_LIMIT", { maxRequests: 4, windowMs: 60_000 }));
    applyRateLimitHeaders(res, rateLimit);

    if (!rateLimit.allowed) {
      if (rateLimit.statusCode === 429) {
        res.setHeader("Retry-After", String(Math.max(Math.ceil((rateLimit.resetAt - Date.now()) / 1000), 1)));
      }
      return sendJson(res, rateLimit.statusCode || 429, { error: rateLimit.error || "Rate limit exceeded." });
    }

    const requestUrl = new URL(req.url, "http://localhost");
    const query = String(requestUrl.searchParams.get("query") || requestUrl.searchParams.get("q") || "").trim();
    const preset = String(requestUrl.searchParams.get("preset") || "").trim().toLowerCase();
    const seed = String(requestUrl.searchParams.get("term") || query || "introducing").trim();
    const limit = Math.max(1, Math.min(Number(requestUrl.searchParams.get("limit")) || 8, 25));
    const timeoutMs = Math.max(2_000, Math.min(Number(requestUrl.searchParams.get("timeoutMs")) || 20_000, 60_000));

    const queries = preset === "launches"
      ? buildBirdLaunchQueries(seed)
      : [query || "introducing"];

    const settled = await Promise.allSettled(
      queries.map((item) => runBirdSearch(item, { limit, timeoutMs })),
    );

    const searches = settled.map((result, index) => {
      if (result.status === "fulfilled") {
        return {
          query: queries[index],
          ok: true,
          count: result.value.count,
          tweets: result.value.tweets,
        };
      }

      return {
        query: queries[index],
        ok: false,
        count: 0,
        tweets: [],
        error: result.reason instanceof Error ? result.reason.message : "bird search failed.",
      };
    });

    const tweets = dedupeTweets(searches.flatMap((item) => item.tweets))
      .sort((left, right) => Date.parse(right.created_at || "") - Date.parse(left.created_at || ""));

    const successfulSearches = searches.filter((item) => item.ok);
    if (successfulSearches.length === 0) {
      const firstError = searches.find((item) => item.error)?.error || "bird search failed.";
      return sendJson(res, 503, {
        error: firstError,
        setup_hint: "Make sure bird is installed and authenticated. Try `bird whoami` in a fresh terminal, or set BIRD_BIN / AUTH_TOKEN / CT0 for the server process.",
        provider: "bird.fast",
        searches,
      });
    }

    return sendJson(res, 200, {
      provider: "bird.fast",
      mode: preset === "launches" ? "launches" : "search",
      queries,
      count: tweets.length,
      tweets,
      searches,
      searched_at: new Date().toISOString(),
    });
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : "An unexpected error occurred." });
  }
}
