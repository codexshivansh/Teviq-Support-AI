const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.GROQ_API_KEY = 'test-key';
process.env.AI_TRIAL_METERING_ENABLED = 'true';

const { callGroq } = require('../services/ai.service');
const { getAiUsageSummary } = require('../services/aiUsage.service');
const originalFetch = global.fetch;
const calls = [];
let allowed = true;
let incompleteOnce = false;

global.fetch = async (raw, options = {}) => {
  const url = new URL(raw);
  const body = options.body ? JSON.parse(options.body) : null;
  calls.push({ url, body });
  if (url.pathname.endsWith('/rpc/reserve_ai_usage')) {
    assert.equal(body.p_brand_id, 'trial-brand');
    assert.equal(body.p_channel, 'whatsapp');
    return { ok: true, async text() { return JSON.stringify(allowed ? 'allowed' : 'brand_limit'); } };
  }
  if (url.pathname.endsWith('/rpc/finish_ai_usage')) {
    assert.equal(body.p_total_tokens, 230);
    return { ok: true, async text() { return ''; } };
  }
  if (url.hostname === 'api.groq.com') {
    const incomplete = incompleteOnce;
    incompleteOnce = false;
    return { ok: true, async json() { return {
      choices: [{ message: { content: incomplete ? 'Incomplete and' : 'A complete answer.' }, finish_reason: incomplete ? 'length' : 'stop' }],
      usage: { prompt_tokens: 200, completion_tokens: 30, total_tokens: 230 }
    }; } };
  }
  if (url.pathname.endsWith('/ai_trial_limits')) {
    return { ok: true, async text() { return JSON.stringify([{ enabled: true, max_calls_per_day: 10, max_tokens_per_day: 30000 }]); } };
  }
  if (url.pathname.endsWith('/ai_usage_events')) {
    return { ok: true, async text() { return JSON.stringify([{ status: 'completed', prompt_tokens: 200, completion_tokens: 30, total_tokens: 230, reserved_tokens: 500, model: 'openai/gpt-oss-20b', channel: 'whatsapp' }]); } };
  }
  throw new Error(`Unexpected URL ${url}`);
};

(async () => {
  assert.equal(await callGroq('Question', { brandId: 'trial-brand', channel: 'whatsapp' }), 'A complete answer.');
  assert.equal(calls.filter(call => call.url.hostname === 'api.groq.com').length, 1);
  assert.equal(calls.filter(call => call.url.pathname.endsWith('/rpc/finish_ai_usage')).length, 1);
  const summary = await getAiUsageSummary('trial-brand');
  assert.equal(summary.tokens, 230);
  assert.equal(summary.calls, 1);
  assert.ok(summary.estimatedUsd > 0);
  incompleteOnce = true;
  assert.equal(await callGroq('Retry question', { brandId: 'trial-brand', channel: 'whatsapp' }), 'A complete answer.');
  assert.equal(calls.filter(call => call.url.hostname === 'api.groq.com').length, 3, 'retry must be separately metered');
  assert.equal(calls.filter(call => call.url.pathname.endsWith('/rpc/finish_ai_usage')).length, 3);
  allowed = false;
  await assert.rejects(callGroq('Question', { brandId: 'trial-brand', channel: 'whatsapp' }), { code: 'ai_trial_limit' });
  assert.equal(calls.filter(call => call.url.hostname === 'api.groq.com').length, 3, 'limit must stop calls before Groq');
  console.log('PASS AI usage reservation, accounting, dashboard summary and pre-call limit');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; });
