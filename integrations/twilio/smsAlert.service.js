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

module.exports = { sendDelayAlert, isConfigured };
