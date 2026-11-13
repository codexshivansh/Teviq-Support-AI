const assert = require('node:assert/strict');
const { createBillingGateway } = require('../services/billingGateway.service');
(async()=>{
 let current = {status:'authenticated',paid_count:0}; let requests=[];
 const gateway=createBillingGateway({keyId:'rzp_test_fixture',keySecret:'fixture',fetchImpl:async(url,options)=>{
 requests.push({url,options});return {ok:true,json:async()=>options.method==='POST'?{status:'cancelled'}:current};
 }});
 assert.equal((await gateway.cancelTrialSubscription('sub_fixture')).status,'cancelled');
 assert.deepEqual(JSON.parse(requests[1].options.body),{cancel_at_cycle_end:false});
 current={status:'cancelled',paid_count:0}; requests=[];
 await gateway.cancelTrialSubscription('sub_fixture');assert.equal(requests.length,1);
 current={status:'active',paid_count:1};await assert.rejects(gateway.cancelTrialSubscription('sub_fixture'));
 await assert.rejects(gateway.cancelTrialSubscription('../other'));
 console.log('PASS immediate trial cancellation, replay and paid-subscription safeguards');
})().catch(e=>{console.error(e);process.exitCode=1});
