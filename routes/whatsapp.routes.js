/**
 * whatsapp.routes.js
 *
 * Mounted in server.js as:
 *   app.use('/api/whatsapp', require('./routes/whatsapp.routes'));
 *
 * Meta will then call:
 *   GET  /api/whatsapp/webhook   (one-time verification during setup)
 *   POST /api/whatsapp/webhook   (every inbound message/status event)
 *
 * IMPORTANT — Meta requires a 200 response within a few seconds or it will
 * retry (and eventually mark the endpoint unhealthy). This handler
 * acknowledges immediately and processes messages after responding, so a
 * slow brain call never causes Meta to see a timeout.
 */

const express = require('express');
const router = express.Router();

const {
  resolveBrandFromPhoneNumberId,
  parseInboundWebhook,
  sendWhatsAppMessage
} = require('../services/whatsapp.service');
const { appendChatLog } = require('../services/analytics.service');
const { requireClerkAuth } = require('../middleware/clerkAuth.middleware');
const { requireBrandAccess } = require('../middleware/brandAccess.middleware');
const { asyncHandler } = require('../middleware/asyncHandler');

// Wired to the existing brain: backend/brain/supportBrain.js
// CONFIRMED exported function signature (as of this integration):
//   async function processMessage({ brandId, message, customerId = "guest",
//     channel = "widget", context: requestContext, requestIp = "unknown" })
// This is an object-style call — matches the shape used below exactly.
const { processMessage } = require('../brain/supportBrain');

/**
 * Bridge to the existing chat brain (supportBrain.js), reused as-is for
 * the WhatsApp channel — no changes to the brain itself.
 *
 * IMPORTANT: supportBrain's detectIntent() already takes a brandId (per
 * existing F4 wiring: `detectIntent(message, brand.brandId)`), and state
 * continuity (conversation_states table) is keyed by (brandId, customerId,
 * channel) per the F1 return-flow design — so passing `channel: 'whatsapp'`
 * here keeps WhatsApp conversation state separate from the website widget's
 * state for the same customer, rather than the two channels clobbering
 * each other's progress through a multi-turn flow (e.g. return initiation).
 *
 * @param {object} params
 * @param {string} params.brandId
 * @param {string} params.message
 * @param {string} params.customerId - using the customer's WhatsApp number as the identifier
 * @param {string} params.businessMode - 'd2c' or 'b2b', from whatsapp_connections
 * @returns {Promise<{reply: string, intent: string, escalated: boolean}>}
 */
async function callBrain({ brandId, message, customerId, businessMode }) {
  // processMessage's confirmed params: brandId, message, customerId,
  // channel, context, requestIp. It does NOT currently accept businessMode
  // — that's fine, we're just not using it yet. When the D2C-vs-B2B
  // prompt/tool switch gets built inside supportBrain.js, businessMode
  // will need to be threaded through here as a new param (or folded into
  // `context`) at that point. For now it's silently unused, which is safe.
  const brainResult = await processMessage({
    brandId,
    message,
    customerId,          // WhatsApp number doubles as the customer identifier for this channel
    channel: 'whatsapp',  // keeps conversation_states separate from the website widget's ("widget") state
    requestIp: 'whatsapp-cloud-api' // no real client IP available on this channel; label it clearly instead of leaving the "unknown" default, which could be confused with a genuine lookup failure elsewhere in the codebase
  });

  return brainResult;
}

/**
 * GET /webhook — one-time verification handshake.
 * Meta calls this when you first configure the webhook URL in the App
 * Dashboard. It sends a challenge string that must be echoed back exactly
 * if the verify token matches, or the setup is rejected.
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // This token is something YOU choose and enter into the Meta App
  // Dashboard when configuring the webhook — it's not issued by Meta.
  // Store it in an env var, never hardcode it.
  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('[whatsapp.routes] Webhook verified successfully.');
    return res.status(200).send(challenge);
  }

  console.warn('[whatsapp.routes] Webhook verification failed — token mismatch.');
  return res.sendStatus(403);
});

/**
 * POST /webhook — receives inbound messages and delivery/status events.
 */
router.post('/webhook', async (req, res) => {
  // Acknowledge immediately. Meta does not need to wait for our brain
  // to finish thinking — it just needs confirmation the payload arrived.
  res.sendStatus(200);

  let inboundMessages;
  try {
    inboundMessages = parseInboundWebhook(req.body);
  } catch (parseErr) {
    // A malformed payload should never crash the process — log and stop.
    console.error('[whatsapp.routes] Failed to parse webhook payload:', parseErr);
    return;
  }

  if (inboundMessages.length === 0) {
    // Likely a status callback (delivered/read) or an unsupported message
    // type — nothing further to do.
    return;
  }

  for (const inbound of inboundMessages) {
    await handleSingleMessage(inbound);
  }
});

/**
 * Handles one parsed inbound message end-to-end: resolve brand, call the
 * brain, send the reply. Isolated per-message so one failure doesn't
 * affect other messages in the same batch.
 *
 * @param {{phoneNumberId: string, from: string, text: string, messageId: string}} inbound
 */
// --- Manual send (dashboard -> customer), separate from the webhook flow ---
//
// NOTE on Supabase access: whatsapp.service.js is intentionally left
// untouched by this change, and it has no exported "look up a brand's
// WhatsApp connection by brandId" function (only the reverse lookup, by
// phone_number_id, for inbound webhook routing) — so the brandId -> connection
// lookup below is implemented locally, following the exact same raw-fetch
// REST convention every other service file in this repo uses (getSupabaseConfig
// / getHeaders against SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY), rather than
// introducing a different way of talking to Supabase.

const WHATSAPP_WINDOW_MS = 23 * 60 * 60 * 1000; // 23h — conservative 1hr buffer under Meta's 24h customer service window

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

/**
 * Looks up the active WhatsApp connection for a brand (the phone_number_id
 * to send FROM and the access token to send WITH). Mirrors
 * resolveBrandFromPhoneNumberId in whatsapp.service.js, just keyed the
 * other direction (brandId -> connection, not phoneNumberId -> brand).
 */
async function lookupWhatsappConnectionForBrand(brandId) {
  const { url } = getSupabaseConfig();
  const path = `?brand_id=eq.${encodeURIComponent(brandId)}&is_active=eq.true&select=phone_number_id,access_token&limit=2`;

  const response = await fetch(`${url}/rest/v1/whatsapp_connections${path}`, { headers: getHeaders() });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.message || `Supabase whatsapp_connections lookup failed with ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    const error = new Error(`Multiple active WhatsApp connections found for brand "${brandId}". Specify a sending number before replying.`);
    error.code = 'whatsapp_connection_ambiguous';
    throw error;
  }

  return { phoneNumberId: rows[0].phone_number_id, accessToken: rows[0].access_token };
}

/**
 * Returns the timestamp (ms) of this customer's most recent genuine inbound
 * WhatsApp message, or null if none is on record. Deliberately does NOT
 * just take the newest chat_logs row for this customer — a manual agent
 * send (this same route) writes a row with an empty `message` and only a
 * `reply`, and Meta's 24-hour window resets on customer activity, not on
 * our own outbound sends. Using the newest row unconditionally would let
 * agents keep the window artificially "open" forever by replying to
 * themselves, which would then fail for real at Meta's API anyway.
 */
async function getLastCustomerMessageTimestamp({ brandId, customerId }) {
  const { url } = getSupabaseConfig();
  const select = 'message,created_at';
  const filter = `brand_id=eq.${encodeURIComponent(brandId)}&customer_id=eq.${encodeURIComponent(customerId)}&channel=eq.whatsapp`;

  const response = await fetch(
    `${url}/rest/v1/chat_logs?${filter}&select=${select}&order=created_at.desc&limit=10`,
    { headers: getHeaders() }
  );
  const text = await response.text();
  const data = text ? JSON.parse(text) : [];

  if (!response.ok) {
    const error = new Error(data?.message || `Supabase chat_logs lookup failed with ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  const lastCustomerRow = rows.find((row) => typeof row.message === 'string' && row.message.trim().length > 0);
  return lastCustomerRow ? new Date(lastCustomerRow.created_at).getTime() : null;
}

/**
 * POST /send — lets the dashboard (a signed-in brand owner) send a manual
 * WhatsApp reply outside the automated webhook flow. Auth mirrors
 * conversations.routes.js: requireClerkAuth populates req.auth (whatsapp.routes.js
 * is mounted with no auth in server.js, since /webhook must stay public for
 * Meta to call — so auth is applied per-route here, not at the router mount),
 * then requireBrandAccess checks the signed-in user is allowed to act on
 * the given brandId.
 */
router.post(
  '/send',
  requireClerkAuth,
  requireBrandAccess,
  asyncHandler(async (req, res) => {
    const { to, text, brandId } = req.body || {};

    if (!to || !text || !brandId) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_request',
        message: 'to, text, and brandId are all required.'
      });
    }

    try {
      const connection = await lookupWhatsappConnectionForBrand(brandId);
      if (!connection) {
        return res.status(404).json({
          ok: false,
          error: 'whatsapp_not_connected',
          message: `No active WhatsApp connection found for brand "${brandId}".`
        });
      }

      const lastCustomerMessageAt = await getLastCustomerMessageTimestamp({ brandId, customerId: to });
      if (!lastCustomerMessageAt || Date.now() - lastCustomerMessageAt > WHATSAPP_WINDOW_MS) {
        return res.status(422).json({
          ok: false,
          error: 'window_expired',
          message: '24-hour WhatsApp window has expired for this customer. Use a template message instead.'
        });
      }

      const sendResult = await sendWhatsAppMessage({
        phoneNumberId: connection.phoneNumberId,
        to,
        text,
        accessToken: connection.accessToken
      });

      // Record the outbound message so the dashboard's conversation
      // transcript stays complete. message is deliberately empty — there is
      // no inbound customer message paired with this row, only our reply —
      // which is also what keeps this row from counting as customer
      // activity in getLastCustomerMessageTimestamp() above.
      try {
        await appendChatLog({
          brandId,
          customerId: to,
          channel: 'whatsapp',
          message: '',
          reply: text,
          detectedIntent: 'human_reply',
          escalated: false,
          source: 'human_agent',
          knowledgeCitations: [],
          knowledgeConfidence: 0,
          isFallback: false,
          responseTimeMs: null
        });
      } catch (logErr) {
        console.error(`[whatsapp.routes] Failed to log manual send for brand=${brandId}, to=${to}:`, logErr);
      }

      return res.json({ ok: true, messageId: sendResult?.messages?.[0]?.id || null });
    } catch (error) {
      console.error(`[whatsapp.routes] Manual send failed for brand=${brandId}:`, error);
      if (error.code === 'whatsapp_connection_ambiguous') {
        return res.status(409).json({ ok: false, error: error.code, message: error.message });
      }
      return res.status(500).json({
        ok: false,
        error: 'send_failed',
        message: error.message
      });
    }
  })
);

async function handleSingleMessage(inbound) {
  const { phoneNumberId, from, text, messageId } = inbound;

  let connection;
  try {
    connection = await resolveBrandFromPhoneNumberId(phoneNumberId);
  } catch (lookupErr) {
    console.error(`[whatsapp.routes] Brand lookup failed for phone_number_id=${phoneNumberId}:`, lookupErr);
    return;
  }

  if (!connection) {
    // No active brand is connected to this number — nothing we can safely
    // do except log it. This should not normally happen in production
    // since numbers are only registered when a client connects.
    console.warn(`[whatsapp.routes] No active brand found for phone_number_id=${phoneNumberId}. Message ${messageId} dropped.`);
    return;
  }

  const { brandId, businessMode, accessToken } = connection;

  let brainResult;
  try {
    brainResult = await callBrain({
      brandId,
      message: text,
      customerId: from, // WhatsApp number doubles as the customer identifier for this channel
      businessMode
    });
  } catch (brainErr) {
    console.error(`[whatsapp.routes] Brain call failed for brand=${brandId}, message=${messageId}:`, brainErr);

    // Fail gracefully toward the customer rather than leaving them with
    // total silence — a stuck/broken bot is worse than no bot.
    try {
      await sendWhatsAppMessage({
        phoneNumberId,
        to: from,
        text: "Sorry, I'm having trouble right now. Please try again in a moment, or type \"agent\" to reach a human.",
        accessToken
      });
    } catch (fallbackSendErr) {
      console.error('[whatsapp.routes] Even the fallback message failed to send:', fallbackSendErr);
    }
    return;
  }

  try {
    await sendWhatsAppMessage({
      phoneNumberId,
      to: from,
      text: brainResult.reply,
      accessToken
    });
  } catch (sendErr) {
    console.error(`[whatsapp.routes] Failed to deliver brain reply for brand=${brandId}, message=${messageId}:`, sendErr);
  }
}

module.exports = router;
