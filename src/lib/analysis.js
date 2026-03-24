export const MAX_INPUT_CHARS = 12000;
export const ANALYSIS_MODES = ["digest", "launch", "gut-check"];
export const VALID_CATEGORIES = ["agent", "tool", "app", "infra", "framework", "other"];
export const VALID_VERDICTS = ["Genuinely New", "Solid Execution", "Repackaged", "Vaporware"];

function asTrimmedString(value, maxLength, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function asList(value, maxItems = 6, maxLength = 120) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const cleaned = [];

  for (const item of value) {
    const normalized = asTrimmedString(item, maxLength);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(normalized);
    if (cleaned.length >= maxItems) break;
  }

  return cleaned;
}

function asScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(10, Math.round(numeric)));
}

function firstNonEmpty(values, maxLength, fallback = "") {
  for (const value of values) {
    const normalized = asTrimmedString(value, maxLength);
    if (normalized) return normalized;
  }
  return fallback;
}

function threadFromText(text) {
  const normalized = asTrimmedString(text, 900);
  if (!normalized) return [];

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);

  return sentences.length ? sentences : [normalized];
}

export function extractJsonObject(rawText) {
  if (typeof rawText !== "string") {
    throw new Error("Model response was not text.");
  }

  const cleaned = rawText.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model response did not contain a JSON object.");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

export function buildSystemPrompt(mode) {
  if (mode === "launch") {
    return `You are INTRODUCING's launch writer. You take raw product inputs and turn them into launch assets for builders shipping agents, tools, or internet products.

Be sharp, concise, and useful. Avoid cringe hype. Preserve the core idea while making it more legible and marketable.

Return ONLY valid JSON:
{
  "headline": "A clear launch headline",
  "one_liner": "One sentence on what it is",
  "target_audience": "Who should care first",
  "launch_post": "A launch post for X/Twitter",
  "x_thread": ["Tweet 1", "Tweet 2", "Tweet 3"],
  "normie_explainer": "Plain-English explanation",
  "web3_angle": "Rewrite in a web3-native tone without sounding fake",
  "proof_gaps": ["What proof is missing", "Another missing proof"],
  "cta": "Best call to action"
}`;
  }

  if (mode === "gut-check") {
    return `You are INTRODUCING's market gut-checker. You review raw product ideas before launch.

Be honest and commercially useful. Identify what is differentiated, what is weak, and what the market-facing pitch should be.

Return ONLY valid JSON:
{
  "verdict": "One-line summary of the market truth",
  "market_pitch": "The actual pitch that should be used",
  "competition_map": ["Closest comparable", "Another comparable"],
  "strengths": ["Real strength", "Another strength"],
  "failure_modes": ["Likely failure mode", "Another failure mode"],
  "missing_proof": ["What must be proven", "Another proof gap"],
  "next_move": "Best immediate next step before launching"
}`;
  }

  if (mode === "bull") {
    return `You are INTRODUCING's bullshit detector for launch posts.

You score whether a launch is actually new, merely well-packaged, or basically marketing theater. Be direct, specific, and useful.

Return ONLY valid JSON:
{
  "verdict": "One of: Genuinely New, Solid Execution, Repackaged, Vaporware",
  "novelty_score": 7,
  "why_it_hits": "Why the post will get attention",
  "whats_real": "What seems substantively real",
  "whats_hype": "What reads like packaging or inflation",
  "honest_version": "A rewritten version of the post that is more honest",
  "receipts_needed": ["What proof would be needed", "Another proof request"]
}`;
  }

  return `You are the editorial engine behind INTRODUCING - a daily digest and intelligence layer for the agentic internet. You receive raw launch posts from developers and return structured journalistic profiles.

Be sharp, honest, and opinionated. You are not a hype machine. You celebrate genuine innovation and call out repackaging.

Return ONLY a valid JSON object:
{
  "project_name": "Name of the thing being introduced",
  "one_liner": "One sentence that explains what it does to a non-technical person",
  "what_it_does": "2-3 sentence clear explanation of the product or tool or agent",
  "who_built_it": "Author name or handle if detectable, otherwise Unknown",
  "category": "one of: agent, tool, app, infra, framework, other",
  "tech_stack": ["list", "of", "technologies"],
  "novelty_score": 7,
  "novelty_verdict": "one of: Genuinely New, Solid Execution, Repackaged, Vaporware",
  "novelty_reasoning": "1-2 sentences on why you gave that score",
  "hook": "The one sentence someone would screenshot from this launch",
  "missing": "What is not being said? What question does this raise?",
  "editorial_note": "A sharp journalistic 1-sentence take"
}`;
}

export function normalizeEntry(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("Entry payload must be an object.");
  }

  const category = VALID_CATEGORIES.includes(candidate.category) ? candidate.category : "other";
  const noveltyVerdict = VALID_VERDICTS.includes(candidate.novelty_verdict) ? candidate.novelty_verdict : "Solid Execution";

  const normalized = {
    project_name: asTrimmedString(candidate.project_name, 80),
    one_liner: asTrimmedString(candidate.one_liner, 220),
    what_it_does: asTrimmedString(candidate.what_it_does, 600),
    who_built_it: asTrimmedString(candidate.who_built_it, 80, "Unknown") || "Unknown",
    category,
    tech_stack: asList(candidate.tech_stack, 8, 40),
    novelty_score: asScore(candidate.novelty_score),
    novelty_verdict: noveltyVerdict,
    novelty_reasoning: asTrimmedString(candidate.novelty_reasoning, 300),
    hook: asTrimmedString(candidate.hook, 220),
    missing: asTrimmedString(candidate.missing, 300),
    editorial_note: asTrimmedString(candidate.editorial_note, 280),
  };

  if (!normalized.project_name || !normalized.one_liner || !normalized.what_it_does) {
    throw new Error("Model response is missing required entry fields.");
  }

  return normalized;
}

export function normalizeLaunchPackage(candidate) {
  const launchPost = firstNonEmpty(
    [candidate?.launch_post, candidate?.post, candidate?.announcement, candidate?.copy],
    900,
  );

  const oneLiner = firstNonEmpty(
    [candidate?.one_liner, candidate?.summary, candidate?.description, candidate?.target_audience],
    220,
  );

  const headline = firstNonEmpty(
    [candidate?.headline, candidate?.title, candidate?.project_name, candidate?.name, oneLiner],
    100,
  );

  const thread = asList(candidate?.x_thread, 6, 280);
  const fallbackThread = thread.length ? thread : threadFromText(launchPost);

  const normalized = {
    headline,
    one_liner: oneLiner,
    target_audience: firstNonEmpty([candidate?.target_audience, candidate?.audience], 180),
    launch_post: launchPost,
    x_thread: fallbackThread,
    normie_explainer: firstNonEmpty([candidate?.normie_explainer, candidate?.plain_english, candidate?.what_it_is], 500),
    web3_angle: firstNonEmpty([candidate?.web3_angle, candidate?.crypto_angle, candidate?.degen_version], 500),
    proof_gaps: asList(candidate?.proof_gaps || candidate?.missing_proof, 6, 160),
    cta: firstNonEmpty([candidate?.cta, candidate?.call_to_action], 180),
  };

  if (!normalized.headline || !normalized.launch_post || normalized.x_thread.length === 0) {
    throw new Error("Model response is missing required launch fields.");
  }

  return normalized;
}

export function normalizeGutCheck(candidate) {
  const normalized = {
    verdict: firstNonEmpty([candidate?.verdict, candidate?.summary], 180),
    market_pitch: firstNonEmpty([candidate?.market_pitch, candidate?.pitch, candidate?.repositioning], 320),
    competition_map: asList(candidate?.competition_map, 6, 120),
    strengths: asList(candidate?.strengths || candidate?.pros, 6, 140),
    failure_modes: asList(candidate?.failure_modes || candidate?.risks, 6, 160),
    missing_proof: asList(candidate?.missing_proof || candidate?.proof_gaps, 6, 160),
    next_move: firstNonEmpty([candidate?.next_move, candidate?.next_step], 220),
  };

  if (!normalized.verdict || !normalized.market_pitch) {
    throw new Error("Model response is missing required gut-check fields.");
  }

  return normalized;
}

export function normalizeBullCheck(candidate) {
  const normalized = {
    verdict: VALID_VERDICTS.includes(candidate?.verdict) ? candidate.verdict : "Solid Execution",
    novelty_score: asScore(candidate?.novelty_score),
    why_it_hits: firstNonEmpty([candidate?.why_it_hits, candidate?.hook_reason], 280),
    whats_real: firstNonEmpty([candidate?.whats_real, candidate?.substance], 320),
    whats_hype: firstNonEmpty([candidate?.whats_hype, candidate?.overreach], 320),
    honest_version: firstNonEmpty([candidate?.honest_version, candidate?.rewrite], 500),
    receipts_needed: asList(candidate?.receipts_needed || candidate?.proof_needed, 6, 160),
  };

  if (!normalized.why_it_hits || !normalized.honest_version) {
    throw new Error("Model response is missing required bull-check fields.");
  }

  return normalized;
}

export function normalizeModePayload(mode, candidate) {
  if (mode === "launch") return normalizeLaunchPackage(candidate);
  if (mode === "gut-check") return normalizeGutCheck(candidate);
  if (mode === "bull") return normalizeBullCheck(candidate);
  return normalizeEntry(candidate);
}

export function sanitizeStoredEntries(candidate) {
  if (!Array.isArray(candidate)) return [];

  return candidate
    .map((entry) => {
      try {
        const normalized = normalizeEntry(entry);
        return {
          ...normalized,
          id: Number.isFinite(Number(entry?.id)) ? Number(entry.id) : Date.now(),
          date: typeof entry?.date === "string" ? entry.date : new Date().toISOString(),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
