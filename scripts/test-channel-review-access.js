const assert = require('node:assert/strict');
const express = require('express');
const storeCalls = [];
const handoffs = [];
function stub(path, exports) { const id = require.resolve(path); require.cache[id] = { id, filename: id, loaded: true, exports }; }
stub('../services/clerkMetadata.service', {
  getUserPublicMetadata: async id => id === 'admin' ? { role: 'teviq_admin' } : { brandId: 'brand-a' },
  getMetadataBrandId: value => value.brandId
});
stub('../services/channelMessageInbox.service', {
  listChannelMessageReviews: async (brandId, before) => { storeCalls.push({ brandId, before }); return { items: [], nextCursor: null }; },
  reviewChannelMessage: async value => { storeCalls.push(value); return true; }
});
stub('../services/conversationHandoff.service', {
  getConversationHandoff: async value => { handoffs.push(value); return { paused: false }; },
  setConversationHandoff: async value => { handoffs.push(value); }
});
const router = require('../routes/channelInbox.routes');
const handoffRouter = require('../routes/conversations.routes');

async function run() {
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.auth = { userId: req.get('x-test-user'), sessionType: req.get('x-test-session') }; next(); });
  app.use('/queue', router);
  app.use('/handoff', handoffRouter);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/queue`;
  async function request(path, { user = 'client', session = 'clerk', body } = {}) {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET',
      headers: { 'x-test-user': user, 'x-test-session': session, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    await response.text(); return response.status;
  }
  try {
    const resolve = { action: 'resolve', reason: 'Checked the conversation and handled manually.' };
    assert.equal(await request('/brand-a', { session: 'demo' }), 401);
    assert.equal(await request('/brand-b'), 403);
    assert.equal(await request('/brand-b/1/review', { body: resolve }), 403);
    assert.equal(await request('/brand-a?before=bad'), 400);
    assert.equal(await request('/brand-a/1/review', { body: { action: 'retry_reply', reason: resolve.reason, confirmedNotDelivered: true } }), 403);
    assert.equal(storeCalls.length, 0);
    assert.equal(await request('/brand-a?before=20'), 200);
    assert.deepEqual(storeCalls[0], { brandId: 'brand-a', before: '20' });
    assert.equal(await request('/brand-a/1/review', { body: resolve }), 200);
    assert.equal(storeCalls[1].actorId, 'client');
    assert.equal(await request('/brand-b/2/review', { user: 'admin', body: { ...resolve, action: 'retry_reply' } }), 400);
    assert.equal(await request('/brand-b/2/review', { user: 'admin', body: { ...resolve, action: 'retry_reply', confirmedNotDelivered: true } }), 200);
    assert.equal(storeCalls[2].brandId, 'brand-b');
    const handoffUrl = base.replace('/queue', '/handoff');
    const change = async (brandId, session = 'clerk') => {
      const r = await fetch(`${handoffUrl}/${brandId}/whatsapp/customer/handoff`, { method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'client', 'x-test-session': session },
        body: JSON.stringify({ paused: true }) });
      await r.text(); return r.status;
    };
    assert.equal(await change('brand-b'), 403);
    assert.equal(await change('brand-a', 'demo'), 401);
    assert.equal(handoffs.length, 0);
    assert.equal(await change('brand-a'), 200);
    assert.equal(handoffs[0].actorId, 'client');
    assert.equal(handoffs[0].paused, true);
    console.log('PASS delivery review: demo denied, client workspace isolation, cursor validation, actor attribution, admin-only confirmed retry');
  } finally { await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
