const {randomUUID}=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const {createSubscriptionGateway}=require('./subscriptionGateway.service');
const {plans}=require('./billingCatalog.service');
const CONSENT='trial-autopay-2026-11-13';
function enabled(){return process.env.BILLING_TEST_ENABLED==='true' && process.env.NODE_ENV!=='production' && process.env.AI_TRIAL_METERING_ENABLED==='true';}
function dependencies(){if(!enabled())throw new Error('billing_unavailable');return {db:createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY),gateway:createSubscriptionGateway({keyId:process.env.RAZORPAY_KEY_ID,keySecret:process.env.RAZORPAY_KEY_SECRET})};}
async function result(query){const {data,error}=await query;if(error)throw error;return data;}
function publicState(s){return {id:s.id,planId:s.plan_version,providerSubscriptionId:s.provider_subscription_id,amount:s.amount_paise,currency:s.currency,trialStartedAt:s.trial_started_at,trialEndsAt:s.trial_ends_at,status:s.provider_status,cancelRequested:!!s.cancel_requested_at,cancelled:!!s.cancelled_at,paidUntil:s.paid_until,features:s.features,reviewRequired:s.review_required};}
function verifyInvoice(s,invoice,payment){
 if(invoice.subscription_id!==s.provider_subscription_id || invoice.status!=='paid' || invoice.payment_id!==payment.id || !invoice.order_id || invoice.order_id!==payment.order_id || payment.status!=='captured' || payment.amount!==s.amount_paise || payment.currency!==s.currency || invoice.amount!==s.amount_paise || invoice.currency!==s.currency || payment.amount_refunded>0 || !Number.isSafeInteger(invoice.billing_start) || !Number.isSafeInteger(invoice.billing_end) || invoice.billing_end<=invoice.billing_start || invoice.billing_start*1000<Date.parse(s.trial_ends_at))throw new Error('invoice_requires_review');
 return {p_id:s.id,p_payment:payment.id,p_invoice:invoice.id,p_amount:payment.amount,p_currency:payment.currency,p_start:new Date(invoice.billing_start*1000).toISOString(),p_end:new Date(invoice.billing_end*1000).toISOString()};
}
async function reconcile(s,{db,gateway}){
 if(!s.provider_subscription_id){
  const recovered=await gateway.recover(s.id);
  if(!recovered)throw new Error('subscription_creation_requires_review');
  if(recovered.plan_id!==s.provider_plan_id || recovered.start_at*1000!==Date.parse(s.trial_ends_at))throw new Error('subscription_mismatch');
  s=await result(db.from('billing_subscriptions').update({provider_subscription_id:recovered.id}).eq('id',s.id).select().single());
 }
 if(!s.paid_until)await result(db.rpc('start_subscription_trial',{p_id:s.id}));
 let remote=await gateway.get(s.provider_subscription_id);
 if(remote.id!==s.provider_subscription_id || remote.plan_id!==s.provider_plan_id || remote.quantity!==1 || remote.start_at*1000!==Date.parse(s.trial_ends_at))throw new Error('subscription_mismatch');
 // Fetch a fresh cancellation intent: webhook work must not overwrite a concurrent request.
 const fresh=await result(db.from('billing_subscriptions').select('*').eq('id',s.id).single());
 if(fresh.cancel_requested_at && !['cancelled','completed','expired'].includes(remote.status))remote=await gateway.cancel(s.provider_subscription_id);
 if(fresh.cancel_requested_at && !['cancelled','completed','expired'].includes(remote.status))throw new Error('cancellation_pending');
 const patch={provider_status:remote.status,last_checked_at:new Date().toISOString()};
 if(['cancelled','completed','expired'].includes(remote.status))patch.cancelled_at=fresh.cancelled_at||new Date().toISOString();
 await result(db.from('billing_subscriptions').update(patch).eq('id',s.id));
 const invoices=await gateway.invoices(s.provider_subscription_id);
 if(!Array.isArray(invoices.items) || invoices.items.length>=100)throw new Error('invoice_list_requires_review');
 for(const invoice of invoices.items){
  if(invoice.status!=='paid')continue;
  // Mandate authorization is not a recurring paid period.
  if(!invoice.billing_start || !invoice.billing_end)continue;
  const payment=await gateway.payment(invoice.payment_id);
  if(payment.amount_refunded>0 || (fresh.cancel_requested_at && Date.parse(fresh.cancel_requested_at)<Date.parse(s.trial_ends_at) && invoice.paid_at*1000>=Date.parse(fresh.cancel_requested_at))) {
    await result(db.from('billing_subscriptions').update({review_required:true}).eq('id',s.id));
    throw new Error('payment_requires_review');
  }
  await result(db.rpc('apply_subscription_payment',verifyInvoice(s,invoice,payment)));
 }
 return result(db.from('billing_subscriptions').select('*').eq('id',s.id).single());
}
async function start({brandId,userId,planId,consentVersion},deps=dependencies()){
 const {db,gateway}=deps;
 if(brandId==='teviq' || consentVersion!==CONSENT)throw new Error('consent_required');
 const plan=plans.find(p=>p.id===planId);if(!plan)throw new Error('invalid_plan');
 const existing=await result(db.from('billing_subscriptions').select('*').eq('brand_id',brandId).maybeSingle());
 if(existing){if(existing.owner_user_id!==userId || existing.plan_version!==planId)throw new Error('subscription_exists');return existing;}
 const access=await result(db.from('ai_trial_limits').select('*').eq('brand_id',brandId).maybeSingle());
 if(access && (access.access_mode==='internal'||(access.access_mode==='paid'&&Date.parse(access.ends_at)>Date.now())))throw new Error('existing_access');
 const config=JSON.parse(process.env.RAZORPAY_TEST_PLAN_IDS||'{}');const providerPlan=config[plan.id];
 if(!/^plan_[a-zA-Z0-9]+$/.test(providerPlan||''))throw new Error('plan_not_configured');
 const remotePlan=await gateway.plan(providerPlan);
 if(remotePlan.period!=='monthly'||remotePlan.interval!==1||remotePlan.item?.amount!==plan.amount_paise||remotePlan.item?.currency!==plan.currency)throw new Error('plan_mismatch');
 const {id:version,name,duration_days,...snapshot}=plan;
 let s=await result(db.from('billing_subscriptions').insert({...snapshot,id:randomUUID(),brand_id:brandId,owner_user_id:userId,plan_version:version,provider_plan_id:providerPlan,consent_version:CONSENT}).select().single());
 // Persist intent before remote call. Never automatically recreate after a timeout.
 const remote=await gateway.create(s);
 if(!/^sub_[a-zA-Z0-9]+$/.test(remote.id||'')||remote.plan_id!==providerPlan||remote.start_at*1000!==Date.parse(s.trial_ends_at))throw new Error('subscription_creation_requires_review');
 s=await result(db.from('billing_subscriptions').update({provider_subscription_id:remote.id,provider_status:remote.status}).eq('id',s.id).select().single());
 await result(db.rpc('start_subscription_trial',{p_id:s.id}));
 return s;
}
module.exports={CONSENT,enabled,dependencies,result,publicState,verifyInvoice,reconcile,start};
