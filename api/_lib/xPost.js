// X API v2 tweet posting via OAuth 1.0a
// Requires: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
// These are per-account credentials — different from the Bearer token used for search.

import { createHmac } from "node:crypto";

const X_API_BASE = "https://api.twitter.com/2";

function getXPostCredentials() {
  return {
    apiKey: String(process.env.X_API_KEY || "").trim(),
    apiSecret: String(process.env.X_API_SECRET || "").trim(),
    accessToken: String(process.env.X_ACCESS_TOKEN || "").trim(),
    accessSecret: String(process.env.X_ACCESS_SECRET || "").trim(),
  };
}

export function isXPostConfigured() {
  const c = getXPostCredentials();
  return Boolean(c.apiKey && c.apiSecret && c.accessToken && c.accessSecret);
}

function percentEncode(str) {
  return encodeURIComponent(String(str || ""))
    .replace(/!/g, "%21").replace(/'/g, "%27")
    .replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\*/g, "%2A");
}

function buildOAuthHeader(method, url, bodyParams = {}) {
  const { apiKey, apiSecret, accessToken, accessSecret } = getXPostCredentials();
  const nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const timestamp = String(Math.floor(Date.now() / 1000));

  const oauthParams = {
    oauth_consumer_key: apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  // Combine all params for signature base
  const allParams = { ...oauthParams, ...bodyParams };
  const sortedParams = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");

  const signatureBase = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(sortedParams),
  ].join("&");

  const signingKey = `${percentEncode(apiSecret)}&${percentEncode(accessSecret)}`;
  const signature = createHmac("sha1", signingKey)
    .update(signatureBase)
    .digest("base64");

  oauthParams.oauth_signature = signature;

  const headerValue = "OAuth " + Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return headerValue;
}

export async function postTweet(text, options = {}) {
  if (!isXPostConfigured()) {
    const error = new Error("X post credentials not configured. Set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET.");
    error.code = "X_POST_NOT_CONFIGURED";
    throw error;
  }

  const trimmed = String(text || "").trim().slice(0, 280);
  if (!trimmed) throw new Error("Tweet text is required.");

  const url = `${X_API_BASE}/tweets`;
  const body = { text: trimmed };
  if (options.replyToId) body.reply = { in_reply_to_tweet_id: String(options.replyToId) };

  const oauthHeader = buildOAuthHeader("POST", url, {});

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: oauthHeader,
      "Content-Type": "application/json",
      "User-Agent": "introducing.life/1.0",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401) {
    const error = new Error("X API authentication failed. Check X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET.");
    error.code = "X_POST_AUTH_FAILED";
    throw error;
  }
  if (response.status === 429) {
    const error = new Error("X API rate limit exceeded. Try again later.");
    error.code = "X_POST_RATE_LIMITED";
    throw error;
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload?.detail || payload?.title || `X API error ${response.status}.`);
    error.code = "X_POST_FAILED";
    throw error;
  }

  const payload = await response.json();
  return {
    id: payload?.data?.id || "",
    text: payload?.data?.text || trimmed,
    url: payload?.data?.id ? `https://x.com/i/status/${payload.data.id}` : "",
  };
}

export async function postThread(tweets) {
  if (!Array.isArray(tweets) || tweets.length === 0) {
    throw new Error("At least one tweet is required.");
  }

  const results = [];
  let replyToId = null;

  for (const text of tweets) {
    const result = await postTweet(text, replyToId ? { replyToId } : {});
    results.push(result);
    replyToId = result.id;
    // Small delay between thread tweets to avoid rate issues
    if (tweets.indexOf(text) < tweets.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}

// Format an entry into a tweet thread
export function formatEntryAsThread(entry) {
  const name = String(entry?.project_name || "").toUpperCase();
  const verdict = String(entry?.novelty_verdict || "");
  const score = Number(entry?.novelty_score || 0);
  const hook = String(entry?.hook || "").slice(0, 200);
  const editorial = String(entry?.editorial_note || "").slice(0, 220);
  const sourceUrl = String(entry?.source_url || "");

  const verdictEmoji = {
    "Genuinely New": "🔴",
    "Solid Execution": "🔵",
    "Repackaged": "⚪",
    "Vaporware": "⚫",
  }[verdict] || "◾";

  const tweets = [];

  // Tweet 1 — the hook
  const tweet1 = `INTRODUCING ${name}\n\n${verdictEmoji} ${verdict} — ${score}/10\n\n${hook}`;
  tweets.push(tweet1.slice(0, 280));

  // Tweet 2 — editorial take
  if (editorial) {
    const tweet2 = `Editorial: ${editorial}${sourceUrl ? `\n\n→ ${sourceUrl}` : ""}`;
    tweets.push(tweet2.slice(0, 280));
  }

  // Tweet 3 — archive link
  tweets.push(`Full profile + novelty breakdown → introducing.life`);

  return tweets;
}

// Format a standalone opinion tweet
export function formatOpinionTweet(entry) {
  const name = String(entry?.project_name || "");
  const editorial = String(entry?.editorial_note || "").slice(0, 200);
  const score = Number(entry?.novelty_score || 0);
  const verdict = String(entry?.novelty_verdict || "");

  return `${name}: ${editorial}\n\n${score}/10 — ${verdict}\n\nintroducing.life`.slice(0, 280);
}
