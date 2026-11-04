const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { syncFaqs } = require('./lib/sync-faqs');

(async () => {
  let rows = [{ id: 'a', question: 'Question?', answer: 'Old', tags: [] }, { id: 'custom', question: 'Custom?', answer: 'Keep', tags: [] }];
  let writes = 0;
  const service = {
    listItems: async () => structuredClone(rows),
    updateFaq: async ({ faqId, updates }) => { writes++; const item = { id: faqId, ...updates }; rows = rows.map(row => row.id === faqId ? item : row); return { item }; },
    createFaq: async () => { throw new Error('Synthetic indexing failure'); }
  };
  const desired = [{ question: 'Question?', answer: 'New', tags: [] }];
  await syncFaqs({ brandId: 'synthetic', desired, service }); assert.equal(writes, 0);
  await assert.rejects(syncFaqs({ brandId: 'synthetic', desired, service, apply: true }), /backup directory/); assert.equal(writes, 0);
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teviq-faq-sync-'));
  const done = await syncFaqs({ brandId: 'synthetic', desired, service, apply: true, backupDir });
  assert.equal(rows.length, 2); assert.equal(rows[0].id, 'a'); assert.equal(rows[1].answer, 'Keep');
  const journal = JSON.parse(fs.readFileSync(done.recoveryJournal)); assert.equal(journal.original[0].answer, 'Old'); assert.equal(journal.status, 'verified');
  await syncFaqs({ brandId: 'synthetic', desired, service, apply: true, backupDir }); assert.equal(writes, 1, 'rerun is idempotent');
  await assert.rejects(syncFaqs({ brandId: 'synthetic', desired: [...desired, { question: 'New?', answer: 'New', tags: [] }], service, apply: true, backupDir }), /Recovery journal/);
  assert.equal(rows.length, 2, 'failed insertion preserves existing knowledge');
  assert.ok(fs.readdirSync(backupDir).some(file => JSON.parse(fs.readFileSync(path.join(backupDir, file))).status === 'stopped'));
  console.log('PASS FAQ sync preview, backup prerequisite, preserved IDs/custom content, idempotence and failure journal');
})().catch(error => { console.error(error); process.exitCode = 1; });
