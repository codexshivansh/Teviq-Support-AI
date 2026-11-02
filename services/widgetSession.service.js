const crypto = require('node:crypto');
const TTL_SECONDS = 24 * 60 * 60;

function getSecret() {
  const secret = process.env.WIDGET_SESSION_SECRET;
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
    const error = new Error('Widget sessions are not configured. Please contact support.');
    error.statusCode = 503;
    error.code = 'widget_session_not_configured';
    throw error;
  }
  return secret;
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest();
}

function resolveWidgetSession(brandId, token, now = Date.now()) {
  const secret = getSecret();
  const seconds = Math.floor(now / 1000);
  if (typeof token === 'string' && token.length <= 2048) {
    try {
      const parts = token.split('.');
      if (parts.length !== 2 || !/^[a-zA-Z0-9_-]+$/.test(parts[0]) || !/^[a-zA-Z0-9_-]{43}$/.test(parts[1])) throw new Error('invalid');
      const supplied = Buffer.from(parts[1], 'base64url');
      const expected = sign(parts[0], secret);
      if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) throw new Error('invalid');
      const session = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      if (session.v !== 1 || session.brand !== brandId || !/^widget_[0-9a-f-]{36}$/.test(session.customer) ||
          !Number.isInteger(session.exp) || session.exp <= seconds || session.exp > seconds + TTL_SECONDS) throw new Error('invalid');
      return { customerId: session.customer, token };
    } catch (_) { /* Invalid tokens receive a new isolated session, never legacy history. */ }
  }
  const session = { v: 1, brand: brandId, customer: `widget_${crypto.randomUUID()}`, exp: seconds + TTL_SECONDS };
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return { customerId: session.customer, token: `${payload}.${sign(payload, secret).toString('base64url')}` };
}

module.exports = { resolveWidgetSession, TTL_SECONDS };
