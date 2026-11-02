const assert = require('node:assert/strict');
const { resolveWidgetSession, TTL_SECONDS } = require('../services/widgetSession.service');
const { addConversationMessage, getConversationMemory, resetMemoryForTests } = require('../services/memory.service');

const seen = [];
function stub(path, exports) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
stub('../brain/supportBrain', { processMessage: async value => { seen.push(value); return { reply: 'synthetic' }; } });
stub('../services/brand.service', { getBrandById: async id => ({ brandId: id, isActive: true }) });
let paused = false;
stub('../services/conversationHandoff.service', { getConversationHandoff: async () => ({ paused }) });
stub('../services/analytics.service', { appendChatLog: async () => {} });
const { handleChat } = require('../controllers/chat.controller');

async function run() {
  const old = process.env.WIDGET_SESSION_SECRET;
  const oldFetch = global.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    process.env.WIDGET_SESSION_SECRET = 'synthetic-only-32-byte-key-for-tests';
    const now = Date.now();
    const first = resolveWidgetSession('brand-a', null, now);
    assert.equal(resolveWidgetSession('brand-a', first.token, now).customerId, first.customerId);
    assert.notEqual(resolveWidgetSession('brand-b', first.token, now).customerId, first.customerId);
    assert.notEqual(resolveWidgetSession('brand-a', first.token, now + TTL_SECONDS * 1000).customerId, first.customerId);
    const [payload, signature] = first.token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), customer: 'victim' })).toString('base64url');
    assert.notEqual(resolveWidgetSession('brand-a', `${forged}.${signature}`, now).customerId, first.customerId);
    assert.notEqual(resolveWidgetSession('brand-a', `${first.token}.extra`, now).customerId, first.customerId);
    process.env.WIDGET_SESSION_SECRET = 'rotated-secret-that-is-at-least-32-bytes';
    assert.notEqual(resolveWidgetSession('brand-a', first.token, now).customerId, first.customerId);
    delete process.env.WIDGET_SESSION_SECRET;
    assert.throws(() => resolveWidgetSession('brand-a'), { code: 'widget_session_not_configured' });
    process.env.WIDGET_SESSION_SECRET = 'synthetic-only-32-byte-key-for-tests';

    async function request(body) {
      let result;
      await handleChat({ body, ip: 'synthetic' }, { status() { return this; }, json(value) { result = value; } }, error => { throw error; });
      return result;
    }
    const response = await request({ brandId: 'brand-a', customerId: 'known-whatsapp-number', channel: 'whatsapp', message: 'Hi' });
    assert.notEqual(seen[0].customerId, 'known-whatsapp-number');
    assert.equal(seen[0].channel, 'widget');
    await request({ brandId: 'brand-a', sessionToken: response.sessionToken, customerId: 'another-victim', message: 'Follow up' });
    assert.equal(seen[1].customerId, seen[0].customerId);
    await request({ brandId: 'brand-a', customerId: 'known-whatsapp-number', message: 'Different visitor' });
    assert.notEqual(seen[2].customerId, seen[0].customerId);
    paused = true;
    const waiting = await request({ brandId: 'brand-a', sessionToken: response.sessionToken, message: 'Waiting for human' });
    assert.equal(waiting.escalated, true);
    assert.equal(seen.length, 3, 'paused widget must not call the brain');

    process.env.SUPABASE_URL = 'https://synthetic.invalid';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic';
    const urls = [];
    global.fetch = async url => {
      urls.push(new URL(url));
      const query = urls.at(-1).searchParams;
      return { ok: true, json: async () => [{ message: `${query.get('brand_id')}/${query.get('channel')}`, reply: 'scoped answer' }] };
    };
    resetMemoryForTests();
    for (const channel of ['widget', 'instagram', 'whatsapp']) {
      const history = await getConversationMemory('brand-a', 'same-id', channel);
      assert.equal(history[0].content, `eq.brand-a/eq.${channel}`);
      addConversationMessage('brand-a', 'same-id', 'user', `${channel} private`, channel);
    }
    assert.equal(urls.length, 3);
    for (const channel of ['widget', 'instagram', 'whatsapp']) {
      const memory = await getConversationMemory('brand-a', 'same-id', channel);
      assert.equal(memory.at(-1).content, `${channel} private`);
      assert.equal(memory.some(item => item.content.includes('other-brand-secret')), false);
    }
    const other = await getConversationMemory('brand-b', 'same-id', 'whatsapp');
    assert.equal(other[0].content, 'eq.brand-b/eq.whatsapp');
    for (const id of [null, undefined, '', 'guest']) {
      addConversationMessage('brand-a', id, 'user', 'must not share');
      assert.deepEqual(await getConversationMemory('brand-a', id), []);
    }
    // Tuple encoding prevents delimiter-based key collisions.
    addConversationMessage('a:b', 'c', 'user', 'secret', 'widget');
    addConversationMessage('a:b', 'c', 'assistant', 'secret answer', 'widget');
    const separate = await getConversationMemory('a', 'b:c', 'widget');
    assert.equal(separate.some(item => item.content === 'secret'), false);
    console.log('PASS signed widget sessions, ignored caller IDs, expiry/rotation/forgery, channel/brand memory isolation, guest and tuple collision protection');
  } finally {
    for (const [key, value] of [['WIDGET_SESSION_SECRET', old], ['SUPABASE_URL', oldUrl], ['SUPABASE_SERVICE_ROLE_KEY', oldKey]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    global.fetch = oldFetch;
    resetMemoryForTests();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
