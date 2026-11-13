const {createClient}=require('@supabase/supabase-js');
function requireBillingChannel(channel){return async(req,res,next)=>{
 // No production schema dependency until billing rollout is enabled.
 if(process.env.BILLING_TEST_ENABLED!=='true' || process.env.NODE_ENV==='production')return next();
 try{const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
 const brand=req.params.brandId||req.body?.brandId;
 if(!brand)return res.sendStatus(400);
 const {data,error}=await db.rpc('billing_channel_allowed',{p_brand:brand,p_channel:channel});
 if(error)return res.status(503).json({message:'Could not verify plan access.'});
 if(data!==true)return res.status(403).json({message:'This channel is not included in your plan.'});
 return next();}catch{return res.status(503).json({message:'Could not verify plan access.'});}
};}
module.exports={requireBillingChannel};
