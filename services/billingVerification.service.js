const crypto = require('node:crypto');

// Only server-fetched gateway data may be passed here. Browser callbacks are hints.
function verifyCapturedPayment(order, payment) {
  if (!order || !payment || payment.status !== 'captured' ||
      payment.order_id !== order.provider_order_id ||
      payment.amount !== order.amount_paise || payment.currency !== order.currency ||
      !Number.isSafeInteger(order.amount_paise) || order.amount_paise <= 0 ||
      typeof payment.id !== 'string' || !payment.id) {
    throw new Error('payment_verification_failed');
  }
  return { paymentId: payment.id, orderId: payment.order_id };
}

function verifyWebhookSignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || typeof secret !== 'string' || !secret ||
      typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

module.exports = { verifyCapturedPayment, verifyWebhookSignature };
