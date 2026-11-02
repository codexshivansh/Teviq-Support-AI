const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create table brands(id text primary key); insert into brands values ('a'),('b'),('missing');");
    for (const file of ['0027_add_ai_trial_usage.sql','0031_add_ai_access_modes.sql']) {
      await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations', file), 'utf8'));
    }
    const reserve = async (brand='a', tokens=100, global=10000, channel='widget') => {
      const id = randomUUID();
      const result = await db.query('select reserve_ai_usage($1,$2,$3,$4,$5,$6) as result', [id,brand,channel,'model',tokens,global]);
      return { id, result: result.rows[0].result };
    };
    assert.equal((await reserve('missing')).result, 'access_unconfigured');
    await db.exec("insert into ai_trial_limits(brand_id,enabled,access_mode,starts_at,ends_at,max_calls_per_day,max_tokens_per_day) values ('a',true,'trial',now()-interval '1 day',now()+interval '2 days',1,1000),('b',false,'disabled',now()-interval '1 day',now()+interval '2 days',10,1000)");
    assert.equal((await reserve('b')).result, 'access_disabled');
    const contenders = await Promise.all(Array.from({length: 12}, (_, i) => reserve('a',100,10000,i%2 ? 'instagram' : 'whatsapp')));
    assert.equal(contenders.filter(x=>x.result==='allowed').length,1, 'last allowance assigned once across channels');
    assert.equal(contenders.filter(x=>x.result==='brand_limit').length,11);
    const first = contenders.find(x=>x.result==='allowed');
    await db.query('select finish_ai_usage($1,null,null,null)',[first.id]);
    const unknown = (await db.query('select status,total_tokens from ai_usage_events where id=$1',[first.id])).rows[0];
    assert.deepEqual(unknown,{status:'unknown',total_tokens:100});
    assert.equal((await reserve()).result,'brand_limit','unknown provider usage does not release capacity');
    await db.exec("update ai_usage_events set usage_day=(now() at time zone 'Asia/Kolkata')::date-1");
    assert.equal((await reserve('a',200,150)).result,'global_limit');
    assert.equal((await reserve('a',1001)).result,'brand_limit');
    assert.equal((await reserve()).result,'allowed','prior India calendar day does not consume today');
    await db.exec("update ai_trial_limits set ends_at=now()-interval '1 second' where brand_id='a'");
    assert.equal((await reserve()).result,'trial_inactive');
    await db.exec("update ai_trial_limits set access_mode='paid' where brand_id='a'");
    assert.equal((await reserve()).result,'paid_access_inactive');
    await db.exec("update ai_trial_limits set starts_at=now()+interval '1 hour',ends_at=now()+interval '1 day' where brand_id='a'");
    assert.equal((await reserve()).result,'paid_access_inactive');
    await db.exec("update ai_trial_limits set starts_at=now()-interval '1 hour',max_calls_per_day=2 where brand_id='a'");
    assert.equal((await reserve()).result,'allowed');
    await assert.rejects(reserve('a',100,10000,'forged'));
    await db.exec('set role authenticated');
    await assert.rejects(reserve());
    await db.exec('reset role');
    console.log('PASS access modes, expiry, daily boundary, shared caps, unknown usage and RPC permissions (embedded SQL; hosted contention still required)');
  } finally { await db.close(); }
})().catch(error=>{ console.error(error); process.exitCode=1; });
