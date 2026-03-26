// X API v2 adapter — replaces bird.fast CLI integration.
// Uses the X API v2 recent search endpoint directly via fetch.
// Set X_BEARER_TOKEN in Vercel env vars or local .env.
// Same output interface as the original bird.js so sourceMonitor.js is unchanged.

const X_API_BASE = "https://api.twitter.com/2";
const DEFAULT_LIMIT = 8;
const DEFAULT_TIMEOUT_MS = 20_000;

function getBearerToken() {
  return String(process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN || "").trim();
}

export function isXConfigured() {
  return Boolean(getBearerToken());
}

function normalizeQueryValue(value) {
  return String(value || "").trim();
}

function normalizeTweet(tweet, includes, query) {
  const authorId = tweet?.author_id || "";
  const user = (includes?.users || []).find((u) => u.id === authorId) || {};
  const username = user.username || "";
  const name = user.name || username;
  const metrics = tweet?.public_metrics || {};

  return {
    id: String(tweet?.id || ""),
    text: String(tweet?.text || "").trim(),
    created_at: tweet?.created_at || "",
    author: { username, name },
    author_id: authorId,
    metrics: {
      replies: Number(metrics.reply_count || 0),
      reposts: Number(metrics.retweet_count || 0),
      likes: Number(metrics.like_count || 0),
    },
    conversation_id: tweet?.conversation_id || "",
    in_reply_to_status_id: tweet?.in_reply_to_user_id || "",
    url: username && tweet?.id ? "https://x.com/" + username + "/status/" + tweet.id : "",
    query,
  };
}

export async function runBirdSearch(query, { limit = DEFAULT_LIMIT, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const normalizedQuery = normalizeQueryValue(query);
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, 25));

  if (!normalizedQuery) throw new Error("Search query is required.");

  const token = getBearerToken();
  if (!token) {
    const error = new Error("X API not configured. Set X_BEARER_TOKEN in environment variables.");
    error.code = "BIRD_NOT_CONFIGURED";
    throw error;
  }

  const params = new URLSearchParams({
    query: normalizedQuery,
    max_results: String(Math.max(10, normalizedLimit)),
    "tweet.fields": "created_at,author_id,conversation_id,in_reply_to_user_id,public_metrics",
    "user.fields": "username,name",
    expansions: "author_id",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(X_API_BASE + "/tweets/search/recent?" + params, {
      headers: {
        Authorization: "Bearer " + token,
        "User-Agent": "introducing.life/1.0",
      },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      const error = new Error("X API search timed out after " + timeoutMs + "ms.");
      error.code = "BIRD_TIMEOUT";
      throw error;
    }
    throw err;
  }
  clearTimeout(timer);

  if (response.status === 401) {
    const error = new Error("X API authentication failed. Check your X_BEARER_TOKEN.");
    error.code = "BIRD_AUTH_FAILED";
    throw error;
  }
  if (response.status === 402) {
    const error = new Error("X API search requires a paid plan. Upgrade your X Developer account to Basic or higher at developer.twitter.com.");
    error.code = "BIRD_PAYMENT_REQUIRED";
    throw error;
  }
  if (response.status === 403) {
    const error = new Error("X API access forbidden. Your app may not have search permissions enabled.");
    error.code = "BIRD_FORBIDDEN";
    throw error;
  }
  if (response.status === 429) {
    const error = new Error("X API rate limit exceeded. Try again later.");
    error.code = "BIRD_RATE_LIMITED";
    throw error;
  }
  if (!response.ok) {
    const error = new Error("X API error " + response.status + ".");
    error.code = "BIRD_FAILED";
    throw error;
  }

  const payload = await response.json();
  const rawTweets = Array.isArray(payload?.data) ? payload.data : [];
  const includes = payload?.includes || {};

  const tweets = rawTweets
    .slice(0, normalizedLimit)
    .map((t) => normalizeTweet(t, includes, normalizedQuery));

  return { query: normalizedQuery, count: tweets.length, tweets, raw: payload };
}

export function buildBirdLaunchQueries(term = "introducing") {
  const seed = normalizeQueryValue(term) || "introducing";
  return [
    '"' + seed + '" -is:retweet lang:en',
    '("' + seed + '" OR launch OR launched OR introducing) (agent OR agents OR agentic OR mcp OR ai) -is:retweet lang:en',
    '("' + seed + '" OR launch OR announced OR shipping) (infra OR devtool OR sdk OR "open source" OR model) -is:retweet lang:en',
  ];
}

export function buildBirdThemeQueries(theme, { includeIntroducing = true } = {}) {
  const label = normalizeQueryValue(theme?.label || "");
  const socialQueries = Array.isArray(theme?.socialQueries) ? theme.socialQueries : [];
  const keywords = Array.isArray(theme?.keywords) ? theme.keywords.filter(Boolean) : [];
  const launchTerms = keywords
    .filter((value) => !/\s/.test(value) || value.length <= 18)
    .slice(0, 4);
  const focusedLaunchQuery = launchTerms.length
    ? '("introducing" OR launch OR launched OR announcement OR shipping) (' + launchTerms.join(" OR ") + ') -is:retweet lang:en'
    : "";

  return [
    ...(includeIntroducing && label ? ['"introducing" ' + label + ' -is:retweet lang:en'] : []),
    ...socialQueries.slice(0, 2),
    focusedLaunchQuery,
  ].filter(Boolean);
}
