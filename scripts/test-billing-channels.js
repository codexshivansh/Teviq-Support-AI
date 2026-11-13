const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
(async()=>{ const db = new PGlite(); try {
 await db.exec("create role anon;create role authenticated;create role service_role;create table brands(id text primary key);insert into brands values('paid');");
 for(const file of ['0027_add_ai_trial_usage.sql','0031_add_ai_access_modes.sql','0037_add_internal_ai_access.sql','0038_add_billing_orders.sql','0039_enforce_paid_ai_channels.sql']) await db.exec(fs.readFileSync(`supabase/migrations/${file}`,'utf8'));
 const id = randomUUID();
 await db.query(`insert into billing_orders(id,brand_id,owner_user_id,provider_order_id,plan_version,amount_paise,currency,duration_days,max_calls_per_day,max_tokens_per_day,features) values($1,'paid','user','order','starter-test-v1',99900,'INR',30,30,30000,'["widget"]')`,[id]);
 await db.query("select activate_billing_order($1,'pay',99900,'INR')",[id]);
 for(const channel of ['whatsapp','instagram','widget']) {
 const result = await db.query("select reserve_ai_usage($1,'paid',$2,'test',100,100000) as result",[randomUUID(),channel]);
 assert.equal(result.rows[0].result,channel==='widget'?'allowed':'channel_not_in_plan');
 }
 console.log('PASS full billing migrations and purchased AI channel restrictions');
 } finally { await db.close(); } })().catch(e=>{console.error(e);process.exitCode=1});
