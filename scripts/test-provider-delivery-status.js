const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { parseWhatsAppStatusWebhook } = require('../services/whatsapp.service');
const { parseInstagramSeenWebhook } = require('../services/instagram.service');

async function run() {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create table brands(id text primary key); insert into brands values ('brand-a'),('brand-b'); create table instagram_webhook_events(message_id text primary key);");
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/0028_add_channel_message_inbox.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/0034_add_provider_delivery_status.sql'), 'utf8'));
    await db.exec('create table chat_logs(id uuid primary key, brand_id text, customer_id text, channel text, reply text, created_at timestamptz default now())');
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/0035_add_chat_log_provider_message_id.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/0036_include_provider_status_in_customer_erasure.sql'), 'utf8'));
    const add = async ({ channel = 'whatsapp', account = 'phone-a', id, brand = 'brand-a' }) => {
      await db.query(`insert into channel_message_inbox(channel,account_id,message_id,brand_id,customer_id,message,event_at,status,provider_message_id)
        values ($1,$2,$3,$4,'customer','synthetic',now(),'sent',$3)`, [channel, account, id, brand]);
      await db.query('select record_provider_message_accepted($1,$2,$3,$4,$5,$6)', [channel, account, id, brand, 'customer', t1]);
    };
    const apply = async ({ channel = 'whatsapp', account = 'phone-a', id, status, time, failure = null }) => {
      const result = await db.query('select apply_provider_message_status($1,$2,$3,$4,$5,$6) as n',
        [channel, account, id, status, time, failure]);
      return result.rows[0].n;
    };
    const get = async id => (await db.query('select * from channel_message_inbox where message_id=$1', [id])).rows[0];
    const t1 = '2026-11-02T00:00:01.000Z', t2 = '2026-11-02T00:00:02.000Z', t3 = '2026-11-02T00:00:03.000Z';
    await add({ id: 'wa-a' });
    await db.query('select record_provider_message_accepted($1,$2,$3,$4,$5,$6)',
      ['whatsapp','phone-a','manual-only','brand-a','manual-customer',t1]);
    await db.query('select apply_provider_message_status($1,$2,$3,$4,$5,$6)',
      ['whatsapp','phone-a','manual-only','delivered',t2,null]);
    assert.equal((await db.query("select provider_status from provider_message_statuses where provider_message_id='manual-only'")).rows[0].provider_status, 'delivered',
      'manual outbound replies can receive status without an inbox event');
    await db.query("insert into chat_logs(id,brand_id,customer_id,channel,reply) values ('00000000-0000-0000-0000-000000000001','brand-a','manual-customer','whatsapp','hello')");
    const linked = await db.query("select link_provider_message_to_latest_chat_log('brand-a','manual-customer','whatsapp','hello','manual-only') as linked");
    assert.equal(linked.rows[0].linked, true, 'outbound provider ID attaches to the existing reply transcript row');
    assert.equal((await db.query('select count(*)::int as n from chat_logs')).rows[0].n, 1, 'linking does not create a duplicate reply row');
    await db.query("delete from chat_logs where id='00000000-0000-0000-0000-000000000001'");
    assert.equal((await db.query("select count(*)::int as n from provider_message_statuses where provider_message_id='manual-only'")).rows[0].n, 0,
      'customer transcript erasure clears its linkable provider status record');
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from provider_message_statuses'));
    await assert.rejects(db.query("select record_provider_message_accepted('whatsapp','phone-a','blocked','brand-a','customer',now())"));
    await db.exec('reset role');
    assert.equal(await apply({ id: 'wa-a', status: 'delivered', time: t2 }), 1, 'valid matching receipt updates');
    const firstStatusUpdateAt = new Date((await get('wa-a')).last_status_update_at).toISOString();
    assert.equal(await apply({ id: 'wa-a', status: 'delivered', time: t2 }), 1, 'duplicate callback is safe');
    assert.equal(new Date((await get('wa-a')).last_status_update_at).toISOString(), firstStatusUpdateAt, 'duplicate callback does not mutate timestamps');
    assert.equal(await apply({ id: 'wa-a', status: 'sent', time: t1 }), 1, 'late sent callback matches but cannot downgrade');
    assert.equal((await get('wa-a')).provider_status, 'delivered');
    assert.equal((await db.query("select provider_status from provider_message_statuses where provider_message_id='wa-a'")).rows[0].provider_status, 'delivered',
      'provider status is also visible outside the worker inbox row');
    assert.equal(await apply({ id: 'unknown', status: 'read', time: t3 }), 0, 'unknown provider ID is ignored');
    assert.equal(await apply({ channel: 'instagram', id: 'wa-a', status: 'read', time: t3 }), 0, 'channel mismatch cannot match');
    assert.equal(await apply({ account: 'phone-b', id: 'wa-a', status: 'read', time: t3 }), 0, 'account mismatch cannot cross workspace/account');

    await add({ id: 'wa-read-first' });
    assert.equal(await apply({ id: 'wa-read-first', status: 'read', time: t1 }), 1, 'read can arrive without delivered');
    const read = await get('wa-read-first');
    assert.equal(read.provider_status, 'read'); assert.ok(read.delivered_at); assert.ok(read.read_at);
    assert.equal((await db.query("select provider_status from provider_message_statuses where provider_message_id='wa-read-first'")).rows[0].provider_status, 'read');
    await apply({ id: 'wa-read-first', status: 'delivered', time: t3 });
    assert.equal((await get('wa-read-first')).provider_status, 'read', 'delivered cannot downgrade read');

    await add({ id: 'wa-failed' });
    await apply({ id: 'wa-failed', status: 'failed', time: t2, failure: 'meta_131026' });
    assert.equal((await get('wa-failed')).provider_failure_category, 'meta_131026');
    assert.equal((await db.query("select provider_status,provider_failure_category from provider_message_statuses where provider_message_id='wa-failed'")).rows[0].provider_failure_category, 'meta_131026');
    await apply({ id: 'wa-failed', status: 'read', time: t1 });
    assert.equal((await get('wa-failed')).provider_status, 'read', 'read is stronger proof even if callback timestamp is older');

    await add({ channel: 'instagram', account: 'ig-a', id: 'ig-seen' });
    const ig = await apply({ channel: 'instagram', account: 'ig-a', id: 'ig-seen', status: 'seen', time: t2 });
    assert.equal(ig, 1); assert.equal((await get('ig-seen')).provider_status, 'seen');
    assert.equal(new Date((await get('ig-seen')).delivered_at).toISOString(), t2, 'seen implies delivery evidence');

    const waParsed = parseWhatsAppStatusWebhook({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'phone-a' }, statuses: [
      { id: 'm1', status: 'sent', timestamp: '1793577600' },
      { id: 'm2', status: 'delivered', timestamp: '1793577601' },
      { id: 'm3', status: 'read', timestamp: '1793577602' },
      { id: 'm4', status: 'failed', timestamp: '1793577603', errors: [{ code: 131026, message: 'Do not retain this message text' }] },
      { id: 'bad', status: 'delivered', timestamp: 'invalid' }, { id: 'skip', status: 'accepted', timestamp: '1793577600' }
    ] } }] }] });
    assert.equal(waParsed.length, 4); assert.equal(waParsed[3].failureCategory, 'meta_131026');
    assert.equal(JSON.stringify(waParsed).includes('Do not retain'), false, 'provider text payload is not retained');

    const igSeenPayload = { object: 'instagram', entry: [{ id: 'ig-account', messaging: [
      { sender: { id: 'ig-account' }, recipient: { id: 'customer' }, timestamp: 1793577600000, read: { mid: 'ig-seen' } },
      { sender: { id: 'customer' }, recipient: { id: 'ig-account' }, timestamp: 1793577600000, read: { mid: 'inbound-read' } }
    ] }] };
    assert.deepEqual(parseInstagramSeenWebhook(igSeenPayload), [], 'unverified Instagram seen formats stay disabled');
    assert.deepEqual(parseInstagramSeenWebhook(igSeenPayload, { format: 'read_mid_v1' }).map(x => x.messageId), ['ig-seen']);
    assert.deepEqual(parseInstagramSeenWebhook({ ...igSeenPayload, object: 'page' }), []);
    console.log('Provider delivery status tests passed: matching, duplicate, out-of-order, unknown/cross-account, failed, read-implies-delivery, Instagram seen and no delivery inference.');
  } finally { await db.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
