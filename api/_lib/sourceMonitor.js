const DEFAULT_HEADERS = {
  "User-Agent": "introducing-source-monitor",
  Accept: "application/json",
};

const SOURCE_NAMES = ["GitHub", "Hacker News", "Reddit", "Bluesky", "Mastodon", "DEV", "npm", "Hugging Face", "arXiv", "CoinGecko"];
const DEFAULT_MONITOR_PROFILE = "balanced";

const MONITOR_THEMES = [
  {
    id: "agents",
    label: "agents",
    category: "agent",
    weight: 7,
    keywords: ["agent", "agents", "agentic", "multi-agent", "orchestrator", "workflow", "mcp", "rag", "memory", "tool use"],
    socialQueries: ["ai agent launch", "agentic workflow", "multi-agent", "mcp"],
    mastodonTags: ["aiagents", "agentic", "mcp"],
    searchTerms: ['"ai agent"', "agentic", "mcp", "orchestrator"],
    researchTerms: ["all:agent", "all:automation"],
  },
  {
    id: "llms",
    label: "llms",
    category: "tool",
    weight: 6,
    keywords: ["llm", "llms", "language model", "inference", "fine-tuning", "openclaw", "ollama", "embedding", "context window", "local model"],
    socialQueries: ["llm tooling", "openclaw", "local llm", "ollama"],
    mastodonTags: ["llm", "opensourceai", "ollama"],
    searchTerms: ["llm", '"language model"', "ollama", "openclaw"],
    researchTerms: ['all:llm', 'all:"large language model"', "all:inference"],
  },
  {
    id: "security",
    label: "security",
    category: "security",
    weight: 7,
    keywords: ["security", "audit", "pentest", "auth", "authorization", "authentication", "vulnerability", "secrets", "headers", "compliance"],
    socialQueries: ["security tool", "ai security", "pentest agent"],
    mastodonTags: ["security", "cybersecurity", "infosec"],
    searchTerms: ['"security tool"', "pentest", "vulnerability", "auth"],
    researchTerms: ["all:security", "all:vulnerability", "all:authentication"],
  },
  {
    id: "web3",
    label: "web3",
    category: "web3",
    weight: 6,
    keywords: ["web3", "cryptocurrency", "memecoin", "wallet", "onchain", "dex", "defi", "solana", "ethereum", "base chain", "airdrop", "degen", "blockchain"],
    socialQueries: ["memecoin launch", "token launch", "web3 agent", "onchain agent"],
    mastodonTags: ["web3", "crypto", "memecoin"],
    searchTerms: ["web3", "memecoin", "onchain", "solana", "ethereum"],
    researchTerms: ["all:web3", "all:blockchain", "all:onchain"],
  },
];

const THEME_BY_ID = Object.fromEntries(MONITOR_THEMES.map((theme) => [theme.id, theme]));
const MONITOR_PROFILES = {
  balanced: {
    id: "balanced",
    label: "Balanced",
    themeIds: ["agents", "llms", "security", "web3"],
    requiredThemes: [],
    boosts: { agents: 8, llms: 6, security: 6, web3: 6 },
    description: "Covers the full thesis across agents, llms, security, and web3.",
  },
  "agent-first": {
    id: "agent-first",
    label: "Agent-first",
    themeIds: ["agents", "llms"],
    requiredThemes: ["agents", "llms"],
    boosts: { agents: 18, llms: 10, security: 2, web3: -4 },
    description: "Prioritizes agent launches, orchestration layers, MCP, and adjacent LLM tooling.",
  },
  "security-first": {
    id: "security-first",
    label: "Security-first",
    themeIds: ["security", "agents", "llms"],
    requiredThemes: ["security"],
    boosts: { security: 18, agents: 6, llms: 4, web3: -6 },
    description: "Prioritizes pentest, auth, vulnerability, and AI security tooling.",
  },
  "web3-first": {
    id: "web3-first",
    label: "Web3-first",
    themeIds: ["web3", "agents"],
    requiredThemes: ["web3"],
    boosts: { web3: 18, agents: 4, llms: -4, security: -4 },
    description: "Prioritizes memecoin, token, wallet, onchain, and crypto-native launches.",
  },
  "llm-infra": {
    id: "llm-infra",
    label: "LLM infra",
    themeIds: ["llms", "agents"],
    requiredThemes: ["llms"],
    boosts: { llms: 18, agents: 8, security: 2, web3: -6 },
    description: "Prioritizes local models, inference layers, OpenClaw, Ollama, and model infrastructure.",
  },
};
const DEV_TAGS = [
  { tag: "ai", themeIds: ["agents", "llms"] },
  { tag: "security", themeIds: ["security"] },
  { tag: "web3", themeIds: ["web3"] },
];
const NPM_QUERIES = [
  { query: "agent llm mcp", themeIds: ["agents", "llms"] },
  { query: "security tool pentest", themeIds: ["security"] },
  { query: "web3 wallet onchain", themeIds: ["web3"] },
  { query: "solana ethereum wallet", themeIds: ["web3"] },
  { query: "dex defi blockchain", themeIds: ["web3"] },
  { query: "openclaw", themeIds: ["llms"] },
];
const HUGGING_FACE_QUERIES = [
  { query: "agent", themeIds: ["agents"] },
  { query: "llm", themeIds: ["llms"] },
  { query: "openclaw", themeIds: ["llms"] },
];
const REDDIT_COMMUNITIES = [
  { subreddit: "LocalLLaMA", themeIds: ["llms", "agents"] },
  { subreddit: "LangChain", themeIds: ["agents", "llms"] },
  { subreddit: "singularity", themeIds: ["agents", "llms"] },
  { subreddit: "netsec", themeIds: ["security"] },
  { subreddit: "cybersecurity", themeIds: ["security"] },
  { subreddit: "ethdev", themeIds: ["web3"] },
  { subreddit: "solana", themeIds: ["web3"] },
  { subreddit: "CryptoCurrency", themeIds: ["web3"] },
];

function getMonitorProfile(profileKey = DEFAULT_MONITOR_PROFILE) {
  return MONITOR_PROFILES[profileKey] || MONITOR_PROFILES[DEFAULT_MONITOR_PROFILE];
}

function getThemesForProfile(profileKey = DEFAULT_MONITOR_PROFILE) {
  const profile = getMonitorProfile(profileKey);
  return profile.themeIds
    .map((themeId) => THEME_BY_ID[themeId])
    .filter(Boolean);
}

function intersectsThemeIds(left = [], right = []) {
  return left.some((value) => right.includes(value));
}

function filterByProfile(list, profileKey = DEFAULT_MONITOR_PROFILE) {
  const profile = getMonitorProfile(profileKey);
  if (profile.id === DEFAULT_MONITOR_PROFILE) return list;
  return list.filter((item) => !Array.isArray(item.themeIds) || intersectsThemeIds(item.themeIds, profile.themeIds));
}

function buildProfileSearches(profileKey = DEFAULT_MONITOR_PROFILE) {
  const themes = getThemesForProfile(profileKey);
  return {
    bluesky: themes.flatMap((theme) => theme.socialQueries.map((query) => ({ query, themeIds: [theme.id] }))),
    mastodon: themes.flatMap((theme) => theme.mastodonTags.map((tag) => ({ tag, themeIds: [theme.id] }))),
    github: [...new Set(themes.flatMap((theme) => theme.searchTerms))].slice(0, 8).join(" OR "),
    hn: [...new Set(themes.flatMap((theme) => theme.searchTerms.map((term) => term.replace(/"/g, ""))))].slice(0, 8).join(" "),
    reddit: [...new Set(themes.flatMap((theme) => theme.searchTerms))].slice(0, 8).join(" OR "),
    arxiv: [...new Set(themes.flatMap((theme) => theme.researchTerms))].slice(0, 8).join(" OR "),
    redditCommunities: filterByProfile(REDDIT_COMMUNITIES, profileKey),
    devTags: filterByProfile(DEV_TAGS, profileKey),
    npmQueries: filterByProfile(NPM_QUERIES, profileKey),
    huggingFaceQueries: filterByProfile(HUGGING_FACE_QUERIES, profileKey),
  };
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/(www\.)?/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.-]+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasKeywordMatch(text, keyword) {
  const normalizedText = normalizeText(text);
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedText || !normalizedKeyword) return false;
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(normalizedKeyword)}(?=\\s|$)`, "i");
  return pattern.test(normalizedText);
}

function truncate(value, maxLength = 240) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value) {
  return decodeXml(String(value || "").replace(/<[^>]+>/g, " "));
}

function extractThemeSignals(text) {
  const groups = [];
  const keywords = [];
  let score = 0;

  for (const theme of MONITOR_THEMES) {
    const matched = theme.keywords.filter((keyword) => hasKeywordMatch(text, keyword));
    if (matched.length > 0) {
      groups.push(theme.label);
      keywords.push(...matched.slice(0, 3));
      score += theme.weight + matched.length * 2;
    }
  }

  return {
    groups: [...new Set(groups)],
    keywords: [...new Set(keywords)].slice(0, 8),
    score,
  };
}

function themeSignalsFromIds(ids = []) {
  const groups = [];
  const keywords = [];
  let score = 0;

  for (const id of ids) {
    const theme = THEME_BY_ID[id];
    if (!theme) continue;
    groups.push(theme.label);
    keywords.push(theme.label);
    score += theme.weight;
  }

  return {
    groups: [...new Set(groups)],
    keywords: [...new Set(keywords)],
    score,
  };
}

function mergeThemeSignals(baseSignals, hintSignals) {
  return {
    groups: [...new Set([...(baseSignals.groups || []), ...(hintSignals.groups || [])])],
    keywords: [...new Set([...(baseSignals.keywords || []), ...(hintSignals.keywords || [])])].slice(0, 8),
    score: Number(baseSignals.score || 0) + Number(hintSignals.score || 0),
  };
}

function guessCategory(text) {
  const signals = extractThemeSignals(text);
  if (signals.groups.includes("security")) return "security";
  if (signals.groups.includes("agents")) return "agent";
  if (signals.groups.includes("web3")) return "web3";
  if (signals.groups.includes("llms")) return "tool";

  const value = normalizeText(text);
  if (/(sdk|cli|framework|library|tooling|developer|devtool)/.test(value)) return "tool";
  if (/(infra|platform|cloud|deployment|runtime|observability)/.test(value)) return "infra";
  return "other";
}

function noveltyHint(text, signalScore = 0) {
  const thematic = extractThemeSignals(text);
  let score = Math.min(8, Math.max(0, Math.round(signalScore / 10)));
  score += Math.min(2, Math.floor(thematic.score / 10));
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

function sourceBoost(source) {
  const boosts = {
    GitHub: 6,
    "Hacker News": 4,
    Reddit: 3,
    Bluesky: 4,
    Mastodon: 3,
    DEV: 3,
    npm: 5,
    "Hugging Face": 5,
    arXiv: 4,
    CoinGecko: 3,
  };
  return boosts[source] || 0;
}

function annotateItem(item) {
  const text = item.content_text || `${item.project_name || ""}`;
  const thematic = mergeThemeSignals(extractThemeSignals(text), themeSignalsFromIds(item.theme_hint));
  const category = item.category_hint && item.category_hint !== "other" ? item.category_hint : guessCategory(text);

  return {
    ...item,
    category_hint: category,
    theme_groups: thematic.groups,
    theme_matches: thematic.keywords,
    monitor_relevance: thematic.score,
  };
}

function profileBoost(item, profileKey = DEFAULT_MONITOR_PROFILE) {
  const profile = getMonitorProfile(profileKey);
  return (item.theme_groups || []).reduce((sum, group) => sum + Number(profile.boosts?.[group] || 0), 0);
}

function editorialScore(item, profileKey = DEFAULT_MONITOR_PROFILE) {
  const text = `${item.project_name} ${item.summary} ${item.signal_reason}`.toLowerCase();
  let score = Number(item.novelty_hint || 0) * 8;
  score += Number(item.monitor_relevance || 0);
  if (item.category_hint === "agent") score += 10;
  if (item.category_hint === "security") score += 8;
  if (item.category_hint === "tool") score += 6;
  if (item.category_hint === "web3") score += 5;
  if (/(launch|agent|llm|security|builder|workflow|repo|tool|token|memecoin|model|openclaw|crypto|web3)/.test(text)) score += 10;
  score += sourceBoost(item.source);
  score += recencyBoost(item.detected_at);
  score += profileBoost(item, profileKey);
  return score;
}

function isPertinent(item, profileKey = DEFAULT_MONITOR_PROFILE) {
  const profile = getMonitorProfile(profileKey);
  if (profile.id !== DEFAULT_MONITOR_PROFILE && !intersectsThemeIds(item.theme_groups || [], profile.themeIds)) {
    return false;
  }
  if (Array.isArray(profile.requiredThemes) && profile.requiredThemes.length > 0 && !intersectsThemeIds(item.theme_groups || [], profile.requiredThemes)) {
    return false;
  }
  if (item.source === "CoinGecko") return true;
  if (item.source === "Hugging Face" && item.monitor_relevance >= 6) return true;
  if (item.source === "npm" && item.monitor_relevance >= 6) return true;
  if (item.source === "GitHub" && item.monitor_relevance >= 6) return true;
  return item.monitor_relevance >= 8;
}

function dedupeAndRank(items, profileKey = DEFAULT_MONITOR_PROFILE) {
  const deduped = new Map();

  for (const rawItem of items) {
    const annotated = annotateItem(rawItem);
    if (!isPertinent(annotated, profileKey)) {
      continue;
    }

    const candidate = {
      ...annotated,
      editorial_score: editorialScore(annotated, profileKey),
    };
    const key = normalizeKey(candidate.url || candidate.project_name);
    const existing = deduped.get(key);

    if (!existing || candidate.editorial_score > existing.editorial_score) {
      deduped.set(key, candidate);
    }
  }

  return [...deduped.values()]
    .sort((a, b) => b.editorial_score - a.editorial_score || b.novelty_hint - a.novelty_hint)
    .slice(0, 18);
}

function featuredSourceTrustBoost(source) {
  const boosts = {
    GitHub: 14,
    npm: 13,
    "Hugging Face": 13,
    arXiv: 10,
    "Hacker News": 8,
    DEV: 7,
    Reddit: 6,
    Bluesky: 5,
    Mastodon: 5,
    CoinGecko: 8,
  };
  return boosts[source] || 0;
}

function featuredTypeBoost(sourceType) {
  const boosts = {
    repo: 10,
    package: 9,
    model: 10,
    launch: 9,
    research: 8,
    article: 5,
    community: 4,
    discussion: 3,
    social: 2,
    token: 7,
  };
  return boosts[sourceType] || 0;
}

function featuredRecencyBoost(item) {
  return recencyBoost(item.detected_at);
}

function featuredNoveltyBoost(item) {
  const novelty = Number(item.novelty_hint || 0);
  if (novelty >= 8) return 14;
  if (novelty >= 6) return 10;
  if (novelty >= 4) return 6;
  return 2;
}

function featuredThemeAlignmentBoost(item, profileKey = DEFAULT_MONITOR_PROFILE) {
  const profile = getMonitorProfile(profileKey);
  const groups = item.theme_groups || [];
  let score = 0;

  if (intersectsThemeIds(groups, profile.themeIds)) {
    score += 10;
  }

  if (Array.isArray(profile.requiredThemes) && profile.requiredThemes.length > 0 && intersectsThemeIds(groups, profile.requiredThemes)) {
    score += 14;
  }

  score += Math.min(8, groups.length * 3);
  return score;
}

function buildFeaturedRationale(item, profileKey = DEFAULT_MONITOR_PROFILE) {
  const profile = getMonitorProfile(profileKey);
  const reasons = [];

  if (Array.isArray(profile.requiredThemes) && profile.requiredThemes.length > 0 && intersectsThemeIds(item.theme_groups || [], profile.requiredThemes)) {
    reasons.push(`hits the primary ${profile.label.toLowerCase()} thesis`);
  } else if (intersectsThemeIds(item.theme_groups || [], profile.themeIds)) {
    reasons.push(`fits the ${profile.label.toLowerCase()} profile`);
  }

  if (Number(item.novelty_hint || 0) >= 7) {
    reasons.push("shows a stronger novelty signal than the rest of the sweep");
  } else if (Number(item.novelty_hint || 0) >= 5) {
    reasons.push("has enough novelty to justify editorial attention");
  }

  if (["GitHub", "npm", "Hugging Face", "arXiv"].includes(item.source)) {
    reasons.push("comes from a source with stronger build or research signal");
  } else if (["Reddit", "Bluesky", "Mastodon"].includes(item.source)) {
    reasons.push("has active social/community evidence in the target niche");
  }

  if (featuredRecencyBoost(item) >= 8) {
    reasons.push("is recent enough to matter in the current cycle");
  }

  return reasons.slice(0, 3);
}

function featuredCandidateScore(item, profileKey = DEFAULT_MONITOR_PROFILE) {
  let score = Number(item.editorial_score || 0);
  score += featuredSourceTrustBoost(item.source);
  score += featuredTypeBoost(item.source_type);
  score += featuredRecencyBoost(item);
  score += featuredNoveltyBoost(item);
  score += featuredThemeAlignmentBoost(item, profileKey);
  return score;
}

function buildFeaturedCandidateEngine(items, profileKey = DEFAULT_MONITOR_PROFILE) {
  const ranked = items
    .map((item) => {
      const score = featuredCandidateScore(item, profileKey);
      const rationale = buildFeaturedRationale(item, profileKey);
      return {
        ...item,
        featured_candidate_score: score,
        featured_rationale: rationale,
      };
    })
    .sort((a, b) => b.featured_candidate_score - a.featured_candidate_score || b.editorial_score - a.editorial_score);

  const shortlist = ranked.slice(0, 5).map((item, index) => ({
    ...item,
    featured_rank: index + 1,
    featured_status: index === 0 ? "best-pick" : "shortlist",
  }));

  const shortlistMap = new Map(shortlist.map((item) => [item.id, item]));
  const enrichedItems = ranked.map((item) => shortlistMap.get(item.id) || item);

  return {
    items: enrichedItems,
    shortlist,
    best_pick: shortlist[0] || null,
  };
}

async function fetchJson(url, headers = DEFAULT_HEADERS) {
  const response = await fetch(url, { headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "Source request failed.");
  }
  return payload;
}

async function fetchText(url, headers = {
  "User-Agent": "introducing-source-monitor",
  Accept: "application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
}) {
  const response = await fetch(url, { headers });
  const payload = await response.text();
  if (!response.ok) {
    throw new Error("Source request failed.");
  }
  return payload;
}

async function collectGithub(profileKey = DEFAULT_MONITOR_PROFILE) {
  const { github } = buildProfileSearches(profileKey);
  const payload = await fetchJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(github)}&sort=updated&order=desc&per_page=8`);
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
    signal_reason: `Updated recently with ${item.stargazers_count || 0} stars and matched the focused monitor thesis for agents, llms, security, or web3 tooling.`,
    novelty_hint: noveltyHint(`${item.name} ${item.description}`, item.stargazers_count || 0),
    content_text: `${item.name || ""} ${item.description || ""}`,
    detected_at: new Date().toISOString(),
    queue_status: "new",
    source_mode: "real",
    query: github,
  }));
}

async function collectHackerNews(profileKey = DEFAULT_MONITOR_PROFILE) {
  const { hn } = buildProfileSearches(profileKey);
  const payload = await fetchJson(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(hn)}&tags=story&hitsPerPage=8`);
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
    signal_reason: `Recent HN discussion matched the focused monitor thesis around agents, llms, security, web3, or openclaw.`,
    novelty_hint: noveltyHint(`${item.title} ${item.story_text || ""}`, item.points || 0),
    content_text: `${item.title || ""} ${item.story_text || ""}`,
    detected_at: item.created_at || new Date().toISOString(),
    queue_status: "new",
    source_mode: "real",
    query: hn,
  }));
}

async function collectReddit(profileKey = DEFAULT_MONITOR_PROFILE) {
  const { reddit, redditCommunities } = buildProfileSearches(profileKey);
  const searches = [
    { kind: "search", label: reddit, url: `https://www.reddit.com/search.json?q=${encodeURIComponent(reddit)}&limit=8&sort=new`, themeIds: getMonitorProfile(profileKey).themeIds },
    ...redditCommunities.map((community) => ({
      kind: "subreddit",
      label: `r/${community.subreddit}`,
      url: `https://www.reddit.com/r/${encodeURIComponent(community.subreddit)}/new.json?limit=3`,
      themeIds: community.themeIds,
    })),
  ];

  const settled = await Promise.allSettled(searches.map((item) => fetchJson(item.url)));

  return settled.flatMap((result, index) => {
    if (result.status !== "fulfilled") {
      return [];
    }
    const search = searches[index];
    const children = Array.isArray(result.value?.data?.children) ? result.value.data.children : [];

    return children.map((child, itemIndex) => ({
      id: `reddit-${search.kind}-${search.label.replace(/[^a-z0-9]+/gi, "-")}-${child?.data?.id || itemIndex}`,
      source: "Reddit",
      source_type: search.kind === "subreddit" ? "community" : "discussion",
      author: child?.data?.subreddit ? `r/${child.data.subreddit}` : "reddit",
      category_hint: guessCategory(`${child?.data?.title || ""} ${child?.data?.selftext || ""}`),
      project_name: truncate(child?.data?.title || "Reddit thread", 80),
      url: child?.data?.permalink ? `https://www.reddit.com${child.data.permalink}` : "",
      summary: truncate(child?.data?.selftext || child?.data?.title || "Reddit item."),
      signal_reason: search.kind === "subreddit"
        ? `Fresh post from focused community ${search.label}, which is tracked because it consistently surfaces relevant ${search.themeIds.join("/")} discussion.`
        : "Recent Reddit thread matched the monitor thesis for agent, llm, security, crypto, or web3 launches.",
      novelty_hint: noveltyHint(`${child?.data?.title || ""} ${child?.data?.selftext || ""}`, child?.data?.score || 0),
      content_text: `${child?.data?.title || ""} ${child?.data?.selftext || ""}`,
      detected_at: child?.data?.created_utc ? new Date(child.data.created_utc * 1000).toISOString() : new Date().toISOString(),
      queue_status: "new",
      source_mode: "real",
      query: search.label,
      theme_hint: search.kind === "subreddit" ? search.themeIds : [],
    }));
  });
}

async function collectBluesky(profileKey = DEFAULT_MONITOR_PROFILE) {
  const { bluesky } = buildProfileSearches(profileKey);
  const settled = await Promise.allSettled(
    bluesky.map((item) => fetchJson(`https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(item.query)}&limit=2`)),
  );

  return settled
    .flatMap((result, index) => {
      if (result.status !== "fulfilled") {
        return [];
      }
      const search = bluesky[index];
      const posts = Array.isArray(result.value?.posts) ? result.value.posts : [];

      return posts.map((item, itemIndex) => {
        const text = item?.record?.text || item?.embed?.external?.title || "Bluesky post";
        const description = item?.embed?.external?.description || "";
        const handle = item?.author?.handle || "bsky";
        const rkey = String(item?.uri || "").split("/").pop();
        return {
          id: `bsky-${search.query.replace(/\s+/g, "-")}-${item?.cid || itemIndex}`,
          source: "Bluesky",
          source_type: "social",
          author: handle,
          project_name: truncate(item?.embed?.external?.title || text, 80),
          category_hint: guessCategory(`${text} ${description}`),
          url: handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : "",
          summary: truncate(description || text || "Bluesky post discussing a relevant launch or tool."),
          signal_reason: `Bluesky post matched focused query "${search.query}" with ${item?.likeCount || 0} likes and ${item?.repostCount || 0} reposts.`,
          novelty_hint: noveltyHint(`${text} ${description}`, (item?.likeCount || 0) + (item?.repostCount || 0)),
          content_text: `${text} ${description}`,
          detected_at: item?.record?.createdAt || item?.indexedAt || new Date().toISOString(),
          queue_status: "new",
          source_mode: "real",
          query: search.query,
          theme_hint: search.themeIds,
        };
      });
    });
}

async function collectMastodon(profileKey = DEFAULT_MONITOR_PROFILE) {
  const { mastodon } = buildProfileSearches(profileKey);
  const settled = await Promise.allSettled(
    mastodon.map((item) => fetchJson(`https://mastodon.social/api/v1/timelines/tag/${encodeURIComponent(item.tag)}?limit=2`)),
  );

  return settled
    .flatMap((result, index) => {
      if (result.status !== "fulfilled") {
        return [];
      }
      const search = mastodon[index];
      const posts = Array.isArray(result.value) ? result.value : [];

      return posts.map((item, itemIndex) => {
        const text = stripHtml(item?.content || "");
        const cardTitle = item?.card?.title || "";
        const cardDescription = item?.card?.description || "";
        return {
          id: `mastodon-${search.tag}-${item?.id || itemIndex}`,
          source: "Mastodon",
          source_type: "social",
          author: item?.account?.acct ? `@${item.account.acct}` : item?.account?.username || "mastodon",
          project_name: truncate(cardTitle || text || `Mastodon #${search.tag}`, 80),
          category_hint: guessCategory(`${text} ${cardTitle} ${cardDescription}`),
          url: item?.url || item?.uri || "",
          summary: truncate(cardDescription || text || `Public Mastodon status for #${search.tag}.`),
          signal_reason: `Mastodon post matched focused hashtag #${search.tag} with ${item?.favourites_count || 0} favorites and ${item?.reblogs_count || 0} boosts.`,
          novelty_hint: noveltyHint(`${text} ${cardTitle} ${cardDescription}`, (item?.favourites_count || 0) + (item?.reblogs_count || 0)),
          content_text: `${text} ${cardTitle} ${cardDescription}`,
          detected_at: item?.created_at || new Date().toISOString(),
          queue_status: "new",
          source_mode: "real",
          query: `#${search.tag}`,
          theme_hint: search.themeIds,
        };
      });
    });
}

async function collectDevTo(profileKey = DEFAULT_MONITOR_PROFILE) {
  const { devTags } = buildProfileSearches(profileKey);
  const settled = await Promise.allSettled(
    devTags.map((item) => fetchJson(`https://dev.to/api/articles?per_page=2&tag=${encodeURIComponent(item.tag)}`)),
  );

  return settled
    .flatMap((result, index) => {
      if (result.status !== "fulfilled") {
        return [];
      }
      const search = devTags[index];
      const items = Array.isArray(result.value) ? result.value : [];

      return items.map((item, itemIndex) => ({
        id: `dev-${search.tag}-${item.id || itemIndex}`,
        source: "DEV",
        source_type: "article",
        author: item.user?.name || item.user?.username || "dev",
        project_name: truncate(item.title || "DEV article", 80),
        category_hint: guessCategory(`${item.title} ${(item.tag_list || []).join(" ")} ${item.description || ""}`),
        url: item.url || "",
        summary: truncate(item.description || item.title || "DEV article discussing relevant builder or AI topics."),
        signal_reason: `DEV article pulled from focused tag "${search.tag}" with ${item.public_reactions_count || 0} reactions.`,
        novelty_hint: noveltyHint(`${item.title} ${item.description || ""}`, item.public_reactions_count || 0),
        content_text: `${item.title || ""} ${(item.tag_list || []).join(" ")} ${item.description || ""}`,
        detected_at: item.published_at || new Date().toISOString(),
        queue_status: "new",
        source_mode: "real",
        query: search.tag,
        theme_hint: search.themeIds,
      }));
    });
}

async function collectNpm(profileKey = DEFAULT_MONITOR_PROFILE) {
  const { npmQueries } = buildProfileSearches(profileKey);
  const settled = await Promise.allSettled(
    npmQueries.map((item) => fetchJson(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(item.query)}&size=2`)),
  );

  return settled
    .flatMap((result, index) => {
      if (result.status !== "fulfilled") {
        return [];
      }
      const search = npmQueries[index];
      const objects = Array.isArray(result.value?.objects) ? result.value.objects : [];

      return objects.map((item, itemIndex) => ({
        id: `npm-${search.query.replace(/\s+/g, "-")}-${item.package?.name || itemIndex}`,
        source: "npm",
        source_type: "package",
        author: item.package?.publisher?.username || item.package?.maintainers?.[0]?.username || "npm",
        project_name: truncate(item.package?.name || "npm package", 80),
        category_hint: guessCategory(`${item.package?.name || ""} ${item.package?.description || ""}`),
        url: item.package?.links?.npm || item.package?.links?.homepage || "",
        summary: truncate(item.package?.description || "npm package matched a focused monitor search."),
        signal_reason: `npm package matched focused query "${search.query}" with score ${Math.round((item.score?.final || 0) * 100)}.`,
        novelty_hint: noveltyHint(`${item.package?.name || ""} ${item.package?.description || ""}`, Math.round((item.score?.final || 0) * 100)),
        content_text: `${item.package?.name || ""} ${item.package?.description || ""}`,
        detected_at: item.package?.date || new Date().toISOString(),
        queue_status: "new",
        source_mode: "real",
        query: search.query,
        theme_hint: search.themeIds,
      }));
    });
}

async function collectHuggingFace(profileKey = DEFAULT_MONITOR_PROFILE) {
  const { huggingFaceQueries } = buildProfileSearches(profileKey);
  const settled = await Promise.allSettled(
    huggingFaceQueries.map((item) => fetchJson(`https://huggingface.co/api/models?search=${encodeURIComponent(item.query)}&limit=2&sort=downloads&direction=-1`)),
  );

  return settled
    .flatMap((result, index) => {
      if (result.status !== "fulfilled") {
        return [];
      }
      const search = huggingFaceQueries[index];
      const items = Array.isArray(result.value) ? result.value : [];

      return items.map((item, itemIndex) => ({
        id: `hf-${search.query.replace(/\s+/g, "-")}-${item.id || itemIndex}`,
        source: "Hugging Face",
        source_type: "model",
        author: item.author || item.id?.split("/")[0] || "hf",
        project_name: truncate(item.id || "HF model", 80),
        category_hint: guessCategory(`${item.id || ""} ${(item.tags || []).join(" ")}`),
        url: item.id ? `https://huggingface.co/${item.id}` : "",
        summary: truncate(`Model or repository matched focused query "${search.query}" and is tagged ${(item.tags || []).slice(0, 4).join(", ") || "ai"}.`),
        signal_reason: `Hugging Face asset matched focused query "${search.query}" with ${item.downloads || 0} downloads.`,
        novelty_hint: noveltyHint(`${item.id || ""} ${(item.tags || []).join(" ")}`, item.downloads || 0),
        content_text: `${item.id || ""} ${(item.tags || []).join(" ")}`,
        detected_at: item.lastModified || new Date().toISOString(),
        queue_status: "new",
        source_mode: "real",
        query: search.query,
        theme_hint: search.themeIds,
      }));
    });
}

async function collectArxiv(profileKey = DEFAULT_MONITOR_PROFILE) {
  const { arxiv } = buildProfileSearches(profileKey);
  const xml = await fetchText(`https://export.arxiv.org/api/query?search_query=${encodeURIComponent(arxiv)}&start=0&max_results=8&sortBy=submittedDate&sortOrder=descending`);
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => match[1]);

  return entries.map((entry, index) => {
    const title = decodeXml(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "arXiv paper");
    const summary = decodeXml(entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || "");
    const id = decodeXml(entry.match(/<id>([\s\S]*?)<\/id>/)?.[1] || `arxiv-${index}`);
    const published = decodeXml(entry.match(/<published>([\s\S]*?)<\/published>/)?.[1] || new Date().toISOString());
    const author = decodeXml(entry.match(/<name>([\s\S]*?)<\/name>/)?.[1] || "arXiv");

    return {
      id: `arxiv-${index}-${normalizeKey(id).replace(/\s+/g, "-")}`,
      source: "arXiv",
      source_type: "research",
      author,
      project_name: truncate(title, 80),
      category_hint: guessCategory(`${title} ${summary}`),
      url: id,
      summary: truncate(summary || title),
      signal_reason: "Recent research signal matched the monitor thesis for agents, llms, automation, or security.",
      novelty_hint: noveltyHint(`${title} ${summary}`, 40),
      content_text: `${title} ${summary}`,
      detected_at: published,
      queue_status: "new",
      source_mode: "real",
      query: arxiv,
    };
  });
}

async function collectCoinGecko() {
  const payload = await fetchJson("https://api.coingecko.com/api/v3/search/trending");
  const items = Array.isArray(payload?.coins) ? payload.coins : [];

  return items.slice(0, 6).map((item, index) => ({
    id: `coingecko-${item.item?.coin_id || index}`,
    source: "CoinGecko",
    source_type: "token",
    author: item.item?.symbol || "token",
    project_name: truncate(item.item?.name || "Trending token", 80),
    category_hint: "web3",
    url: item.item?.id ? `https://www.coingecko.com/en/coins/${item.item.id}` : "",
    summary: truncate(item.item?.name ? `${item.item.name} is trending in a crypto-native discovery feed relevant to web3 and memecoin monitoring.` : "Trending token discovery item."),
    signal_reason: `Trending token signal with market cap rank ${item.item?.market_cap_rank || "n/a"} from a web3-native source.`,
    novelty_hint: noveltyHint(`${item.item?.name || ""} ${item.item?.symbol || ""} token memecoin crypto web3`, 35),
    content_text: `${item.item?.name || ""} ${item.item?.symbol || ""} token memecoin crypto web3`,
    detected_at: new Date().toISOString(),
    queue_status: "new",
    source_mode: "real",
    query: "coingecko trending web3",
    theme_hint: ["web3"],
  }));
}

export async function runSourceMonitorSweep(profileKey = DEFAULT_MONITOR_PROFILE) {
  const profile = getMonitorProfile(profileKey);
  const collectors = [
    collectGithub,
    collectHackerNews,
    collectReddit,
    collectBluesky,
    collectMastodon,
    collectDevTo,
    collectNpm,
    collectHuggingFace,
    collectArxiv,
    collectCoinGecko,
  ];

  const settled = await Promise.allSettled(collectors.map((collector) => collector(profile.id)));

  const rawItems = settled
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value);
  const rankedItems = dedupeAndRank(rawItems, profile.id);
  const featuredEngine = buildFeaturedCandidateEngine(rankedItems, profile.id);

  const sources = settled.map((result, index) => ({
    source: SOURCE_NAMES[index],
    ok: result.status === "fulfilled",
    count: result.status === "fulfilled" ? result.value.length : 0,
    error: result.status === "rejected" ? (result.reason?.message || "Source failed.") : "",
  }));

  return {
    items: featuredEngine.items,
    shortlist: featuredEngine.shortlist,
    best_pick: featuredEngine.best_pick,
    raw_count: rawItems.length,
    deduped_count: featuredEngine.items.length,
    profile: profile.id,
    profile_label: profile.label,
    focus_themes: profile.themeIds,
    sources,
    mode: featuredEngine.items.length > 0 ? "real" : "empty",
    scanned_at: new Date().toISOString(),
  };
}
