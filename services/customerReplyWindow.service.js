const CUSTOMER_REPLY_WINDOW_MS = 23 * 60 * 60 * 1000;

function isReplyWindowOpen(lastInboundAt, now = Date.now()) {
  return Number.isFinite(lastInboundAt) && lastInboundAt > 0
    && now >= lastInboundAt && now - lastInboundAt < CUSTOMER_REPLY_WINDOW_MS;
}

async function getLastInboundMessageTimestamp({ brandId, customerId, channel }) {
  const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    const error = new Error("Conversation storage is not configured.");
    error.statusCode = 503;
    throw error;
  }
  const query = new URLSearchParams({
    brand_id: `eq.${brandId}`,
    customer_id: `eq.${customerId}`,
    channel: `eq.${channel}`,
    // Filter BEFORE limiting: any number of outbound-only rows must not
    // conceal the last genuine customer message.
    message: "neq.",
    select: "message,created_at",
    order: "created_at.desc",
    limit: "1"
  });
  const response = await fetch(`${base}/rest/v1/chat_logs?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  if (!response.ok) {
    const error = new Error("Could not verify the customer reply window.");
    error.statusCode = 503;
    error.code = "reply_window_check_failed";
    throw error;
  }
  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (typeof row?.message !== "string" || !row.message.trim()) return null;
  const timestamp = new Date(row.created_at).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

module.exports = { CUSTOMER_REPLY_WINDOW_MS, getLastInboundMessageTimestamp, isReplyWindowOpen };
