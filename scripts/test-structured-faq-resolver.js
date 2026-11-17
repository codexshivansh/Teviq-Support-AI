const assert = require('node:assert/strict');

const structuredPath = require.resolve('../knowledge/structuredKnowledge.service');
const calls = [];
require.cache[structuredPath] = {
  id: structuredPath,
  filename: structuredPath,
  loaded: true,
  exports: {
    listItems: async (query) => {
      calls.push(query);
      return [
        { question: 'Kya main Teviq ko paise dene se pehle try kar sakta hoon?', answer: 'Hindi trial answer', tags: ['trial', 'pricing'] },
        { question: 'Can I try Teviq before paying?', answer: 'English trial answer', tags: ['trial', 'pricing'] },
        { question: 'Teviq ki cost kya hai?', answer: 'Hindi pricing answer', tags: ['pricing', 'cost'] },
        { question: 'What does Teviq cost?', answer: 'English pricing answer', tags: ['pricing', 'cost'] }
      ];
    }
  }
};

const { resolveStructuredFaq } = require('../services/structuredFaqResolver.service');

async function run() {
  assert.equal(await resolveStructuredFaq({ brandId: 'teviq', message: 'Hello', language: 'english' }), null);
  assert.equal((await resolveStructuredFaq({ brandId: 'teviq', message: 'What are the pricings?', language: 'english' })).answer, 'English pricing answer');
  assert.equal((await resolveStructuredFaq({ brandId: 'teviq', message: 'Teviq ka plan kitne ka hai?', language: 'hinglish' })).answer, 'Hindi pricing answer');
  assert.deepEqual(calls, [
    { brandId: 'teviq', type: 'faq', search: 'pricing' },
    { brandId: 'teviq', type: 'faq', search: 'pricing' }
  ]);
  console.log('PASS structured pricing FAQ answers are deterministic across English and Hinglish queries');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
