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
    async run() {
      const products = await getRecommendedProducts({
        brandId: "urban-demo",
        message: "Suggest earbuds for calls"
      });
      return products[0]?.title === "SwiftBuds Pro";
    }
  },
  {
    name: "live Shopify product recommendations use a brand-scoped cache query",
    async run() {
      const originalFetch = global.fetch;
      const originalSupabaseUrl = process.env.SUPABASE_URL;
      const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const requestedUrls = [];

      process.env.SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

      global.fetch = async (url) => {
        requestedUrls.push(String(url));
        const isLiveBrand = String(url).includes("brand_id=eq.live-brand");
        const products = isLiveBrand
          ? [
              {
                shopify_product_id: "gid://shopify/Product/1",
                title: "Trail Runner Pro",
                handle: "trail-runner-pro",
                category: "Shoes",
                tags: ["running", "trail"],
                status: "ACTIVE",
                price: "4499.00",
                currency: "INR",
                available: true
              }
            ]
          : [
              {
                shopify_product_id: "gid://shopify/Product/2",
                title: "Other Brand Serum",
                handle: "other-brand-serum",
                category: "Beauty",
                tags: ["serum"],
                status: "ACTIVE",
                price: "899.00",
                currency: "INR",
                available: true
              }
            ];

        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(products)
        };
      };

      try {
        const products = await getRecommendedProducts({
          brandId: "live-brand",
          message: "Recommend trail shoes under INR 5000"
        });
        return (
          requestedUrls.length === 1 &&
          requestedUrls[0].includes("brand_id=eq.live-brand") &&
          products[0]?.title === "Trail Runner Pro" &&
          !products.some((product) => product.title === "Other Brand Serum")
        );
      } finally {
        global.fetch = originalFetch;
        if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
        else process.env.SUPABASE_URL = originalSupabaseUrl;
        if (originalServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
      }
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
    name: "product recommendation follow-up keeps prior catalog context",
    async run() {
      const customerId = "shopify_product_followup_test";
      const firstResponse = await processMessage({
        brandId: "urban-demo",
        message: "Suggest something under 3000 INR",
        customerId
      });
      const followUpResponse = await processMessage({
        brandId: "urban-demo",
        message: "I need it for calls",
        customerId
      });
      const unsupportedFitResponse = await processMessage({
        brandId: "urban-demo",
        message: "I am a beginner and need something easy to control",
        customerId
      });

      return (
        firstResponse.intent === "product_recommendation" &&
        followUpResponse.intent === "product_recommendation" &&
        followUpResponse.source === "system" &&
        /SwiftBuds Pro/i.test(followUpResponse.reply) &&
        unsupportedFitResponse.intent === "product_recommendation" &&
        /kept your .*requirement in context/i.test(unsupportedFitResponse.reply) &&
        /cannot safely label/i.test(unsupportedFitResponse.reply)
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
