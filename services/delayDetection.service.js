const localOrders = require("../data/orders.json");
const shopifyDemoProvider = require("../integrations/shopify/shopifyDemo.provider");

const EXCLUDED_STATUSES = new Set(["Delivered", "Cancelled"]);

function isDelayed(order, today = new Date()) {
  if (!order || !order.expectedDeliveryDate) return false;
  if (EXCLUDED_STATUSES.has(order.status)) return false;

  const expected = new Date(`${order.expectedDeliveryDate}T00:00:00.000Z`);
  if (Number.isNaN(expected.getTime())) return false;

  const todayMidnight = new Date(today);
  todayMidnight.setUTCHours(0, 0, 0, 0);

  return expected.getTime() < todayMidnight.getTime();
}

// Checks both order sources for this brand — the Shopify demo connector
// (data/shopify-demo/<brandId>-orders.json) and the local orders.json
// fallback — matching the same two-source lookup order.service.js already
// uses for individual order lookups.
function findDelayedOrders(brandId, today = new Date()) {
  const shopifyOrders = shopifyDemoProvider.getOrders(brandId);
  const fallbackOrders = localOrders.filter((order) => order.brandId === brandId);

  return [...shopifyOrders, ...fallbackOrders].filter((order) => isDelayed(order, today));
}

module.exports = { findDelayedOrders, isDelayed };
