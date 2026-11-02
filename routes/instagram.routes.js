const express = require("express");
const {
  parseInboundWebhook,
  parseInstagramSeenWebhook,
  resolveBrandFromInstagramAccountId,
  verifyWebhookSignature
} = require("../services/instagram.service");
const { enqueueChannelMessages, applyProviderMessageStatus } = require("../services/channelMessageInbox.service");
const { connect, disconnect, getStatus, oauthCallback, sendManualReply } = require("../controllers/instagram.controller");
const { asyncHandler } = require("../middleware/asyncHandler");
const { requireBrandAccess } = require("../middleware/brandAccess.middleware");
const { requireClerkAuth } = require("../middleware/clerkAuth.middleware");

const router = express.Router();

router.get("/oauth/callback", asyncHandler(oauthCallback));
router.get("/:brandId/status", requireClerkAuth, requireBrandAccess, asyncHandler(getStatus));
router.post("/:brandId/connect", requireClerkAuth, requireBrandAccess, asyncHandler(connect));
router.delete("/:brandId/connection", requireClerkAuth, requireBrandAccess, asyncHandler(disconnect));
router.post("/:brandId/send", requireClerkAuth, requireBrandAccess, asyncHandler(sendManualReply));

router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const expectedToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

  if (!expectedToken) return res.sendStatus(503);
  if (mode === "subscribe" && token === expectedToken && challenge) {
    return res.status(200).send(String(challenge));
  }
  return res.sendStatus(403);
});

router.post("/webhook", async (req, res) => {
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const signature = req.get("x-hub-signature-256");
  if (!appSecret) return res.sendStatus(503);
  if (!verifyWebhookSignature(req.rawBody, signature, appSecret)) return res.sendStatus(401);

  try {
    const messages = parseInboundWebhook(req.body);
    const statuses = parseInstagramSeenWebhook(req.body);
    await enqueueChannelMessages('instagram', messages, resolveBrandFromInstagramAccountId);
    for (const status of statuses) {
      const connection = await resolveBrandFromInstagramAccountId(status.accountId);
      if (!connection?.brandId) continue;
      await applyProviderMessageStatus({ channel: 'instagram', ...status });
    }
    return res.sendStatus(200);
  } catch (_) {
    console.error('[instagram] Inbound batch was not persisted; retry required.');
    return res.sendStatus(503);
  }
});

module.exports = router;
