const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { parseInboundWebhook, parseInstagramSeenWebhook, verifyWebhookSignature } = require("../services/instagram.service");

const events = parseInboundWebhook({
  object: "instagram",
  entry: [{
    id: "business-account-1",
    messaging: [
      {
        sender: { id: "customer-1" },
        recipient: { id: "business-account-1" },
        timestamp: 1792160000000,
        message: { mid: "message-1", text: "  Is this available?  " }
      },
      {
        sender: { id: "business-account-1" },
        recipient: { id: "customer-1" },
        message: { is_echo: true, text: "Echo" }
      },
      {
        sender: { id: "customer-2" },
        recipient: { id: "business-account-1" },
        message: { attachments: [{ type: "image" }] }
      }
    ]
  }]
});

assert.deepEqual(events, [{
  instagramAccountId: "business-account-1",
  from: "customer-1",
  text: "Is this available?",
  messageId: "message-1",
  timestamp: new Date(1792160000000).toISOString()
}]);
assert.deepEqual(parseInboundWebhook({ object: "page", entry: [] }), []);
const seenFixture = { object: 'instagram', entry: [{ id: 'ig-business', messaging: [
  { sender: { id: 'ig-business' }, recipient: { id: 'customer' }, timestamp: 1792160000000, read: { mid: 'outbound' } },
  { sender: { id: 'customer' }, recipient: { id: 'ig-business' }, timestamp: 1792160000000, read: { mid: 'inbound' } }
]}] };
assert.deepEqual(parseInstagramSeenWebhook(seenFixture), [], 'seen parsing stays disabled before the callback format is verified');
assert.deepEqual(parseInstagramSeenWebhook(seenFixture, { format: 'read_mid_v1' }).map(event => event.messageId), ['outbound']);
assert.deepEqual(parseInstagramSeenWebhook({ object: 'page', entry: [] }), []);

const rawBody = Buffer.from(JSON.stringify({ object: "instagram" }));
const appSecret = "test-app-secret";
const signature = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
assert.equal(verifyWebhookSignature(rawBody, signature, appSecret), true);
assert.equal(verifyWebhookSignature(rawBody, signature, "wrong-secret"), false);
assert.equal(verifyWebhookSignature(null, signature, appSecret), false);

console.log("Instagram service parser and signature tests passed.");
