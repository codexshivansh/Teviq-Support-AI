function createSubscriptionGateway({keyId,keySecret,fetchImpl=fetch}) {
 if (!/^rzp_test_/.test(keyId||'') || !keySecret) throw new Error('test_credentials_required');
 async function request(path, body) {
  const response=await fetchImpl(`https://api.razorpay.com/v1/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
  if(!response.ok) throw new Error('gateway_unavailable'); return response.json();
 }
 const sid=id=>{if(!/^sub_[a-zA-Z0-9]+$/.test(id||''))throw new Error('invalid_subscription');return id;};
 return {keyId,
  plan:id=>request(`plans/${encodeURIComponent(id)}`),
  create:s=>request('subscriptions',{plan_id:s.provider_plan_id,quantity:1,total_count:12,customer_notify:true,start_at:Math.floor(Date.parse(s.trial_ends_at)/1000),expire_by:Math.floor(Date.parse(s.trial_ends_at)/1000)-3600,notes:{teviq_subscription_id:s.id}}),
  async recover(localId) {
   const matches=[];
   for(let skip=0;skip<1000;skip+=100){
    const page=await request(`subscriptions?count=100&skip=${skip}`);
    if(!Array.isArray(page.items))throw new Error('invalid_subscription_list');
    matches.push(...page.items.filter(item=>item.notes?.teviq_subscription_id===localId));
    if(page.items.length<100){if(matches.length>1)throw new Error('duplicate_subscriptions_require_review');return matches[0]||null;}
   }
   throw new Error('subscription_recovery_requires_review');
  },
  get:id=>request(`subscriptions/${sid(id)}`),
  cancel:id=>request(`subscriptions/${sid(id)}/cancel`,{cancel_at_cycle_end:false}),
  invoices:id=>request(`invoices?subscription_id=${sid(id)}&count=100`),
  payment:id=>request(`payments/${encodeURIComponent(id)}`)
 };
}
module.exports={createSubscriptionGateway};
