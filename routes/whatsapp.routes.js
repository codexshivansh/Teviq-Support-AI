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
