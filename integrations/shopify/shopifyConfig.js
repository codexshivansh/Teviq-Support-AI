const DEFAULT_SCOPES = ["read_products", "read_orders"];

function normalizeCsv(value) {
  return Array.from(new Set(String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)));
}

function getShopifyConfig({ required = false } = {}) {
  const clientId = String(process.env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.SHOPIFY_CLIENT_SECRET || "").trim();
  const hasCredentialSecret = Boolean(String(process.env.SHOPIFY_CREDENTIALS_SECRET || "").trim());
  const publicApiUrl = String(
    process.env.PUBLIC_API_URL || "https://teviq-support-ai-backend.onrender.com"
  ).replace(/\/$/, "");
  const dashboardUrl = String(
    process.env.DASHBOARD_URL || "https://dashboard.teviq.in"
  ).replace(/\/$/, "");
  const redirectUri = String(
    process.env.SHOPIFY_REDIRECT_URI ||
      `${publicApiUrl}/api/integrations/shopify/oauth/callback`
  ).trim();
  const scopes = normalizeCsv(process.env.SHOPIFY_SCOPES);

  if (required && (!clientId || !clientSecret || !redirectUri || !hasCredentialSecret)) {
    const error = new Error("Shopify OAuth is not configured yet. Contact Teviq support.");
    error.statusCode = 503;
    error.code = "shopify_oauth_not_configured";
    throw error;
  }

  return {
    apiVersion: process.env.SHOPIFY_ADMIN_API_VERSION || "2026-07",
    clientId,
    clientSecret,
    dashboardUrl,
    hasCredentialSecret,
    redirectUri,
    scopes: scopes.length ? scopes : DEFAULT_SCOPES
  };
}

function isShopifyOauthConfigured() {
  const config = getShopifyConfig();
  return Boolean(
    config.clientId && config.clientSecret && config.redirectUri && config.hasCredentialSecret
  );
}

module.exports = {
  DEFAULT_SCOPES,
  getShopifyConfig,
  isShopifyOauthConfigured,
  normalizeCsv
};
