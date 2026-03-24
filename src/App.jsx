import { useEffect, useState } from "react";
import { extractJsonObject, MAX_INPUT_CHARS, normalizeEntry, normalizeGutCheck, normalizeLaunchPackage, sanitizeStoredEntries } from "./lib/analysis";
import { SEED } from "./lib/seedEntries";

const STORAGE_KEY = "introducing-v1";
const PROVIDER_STORAGE_KEY = "introducing-provider-settings";
const SUBMISSION_STORAGE_KEY = "introducing-submissions-v1";
const DIGEST_STORAGE_KEY = "introducing-digest-v1";
const MONITOR_STORAGE_KEY = "introducing-monitor-v1";
const MONITOR_SNAPSHOTS_STORAGE_KEY = "introducing-monitor-snapshots-v1";
const ARTIFACT_STORAGE_KEY = "introducing-artifacts-v1";
const WATCHLIST_STORAGE_KEY = "introducing-watchlist-v1";
const NAV_ITEMS = ["digest", "monitor", "launch", "gut-check", "bull", "submit", "review", "archive"];
const VERDICTS = ["all", "Genuinely New", "Solid Execution", "Repackaged", "Vaporware"];
const PROVIDER_OPTIONS = ["anthropic", "openai", "google", "grok", "ollama"];
const DEFAULT_PROVIDER_SETTINGS = {
  provider: "anthropic",
  anthropicModel: "claude-sonnet-4-20250514",
  openaiModel: "gpt-4.1-mini",
  googleModel: "gemini-2.0-flash",
  grokModel: "grok-3-mini",
  ollamaModel: "llama3.1:8b",
  ollamaBaseUrl: "http://127.0.0.1:11434",
  ollamaTemperature: "0.2",
  ollamaNumPredict: "700",
};

const VERDICT_CFG = {
  "Genuinely New": { color: "#f45a43", bg: "rgba(244,90,67,0.10)", border: "rgba(244,90,67,0.24)" },
  "Solid Execution": { color: "#66a3ff", bg: "rgba(102,163,255,0.10)", border: "rgba(102,163,255,0.24)" },
  Repackaged: { color: "#9aa7ba", bg: "rgba(154,167,186,0.10)", border: "rgba(154,167,186,0.22)" },
  Vaporware: { color: "#6e7785", bg: "rgba(110,119,133,0.12)", border: "rgba(110,119,133,0.24)" },
};

const CAT_CFG = {
  agent: "#ff6b4a",
  tool: "#66a3ff",
  app: "#79d9c7",
  infra: "#9aa7ba",
  framework: "#b8c4ff",
  other: "#747c8c",
};

const PRODUCT_PILLARS = [
  {
    id: "what",
    label: "What",
    title: "Daily digest",
    body: "One profiled launch per cycle. Signal first, hype second. The goal is recurring audience and editorial trust.",
  },
  {
    id: "how",
    label: "How",
    title: "Launch toolkit",
    body: "Builders feed in a repo, README, or rough idea. Introducing returns a post, thread, and positioning package.",
  },
  {
    id: "why",
    label: "Why",
    title: "Idea gut-check",
    body: "Before shipping noise, get a harsh but useful read on novelty, risk, and the actual pitch that might convert.",
  },
  {
    id: "bull",
    label: "Bull",
    title: "Hype detector",
    body: "Paste a launch post and score whether it is actually new, solid execution, repackaged, or empty packaging.",
  },
  {
    id: "monitor",
    label: "Watch",
    title: "Source monitor",
    body: "Simulate the autonomous discovery loop across launch-heavy sources and feed candidates into review.",
  },
];

const LAUNCH_OUTPUTS = [
  "Introducing post",
  "X thread",
  "Normie rewrite",
  "Web3 tone rewrite",
  "Positioning hook",
  "Missing proof checklist",
];

async function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function saveToStorage(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

async function loadSubmissionsFromStorage() {
  try {
    const raw = localStorage.getItem(SUBMISSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveSubmissionsToStorage(submissions) {
  try {
    localStorage.setItem(SUBMISSION_STORAGE_KEY, JSON.stringify(submissions));
  } catch {}
}

async function loadDigestPlanFromStorage() {
  try {
    const raw = localStorage.getItem(DIGEST_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveDigestPlanToStorage(digestPlan) {
  try {
    localStorage.setItem(DIGEST_STORAGE_KEY, JSON.stringify(digestPlan));
  } catch {}
}

async function loadMonitorItemsFromStorage() {
  try {
    const raw = localStorage.getItem(MONITOR_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveMonitorItemsToStorage(items) {
  try {
    localStorage.setItem(MONITOR_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

async function loadMonitorSnapshotsFromStorage() {
  try {
    const raw = localStorage.getItem(MONITOR_SNAPSHOTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveMonitorSnapshotsToStorage(items) {
  try {
    localStorage.setItem(MONITOR_SNAPSHOTS_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

async function loadArtifactsFromStorage() {
  try {
    const raw = localStorage.getItem(ARTIFACT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveArtifactsToStorage(items) {
  try {
    localStorage.setItem(ARTIFACT_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

async function loadWatchlistFromStorage() {
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveWatchlistToStorage(items) {
  try {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function scoreLocalDailyCandidate(entry) {
  const novelty = Number(entry?.novelty_score || 0) * 10;
  const verdict =
    entry?.novelty_verdict === "Genuinely New"
      ? 16
      : entry?.novelty_verdict === "Solid Execution"
        ? 8
        : entry?.novelty_verdict === "Repackaged"
          ? -3
          : -8;
  const freshness = entry?.date ? Math.max(0, 14 - Math.floor((Date.now() - Date.parse(entry.date)) / 86400000)) : 0;
  return novelty + verdict + freshness;
}

function pickAutoFeaturedEntry(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return [...entries]
    .sort((a, b) => scoreLocalDailyCandidate(b) - scoreLocalDailyCandidate(a))
    .slice(0, 5)[Number(todayKey().replace(/-/g, "")) % Math.min(entries.length, 5)] || entries[0];
}

function resolveFeaturedSelection(entries, remoteFeatured, remoteFeaturedMeta, digestPlan, isShared) {
  const today = todayKey();
  const scheduledId = digestPlan?.[today]?.entryId;

  if (!isShared && scheduledId) {
    const scheduledEntry = entries.find((entry) => String(entry.id) === String(scheduledId));
    if (scheduledEntry) {
      return {
        featured: scheduledEntry,
        featuredMeta: {
          mode: "scheduled-local",
          date: today,
          source: "digest-plan",
        },
      };
    }
  }

  if (remoteFeatured) {
    return {
      featured: remoteFeatured,
      featuredMeta: remoteFeaturedMeta || {
        mode: "daily-auto",
        date: today,
        source: isShared ? "shared" : "fallback",
      },
    };
  }

  const autoEntry = pickAutoFeaturedEntry(entries);
  return {
    featured: autoEntry,
    featuredMeta: {
      mode: "daily-auto",
      date: today,
      source: "local-computed",
    },
  };
}

async function loadEntriesFromApi() {
  const response = await fetch("/api/entries");
  const payload = await readJsonResponse(response, "Entries endpoint returned an invalid response.");

  if (!response.ok) {
    throw new Error(payload?.error || "Could not load the shared archive.");
  }

  return payload;
}

async function createEntryOnApi(entry) {
  const response = await fetch("/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entry }),
  });
  const payload = await readJsonResponse(response, "Entries write returned an invalid response.");

  if (!response.ok) {
    throw new Error(payload?.error || "Could not persist this entry.");
  }

  return payload.entry;
}

async function createSubmissionOnApi(submission) {
  const response = await fetch("/api/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(submission),
  });
  const payload = await readJsonResponse(response, "Submission endpoint returned an invalid response.");

  if (!response.ok) {
    throw new Error(payload?.error || "Could not submit this project.");
  }

  return payload.submission;
}

async function loadSubmissionsFromApi() {
  const response = await fetch("/api/submissions");
  const payload = await readJsonResponse(response, "Submissions endpoint returned an invalid response.");

  if (!response.ok) {
    throw new Error(payload?.error || "Could not load submissions.");
  }

  return payload;
}

async function updateSubmissionOnApi(id, patch) {
  const response = await fetch("/api/submissions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...patch }),
  });
  const payload = await readJsonResponse(response, "Submission update returned an invalid response.");

  if (!response.ok) {
    throw new Error(payload?.error || "Could not update submission.");
  }

  return payload.submission;
}

async function runRealMonitorSweep() {
  const response = await fetch("/api/monitor");
  const payload = await readJsonResponse(response, "Monitor endpoint returned an invalid response.");

  if (!response.ok) {
    throw new Error(payload?.error || "Could not run source monitor.");
  }

  return payload;
}

function buildEntryFromSubmission(submission) {
  const summary = typeof submission?.summary === "string" ? submission.summary.trim() : "";
  const projectName = typeof submission?.project_name === "string" ? submission.project_name.trim() : "Untitled Project";
  const categoryHint = typeof submission?.category_hint === "string" ? submission.category_hint.trim().toLowerCase() : "";
  const category = ["agent", "tool", "app", "infra", "framework", "other"].includes(categoryHint) ? categoryHint : "other";
  const oneLiner = summary.split(/(?<=[.!?])\s+/)[0]?.slice(0, 220) || summary.slice(0, 220) || "Submitted project awaiting editorial profile.";

  return {
    project_name: projectName,
    one_liner: oneLiner,
    what_it_does: summary || "Submitted project awaiting editorial profile.",
    who_built_it: submission?.contact ? String(submission.contact).slice(0, 80) : "Submission queue",
    category,
    tech_stack: submission?.project_url ? ["submitted", "queue"] : ["submitted"],
    novelty_score: 5,
    novelty_verdict: "Solid Execution",
    novelty_reasoning: "Promoted from the submission queue before a full editorial profiling pass.",
    hook: oneLiner,
    missing: "Still needs editorial review, market comparison, and proof verification.",
    editorial_note: "Queue promotion: this item entered the archive through the builder submission flow.",
  };
}

function buildMockMonitorSweep(date = new Date()) {
  const day = Number(date.toISOString().slice(8, 10));
  const candidates = [
    {
      source: "X",
      source_type: "social",
      author: "@agentlaunches",
      project_name: "PenstAgent",
      category_hint: "agent",
      url: "https://x.com/agentlaunches/status/mock-penstagent",
      summary: "An agent that audits vibe-coded sites for auth flaws, secret leaks, weak headers, and missing validation before launch.",
      signal_reason: "Fits the current agent + security narrative and maps directly to builder pain.",
    },
    {
      source: "GitHub Trending",
      source_type: "repo",
      author: "open-launch-labs",
      project_name: "ShipScope",
      category_hint: "tool",
      url: "https://github.com/open-launch-labs/shipscope",
      summary: "CLI that turns a README and changelog into launch copy, screenshots prompts, and proof checklists.",
      signal_reason: "Clear HOW lane candidate with legible monetization path.",
    },
    {
      source: "Product Hunt",
      source_type: "launch",
      author: "Launchglass",
      project_name: "TrendGlass",
      category_hint: "app",
      url: "https://www.producthunt.com/posts/trendglass",
      summary: "Dashboard that tracks memecoin narratives, KOL mentions, and token launch copy patterns in one place.",
      signal_reason: "Potentially strong web3-native audience fit but likely crowded.",
    },
    {
      source: "Reddit",
      source_type: "discussion",
      author: "r/LocalLLaMA",
      project_name: "FlowMesh",
      category_hint: "framework",
      url: "https://reddit.com/r/LocalLLaMA/mock-flowmesh",
      summary: "An open orchestration layer for local agents that routes tasks between Ollama models based on context and latency.",
      signal_reason: "Good match for agent infrastructure interest with open-source leverage.",
    },
    {
      source: "GitHub Trending",
      source_type: "repo",
      author: "cryptotools",
      project_name: "MemeProof",
      category_hint: "security",
      url: "https://github.com/cryptotools/memeproof",
      summary: "Static analyzer for token launch sites that checks wallet-drain vectors, signer misuse, and unsafe contract embeds.",
      signal_reason: "Strong overlap with crypto trust and launch infrastructure.",
    },
  ];

  return candidates
    .map((item, index) => ({
      id: `${todayKey()}-${index}`,
      detected_at: date.toISOString(),
      novelty_hint: (day + index) % 10,
      queue_status: "new",
      ...item,
    }))
    .sort((a, b) => b.novelty_hint - a.novelty_hint);
}

function loadProviderSettings() {
  try {
    const raw = localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (!raw) return DEFAULT_PROVIDER_SETTINGS;
    return { ...DEFAULT_PROVIDER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PROVIDER_SETTINGS;
  }
}

function saveProviderSettings(settings) {
  try {
    localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

async function readJsonResponse(response, fallbackMessage) {
  const rawText = await response.text();

  if (!rawText.trim()) {
    throw new Error(fallbackMessage || "Empty response body.");
  }

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(`${fallbackMessage || "Invalid JSON response."} Raw body: ${rawText.slice(0, 240)}`);
  }
}

async function runOllamaAnalysis({ mode, input, providerSettings }) {
  const baseUrl = (providerSettings.ollamaBaseUrl || DEFAULT_PROVIDER_SETTINGS.ollamaBaseUrl).replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: providerSettings.ollamaModel || DEFAULT_PROVIDER_SETTINGS.ollamaModel,
      stream: false,
      format: "json",
      options: {
        temperature: Number.parseFloat(providerSettings.ollamaTemperature || DEFAULT_PROVIDER_SETTINGS.ollamaTemperature) || 0.2,
        num_predict: Number.parseInt(providerSettings.ollamaNumPredict || DEFAULT_PROVIDER_SETTINGS.ollamaNumPredict, 10) || 700,
      },
      messages: [
        {
          role: "system",
          content: "You are a JSON-only assistant. Return exactly one valid JSON object and nothing else.",
        },
        {
          role: "user",
          content: `${buildOllamaModeInstruction(mode)}\n\nInput:\n${input}`,
        },
      ],
    }),
  });

  const payload = await readJsonResponse(response, "Ollama returned invalid JSON from /api/chat.");
  if (!response.ok) {
    throw new Error(payload?.error || "Ollama request failed.");
  }

  const content = payload?.message?.content;
  if (!content) {
    throw new Error("Ollama returned an empty response.");
  }

  return content;
}

async function probeOllama(baseUrl) {
  const sanitized = (baseUrl || DEFAULT_PROVIDER_SETTINGS.ollamaBaseUrl).replace(/\/+$/, "");
  const response = await fetch(`${sanitized}/api/tags`);
  const payload = await readJsonResponse(response, "Ollama returned invalid JSON from /api/tags.");

  if (!response.ok) {
    throw new Error(payload?.error || "Could not reach Ollama /api/tags.");
  }

  const models = Array.isArray(payload?.models)
    ? payload.models
        .map((item) => item?.model || item?.name || "")
        .filter(Boolean)
    : [];

  return models;
}

function buildOllamaModeInstruction(mode) {
  if (mode === "launch") {
    return `You are writing a launch package for the exact idea in the input. Do not invent a different product category. Do not switch domains. If the input is about website security, stay on website security.

Return ONE JSON object only, with these keys:
headline
one_liner
launch_post
x_thread

Rules:
- x_thread must be an array of 3 to 5 strings
- no markdown
- no explanations before or after JSON
- use the product idea from the input, not a generic startup idea`;
  }
  if (mode === "gut-check") {
    return `Return ONE JSON object only with these keys:
verdict
market_pitch
competition_map
strengths
failure_modes
missing_proof
next_move

Do not invent a different market than the one in the input.`;
  }
  return `Return ONE JSON object only with these keys:
verdict
novelty_score
why_it_hits
whats_real
whats_hype
honest_version
receipts_needed

Stay close to the pasted launch.`;
}

function Grain() {
  return (
    <svg style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0, opacity: 0.04 }}>
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.78" numOctaves="4" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#noise)" />
    </svg>
  );
}

function Beam() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      <div style={{ position: "absolute", top: "-35%", left: "10%", width: 1, height: "170%", background: "linear-gradient(180deg,transparent,rgba(255,107,74,0.42) 35%,rgba(255,107,74,0.42) 65%,transparent)", transform: "rotate(24deg)" }} />
      <div style={{ position: "absolute", top: "-30%", right: "8%", width: 180, height: "160%", background: "linear-gradient(180deg,transparent,rgba(102,163,255,0.07) 35%,rgba(102,163,255,0.03) 65%,transparent)", transform: "rotate(-28deg)", filter: "blur(2px)" }} />
    </div>
  );
}

function Chip({ label, color, bg, border }) {
  return (
    <span style={{ padding: "3px 8px", fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.12em", color, background: bg, border: `1px solid ${border}` }}>
      {label}
    </span>
  );
}

function SectionLabel({ children, color = "rgba(255,255,255,0.18)" }) {
  return (
    <div style={{ fontFamily: "monospace", fontSize: 8, color, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 12 }}>
      {children}
    </div>
  );
}

function NoveltyBar({ score }) {
  const color = score >= 7 ? "#f45a43" : score >= 4 ? "#66a3ff" : "#6e7785";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)" }}>
        <div style={{ height: "100%", width: `${score * 10}%`, background: color }} />
      </div>
      <span style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.24)", minWidth: 32, textAlign: "right" }}>{score}/10</span>
    </div>
  );
}

function HeroMetrics({ entries }) {
  const averageNovelty = entries.length ? (entries.reduce((sum, entry) => sum + entry.novelty_score, 0) / entries.length).toFixed(1) : "0.0";
  const genuine = entries.filter((entry) => entry.novelty_verdict === "Genuinely New").length;
  const agentCount = entries.filter((entry) => entry.category === "agent").length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
      {[
        ["Profiled", entries.length, "#f45a43"],
        ["Avg novelty", averageNovelty, "#ffffff"],
        ["Agent launches", agentCount, "#79d9c7"],
        ["Actually new", genuine, "#66a3ff"],
      ].map(([label, value, color]) => (
        <div key={label} style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "16px 14px" }}>
          <div style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 30, letterSpacing: "0.04em", lineHeight: 1, color }}>{value}</div>
          <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.18)", letterSpacing: "0.18em", textTransform: "uppercase" }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

function FeaturedCard({ entry, featuredMeta }) {
  const verdict = VERDICT_CFG[entry.novelty_verdict] || VERDICT_CFG["Solid Execution"];
  const category = CAT_CFG[entry.category] || CAT_CFG.other;
  const isScheduled = featuredMeta?.mode === "scheduled" || featuredMeta?.mode === "scheduled-local";

  return (
    <div style={{ position: "relative", overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)", background: "linear-gradient(135deg,#0c1422 0%,#090d16 58%,#17080c 100%)", padding: "34px 30px" }}>
      <Beam />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {featuredMeta?.mode && <Chip label={isScheduled ? "Featured today" : "Auto-picked today"} color="#fff" bg="rgba(255,255,255,0.05)" border="rgba(255,255,255,0.1)" />}
            <Chip label={entry.category} color={category} bg={`${category}14`} border={`${category}2e`} />
            <Chip label={entry.novelty_verdict} color={verdict.color} bg={verdict.bg} border={verdict.border} />
          </div>
          <span style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.16)", letterSpacing: "0.15em" }}>
            {(featuredMeta?.date || entry.date) ? new Date(featuredMeta?.date || entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase() : ""}
          </span>
        </div>

        <h2 style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: "clamp(36px,5vw,62px)", fontWeight: 400, color: "#fff4eb", lineHeight: 0.92, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>
          {entry.project_name}
        </h2>
        <div style={{ marginTop: 10, fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
          {entry.who_built_it ? `By ${entry.who_built_it}` : "Builder unknown"}
        </div>
        <p style={{ margin: "18px 0 0", maxWidth: 640, fontFamily: "'Crimson Pro',Georgia,serif", fontSize: 18, lineHeight: 1.55, color: "rgba(255,255,255,0.72)" }}>
          {entry.what_it_does}
        </p>

        <div style={{ marginTop: 24, paddingLeft: 18, borderLeft: "3px solid #f45a43" }}>
          <div style={{ fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.18)", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8 }}>The screenshot line</div>
          <p style={{ margin: 0, fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: "clamp(18px,2.4vw,26px)", lineHeight: 1.18, letterSpacing: "0.04em", color: "#fff" }}>
            {entry.hook}
          </p>
        </div>

        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 22 }}>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
            <SectionLabel color="#f45a43">Novelty reasoning</SectionLabel>
            <NoveltyBar score={entry.novelty_score} />
            <p style={{ margin: "10px 0 0", fontFamily: "monospace", fontSize: 11, lineHeight: 1.6, color: "rgba(255,255,255,0.28)" }}>
              {entry.novelty_reasoning}
            </p>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
            <SectionLabel color="#66a3ff">Tech stack</SectionLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {entry.tech_stack.map((item) => (
                <span key={item} style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.03)", padding: "3px 7px", border: "1px solid rgba(255,255,255,0.06)" }}>
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
            <SectionLabel>Missing</SectionLabel>
            <p style={{ margin: 0, fontFamily: "monospace", fontSize: 11, lineHeight: 1.65, color: "rgba(255,255,255,0.28)" }}>{entry.missing}</p>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
            <SectionLabel>Editorial note</SectionLabel>
            <p style={{ margin: 0, fontFamily: "'Crimson Pro',Georgia,serif", fontSize: 18, lineHeight: 1.55, color: "rgba(255,255,255,0.72)", fontStyle: "italic" }}>{entry.editorial_note}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedList({ entries, onSelect }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" }}>
      {entries.map((entry) => {
        const verdict = VERDICT_CFG[entry.novelty_verdict] || VERDICT_CFG["Solid Execution"];
        const category = CAT_CFG[entry.category] || CAT_CFG.other;

        return (
          <button
            key={entry.id}
            onClick={() => onSelect(entry)}
            style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "16px 18px", cursor: "pointer" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                  <Chip label={entry.category} color={category} bg={`${category}12`} border={`${category}28`} />
                  <Chip label={entry.novelty_verdict} color={verdict.color} bg={verdict.bg} border={verdict.border} />
                </div>
                <div style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 22, lineHeight: 1, letterSpacing: "0.04em", color: "#fff", textTransform: "uppercase", marginBottom: 4 }}>
                  {entry.project_name}
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.6, color: "rgba(255,255,255,0.22)", maxWidth: 560 }}>
                  {entry.one_liner}
                </div>
              </div>
              <div style={{ minWidth: 60, textAlign: "right" }}>
                <div style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 30, lineHeight: 1, color: verdict.color }}>{entry.novelty_score}</div>
                <div style={{ fontFamily: "monospace", fontSize: 7, color: "rgba(255,255,255,0.14)", letterSpacing: "0.16em" }}>NOVELTY</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ProductRail({ setView }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
      {PRODUCT_PILLARS.map((pillar) => (
        <div key={pillar.id} style={{ border: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))", padding: "18px 16px" }}>
          <SectionLabel color={pillar.label === "Bull" ? "#f45a43" : "rgba(255,255,255,0.2)"}>{pillar.label}</SectionLabel>
          <div style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 26, lineHeight: 1, letterSpacing: "0.04em", textTransform: "uppercase", color: "#fff", marginBottom: 10 }}>
            {pillar.title}
          </div>
          <p style={{ margin: 0, fontFamily: "monospace", fontSize: 11, lineHeight: 1.7, color: "rgba(255,255,255,0.28)" }}>
            {pillar.body}
          </p>
          <button
            onClick={() => {
              if (pillar.id === "how") setView("launch");
              else if (pillar.id === "why") setView("gut-check");
              else if (pillar.id === "bull") setView("bull");
              else if (pillar.id === "monitor") setView("monitor");
              else setView("digest");
            }}
            style={{ marginTop: 14, background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.66)", padding: "8px 12px", cursor: "pointer", fontFamily: "monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" }}
          >
            Open lane
          </button>
        </div>
      ))}
    </div>
  );
}

function DigestView({ entries, featured, featuredMeta, onSelect, setView }) {
  const latest = entries.slice(0, 4);
  const isScheduled = featuredMeta?.mode === "scheduled" || featuredMeta?.mode === "scheduled-local";

  return (
    <div style={{ display: "grid", gap: 34 }}>
      <section style={{ position: "relative", overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", background: "radial-gradient(circle at top left,rgba(102,163,255,0.10),transparent 32%), radial-gradient(circle at bottom right,rgba(244,90,67,0.12),transparent 30%), linear-gradient(180deg,#070b13 0%,#080a11 100%)", padding: "34px 30px 28px" }}>
        <Beam />
        <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(280px,0.8fr)", gap: 24 }}>
          <div>
            <SectionLabel color="rgba(244,90,67,0.68)">Introducing / batch one / editorial core</SectionLabel>
            <h1 style={{ margin: 0, fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: "clamp(58px,9vw,110px)", lineHeight: 0.86, letterSpacing: "0.03em", textTransform: "uppercase", color: "#fff8f1" }}>
              The launch
              <br />
              journalist
              <br />
              for agents.
            </h1>
            <p style={{ margin: "18px 0 0", maxWidth: 660, fontFamily: "'Crimson Pro',Georgia,serif", fontSize: 24, lineHeight: 1.45, color: "rgba(255,255,255,0.72)" }}>
              Introducing profiles launches, writes launch copy, pressure-tests ideas, and calls out repackaged hype.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
              <button onClick={() => setView("launch")} style={{ background: "#f45a43", border: "none", color: "#fff", padding: "12px 22px", cursor: "pointer", fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 17, letterSpacing: "0.1em" }}>
                Open Launch Toolkit
              </button>
              <button onClick={() => setView("bull")} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.74)", padding: "12px 18px", cursor: "pointer", fontFamily: "monospace", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                Rate the hype
              </button>
            </div>
          </div>
          <div>
            <SectionLabel color="#66a3ff">Business spine</SectionLabel>
            <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.025)", padding: "16px" }}>
              <div style={{ display: "grid", gap: 12 }}>
                {[
                  ["Audience", "Daily launch intelligence for agent-native builders and operators."],
                  ["Monetization", "Toolkit surfaces convert the editorial audience into builder demand."],
                  ["Distribution", "Bull detector and launch rewrites create inherently shareable outputs."],
                ].map(([title, copy]) => (
                  <div key={title} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 12 }}>
                    <div style={{ fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.18)", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 6 }}>{title}</div>
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.7 }}>{copy}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <HeroMetrics entries={entries} />
      <ProductRail setView={setView} />

      {featured && (
        <section>
          <SectionLabel>{isScheduled ? "Today's featured" : "Daily auto-featured profile"}</SectionLabel>
          <FeaturedCard entry={featured} featuredMeta={featuredMeta} />
        </section>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 22 }}>
        <div>
          <SectionLabel>Recent launches</SectionLabel>
          <FeedList entries={latest} onSelect={onSelect} />
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "18px 16px" }}>
            <SectionLabel color="#f45a43">Editorial thesis</SectionLabel>
            <p style={{ margin: 0, fontFamily: "'Crimson Pro',Georgia,serif", fontSize: 22, lineHeight: 1.45, color: "rgba(255,255,255,0.74)" }}>
              The agent era needs a newsroom that can also write the launch post.
            </p>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "18px 16px" }}>
            <SectionLabel>What ships next</SectionLabel>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                "Launch writer for repo or idea inputs",
                "Idea gut-check for pitch and differentiation",
                "Submission queue feeding the archive",
              ].map((item) => (
                <div key={item} style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.26)" }}>
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "18px 16px" }}>
            <SectionLabel>Digest status</SectionLabel>
            <div style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.28)" }}>
              {isScheduled ? "Today's featured was explicitly scheduled." : "Today's featured is being auto-selected from the archive."}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ToolShell({ eyebrow, title, description, children, asideTitle, asideItems }) {
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section style={{ border: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg,#0a0d15,#090b11)", padding: "28px 24px" }}>
        <SectionLabel color="rgba(244,90,67,0.62)">{eyebrow}</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) 280px", gap: 22 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: "clamp(40px,6vw,72px)", lineHeight: 0.92, letterSpacing: "0.04em", color: "#fff", textTransform: "uppercase" }}>
              {title}
            </h1>
            <p style={{ margin: "14px 0 0", maxWidth: 680, fontFamily: "'Crimson Pro',Georgia,serif", fontSize: 22, lineHeight: 1.45, color: "rgba(255,255,255,0.7)" }}>
              {description}
            </p>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "14px 14px 12px" }}>
            <SectionLabel>{asideTitle}</SectionLabel>
            <div style={{ display: "grid", gap: 10 }}>
              {asideItems.map((item) => (
                <div key={item} style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.28)" }}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      {children}
    </div>
  );
}

function MonitorView({ items, loading, onSweep, onQueueToReview, monitorMode, monitorSources, monitorStats, snapshots, onLoadSnapshot }) {
  return (
    <ToolShell
      eyebrow="Source monitor / mock pipeline"
      title="Simulate autonomous discovery before wiring real collectors."
      description="This lane stands in for the future ingestion system. It surfaces launch candidates from mocked source sweeps, scores them for editorial interest, and lets you push them into the review queue."
      asideTitle="Collector path"
      asideItems={["Sweep launch-heavy sources", "Detect candidate items", "Score editorial relevance", "Queue promising discoveries for review"]}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 22 }}>
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "18px 16px", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.28)" }}>
              Run a sweep of free public sources first, then fall back to mocked launch feeds only if real collection is unavailable.
            </div>
            <button onClick={onSweep} disabled={loading} style={{ background: "#f45a43", border: "none", color: "#fff", padding: "10px 16px", cursor: "pointer", fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 16, letterSpacing: "0.08em" }}>
              {loading ? "SWEEPING" : "RUN SWEEP"}
            </button>
          </div>

          {items.length === 0 ? (
            <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "20px 18px", fontFamily: "monospace", fontSize: 11, lineHeight: 1.7, color: "rgba(255,255,255,0.3)" }}>
              No discovery items yet. Run a sweep to simulate source ingestion.
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "18px 16px", display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                      <Chip label={item.source} color="#66a3ff" bg="rgba(102,163,255,0.10)" border="rgba(102,163,255,0.24)" />
                      <Chip label={item.category_hint || "other"} color="#79d9c7" bg="rgba(121,217,199,0.10)" border="rgba(121,217,199,0.24)" />
                    </div>
                    <div style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 28, lineHeight: 1, letterSpacing: "0.04em", color: "#fff", textTransform: "uppercase" }}>{item.project_name}</div>
                    <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                      {item.author} | {item.source_type} | novelty hint {item.novelty_hint} | editorial {item.editorial_score ?? "-"}
                    </div>
                  </div>
                  <Chip label={item.queue_status === "queued" ? "queued" : "new"} color={item.queue_status === "queued" ? "#79d9c7" : "#fff"} bg={item.queue_status === "queued" ? "rgba(121,217,199,0.08)" : "rgba(255,255,255,0.04)"} border={item.queue_status === "queued" ? "rgba(121,217,199,0.22)" : "rgba(255,255,255,0.1)"} />
                </div>
                <div style={{ fontFamily: "'Crimson Pro',Georgia,serif", fontSize: 20, lineHeight: 1.45, color: "rgba(255,255,255,0.74)" }}>{item.summary}</div>
                <div style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.28)" }}>{item.signal_reason}</div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <a href={item.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", fontFamily: "monospace", fontSize: 9, color: "rgba(102,163,255,0.82)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Open source item
                  </a>
                  <button onClick={() => onQueueToReview(item)} disabled={loading || item.queue_status === "queued"} style={{ background: item.queue_status === "queued" ? "rgba(255,255,255,0.05)" : "transparent", border: "1px solid rgba(255,255,255,0.1)", color: item.queue_status === "queued" ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.72)", padding: "10px 14px", cursor: item.queue_status === "queued" ? "not-allowed" : "pointer", fontFamily: "monospace", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                    {item.queue_status === "queued" ? "Already in review" : "Send to review"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <ArtifactRail title="Sweep history" artifacts={snapshots} onLoad={onLoadSnapshot} />
          <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "18px 16px" }}>
            <SectionLabel>Sweep stats</SectionLabel>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.28)" }}>
                Raw candidates: {monitorStats.raw_count}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.28)" }}>
                Deduped candidates: {monitorStats.deduped_count}
              </div>
            </div>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "18px 16px" }}>
            <SectionLabel>Current sweep sources</SectionLabel>
            <div style={{ display: "grid", gap: 8 }}>
              {(monitorSources.length ? monitorSources : [
                { source: "GitHub", ok: false, count: 0 },
                { source: "Hacker News", ok: false, count: 0 },
                { source: "Reddit", ok: false, count: 0 },
              ]).map((item) => (
                <div key={item.source} style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.28)" }}>
                  {item.source} {typeof item.count === "number" ? `| ${item.count} hits` : ""} {item.ok ? "| live" : item.error ? `| ${item.error}` : ""}
                </div>
              ))}
            </div>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "18px 16px" }}>
            <SectionLabel>Why this exists</SectionLabel>
            <div style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.28)" }}>
              This is the bridge between a static website and the autonomous product vision. Current mode: {monitorMode === "real" ? "real free-source collection" : "mock fallback"}.
            </div>
          </div>
        </div>
      </div>
    </ToolShell>
  );
}

function ArtifactRail({ title, artifacts, onLoad }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "18px 16px" }}>
      <SectionLabel>{title}</SectionLabel>
      {artifacts.length === 0 ? (
        <div style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.24)" }}>
          No saved artifacts yet.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {artifacts.map((artifact) => (
            <button key={artifact.id} onClick={() => onLoad(artifact)} style={{ textAlign: "left", background: "transparent", border: "1px solid rgba(255,255,255,0.05)", padding: "12px 10px", cursor: "pointer" }}>
              <div style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 18, letterSpacing: "0.04em", color: "#fff", textTransform: "uppercase" }}>{artifact.label}</div>
              <div style={{ marginTop: 4, fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.18)", letterSpacing: "0.16em", textTransform: "uppercase" }}>
                {artifact.mode} | {new Date(artifact.created_at).toLocaleDateString("en-US")}
              </div>
              <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.28)" }}>{artifact.summary}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LaunchView({ input, setInput, loading, analyze, error, result, history, onLoadHistory }) {
  return (
    <ToolShell
      eyebrow="Builder toolkit / launch writer"
      title="Write the launch before the market ignores it."
      description="Feed in a repo, rough pitch, or raw announcement. The engine turns it into launch-ready copy and editorial framing."
      asideTitle="Target outputs"
      asideItems={LAUNCH_OUTPUTS}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 22 }}>
        <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "20px 18px" }}>
          <SectionLabel>Input</SectionLabel>
          <textarea
            maxLength={MAX_INPUT_CHARS}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste a README, a launch thread, or the raw idea."
            style={{ width: "100%", minHeight: 260, background: "#09101a", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.78)", padding: 16, fontSize: 14, lineHeight: 1.7, fontFamily: "'Crimson Pro',Georgia,serif" }}
          />
          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.18)", letterSpacing: "0.12em" }}>
              {input.length}/{MAX_INPUT_CHARS}
            </span>
            <button
              onClick={analyze}
              disabled={!input.trim() || loading}
              style={{ background: input.trim() ? "#f45a43" : "rgba(255,255,255,0.05)", border: "none", color: input.trim() ? "#fff" : "rgba(255,255,255,0.12)", padding: "11px 24px", cursor: input.trim() ? "pointer" : "not-allowed", fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 17, letterSpacing: "0.1em" }}
            >
              {loading ? "PROCESSING" : "GENERATE"}
            </button>
          </div>
          {error && <div style={{ marginTop: 12, padding: 12, border: "1px solid rgba(244,90,67,0.18)", background: "rgba(244,90,67,0.06)", fontFamily: "monospace", fontSize: 10, color: "rgba(244,90,67,0.82)" }}>{error}</div>}
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "18px 16px" }}>
            <SectionLabel color="#66a3ff">Launch package logic</SectionLabel>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                "Start with the actual product, not fake growth theater.",
                "Compress the technical core into a screenshot-worthy hook.",
                "Surface what is missing before someone in replies does it for you.",
              ].map((item) => (
                <p key={item} style={{ margin: 0, fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.28)" }}>{item}</p>
              ))}
            </div>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "18px 16px" }}>
            <SectionLabel>Monetization lane</SectionLabel>
            <p style={{ margin: 0, fontFamily: "'Crimson Pro',Georgia,serif", fontSize: 20, lineHeight: 1.45, color: "rgba(255,255,255,0.72)" }}>
              This surface becomes the first paid feature because the ROI is immediate and legible to builders.
            </p>
          </div>
          <ArtifactRail title="Launch history" artifacts={history} onLoad={onLoadHistory} />
          {result && (
            <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "18px 16px", display: "grid", gap: 14 }}>
              <SectionLabel color="#f45a43">Generated package</SectionLabel>
              <div>
                <div style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 28, lineHeight: 1, letterSpacing: "0.04em", textTransform: "uppercase", color: "#fff" }}>{result.headline}</div>
                <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.24)", lineHeight: 1.6 }}>{result.one_liner}</div>
              </div>
              <div>
                <SectionLabel>Launch post</SectionLabel>
                <p style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 11, lineHeight: 1.7, color: "rgba(255,255,255,0.34)" }}>{result.launch_post}</p>
              </div>
              <div>
                <SectionLabel>Thread</SectionLabel>
                <div style={{ display: "grid", gap: 8 }}>
                  {result.x_thread.map((tweet, index) => (
                    <div key={tweet + index} style={{ border: "1px solid rgba(255,255,255,0.05)", padding: "10px 10px 9px", fontFamily: "monospace", fontSize: 10, lineHeight: 1.6, color: "rgba(255,255,255,0.3)" }}>
                      {tweet}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ToolShell>
  );
}

function GutCheckView({ entries, input, setInput, loading, analyze, error, result, history, onLoadHistory }) {
  const strongest = [...entries].sort((a, b) => b.novelty_score - a.novelty_score).slice(0, 3);

  return (
    <ToolShell
      eyebrow="Builder toolkit / idea gut-check"
      title="Market reality before launch day."
      description="This mode is for founders who need the honest friend, not the hype machine. It should tell them who already did it, why it may fail, and what the pitch should really be."
      asideTitle="Planned outputs"
      asideItems={["Comparable products", "Likely failure modes", "Rewritten market pitch", "Missing proof demands"]}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1.02fr 0.98fr", gap: 22 }}>
        <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "20px 18px" }}>
          <SectionLabel color="#f45a43">Idea input</SectionLabel>
          <textarea
            maxLength={MAX_INPUT_CHARS}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Describe the idea, market, why now, and why anyone should care."
            style={{ width: "100%", minHeight: 220, background: "#09101a", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.78)", padding: 16, fontSize: 14, lineHeight: 1.7, fontFamily: "'Crimson Pro',Georgia,serif" }}
          />
          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.18)", letterSpacing: "0.12em" }}>{input.length}/{MAX_INPUT_CHARS}</span>
            <button onClick={analyze} disabled={!input.trim() || loading} style={{ background: input.trim() ? "#f45a43" : "rgba(255,255,255,0.05)", border: "none", color: input.trim() ? "#fff" : "rgba(255,255,255,0.12)", padding: "11px 24px", cursor: input.trim() ? "pointer" : "not-allowed", fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 17, letterSpacing: "0.1em" }}>
              {loading ? "CHECKING" : "RUN CHECK"}
            </button>
          </div>
          {error && <div style={{ marginTop: 12, padding: 12, border: "1px solid rgba(244,90,67,0.18)", background: "rgba(244,90,67,0.06)", fontFamily: "monospace", fontSize: 10, color: "rgba(244,90,67,0.82)" }}>{error}</div>}
        </div>
        <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "20px 18px" }}>
          <SectionLabel>Decision criteria</SectionLabel>
          <div style={{ display: "grid", gap: 10 }}>
            {[
              "Is the thing genuinely new or only newly packaged?",
              "Can the pitch survive contact with a skeptical builder audience?",
              "What evidence must exist before this should be posted publicly?",
            ].map((item) => (
              <div key={item} style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.28)" }}>{item}</div>
            ))}
          </div>
        </div>
      </div>

      {result && (
        <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "20px 18px", display: "grid", gap: 16 }}>
          <div>
            <SectionLabel color="#f45a43">Verdict</SectionLabel>
            <p style={{ margin: 0, fontFamily: "'Crimson Pro',Georgia,serif", fontSize: 24, lineHeight: 1.45, color: "rgba(255,255,255,0.76)" }}>{result.verdict}</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <SectionLabel>Market pitch</SectionLabel>
              <p style={{ margin: 0, fontFamily: "monospace", fontSize: 11, lineHeight: 1.7, color: "rgba(255,255,255,0.32)" }}>{result.market_pitch}</p>
            </div>
            <div>
              <SectionLabel>Next move</SectionLabel>
              <p style={{ margin: 0, fontFamily: "monospace", fontSize: 11, lineHeight: 1.7, color: "rgba(255,255,255,0.32)" }}>{result.next_move}</p>
            </div>
          </div>
        </div>
      )}

      <ArtifactRail title="Gut-check history" artifacts={history} onLoad={onLoadHistory} />

      <div>
        <SectionLabel>Reference set from current archive</SectionLabel>
        <FeedList entries={strongest} onSelect={() => {}} />
      </div>
    </ToolShell>
  );
}

function BullView({ entries, setView, onSelect, input, setInput, loading, analyze, error, result, history, watchlist, onLoadHistory, onSaveWatchlist }) {
  const suspicious = entries.filter((entry) => entry.novelty_verdict === "Repackaged" || entry.novelty_verdict === "Vaporware");

  return (
    <ToolShell
      eyebrow="Market scan / introducing index"
      title="Scan the market before you call it innovation."
      description="This lane stops rating hype by vibe alone. It searches public sources, finds similar projects, measures recent discussion, and returns an Introducing Index for the idea."
      asideTitle="Scan flow"
      asideItems={["Classify the idea", "Search public sources", "Measure recency and saturation", "Score introducing index"]}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
        <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "20px 18px" }}>
          <SectionLabel color="#f45a43">Idea or thesis</SectionLabel>
          <p style={{ margin: 0, fontFamily: "'Crimson Pro',Georgia,serif", fontSize: 22, lineHeight: 1.48, color: "rgba(255,255,255,0.72)" }}>
            Paste the raw idea and compare it against what is already shipping, what is getting discussed, and whether the category is heating up or already saturated.
          </p>
          <textarea
            maxLength={MAX_INPUT_CHARS}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Describe the idea, market, niche, and what you think is differentiated."
            style={{ width: "100%", minHeight: 180, marginTop: 14, background: "#09101a", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.78)", padding: 16, fontSize: 14, lineHeight: 1.7, fontFamily: "'Crimson Pro',Georgia,serif" }}
          />
          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.18)", letterSpacing: "0.12em" }}>{input.length}/{MAX_INPUT_CHARS}</span>
            <button onClick={analyze} disabled={!input.trim() || loading} style={{ background: input.trim() ? "#f45a43" : "rgba(255,255,255,0.05)", border: "none", color: input.trim() ? "#fff" : "rgba(255,255,255,0.12)", padding: "11px 24px", cursor: input.trim() ? "pointer" : "not-allowed", fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 17, letterSpacing: "0.1em" }}>
              {loading ? "SCANNING" : "SCAN MARKET"}
            </button>
          </div>
          {error && <div style={{ marginTop: 12, padding: 12, border: "1px solid rgba(244,90,67,0.18)", background: "rgba(244,90,67,0.06)", fontFamily: "monospace", fontSize: 10, color: "rgba(244,90,67,0.82)" }}>{error}</div>}
          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => setView("launch")} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.72)", padding: "10px 14px", cursor: "pointer", fontFamily: "monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em" }}>
              Open builder toolkit
            </button>
            <button onClick={onSaveWatchlist} disabled={!result} style={{ background: result ? "rgba(102,163,255,0.14)" : "rgba(255,255,255,0.05)", border: "1px solid rgba(102,163,255,0.26)", color: result ? "#fff" : "rgba(255,255,255,0.18)", padding: "10px 14px", cursor: result ? "pointer" : "not-allowed", fontFamily: "monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em" }}>
              Add to watchlist
            </button>
          </div>
        </div>
        <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "20px 18px" }}>
          <SectionLabel>Core scoring signals</SectionLabel>
          <div style={{ display: "grid", gap: 10 }}>
            {[
              "Recent discussion volume",
              "Comparable project density",
              "Category saturation",
              "Cross-source evidence quality",
            ].map((item) => (
              <div key={item} style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.28)" }}>{item}</div>
            ))}
          </div>
        </div>
      </div>

      {result && (
        <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "20px 18px", display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 12 }}>
            {[
              ["Introducing index", result.introducing_index],
              ["Innovation", result.innovation_score],
              ["Trend", result.trend_score],
              ["Saturation", result.saturation_score],
              ["Evidence", result.evidence_score],
            ].map(([label, value]) => (
              <div key={label} style={{ border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)", padding: "12px 10px" }}>
                <div style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 30, lineHeight: 1, color: label === "Introducing index" ? "#f45a43" : "#fff" }}>{value}</div>
                <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.16)", letterSpacing: "0.16em", textTransform: "uppercase" }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 20 }}>
            <div>
              <SectionLabel>Market verdict</SectionLabel>
              <p style={{ margin: 0, fontFamily: "'Crimson Pro',Georgia,serif", fontSize: 24, lineHeight: 1.35, color: "rgba(255,255,255,0.82)" }}>{result.market_verdict}</p>
            </div>
            <div>
              <SectionLabel>Positioning take</SectionLabel>
              <p style={{ margin: 0, fontFamily: "monospace", fontSize: 11, lineHeight: 1.7, color: "rgba(255,255,255,0.34)" }}>{result.positioning_take}</p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <SectionLabel>Market category</SectionLabel>
              <p style={{ margin: 0, fontFamily: "monospace", fontSize: 11, lineHeight: 1.7, color: "rgba(255,255,255,0.32)" }}>
                {result.category}
                {result.communities?.length ? ` | ${result.communities.join(", ")}` : ""}
              </p>
            </div>
            <div>
              <SectionLabel>Counts</SectionLabel>
              <p style={{ margin: 0, fontFamily: "monospace", fontSize: 11, lineHeight: 1.7, color: "rgba(255,255,255,0.32)" }}>
                {result.similar_project_count} similar results across {result.source_results.length} sources, {result.recent_signal_count} recent signals.
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <SectionLabel>Query map</SectionLabel>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(result.search_queries || []).map((item) => (
                  <span key={item} style={{ border: "1px solid rgba(255,255,255,0.06)", padding: "6px 8px", fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.32)" }}>{item}</span>
                ))}
              </div>
            </div>
            <div>
              <SectionLabel>Trend signals watched</SectionLabel>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(result.trend_signals || []).map((item) => (
                  <span key={item} style={{ border: "1px solid rgba(255,255,255,0.06)", padding: "6px 8px", fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.32)" }}>{item}</span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <SectionLabel>Keyword map</SectionLabel>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(result.keyword_map || []).map((item) => (
                  <span key={item} style={{ border: "1px solid rgba(255,255,255,0.06)", padding: "6px 8px", fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.32)" }}>{item}</span>
                ))}
              </div>
            </div>
            <div />
          </div>

          <div>
            <SectionLabel>Source breakdown</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
              {(result.source_summaries || []).map((source) => (
                <div key={source.source} style={{ border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)", padding: "12px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                    <div style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 20, letterSpacing: "0.05em", color: "#fff", textTransform: "uppercase" }}>{source.source}</div>
                    <div style={{ fontFamily: "monospace", fontSize: 8, color: "rgba(244,90,67,0.7)", letterSpacing: "0.16em", textTransform: "uppercase" }}>
                      {source.average_relevance} rel
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.3)" }}>
                    {source.result_count} hits, {source.recent_count} recent. {source.note}
                  </div>
                  {source.top_title && (
                    <a href={source.top_url} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 8, textDecoration: "none", fontFamily: "'Crimson Pro',Georgia,serif", fontSize: 18, lineHeight: 1.35, color: "rgba(255,255,255,0.78)" }}>
                      {source.top_title}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel>Recent signals</SectionLabel>
            <div style={{ display: "grid", gap: 10 }}>
              {result.recent_topics.map((topic) => (
                <a key={`${topic.source}-${topic.title}`} href={topic.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", border: "1px solid rgba(255,255,255,0.05)", padding: "10px 12px", color: "inherit" }}>
                  <div style={{ fontFamily: "monospace", fontSize: 8, color: "rgba(244,90,67,0.68)", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 6 }}>{topic.source}</div>
                  <div style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 22, lineHeight: 1, letterSpacing: "0.04em", textTransform: "uppercase", color: "#fff", marginBottom: 6 }}>{topic.title}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.6, color: "rgba(255,255,255,0.26)" }}>{topic.snippet || "No summary available."}</div>
                  <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.18)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Relevance {topic.relevance_score}</div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
        <ArtifactRail title="Market scan history" artifacts={history} onLoad={onLoadHistory} />
        <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "18px 16px" }}>
          <SectionLabel>Watchlist</SectionLabel>
          {watchlist.length === 0 ? (
            <div style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.24)" }}>
              No tracked ideas yet.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {watchlist.map((item) => (
                <div key={item.id} style={{ border: "1px solid rgba(255,255,255,0.05)", padding: "12px 10px" }}>
                  <div style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 18, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em" }}>{item.label}</div>
                  <div style={{ marginTop: 4, fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.18)", letterSpacing: "0.16em", textTransform: "uppercase" }}>
                    index {item.introducing_index} | {new Date(item.created_at).toLocaleDateString("en-US")}
                  </div>
                  <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.28)" }}>{item.summary}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <SectionLabel>Likely bull candidates in seed archive</SectionLabel>
        <FeedList entries={suspicious.length ? suspicious : entries.slice(0, 3)} onSelect={onSelect} />
      </div>
    </ToolShell>
  );
}

function SubmitView({ form, setForm, loading, onSubmit, error, success, dataMode }) {
  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <ToolShell
      eyebrow="Submission intake"
      title="Let builders feed the archive."
      description="This lane opens the growth loop. Founders can submit their project, URL, and raw positioning so the editorial system has an intake queue instead of depending only on manual discovery."
      asideTitle="Queue logic"
      asideItems={["Collect project metadata", "Queue for review", "Promote accepted entries into archive", "Use submissions to train future featured picks"]}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 22 }}>
        <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "20px 18px", display: "grid", gap: 12 }}>
          <div>
            <SectionLabel color="#f45a43">Project name</SectionLabel>
            <input value={form.project_name} onChange={(event) => updateField("project_name", event.target.value)} placeholder="PenstAgent" style={{ width: "100%", background: "#09101a", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", padding: 14, fontFamily: "'Crimson Pro',Georgia,serif", fontSize: 22 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <SectionLabel>Project URL</SectionLabel>
              <input value={form.project_url} onChange={(event) => updateField("project_url", event.target.value)} placeholder="https://example.com" style={{ width: "100%", background: "#09101a", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", padding: 14, fontFamily: "monospace", fontSize: 12 }} />
            </div>
            <div>
              <SectionLabel>Contact</SectionLabel>
              <input value={form.contact} onChange={(event) => updateField("contact", event.target.value)} placeholder="email, X, Telegram" style={{ width: "100%", background: "#09101a", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", padding: 14, fontFamily: "monospace", fontSize: 12 }} />
            </div>
          </div>
          <div>
            <SectionLabel>Category hint</SectionLabel>
            <input value={form.category_hint} onChange={(event) => updateField("category_hint", event.target.value)} placeholder="agent / security / memecoin / devtool" style={{ width: "100%", background: "#09101a", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", padding: 14, fontFamily: "monospace", fontSize: 12 }} />
          </div>
          <div>
            <SectionLabel>Summary</SectionLabel>
            <textarea value={form.summary} onChange={(event) => updateField("summary", event.target.value)} maxLength={4000} placeholder="What it is, who it is for, what is differentiated, and what proof already exists." style={{ width: "100%", minHeight: 220, background: "#09101a", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.78)", padding: 16, fontSize: 14, lineHeight: 1.7, fontFamily: "'Crimson Pro',Georgia,serif" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.18)", letterSpacing: "0.12em" }}>{form.summary.length}/4000</span>
            <button onClick={onSubmit} disabled={!form.project_name.trim() || !form.summary.trim() || loading} style={{ background: form.project_name.trim() && form.summary.trim() ? "#f45a43" : "rgba(255,255,255,0.05)", border: "none", color: form.project_name.trim() && form.summary.trim() ? "#fff" : "rgba(255,255,255,0.12)", padding: "11px 24px", cursor: form.project_name.trim() && form.summary.trim() ? "pointer" : "not-allowed", fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 17, letterSpacing: "0.1em" }}>
              {loading ? "SUBMITTING" : "SUBMIT PROJECT"}
            </button>
          </div>
          {error && <div style={{ padding: 12, border: "1px solid rgba(244,90,67,0.18)", background: "rgba(244,90,67,0.06)", fontFamily: "monospace", fontSize: 10, color: "rgba(244,90,67,0.82)" }}>{error}</div>}
          {success && <div style={{ padding: 12, border: "1px solid rgba(121,217,199,0.22)", background: "rgba(121,217,199,0.06)", fontFamily: "monospace", fontSize: 10, color: "rgba(121,217,199,0.82)" }}>{success}</div>}
        </div>

        <div style={{ display: "grid", gap: 18 }}>
          <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "20px 18px" }}>
            <SectionLabel>Submission system status</SectionLabel>
            <div style={{ fontFamily: "'Crimson Pro',Georgia,serif", fontSize: 24, lineHeight: 1.38, color: "rgba(255,255,255,0.78)" }}>
              {dataMode === "shared" ? "Shared queue is live." : "Queue form is live, but shared storage is not configured yet."}
            </div>
            <div style={{ marginTop: 10, fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.28)" }}>
              {dataMode === "shared"
                ? "New submissions land in the global moderation queue."
                : "Configure Supabase to persist submissions for all users and expose a real review queue."}
            </div>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "20px 18px" }}>
            <SectionLabel>Required before auto-feature</SectionLabel>
            <div style={{ display: "grid", gap: 8 }}>
              {["Project URL or repo", "Clear one-liner", "Proof of what actually ships", "Contact for follow-up"].map((item) => (
                <div key={item} style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.3)" }}>{item}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ToolShell>
  );
}

function ReviewView({ submissions, loading, onPromote, onPromoteAndFeature, onReject, dataMode }) {
  const queued = submissions.filter((item) => !["accepted", "rejected"].includes(item.status));

  return (
    <ToolShell
      eyebrow="Review queue"
      title="Turn intake into archive entries."
      description="This is the editorial intake lane. New submissions wait here until they are either promoted into the archive or rejected for lack of proof, weak positioning, or spam."
      asideTitle="Queue actions"
      asideItems={["Review project summary", "Promote strong candidates", "Reject weak or spammy submissions", "Use promoted items as input to the digest"]}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 22 }}>
        <div style={{ display: "grid", gap: 14 }}>
          {queued.length === 0 ? (
            <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "20px 18px", fontFamily: "monospace", fontSize: 11, lineHeight: 1.7, color: "rgba(255,255,255,0.3)" }}>
              No queued submissions yet.
            </div>
          ) : (
            queued.map((submission) => (
              <div key={submission.id} style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "18px 16px", display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 28, letterSpacing: "0.04em", color: "#fff", textTransform: "uppercase" }}>{submission.project_name}</div>
                    <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                      {submission.category_hint || "uncategorized"} {submission.created_at ? `| ${new Date(submission.created_at).toLocaleDateString("en-US")}` : ""}
                    </div>
                  </div>
                  <Chip label={submission.status || "new"} color="#79d9c7" bg="rgba(121,217,199,0.08)" border="rgba(121,217,199,0.22)" />
                </div>
                <div style={{ fontFamily: "'Crimson Pro',Georgia,serif", fontSize: 20, lineHeight: 1.45, color: "rgba(255,255,255,0.74)" }}>{submission.summary}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.28)" }}>
                    Contact: {submission.contact || "none"}
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.28)" }}>
                    URL: {submission.project_url || "none"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={() => onPromote(submission)} disabled={loading} style={{ background: "#f45a43", border: "none", color: "#fff", padding: "10px 16px", cursor: "pointer", fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 15, letterSpacing: "0.08em" }}>
                    {loading ? "WORKING" : "PROMOTE TO ARCHIVE"}
                  </button>
                  <button onClick={() => onPromoteAndFeature(submission)} disabled={loading} style={{ background: "rgba(102,163,255,0.14)", border: "1px solid rgba(102,163,255,0.28)", color: "#fff", padding: "10px 14px", cursor: "pointer", fontFamily: "monospace", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                    Promote + feature today
                  </button>
                  <button onClick={() => onReject(submission)} disabled={loading} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.72)", padding: "10px 14px", cursor: "pointer", fontFamily: "monospace", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "18px 16px" }}>
            <SectionLabel>Queue status</SectionLabel>
            <div style={{ fontFamily: "'Crimson Pro',Georgia,serif", fontSize: 24, lineHeight: 1.4, color: "rgba(255,255,255,0.76)" }}>
              {dataMode === "shared" ? "Shared queue can be reviewed globally." : "Queue is local/mock until shared storage is enabled."}
            </div>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "18px 16px" }}>
            <SectionLabel>Promotion criteria</SectionLabel>
            <div style={{ display: "grid", gap: 8 }}>
              {["Clear problem statement", "Legible audience", "Actual product proof", "Not obvious spam"].map((item) => (
                <div key={item} style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, color: "rgba(255,255,255,0.28)" }}>{item}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ToolShell>
  );
}

function ArchiveView({ entries, filter, setFilter, onSelect }) {
  const filtered = filter === "all" ? entries : entries.filter((entry) => entry.novelty_verdict === filter);

  return (
    <div>
      <SectionLabel>Archive and retrieval</SectionLabel>
      <h1 style={{ margin: "0 0 8px", fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 52, letterSpacing: "0.05em", color: "#fff", textTransform: "uppercase" }}>
        Launch archive
      </h1>
      <p style={{ margin: "0 0 22px", fontFamily: "'Crimson Pro',Georgia,serif", fontSize: 22, lineHeight: 1.45, color: "rgba(255,255,255,0.68)" }}>
        Retrieval layer for profiles, verdict patterns, and future training data for the toolkit surfaces.
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {VERDICTS.map((verdict) => {
          const active = filter === verdict;
          const cfg = verdict === "all" ? { color: "#fff", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)" } : VERDICT_CFG[verdict];

          return (
            <button key={verdict} onClick={() => setFilter(verdict)} style={{ background: active ? cfg.bg : "transparent", border: `1px solid ${active ? cfg.border : "rgba(255,255,255,0.08)"}`, color: active ? cfg.color : "rgba(255,255,255,0.26)", padding: "5px 12px", cursor: "pointer", fontFamily: "monospace", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {verdict}
            </button>
          );
        })}
      </div>
      <FeedList entries={filtered} onSelect={onSelect} />
    </div>
  );
}

function ProviderPanel({ settings, setSettings }) {
  const [collapsed, setCollapsed] = useState(true);
  const [ollamaStatus, setOllamaStatus] = useState("");
  const [ollamaModels, setOllamaModels] = useState([]);
  const [checkingOllama, setCheckingOllama] = useState(false);
  const activeModelKey = `${settings.provider}Model`;
  const activeModel = settings[activeModelKey] || "";
  const summary = settings.provider === "ollama"
    ? `${settings.provider} / ${activeModel || "no model"} / ${settings.ollamaBaseUrl}`
    : `${settings.provider} / ${activeModel || "no model"}`;

  function updateSetting(key, value) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveProviderSettings(next);
      return next;
    });
  }

  async function testOllamaConnection() {
    setCheckingOllama(true);
    setOllamaStatus("");
    try {
      const models = await probeOllama(settings.ollamaBaseUrl);
      setOllamaModels(models);
      if (!models.length) {
        setOllamaStatus("Connected, but no models were returned by /api/tags.");
      } else {
        setOllamaStatus(`Connected. ${models.length} model(s) found.`);
        if (!models.includes(settings.ollamaModel)) {
          updateSetting("ollamaModel", models[0]);
        }
      }
    } catch (error) {
      setOllamaModels([]);
      setOllamaStatus(error instanceof Error ? error.message : "Could not connect to Ollama.");
    } finally {
      setCheckingOllama(false);
    }
  }

  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "14px 14px 12px", minWidth: 280, maxWidth: collapsed ? 420 : 520, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: collapsed ? 0 : 10 }}>
        <div style={{ minWidth: 0 }}>
          <SectionLabel>Provider</SectionLabel>
          <div style={{ fontFamily: "monospace", fontSize: 9, lineHeight: 1.6, color: "rgba(255,255,255,0.24)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
            {summary}
          </div>
        </div>
        <button onClick={() => setCollapsed((value) => !value)} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.72)", padding: "10px 12px", cursor: "pointer", fontFamily: "monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", flexShrink: 0 }}>
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>
      {!collapsed && <div style={{ display: "grid", gap: 10 }}>
        <select value={settings.provider} onChange={(event) => updateSetting("provider", event.target.value)} style={{ background: "#0a1018", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", padding: "10px 12px", fontFamily: "monospace", fontSize: 11 }}>
          {PROVIDER_OPTIONS.map((provider) => (
            <option key={provider} value={provider}>{provider}</option>
          ))}
        </select>
        <input value={settings[activeModelKey] || ""} onChange={(event) => updateSetting(activeModelKey, event.target.value)} placeholder="Model name" style={{ background: "#0a1018", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", padding: "10px 12px", fontFamily: "monospace", fontSize: 11 }} />
        {settings.provider === "ollama" && (
          <>
            <input value={settings.ollamaBaseUrl} onChange={(event) => updateSetting("ollamaBaseUrl", event.target.value)} placeholder="http://127.0.0.1:11434" style={{ background: "#0a1018", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", padding: "10px 12px", fontFamily: "monospace", fontSize: 11 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input value={settings.ollamaTemperature} onChange={(event) => updateSetting("ollamaTemperature", event.target.value)} placeholder="temperature" style={{ background: "#0a1018", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", padding: "10px 12px", fontFamily: "monospace", fontSize: 11 }} />
              <input value={settings.ollamaNumPredict} onChange={(event) => updateSetting("ollamaNumPredict", event.target.value)} placeholder="num_predict" style={{ background: "#0a1018", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", padding: "10px 12px", fontFamily: "monospace", fontSize: 11 }} />
            </div>
            <button onClick={testOllamaConnection} disabled={checkingOllama} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.72)", padding: "10px 12px", cursor: "pointer", fontFamily: "monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em" }}>
              {checkingOllama ? "Checking..." : "Test connection"}
            </button>
            {ollamaModels.length > 0 && (
              <select value={settings.ollamaModel} onChange={(event) => updateSetting("ollamaModel", event.target.value)} style={{ background: "#0a1018", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", padding: "10px 12px", fontFamily: "monospace", fontSize: 11 }}>
                {ollamaModels.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            )}
            {ollamaStatus && (
              <div style={{ fontFamily: "monospace", fontSize: 9, lineHeight: 1.6, color: ollamaStatus.startsWith("Connected") ? "rgba(121,217,199,0.72)" : "rgba(244,90,67,0.82)" }}>
                {ollamaStatus}
              </div>
            )}
          </>
        )}
        <div style={{ fontFamily: "monospace", fontSize: 9, lineHeight: 1.6, color: "rgba(255,255,255,0.24)" }}>
          Cloud providers use server env keys. Ollama is called from the browser so the user can point to a local or home-hosted model endpoint.
        </div>
      </div>}
    </div>
  );
}

export default function App() {
  const [entries, setEntries] = useState([]);
  const [featured, setFeatured] = useState(null);
  const [featuredMeta, setFeaturedMeta] = useState(null);
  const [digestPlan, setDigestPlan] = useState({});
  const [view, setView] = useState("digest");
  const [filter, setFilter] = useState("all");
  const [dataMode, setDataMode] = useState("local");
  const [providerSettings, setProviderSettings] = useState(() => loadProviderSettings());
  const [launchInput, setLaunchInput] = useState("");
  const [launchResult, setLaunchResult] = useState(null);
  const [gutCheckInput, setGutCheckInput] = useState("");
  const [gutCheckResult, setGutCheckResult] = useState(null);
  const [bullInput, setBullInput] = useState("");
  const [bullResult, setBullResult] = useState(null);
  const [artifacts, setArtifacts] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [submissionForm, setSubmissionForm] = useState({ project_name: "", project_url: "", contact: "", category_hint: "", summary: "" });
  const [submissions, setSubmissions] = useState([]);
  const [monitorItems, setMonitorItems] = useState([]);
  const [monitorSnapshots, setMonitorSnapshots] = useState([]);
  const [monitorMode, setMonitorMode] = useState("mock");
  const [monitorSources, setMonitorSources] = useState([]);
  const [monitorStats, setMonitorStats] = useState({ raw_count: 0, deduped_count: 0 });
  const [submissionLoading, setSubmissionLoading] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [submissionSuccess, setSubmissionSuccess] = useState("");
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState("");
  const [errorByMode, setErrorByMode] = useState({ launch: null, "gut-check": null, bull: null });

  useEffect(() => {
    boot();
  }, []);

  async function boot() {
    const localDigestPlan = await loadDigestPlanFromStorage();
    setDigestPlan(localDigestPlan && typeof localDigestPlan === "object" ? localDigestPlan : {});
    const localArtifacts = await loadArtifactsFromStorage();
    setArtifacts(Array.isArray(localArtifacts) ? localArtifacts : []);
    const localWatchlist = await loadWatchlistFromStorage();
    setWatchlist(Array.isArray(localWatchlist) ? localWatchlist : []);

    const localSubmissions = await loadSubmissionsFromStorage();
    setSubmissions(Array.isArray(localSubmissions) ? localSubmissions : []);
    const localMonitorItems = await loadMonitorItemsFromStorage();
    setMonitorItems(Array.isArray(localMonitorItems) ? localMonitorItems : []);
    const localMonitorSnapshots = await loadMonitorSnapshotsFromStorage();
    setMonitorSnapshots(Array.isArray(localMonitorSnapshots) ? localMonitorSnapshots : []);

    try {
      const remoteSubmissions = await loadSubmissionsFromApi();
      if (Array.isArray(remoteSubmissions?.submissions)) {
        setSubmissions(remoteSubmissions.submissions);
        if (remoteSubmissions.sharedDatabase) {
          setDataMode("shared");
        }
      }
    } catch {}

    try {
      const remote = await loadEntriesFromApi();
      if (Array.isArray(remote?.entries) && remote.entries.length > 0) {
        const resolved = resolveFeaturedSelection(
          remote.entries,
          remote.featured || remote.entries[0],
          remote.featuredMeta || null,
          localDigestPlan,
          Boolean(remote.sharedDatabase),
        );
        setEntries(remote.entries);
        setFeatured(resolved.featured);
        setFeaturedMeta(resolved.featuredMeta);
        setDataMode(remote.sharedDatabase ? "shared" : "seed");
        await saveToStorage(remote.entries);
        return;
      }
    } catch {}

    const stored = await loadFromStorage();
    const safeEntries = sanitizeStoredEntries(stored);

    if (safeEntries.length > 0) {
      const resolved = resolveFeaturedSelection(safeEntries, safeEntries[0], {
        mode: "local-fallback",
        date: todayKey(),
        source: "local-storage",
      }, localDigestPlan, false);
      setEntries(safeEntries);
      setFeatured(resolved.featured);
      setFeaturedMeta(resolved.featuredMeta);
      setDataMode("local");
      return;
    }

    const resolvedSeed = resolveFeaturedSelection(SEED, SEED[0], {
      mode: "seed-fallback",
      date: todayKey(),
      source: "seed",
    }, localDigestPlan, false);
    setEntries(SEED);
    setFeatured(resolvedSeed.featured);
    setFeaturedMeta(resolvedSeed.featuredMeta);
    setDataMode("seed");
    await saveToStorage(SEED);
  }

  async function scheduleFeaturedEntry(entry) {
    const today = todayKey();
    const nextPlan = {
      ...digestPlan,
      [today]: {
        entryId: entry.id,
        date: today,
      },
    };
    setDigestPlan(nextPlan);
    await saveDigestPlanToStorage(nextPlan);
    setFeatured(entry);
    setFeaturedMeta({
      mode: "scheduled-local",
      date: today,
      source: "digest-plan",
    });
  }

  async function recordArtifact(mode, input, result) {
    const label =
      mode === "launch"
        ? result?.headline || result?.one_liner || "Untitled launch package"
        : result?.verdict || "Untitled gut-check";

    const summary =
      mode === "launch"
        ? result?.launch_post?.slice(0, 180) || result?.one_liner || ""
        : mode === "gut-check"
          ? result?.market_pitch?.slice(0, 180) || result?.verdict || ""
          : result?.market_verdict?.slice(0, 180) || result?.positioning_take?.slice(0, 180) || "";

    const nextArtifact = {
      id: crypto.randomUUID(),
      mode,
      label,
      summary,
      input,
      result,
      created_at: new Date().toISOString(),
    };

    const nextArtifacts = [nextArtifact, ...artifacts].slice(0, 24);
    setArtifacts(nextArtifacts);
    await saveArtifactsToStorage(nextArtifacts);
  }

  async function addBullToWatchlist() {
    if (!bullResult || !bullInput.trim()) return;

    const nextItem = {
      id: crypto.randomUUID(),
      label: bullInput.trim().slice(0, 80),
      summary: bullResult.market_verdict || bullResult.positioning_take || "",
      introducing_index: bullResult.introducing_index,
      input: bullInput,
      result: bullResult,
      created_at: new Date().toISOString(),
    };

    const nextWatchlist = [nextItem, ...watchlist.filter((item) => item.input !== nextItem.input)].slice(0, 20);
    setWatchlist(nextWatchlist);
    await saveWatchlistToStorage(nextWatchlist);
  }

  async function addEntry(entry, options = {}) {
    const safeEntry = normalizeEntry(entry);
    let nextEntry = { ...safeEntry, id: Date.now(), date: new Date().toISOString() };

    try {
      nextEntry = await createEntryOnApi(safeEntry);
      if (!nextEntry?.local_only) {
        setDataMode("shared");
      }
    } catch {}

    const updated = [nextEntry, ...entries.filter((item) => item.id !== nextEntry.id)];
    setEntries(updated);
    if (options.featureToday) {
      await scheduleFeaturedEntry(nextEntry);
    } else {
      setFeatured(nextEntry);
      setFeaturedMeta({
        mode: nextEntry?.local_only ? "local-fallback" : "manual-add",
        date: todayKey(),
        source: nextEntry?.local_only ? "local" : "entries",
      });
    }
    await saveToStorage(updated);
    return nextEntry;
  }

  async function submitProject() {
    if (!submissionForm.project_name.trim() || !submissionForm.summary.trim() || submissionLoading) return;

    setSubmissionLoading(true);
    setSubmissionError("");
    setSubmissionSuccess("");

    try {
      const created = await createSubmissionOnApi(submissionForm);
      if (created?.local_only) {
        const nextSubmissions = [{ ...created, status: "new" }, ...submissions];
        setSubmissions(nextSubmissions);
        await saveSubmissionsToStorage(nextSubmissions);
      } else {
        setSubmissions((prev) => [created, ...prev]);
      }
      setSubmissionSuccess(
        created?.local_only
          ? "Submission captured locally. Configure Supabase to turn this into a shared moderation queue."
          : "Submission queued. The project is now in the shared intake pipeline.",
      );
      setSubmissionForm({ project_name: "", project_url: "", contact: "", category_hint: "", summary: "" });
      if (!created?.local_only) {
        setDataMode("shared");
      }
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Could not submit this project.");
    } finally {
      setSubmissionLoading(false);
    }
  }

  async function runMonitorSweep() {
    if (monitorLoading) return;
    setMonitorLoading(true);
    try {
      let sweep = [];
      let nextMode = "mock";
      let nextSources = [];
      let nextStats = { raw_count: 0, deduped_count: 0 };
      try {
        const realSweep = await runRealMonitorSweep();
        if (Array.isArray(realSweep?.items) && realSweep.items.length > 0) {
          sweep = realSweep.items;
          nextMode = realSweep.mode || "real";
          nextSources = Array.isArray(realSweep.sources) ? realSweep.sources : [];
          nextStats = {
            raw_count: Number(realSweep.raw_count || realSweep.items.length),
            deduped_count: Number(realSweep.deduped_count || realSweep.items.length),
          };
        }
      } catch {}

      if (sweep.length === 0) {
        sweep = buildMockMonitorSweep(new Date());
        nextMode = "mock";
        nextSources = [
          { source: "GitHub", ok: false, count: 0, error: "mock fallback" },
          { source: "Hacker News", ok: false, count: 0, error: "mock fallback" },
          { source: "Reddit", ok: false, count: 0, error: "mock fallback" },
        ];
        nextStats = {
          raw_count: sweep.length,
          deduped_count: sweep.length,
        };
      }

      setMonitorMode(nextMode);
      setMonitorSources(nextSources);
      setMonitorStats(nextStats);
      setMonitorItems(sweep);
      await saveMonitorItemsToStorage(sweep);

      const nextSnapshot = {
        id: crypto.randomUUID(),
        mode: "monitor-snapshot",
        label: `${nextMode === "real" ? "Real" : "Mock"} sweep ${todayKey()}`,
        summary: `${sweep.length} candidates captured in ${nextMode === "real" ? "real" : "fallback"} mode.`,
        created_at: new Date().toISOString(),
        result: {
          items: sweep,
          mode: nextMode,
          sources: nextSources,
          stats: nextStats,
        },
      };
      const nextSnapshots = [nextSnapshot, ...monitorSnapshots].slice(0, 20);
      setMonitorSnapshots(nextSnapshots);
      await saveMonitorSnapshotsToStorage(nextSnapshots);
    } finally {
      setMonitorLoading(false);
    }
  }

  async function queueMonitorItem(item) {
    if (!item || item.queue_status === "queued" || submissionLoading) return;

    const nextSubmission = {
      project_name: item.project_name,
      project_url: item.url,
      contact: item.author,
      category_hint: item.category_hint,
      summary: item.summary,
    };

    setSubmissionLoading(true);
    setSubmissionError("");
    setSubmissionSuccess("");

    try {
      const created = await createSubmissionOnApi(nextSubmission);
      const normalizedCreated = created?.local_only ? { ...created, status: "new" } : created;
      const nextSubmissions = [normalizedCreated, ...submissions];
      setSubmissions(nextSubmissions);
      await saveSubmissionsToStorage(nextSubmissions);

      const updatedMonitor = monitorItems.map((entry) => (
        entry.id === item.id ? { ...entry, queue_status: "queued" } : entry
      ));
      setMonitorItems(updatedMonitor);
      await saveMonitorItemsToStorage(updatedMonitor);

      if (!created?.local_only) {
        setDataMode("shared");
      }

      setSubmissionSuccess("Discovery item sent to the review queue.");
      setView("review");
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Could not queue discovery item.");
    } finally {
      setSubmissionLoading(false);
    }
  }

  async function updateSubmissionState(id, patch) {
    let updated;
    try {
      updated = await updateSubmissionOnApi(id, patch);
      if (!updated?.local_only) {
        setDataMode("shared");
      }
    } catch {
      updated = { id, ...patch, local_only: true, updated_at: new Date().toISOString() };
    }

    const next = submissions.map((item) => (item.id === id ? { ...item, ...updated } : item));
    setSubmissions(next);
    await saveSubmissionsToStorage(next);
    return next.find((item) => item.id === id) || updated;
  }

  async function promoteSubmission(submission) {
    if (!submission || submissionLoading) return;
    setSubmissionLoading(true);
    setSubmissionError("");
    setSubmissionSuccess("");

    try {
      await addEntry(buildEntryFromSubmission(submission));
      await updateSubmissionState(submission.id, { status: "accepted" });
      setSubmissionSuccess("Submission promoted into the archive.");
      setView("archive");
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Could not promote submission.");
    } finally {
      setSubmissionLoading(false);
    }
  }

  async function promoteAndFeatureSubmission(submission) {
    if (!submission || submissionLoading) return;
    setSubmissionLoading(true);
    setSubmissionError("");
    setSubmissionSuccess("");

    try {
      await addEntry(buildEntryFromSubmission(submission), { featureToday: true });
      await updateSubmissionState(submission.id, { status: "accepted" });
      setSubmissionSuccess("Submission promoted and scheduled as today's featured item.");
      setView("digest");
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Could not promote and feature submission.");
    } finally {
      setSubmissionLoading(false);
    }
  }

  async function rejectSubmission(submission) {
    if (!submission || submissionLoading) return;
    setSubmissionLoading(true);
    setSubmissionError("");
    setSubmissionSuccess("");

    try {
      await updateSubmissionState(submission.id, { status: "rejected" });
      setSubmissionSuccess("Submission rejected from the queue.");
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Could not reject submission.");
    } finally {
      setSubmissionLoading(false);
    }
  }

  async function runMode(mode, rawInput) {
    if (!rawInput.trim() || loadingMode) return;

    setLoadingMode(mode);
    setErrorByMode((prev) => ({ ...prev, [mode]: null }));

    try {
      let result;

      if (mode === "bull") {
        const res = await fetch("/api/market-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: rawInput }),
        });

        const data = await readJsonResponse(res, "Market scan returned an invalid response.");
        if (!res.ok) throw new Error(data?.error || "Could not scan the market right now.");
        result = data.result;
      } else if (providerSettings.provider === "ollama") {
        const rawResponse = await runOllamaAnalysis({ mode, input: rawInput, providerSettings });
        const parsed = extractJsonObject(rawResponse);
        if (mode === "launch") result = normalizeLaunchPackage(parsed);
        else result = normalizeGutCheck(parsed);
      } else {
        const modelKey = `${providerSettings.provider}Model`;
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: rawInput, mode, provider: providerSettings.provider, model: providerSettings[modelKey] }),
        });

        const data = await readJsonResponse(res, "Analyze endpoint returned an invalid response.");
        if (!res.ok) throw new Error(data?.error || "Could not process that request right now.");

        if (mode === "launch") result = normalizeLaunchPackage(data.result);
        else result = normalizeGutCheck(data.result);
      }

      if (mode === "launch") {
        setLaunchResult(result);
        await recordArtifact("launch", rawInput, result);
      } else if (mode === "gut-check") {
        setGutCheckResult(result);
        await recordArtifact("gut-check", rawInput, result);
      } else if (mode === "bull") {
        setBullResult(result);
        await recordArtifact("bull", rawInput, result);
      } else {
        await addEntry(result);
        setView("digest");
      }

      setErrorByMode((prev) => ({ ...prev, [mode]: null }));
    } catch (err) {
      setErrorByMode((prev) => ({ ...prev, [mode]: err instanceof Error ? err.message : "Could not process this request." }));
    } finally {
      setLoadingMode("");
    }
  }

  const activeView = (() => {
    if (view === "digest") return <DigestView entries={entries} featured={featured} featuredMeta={featuredMeta} onSelect={(entry) => { setFeatured(entry); setFeaturedMeta({ mode: "manual-view", date: entry?.date || new Date().toISOString(), source: "archive" }); }} setView={setView} />;
    if (view === "monitor") return <MonitorView items={monitorItems} loading={monitorLoading || submissionLoading} onSweep={runMonitorSweep} onQueueToReview={queueMonitorItem} monitorMode={monitorMode} monitorSources={monitorSources} monitorStats={monitorStats} snapshots={monitorSnapshots} onLoadSnapshot={(artifact) => {
      setMonitorItems(artifact?.result?.items || []);
      setMonitorMode(artifact?.result?.mode || "mock");
      setMonitorSources(artifact?.result?.sources || []);
      setMonitorStats(artifact?.result?.stats || { raw_count: 0, deduped_count: 0 });
    }} />;
    if (view === "launch") return <LaunchView input={launchInput} setInput={setLaunchInput} loading={loadingMode === "launch"} analyze={() => runMode("launch", launchInput)} error={errorByMode.launch} result={launchResult} history={artifacts.filter((item) => item.mode === "launch")} onLoadHistory={(artifact) => { setLaunchInput(artifact.input || ""); setLaunchResult(artifact.result || null); }} />;
    if (view === "gut-check") return <GutCheckView entries={entries} input={gutCheckInput} setInput={setGutCheckInput} loading={loadingMode === "gut-check"} analyze={() => runMode("gut-check", gutCheckInput)} error={errorByMode["gut-check"]} result={gutCheckResult} history={artifacts.filter((item) => item.mode === "gut-check")} onLoadHistory={(artifact) => { setGutCheckInput(artifact.input || ""); setGutCheckResult(artifact.result || null); }} />;
    if (view === "bull") return <BullView entries={entries} setView={setView} onSelect={(entry) => { setFeatured(entry); setFeaturedMeta({ mode: "manual-view", date: entry?.date || new Date().toISOString(), source: "archive" }); setView("digest"); }} input={bullInput} setInput={setBullInput} loading={loadingMode === "bull"} analyze={() => runMode("bull", bullInput)} error={errorByMode.bull} result={bullResult} history={artifacts.filter((item) => item.mode === "bull")} watchlist={watchlist} onLoadHistory={(artifact) => { setBullInput(artifact.input || ""); setBullResult(artifact.result || null); }} onSaveWatchlist={addBullToWatchlist} />;
    if (view === "submit") return <SubmitView form={submissionForm} setForm={setSubmissionForm} loading={submissionLoading} onSubmit={submitProject} error={submissionError} success={submissionSuccess} dataMode={dataMode} />;
    if (view === "review") return <ReviewView submissions={submissions} loading={submissionLoading} onPromote={promoteSubmission} onPromoteAndFeature={promoteAndFeatureSubmission} onReject={rejectSubmission} dataMode={dataMode} />;
    return <ArchiveView entries={entries} filter={filter} setFilter={setFilter} onSelect={(entry) => { setFeatured(entry); setFeaturedMeta({ mode: "manual-view", date: entry?.date || new Date().toISOString(), source: "archive" }); setView("digest"); }} />;
  })();

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#04070c 0%,#06070b 100%)", color: "#fff", fontFamily: "system-ui,sans-serif", position: "relative" }}>
      <Grain />
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        button,textarea{outline:none}
        textarea:focus{border-color:rgba(102,163,255,0.4)}
        ::-webkit-scrollbar{width:6px}
        ::-webkit-scrollbar-thumb{background:rgba(244,90,67,0.24)}
      `}</style>

      <header style={{ position: "sticky", top: 0, zIndex: 60, backdropFilter: "blur(18px)", background: "rgba(5,8,12,0.9)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 28, color: "#fff", letterSpacing: "0.12em", lineHeight: 1 }}>
              INTRODUCING
            </div>
            <span style={{ fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.16)", letterSpacing: "0.18em", textTransform: "uppercase" }}>
              Journal + toolkit for agent launches
            </span>
          </div>

          <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {NAV_ITEMS.map((item) => (
              <button
                key={item}
                onClick={() => setView(item)}
                style={{ background: view === item ? "rgba(244,90,67,0.10)" : "transparent", border: `1px solid ${view === item ? "rgba(244,90,67,0.22)" : "transparent"}`, color: view === item ? "#fff" : "rgba(255,255,255,0.3)", padding: "8px 12px", cursor: "pointer", fontFamily: "monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em" }}
              >
                {item}
              </button>
            ))}
          </nav>
          <ProviderPanel settings={providerSettings} setSettings={setProviderSettings} />
        </div>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px 12px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "monospace", fontSize: 8, color: dataMode === "shared" ? "rgba(121,217,199,0.78)" : "rgba(255,255,255,0.24)", letterSpacing: "0.16em", textTransform: "uppercase" }}>
            {dataMode === "shared" ? "Shared archive live" : dataMode === "seed" ? "Seed archive fallback" : "Local archive fallback"}
          </span>
          <span style={{ fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.18)", letterSpacing: "0.16em", textTransform: "uppercase" }}>
            Featured updates become global when Supabase is connected
          </span>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 20px 56px", position: "relative", zIndex: 1 }}>
        {activeView}
      </main>

      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.04)", padding: "18px 20px 26px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: 13, color: "rgba(255,255,255,0.08)", letterSpacing: "0.12em" }}>INTRODUCING.LIFE</span>
          <span style={{ fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.12)", letterSpacing: "0.16em", textTransform: "uppercase" }}>
            Phase 1 shared archive foundation
          </span>
        </div>
      </footer>
    </div>
  );
}
