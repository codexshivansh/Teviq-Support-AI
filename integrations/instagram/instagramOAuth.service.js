const crypto = require("node:crypto");
const { encryptValue } = require("../../services/shopifyCredentials.service");
const connectionStore = require("./instagramConnection.store");

const REQUIRED_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"];
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function getInstagramConfig({ required = false } = {}) {
  const appId = String(process.env.INSTAGRAM_APP_ID || "").trim();
  const appSecret = String(process.env.INSTAGRAM_APP_SECRET || "").trim();
  const apiBaseUrl = String(process.env.PUBLIC_API_URL || "https://teviq-support-ai-backend.onrender.com").replace(/\/$/, "");
  const dashboardUrl = String(process.env.DASHBOARD_URL || "https://dashboard.teviq.in").replace(/\/$/, "");
  const redirectUri = String(
    process.env.INSTAGRAM_REDIRECT_URI || `${apiBaseUrl}/api/instagram/oauth/callback`
  ).trim();
  const hasCredentialSecret = Boolean(String(process.env.SHOPIFY_CREDENTIALS_SECRET || process.env.CLERK_SECRET_KEY || "").trim());

  if (required && (!appId || !appSecret || !redirectUri || !hasCredentialSecret)) {
    const error = new Error("Instagram Login is not configured yet. Contact Teviq support.");
    error.statusCode = 503;
    error.code = "instagram_oauth_not_configured";
    throw error;
  }
  return { appId, appSecret, apiBaseUrl, dashboardUrl, redirectUri, hasCredentialSecret };
}

function hashState(state) {
  return crypto.createHash("sha256").update(String(state)).digest("hex");
}

function safeReturnPath(value) {
  return value === "/settings" ? value : "/settings";
}

function buildDashboardRedirect(returnPath, params = {}) {
  const { dashboardUrl } = getInstagramConfig();
  const url = new URL(safeReturnPath(returnPath), `${dashboardUrl}/`);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function beginOauth({ brandId, clerkUserId, returnPath }) {
  const config = getInstagramConfig({ required: true });
  const state = crypto.randomBytes(32).toString("hex");
  await connectionStore.deleteExpiredOauthStates().catch(() => {});
  await connectionStore.createOauthState({
    state_hash: hashState(state),
    brand_id: brandId,
    clerk_user_id: clerkUserId,
    return_path: safeReturnPath(returnPath),
    expires_at: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString()
  });

  const authorizationUrl = new URL("https://www.instagram.com/oauth/authorize");
  authorizationUrl.searchParams.set("client_id", config.appId);
  authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", REQUIRED_SCOPES.join(","));
  authorizationUrl.searchParams.set("state", state);
  return { authorizationUrl: authorizationUrl.toString() };
}

async function parseProviderResponse(response, operation) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error_message || body?.error?.message || `Instagram ${operation} failed.`);
    error.statusCode = response.status >= 500 ? 502 : 400;
    error.code = `instagram_${operation.replace(/\s+/g, "_")}_failed`;
    throw error;
  }
  return body;
}

async function exchangeCode(code) {
  const config = getInstagramConfig({ required: true });
  const form = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code
  });
  const shortLived = await parseProviderResponse(await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  }), "code exchange");
  if (!shortLived?.access_token || !shortLived?.user_id) {
    const error = new Error("Instagram returned an incomplete authorization response.");
    error.statusCode = 502;
    error.code = "instagram_invalid_token_response";
    throw error;
  }

  const longLivedUrl = new URL("https://graph.instagram.com/access_token");
  longLivedUrl.searchParams.set("grant_type", "ig_exchange_token");
  longLivedUrl.searchParams.set("client_secret", config.appSecret);
  longLivedUrl.searchParams.set("access_token", shortLived.access_token);
  const longLived = await parseProviderResponse(await fetch(longLivedUrl), "long-lived token exchange");
  if (!longLived?.access_token) {
    const error = new Error("Instagram did not return a long-lived access token.");
    error.statusCode = 502;
    error.code = "instagram_invalid_token_response";
    throw error;
  }

  const profileUrl = new URL("https://graph.instagram.com/me");
  profileUrl.searchParams.set("fields", "user_id,username");
  profileUrl.searchParams.set("access_token", longLived.access_token);
  const profile = await parseProviderResponse(await fetch(profileUrl), "profile lookup");
  const instagramUserId = String(profile?.user_id || profile?.id || shortLived.user_id || "");
  if (!instagramUserId) {
    const error = new Error("Instagram profile lookup did not return an account ID.");
    error.statusCode = 502;
    error.code = "instagram_profile_missing_id";
    throw error;
  }

  return {
    instagramUserId,
    username: String(profile?.username || ""),
    accessToken: longLived.access_token,
    expiresIn: Number(longLived.expires_in) || null,
    scopes: REQUIRED_SCOPES
  };
}

async function completeOauth(query) {
  const config = getInstagramConfig({ required: true });
  const state = String(query?.state || "").trim();
  const code = String(query?.code || "").trim();
  if (!state || !code || query?.error) {
    const error = new Error("Instagram authorization was cancelled or could not be verified.");
    error.statusCode = 400;
    error.code = "instagram_invalid_oauth_callback";
    throw error;
  }

  const oauthState = await connectionStore.consumeOauthState(hashState(state));
  if (!oauthState) {
    const error = new Error("This Instagram connection request expired. Start again from Teviq.");
    error.statusCode = 400;
    error.code = "instagram_oauth_state_missing";
    throw error;
  }
  if (new Date(oauthState.expires_at).getTime() <= Date.now()) {
    const error = new Error("This Instagram connection request expired. Start again from Teviq.");
    error.statusCode = 400;
    error.code = "instagram_oauth_state_expired";
    error.returnPath = oauthState.return_path;
    throw error;
  }

  const authorization = await exchangeCode(code);
  const now = new Date().toISOString();
  const connection = await connectionStore.upsertConnection({
    brand_id: oauthState.brand_id,
    instagram_user_id: authorization.instagramUserId,
    username: authorization.username || null,
    access_token_encrypted: JSON.stringify(encryptValue(authorization.accessToken)),
    scopes: authorization.scopes,
    status: "active",
    installed_by_clerk_user_id: oauthState.clerk_user_id,
    connected_at: now,
    updated_at: now,
    token_issued_at: now,
    token_expires_at: authorization.expiresIn ? new Date(Date.now() + authorization.expiresIn * 1000).toISOString() : null
  });

  return { connection: connectionStore.toPublicConnection(connection), returnPath: oauthState.return_path };
}

function isInstagramOauthConfigured() {
  const config = getInstagramConfig();
  return Boolean(config.appId && config.appSecret && config.redirectUri && config.hasCredentialSecret);
}

module.exports = {
  REQUIRED_SCOPES,
  beginOauth,
  buildDashboardRedirect,
  completeOauth,
  getInstagramConfig,
  hashState,
  isInstagramOauthConfigured,
  safeReturnPath
};
