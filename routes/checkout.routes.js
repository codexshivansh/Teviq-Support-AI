const { randomUUID } = require('node:crypto');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { requireBrandAccess } = require('../middleware/brandAccess.middleware');
const { requireClerkAuth } = require('../middleware/clerkAuth.middleware');
const { plans } = require('../services/billingCatalog.service');
const { verifyCapturedPayment } = require('../services/billingVerification.service');
const { createRazorpayCheckout } = require('../services/razorpayCheckout.service');

function createCheckoutRouter({ getDb, getGateway, authenticate = requireClerkAuth } = {}) {
  const router = express.Router();
  const resolveDb = getDb || (() => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));
  const resolveGateway = getGateway || (() => createRazorpayCheckout({
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET
  }));

  router.get('/checkout-plans', (req, res) => {
    res.json({ plans });
  });

  router.post('/create-order', authenticate, requireBrandAccess, async (req, res) => {
    const { brandId, planId, amount, currency = 'INR', receipt } = req.body || {};
    const plan = plans.find((item) => item.id === planId);
    if (!/^[a-z0-9-]+$/.test(String(brandId || '')) || brandId === 'teviq' || !plan) {
      return res.status(400).json({ error: 'invalid_order', message: 'Select a valid workspace and plan.' });
    }
    if (!Number.isSafeInteger(amount) || amount < 100 || amount !== plan.amount_paise || currency !== plan.currency) {
      return res.status(400).json({ error: 'invalid_amount', message: 'The selected plan amount is invalid.' });
    }
    if (receipt !== undefined && (typeof receipt !== 'string' || !receipt.trim() || receipt.length > 40)) {
      return res.status(400).json({ error: 'invalid_receipt', message: 'Receipt must be 1 to 40 characters.' });
    }

    try {
      const db = resolveDb();
      const { data: existing, error: existingError } = await db.from('billing_orders').select('*')
        .eq('brand_id', brandId).eq('status', 'pending').maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        if (existing.owner_user_id !== req.auth.userId || existing.plan_version !== plan.id) {
          return res.status(409).json({ error: 'pending_order_exists', message: 'This workspace already has a pending payment.' });
        }
        return res.json({
          order_id: existing.provider_order_id,
          amount: existing.amount_paise,
          currency: existing.currency,
          key_id: resolveGateway().keyId
        });
      }

      const localId = randomUUID();
      const gateway = resolveGateway();
      const providerOrder = await gateway.createOrder({
        amount: plan.amount_paise,
        currency: plan.currency,
        receipt: receipt?.trim() || localId,
        notes: { brand_id: brandId, plan_id: plan.id },
        partial_payment: false
      });
      if (!/^order_[A-Za-z0-9]+$/.test(providerOrder?.id || '') ||
          providerOrder.amount !== plan.amount_paise || providerOrder.currency !== plan.currency) {
        throw new Error('invalid_payment_provider_response');
      }

      const { error: insertError } = await db.from('billing_orders').insert({
        id: localId,
        brand_id: brandId,
        owner_user_id: req.auth.userId,
        provider_order_id: providerOrder.id,
        plan_version: plan.id,
        amount_paise: plan.amount_paise,
        currency: plan.currency,
        duration_days: plan.duration_days,
        max_calls_per_day: plan.max_calls_per_day,
        max_tokens_per_day: plan.max_tokens_per_day,
        features: plan.features
      });
      if (insertError) throw insertError;

      return res.status(201).json({
        order_id: providerOrder.id,
        amount: providerOrder.amount,
        currency: providerOrder.currency,
        key_id: gateway.keyId
      });
    } catch (error) {
      const status = Number(error?.statusCode || error?.status) === 401 ? 401 : 500;
      return res.status(status).json({
        error: status === 401 ? 'razorpay_auth_failed' : 'order_creation_failed',
        message: status === 401
          ? 'Razorpay credentials were rejected.'
          : 'Payment order could not be created. Please retry.'
      });
    }
  });

  router.post('/verify-payment', authenticate, requireBrandAccess, async (req, res) => {
    const { brandId, razorpay_payment_id: paymentId, razorpay_order_id: orderId,
      razorpay_signature: signature } = req.body || {};
    if (!/^[a-z0-9-]+$/.test(String(brandId || '')) ||
        !/^pay_[A-Za-z0-9]+$/.test(String(paymentId || '')) ||
        !/^order_[A-Za-z0-9]+$/.test(String(orderId || '')) ||
        !/^[a-f0-9]{64}$/i.test(String(signature || ''))) {
      return res.status(400).json({ error: 'missing_payment_fields', message: 'Payment verification fields are missing or invalid.' });
    }

    try {
      const db = resolveDb();
      const { data: order, error } = await db.from('billing_orders').select('*')
        .eq('provider_order_id', orderId).eq('brand_id', brandId)
        .eq('owner_user_id', req.auth.userId).maybeSingle();
      if (error) throw error;
      if (!order) return res.status(404).json({ error: 'order_not_found', message: 'Payment order was not found.' });
      const gateway = resolveGateway();
      if (!gateway.verifySignature({ orderId: order.provider_order_id, paymentId, signature })) {
        return res.status(400).json({ error: 'signature_mismatch', message: 'Payment signature verification failed.' });
      }

      const payment = await gateway.fetchPayment(paymentId);
      verifyCapturedPayment(order, payment);
      if (Number(payment.amount_refunded || 0) > 0) throw new Error('refunded_payment_requires_review');

      const { data: status, error: activationError } = await db.rpc('activate_billing_order', {
        p_order_id: order.id,
        p_payment_id: payment.id,
        p_amount: payment.amount,
        p_currency: payment.currency
      });
      if (activationError) throw activationError;
      return res.json({ success: true, status, payment_id: payment.id, order_id: order.provider_order_id });
    } catch (error) {
      const providerStatus = Number(error?.statusCode || error?.status);
      if (providerStatus === 401) {
        return res.status(401).json({ error: 'razorpay_auth_failed', message: 'Razorpay credentials were rejected.' });
      }
      if (error?.message === 'payment_verification_failed') {
        return res.status(409).json({ error: 'payment_not_captured', message: 'Payment is not captured yet. Check status before retrying.' });
      }
      return res.status(500).json({ error: 'payment_verification_failed', message: 'Payment could not be verified. Please contact support before paying again.' });
    }
  });

  return router;
}

module.exports = createCheckoutRouter();
module.exports.createCheckoutRouter = createCheckoutRouter;
