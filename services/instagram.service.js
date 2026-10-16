/**
 * Instagram Messaging adapter helpers.
 *
 * Keep provider-specific webhook parsing and outbound HTTP calls here so the
 * integration route can pass normalized messages to the shared support brain.
 */

const crypto = require("node:crypto");
const { decryptValue } = require("./shopifyCredentials.service");

const GRAPH_API_VERSION = process.env.INSTAGRAM_GRAPH_API_VERSION || "v26.0";
const GRAPH_API_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase is not configured for Instagram connections.");
    error.statusCode = 503;
    error.code = "supabase_not_configured";
    throw error;
  }
  return { url, serviceRoleKey };
}

async function resolveBrandFromInstagramAccountId(instagramAccountId) {
  if (!instagramAccountId) throw new Error("resolveBrandFromInstagramAccountId: account ID is required.");

  const { url, serviceRoleKey } = getSupabaseConfig();
  const query = new URLSearchParams({
    instagram_user_id: `eq.${instagramAccountId}`,
    status: "eq.active",
    select: "brand_id,instagram_user_id,access_token_encrypted,status",
    limit: "2"
  });
  const response = await fetch(`${url}/rest/v1/instagram_connections?${query}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error("Instagram connection lookup failed.");
    error.statusCode = response.status;
    throw error;
  }
  if (!Array.isArray(rows) || rows.length === 0) return null;
  if (rows.length > 1) {
    const error = new Error("More than one Instagram connection matched this account.");
    error.code = "instagram_connection_ambiguous";
    throw error;
  }

  return {
    brandId: rows[0].brand_id,
    instagramAccountId: rows[0].instagram_user_id,
    accessToken: decryptValue(rows[0].access_token_encrypted)
  };
}

async function claimInstagramMessage(messageId) {
  if (!messageId) return true;
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/instagram_webhook_events?on_conflict=message_id`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation"
    },
    body: JSON.stringify({ message_id: messageId, status: "received" })
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error("Instagram webhook event could not be recorded.");
    error.statusCode = response.status;
    throw error;
  }
  return Array.isArray(rows) && rows.length > 0;
}

async function updateInstagramMessageStatus(messageId, status) {
  if (!messageId || !["processed", "failed"].includes(status)) return;
  const { url, serviceRoleKey } = getSupabaseConfig();
  const query = new URLSearchParams({ message_id: `eq.${messageId}` });
  const response = await fetch(`${url}/rest/v1/instagram_webhook_events?${query}`, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({ status })
  });
  if (!response.ok) throw new Error("Instagram webhook event status could not be updated.");
}

function verifyWebhookSignature(rawBody, signature, appSecret) {
  if (!Buffer.isBuffer(rawBody) || !signature || !appSecret) return false;
  const match = /^sha256=([a-f0-9]{64})$/i.exec(String(signature));
  if (!match) return false;
  const supplied = Buffer.from(match[1], "hex");
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest();
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function parseInboundWebhook(webhookBody) {
  if (!webhookBody || webhookBody.object !== "instagram" || !Array.isArray(webhookBody.entry)) {
    return [];
  }

  const messages = [];
  for (const entry of webhookBody.entry) {
    if (!Array.isArray(entry.messaging)) continue;

    for (const event of entry.messaging) {
      const message = event.message;
      const senderId = event.sender?.id;
      const instagramAccountId = event.recipient?.id || entry.id;

      // Ignore echoes and non-text events until their handling is explicitly
      // supported; they should never be mistaken for customer text.
      if (!message || message.is_echo || typeof message.text !== "string") continue;
      if (!senderId || !instagramAccountId || !message.text.trim()) continue;
      const timestampMs = Number(event.timestamp);

      messages.push({
        instagramAccountId: String(instagramAccountId),
        from: String(senderId),
        text: message.text.trim(),
        messageId: message.mid ? String(message.mid) : null,
        timestamp: Number.isFinite(timestampMs) && timestampMs > 0
          ? new Date(timestampMs).toISOString()
          : null
      });
    }
  }

  return messages;
}

async function sendInstagramMessage({ instagramAccountId, to, text, accessToken }) {
  if (!instagramAccountId || !to || !text || !accessToken) {
    throw new Error("sendInstagramMessage: instagramAccountId, to, text, and accessToken are required.");
  }

  const response = await fetch(`${GRAPH_API_BASE}/${encodeURIComponent(instagramAccountId)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      recipient: { id: String(to) },
      message: { text: String(text) }
    })
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Instagram send failed (${response.status}): ${body?.error?.message || "unknown error"}`);
    error.statusCode = response.status;
    error.providerCode = body?.error?.code || null;
    throw error;
  }

  return body;
}

module.exports = {
  parseInboundWebhook,
  claimInstagramMessage,
  resolveBrandFromInstagramAccountId,
  sendInstagramMessage,
  updateInstagramMessageStatus,
  verifyWebhookSignature
};
