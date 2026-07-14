const crypto = require("crypto");
const { getShopifyConfig } = require("./shopifyConfig");
const connectionStore = require("./shopifyConnection.store");
const cacheStore = require("./shopifyCache.store");
const { normalizeShopDomain } = require("./shopifyOAuth.service");

const SUPPORTED_TOPICS = new Set([
  "products/create",
  "products/update",
  "products/delete",
  "orders/create",
  "orders/updated",
  "orders/cancelled",
  "fulfillments/create",
  "fulfillments/update",
  "app/uninstalled"
]);

function readHeader(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return String(headers.get(name) || "");
  return String(headers[name.toLowerCase()] || headers[name] || "");
}

function verifyWebhookHmac(rawBody, suppliedHmac, clientSecret) {
  if (!Buffer.isBuffer(rawBody) || !suppliedHmac || !clientSecret) return false;
  const expected = crypto
    .createHmac("sha256", clientSecret)
    .update(rawBody)
    .digest("base64");
  const supplied = Buffer.from(String(suppliedHmac), "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return supplied.length === expectedBuffer.length && crypto.timingSafeEqual(supplied, expectedBuffer);
}

function graphqlId(resource, legacyId, providedId) {
  if (providedId) return String(providedId);
  return legacyId == null ? "" : `gid://shopify/${resource}/${legacyId}`;
}

function parseTags(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeProductPayload(payload) {
  const variants = Array.isArray(payload?.variants) ? payload.variants : [];
  const firstVariant = variants[0] || {};
  const totalInventory = variants.reduce(
    (sum, variant) => sum + (Number(variant.inventory_quantity) || 0),
    0
  );
  const status = String(payload?.status || "").toUpperCase();

  return {
    id: graphqlId("Product", payload?.id, payload?.admin_graphql_api_id),
    legacyResourceId: payload?.id == null ? null : String(payload.id),
    title: String(payload?.title || ""),
    handle: String(payload?.handle || ""),
    category: String(payload?.product_type || "Uncategorized"),
    tags: parseTags(payload?.tags),
    status,
    price: String(firstVariant.price || "0.00"),
    currency: String(payload?.currency || "INR"),
    available: status === "ACTIVE" && (variants.length === 0 || totalInventory !== 0),
    imageUrl: String(payload?.image?.src || payload?.images?.[0]?.src || ""),
    imageAlt: String(payload?.image?.alt || payload?.images?.[0]?.alt || payload?.title || ""),
    updatedAt: payload?.updated_at || null
  };
}

function safeLineItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 100).map((item) => ({
    title: String(item?.title || item?.name || ""),
    quantity: Number(item?.quantity || 0),
    sku: String(item?.sku || ""),
    productId: item?.product_id == null ? null : String(item.product_id),
    variantId: item?.variant_id == null ? null : String(item.variant_id)
  }));
}

function normalizeFulfillmentPayload(payload) {
  return {
    id: graphqlId("Fulfillment", payload?.id, payload?.admin_graphql_api_id),
    legacyResourceId: payload?.id == null ? null : String(payload.id),
    status: String(payload?.status || ""),
    trackingCompany: String(payload?.tracking_company || ""),
    trackingNumber: String(payload?.tracking_number || ""),
    trackingUrl: String(payload?.tracking_url || ""),
    updatedAt: payload?.updated_at || payload?.created_at || null
  };
}

function normalizeOrderPayload(payload) {
  return {
    id: graphqlId("Order", payload?.id, payload?.admin_graphql_api_id),
    legacyResourceId: payload?.id == null ? null : String(payload.id),
    name: String(payload?.name || ""),
    fulfillmentStatus: payload?.fulfillment_status || null,
    financialStatus: payload?.financial_status || null,
    cancelledAt: payload?.cancelled_at || null,
    processedAt: payload?.processed_at || payload?.created_at || null,
    updatedAt: payload?.updated_at || null,
    lineItems: safeLineItems(payload?.line_items),
    fulfillments: (Array.isArray(payload?.fulfillments) ? payload.fulfillments : [])
      .slice(0, 50)
      .map(normalizeFulfillmentPayload)
  };
}

function mergeFulfillment(existing, incoming) {
  const current = Array.isArray(existing) ? existing : [];
  const key = incoming.id || incoming.legacyResourceId;
  return [...current.filter((item) => (item.id || item.legacyResourceId) !== key), incoming];
}

async function applyWebhookTopic({ brandId, shopDomain, topic, payload, stores }) {
  if (topic === "products/create" || topic === "products/update") {
    const product = normalizeProductPayload(payload);
    await stores.cache.upsertProducts(brandId, shopDomain, [product]);
    return product.legacyResourceId || product.id;
  }

  if (topic === "products/delete") {
    const productId = graphqlId("Product", payload?.id, payload?.admin_graphql_api_id);
    await stores.cache.deleteProduct(brandId, productId);
    return payload?.id || productId;
  }

  if (topic === "orders/create" || topic === "orders/updated" || topic === "orders/cancelled") {
    const order = normalizeOrderPayload(payload);
    await stores.cache.upsertOrders(brandId, shopDomain, [order]);
    return order.legacyResourceId || order.id;
  }

  if (topic === "fulfillments/create" || topic === "fulfillments/update") {
    const orderLegacyId = payload?.order_id == null ? "" : String(payload.order_id);
    const fulfillment = normalizeFulfillmentPayload(payload);
    const existing = orderLegacyId
      ? await stores.cache.getOrderByLegacyId(brandId, orderLegacyId)
      : null;

    if (existing) {
      await stores.cache.updateOrder(brandId, existing.shopify_order_id, {
        fulfillments: mergeFulfillment(existing.fulfillments, fulfillment),
        fulfillment_status: payload?.shipment_status || existing.fulfillment_status,
        shopify_updated_at: fulfillment.updatedAt
      });
    } else if (orderLegacyId) {
      await stores.cache.upsertOrders(brandId, shopDomain, [{
        id: graphqlId("Order", orderLegacyId),
        legacyResourceId: orderLegacyId,
        fulfillments: [fulfillment]
      }]);
    }
    return fulfillment.legacyResourceId || fulfillment.id;
  }

  if (topic === "app/uninstalled") {
    await stores.cache.clearBrandCache(brandId);
    await stores.connection.deleteConnection(brandId);
    return payload?.id || shopDomain;
  }

  return null;
}

async function processWebhook({ headers, rawBody }, dependencies = {}) {
  const config = dependencies.config || getShopifyConfig();
  if (!config.clientSecret) {
    const error = new Error("Shopify webhook verification is not configured.");
    error.statusCode = 503;
    error.code = "shopify_webhook_not_configured";
    throw error;
  }
  const stores = {
    cache: dependencies.cacheStore || cacheStore,
    connection: dependencies.connectionStore || connectionStore
  };
  const hmac = readHeader(headers, "x-shopify-hmac-sha256");
  const topic = readHeader(headers, "x-shopify-topic").toLowerCase();
  const webhookId = readHeader(headers, "x-shopify-webhook-id");
  const shopDomain = normalizeShopDomain(readHeader(headers, "x-shopify-shop-domain"));

  if (!verifyWebhookHmac(rawBody, hmac, config.clientSecret)) {
    const error = new Error("Shopify webhook signature is invalid.");
    error.statusCode = 401;
    error.code = "invalid_shopify_webhook";
    throw error;
  }

  if (!webhookId || !shopDomain || !SUPPORTED_TOPICS.has(topic)) {
    const error = new Error("Shopify webhook headers are invalid.");
    error.statusCode = 400;
    error.code = "invalid_shopify_webhook";
    throw error;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    const error = new Error("Shopify webhook body is invalid JSON.");
    error.statusCode = 400;
    error.code = "invalid_shopify_webhook";
    throw error;
  }

  const connection = await stores.connection.getConnectionByShopDomain(shopDomain);
  if (!connection || connection.status !== "active") {
    return { ok: true, ignored: true, reason: "connection_not_active" };
  }

  const claimed = await stores.cache.claimWebhookEvent({
    webhook_id: webhookId,
    brand_id: connection.brand_id,
    shop_domain: shopDomain,
    topic,
    api_version: readHeader(headers, "x-shopify-api-version") || null,
    triggered_at: readHeader(headers, "x-shopify-triggered-at") || null,
    status: "processing"
  });

  if (!claimed) return { ok: true, duplicate: true };

  try {
    const resourceId = await applyWebhookTopic({
      brandId: connection.brand_id,
      shopDomain,
      topic,
      payload,
      stores
    });
    if (topic !== "app/uninstalled") {
      const connectionUpdates = {
        last_synced_at: new Date().toISOString(),
        last_sync_status: "success",
        last_sync_error: null
      };
      if (topic.startsWith("products/")) {
        connectionUpdates.product_count = await stores.cache.countRows(
          "shopify_products",
          connection.brand_id
        );
      }
      if (topic.startsWith("orders/")) {
        connectionUpdates.order_count = await stores.cache.countRows(
          "shopify_orders",
          connection.brand_id
        );
      }
      await stores.connection.updateConnection(connection.brand_id, connectionUpdates);
    }
    await stores.cache.finishWebhookEvent(webhookId, "processed", { resourceId });
    return { ok: true, processed: true };
  } catch (error) {
    await stores.cache.finishWebhookEvent(webhookId, "failed", { error: error.message }).catch(() => {});
    throw error;
  }
}

module.exports = {
  SUPPORTED_TOPICS,
  applyWebhookTopic,
  mergeFulfillment,
  normalizeFulfillmentPayload,
  normalizeOrderPayload,
  normalizeProductPayload,
  processWebhook,
  readHeader,
  safeLineItems,
  verifyWebhookHmac
};
