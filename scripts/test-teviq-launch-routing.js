const assert = require('node:assert/strict');
const cases = require('./fixtures/teviq-launch-questions.json');
const { detectIntent } = require('../brain/intentEngine');
let failures = 0;
for (const test of cases) {
  try { assert.equal(detectIntent(test.question, 'teviq'), test.expectedIntent); }
  catch { failures++; console.error(`FAIL ${test.id}: ${test.question}`); }
}
console.log(`${cases.length - failures}/${cases.length} Teviq routing cases passed. Routing only; real answer acceptance is a separate live evaluation.`);
process.exitCode = failures ? 1 : 0;
