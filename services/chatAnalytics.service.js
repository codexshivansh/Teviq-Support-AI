const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes of inactivity = new conversation

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase chat_logs store is not configured.");
    error.statusCode = 503;
    error.code = "supabase_not_configured";
    throw error;
  }

  return { url, serviceRoleKey };
}

function getHeaders(extra = {}) {
  const { serviceRoleKey } = getSupabaseConfig();
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra
  };
}

function cutoffIso(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function baseFilter(brandId, days) {
  return `brand_id=eq.${encodeURIComponent(brandId)}&created_at=gte.${encodeURIComponent(cutoffIso(days))}`;
}

// Fetches matching rows with only the given columns selected, to keep
// payload small — every metric below only needs 1-3 fields, never the
// full row (message/reply/citations can be large).
async function fetchRows({ brandId, days, select, extraFilter = "" }) {
  const { url } = getSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/chat_logs?${baseFilter(brandId, days)}&select=${select}${extraFilter}`,
    { headers: getHeaders() }
  );
  const text = await response.text();
  const data = text ? JSON.parse(text) : [];

  if (!response.ok) {
    const error = new Error(data?.message || `Supabase chat_logs query failed with ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

// Pure count via PostgREST's Content-Range header (Prefer: count=exact +
// Range: 0-0) instead of downloading matching rows — used for the two
// metrics that are genuinely just a count, not a group-by.
async function countRows({ brandId, days, extraFilter = "" }) {
  const { url } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/chat_logs?${baseFilter(brandId, days)}&select=id${extraFilter}`, {
    headers: getHeaders({ Prefer: "count=exact", Range: "0-0" })
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Supabase chat_logs count failed with ${response.status}: ${text}`);
    error.statusCode = response.status;
    throw error;
  }

  const contentRange = response.headers.get("content-range") || "";
  const total = Number(contentRange.split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

// Groups a customer's messages into "conversations" using a 30-minute
// inactivity gap — chat_logs has no explicit session boundary, so this is
// the sessionization used consistently by both getTotalConversations and
// getDeflectionRate (each still does its own fetch; see comment at the
// bottom of the file on why that duplication is fine at current scale).
function sessionize(rows) {
  const byCustomer = new Map();
  for (const row of rows) {
    const list = byCustomer.get(row.customer_id) || [];
    list.push(row);
    byCustomer.set(row.customer_id, list);
  }

  const sessions = [];
  for (const rowsForCustomer of byCustomer.values()) {
    rowsForCustomer.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    let current = null;
    for (const row of rowsForCustomer) {
      const timestamp = new Date(row.created_at).getTime();
      if (!current || timestamp - current.lastTimestamp > SESSION_GAP_MS) {
        current = { escalated: false, startedAt: row.created_at, lastTimestamp: timestamp };
        sessions.push(current);
      }
      current.lastTimestamp = timestamp;
      if (row.escalated) current.escalated = true;
    }
  }

  return sessions;
}

async function getTotalConversations(brandId, days = 30) {
  const rows = await fetchRows({ brandId, days, select: "customer_id,created_at" });
  return sessionize(rows).length;
}

async function getEscalationRate(brandId, days = 30) {
  const rows = await fetchRows({ brandId, days, select: "customer_id,created_at,escalated" });
  const sessions = sessionize(rows);
  const escalated = sessions.filter((session) => session.escalated).length;

  return {
    rate: sessions.length > 0 ? escalated / sessions.length : 0,
    escalatedCount: escalated,
    totalConversations: sessions.length,
    totalMessages: rows.length
  };
}

async function getDeflectionRate(brandId, days = 30) {
  const rows = await fetchRows({ brandId, days, select: "customer_id,created_at,escalated" });
  const sessions = sessionize(rows);

  if (!sessions.length) {
    return { rate: 0, deflectedCount: 0, totalConversations: 0 };
  }

  const deflected = sessions.filter((session) => !session.escalated).length;
  return {
    rate: deflected / sessions.length,
    deflectedCount: deflected,
    totalConversations: sessions.length
  };
}

function groupByExactText(rows, field, limit) {
  const counts = new Map();
  for (const row of rows) {
    const raw = String(row[field] || "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { text: raw, count: 1 });
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

async function getTopIntents(brandId, days = 30, limit = 10) {
  const rows = await fetchRows({ brandId, days, select: "detected_intent" });
  const counts = new Map();
  for (const row of rows) {
    const intent = row.detected_intent || "unknown";
    counts.set(intent, (counts.get(intent) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([intent, count]) => ({ intent, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// Exact-match grouping only (case/whitespace-insensitive) — no paraphrase
// clustering. "Sahi size kaise choose karu?" and "sahi size kaise choose
// karu" merge; a differently-worded question about the same topic won't.
async function getTopQuestions(brandId, days = 30, limit = 10) {
  const rows = await fetchRows({ brandId, days, select: "message" });
  return groupByExactText(rows, "message", limit).map((entry) => ({
    question: entry.text,
    count: entry.count
  }));
}

async function getTopUnresolvedQuestions(brandId, days = 30, limit = 10) {
  const rows = await fetchRows({
    brandId,
    days,
    select: "message",
    extraFilter: "&detected_intent=eq.unknown"
  });
  return groupByExactText(rows, "message", limit).map((entry) => ({
    question: entry.text,
    count: entry.count
  }));
}

function dayKey(isoString) {
  return isoString.slice(0, 10); // YYYY-MM-DD
}

function buildDayRange(days) {
  const dates = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dates.push(dayKey(date.toISOString()));
  }
  return dates;
}

// There is no explicit "resolved" signal in chat_logs. Keep this trend
// conversation-scoped so it uses the same 30-minute session definition as
// total conversations, deflection rate, and escalation rate.
async function getEscalationTrend(brandId, days = 30) {
  const rows = await fetchRows({ brandId, days, select: "customer_id,created_at,escalated" });
  const sessions = sessionize(rows);
  const buckets = new Map(buildDayRange(days).map((date) => [date, { escalatedCount: 0, nonEscalatedCount: 0 }]));

  for (const session of sessions) {
    const key = dayKey(session.startedAt);
    const bucket = buckets.get(key);
    if (!bucket) continue; // outside the requested range due to a clock edge
    if (session.escalated) bucket.escalatedCount += 1;
    else bucket.nonEscalatedCount += 1;
  }

  return [...buckets.entries()].map(([date, counts]) => ({ date, ...counts }));
}

function median(sortedValues) {
  const n = sortedValues.length;
  if (!n) return null;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sortedValues[mid - 1] + sortedValues[mid]) / 2 : sortedValues[mid];
}

async function getResponseTimeStats(brandId, days = 30) {
  const rows = await fetchRows({
    brandId,
    days,
    select: "created_at,response_time_ms",
    extraFilter: "&response_time_ms=not.is.null"
  });

  if (!rows.length) {
    return { medianMs: null, averageMs: null, sampleCount: 0, trend: [] };
  }

  const values = rows.map((row) => row.response_time_ms).sort((a, b) => a - b);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;

  const dayBuckets = new Map(buildDayRange(days).map((date) => [date, []]));
  for (const row of rows) {
    const key = dayKey(row.created_at);
    const bucket = dayBuckets.get(key);
    if (bucket) bucket.push(row.response_time_ms);
  }

  const trend = [...dayBuckets.entries()].map(([date, dayValues]) => ({
    date,
    averageMs: dayValues.length ? Math.round(dayValues.reduce((sum, value) => sum + value, 0) / dayValues.length) : null,
    sampleCount: dayValues.length
  }));

  return {
    medianMs: Math.round(median(values)),
    averageMs: Math.round(average),
    sampleCount: values.length,
    trend
  };
}

async function getFailedAnswersCount(brandId, days = 30) {
  return countRows({ brandId, days, extraFilter: "&is_fallback=eq.true" });
}

module.exports = {
  getTotalConversations,
  getEscalationRate,
  getDeflectionRate,
  getTopIntents,
  getTopQuestions,
  getTopUnresolvedQuestions,
  getEscalationTrend,
  getResponseTimeStats,
  getFailedAnswersCount
};
