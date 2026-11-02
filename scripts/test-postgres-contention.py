"""Real PostgreSQL contention test. Only a new disposable local database is allowed."""
import concurrent.futures, json, os, subprocess, uuid
from pathlib import Path
root=Path(__file__).resolve().parents[1]
bin_dir=os.environ.get('TEVIQ_PG_BIN','/opt/homebrew/opt/postgresql@17/bin')
socket=os.environ.get('TEVIQ_TEST_PG_SOCKET','/tmp/teviq-test-pg-socket')
if not socket.startswith('/tmp/teviq-test-'): raise SystemExit('Disposable local socket required')
name='teviq_test_'+uuid.uuid4().hex
base=[f'{bin_dir}/psql','-h',socket,'-p','55439','-X','-v','ON_ERROR_STOP=1','-At']
def sql(query, database=name):
 return subprocess.check_output(base+['-d',database,'-c',query],text=True).strip()
sql(f'create database {name}', 'postgres')
try:
 sql("do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if; end $$; create table brands(id text primary key); insert into brands values ('a'); create table instagram_webhook_events(message_id text primary key);")
 for file in ['0027_add_ai_trial_usage.sql','0028_add_channel_message_inbox.sql','0029_add_channel_inbox_review.sql','0030_add_conversation_handoffs.sql','0031_add_ai_access_modes.sql']:
  sql((root/'supabase/migrations'/file).read_text())
 sql("insert into ai_trial_limits(brand_id,enabled,access_mode,starts_at,ends_at,max_calls_per_day,max_tokens_per_day) values ('a',true,'trial',now()-interval '1 day',now()+interval '1 day',1,10000)")
 def reserve(i):
  return sql(f"select reserve_ai_usage('{uuid.uuid4()}','a','{'instagram' if i%2 else 'whatsapp'}','test',100,10000)")
 with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool: results=list(pool.map(reserve,range(24)))
 assert results.count('allowed')==1,results
 assert results.count('brand_limit')==23,results
 def duplicate(i):
  sql("insert into channel_message_inbox(channel,account_id,message_id,brand_id,customer_id,message,event_at) values ('instagram','account','duplicate','a','customer','test',now()) on conflict do nothing")
 with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool: list(pool.map(duplicate,range(24)))
 assert sql('select count(*) from channel_message_inbox')=='1'
 def claim(i): return sql(f"select id from claim_channel_message('{uuid.uuid4()}')")
 with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool: claims=list(pool.map(claim,range(24)))
 assert len([x for x in claims if x])==1,claims
 backup=subprocess.check_output([f'{bin_dir}/pg_dump','-h',socket,'-p','55439','--no-owner','--no-acl','-d',name],text=True)
 restored=name+'_restore'
 sql(f'create database {restored}', 'postgres')
 try:
  subprocess.run(base+['-d',restored],input=backup,text=True,check=True,capture_output=True)
  assert sql('select count(*) from channel_message_inbox',restored)=='1'
  assert sql('select count(*) from ai_usage_events',restored)=='1'
  assert sql('select count(*) from ai_trial_limits',restored)=='1'
 finally: sql(f'drop database {restored}', 'postgres')
 print(json.dumps({'backupRestore':'synthetic database passed','result':'PASS','environment':'isolated local PostgreSQL, separate connections','quotaContenders':24,'quotaAllowed':1,'duplicateInserts':24,'storedEvents':1,'claimContenders':24,'claimsGranted':1}))
finally:
 sql(f'drop database {name}', 'postgres')
