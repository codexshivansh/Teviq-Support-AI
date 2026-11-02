const { encryptValue } = require("../../services/shopifyCredentials.service");
const connectionStore = require("./whatsappConnection.store");

function getConfig() {
  const appId = String(process.env.WHATSAPP_APP_ID || "").trim();
  const appSecret = String(process.env.WHATSAPP_APP_SECRET || "").trim();
  const configId = String(process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID || "").trim();
  const graphVersion = String(process.env.WHATSAPP_GRAPH_API_VERSION || "v21.0").trim();
  return { appId, appSecret, configId, graphVersion };
}

function isConfigured() {
  const { appId, appSecret, configId } = getConfig();
  return Boolean(appId && appSecret && configId);
}

function publicConfig() {
  const { appId, configId, graphVersion } = getConfig();
  return { appId, configId, graphVersion, configured: isConfigured() };
}

async function graphRequest(url, options, operation) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    const error = new Error(`Could not reach Meta to ${operation}. Please try again.`);
    error.statusCode = 502;
    error.code = "whatsapp_meta_unreachable";
    throw error;
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error?.message || `Meta rejected the WhatsApp ${operation} request.`);
    error.statusCode = response.status >= 500 ? 502 : 400;
    error.code = `whatsapp_meta_${operation.replace(/\s+/g, "_")}_failed`;
    throw error;
  }
  return body;
}

async function exchangeCode(code) {
  const { appId, appSecret, graphVersion } = getConfig();
  const url = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
  url.search = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code
  }).toString();
  const body = await graphRequest(url, { method: "GET" }, "authorization code exchange");
  if (!body?.access_token) {
    const error = new Error("Meta did not return an account access token. Please restart signup.");
    error.statusCode = 502;
    error.code = "whatsapp_meta_token_missing";
    throw error;
  }
  return body.access_token;
}

async function finishSignup({ brandId, clerkUserId, code, wabaId, phoneNumberId }) {
  if (!isConfigured()) {
    const error = new Error("WhatsApp Embedded Signup is not configured on the Teviq backend yet.");
    error.statusCode = 503;
    error.code = "whatsapp_signup_not_configured";
    throw error;
  }
  if (!code || !wabaId || !phoneNumberId) {
    const error = new Error("Meta signup did not return the WhatsApp account and phone number. Please try again.");
    error.statusCode = 400;
    error.code = "whatsapp_signup_data_missing";
    throw error;
  }

  const existingConnections = await connectionStore.listConnectionsByBrand(brandId, { activeOnly: true });
  if (existingConnections.some(row => row.phone_number_id !== String(phoneNumberId))) {
    const error = new Error("A WhatsApp number is already connected to this workspace. Disconnect it before connecting another number.");
    error.statusCode = 409;
    error.code = "whatsapp_already_connected";
    throw error;
  }

  const { graphVersion } = getConfig();
  const accessToken = await exchangeCode(code);
  const phonesUrl = new URL(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(wabaId)}/phone_numbers`);
  phonesUrl.search = new URLSearchParams({ fields: "id,display_phone_number,verified_name" }).toString();
  const phoneList = await graphRequest(phonesUrl, { headers: { Authorization: `Bearer ${accessToken}` } }, "phone number verification");
  const phone = Array.isArray(phoneList?.data)
    ? phoneList.data.find(item => String(item?.id || "") === String(phoneNumberId))
    : null;
  if (!phone) {
    const error = new Error("The selected phone number did not match the WhatsApp Business Account returned by Meta.");
    error.statusCode = 400;
    error.code = "whatsapp_signup_asset_mismatch";
    throw error;
  }

  await graphRequest(
    new URL(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(wabaId)}/subscribed_apps`),
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
    "webhook subscription"
  );

  const now = new Date().toISOString();
  const connection = await connectionStore.upsertConnection({
    brand_id: brandId,
    phone_number_id: String(phoneNumberId),
    waba_id: String(wabaId),
    display_phone_number: phone?.display_phone_number || null,
    verified_name: phone?.verified_name || null,
    business_mode: "d2c",
    access_token: null,
    access_token_encrypted: JSON.stringify(encryptValue(accessToken)),
    is_active: true,
    installed_by_clerk_user_id: clerkUserId,
    connected_at: now,
    updated_at: now
  });
  return connectionStore.toPublicConnection(connection);
}

module.exports = { finishSignup, isConfigured, publicConfig };
