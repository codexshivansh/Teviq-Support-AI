const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const key = value => String(value || '').trim().toLowerCase();
const fields = item => ({ question: item.question, answer: item.answer, tags: item.tags || [] });
const same = (a, b) => JSON.stringify(fields(a)) === JSON.stringify(fields(b));

async function syncFaqs({ brandId, desired, service, apply = false, backupDir }) {
  const existing = await service.listItems({ brandId, type: 'faq' });
  const seen = new Set();
  const plan = desired.map(item => {
    if (!item.question?.trim() || !item.answer?.trim() || seen.has(key(item.question))) throw new Error('Invalid or duplicate desired FAQ');
    seen.add(key(item.question));
    const matches = existing.filter(row => key(row.question) === key(item.question));
    if (matches.length > 1) throw new Error('Duplicate stored question requires manual reconciliation');
    return { before: matches[0] || null, after: fields(item), action: matches[0] ? (same(matches[0], item) ? 'keep' : 'update') : 'create' };
  });
  const counts = plan.reduce((out, row) => ({ ...out, [row.action]: (out[row.action] || 0) + 1 }), {});
  if (!apply) return { mode: 'preview', counts, preservedUnrelated: existing.filter(row => !seen.has(key(row.question))).length };
  if (!backupDir || !path.isAbsolute(backupDir)) throw new Error('An absolute private backup directory is required');
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const file = path.join(backupDir, `faq-sync-${randomUUID()}.json`);
  const journal = { brandId, createdAt: new Date().toISOString(), original: existing, plan, completed: [], status: 'started' };
  const save = () => fs.writeFileSync(file, JSON.stringify(journal, null, 2), { mode: 0o600 });
  save(); // Fail before the first mutation if the recovery copy cannot be written.
  try {
    for (const row of plan.filter(item => item.action !== 'keep')) {
      const current = await service.listItems({ brandId, type: 'faq' });
      const matches = current.filter(item => key(item.question) === key(row.after.question));
      if (row.before ? (matches.length !== 1 || matches[0].id !== row.before.id || !same(matches[0], row.before)) : matches.length) {
        throw new Error('Knowledge changed during sync; reconcile the recovery journal before retrying');
      }
      const result = row.before
        ? await service.updateFaq({ brandId, faqId: row.before.id, updates: row.after })
        : await service.createFaq({ brandId, ...row.after });
      if (!result.item || result.error) throw new Error('FAQ write failed; recovery journal retained');
      journal.completed.push({ id: result.item.id, action: row.action });
      save();
    }
    const actual = await service.listItems({ brandId, type: 'faq' });
    if (!desired.every(item => actual.some(row => same(row, item)))) throw new Error('Read-back verification failed');
    journal.status = 'verified'; save();
    return { mode: 'applied', counts, recoveryJournal: file };
  } catch (error) {
    journal.status = 'stopped'; save();
    // Existing rows are never bulk-deleted. Retain originals and completed IDs
    // so an operator can restore only this batch without overwriting later edits.
    throw new Error(`${error.message}. Recovery journal: ${file}`);
  }
}

module.exports = { syncFaqs };
