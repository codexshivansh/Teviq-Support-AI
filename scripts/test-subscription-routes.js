const assert=require('node:assert/strict');const express=require('express');
const metadata=require('../services/clerkMetadata.service');metadata.getUserPublicMetadata=async()=>({brandId:'client'});
const service=require('../services/subscriptionBilling.service');
const state={id:'local',brand_id:'client',owner_user_id:'owner',provider_subscription_id:'sub_fixture',provider_plan_id:'plan_fixture',provider_status:'authenticated',trial_ends_at:new Date(Date.now()+86400000).toISOString(),features:['widget'],cancel_requested_at:null};
let failCancel=true,cancelCount=0;
const db={from(){const filters=[];let patch;const query={select(){return this;},eq(k,v){filters.push([k,v]);return this;},update(v){patch=v;return this;},single(){return this;},maybeSingle(){return this;},then(resolve){const matches=filters.every(([k,v])=>state[k]===v);if(matches&&patch)Object.assign(state,patch);return Promise.resolve({data:matches?{...state}:null,error:null}).then(resolve);}};return query;},rpc:async()=>({data:null,error:null})};
service.dependencies=()=>({db,gateway:{get:async()=>({id:'sub_fixture',plan_id:'plan_fixture',quantity:1,start_at:Date.parse(state.trial_ends_at)/1000,status:state.provider_status}),cancel:async()=>{cancelCount++;if(failCancel)throw new Error('offline');return {status:'cancelled'};},invoices:async()=>({items:[]})}});
(async()=>{process.env.NODE_ENV='test';process.env.BILLING_TEST_ENABLED='true';process.env.AI_TRIAL_METERING_ENABLED='true';const app=express();app.use(express.json());app.use((req,res,next)=>{req.auth={userId:req.get('x-test-user')||'owner'};next();});app.use('/subscriptions',require('../routes/subscriptions.routes'));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const root=`http://127.0.0.1:${server.address().port}/subscriptions`;try{
 assert.equal((await fetch(root+'/other')).status,403);
 assert.equal((await (await fetch(root+'/client', {headers:{'x-test-user':'other'}})).json()).subscription,null);
 assert.equal((await fetch(root+'/client/cancel',{method:'POST'})).status,503);
 assert.ok(state.cancel_requested_at);assert.equal(state.cancelled_at,undefined);
 failCancel=false;
 assert.equal((await fetch(root+'/client/refresh',{method:'POST'})).status,200);
 assert.ok(state.cancelled_at);assert.equal(state.provider_status,'cancelled');
 const count=cancelCount;await fetch(root+'/client/cancel',{method:'POST'});assert.equal(cancelCount,count);
 console.log('PASS authenticated workspace/owner isolation, persisted failed cancellation, retry confirmation and duplicate cancellation');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
