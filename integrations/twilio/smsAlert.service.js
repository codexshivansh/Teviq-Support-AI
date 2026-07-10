let cachedClient = null;

function isConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER
  );
}

function getClient() {
  if (!cachedClient) {
    const twilio = require("twilio");
    cachedClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return cachedClient;
}

function buildDelayMessage({ orderId, brandName }) {
  return `Hi, your order ${orderId} from ${brandName} is running a bit late. We're sorry for the delay and are working to get it to you as soon as possible.`;
}

function buildAbandonedCartMessage({ brandName, items, cartValue, currency, checkoutUrl }) {
  const itemsText = Array.isArray(items) && items.length ? items.join(", ") : "your items";
  const valueText = cartValue ? ` (${currency || "INR"} ${cartValue})` : "";
  const linkText = checkoutUrl ? ` Complete it here: ${checkoutUrl}` : "";
  return `Hi, you left ${itemsText}${valueText} in your ${brandName} cart. Complete your order before it's gone!${linkText}`;
}

async function sendDelayAlert({ phone, orderId, brandName }) {
  const messageBody = buildDelayMessage({ orderId, brandName });

  if (!isConfigured()) {
    console.log(
      `[smsAlert] Twilio not configured, skipping. Would have sent to ${phone}: "${messageBody}"`
    );
    return { sent: false, reason: "not_configured" };
  }

  try {
    const message = await getClient().messages.create({
      body: messageBody,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });
    return { sent: true, sid: message.sid };
  } catch (error) {
    console.error(
      `[smsAlert] Failed to send delay alert SMS to ${phone} for order ${orderId}: ${error.message}`
    );
    const wrapped = new Error(`Twilio SMS send failed: ${error.message}`);
    wrapped.code = "twilio_send_failed";
    wrapped.statusCode = error.status || 502;
    throw wrapped;
  }
}

async function sendAbandonedCartAlert({ phone, cartId, brandName, items, cartValue, currency, checkoutUrl }) {
  const messageBody = buildAbandonedCartMessage({ brandName, items, cartValue, currency, checkoutUrl });

  if (!isConfigured()) {
    console.log(
      `[smsAlert] Twilio not configured, skipping. Would have sent to ${phone}: "${messageBody}"`
    );
    return { sent: false, reason: "not_configured" };
  }

  try {
    const message = await getClient().messages.create({
      body: messageBody,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });
    return { sent: true, sid: message.sid };
  } catch (error) {
    console.error(
      `[smsAlert] Failed to send abandoned-cart SMS to ${phone} for cart ${cartId}: ${error.message}`
    );
    const wrapped = new Error(`Twilio SMS send failed: ${error.message}`);
    wrapped.code = "twilio_send_failed";
    wrapped.statusCode = error.status || 502;
    throw wrapped;
  }
}

module.exports = { sendDelayAlert, sendAbandonedCartAlert, isConfigured };
