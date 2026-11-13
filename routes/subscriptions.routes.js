const router=require('express').Router();
const rateLimit=require('express-rate-limit');
const {requireBrandAccess}=require('../middleware/brandAccess.middleware');
const service=require('../services/subscriptionBilling.service');
router.use((req,res,next)=>{if(!service.enabled())return res.status(503).json({message:'Subscription checkout is not available.'});if(!req.auth?.userId||req.auth.sessionType==='demo')return res.sendStatus(403);next();});
router.use(rateLimit({windowMs:60000,limit:30,standardHeaders:true,legacyHeaders:false}));
router.get('/plans',(req,res)=>res.json({plans:require('../services/billingCatalog.service').plans,consentVersion:service.CONSENT}));
router.use('/:brandId',requireBrandAccess);
router.get('/:brandId',async(req,res)=>{try{const {db}=service.dependencies();const s=await service.result(db.from('billing_subscriptions').select('*').eq('brand_id',req.params.brandId).eq('owner_user_id',req.auth.userId).maybeSingle());res.json({subscription:s?service.publicState(s):null});}catch{res.status(503).json({message:'Could not load billing. Retry shortly.'});}});
router.post('/:brandId',async(req,res)=>{try{const deps=service.dependencies();const s=await service.start({brandId:req.params.brandId,userId:req.auth.userId,planId:req.body.planId,consentVersion:req.body.consentVersion},deps);res.json({subscription:service.publicState(s),keyId:deps.gateway.keyId});}catch{res.status(409).json({message:'Subscription setup could not finish. Check billing status before trying again; contact support if it remains pending.'});}});
for(const action of ['refresh','cancel'])router.post(`/:brandId/${action}`,async(req,res)=>{
 try{const deps=service.dependencies();let s=await service.result(deps.db.from('billing_subscriptions').select('*').eq('brand_id',req.params.brandId).eq('owner_user_id',req.auth.userId).maybeSingle());if(!s)return res.sendStatus(404);
 if(action==='cancel'&&!s.cancel_requested_at){s=await service.result(deps.db.from('billing_subscriptions').update({cancel_requested_at:new Date().toISOString()}).eq('id',s.id).select().single());}
 s=await service.reconcile(s,deps);res.json({subscription:service.publicState(s)});
 }catch{res.status(503).json({message:action==='cancel'?'Cancellation request recorded if received. Confirmation is still pending; refresh status or contact support before the charge deadline.':'Verification pending. Retry status; do not start another payment.'});}
});
module.exports=router;
