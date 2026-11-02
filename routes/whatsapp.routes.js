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
 * acknowledges only after durable storage; a separate worker generates and
 * sends replies. Storage failures return 503 so Meta can retry.
 */

const express = require('express');
const router = express.Router();
const { enqueueChannelMessages, applyProviderMessageStatus, recordProviderMessageAccepted } = require('../services/channelMessageInbox.service');
const { verifyWhatsAppWebhookSignature } = require('../services/whatsappWebhookSecurity.service');

const {
  resolveBrandFromPhoneNumberId,
  parseInboundWebhook,
  parseWhatsAppStatusWebhook,
  sendWhatsAppMessage
} = require('../services/whatsapp.service');
const { appendChatLog } = require('../services/analytics.service');
const { requireClerkAuth } = require('../middleware/clerkAuth.middleware');
const { requireBrandAccess } = require('../middleware/brandAccess.middleware');
const { asyncHandler } = require('../middleware/asyncHandler');
const { getLastInboundMessageTimestamp, isReplyWindowOpen } = require('../services/customerReplyWindow.service');
const whatsappConnectionStore = require('../integrations/whatsapp/whatsappConnection.store');
const whatsappEmbeddedSignup = require('../integrations/whatsapp/whatsappEmbeddedSignup.service');

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

  if (!expectedToken) return res.sendStatus(503);
  if (mode === 'subscribe' && token === expectedToken && challenge) {
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
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !appSecret.trim()) return res.sendStatus(503);
  if (!verifyWhatsAppWebhookSignature(req.rawBody, req.get('x-hub-signature-256'), appSecret)) {
    return res.sendStatus(401);
  }

  try {
    const messages = parseInboundWebhook(req.body);
    const statuses = parseWhatsAppStatusWebhook(req.body);
    await enqueueChannelMessages('whatsapp', messages, resolveBrandFromPhoneNumberId);
    for (const status of statuses) {
      const connection = await resolveBrandFromPhoneNumberId(status.accountId);
      if (!connection?.brandId) continue;
      await applyProviderMessageStatus({ channel: 'whatsapp', ...status });
    }
    return res.sendStatus(200);
  } catch (_) {
    // No acknowledgement until the batch is durably stored. Meta can retry.
    console.error('[whatsapp] Inbound batch was not persisted; retry required.');
    return res.sendStatus(503);
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
/**
 * Looks up the active WhatsApp connection for a brand (the phone_number_id
 * to send FROM and the access token to send WITH). Mirrors
 * resolveBrandFromPhoneNumberId in whatsapp.service.js, just keyed the
 * other direction (brandId -> connection, not phoneNumberId -> brand).
 */
async function lookupWhatsappConnectionForBrand(brandId) {
  const rows = await whatsappConnectionStore.listConnectionsByBrand(brandId, { activeOnly: true });
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    const error = new Error(`Multiple active WhatsApp connections found for brand "${brandId}". Specify a sending number before replying.`);
    error.code = 'whatsapp_connection_ambiguous';
    throw error;
  }

  return {
    phoneNumberId: rows[0].phone_number_id,
    accessToken: whatsappConnectionStore.getAccessToken(rows[0])
  };
}

function requireInteractiveClerkSession(req, res) {
  if (req.auth?.sessionType !== 'clerk') {
    res.status(401).json({
      error: 'real_session_required',
      message: 'Sign in with your Teviq account before connecting WhatsApp.'
    });
    return false;
  }
  return true;
}

router.get('/:brandId/status', requireClerkAuth, requireBrandAccess, asyncHandler(async (req, res) => {
  const connections = await whatsappConnectionStore.listConnectionsByBrand(req.params.brandId, { activeOnly: true });
  return res.json({
    provider: 'whatsapp',
    brandId: req.params.brandId,
    connected: connections.length > 0,
    signupConfigured: whatsappEmbeddedSignup.isConfigured(),
    signup: whatsappEmbeddedSignup.publicConfig(),
    connection: whatsappConnectionStore.toPublicConnection(connections[0] || null)
  });
}));

router.post('/:brandId/complete', requireClerkAuth, requireBrandAccess, asyncHandler(async (req, res) => {
  if (!requireInteractiveClerkSession(req, res)) return;
  const { code, wabaId, phoneNumberId } = req.body || {};
  const connection = await whatsappEmbeddedSignup.finishSignup({
    brandId: req.params.brandId,
    clerkUserId: req.auth.userId,
    code: String(code || '').trim(),
    wabaId: String(wabaId || '').trim(),
    phoneNumberId: String(phoneNumberId || '').trim()
  });
  return res.json({ ok: true, connected: true, connection });
}));

router.delete('/:brandId/connection', requireClerkAuth, requireBrandAccess, asyncHandler(async (req, res) => {
  if (!requireInteractiveClerkSession(req, res)) return;
  await whatsappConnectionStore.disconnectBrand(req.params.brandId);
  return res.json({ ok: true, connected: false });
}));

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
  return getLastInboundMessageTimestamp({ brandId, customerId, channel: 'whatsapp' });
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
  (req, res, next) => { if (requireInteractiveClerkSession(req, res)) next(); },
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
      if (!isReplyWindowOpen(lastCustomerMessageAt)) {
        return res.status(422).json({
          ok: false,
          error: 'window_expired',
          message: 'The WhatsApp reply window is closed (Teviq uses a 23-hour safety limit). Wait for a customer message or use an approved template.'
        });
      }

      await require('../services/conversationHandoff.service').setConversationHandoff({
        brandId, channel: 'whatsapp', customerId: to, actorId: req.auth.userId, paused: true
      });
      const sendResult = await sendWhatsAppMessage({
        phoneNumberId: connection.phoneNumberId,
        to,
        text,
        accessToken: connection.accessToken
      });
      const providerMessageId = sendResult?.messages?.[0]?.id || null;
      if (providerMessageId) await recordProviderMessageAccepted({ channel: 'whatsapp', accountId: connection.phoneNumberId,
        messageId: providerMessageId, brandId, customerId: to }).catch(() => {});

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
          responseTimeMs: null,
          providerMessageId
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

module.exports = router;
