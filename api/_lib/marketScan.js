const DEFAULT_HEADERS = {
  "User-Agent": "introducing-market-scan",
  Accept: "application/json",
};

const SOURCE_LABELS = {
  github: "GitHub",
  hn: "Hacker News",
  reddit: "Reddit",
  npm: "npm",
  coingecko: "CoinGecko",
  dexscreener: "DexScreener",
  arxiv: "arXiv",
  huggingface: "Hugging Face",
};

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value) {
  return normalizeText(value).toLowerCase();
}

function truncate(value, maxLength = 220) {
  return normalizeText(value).slice(0, maxLength);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function titleCase(value) {
  return normalizeText(value)
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function scoreRecency(dayCount) {
  if (dayCount <= 7) return 1;
  if (dayCount <= 30) return 0.75;
  if (dayCount <= 90) return 0.45;
  if (dayCount <= 180) return 0.2;
  return 0.05;
}

function daysAgo(dateString) {
  const timestamp = Date.parse(dateString || "");
  if (!Number.isFinite(timestamp)) return 3650;
  return Math.floor((Date.now() - timestamp) / 86400000);
}

function countKeywordHits(text, keywords) {
  const value = lower(text);
  return keywords.reduce((sum, keyword) => sum + (value.includes(keyword) ? 1 : 0), 0);
}

function extractKeywords(input) {
  const blacklist = new Set([
    "about",
    "against",
    "agent",
    "agents",
    "already",
    "and",
    "app",
    "are",
    "before",
    "build",
    "builder",
    "builders",
    "building",
    "can",
    "compare",
    "descreva",
    "describe",
    "does",
    "feito",
    "for",
    "from",
    "have",
    "idea",
    "launch",
    "market",
    "more",
    "para",
    "product",
    "project",
    "que",
    "scan",
    "should",
    "site",
    "sites",
    "startup",
    "than",
    "that",
    "the",
    "their",
    "there",
    "this",
    "tool",
    "tools",
    "trend",
    "versus",
    "with",
  ]);

  const tokens = normalizeText(input)
    .toLowerCase()
    .replace(/[^a-z0-9\s:-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !blacklist.has(token));

  return unique(tokens).slice(0, 10);
}

const CATEGORY_PROFILES = [
  {
    type: "memecoin",
    keywords: ["memecoin", "meme", "token", "solana", "airdrop", "dex", "pump", "degen", "ct", "telegram trading"],
    sources: ["coingecko", "dexscreener", "reddit", "hn", "github"],
    communities: ["CT", "Reddit crypto subs", "CoinGecko", "DexScreener"],
    trendSignals: ["token launches", "watchlists", "pair creation", "crypto discussion spikes"],
  },
  {
    type: "agent",
    keywords: ["agent", "agentic", "workflow", "multi-agent", "autonomous", "tool use", "memory", "rag", "orchestrator"],
    sources: ["github", "huggingface", "hn", "reddit", "npm", "arxiv"],
    communities: ["GitHub builders", "Hugging Face", "HN", "Reddit dev subs", "arXiv"],
    trendSignals: ["repo velocity", "model/tool launches", "new research", "developer discussion"],
  },
  {
    type: "security",
    keywords: ["security", "audit", "pentest", "authorization", "authentication", "vulnerability", "headers", "secrets", "compliance"],
    sources: ["github", "hn", "reddit", "npm", "arxiv"],
    communities: ["GitHub security tools", "Reddit security subs", "HN"],
    trendSignals: ["new tooling repos", "security threads", "research papers"],
  },
  {
    type: "developer-tool",
    keywords: ["sdk", "framework", "cli", "library", "api", "developer", "repo", "package", "typescript", "javascript"],
    sources: ["github", "npm", "hn", "reddit"],
    communities: ["GitHub", "npm", "HN"],
    trendSignals: ["repo stars", "package ecosystem density", "HN launches"],
  },
  {
    type: "research",
    keywords: ["paper", "benchmark", "model", "inference", "eval", "alignment", "reasoning", "transformer"],
    sources: ["arxiv", "huggingface", "github", "hn", "reddit"],
    communities: ["arXiv", "Hugging Face", "GitHub", "HN"],
    trendSignals: ["paper recency", "model releases", "repo follow-ons", "research discussion"],
  },
];

export function classifyIdea(input) {
  const text = lower(input);

  for (const profile of CATEGORY_PROFILES) {
    if (profile.keywords.some((keyword) => text.includes(keyword))) {
      return profile;
    }
  }

  return {
    type: "general",
    keywords: [],
    sources: ["github", "hn", "reddit", "npm"],
    communities: ["GitHub", "HN", "Reddit"],
    trendSignals: ["general developer discussion", "recent public launches"],
  };
}

function buildQueries(input, profile) {
  const cleaned = normalizeText(input).slice(0, 180);
  const keywords = extractKeywords(input);
  const categoryTerms = unique([...profile.keywords.slice(0, 4), ...keywords.slice(0, 4)]);
  const compact = unique([
    cleaned,
    categoryTerms.join(" "),
    `${keywords.slice(0, 3).join(" ")} ${profile.type}`.trim(),
  ]).filter((query) => query.length >= 8);

  return compact.slice(0, 3);
}

function dedupeResults(items) {
  const seen = new Set();
  const results = [];

  for (const item of items) {
    const key = `${item.source}:${item.url || item.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(item);
  }

  return results;
}

async function fetchJson(url, headers = DEFAULT_HEADERS) {
  const response = await fetch(url, { headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || "Source request failed.");
  }
  return payload;
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, { headers });
  const payload = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error("Source request failed.");
  }
  return payload;
}

async function fetchGithub(query) {
  const payload = await fetchJson(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=5`,
  );

  const results = Array.isArray(payload?.items)
    ? payload.items.map((item) => ({
        source: SOURCE_LABELS.github,
        title: item.full_name,
        url: item.html_url,
        snippet: truncate(item.description || ""),
        created_at: item.updated_at,
        score_hint: item.stargazers_count || 0,
      }))
    : [];

  return {
    source: SOURCE_LABELS.github,
    totalCount: payload?.total_count || results.length,
    results,
  };
}

async function fetchHn(query) {
  const payload = await fetchJson(
    `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=5`,
  );

  const results = Array.isArray(payload?.hits)
    ? payload.hits.map((item) => ({
        source: SOURCE_LABELS.hn,
        title: truncate(item.title || item.story_title || "Untitled", 140),
        url: item.url || item.story_url || "",
        snippet: truncate(item._highlightResult?.title?.value || ""),
        created_at: item.created_at,
        score_hint: item.points || 0,
      }))
    : [];

  return {
    source: SOURCE_LABELS.hn,
    totalCount: payload?.nbHits || results.length,
    results,
  };
}

async function fetchReddit(query) {
  const payload = await fetchJson(
    `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=5&sort=new`,
  );

  const children = Array.isArray(payload?.data?.children) ? payload.data.children : [];
  const results = children.map((child) => ({
    source: SOURCE_LABELS.reddit,
    title: truncate(child?.data?.title || "Untitled", 140),
    url: child?.data?.permalink ? `https://www.reddit.com${child.data.permalink}` : "",
    snippet: truncate(child?.data?.selftext || ""),
    created_at: child?.data?.created_utc ? new Date(child.data.created_utc * 1000).toISOString() : "",
    score_hint: child?.data?.score || 0,
  }));

  return {
    source: SOURCE_LABELS.reddit,
    totalCount: payload?.data?.dist || results.length,
    results,
  };
}

async function fetchNpm(query) {
  const payload = await fetchJson(
    `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=5`,
    {},
  );

  const objects = Array.isArray(payload?.objects) ? payload.objects : [];
  const results = objects.map((item) => ({
    source: SOURCE_LABELS.npm,
    title: item?.package?.name || "unknown",
    url: item?.package?.links?.npm || item?.package?.links?.homepage || "",
    snippet: truncate(item?.package?.description || ""),
    created_at: item?.package?.date || "",
    score_hint: Math.round((item?.score?.final || 0) * 100),
  }));

  return {
    source: SOURCE_LABELS.npm,
    totalCount: payload?.total || results.length,
    results,
  };
}

async function fetchCoinGecko(query) {
  const payload = await fetchJson(
    `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`,
  );

  const coins = Array.isArray(payload?.coins) ? payload.coins.slice(0, 5) : [];
  const results = coins.map((coin) => ({
    source: SOURCE_LABELS.coingecko,
    title: `${coin.name} (${coin.symbol?.toUpperCase() || "?"})`,
    url: coin.id ? `https://www.coingecko.com/en/coins/${coin.id}` : "",
    snippet: truncate(`Market cap rank ${coin.market_cap_rank || "unknown"}.`),
    created_at: "",
    score_hint: coin.market_cap_rank ? Math.max(0, 100 - coin.market_cap_rank) : 0,
  }));

  return {
    source: SOURCE_LABELS.coingecko,
    totalCount: coins.length,
    results,
  };
}

async function fetchDexScreener(query) {
  const payload = await fetchJson(
    `https://api.dexscreener.com/latest/dex/search/?q=${encodeURIComponent(query)}`,
  );

  const pairs = Array.isArray(payload?.pairs) ? payload.pairs.slice(0, 5) : [];
  const results = pairs.map((pair) => ({
    source: SOURCE_LABELS.dexscreener,
    title: `${pair?.baseToken?.name || "Unknown"} / ${pair?.quoteToken?.symbol || "?"}`,
    url: pair?.url || "",
    snippet: truncate(`DEX ${pair?.dexId || "unknown"} on ${pair?.chainId || "unknown"} | liquidity ${pair?.liquidity?.usd || 0} USD`),
    created_at: "",
    score_hint: Number(pair?.txns?.h24?.buys || 0) + Number(pair?.txns?.h24?.sells || 0),
  }));

  return {
    source: SOURCE_LABELS.dexscreener,
    totalCount: pairs.length,
    results,
  };
}

async function fetchArxiv(query) {
  const xml = await fetchText(
    `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=5&sortBy=submittedDate&sortOrder=descending`,
  );

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => match[1]);
  const results = entries.map((entry) => {
    const title = (entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "").replace(/\s+/g, " ").trim();
    const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || "").replace(/\s+/g, " ").trim();
    const url = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1] || "";
    const created_at = entry.match(/<published>([\s\S]*?)<\/published>/)?.[1] || "";

    return {
      source: SOURCE_LABELS.arxiv,
      title: truncate(title, 140),
      url,
      snippet: truncate(summary),
      created_at,
      score_hint: 0,
    };
  });

  return {
    source: SOURCE_LABELS.arxiv,
    totalCount: results.length,
    results,
  };
}

async function fetchHuggingFace(query) {
  const payload = await fetchJson(
    `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&limit=5`,
  );

  const models = Array.isArray(payload) ? payload : [];
  const results = models.map((item) => ({
    source: SOURCE_LABELS.huggingface,
    title: item?.id || "unknown",
    url: item?.id ? `https://huggingface.co/${item.id}` : "",
    snippet: truncate(`${item?.pipeline_tag || "model"} | downloads ${item?.downloads || 0} | likes ${item?.likes || 0}`),
    created_at: item?.lastModified || "",
    score_hint: Number(item?.downloads || 0) + (Number(item?.likes || 0) * 10),
  }));

  return {
    source: SOURCE_LABELS.huggingface,
    totalCount: results.length,
    results,
  };
}

const SOURCE_FETCHERS = {
  github: fetchGithub,
  hn: fetchHn,
  reddit: fetchReddit,
  npm: fetchNpm,
  coingecko: fetchCoinGecko,
  dexscreener: fetchDexScreener,
  arxiv: fetchArxiv,
  huggingface: fetchHuggingFace,
};

function evaluateResult(result, keywords, profile) {
  const corpus = `${result.title} ${result.snippet}`;
  const keywordHits = countKeywordHits(corpus, keywords);
  const categoryHits = countKeywordHits(corpus, profile.keywords);
  const days = daysAgo(result.created_at);
  const recency = scoreRecency(days);
  const relevance = clamp((keywordHits * 14) + (categoryHits * 8) + (recency * 35), 0, 100);

  return {
    ...result,
    keyword_hits: keywordHits,
    category_hits: categoryHits,
    recency_score: Math.round(recency * 100),
    relevance_score: Math.round(relevance),
    age_days: days,
  };
}

function summarizeSources(sourceResults) {
  return sourceResults.map((item) => {
    const topHit = item.results[0];
    const recentCount = item.results.filter((result) => result.age_days <= 30).length;
    const averageRelevance = item.results.length
      ? Math.round(item.results.reduce((sum, result) => sum + result.relevance_score, 0) / item.results.length)
      : 0;

    return {
      source: item.source,
      source_key: item.sourceKey,
      ok: item.ok,
      total_count: item.totalCount,
      result_count: item.results.length,
      recent_count: recentCount,
      average_relevance: averageRelevance,
      top_title: topHit?.title || "",
      top_url: topHit?.url || "",
      note: item.ok
        ? recentCount > 0
          ? `${recentCount} recent signals found.`
          : item.results.length > 0
            ? "Matches exist, but most look older."
            : "No useful matches found."
        : item.error || "Source failed.",
    };
  });
}

function buildMarketVerdict({ innovationScore, trendScore, saturationScore, evidenceScore }) {
  if (innovationScore >= 68 && trendScore >= 55 && saturationScore <= 55) {
    return "Emerging angle with live market motion.";
  }
  if (trendScore >= 65 && saturationScore >= 60) {
    return "Live trend, but the lane is already crowded.";
  }
  if (innovationScore >= 62 && trendScore < 45) {
    return "Potentially differentiated, but demand signal is still weak.";
  }
  if (saturationScore >= 75 && innovationScore < 50) {
    return "This reads as a dense market with low novelty headroom.";
  }
  if (evidenceScore < 35) {
    return "Insufficient public evidence to call this a trend yet.";
  }
  return "Mixed signal: not dead, not clearly differentiated.";
}

function buildPositioningTake(profile, scores, summaries) {
  const strongestSource = summaries
    .filter((item) => item.ok)
    .sort((a, b) => b.average_relevance - a.average_relevance)[0];

  if (!strongestSource) {
    return `No strong external signal surfaced in ${profile.communities.join(", ")}. Position this carefully and validate demand before launch.`;
  }

  if (scores.saturationScore >= 65) {
    return `The market already has visible supply in ${strongestSource.source}. The angle has to be narrower, faster, or better instrumented than existing players.`;
  }

  if (scores.trendScore >= 60) {
    return `There is active motion in ${strongestSource.source}. Position around execution speed, proof, and why this is timely now rather than generically better.`;
  }

  return `Comparable activity exists in ${strongestSource.source}, but momentum is moderate. Position around a specific workflow or niche pain instead of broad category claims.`;
}

export async function runMarketScan(query) {
  const profile = classifyIdea(query);
  const keywords = extractKeywords(query);
  const searchQueries = buildQueries(query, profile);

  const settled = await Promise.allSettled(
    profile.sources.map(async (sourceKey) => {
      const fetcher = SOURCE_FETCHERS[sourceKey];
      const queryResults = await Promise.allSettled(searchQueries.map((searchQuery) => fetcher(searchQuery)));
      const fulfilled = queryResults
        .filter((item) => item.status === "fulfilled")
        .flatMap((item) => item.value.results);
      const error = queryResults.find((item) => item.status === "rejected");

      const evaluated = dedupeResults(fulfilled)
        .map((item) => evaluateResult(item, keywords, profile))
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .slice(0, 6);

      return {
        ok: evaluated.length > 0 || !error,
        sourceKey,
        source: SOURCE_LABELS[sourceKey],
        totalCount: evaluated.length,
        results: evaluated,
        error: error?.reason?.message || "",
      };
    }),
  );

  const sourceResults = settled.map((item, index) => {
    const sourceKey = profile.sources[index];
    if (item.status === "fulfilled") {
      return item.value;
    }

    return {
      ok: false,
      sourceKey,
      source: SOURCE_LABELS[sourceKey] || titleCase(sourceKey),
      totalCount: 0,
      results: [],
      error: item.reason?.message || "Search failed.",
    };
  });

  const flattened = sourceResults.flatMap((item) => item.results);
  const similarProjects = flattened.filter((item) => item.relevance_score >= 35);
  const recentSignals = flattened.filter((item) => item.age_days <= 30);
  const strongSignals = flattened.filter((item) => item.relevance_score >= 55);
  const crossSourceCoverage = sourceResults.filter((item) => item.ok && item.results.length > 0).length;

  const saturationScore = clamp(Math.round((similarProjects.length * 11) + (crossSourceCoverage * 8)), 0, 100);
  const trendScore = clamp(Math.round((recentSignals.length * 10) + (strongSignals.length * 6)), 0, 100);
  const evidenceScore = clamp(Math.round((crossSourceCoverage / Math.max(profile.sources.length, 1)) * 100), 0, 100);
  const innovationScore = clamp(Math.round((100 - saturationScore) * 0.7 + trendScore * 0.3), 0, 100);
  const introducingIndex = clamp(
    Math.round((innovationScore * 0.42) + (trendScore * 0.28) + ((100 - saturationScore) * 0.15) + (evidenceScore * 0.15)),
    0,
    100,
  );

  const sourceSummaries = summarizeSources(sourceResults);
  const recentTopics = recentSignals
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, 8)
    .map((item) => ({
      source: item.source,
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      relevance_score: item.relevance_score,
    }));

  const scores = { innovationScore, trendScore, saturationScore, evidenceScore };

  return {
    category: profile.type,
    communities: profile.communities,
    trend_signals: profile.trendSignals,
    search_queries: searchQueries,
    keyword_map: keywords,
    market_verdict: buildMarketVerdict(scores),
    positioning_take: buildPositioningTake(profile, scores, sourceSummaries),
    introducing_index: introducingIndex,
    innovation_score: innovationScore,
    trend_score: trendScore,
    saturation_score: saturationScore,
    evidence_score: evidenceScore,
    similar_project_count: similarProjects.length,
    recent_signal_count: recentSignals.length,
    source_results: sourceResults,
    source_summaries: sourceSummaries,
    recent_topics: recentTopics,
  };
}
