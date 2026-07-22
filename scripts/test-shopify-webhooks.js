const crypto = require("crypto");
const {
  mergeFulfillment,
  normalizeOrderPayload,
  processWebhook,
  verifyWebhookHmac
} = require("../integrations/shopify/shopifyWebhook.service");
const { DEFAULT_SCOPES } = require("../integrations/shopify/shopifyConfig");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function signature(body, secret) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64");
}

function webhookHeaders({ body, secret, topic = "products/update", id = "webhook-1" }) {
  return {
    "x-shopify-hmac-sha256": signature(body, secret),
    "x-shopify-topic": topic,
    "x-shopify-shop-domain": "test-store.myshopify.com",
    "x-shopify-webhook-id": id,
    "x-shopify-api-version": "2026-07",
    "x-shopify-triggered-at": "2026-07-14T10:00:00Z"
  };
}

function createStores({ claimed = true } = {}) {
  const calls = [];
  return {
    calls,
    connectionStore: {
      async getConnectionByShopDomain() {
        return { brand_id: "brand-a", status: "active" };
      },
      async updateConnection(brandId, updates) {
        calls.push({ method: "updateConnection", brandId, updates });
      },
      async deleteConnection(brandId) {
        calls.push({ method: "deleteConnection", brandId });
      },
      async deleteConnectionByShopDomain(shopDomain) {
        calls.push({ method: "deleteConnectionByShopDomain", shopDomain });
      }
    },
    cacheStore: {
      async claimWebhookEvent(event) {
        calls.push({ method: "claimWebhookEvent", event });
        return claimed;
      },
      async finishWebhookEvent(id, status, updates) {
        calls.push({ method: "finishWebhookEvent", id, status, updates });
      },
      async countRows(table, brandId) {
        calls.push({ method: "countRows", table, brandId });
        return table === "shopify_products" ? 1 : 0;
      },
      async upsertProducts(brandId, shopDomain, products) {
        calls.push({ method: "upsertProducts", brandId, shopDomain, products });
      },
      async upsertOrders(brandId, shopDomain, orders) {
        calls.push({ method: "upsertOrders", brandId, shopDomain, orders });
      },
      async deleteProduct(brandId, productId) {
        calls.push({ method: "deleteProduct", brandId, productId });
      },
      async getOrderByLegacyId() {
        return null;
      },
      async updateOrder() {},
      async clearBrandCache(brandId) {
        calls.push({ method: "clearBrandCache", brandId });
      },
      async clearShopCache(shopDomain) {
        calls.push({ method: "clearShopCache", shopDomain });
      }
    }
  };
}

async function run() {
  const secret = "shopify-test-secret";
  const body = Buffer.from(JSON.stringify({
    id: 101,
    admin_graphql_api_id: "gid://shopify/Product/101",
    brand_id: "brand-b",
    title: "Everyday Backpack",
    status: "active",
    variants: [{ price: "1499.00", inventory_quantity: 5 }]
  }));
  const hmac = signature(body, secret);
  assert(verifyWebhookHmac(body, hmac, secret), "valid raw-body HMAC should pass");
  assert(!verifyWebhookHmac(Buffer.from("tampered"), hmac, secret), "tampered body must fail HMAC");

  const stores = createStores();
  const result = await processWebhook(
    { headers: webhookHeaders({ body, secret }), rawBody: body },
    {
      config: { clientSecret: secret },
      cacheStore: stores.cacheStore,
      connectionStore: stores.connectionStore
    }
  );
  assert(result.processed, "valid webhook should be processed");
  const productWrite = stores.calls.find((call) => call.method === "upsertProducts");
  assert(productWrite?.brandId === "brand-a", "brand must come from the server-side connection");
  assert(productWrite?.brandId !== "brand-b", "payload must not control brand isolation");
  const metricWrite = stores.calls.find((call) => call.method === "updateConnection");
  assert(metricWrite?.updates.product_count === 1, "product webhook should refresh dashboard count");

  const duplicateStores = createStores({ claimed: false });
  const duplicate = await processWebhook(
    { headers: webhookHeaders({ body, secret, id: "duplicate" }), rawBody: body },
    {
      config: { clientSecret: secret },
      cacheStore: duplicateStores.cacheStore,
      connectionStore: duplicateStores.connectionStore
    }
  );
  assert(duplicate.duplicate, "already claimed webhooks should be no-ops");
  assert(
    !duplicateStores.calls.some((call) => call.method === "upsertProducts"),
    "duplicate webhooks must not update the cache"
  );

  const normalizedOrder = normalizeOrderPayload({
    id: 202,
    name: "#1002",
    email: "customer@example.com",
    phone: "+919999999999",
    customer: { first_name: "Private" },
    shipping_address: { address1: "Private address" },
    line_items: [{ title: "Backpack", quantity: 1, sku: "BAG-1" }]
  });
  const serializedOrder = JSON.stringify(normalizedOrder);
  assert(!serializedOrder.includes("customer@example.com"), "email must not enter the cache");
  assert(!serializedOrder.includes("Private address"), "address must not enter the cache");
  assert(normalizedOrder.lineItems.length === 1, "safe line item context should remain available");

  const merged = mergeFulfillment(
    [{ id: "gid://shopify/Fulfillment/1", status: "pending" }],
    { id: "gid://shopify/Fulfillment/1", status: "success" }
  );
  assert(merged.length === 1 && merged[0].status === "success", "fulfillment updates should replace old state");
  assert(DEFAULT_SCOPES.includes("read_fulfillments"), "operational fulfillment scope must be requested");

  const uninstallBody = Buffer.from(JSON.stringify({ id: 303 }));
  const uninstallStores = createStores();
  const uninstall = await processWebhook(
    {
      headers: webhookHeaders({
        body: uninstallBody,
        secret,
        topic: "app/uninstalled",
        id: "uninstall-1"
      }),
      rawBody: uninstallBody
    },
    {
      config: { clientSecret: secret },
      cacheStore: uninstallStores.cacheStore,
      connectionStore: uninstallStores.connectionStore
    }
  );
  assert(uninstall.processed, "app uninstall webhook should be processed");
  assert(
    uninstallStores.calls.some((call) => call.method === "clearBrandCache"),
    "app uninstall should remove cached store data"
  );
  assert(
    uninstallStores.calls.some((call) => call.method === "deleteConnection"),
    "app uninstall should delete the encrypted token connection row"
  );

  const dataRequestBody = Buffer.from(JSON.stringify({ customer: { id: 404 } }));
  const dataRequestStores = createStores();
  dataRequestStores.connectionStore.getConnectionByShopDomain = async () => null;
  const dataRequest = await processWebhook(
    {
      headers: webhookHeaders({
        body: dataRequestBody,
        secret,
        topic: "customers/data_request",
        id: "customer-data-request-1"
      }),
      rawBody: dataRequestBody
    },
    {
      config: { clientSecret: secret },
      cacheStore: dataRequestStores.cacheStore,
      connectionStore: dataRequestStores.connectionStore
    }
  );
  assert(dataRequest.processed && dataRequest.compliance, "customer data requests should be acknowledged");
  assert(
    dataRequestStores.calls.length === 0,
    "customer compliance payloads must not be persisted or logged"
  );

  const shopRedactBody = Buffer.from(JSON.stringify({ shop_id: 505 }));
  const shopRedactStores = createStores();
  shopRedactStores.connectionStore.getConnectionByShopDomain = async () => null;
  const shopRedact = await processWebhook(
    {
      headers: webhookHeaders({
        body: shopRedactBody,
        secret,
        topic: "shop/redact",
        id: "shop-redact-1"
      }),
      rawBody: shopRedactBody
    },
    {
      config: { clientSecret: secret },
      cacheStore: shopRedactStores.cacheStore,
      connectionStore: shopRedactStores.connectionStore
    }
  );
  assert(shopRedact.processed && shopRedact.compliance, "shop redact should be processed after uninstall");
  assert(
    shopRedactStores.calls.some((call) => call.method === "clearShopCache"),
    "shop redact should purge cached Shopify data by signed shop domain"
  );
  assert(
    shopRedactStores.calls.some((call) => call.method === "deleteConnectionByShopDomain"),
    "shop redact should purge any remaining encrypted connection by signed shop domain"
  );

  console.log("PASS Shopify webhook raw-body HMAC verification");
  console.log("PASS Shopify webhook idempotency contract");
  console.log("PASS Shopify webhook server-side brand isolation");
  console.log("PASS Shopify order cache PII allowlist");
  console.log("PASS Shopify fulfillment merge behavior");
  console.log("PASS Shopify app uninstall credential cleanup");
  console.log("PASS Shopify mandatory compliance webhook handling");
}

run().catch((error) => {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
});
