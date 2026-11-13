const router = require('express').Router();
const { createClient } = require('@supabase/supabase-js');
const { verifyWebhookSignature } = require('../services/billingVerification.service');
const { createBillingGateway } = require('../services/billingGateway.service');
router.post('/', async (req, res) => {
  if (process.env.BILLING_TEST_ENABLED !== 'true' || process.env.NODE_ENV === 'production') return res.sendStatus(503);
  if (!verifyWebhookSignature(req.rawBody, req.get('x-razorpay-signature'), process.env.RAZORPAY_WEBHOOK_SECRET)) return res.sendStatus(401);
  if (typeof req.body.event === 'string' && req.body.event.startsWith('subscription.')) {
    try {
      const service = require('../services/subscriptionBilling.service');
      const deps = service.dependencies();
      const id = req.body.payload?.subscription?.entity?.id;
      if (typeof id !== 'string') return res.sendStatus(400);
      const subscription = await service.result(deps.db.from('billing_subscriptions').select('*').eq('provider_subscription_id', id).maybeSingle());
      if (!subscription) return res.sendStatus(503);
      await service.reconcile(subscription, deps);
      return res.sendStatus(200);
    } catch { return res.sendStatus(503); }
  }
  if (!['payment.captured', 'order.paid'].includes(req.body.event)) return res.sendStatus(200);
  const providerId = req.body.payload?.payment?.entity?.order_id || req.body.payload?.order?.entity?.id;
  if (typeof providerId !== 'string') return res.sendStatus(400);
  try {
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: order, error } = await db.from('billing_orders').select('*').eq('provider_order_id', providerId).maybeSingle();
    if (error || !order) return res.sendStatus(503); // Retry: order persistence may still be in progress.
    if (order.status === 'activated') return res.sendStatus(200);
    const gateway = createBillingGateway({ keyId: process.env.RAZORPAY_KEY_ID, keySecret: process.env.RAZORPAY_KEY_SECRET });
    const result = await gateway.reconcile(order, async (snapshot, payment) => {
      const { data, error: failed } = await db.rpc('activate_billing_order', { p_order_id: snapshot.id, p_payment_id: payment.id, p_amount: payment.amount, p_currency: payment.currency });
      if (failed) throw failed;
      return data;
    });
    return res.sendStatus(result.status === 'pending' ? 503 : 200);
  } catch { return res.sendStatus(503); }
});
module.exports = router;
