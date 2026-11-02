const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { verifyWhatsAppWebhookSignature } = require('../services/whatsappWebhookSecurity.service');

// Stub every route dependency before loading it. No database, AI or Meta calls.
const counts = { parse: 0, lookup: 0, brain: 0, send: 0, persist: 0, receipts: 0 };
let storageFailure = false;
let storageGate;
let storageEntered;
function stub(path, exports) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
const pass = (req, res, next) => next();
stub('../services/whatsapp.service', {
  parseInboundWebhook: body => {
    counts.parse++;
    if (body?.statusEvent) return [];
    return [{ phoneNumberId: 'test-phone', from: 'test-customer', text: 'Hello', messageId: 'test-id' }];
  },
  parseWhatsAppStatusWebhook: body => body?.statusEvent ? [{ accountId: 'test-phone', messageId: 'outbound-test-id', status: 'delivered', timestamp: new Date().toISOString(), failureCategory: null }] : [],
  resolveBrandFromPhoneNumberId: async () => {
    counts.lookup++;
    return { brandId: 'test-brand', accessToken: 'synthetic' };
  },
  sendWhatsAppMessage: async () => { counts.send++; }
});
stub('../brain/supportBrain', { processMessage: async () => { counts.brain++; return { reply: 'Test reply' }; } });
stub('../services/analytics.service', { appendChatLog: async () => {} });
stub('../middleware/clerkAuth.middleware', { requireClerkAuth: pass });
stub('../middleware/brandAccess.middleware', { requireBrandAccess: pass });
stub('../middleware/asyncHandler', { asyncHandler: (fn) => fn });
stub('../services/customerReplyWindow.service', {});
stub('../integrations/whatsapp/whatsappConnection.store', {});
stub('../integrations/whatsapp/whatsappEmbeddedSignup.service', {});
stub('../services/channelMessageInbox.service', { applyProviderMessageStatus: async () => { counts.receipts++; return 1; }, enqueueChannelMessages: async (channel, messages) => {
  assert.equal(channel, 'whatsapp');
  assert.ok(messages.length <= 1);
  if (storageGate) { storageEntered(); await storageGate; }
  if (storageFailure) throw new Error('simulated storage failure');
  if (messages.length) counts.persist++;
} });
const router = require('../routes/whatsapp.routes');

const secret = 'synthetic-webhook-secret';
const body = '{ "object": "whatsapp_business_account", "text": "Namaste नमस्ते" }';
const sign = (value, key = secret) => `sha256=${crypto.createHmac('sha256', key).update(value).digest('hex')}`;
const savedSecret = process.env.WHATSAPP_APP_SECRET;
const savedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

async function main() {
  assert.equal(verifyWhatsAppWebhookSignature(Buffer.from(body), sign(body), secret), true);
  assert.equal(verifyWhatsAppWebhookSignature(undefined, sign(body), secret), false);
  assert.equal(verifyWhatsAppWebhookSignature(Buffer.from(body), [sign(body)], secret), false);

  const app = express();
  app.use(express.json({ verify: (req, res, raw) => { req.rawBody = Buffer.from(raw); } }));
  app.use('/api/whatsapp', router);
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const url = `http://127.0.0.1:${server.address().port}/api/whatsapp/webhook`;
  async function post(signature, payload = body) {
    const headers = { 'content-type': 'application/json' };
    if (signature !== undefined) headers['x-hub-signature-256'] = signature;
    const response = await fetch(url, { method: 'POST', headers, body: payload });
    await response.text();
    return response.status;
  }
  try {
    delete process.env.WHATSAPP_APP_SECRET;
    assert.equal(await post(sign(body)), 503);
    process.env.WHATSAPP_APP_SECRET = '   ';
    assert.equal(await post(sign(body)), 503);
    process.env.WHATSAPP_APP_SECRET = secret;
    for (const signature of [undefined, '', 'sha1=abc', 'sha256=bad', `sha256=${'z'.repeat(64)}`, sign(body, 'wrong')]) {
      assert.equal(await post(signature), 401);
    }
    assert.equal(await post(sign(body), body.replace('Namaste', 'Changed')), 401);
    // JSON is semantically equal, but different bytes must not validate.
    assert.equal(await post(sign(body), JSON.stringify(JSON.parse(body))), 401);
    assert.deepEqual(counts, { parse: 0, lookup: 0, brain: 0, send: 0, persist: 0, receipts: 0 });

    assert.equal(await post(sign(body)), 200);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(counts, { parse: 1, lookup: 0, brain: 0, send: 0, persist: 1, receipts: 0 });
    const statusBody = JSON.stringify({ object: 'whatsapp_business_account', statusEvent: true });
    assert.equal(await post(sign(statusBody), statusBody), 200, 'valid signed status callbacks are acknowledged');
    assert.equal(counts.receipts, 1, 'status callback reaches the scoped receipt store');
    storageFailure = true;
    assert.equal(await post(sign(body)), 503);
    assert.equal(counts.persist, 1);
    assert.equal(counts.brain, 0);
    storageFailure = false;
    let release;
    storageGate = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { storageEntered = resolve; });
    let acknowledged = false;
    const pending = post(sign(body)).then(status => { acknowledged = true; return status; });
    await entered;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(acknowledged, false, 'must not acknowledge before durable storage');
    release();
    assert.equal(await pending, 200);

    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    assert.equal((await fetch(`${url}?hub.mode=subscribe`)).status, 503);
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'test-verify-token';
    assert.equal((await fetch(`${url}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123`)).status, 403);
    assert.equal((await fetch(`${url}?hub.mode=subscribe&hub.verify_token=test-verify-token`)).status, 403);
    const handshake = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=123`);
    assert.equal(handshake.status, 200);
    assert.equal(await handshake.text(), '123');
    console.log('WhatsApp webhook security tests passed: raw-byte signatures, fail-closed configuration, rejected requests cause zero downstream calls, valid inbound processing, GET handshake.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [key, value] of [['WHATSAPP_APP_SECRET', savedSecret], ['WHATSAPP_WEBHOOK_VERIFY_TOKEN', savedToken]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
