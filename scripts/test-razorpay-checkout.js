const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createRazorpayCheckout, verifyCheckoutSignature } = require('../services/razorpayCheckout.service');

const keySecret = 'synthetic_checkout_secret';
const orderId = 'order_synthetic123';
const paymentId = 'pay_synthetic123';
const signature = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');

assert.equal(verifyCheckoutSignature({ orderId, paymentId, signature, keySecret }), true);
assert.equal(verifyCheckoutSignature({ orderId, paymentId, signature: '0'.repeat(64), keySecret }), false);
assert.equal(verifyCheckoutSignature({ orderId, paymentId, signature: '', keySecret }), false);

const calls = [];
class FakeRazorpay {
  constructor(config) {
    calls.push(config);
    this.orders = { create: async (options) => ({ id: orderId, ...options }) };
    this.payments = { fetch: async (id) => ({ id, order_id: orderId, status: 'captured' }) };
  }
}

(async () => {
  const gateway = createRazorpayCheckout({
    keyId: 'rzp_test_synthetic123', keySecret, RazorpayClient: FakeRazorpay
  });
  assert.equal((await gateway.createOrder({ amount: 100, currency: 'INR', receipt: 'receipt' })).amount, 100);
  assert.equal((await gateway.fetchPayment(paymentId)).id, paymentId);
  assert.equal(gateway.verifySignature({ orderId, paymentId, signature }), true);
  assert.equal(calls[0].key_secret, keySecret);
  assert.throws(() => createRazorpayCheckout({ keyId: 'bad', keySecret, RazorpayClient: FakeRazorpay }));
  console.log('PASS Razorpay order client and constant-time checkout signature verification');
})().catch((error) => { console.error(error); process.exitCode = 1; });
