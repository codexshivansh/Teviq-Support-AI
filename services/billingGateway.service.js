const { verifyCapturedPayment } = require('./billingVerification.service');

function createBillingGateway({ keyId, keySecret, fetchImpl = fetch }) {
  // This release intentionally supports test credentials only.
  if (!/^rzp_test_/.test(keyId || '') || !keySecret) throw new Error('billing_test_credentials_required');
  async function request(path, body) {
    const response = await fetchImpl(`https://api.razorpay.com/v1/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error('payment_provider_unavailable');
    return response.json();
  }
  return {
    keyId,
    async cancelTrialSubscription(subscriptionId) {
      if (!/^sub_[a-zA-Z0-9]+$/.test(subscriptionId || '')) throw new Error('invalid_subscription_id');
      const current = await request(`subscriptions/${subscriptionId}`);
      if (current.status === 'cancelled') return { status: 'cancelled' };
      // Do not silently treat an already-charged subscription as a free-trial cancellation.
      if (current.paid_count > 0 || !['created', 'authenticated'].includes(current.status)) {
        throw new Error('subscription_requires_billing_review');
      }
      const result = await request(`subscriptions/${subscriptionId}/cancel`, { cancel_at_cycle_end: false });
      if (result.status !== 'cancelled') throw new Error('cancellation_pending');
      return { status: 'cancelled' };
    },
    createOrder: ({ id, amount_paise, currency }) => request('orders', { amount: amount_paise, currency, receipt: id, partial_payment: false }),
    async reconcile(order, activate) {
      const result = await request(`orders/${encodeURIComponent(order.provider_order_id)}/payments`);
      if (!Array.isArray(result.items)) throw new Error('invalid_payment_provider_response');
      const payment = result.items.find(item => item.status === 'captured');
      if (!payment) return { status: 'pending' };
      verifyCapturedPayment(order, payment);
      if (payment.amount_refunded > 0) throw new Error('refunded_payment_requires_review');
      // Atomic database activation makes webhook/browser retries safe.
      const status = await activate(order, payment);
      return { status };
    }
  };
}
module.exports = { createBillingGateway };
