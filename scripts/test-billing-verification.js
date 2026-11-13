const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifyCapturedPayment, verifyWebhookSignature } = require('../services/billingVerification.service');
const order = { provider_order_id: 'order_test', amount_paise: 99900, currency: 'INR' };
const payment = { id: 'pay_test', order_id: 'order_test', amount: 99900, currency: 'INR', status: 'captured' };
assert.equal(verifyCapturedPayment(order, payment).paymentId, 'pay_test');
for (const patch of [{ status: 'authorized' }, { status: 'failed' }, { amount: 1 }, { currency: 'USD' }, { order_id: 'another_workspace_order' }, { id: '' }]) {
  assert.throws(() => verifyCapturedPayment(order, { ...payment, ...patch }));
}
const body = Buffer.from('{"event":"payment.captured"}');
const secret = 'synthetic-test-secret';
const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
assert.equal(verifyWebhookSignature(body, signature, secret), true);
assert.equal(verifyWebhookSignature(Buffer.from('{}'), signature, secret), false);
assert.equal(verifyWebhookSignature(body, signature, 'wrong'), false);
assert.equal(verifyWebhookSignature(body, 'invalid', secret), false);
assert.equal(verifyWebhookSignature(body, signature, ''), false);
assert.equal(verifyWebhookSignature({}, signature, secret), false);
console.log('Billing payment and webhook verification checks passed');
