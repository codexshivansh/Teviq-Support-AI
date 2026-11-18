const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { plans } = require('../services/billingCatalog.service');
const { createCheckoutRouter } = require('../routes/checkout.routes');

const secret = 'synthetic_route_secret';
const ownerUserId = 'user_checkout_test';
let storedOrder = null;
let activated = false;

function filteredOrder(filters) {
  if (!storedOrder) return null;
  return filters.every(([column, value]) => storedOrder[column] === value) ? storedOrder : null;
}

function orderQuery() {
  const filters = [];
  const query = {
    select() { return query; },
    eq(column, value) { filters.push([column, value]); return query; },
    async maybeSingle() { return { data: filteredOrder(filters), error: null }; }
  };
  return query;
}

const db = {
  from(table) {
    assert.equal(table, 'billing_orders');
    const query = orderQuery();
    query.insert = async (row) => {
      storedOrder = { ...row, status: 'pending' };
      return { error: null };
    };
    return query;
  },
  async rpc(name, values) {
    assert.equal(name, 'activate_billing_order');
    assert.equal(values.p_order_id, storedOrder.id);
    assert.equal(values.p_amount, storedOrder.amount_paise);
    assert.equal(values.p_currency, storedOrder.currency);
    activated = true;
    storedOrder.status = 'activated';
    return { data: 'activated', error: null };
  }
};

const gateway = {
  keyId: 'rzp_test_synthetic123',
  async createOrder(options) {
    return { id: 'order_route123', amount: options.amount, currency: options.currency };
  },
  verifySignature({ orderId, paymentId, signature }) {
    const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
    return signature === expected;
  },
  async fetchPayment(paymentId) {
    return {
      id: paymentId,
      order_id: storedOrder.provider_order_id,
      status: 'captured',
      amount: storedOrder.amount_paise,
      currency: storedOrder.currency,
      amount_refunded: 0
    };
  }
};

(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.auth = { userId: ownerUserId, sessionType: 'demo' };
    next();
  });
  app.use('/api', createCheckoutRouter({ getDb: () => db, getGateway: () => gateway,
    authenticate: (req, res, next) => next() }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const plan = plans[0];
  const post = (path, body) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });

  try {
    let response = await post('/create-order', {
      brandId: 'pilot-brand', planId: plan.id, amount: 99, currency: 'INR'
    });
    assert.equal(response.status, 400);

    response = await post('/create-order', {
      brandId: 'pilot-brand', planId: plan.id, amount: plan.amount_paise + 1, currency: 'INR'
    });
    assert.equal(response.status, 400);

    response = await post('/create-order', {
      brandId: 'pilot-brand', planId: plan.id, amount: plan.amount_paise, currency: 'INR'
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).order_id, 'order_route123');
    assert.equal(storedOrder.owner_user_id, ownerUserId);

    const paymentId = 'pay_route123';
    response = await post('/verify-payment', {
      brandId: 'pilot-brand', razorpay_order_id: storedOrder.provider_order_id,
      razorpay_payment_id: paymentId, razorpay_signature: '0'.repeat(64)
    });
    assert.equal(response.status, 400);
    assert.equal(activated, false);

    const signature = crypto.createHmac('sha256', secret)
      .update(`${storedOrder.provider_order_id}|${paymentId}`).digest('hex');
    response = await post('/verify-payment', {
      brandId: 'pilot-brand', razorpay_order_id: storedOrder.provider_order_id,
      razorpay_payment_id: paymentId, razorpay_signature: signature
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).success, true);
    assert.equal(activated, true);
    console.log('PASS checkout routes reject tampering and activate only verified captured payments');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
