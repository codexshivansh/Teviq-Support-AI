const assert = require("assert");
const { extractOrderId } = require("../services/orderReference.service");

async function testOrderExtraction() {
  assert.equal(extractOrderId("Where is Shopify order #1001?"), "#1001");
  assert.equal(extractOrderId("my order id is 1001"), "#1001");
  assert.equal(extractOrderId("1001"), "#1001");
  assert.equal(extractOrderId("Track order TVQ1001"), "TVQ1001");
  assert.equal(extractOrderId("My budget is 1001"), null);
  assert.equal(extractOrderId("9876543210"), null);
}

async function testBrandScopedCacheQuery() {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const requestedUrls = [];

  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  global.fetch = async (url) => {
    requestedUrls.push(String(url));
    const isExpectedBrand = String(url).includes("brand_id=eq.teviq");
    const isExpectedOrder = String(url).includes("order_name=ilike.%231001");
    const data = isExpectedBrand && isExpectedOrder
      ? [{ shopify_order_id: "gid://shopify/Order/1", order_name: "#1001" }]
      : [];
    return { ok: true, text: async () => JSON.stringify(data) };
  };

  try {
    const cacheStore = require("../integrations/shopify/shopifyCache.store");
    const matchingOrder = await cacheStore.getOrderByReference("teviq", "#1001");
    const otherBrandOrder = await cacheStore.getOrderByReference("other-brand", "#1001");

    assert.equal(matchingOrder?.order_name, "#1001");
    assert.equal(otherBrandOrder, null);
    assert(requestedUrls.every((url) => url.includes("brand_id=eq.")));
    assert(requestedUrls.some((url) => url.includes("brand_id=eq.teviq")));
    assert(requestedUrls.some((url) => url.includes("brand_id=eq.other-brand")));
  } finally {
    global.fetch = originalFetch;
    if (originalUrl == null) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
}

async function testOrderServiceAndRouter() {
  const cachePath = require.resolve("../integrations/shopify/shopifyCache.store");
  const orderServicePath = require.resolve("../services/order.service");
  const toolRouterPath = require.resolve("../brain/toolRouter");
  const verificationPath = require.resolve("../integrations/shopify/shopifyOrderVerification.service");
  const actualCacheStore = require(cachePath);
  const actualVerificationService = require(verificationPath);

  require.cache[cachePath].exports = {
    ...actualCacheStore,
    getOrderByReference: async (brandId, orderId) => {
      if (brandId !== "teviq" || orderId !== "#1001") return null;
      return {
        shopify_order_id: "gid://shopify/Order/1",
        order_name: "#1001",
        fulfillment_status: "UNFULFILLED",
        financial_status: "PAID",
        cancelled_at: null,
        line_items: [{ title: "The Minimal Snowboard" }],
        fulfillments: [],
        shopify_updated_at: "2026-07-15T00:00:00.000Z"
      };
    }
  };
  require.cache[verificationPath].exports = {
    ...actualVerificationService,
    getOrderVerificationRequirement: async () => ({ required: true, available: true }),
    verifyOrderContact: async ({ orderId, email }) => ({
      verified: orderId === "#1001" && email === "owner@example.com",
      status: orderId === "#1001" && email === "owner@example.com" ? "verified" : "not_verified",
      orderId
    })
  };
  delete require.cache[orderServicePath];
  delete require.cache[toolRouterPath];

  const { getOrderById } = require(orderServicePath);
  const { routeTools } = require(toolRouterPath);

  const liveOrder = await getOrderById("#1001", "teviq");
  const crossBrandOrder = await getOrderById("#1001", "beauty-demo");
  const demoOrder = await getOrderById("UG-SH-7001", "urban-demo");
  const localOrder = await getOrderById("TVQ1001", "vastra-demo");
  const protectedResult = await routeTools({
    brand: { brandId: "teviq", brandName: "Teviq" },
    intent: "order_tracking",
    entities: { orderId: "#1001" },
    message: "Where is order #1001?"
  });
  const toolResult = await routeTools({
    brand: { brandId: "teviq", brandName: "Teviq" },
    intent: "order_tracking",
    entities: { orderId: "#1001", email: "owner@example.com" },
    message: "owner@example.com"
  });

  assert.equal(liveOrder?.source, "shopify-live");
  assert.equal(liveOrder?.status, "Processing");
  assert.equal(liveOrder?.shopifyOrderId, "gid://shopify/Order/1");
  assert.equal(crossBrandOrder, null);
  assert.equal(demoOrder?.source, "shopify-demo");
  assert.equal(localOrder?.status, "Delivered");
  assert.match(protectedResult.reply, /protect your order details/i);
  assert.equal(protectedResult.order, null);
  assert.match(toolResult.reply, /Order #1001 is currently Processing/i);
  assert.doesNotMatch(toolResult.reply, /Expected update/i);
}

async function run() {
  const tests = [
    ["numeric and prefixed order extraction", testOrderExtraction],
    ["cache lookup is SQL brand-scoped", testBrandScopedCacheQuery],
    ["live lookup, fallbacks, and router", testOrderServiceAndRouter]
  ];

  let failed = false;
  for (const [name, test] of tests) {
    try {
      await test();
      console.log(`PASS ${name}`);
    } catch (error) {
      failed = true;
      console.error(`FAIL ${name}: ${error.stack || error.message}`);
    }
  }

  if (failed) process.exit(1);
}

run();
