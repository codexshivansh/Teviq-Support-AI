// Real conversation transcripts for the dashboard's Conversations page,
// built from chat_logs the same way chatAnalytics.service.js already
// sessionizes them (30-minute inactivity gap = new conversation) — no new
// data model, just a different projection of the same rows: full message
// pairs instead of aggregate counts.
//
// Deliberately does NOT invent a "resolved" status. chat_logs has no
// explicit resolution signal (chatAnalytics.service.js documents this same
// gap for its escalation trend), so conversations are only ever "open" or
// "escalated" here — never a fabricated "resolved".

const SESSION_GAP_MS = 30 * 60 * 1000;

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

async function fetchRows({ brandId, days, rowLimit }) {
  const { url } = getSupabaseConfig();
  const select = "customer_id,message,reply,detected_intent,escalated,created_at,is_fallback";
  const filter = `brand_id=eq.${encodeURIComponent(brandId)}&created_at=gte.${encodeURIComponent(cutoffIso(days))}`;
  const response = await fetch(
    `${url}/rest/v1/chat_logs?${filter}&select=${select}&order=created_at.desc&limit=${rowLimit}`,
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

// Turns a flat, newest-first row list into grouped conversation objects,
// oldest message first within each — mirrors chatAnalytics.service.js's
// sessionize() gap logic exactly, but keeps the full row instead of
// collapsing to a count.
function groupIntoConversations(rows, brandId) {
  const oldestFirst = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const byCustomer = new Map();
  for (const row of oldestFirst) {
    const list = byCustomer.get(row.customer_id) || [];
    list.push(row);
    byCustomer.set(row.customer_id, list);
  }

  const conversations = [];
  for (const [customerId, customerRows] of byCustomer.entries()) {
    let current = null;
    for (const row of customerRows) {
      const timestamp = new Date(row.created_at).getTime();
      if (!current || timestamp - current.lastTimestamp > SESSION_GAP_MS) {
        current = {
          id: `${customerId}_${row.created_at}`,
          brandId,
          customerId,
          customer: customerId,
          escalated: false,
          intent: "unknown",
          isFallback: false,
          lastTimestamp: timestamp,
          startedAt: row.created_at,
          channel: "Widget",
          messages: []
        };
        conversations.push(current);
      }

      current.lastTimestamp = timestamp;
      current.timestamp = row.created_at;
      current.intent = row.detected_intent || current.intent;
      current.isFallback = current.isFallback || Boolean(row.is_fallback);
      if (row.escalated) current.escalated = true;
      if (row.message) current.messages.push({ role: "customer", text: row.message });
      if (row.reply) current.messages.push({ role: "assistant", text: row.reply });
    }
  }

  return conversations
    .map((conversation) => ({
      ...conversation,
      status: conversation.escalated ? "escalated" : "open",
      lastMessage: [...conversation.messages].reverse().find((message) => message.role === "customer")?.text
        || conversation.messages[conversation.messages.length - 1]?.text
        || ""
    }))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

async function listConversations({ brandId, days = 30, rowLimit = 1000, conversationLimit = 200 }) {
  const rows = await fetchRows({ brandId, days, rowLimit });
  return groupIntoConversations(rows, brandId).slice(0, conversationLimit);
}

module.exports = { listConversations };
