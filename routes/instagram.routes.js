const express = require("express");
const {
  claimInstagramMessage,
  parseInboundWebhook,
  resolveBrandFromInstagramAccountId,
  sendInstagramMessage,
  updateInstagramMessageStatus,
  verifyWebhookSignature
} = require("../services/instagram.service");
const { processMessage } = require("../brain/supportBrain");
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

router.post("/webhook", (req, res) => {
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const signature = req.get("x-hub-signature-256");
  if (!appSecret) return res.sendStatus(503);
  if (!verifyWebhookSignature(req.rawBody, signature, appSecret)) return res.sendStatus(401);

  // Acknowledge promptly so Meta does not retry while the AI responds.
  res.sendStatus(200);
  void processWebhook(req.body);
});

async function processWebhook(body) {
  let messages;
  try {
    messages = parseInboundWebhook(body);
  } catch (error) {
    console.error("[instagram] Could not parse webhook payload.", { message: error.message });
    return;
  }

  for (const inbound of messages) {
    const { messageId, instagramAccountId, from, text } = inbound;
    try {
      const isNewMessage = await claimInstagramMessage(messageId);
      if (!isNewMessage) continue;

      const connection = await resolveBrandFromInstagramAccountId(instagramAccountId);
      if (!connection) {
        console.warn("[instagram] No active Teviq connection for inbound account.", { instagramAccountId });
        await updateInstagramMessageStatus(messageId, "failed");
        continue;
      }

      const result = await processMessage({
        brandId: connection.brandId,
        message: text,
        customerId: from,
        channel: "instagram",
        requestIp: "instagram-messaging-api"
      });
      if (!result?.reply) throw new Error("The shared support brain returned an empty reply.");

      await sendInstagramMessage({
        instagramAccountId: connection.instagramAccountId,
        to: from,
        text: result.reply,
        accessToken: connection.accessToken
      });

      await updateInstagramMessageStatus(messageId, "processed");
    } catch (error) {
      console.error("[instagram] Message processing failed.", {
        messageId,
        code: error.code,
        message: error.message
      });
      await updateInstagramMessageStatus(messageId, "failed").catch(() => {});
    }
  }
}

module.exports = router;
