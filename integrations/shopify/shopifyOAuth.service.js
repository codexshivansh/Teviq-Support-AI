const crypto = require("crypto");
const { encryptValue } = require("../../services/shopifyCredentials.service");
const { getShopifyConfig } = require("./shopifyConfig");
const connectionStore = require("./shopifyConnection.store");
const shopifyAdminProvider = require("./shopifyAdmin.provider");

const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function normalizeShopDomain(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  const withProtocol = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    const hostname = url.hostname.replace(/^www\./, "");
    return SHOP_DOMAIN_PATTERN.test(hostname) ? hostname : "";
  } catch {
    return "";
  }
}

function hashState(state) {
  return crypto.createHash("sha256").update(String(state)).digest("hex");
}

function safeReturnPath(value) {
  return value === "/" || value === "/shopify" ? value : "/shopify";
}

function verifyCallbackHmac(query, clientSecret) {
  const suppliedHmac = String(query?.hmac || "");
  if (!/^[a-f0-9]{64}$/i.test(suppliedHmac)) return false;

  const message = Object.keys(query || {})
    .filter((key) => key !== "hmac" && key !== "signature")
    .sort()
    .map((key) => {
      const value = Array.isArray(query[key]) ? query[key].join(",") : query[key];
      return `${key}=${String(value ?? "")}`;
    })
    .join("&");
  const expected = crypto.createHmac("sha256", clientSecret).update(message).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(suppliedHmac, "hex"));
}

function buildDashboardRedirect(returnPath, params = {}) {
  const { dashboardUrl } = getShopifyConfig();
  const url = new URL(safeReturnPath(returnPath), `${dashboardUrl}/`);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function beginOauth({ brandId, clerkUserId, shopDomain, returnPath }) {
  const config = getShopifyConfig({ required: true });
  const normalizedShop = normalizeShopDomain(shopDomain);

  if (!normalizedShop) {
    const error = new Error("Enter your store's .myshopify.com address.");
    error.statusCode = 400;
    error.code = "invalid_shopify_store";
    throw error;
  }

  const existingShop = await connectionStore.getConnectionByShopDomain(normalizedShop);
  if (existingShop && existingShop.brand_id !== brandId) {
    const error = new Error("This Shopify store is already connected to another Teviq workspace.");
    error.statusCode = 409;
    error.code = "shopify_store_already_connected";
    throw error;
  }

  const state = crypto.randomBytes(32).toString("hex");
  await connectionStore.deleteExpiredOauthStates().catch(() => {});
  await connectionStore.createOauthState({
    state_hash: hashState(state),
    brand_id: brandId,
    clerk_user_id: clerkUserId,
    shop_domain: normalizedShop,
    return_path: safeReturnPath(returnPath),
    expires_at: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString()
  });

  const authorizeUrl = new URL(`https://${normalizedShop}/admin/oauth/authorize`);
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("scope", config.scopes.join(","));
  authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizeUrl.searchParams.set("state", state);

  return {
    authorizationUrl: authorizeUrl.toString(),
    shopDomain: normalizedShop
  };
}

async function exchangeAuthorizationCode({ shopDomain, code }) {
  const config = getShopifyConfig({ required: true });
  return shopifyAdminProvider.requestToken(shopDomain, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    expiring: "1"
  });
}

async function completeOauth(query) {
  const config = getShopifyConfig({ required: true });
  const shopDomain = normalizeShopDomain(query?.shop);
  const code = String(query?.code || "").trim();
  const state = String(query?.state || "").trim();

  if (!shopDomain || !code || !state || !verifyCallbackHmac(query, config.clientSecret)) {
    const error = new Error("Shopify authorization could not be verified.");
    error.statusCode = 400;
    error.code = "invalid_shopify_callback";
    throw error;
  }

  const oauthState = await connectionStore.consumeOauthState(hashState(state));
  if (!oauthState) {
    const error = new Error("This Shopify connection request has expired. Start again from Teviq.");
    error.statusCode = 400;
    error.code = "shopify_oauth_state_missing";
    throw error;
  }

  if (new Date(oauthState.expires_at).getTime() <= Date.now()) {
    const error = new Error("This Shopify connection request has expired. Start again from Teviq.");
    error.statusCode = 400;
    error.code = "shopify_oauth_state_expired";
    error.returnPath = oauthState.return_path;
    throw error;
  }

  if (oauthState.shop_domain !== shopDomain) {
    const error = new Error("The authorized Shopify store does not match the requested store.");
    error.statusCode = 400;
    error.code = "shopify_store_mismatch";
    error.returnPath = oauthState.return_path;
    throw error;
  }

  const existingShop = await connectionStore.getConnectionByShopDomain(shopDomain);
  if (existingShop && existingShop.brand_id !== oauthState.brand_id) {
    const error = new Error("This Shopify store is already connected to another Teviq workspace.");
    error.statusCode = 409;
    error.code = "shopify_store_already_connected";
    error.returnPath = oauthState.return_path;
    throw error;
  }

  const tokenData = await exchangeAuthorizationCode({ shopDomain, code });
  const summary = await shopifyAdminProvider.getSummaryWithToken({
    shopDomain,
    accessToken: tokenData.access_token
  });
  const now = new Date().toISOString();
  const connection = await connectionStore.upsertConnection({
    brand_id: oauthState.brand_id,
    shop_domain: shopDomain,
    shop_name: summary.shop.name || shopDomain,
    primary_domain_url: summary.shop.primaryDomain?.url || "",
    access_token_encrypted: JSON.stringify(encryptValue(tokenData.access_token)),
    refresh_token_encrypted: tokenData.refresh_token
      ? JSON.stringify(encryptValue(tokenData.refresh_token))
      : null,
    access_token_expires_at: shopifyAdminProvider.addSeconds(tokenData.expires_in),
    refresh_token_expires_at: shopifyAdminProvider.addSeconds(tokenData.refresh_token_expires_in),
    scopes: String(tokenData.scope || "")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
    status: "active",
    installed_by_clerk_user_id: oauthState.clerk_user_id,
    connected_at: now,
    updated_at: now,
    last_synced_at: now,
    last_sync_status: "success",
    last_sync_error: null,
    product_count: summary.productCount,
    order_count: summary.orderCount,
    categories: []
  });

  return {
    connection: connectionStore.toPublicConnection(connection),
    returnPath: oauthState.return_path
  };
}

module.exports = {
  SHOP_DOMAIN_PATTERN,
  beginOauth,
  buildDashboardRedirect,
  completeOauth,
  exchangeAuthorizationCode,
  hashState,
  normalizeShopDomain,
  safeReturnPath,
  verifyCallbackHmac
};
