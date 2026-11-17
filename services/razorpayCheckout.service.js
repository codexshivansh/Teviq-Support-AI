const crypto = require('node:crypto');
const Razorpay = require('razorpay');

function createRazorpayCheckout({ keyId, keySecret, RazorpayClient = Razorpay }) {
  if (!/^rzp_(?:test|live)_[A-Za-z0-9]+$/.test(String(keyId || '')) || !keySecret) {
    throw new Error('razorpay_not_configured');
  }

  const client = new RazorpayClient({ key_id: keyId, key_secret: keySecret });
  return {
    keyId,
    createOrder(options) {
      return client.orders.create(options);
    },
    fetchPayment(paymentId) {
      return client.payments.fetch(paymentId);
    },
    verifySignature({ orderId, paymentId, signature }) {
      return verifyCheckoutSignature({ orderId, paymentId, signature, keySecret });
    }
  };
}

function verifyCheckoutSignature({ orderId, paymentId, signature, keySecret }) {
  if (![orderId, paymentId, signature, keySecret].every((value) => typeof value === 'string' && value)) {
    return false;
  }
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;

  const expected = crypto.createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

module.exports = { createRazorpayCheckout, verifyCheckoutSignature };
