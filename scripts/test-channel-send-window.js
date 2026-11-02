const assert = require('node:assert/strict');
const { createChannelMessageWorker } = require('../services/channelMessageWorker.service');
(async()=>{
 const realNow=Date.now; const start=realNow(); let now=start; let sends=0; const transitions=[];
 Date.now=()=>now;
 try {
  const event={id:'test',brand_id:'brand',channel:'instagram',customer_id:'customer',account_id:'account',event_at:new Date(start-23*60*60*1000+1000).toISOString(),message:'hello'};
  const adapter={resolve:async()=>({brandId:'brand'}),send:async()=>{sends++;return {message_id:'sent'};}};
  const worker=createChannelMessageWorker({
   inbox:{transitionChannelMessage:async(e,status,details)=>transitions.push({status,details})},
   processMessage:async()=>{now+=2000;return {reply:'answer'};},whatsapp:adapter,instagram:adapter,report:()=>{}
  });
  await worker.processEvent(event);
  assert.equal(sends,0);
  assert.deepEqual(transitions.map(x=>x.status),['ready','needs_review']);
  assert.equal(transitions[1].details.errorCode,'reply_window_requires_review');
  console.log('PASS reply window expiring during generation prevents provider send and preserves generated answer for review');
 } finally { Date.now=realNow; }
})().catch(e=>{console.error(e);process.exitCode=1;});
