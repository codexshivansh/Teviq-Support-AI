const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { requireBrandAccess } = require('../middleware/brandAccess.middleware');
const { createBillingGateway } = require('../services/billingGateway.service');
const router = express.Router();
// Off by default. Only use against an isolated test database with migration 0038.
router.use((req, res, next) => {
  if (process.env.BILLING_TEST_ENABLED !== 'true' || process.env.NODE_ENV === 'production') return res.status(503).json({ error: 'billing_unavailable' });
  if (!req.auth?.userId || req.auth.sessionType === 'demo') return res.status(403).json({ error: 'account_required' });
  next();
});
router.get('/plans', (req, res) => res.json({ mode: 'test', plans: require('../services/billingCatalog.service').plans }));
router.post('/:brandId/orders', requireBrandAccess, (req, res) => res.status(410).json({ message: 'Use subscription checkout for new purchases.' }));
router.post('/:brandId/orders/:orderId/reconcile', requireBrandAccess, async (req, res) => {
  try {
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: order, error } = await db.from('billing_orders').select('*')
      .eq('id', req.params.orderId).eq('brand_id', req.params.brandId).eq('owner_user_id', req.auth.userId).maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ error: 'order_not_found' });
    if (order.status === 'activated') return res.json({ status: 'already_activated' });
    if (order.status !== 'pending') return res.status(409).json({ error: 'order_unavailable' });
    const gateway = createBillingGateway({ keyId: process.env.RAZORPAY_KEY_ID, keySecret: process.env.RAZORPAY_KEY_SECRET });
    const result = await gateway.reconcile(order, async (snapshot, payment) => {
      const { data, error: activationError } = await db.rpc('activate_billing_order', {
        p_order_id: snapshot.id, p_payment_id: payment.id, p_amount: payment.amount, p_currency: payment.currency
      });
      if (activationError) throw activationError;
      return data;
    });
    return res.json(result);
  } catch {
    return res.status(503).json({ error: 'payment_verification_pending', message: 'Payment verification could not finish. Retry this order; do not pay again.' });
  }
});
module.exports = router;
