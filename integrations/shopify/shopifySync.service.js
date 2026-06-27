const shopifyDemoProvider = require("./shopifyDemo.provider");

function getStatus(brandId) {
  const summary = shopifyDemoProvider.getStoreSummary(brandId);

  return {
    ...summary,
    status: summary.connected ? "connected" : "not_configured",
    message: summary.connected
      ? "Demo Shopify connector is ready for this brand."
      : "No demo Shopify data is configured for this brand."
  };
}

function syncBrand(brandId) {
  const summary = shopifyDemoProvider.getStoreSummary(brandId);

  return {
    ok: summary.connected,
    provider: "shopify-demo",
    brandId,
    syncedAt: new Date().toISOString(),
    imported: {
      products: summary.productCount,
      orders: summary.orderCount
    },
    mode: "demo",
    message: summary.connected
      ? "Demo sync completed from local Shopify-style JSON data."
      : "No demo Shopify data found to sync."
  };
}

function listProducts(brandId) {
  return shopifyDemoProvider.getProducts(brandId);
}

module.exports = {
  getStatus,
  syncBrand,
  listProducts
};
