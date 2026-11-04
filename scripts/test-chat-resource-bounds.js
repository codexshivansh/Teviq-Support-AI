const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://synthetic.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic';
const { buildPrompt } = require('../services/ai.service');
const { FAQS } = require('./seed-teviq-faqs');
const { rankChunks } = require('../knowledge/localTextSearch');

async function run() {
  const prompt = buildPrompt({ brand: { brandId: 'teviq', brandName: 'Teviq', policies: { refund: 'No automatic refunds.' } },
    faqs: [{ question: 'Trial?', answer: 'Three days.' }], message: 'What next?', customerId: 'private-session-marker',
    intent: 'general_faq', language: 'english', memory: [{ role: 'user', content: 'My trial ends tomorrow.' }],
    knowledge: { contextText: 'Store owner authorization is required.', citations: [{ chunkId: 'internal-chunk-marker' }] } });
  for (const fact of ['No automatic refunds.', 'Three days.', 'My trial ends tomorrow.', 'Store owner authorization is required.']) assert.ok(prompt.includes(fact));
  assert.doesNotMatch(prompt, /private-session-marker|internal-chunk-marker/);
  assert.match(prompt, /cannot cancel subscriptions/);
  assert.match(prompt, /Conflicting sources require explicit source precedence/);
  const chunks = FAQS.flatMap((t,i)=>['en','hi'].map(l=>({id:`${i}-${l}`,text:`${t[l].question} ${t[l].answer}`,metadata:{question:t[l].question}})));
  for (const question of ['Does day four automatically charge me?', 'Does installing the widget automatically connect Shopify orders?', 'Widget lagane se Shopify orders automatically connect ho jayenge?']) {
    const top = rankChunks(chunks,question,1)[0];
    assert.equal(top.metadata.question,question);
    assert.ok(top.score>=0.98);
  }
  const originalFetch = global.fetch, originalTimeout = global.setTimeout;
  const originalAbortTimeout = AbortSignal.timeout;
  const requestedTimeouts = [];
  global.setTimeout = (fn, ms, ...args) => { requestedTimeouts.push(ms); return originalTimeout(fn, Math.min(ms, 15), ...args); };
  AbortSignal.timeout = ms => { requestedTimeouts.push(ms); const c = new AbortController(); originalTimeout(()=>c.abort(),15);return c.signal; };
  global.fetch = async (_url, { signal }) => {
    assert.ok(signal, 'Every database request must have a deadline');
    return { ok:true, status:200, text:()=>new Promise((resolve,reject)=> {
      const fail=()=>reject(Object.assign(new Error('Synthetic stalled body'),{name:'AbortError'}));
      if(signal.aborted) fail(); else signal.addEventListener('abort',fail,{once:true});
    }) };
  };
  try {
    await assert.rejects(require('../services/brand.service').getBrandById('teviq'));
    await assert.rejects(require('../services/conversationState.service').getState('teviq','synthetic','widget'));
    await assert.rejects(require('../services/analytics.service').appendChatLog({brandId:'teviq',customerId:'synthetic'}));
    await assert.rejects(require('../knowledge/vectorStore.service').searchText({brandId:'teviq',query:'trial'}));
    assert.ok(requestedTimeouts.includes(8000));
    assert.ok(requestedTimeouts.includes(10000));
  } finally { global.fetch=originalFetch;global.setTimeout=originalTimeout;AbortSignal.timeout=originalAbortTimeout; }
  console.log('PASS prompt preserves knowledge and policy; relevant FAQs retrieved; stalled response bodies abort without retry');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
