const shopifyDemoService = require("./shopifySync.service");
const shopifyDemoProvider = require("./shopifyDemo.provider");
const shopifyAdminProvider = require("./shopifyAdmin.provider");
const shopifyOauthService = require("./shopifyOAuth.service");
const connectionStore = require("./shopifyConnection.store");
const cacheStore = require("./shopifyCache.store");
const webhookSubscriptions = require("./shopifyWebhookSubscriptions.service");
const { isShopifyOauthConfigured } = require("./shopifyConfig");

function disconnectedStatus(brandId) {
  return {
    provider: "shopify",
    brandId,
    connected: false,
    status: "not_connected",
    productCount: 0,
    orderCount: 0,
    categories: [],
    lastSyncedAt: null,
    mode: "live",
    oauthConfigured: isShopifyOauthConfigured(),
    message: "Connect Shopify to sync this brand's products and orders."
  };
}

async function getLiveConnection(brandId) {
  return connectionStore.getConnectionByBrandId(brandId);
}

async function getStatus(brandId) {
  const connection = await getLiveConnection(brandId);
  if (connection) {
    const publicConnection = connectionStore.toPublicConnection(connection);
    return {
      ...publicConnection,
      connected: connection.status === "active",
      mode: "live",
      oauthConfigured: isShopifyOauthConfigured(),
      message: connection.status === "active"
        ? "Shopify is connected and ready to sync."
        : "Reconnect Shopify to resume syncing."
    };
  }

  const demoSummary = shopifyDemoProvider.getStoreSummary(brandId);
  if (demoSummary.connected) {
    return {
      ...shopifyDemoService.getStatus(brandId),
      oauthConfigured: isShopifyOauthConfigured()
    };
  }

  return disconnectedStatus(brandId);
}

async function syncBrand(brandId) {
  const connection = await getLiveConnection(brandId);
  if (!connection) return shopifyDemoService.syncBrand(brandId);

  const result = await shopifyAdminProvider.syncBrand(brandId);
  const webhooks = await webhookSubscriptions.ensureOperationalSubscriptions(brandId).catch((error) => ({
    status: "error",
    errors: [error.message]
  }));
  const publicConnection = connectionStore.toPublicConnection(result.connection);
  return {
    ok: true,
    provider: "shopify",
    brandId,
    syncedAt: result.syncedAt,
    imported: {
      products: publicConnection.productCount,
      orders: publicConnection.orderCount
    },
    categories: publicConnection.categories,
    status: publicConnection.status,
    mode: "live",
    webhooks,
    message: "Shopify sync completed."
  };
}

async function listProducts(brandId) {
  const connection = await getLiveConnection(brandId);
  if (!connection) return shopifyDemoService.listProducts(brandId);
  if (connection.status !== "active") return [];
  return shopifyAdminProvider.getProducts(brandId, { first: 50 });
}

async function beginConnection({ brandId, clerkUserId, shopDomain, returnPath }) {
  return shopifyOauthService.beginOauth({ brandId, clerkUserId, shopDomain, returnPath });
}

async function disconnect(brandId) {
  const connection = await getLiveConnection(brandId);
  if (!connection) return false;
  await webhookSubscriptions.removeOperationalSubscriptions(brandId).catch(() => {});
  await cacheStore.clearBrandCache(brandId).catch(() => {});
  return connectionStore.deleteConnection(brandId);
}

module.exports = {
  beginConnection,
  disconnect,
  getStatus,
  listProducts,
  syncBrand
};
