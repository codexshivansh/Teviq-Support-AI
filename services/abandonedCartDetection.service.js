const shopifyDemoProvider = require("../integrations/shopify/shopifyDemo.provider");

const ABANDONED_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
const EXCLUDED_STATUSES = new Set(["converted", "recovered"]);

function isAbandoned(cart, now = new Date()) {
  if (!cart || !cart.createdAt) return false;
  if (EXCLUDED_STATUSES.has(cart.status)) return false;

  const createdAt = new Date(cart.createdAt);
  if (Number.isNaN(createdAt.getTime())) return false;

  return now.getTime() - createdAt.getTime() >= ABANDONED_THRESHOLD_MS;
}

function findAbandonedCarts(brandId, now = new Date()) {
  return shopifyDemoProvider.getCarts(brandId).filter((cart) => isAbandoned(cart, now));
}

module.exports = { findAbandonedCarts, isAbandoned };
