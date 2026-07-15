const crypto = require("crypto");

function getBindingSecret() {
  return process.env.SHOPIFY_CREDENTIALS_SECRET || process.env.CLERK_SECRET_KEY || null;
}

function createOrderVerificationBinding({ brandId, customerId, channel, requestIp }) {
  const secret = getBindingSecret();
  if (!secret) return null;

  return crypto
    .createHmac("sha256", secret)
    .update([brandId, customerId || "guest", channel || "widget", requestIp || "unknown"].join(":"))
    .digest("hex");
}

function matchesOrderVerificationBinding(storedBinding, requestContext) {
  const currentBinding = createOrderVerificationBinding(requestContext);
  if (!storedBinding || !currentBinding) return false;

  const storedBuffer = Buffer.from(String(storedBinding));
  const currentBuffer = Buffer.from(currentBinding);
  return storedBuffer.length === currentBuffer.length && crypto.timingSafeEqual(storedBuffer, currentBuffer);
}

module.exports = { createOrderVerificationBinding, matchesOrderVerificationBinding };
