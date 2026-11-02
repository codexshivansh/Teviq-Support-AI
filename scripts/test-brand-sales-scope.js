const assert = require('node:assert/strict');
const aiPath = require.resolve('../services/ai.service');
const calls = [];
require.cache[aiPath] = { id: aiPath, filename: aiPath, loaded: true, exports: {
  callGroq: async (prompt, options) => { calls.push({ prompt, options }); return 'Synthetic sales answer.'; }
} };
const { resolveB2bObjection } = require('../services/b2bObjection.service');
const { detectIntent } = require('../brain/intentEngine');
const { routeTools } = require('../brain/toolRouter');

async function run() {
  const queries = ['We can build this in-house', 'trial chahiye', 'integration complicated hai', 'reseller margin kya', 'live demo'];
  for (const message of queries) {
    assert.match(detectIntent(message, 'teviq'), /^b2b_/);
    for (const brandId of ['client-brand', 'teviq-lookalike', undefined]) {
      assert.equal(detectIntent(message, brandId).startsWith('b2b_'), false);
    }
  }
  const client = { brandId: 'client-brand', brandName: 'Teviq', policies: {}, contact: {} };
  const blocked = await resolveB2bObjection({ intent: 'b2b_trial_objection', message: 'free try', brand: client });
  assert.equal(blocked.source, 'system'); assert.equal(calls.length, 0);
  const routed = await routeTools({ brand: client, intent: 'b2b_trial_objection', message: 'free try', entities: {} });
  assert.equal(routed.allowAI, true); assert.equal(calls.length, 0);
  const subjective = await routeTools({ brand: client, intent: 'subjective_opinion', message: 'Is it good?', entities: {} });
  assert.equal(subjective.allowAI, true);
  await resolveB2bObjection({ intent: 'b2b_trial_objection', message: 'free try', brand: { ...client, brandId: 'teviq' }, channel: 'instagram' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.channel, 'instagram');
  assert.match(calls[0].prompt, /3 days from workspace activation/);
  assert.doesNotMatch(calls[0].prompt, /7-day|live in 24 hours|10 minutes/);
  console.log('PASS Teviq sales scope at intent, router and provider boundaries; no Teviq sales leak into client brands');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
