const assert = require('node:assert/strict');
const { enrichDeliveryStatuses } = require('../services/conversations.service');
const { listProviderMessageStatuses } = require('../services/channelMessageInbox.service');

async function run() {
  const calls = [];
  const conversations = [
    { id: 'wa-1', channel: 'whatsapp', messages: [
      { role: 'assistant', providerMessageId: 'wa-a' },
      { role: 'assistant', providerMessageId: 'wa-b' }
    ] },
    { id: 'wa-2', channel: 'whatsapp', messages: [{ role: 'assistant', providerMessageId: 'wa-c' }] },
    { id: 'ig-1', channel: 'instagram', messages: [{ role: 'assistant', providerMessageId: 'ig-a' }] },
    { id: 'web-1', channel: 'widget', messages: [{ role: 'assistant' }] }
  ];
  const loadStatuses = async (brandId, channel, ids) => {
    calls.push({ brandId, channel, ids: [...ids].sort() });
    return ids.map(id => ({ provider_message_id: id, provider_status: id === 'wa-b' ? 'read' : 'accepted' }));
  };
  const result = await enrichDeliveryStatuses({ brandId: 'brand-a', conversations, loadStatuses });
  assert.equal(calls.length, 2, 'delivery status reads are batched once per messaging channel');
  assert.deepEqual(calls.find(call => call.channel === 'whatsapp').ids, ['wa-a', 'wa-b', 'wa-c']);
  assert.deepEqual(calls.find(call => call.channel === 'instagram').ids, ['ig-a']);
  assert.equal(result[0].messages[1].deliveryStatus, 'read');
  assert.equal(result[1].messages[0].deliveryStatus, 'accepted');
  assert.equal(result[3].messages[0].deliveryStatus, undefined, 'website widget messages are outside provider delivery tracking');
  assert.notEqual(result, conversations, 'enrichment does not mutate the input list');

  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const requests = [];
  try {
    process.env.SUPABASE_URL = 'https://synthetic.invalid';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service-key';
    global.fetch = async input => {
      requests.push(String(input));
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    await listProviderMessageStatuses('brand-a', 'whatsapp', Array.from({ length: 205 }, (_, index) => `message-${index}`));
    assert.equal(requests.length, 3, 'large provider-ID sets use bounded chunks instead of one oversized URL');
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
  console.log('Conversation delivery status tests passed: one batched lookup per channel and truthful fallback.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
