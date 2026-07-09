const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "..", "data", "shopify-demo");

function isSafeBrandId(brandId) {
  return /^[a-z0-9-]+$/.test(String(brandId || ""));
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.warn(`[shopify-demo] Failed to read ${filePath}: ${error.message}`);
    return [];
  }
}

function getBrandFile(brandId, type) {
  if (!isSafeBrandId(brandId)) return null;
  return path.join(dataDir, `${brandId}-${type}.json`);
}

function getProducts(brandId) {
  const filePath = getBrandFile(brandId, "products");
  if (!filePath) return [];
  return readJson(filePath).filter((product) => product.brandId == null || product.brandId === brandId);
}

function getOrders(brandId) {
  const filePath = getBrandFile(brandId, "orders");
  if (!filePath) return [];
  return readJson(filePath).filter((order) => order.brandId === brandId);
}

function normalizeOrder(order) {
  if (!order) return null;
  return {
    ...order,
    source: order.source || "shopify-demo",
    trackingText: order.trackingText || "Order status is available from the demo Shopify connector.",
    estimatedUpdate: order.estimatedUpdate || "No estimated update available."
  };
}

function getOrderById(brandId, orderId) {
  const normalizedOrderId = String(orderId || "").replace(/[-_\s]/g, "").toUpperCase();
  if (!normalizedOrderId) return null;

  const order = getOrders(brandId).find(
    (item) => item.orderId.replace(/[-_\s]/g, "").toUpperCase() === normalizedOrderId
  );

  return normalizeOrder(order);
}

function getProductByName(brandId, name) {
  const normalizedName = String(name || "").toLowerCase().trim();
  if (!normalizedName) return null;

  return (
    getProducts(brandId).find((product) => {
      const searchable = [
        product.title,
        product.handle,
        product.category,
        ...(product.tags || []),
        ...(product.keywords || [])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedName) || normalizedName.includes(String(product.title).toLowerCase());
    }) || null
  );
}

function getStoreSummary(brandId) {
  const products = getProducts(brandId);
  const orders = getOrders(brandId);
  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))];

  return {
    provider: "shopify-demo",
    brandId,
    connected: products.length > 0 || orders.length > 0,
    productCount: products.length,
    orderCount: orders.length,
    categories,
    lastSyncedAt: new Date().toISOString(),
    mode: "demo"
  };
}

module.exports = {
  getOrderById,
  getOrders,
  getProducts,
  getProductByName,
  getStoreSummary
};
