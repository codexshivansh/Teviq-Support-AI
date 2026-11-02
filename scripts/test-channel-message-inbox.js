const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { createChannelMessageWorker } = require('../services/channelMessageWorker.service');
const { enqueueChannelMessages } = require('../services/channelMessageInbox.service');

async function run() {
  const db = new PGlite();
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create table brands(id text primary key); insert into brands values ('brand-a'), ('brand-b'); create table instagram_webhook_events(message_id text primary key); insert into instagram_webhook_events values ('legacy');");
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/0028_add_channel_message_inbox.sql'), 'utf8'));
    const add = async (id, customer = 'customer', channel = 'whatsapp') => db.query(`
      insert into channel_message_inbox(channel, account_id, message_id, brand_id, customer_id, message, event_at)
      values ($1, 'account', $2, 'brand-a', $3, 'Question', now()) on conflict do nothing returning *`, [channel, id, customer]);
    const claim = async (worker = randomUUID()) => (await db.query('select * from claim_channel_message($1)', [worker])).rows[0];
    const transition = async (event, action, value = {}) => {
      const { rows } = await db.query('select transition_channel_message($1,$2,$3,$4,$5,$6) as ok',
        [event.id, event.worker_id, action, value.reply || null, value.providerMessageId || null, value.errorCode || null]);
      if (!rows[0].ok) throw new Error('ownership_lost');
    };

    await Promise.all(Array.from({ length: 20 }, () => add('duplicate')));
    assert.equal((await db.query('select count(*)::int as n from channel_message_inbox')).rows[0].n, 1);
    await add('second');
    const claims = await Promise.all(Array.from({ length: 10 }, () => claim()));
    assert.equal(claims.filter(Boolean).length, 1, 'only the first event in a conversation can be claimed');
    const first = claims.find(Boolean);
    await assert.rejects(transition({ ...first, worker_id: randomUUID() }, 'ready', { reply: 'Wrong worker' }));
    await transition(first, 'ready', { reply: 'Saved answer' });
    await db.query("update channel_message_inbox set lease_until = now() - interval '1 second' where id=$1", [first.id]);
    const recovered = await claim();
    assert.equal(recovered.reply, 'Saved answer', 'persisted reply survives restart');
    await assert.rejects(transition(first, 'sending'));
    await transition(recovered, 'sending');
    await db.query("update channel_message_inbox set lease_until=now()-interval '1 second' where id=$1", [first.id]);
    assert.equal(await claim(), undefined, 'ambiguous send blocks replay and later conversation events');
    assert.equal((await db.query('select status from channel_message_inbox where id=$1', [first.id])).rows[0].status, 'needs_review');

    await add('other-channel', 'customer', 'instagram');
    let brainCalls = 0, sends = 0;
    const adapter = { resolve: async () => ({ brandId: 'brand-a' }), send: async () => { sends++; return { message_id: 'delivered' }; } };
    const inbox = { claimChannelMessage: claim, transitionChannelMessage: transition };
    const worker = createChannelMessageWorker({ inbox, processMessage: async () => { brainCalls++; return { reply: 'Answer' }; }, whatsapp: adapter, instagram: adapter, report: () => {} });
    await worker.drain();
    assert.equal(brainCalls, 1); assert.equal(sends, 1);
    await worker.drain();
    assert.equal(sends, 1, 'completed event is not resent');

    await add('resume-ready', 'other-customer');
    const ready = await claim();
    await transition(ready, 'ready', { reply: 'Already generated' });
    await db.query("update channel_message_inbox set lease_until=now()-interval '1 second' where id=$1", [ready.id]);
    await worker.drain();
    assert.equal(brainCalls, 1, 'ready recovery must not regenerate an AI reply');
    assert.equal(sends, 2);

    await add('interrupted-generation', 'third-customer');
    const interrupted = await claim();
    await db.query("update channel_message_inbox set lease_until=now()-interval '1 second' where id=$1", [interrupted.id]);
    await worker.drain();
    assert.equal(brainCalls, 1, 'unknown AI/action outcome must not be replayed');

    await add('old', 'fourth-customer');
    await db.exec("update channel_message_inbox set event_at=now()-interval '25 hours' where message_id='old'");
    await worker.drain(); assert.equal(sends, 2);
    await add('owner-changed', 'fifth-customer');
    const otherAdapter = { ...adapter, resolve: async () => ({ brandId: 'brand-b' }) };
    await createChannelMessageWorker({ inbox, processMessage: async () => { throw new Error('must not run'); }, whatsapp: otherAdapter, instagram: otherAdapter }).drain();
    assert.equal(sends, 2);

    await add('timeout', 'sixth-customer');
    const timeoutAdapter = { ...adapter, send: async () => { sends++; throw new Error('provider outcome unknown'); } };
    await createChannelMessageWorker({ inbox, processMessage: async () => ({ reply: 'Hello' }), whatsapp: timeoutAdapter, instagram: timeoutAdapter, report: () => {} }).drain();
    await worker.drain(); assert.equal(sends, 3, 'ambiguous provider delivery is not automatically retried');

    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from channel_message_inbox'));
    await assert.rejects(db.query('select * from claim_channel_message($1)', [randomUUID()]));
    await db.exec('reset role');

    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/0030_add_conversation_handoffs.sql'), 'utf8'));
    await db.query('select set_conversation_handoff($1,$2,$3,$4,$5)', ['brand-a', 'whatsapp', 'handoff-customer', 'operator', true]);
    assert.equal((await db.query("select paused from conversation_handoffs where customer_id='handoff-customer'")).rows[0].paused, true);
    await add('human-held', 'handoff-customer');
    const pausedWorker = createChannelMessageWorker({ inbox, processMessage: async () => { throw new Error('paused brain must not run'); },
      whatsapp: adapter, instagram: adapter, getHandoff: async () => ({ paused: true }), report: () => {} });
    await pausedWorker.drain();
    assert.equal(sends, 3);
    assert.equal((await db.query("select error_code from channel_message_inbox where message_id='human-held'")).rows[0].error_code, 'human_takeover');
    await db.query('select set_conversation_handoff($1,$2,$3,$4,$5)', ['brand-a', 'whatsapp', 'handoff-customer', 'operator', false]);
    assert.equal((await db.query('select count(*)::int as n from conversation_handoff_actions')).rows[0].n, 2);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from conversation_handoffs'));
    await assert.rejects(db.query('select set_conversation_handoff($1,$2,$3,$4,$5)', ['brand-a','widget','victim','fake',true]));
    await db.exec('reset role');
    await add('legacy', 'legacy-customer', 'instagram');
    const legacy = (await db.query("select status,error_code from channel_message_inbox where message_id='legacy'")).rows[0];
    assert.equal(legacy.status, 'needs_review');
    assert.equal(legacy.error_code, 'legacy_instagram_event');
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/0029_add_channel_inbox_review.sql'), 'utf8'));
    const review = async (id, brand, action) => (await db.query('select review_channel_message($1,$2,$3,$4,$5) as ok',
      [id, brand, 'test-operator', action, 'Checked provider records and handled manually.'])).rows[0].ok;
    assert.equal(await review(first.id, 'brand-b', 'resolve'), false, 'review cannot cross workspace boundary');
    assert.equal(await review(first.id, 'brand-a', 'resolve'), true);
    assert.equal(await review(first.id, 'brand-a', 'resolve'), false, 'resolution cannot be applied twice');
    assert.equal((await claim()).message_id, 'second', 'resolution unblocks later messages');
    const timeout = (await db.query("select * from channel_message_inbox where message_id='timeout'")).rows[0];
    assert.equal(await review(timeout.id, 'brand-a', 'retry_reply'), true);
    await worker.drain();
    assert.equal(brainCalls, 1, 'operator retry uses saved reply without regenerating');
    assert.equal(sends, 4);
    assert.equal((await db.query('select count(*)::int as n from channel_message_reviews')).rows[0].n, 2);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from channel_message_reviews'));
    await assert.rejects(db.query('select review_channel_message($1,$2,$3,$4,$5)', [first.id, 'brand-a', 'actor', 'resolve', 'unauthorized request']));
    await db.exec('reset role');

    process.env.SUPABASE_URL = 'https://synthetic.invalid';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic';
    let writes = 0;
    global.fetch = async (url, options) => {
      writes++;
      assert.match(url, /on_conflict=channel,account_id,message_id/);
      assert.equal(options.headers.Prefer, 'resolution=ignore-duplicates,return=minimal');
      const rows = JSON.parse(options.body);
      assert.equal(rows[0].brand_id, 'brand-a');
      assert.equal(JSON.stringify(rows).includes('accessToken'), false);
      return { ok: true, text: async () => '' };
    };
    const msg = { phoneNumberId: 'account', from: 'customer', messageId: 'id', text: 'hello', timestamp: String(Math.floor(Date.now() / 1000)) };
    const resolve = async () => ({ brandId: 'brand-a', accessToken: 'must-not-store' });
    await enqueueChannelMessages('whatsapp', [msg], resolve);
    await assert.rejects(enqueueChannelMessages('whatsapp', [{ ...msg, messageId: null }], resolve));
    assert.equal(writes, 1);
    global.fetch = async () => ({ ok: false, status: 503 });
    await assert.rejects(enqueueChannelMessages('whatsapp', [msg], resolve));
    console.log('PASS inbox SQL constraints, fenced ownership, serial claim contenders, ordering, restart recovery, uncertain-delivery quarantine, RLS, safe persistence and worker tests');
    console.log('Note: embedded PostgreSQL test; multi-process hosted database contention remains a staging gate.');
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    await db.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
