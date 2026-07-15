const shopifyProvider = require("../integrations/shopify/shopifyDemo.provider");
const shopifySyncService = require("../integrations/shopify/shopifySync.service");
const { getOrderById } = require("../services/order.service");
const { getRecommendedProducts } = require("../services/product.service");

const demoBrands = new Map(
  ["vastra-demo", "urban-demo", "beauty-demo"].map((brandId) => [
    brandId,
    require(`../data/brands/${brandId}.json`)
  ])
);
const state = new Map();
const brandServicePath = require.resolve("../services/brand.service");
const stateServicePath = require.resolve("../services/conversationState.service");
const analyticsServicePath = require.resolve("../services/analytics.service");

require(brandServicePath);
require(stateServicePath);
require(analyticsServicePath);
require.cache[brandServicePath].exports = {
  getBrandById: async (brandId) => demoBrands.get(brandId) || null
};
require.cache[stateServicePath].exports = {
  getState: async (brandId, customerId, channel = "widget") =>
    state.get(`${brandId}:${customerId}:${channel}`) || { state: "idle", context: {}, updatedAt: null },
  setState: async (brandId, customerId, channel = "widget", nextState, context = {}) => {
    const value = { state: nextState, context, updatedAt: new Date().toISOString() };
    state.set(`${brandId}:${customerId}:${channel}`, value);
    return value;
  }
};
require.cache[analyticsServicePath].exports = { appendChatLog: async () => {} };

const { processMessage } = require("../brain/supportBrain");

const tests = [
  {
    name: "brand-specific products",
    run() {
      const urbanProducts = shopifyProvider.getProducts("urban-demo");
      const beautyProducts = shopifyProvider.getProducts("beauty-demo");
      return (
        urbanProducts.some((product) => product.title === "SwiftBuds Pro") &&
        beautyProducts.some((product) => product.title === "Glow-C Vitamin Serum") &&
        !beautyProducts.some((product) => product.title === "SwiftBuds Pro")
      );
    }
  },
  {
    name: "brand-specific orders",
    run() {
      const order = shopifyProvider.getOrderById("urban-demo", "UG-SH-7001");
      return order?.brandId === "urban-demo" && order.status === "Out for Delivery";
    }
  },
  {
    name: "cross-brand order leakage blocked",
    run() {
      return shopifyProvider.getOrderById("beauty-demo", "UG-SH-7001") === null;
    }
  },
  {
    name: "order service checks Shopify demo first",
    async run() {
      const order = await getOrderById("UG-SH-7001", "urban-demo");
      return order?.source === "shopify-demo" && order.status === "Out for Delivery";
    }
  },
  {
    name: "fallback to orders.json works",
    async run() {
      const order = await getOrderById("TVQ1001", "vastra-demo");
      return order?.orderId === "TVQ1001" && order.status === "Delivered";
    }
  },
  {
    name: "product recommendation service works",
    run() {
      const products = getRecommendedProducts({
        brandId: "urban-demo",
        message: "Suggest earbuds for calls"
      });
      return products[0]?.title === "SwiftBuds Pro";
    }
  },
  {
    name: "sync service reports demo connector status",
    run() {
      const status = shopifySyncService.getStatus("vastra-demo");
      return status.status === "connected" && status.productCount > 0 && status.orderCount > 0;
    }
  },
  {
    name: "product recommendation chat works",
    async run() {
      const response = await processMessage({
        brandId: "urban-demo",
        message: "Suggest earbuds for calls",
        customerId: "shopify_demo_test"
      });

      return (
        response.intent === "product_recommendation" &&
        response.source === "system" &&
        /SwiftBuds Pro/i.test(response.reply)
      );
    }
  },
  {
    name: "chat tracks Shopify demo order",
    async run() {
      const response = await processMessage({
        brandId: "urban-demo",
        message: "Track order UG-SH-7001",
        customerId: "guest_123"
      });

      return (
        response.intent === "order_tracking" &&
        /Out for Delivery/i.test(response.reply) &&
        /UG-SH-7001/i.test(response.reply)
      );
    }
  },
  {
    name: "chat blocks cross-brand Shopify order leakage",
    async run() {
      const response = await processMessage({
        brandId: "beauty-demo",
        message: "Track order UG-SH-7001",
        customerId: "guest_123"
      });

      return response.intent === "order_tracking" && !/Out for Delivery/i.test(response.reply);
    }
  }
];

async function run() {
  let failed = false;

  for (const test of tests) {
    try {
      const passed = await test.run();
      if (!passed) {
        failed = true;
        console.error(`FAIL ${test.name}`);
      } else {
        console.log(`PASS ${test.name}`);
      }
    } catch (error) {
      failed = true;
      console.error(`FAIL ${test.name}`, error);
    }
  }

  if (failed) process.exit(1);
}

run();
