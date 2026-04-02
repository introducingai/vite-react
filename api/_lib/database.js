import { normalizeEntry } from "../../src/lib/analysis.js";
import { SEED } from "../../src/lib/seedEntries.js";

const ENTRY_COLUMNS = [
  "id",
  "date",
  "project_name",
  "one_liner",
  "what_it_does",
  "who_built_it",
  "category",
  "tech_stack",
  "novelty_score",
  "novelty_verdict",
  "novelty_reasoning",
  "hook",
  "missing",
  "editorial_note",
].join(",");

const AUDIT_LOG_COLUMNS = [
  "id",
  "created_at",
  "action",
  "actor_type",
  "actor_email",
  "actor_role",
  "target_type",
  "target_id",
  "metadata",
].join(",");

function normalizeUrl(value) {
  return typeof value === "string" ? value.replace(/\/+$/, "") : "";
}

export function isDatabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabaseConfig() {
  const url = normalizeUrl(process.env.SUPABASE_URL);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceRoleKey) {
    throw new Error("Shared database is not configured.");
  }

  return { url, serviceRoleKey };
}

async function supabaseRequest(path, { method = "GET", body } = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const rawText = await response.text();
  const payload = rawText ? JSON.parse(rawText) : null;

  if (!response.ok) {
    throw new Error(payload?.message || payload?.hint || "Supabase request failed.");
  }

  return payload;
}

function mapEntry(record) {
  const normalized = normalizeEntry({
    ...record,
    tech_stack: Array.isArray(record?.tech_stack) ? record.tech_stack : [],
  });

  return {
    ...normalized,
    id: record?.id || crypto.randomUUID(),
    date: typeof record?.date === "string" ? record.date : new Date().toISOString(),
  };
}

function scoreDailyCandidate(entry) {
  const noveltyBoost = Number(entry?.novelty_score || 0) * 12;
  const verdictBoost =
    entry?.novelty_verdict === "Genuinely New"
      ? 18
      : entry?.novelty_verdict === "Solid Execution"
        ? 9
        : entry?.novelty_verdict === "Repackaged"
          ? -4
          : -10;
  const categoryBoost = entry?.category === "agent" ? 6 : entry?.category === "infra" ? 4 : 0;
  return noveltyBoost + verdictBoost + categoryBoost;
}

function daySeed(date = new Date()) {
  return Number(date.toISOString().slice(0, 10).replace(/-/g, ""));
}

function pickDailyFeature(entries, date = new Date()) {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const ranked = [...entries]
    .map((entry) => ({ entry, score: scoreDailyCandidate(entry) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(5, entries.length));

  const index = daySeed(date) % ranked.length;
  return ranked[index]?.entry || ranked[0]?.entry || null;
}

export async function listEntries() {
  if (!isDatabaseConfigured()) {
    const featured = pickDailyFeature(SEED);
    return {
      entries: SEED,
      featured,
      featuredMeta: {
        mode: "daily-auto",
        date: new Date().toISOString().slice(0, 10),
        source: "seed",
      },
      dataSource: "seed",
      sharedDatabase: false,
    };
  }

  const records = await supabaseRequest(`entries?select=${ENTRY_COLUMNS}&order=date.desc&limit=50`);
  const entries = Array.isArray(records) ? records.map(mapEntry) : [];

  let featured = pickDailyFeature(entries);
  let featuredMeta = {
    mode: "daily-auto",
    date: new Date().toISOString().slice(0, 10),
    source: "supabase-fallback",
  };
  try {
    const today = new Date().toISOString().slice(0, 10);
    const featureRows = await supabaseRequest(
      `daily_features?select=feature_date,entries(${ENTRY_COLUMNS})&feature_date=eq.${today}&limit=1`,
    );
    const featureRecord = Array.isArray(featureRows) ? featureRows[0]?.entries : null;
    if (featureRecord) {
      featured = mapEntry(featureRecord);
      featuredMeta = {
        mode: "scheduled",
        date: today,
        source: "daily_features",
      };
    }
  } catch {}

  return {
    entries,
    featured,
    featuredMeta,
    dataSource: "supabase",
    sharedDatabase: true,
  };
}

export async function createEntry(entry) {
  const normalized = normalizeEntry(entry);

  if (!isDatabaseConfigured()) {
    return {
      ...normalized,
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      local_only: true,
    };
  }

  const [inserted] = await supabaseRequest(`entries?select=${ENTRY_COLUMNS}`, {
    method: "POST",
    body: {
      ...normalized,
      date: new Date().toISOString(),
    },
  });

  if (!inserted?.id) {
    throw new Error("Entry insert did not return an id from Supabase.");
  }

  return mapEntry(inserted);
}

export async function createAuditLog(event) {
  const payload = {
    action: typeof event?.action === "string" ? event.action.trim().slice(0, 120) : "",
    actor_type: typeof event?.actorType === "string" ? event.actorType.trim().slice(0, 60) : "",
    actor_email: typeof event?.actorEmail === "string" ? event.actorEmail.trim().slice(0, 180) : "",
    actor_role: typeof event?.actorRole === "string" ? event.actorRole.trim().slice(0, 60) : "",
    target_type: typeof event?.targetType === "string" ? event.targetType.trim().slice(0, 60) : "",
    target_id: typeof event?.targetId === "string" ? event.targetId.trim().slice(0, 120) : "",
    metadata: event?.metadata && typeof event.metadata === "object" ? event.metadata : {},
  };

  if (!payload.action) {
    throw new Error("Audit action is required.");
  }

  if (!isDatabaseConfigured()) {
    return {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...payload,
      local_only: true,
    };
  }

  const [inserted] = await supabaseRequest("audit_logs?select=*", {
    method: "POST",
    body: payload,
  });

  return inserted;
}

export async function listAuditLogs(limit = 50) {
  const maxRows = Number.isFinite(limit) ? Math.max(1, Math.min(Number(limit), 200)) : 50;

  if (!isDatabaseConfigured()) {
    return {
      auditLogs: [],
      sharedDatabase: false,
      dataSource: "local",
    };
  }

  const rows = await supabaseRequest(`audit_logs?select=${AUDIT_LOG_COLUMNS}&order=created_at.desc&limit=${maxRows}`);
  return {
    auditLogs: Array.isArray(rows) ? rows : [],
    sharedDatabase: true,
    dataSource: "supabase",
  };
}

export async function createSubmission(payload) {
  const clean = {
    project_name: typeof payload?.project_name === "string" ? payload.project_name.trim().slice(0, 120) : "",
    project_url: typeof payload?.project_url === "string" ? payload.project_url.trim().slice(0, 240) : "",
    contact: typeof payload?.contact === "string" ? payload.contact.trim().slice(0, 180) : "",
    category_hint: typeof payload?.category_hint === "string" ? payload.category_hint.trim().slice(0, 80) : "",
    summary: typeof payload?.summary === "string" ? payload.summary.trim().slice(0, 4000) : "",
    notes: typeof payload?.notes === "string" ? payload.notes.trim().slice(0, 8000) : "",
  };

  if (!clean.project_name || !clean.summary) {
    throw new Error("Project name and summary are required.");
  }

  if (!isDatabaseConfigured()) {
    return {
      id: crypto.randomUUID(),
      status: "queued-local",
      created_at: new Date().toISOString(),
      ...clean,
      local_only: true,
    };
  }

  const [inserted] = await supabaseRequest("submissions?select=*", {
    method: "POST",
    body: {
      ...clean,
      status: "new",
    },
  });

  return inserted;
}

export async function listSubmissions() {
  if (!isDatabaseConfigured()) {
    return {
      submissions: [],
      sharedDatabase: false,
      dataSource: "local",
    };
  }

  const rows = await supabaseRequest("submissions?select=*&order=created_at.desc&limit=100");
  return {
    submissions: Array.isArray(rows) ? rows : [],
    sharedDatabase: true,
    dataSource: "supabase",
  };
}

export async function updateSubmissionStatus(id, payload) {
  const cleanId = typeof id === "string" ? id.trim() : "";
  if (!cleanId) {
    throw new Error("Submission id is required.");
  }

  const status = typeof payload?.status === "string" ? payload.status.trim().slice(0, 40) : "";
  const notes = typeof payload?.notes === "string" ? payload.notes.trim().slice(0, 1000) : "";

  if (!status) {
    throw new Error("Submission status is required.");
  }

  if (!isDatabaseConfigured()) {
    return {
      id: cleanId,
      status,
      notes,
      local_only: true,
      updated_at: new Date().toISOString(),
    };
  }

  const rows = await supabaseRequest(`submissions?id=eq.${encodeURIComponent(cleanId)}`, {
    method: "PATCH",
    body: { status, notes },
  });

  return Array.isArray(rows) ? rows[0] : rows;
}
