const fs = require('node:fs');
const path = require('node:path');
const { FAQS } = require('./seed-teviq-faqs');
const { rankChunks } = require('../knowledge/localTextSearch');
const fixture = require('../data/evaluation/retrieval-regression.json');

const chunks = FAQS.flatMap((topic, index) => ['en', 'hi'].map(lang => ({
  id: `faq-${index}-${lang}`, topicIndex: index,
  text: `Q: ${topic[lang].question} A: ${topic[lang].answer}`,
  metadata: { question: topic[lang].question, source_type: 'faq' }
})));
const results = fixture.cases.map(item => {
  const matches = rankChunks(chunks, item.question, 3);
  const confident = matches.filter(match => match.score >= 0.68);
  const passed = item.topicIndex === null ? confident.length === 0
    : confident.some(match => match.topicIndex === item.topicIndex);
  return { ...item, passed, topMatches: matches.map(match => ({ id: match.id, score: Number(match.score.toFixed(4)) })) };
});
const known = results.filter(r => r.topicIndex !== null);
const unsupported = results.filter(r => r.topicIndex === null);
const summary = { scope: 'Offline retrieval relevance only; no paid model calls or answer-quality claims.',
  total: results.length, passed: results.filter(r => r.passed).length,
  knownPassed: known.filter(r => r.passed).length, knownTotal: known.length,
  unsupportedPassed: unsupported.filter(r => r.passed).length, unsupportedTotal: unsupported.length,
  results };
const output = process.argv[2];
if (output) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\n'); }
console.log(`Retrieval relevance: ${summary.knownPassed}/${known.length} supported cases; ${summary.unsupportedPassed}/${unsupported.length} unsupported cases safely below confidence threshold.`);
for (const row of results.filter(r => !r.passed)) console.log(`FAIL ${row.id}: ${row.question} (${row.topMatches.map(m => `${m.id}:${m.score}`).join(', ')})`);
if (summary.knownPassed / known.length < 0.9 || summary.unsupportedPassed !== unsupported.length) process.exitCode = 1;
