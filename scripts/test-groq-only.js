const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.GROQ_API_KEY = 'test-key';
process.env.GEMINI_API_KEY = 'stale-key-must-not-enable-google';
const ai = require('../services/ai.service');
const embeddings = require('../knowledge/embedding.service');
const store = require('../knowledge/vectorStore.service');
const { retrieveKnowledge } = require('../knowledge/retrieval.service');
const { rankChunks } = require('../knowledge/localTextSearch');
const { resolveSalesObjection } = require('../services/salesObjection.service');
const { resolveB2bObjection } = require('../services/b2bObjection.service');

const originalFetch = global.fetch;
const calls = [];
let groqStatus = 200;
let wrongBrand = false;
let paginated = false;
const row = { id: 'faq-1', brand_id: 'review-brand', document_id: null,
  text: 'Q: How long does delivery take? A: Delivery takes 3 to 5 business days.',
  metadata: { source_type: 'faq', sourceName: 'Delivery FAQ', question: 'How long does delivery take?' } };
const response = (status, data) => ({ ok: status >= 200 && status < 300, status,
  async json() { return data; }, async text() { return JSON.stringify(data); } });
global.fetch = async (raw, options = {}) => {
  const url = new URL(raw);
  calls.push({ url, options });
  assert.ok(['api.groq.com', 'test-project.supabase.co'].includes(url.hostname), 'Unexpected external provider');
  if (url.hostname === 'api.groq.com') {
    assert.equal(url.pathname, '/openai/v1/chat/completions');
    return response(groqStatus, groqStatus === 200
      ? { choices: [{ message: { content: 'Delivery takes 3 to 5 business days.' }, finish_reason: 'stop' }] }
      : { error: { message: 'Synthetic quota error' } });
  }
  if (options.method === 'POST') return response(201, null);
  if (options.method === 'DELETE') {
    assert.equal(url.searchParams.get('brand_id'), 'eq.review-brand');
    assert.equal(url.searchParams.get('document_id'), 'eq.synthetic-doc');
    return response(200, []);
  }
  assert.equal(url.searchParams.get('brand_id'), 'eq.review-brand');
  assert.ok(!url.searchParams.get('select').includes('embedding'));
  if (wrongBrand) return response(200, [{ ...row, brand_id: 'private-other-brand' }]);
  if (paginated && url.searchParams.get('offset') === '0') {
    return response(200, Array.from({ length: 500 }, (_, i) => ({ ...row, id: `noise-${i}`, text: 'Unrelated catalog details', metadata: {} })));
  }
  return response(200, [row]);
};

async function run() {
  const before = calls.length;
  const vectors = await embeddings.embedBatchForStorage(['Delivery policy', 'डिलीवरी नीति']);
  await embeddings.embedForQuery('customer-private-text');
  await embeddings.embedForStorage('uploaded-private-text');
  assert.equal(calls.length, before, 'Local features must not use a network API');
  assert.equal(vectors.length, 2);
  for (const v of vectors) {
    assert.equal(v.length, 768);
    assert.ok(v.every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-10);
  }
  await assert.rejects(ai.callGemini('private-text'), { code: 'gemini_disabled' });
  assert.equal(calls.length, before, 'Deprecated Gemini entry must fail before network access');

  const brand = { brandName: 'Review Brand', brandCategory: 'Support', policies: {}, contact: {}, managerContact: {} };
  const context = { brand, faqs: [], message: 'delivery time', customerId: 'test-customer', intent: 'general_faq', language: 'english', memory: [], knowledge: { lowConfidence: false, matches: [], citations: [], contextText: '' } };
  assert.equal((await ai.generateSupportReply(context)).source, 'groq');
  assert.equal((await resolveSalesObjection({ brand, intent: 'delivery_objection', message: 'delivery time' })).source, 'groq');
  assert.equal((await resolveB2bObjection({ brand, intent: 'b2b_trial_objection', message: 'test trial' })).source, 'groq');
  groqStatus = 429;
  const safe = await ai.generateSupportReply({ ...context, knowledge: null });
  assert.equal(safe.source, 'system'); assert.equal(safe.needsEscalation, true);
  assert.equal((await resolveSalesObjection({ brand, intent: 'delivery_objection', message: 'delivery time' })).source, 'system');
  assert.equal((await resolveB2bObjection({ brand, intent: 'b2b_trial_objection', message: 'test trial' })).source, 'system');
  assert.equal(calls.filter(call => call.url.hostname === 'api.groq.com').length, 6);

  const exact = await retrieveKnowledge({ brandId: 'review-brand', query: 'How long does delivery take?' });
  assert.equal(exact.lowConfidence, false); assert.equal(exact.retrievalMode, 'lexical');
  assert.equal(exact.citations[0].chunkId, row.id);
  assert.equal((await retrieveKnowledge({ brandId: 'review-brand', query: 'quantum banana calculator' })).matches.length, 0);
  const weak = await retrieveKnowledge({ brandId: 'review-brand', query: 'delivery pineapple quantum warranty' });
  assert.equal(weak.lowConfidence, true);
  assert.ok(rankChunks([{ id: 'hindi', text: 'डिलीवरी शुल्क मुफ्त है', metadata: {} }], 'डिलीवरी शुल्क', 5)[0].score >= 0.68);
  assert.ok(rankChunks([{ id: 'hinglish', text: 'Delivery charges free hain', metadata: {} }], 'delivery charges kya hai', 5)[0].score >= 0.68);
  assert.equal(rankChunks([{ id: 'only', text: 'Delivery terms', metadata: {} }], 'delivery', 5)[0].score, 0.6);
  paginated = true;
  assert.equal((await store.searchText({ brandId: 'review-brand', query: 'delivery take' }))[0].id, row.id);
  assert.ok(calls.some(call => call.url.searchParams.get('offset') === '500'));
  paginated = false;
  wrongBrand = true;
  const isolated = await retrieveKnowledge({ brandId: 'review-brand', query: 'delivery take' });
  assert.equal(isolated.matches.length, 0); assert.equal(isolated.lowConfidence, true);
  wrongBrand = false;
  const priorInvalid = calls.length;
  await assert.rejects(store.searchText({ brandId: '', query: 'test' }));
  assert.equal(calls.length, priorInvalid);
  await assert.rejects(store.search({ brandId: 'review-brand', queryEmbedding: vectors[0] }));

  const uploadStart = calls.length;
  await store.upsertDocument({ document: { brandId: 'review-brand', documentId: 'synthetic-doc' }, chunks: [{ id: 'synthetic-chunk', brandId: 'review-brand', documentId: 'synthetic-doc', text: 'Synthetic knowledge', embedding: vectors[0], metadata: {} }] });
  const chunkWrite = calls.slice(uploadStart).find(call => call.options.method === 'POST' && call.url.pathname.endsWith('/knowledge_chunks'));
  const saved = JSON.parse(chunkWrite.options.body)[0];
  assert.equal(saved.metadata.retrieval_mode, 'lexical');
  assert.equal(saved.metadata.embedding_model, embeddings.MODEL);
  assert.equal(JSON.parse(saved.embedding_v3).length, 768);
  console.log('PASS Groq-only support/sales/B2B, quota fallback, no Gemini egress, offline indexing, lexical relevance, pagination and brand isolation');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; });
