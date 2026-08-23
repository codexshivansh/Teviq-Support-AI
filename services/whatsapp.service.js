/**
 * whatsapp.service.js
 *
 * Core logic for the WhatsApp channel adapter. Keeps three responsibilities
 * separate so each is independently testable:
 *   1. resolveBrandFromPhoneNumberId  -> which tenant does this message belong to
 *   2. parseInboundWebhook            -> turn Meta's raw payload into a clean shape
 *   3. sendWhatsAppMessage            -> push a reply back out via the Graph API
 *
 * This file assumes:
 *   - The `whatsapp_connections` table exists in Supabase (not created by
 *     this integration — provision it separately, e.g. under
 *     supabase/migrations/, before going live).
 *   - Node 18+ (native fetch) — this repo runs Node 22, so no polyfill
 *     is needed.
 *
 * NOTE on Supabase access: this repo has no shared `@supabase/supabase-js`
 * client instance (no config/supabase.js). Every other service
 * (brand.service.js, conversationState.service.js, etc.) talks to Supabase
 * via raw REST calls against SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY using
 * fetch. This file follows that same convention rather than introducing a
 * second, different way of touching Supabase.
 */

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url || !serviceRoleKey) {
    const error = new Error('Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing).');
    error.statusCode = 503;
    error.code = 'supabase_not_configured';
    throw error;
  }

  return { url, serviceRoleKey };
}

function getHeaders(extra = {}) {
  const { serviceRoleKey } = getSupabaseConfig();
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

function getRestUrl(path) {
  const { url } = getSupabaseConfig();
  return `${url}/rest/v1/whatsapp_connections${path}`;
}

function encodeFilter(value) {
  return encodeURIComponent(String(value || ''));
}

/**
 * Looks up which brand owns a given WhatsApp phone_number_id.
 * This runs on every single inbound webhook call, so it's a single small
 * REST request — same pattern used by conversationState.service.js.
 *
 * @param {string} phoneNumberId - Meta's phone_number_id from the webhook payload
 * @returns {Promise<{brandId: string, businessMode: string, accessToken: string} | null>}
 *          null if no active connection is found for this number
 */
async function resolveBrandFromPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) {
    // Defensive check — a malformed payload should never reach the DB query.
    throw new Error('resolveBrandFromPhoneNumberId: phoneNumberId is required');
  }

  const path = `?phone_number_id=eq.${encodeFilter(phoneNumberId)}&select=brand_id,business_mode,access_token,is_active`;

  let response;
  try {
    response = await fetch(getRestUrl(path), { headers: getHeaders() });
  } catch (networkErr) {
    console.error('[whatsapp.service] Network error querying whatsapp_connections:', networkErr);
    throw networkErr;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    console.error('[whatsapp.service] Supabase lookup failed:', { status: response.status, data });
    const error = new Error(data?.message || `Supabase whatsapp_connections request failed with ${response.status}`);
    error.statusCode = response.status;
    error.data = data;
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : null;

  if (!row || !row.is_active) {
    // No row (unknown number) or connection deactivated (e.g. non-payment,
    // policy issue) — both are "nothing to do here", not real errors.
    return null;
  }

  return {
    brandId: row.brand_id,
    businessMode: row.business_mode,
    accessToken: row.access_token
  };
}

/**
 * Parses Meta's raw webhook POST body into a clean, minimal shape.
 * Meta's payload is deeply nested and can contain multiple entries/changes
 * in a single call (batching) — this function normalizes that into a flat
 * array of individual inbound messages so the caller can loop simply.
 *
 * Reference shape (trimmed): entry[].changes[].value.messages[]
 *
 * @param {object} webhookBody - raw req.body from Meta's POST
 * @returns {Array<{phoneNumberId: string, from: string, text: string, messageId: string, timestamp: string}>}
 */
function parseInboundWebhook(webhookBody) {
  const parsedMessages = [];

  if (!webhookBody || !Array.isArray(webhookBody.entry)) {
    // Not a message event recognized (could be a status update, or malformed).
    return parsedMessages;
  }

  for (const entry of webhookBody.entry) {
    if (!Array.isArray(entry.changes)) continue;

    for (const change of entry.changes) {
      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id;
      const messages = value.messages;

      // Status callbacks (delivered/read receipts) also land on this webhook
      // but have no `messages` array — skip those, they're not user messages.
      if (!Array.isArray(messages)) continue;

      for (const msg of messages) {
        // Only handling plain text for now. Non-text types (image, audio,
        // location, button replies) are logged so they're visible in
        // monitoring, but not silently dropped without a trace.
        if (msg.type !== 'text') {
          console.warn(`[whatsapp.service] Unsupported message type "${msg.type}" from ${msg.from} — skipping.`);
          continue;
        }

        parsedMessages.push({
          phoneNumberId,
          from: msg.from,               // customer's WhatsApp number, e.g. "919876543210"
          text: msg.text?.body ?? '',
          messageId: msg.id,
          timestamp: msg.timestamp
        });
      }
    }
  }

  return parsedMessages;
}

/**
 * Sends a plain text reply back to a customer via the WhatsApp Cloud API.
 * Must be called within the 24-hour customer service window for free-form
 * text; outside that window, Meta will reject this and a pre-approved
 * template must be used instead (not handled by this function).
 *
 * @param {object} params
 * @param {string} params.phoneNumberId - which WABA number to send FROM
 * @param {string} params.to - customer's WhatsApp number to send TO
 * @param {string} params.text - message body
 * @param {string} params.accessToken - this brand's WABA access token
 * @returns {Promise<object>} Meta's API response
 */
async function sendWhatsAppMessage({ phoneNumberId, to, text, accessToken }) {
  if (!phoneNumberId || !to || !text || !accessToken) {
    throw new Error('sendWhatsAppMessage: phoneNumberId, to, text, and accessToken are all required');
  }

  const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text }
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (networkErr) {
    // Network-level failure (DNS, timeout, connection reset) — distinct
    // from an API-level error response, so it's logged separately.
    console.error('[whatsapp.service] Network error calling Graph API:', networkErr);
    throw networkErr;
  }

  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    // Meta returns rich error detail (error.code, error.message,
    // error.error_data.details) — surface all of it for debugging,
    // since silent failures here mean a customer never gets a reply.
    console.error('[whatsapp.service] Graph API rejected the message:', {
      status: response.status,
      body: responseBody
    });
    throw new Error(
      `WhatsApp send failed (${response.status}): ${responseBody?.error?.message ?? 'unknown error'}`
    );
  }

  return responseBody;
}

module.exports = {
  resolveBrandFromPhoneNumberId,
  parseInboundWebhook,
  sendWhatsAppMessage
};
