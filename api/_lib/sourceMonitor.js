const DEFAULT_HEADERS = {
  "User-Agent": "introducing-source-monitor",
  Accept: "application/json",
};

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/(www\.)?/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function truncate(value, maxLength = 240) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function guessCategory(text) {
  const value = String(text || "").toLowerCase();
  if (/(agent|agentic|orchestrator|workflow|automation|assistant)/.test(value)) return "agent";
  if (/(security|audit|auth|vulnerability|pentest|compliance)/.test(value)) return "security";
  if (/(sdk|cli|framework|library|tooling|developer)/.test(value)) return "tool";
  if (/(infra|platform|cloud|deployment|runtime)/.test(value)) return "infra";
  return "other";
}

function noveltyHint(text, signalScore = 0) {
  const value = String(text || "").toLowerCase();
  let score = Math.min(8, Math.max(0, Math.round(signalScore / 10)));
  if (/(agent|agentic|security|launch|automation|ai)/.test(value)) score += 1;
  return Math.min(score, 10);
}

function recencyBoost(dateString) {
  const timestamp = Date.parse(dateString || "");
  if (!Number.isFinite(timestamp)) return 2;
  const ageDays = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
  if (ageDays <= 1) return 12;
  if (ageDays <= 7) return 8;
  if (ageDays <= 30) return 4;
  return 1;
}

function editorialScore(item) {
  const text = `${item.project_name} ${item.summary} ${item.signal_reason}`.toLowerCase();
  let score = Number(item.novelty_hint || 0) * 8;
  if (item.category_hint === "agent") score += 10;
  if (item.category_hint === "security") score += 8;
  if (item.category_hint === "tool") score += 5;
  if (/(launch|agent|security|builder|workflow|repo|tool)/.test(text)) score += 8;
  if (item.source === "GitHub") score += 6;
  if (item.source === "Hacker News") score += 4;
  score += recencyBoost(item.detected_at);
  return score;
}

function dedupeAndRank(items) {
  const deduped = new Map();

  for (const item of items) {
    const key = normalizeKey(item.url || item.project_name);
    const existing = deduped.get(key);
    const candidate = {
      ...item,
      editorial_score: editorialScore(item),
    };

    if (!existing || candidate.editorial_score > existing.editorial_score) {
      deduped.set(key, candidate);
    }
  }

  return [...deduped.values()]
    .sort((a, b) => b.editorial_score - a.editorial_score || b.novelty_hint - a.novelty_hint)
    .slice(0, 12);
}

async function fetchJson(url, headers = DEFAULT_HEADERS) {
  const response = await fetch(url, { headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "Source request failed.");
  }
  return payload;
}

async function collectGithub() {
  const payload = await fetchJson("https://api.github.com/search/repositories?q=agents%20OR%20launch%20OR%20security&sort=updated&order=desc&per_page=6");
  const items = Array.isArray(payload?.items) ? payload.items : [];

  return items.map((item, index) => ({
    id: `github-${item.id || index}`,
    source: "GitHub",
    source_type: "repo",
    author: item.owner?.login || "unknown",
    project_name: item.name || item.full_name || "unknown",
    category_hint: guessCategory(`${item.name} ${item.description}`),
    url: item.html_url || "",
    summary: truncate(item.description || "Recently updated repository."),
    signal_reason: `Updated recently with ${item.stargazers_count || 0} stars and visible public repo activity.`,
    novelty_hint: noveltyHint(`${item.name} ${item.description}`, item.stargazers_count || 0),
    detected_at: new Date().toISOString(),
    queue_status: "new",
    source_mode: "real",
  }));
}

async function collectHackerNews() {
  const payload = await fetchJson("https://hn.algolia.com/api/v1/search_by_date?query=agent%20OR%20launch%20OR%20security&tags=story&hitsPerPage=6");
  const hits = Array.isArray(payload?.hits) ? payload.hits : [];

  return hits.map((item, index) => ({
    id: `hn-${item.objectID || index}`,
    source: "Hacker News",
    source_type: "discussion",
    author: item.author || "hn",
    project_name: truncate(item.title || item.story_title || "HN launch", 80),
    category_hint: guessCategory(`${item.title} ${item.story_text || ""}`),
    url: item.url || item.story_url || "",
    summary: truncate(item.story_text || item.title || "HN discussion item."),
    signal_reason: `Recent HN discussion with ${item.points || 0} points and active launch-adjacent keywords.`,
    novelty_hint: noveltyHint(`${item.title} ${item.story_text || ""}`, item.points || 0),
    detected_at: item.created_at || new Date().toISOString(),
    queue_status: "new",
    source_mode: "real",
  }));
}

async function collectReddit() {
  const payload = await fetchJson("https://www.reddit.com/search.json?q=agent%20launch%20OR%20security%20tool&limit=6&sort=new");
  const children = Array.isArray(payload?.data?.children) ? payload.data.children : [];

  return children.map((child, index) => ({
    id: `reddit-${child?.data?.id || index}`,
    source: "Reddit",
    source_type: "discussion",
    author: child?.data?.subreddit ? `r/${child.data.subreddit}` : "reddit",
    project_name: truncate(child?.data?.title || "Reddit thread", 80),
    category_hint: guessCategory(`${child?.data?.title || ""} ${child?.data?.selftext || ""}`),
    url: child?.data?.permalink ? `https://www.reddit.com${child.data.permalink}` : "",
    summary: truncate(child?.data?.selftext || child?.data?.title || "Reddit item."),
    signal_reason: `Recent Reddit thread with score ${child?.data?.score || 0} in a builder-adjacent community.`,
    novelty_hint: noveltyHint(`${child?.data?.title || ""} ${child?.data?.selftext || ""}`, child?.data?.score || 0),
    detected_at: child?.data?.created_utc ? new Date(child.data.created_utc * 1000).toISOString() : new Date().toISOString(),
    queue_status: "new",
    source_mode: "real",
  }));
}

export async function runSourceMonitorSweep() {
  const settled = await Promise.allSettled([collectGithub(), collectHackerNews(), collectReddit()]);

  const rawItems = settled
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value);
  const items = dedupeAndRank(rawItems);

  const sources = settled.map((result, index) => ({
    source: ["GitHub", "Hacker News", "Reddit"][index],
    ok: result.status === "fulfilled",
    count: result.status === "fulfilled" ? result.value.length : 0,
    error: result.status === "rejected" ? (result.reason?.message || "Source failed.") : "",
  }));

  return {
    items,
    raw_count: rawItems.length,
    deduped_count: items.length,
    sources,
    mode: items.length > 0 ? "real" : "empty",
    scanned_at: new Date().toISOString(),
  };
}
