const orders = require("../data/orders.json");
const shopifyDemoProvider = require("../integrations/shopify/shopifyDemo.provider");
const shopifyCacheStore = require("../integrations/shopify/shopifyCache.store");
const { extractOrderId, normalizeOrderId } = require("./orderReference.service");

const DEMO_BRAND_IDS = new Set(["vastra-demo", "urban-demo", "beauty-demo"]);

function detectOrderIntent(message) {
  return /\b(order|track|tracking|shipment|shipped|delivery|delivered|courier|awb|status)\b/i.test(
    message
  );
}

function humanizeStatus(value) {
  return String(value || "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getCustomerFacingStatus(order) {
  if (order.cancelled_at) return "Cancelled";

  const financialStatus = String(order.financial_status || "").toUpperCase();
  if (financialStatus === "REFUNDED") return "Refunded";
  if (financialStatus === "PARTIALLY_REFUNDED") return "Partially Refunded";

  const fulfillmentStatus = String(order.fulfillment_status || "").toUpperCase();
  const statusMap = {
    FULFILLED: "Fulfilled",
    IN_PROGRESS: "Being Fulfilled",
    ON_HOLD: "On Hold",
    OPEN: "Processing",
    PARTIALLY_FULFILLED: "Partially Fulfilled",
    PENDING_FULFILLMENT: "Processing",
    REQUEST_DECLINED: "Fulfillment Declined",
    RESTOCKED: "Restocked",
    SCHEDULED: "Scheduled",
    UNFULFILLED: "Processing"
  };

  return statusMap[fulfillmentStatus] || humanizeStatus(fulfillmentStatus) || "Processing";
}

function buildTrackingText(order) {
  const tracking = (order.fulfillments || [])
    .flatMap((fulfillment) => {
      if (Array.isArray(fulfillment.tracking)) return fulfillment.tracking;
      if (fulfillment.trackingNumber || fulfillment.trackingCompany) {
        return [{
          number: fulfillment.trackingNumber,
          company: fulfillment.trackingCompany,
          url: fulfillment.trackingUrl
        }];
      }
      return [];
    })
    .find((item) => item?.number || item?.company);

  if (tracking) {
    const carrier = tracking.company ? ` with ${tracking.company}` : "";
    const number = tracking.number ? `: ${tracking.number}` : "";
    return `Carrier tracking${carrier}${number}.`;
  }

  const paymentStatus = humanizeStatus(order.financial_status);
  return paymentStatus
    ? `Payment status is ${paymentStatus}. No carrier tracking details are available yet.`
    : "No carrier tracking details are available yet.";
}

function mapCachedShopifyOrder(order, brandId) {
  return {
    brandId,
    orderId: order.order_name,
    shopifyOrderId: order.shopify_order_id,
    status: getCustomerFacingStatus(order),
    trackingText: buildTrackingText(order),
    estimatedUpdate: null,
    items: (order.line_items || []).map((item) => item.title).filter(Boolean),
    source: "shopify-live",
    financialStatus: order.financial_status,
    fulfillmentStatus: order.fulfillment_status,
    updatedAt: order.shopify_updated_at || order.synced_at || null
  };
}

async function getLiveShopifyOrder(orderId, brandId) {
  try {
    const order = await shopifyCacheStore.getOrderByReference(brandId, orderId);
    return order ? mapCachedShopifyOrder(order, brandId) : null;
  } catch (error) {
    console.error(
      `[order-service] Shopify cache lookup failed for brand ${brandId}: ${error.code || error.message}`
    );
    return null;
  }
}

async function getOrderById(orderId, brandId, customerId) {
  const normalizedOrderId = normalizeOrderId(orderId);
  if (!normalizedOrderId || !brandId) return null;

  const shopifyOrder = shopifyDemoProvider.getOrderById(brandId, normalizedOrderId);

  if (shopifyOrder) {
    const sameCustomer =
      !customerId ||
      customerId === "guest" ||
      customerId.startsWith("guest_") ||
      shopifyOrder.customerId === customerId;

    return sameCustomer ? shopifyOrder : null;
  }

  if (!DEMO_BRAND_IDS.has(brandId)) {
    const liveShopifyOrder = await getLiveShopifyOrder(normalizedOrderId, brandId);
    if (liveShopifyOrder) return liveShopifyOrder;
  }

  return (
    orders.find((order) => {
      const sameBrand = order.brandId === brandId;
      const sameOrder = normalizeOrderId(order.orderId) === normalizedOrderId;
      const sameCustomer =
        !customerId ||
        customerId === "guest" ||
        customerId.startsWith("guest_") ||
        order.customerId === customerId;

      return sameBrand && sameOrder && sameCustomer;
    }) || null
  );
}

module.exports = { detectOrderIntent, extractOrderId, getOrderById };
