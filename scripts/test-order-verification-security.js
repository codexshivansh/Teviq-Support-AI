const assert = require("assert");

const { extractOrderId } = require("../services/orderReference.service");
const { extractPhone, redactContactInfo } = require("../services/privacy.service");

function replaceModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require(resolved);
  require.cache[resolved].exports = exports;
  return resolved;
}

async function testExtractionAndRedaction() {
  assert.equal(extractOrderId("9876543210"), null, "A phone number must not be treated as an order ID");
  assert.equal(extractOrderId("order #1234567890"), "#1234567890");
  assert.equal(extractPhone("Call me on +91 98765 43210"), "+91 98765 43210");

  const redacted = redactContactInfo("Use owner@example.com or +91 98765 43210");
  assert.equal(redacted, "Use [email redacted] or [phone redacted]");
}

async function testVerificationService() {
  const connectionPath = require.resolve("../integrations/shopify/shopifyConnection.store");
  const adminProviderPath = require.resolve("../integrations/shopify/shopifyAdmin.provider");
  const verificationPath = require.resolve("../integrations/shopify/shopifyOrderVerification.service");
  const actualConnectionStore = require(connectionPath);
  const actualAdminProvider = require(adminProviderPath);

  require.cache[connectionPath].exports = {
    ...actualConnectionStore,
    getConnectionByBrandId: async () => null
  };
  delete require.cache[verificationPath];
  let verificationService = require(verificationPath);

  assert.deepEqual(await verificationService.getOrderVerificationRequirement("live-brand"), {
    required: true,
    available: false
  });
  assert.deepEqual(await verificationService.getOrderVerificationRequirement("urban-demo"), {
    required: false,
    available: true
  });

  require.cache[connectionPath].exports = {
    ...actualConnectionStore,
    getConnectionByBrandId: async () => ({ status: "active" })
  };
  require.cache[adminProviderPath].exports = {
    ...actualAdminProvider,
    getAccessContext: async () => ({ shopDomain: "store.myshopify.com", accessToken: "test-token" }),
    executeGraphql: async ({ variables }) => {
      assert.equal(variables.query, 'name:"1001"');
      return {
        orders: {
          nodes: [
            {
              id: "gid://shopify/Order/1",
              name: "#1001",
              email: "owner@example.com",
              phone: "+91 98765 43210"
            }
          ]
        }
      };
    }
  };
  delete require.cache[verificationPath];
  verificationService = require(verificationPath);

  const byEmail = await verificationService.verifyOrderContact({
    brandId: "live-brand",
    orderId: "#1001",
    email: "OWNER@example.com"
  });
  const byPhone = await verificationService.verifyOrderContact({
    brandId: "live-brand",
    orderId: "#1001",
    phone: "9876543210"
  });
  const wrongContact = await verificationService.verifyOrderContact({
    brandId: "live-brand",
    orderId: "#1001",
    email: "attacker@example.com"
  });

  assert.equal(byEmail.verified, true);
  assert.equal(byPhone.verified, true);
  assert.equal(wrongContact.verified, false);
  assert.equal(wrongContact.status, "not_verified");
}

async function createSupportBrainHarness() {
  const states = new Map();
  const memory = new Map();
  const logs = [];
  let verificationCalls = 0;
  let orderLookups = 0;

  function key(brandId, customerId, channel = "widget") {
    return `${brandId}:${customerId}:${channel}`;
  }

  const verificationModule = require("../integrations/shopify/shopifyOrderVerification.service");

  replaceModule("../services/brand.service", {
    getBrandById: async (brandId) => ({
      brandId,
      brandName: "Live Brand",
      tone: "friendly and professional",
      policies: {},
      faqs: [],
      managerContact: { email: "support@example.com" },
      escalationRules: { keywords: [] },
      widgetConfig: {}
    })
  });
  replaceModule("../services/ai.service", {
    generateSupportReply: async () => {
      throw new Error("AI must not run during order verification");
    }
  });
  replaceModule("../services/memory.service", {
    getConversationMemory: (brandId, customerId) => memory.get(key(brandId, customerId)) || [],
    addConversationMessage: (brandId, customerId, role, content) => {
      const memoryKey = key(brandId, customerId);
      const messages = memory.get(memoryKey) || [];
      messages.push({ role, content });
      memory.set(memoryKey, messages.slice(-10));
    }
  });
  replaceModule("../services/conversationState.service", {
    getState: async (brandId, customerId, channel) =>
      states.get(key(brandId, customerId, channel)) || { state: "idle", context: {}, updatedAt: null },
    setState: async (brandId, customerId, channel, state, context) => {
      const value = { state, context, updatedAt: new Date().toISOString() };
      states.set(key(brandId, customerId, channel), value);
      return value;
    }
  });
  replaceModule("../services/analytics.service", {
    appendChatLog: async (entry) => logs.push(entry)
  });
  replaceModule("../knowledge/retrieval.service", {
    retrieveKnowledge: async () => {
      throw new Error("Knowledge retrieval must not run during order verification");
    }
  });
  replaceModule("../integrations/shopify/shopifyOrderVerification.service", {
    ...verificationModule,
    getOrderVerificationRequirement: async () => ({ required: true, available: true }),
    verifyOrderContact: async ({ orderId, email, phone }) => {
      verificationCalls += 1;
      const contactMatches = email === "owner@example.com" || String(phone || "").replace(/\D/g, "") === "9876543210";
      if (orderId === "#1001" && contactMatches) {
        return {
          verified: true,
          status: "verified",
          orderId: "#1001",
          shopifyOrderId: "gid://shopify/Order/1"
        };
      }
      return { verified: false, status: "not_verified" };
    }
  });
  replaceModule("../services/order.service", {
    getOrderById: async (orderId, brandId) => {
      orderLookups += 1;
      if (brandId !== "live-brand" || orderId !== "#1001") return null;
      return {
        brandId,
        orderId,
        shopifyOrderId: "gid://shopify/Order/1",
        status: "Processing",
        trackingText: "Payment status is Paid. No carrier tracking details are available yet.",
        source: "shopify-live"
      };
    }
  });

  delete require.cache[require.resolve("../brain/toolRouter")];
  delete require.cache[require.resolve("../brain/supportBrain")];
  const { processMessage } = require("../brain/supportBrain");

  return {
    get orderLookups() {
      return orderLookups;
    },
    get verificationCalls() {
      return verificationCalls;
    },
    logs,
    memory,
    processMessage,
    states,
    key
  };
}

async function testSupportBrainSecurityFlow() {
  process.env.SHOPIFY_CREDENTIALS_SECRET = "test-order-verification-binding-secret";
  const harness = await createSupportBrainHarness();
  const base = { brandId: "live-brand", channel: "widget", requestIp: "203.0.113.10" };

  const initial = await harness.processMessage({
    ...base,
    customerId: "initial-session",
    message: "Track order #1001"
  });
  assert.equal(initial.reply, "To protect your order details, please share the email address or phone number used at checkout.");
  assert.equal(harness.orderLookups, 0, "No cached order may be read before identity verification");
  assert.doesNotMatch(initial.reply, /processing|paid|fulfilled/i);

  const wrongContact = await harness.processMessage({
    ...base,
    customerId: "initial-session",
    message: "attacker@example.com"
  });
  assert.equal(wrongContact.reply, verificationModuleReply("failed"));
  assert.equal(harness.orderLookups, 0);

  await harness.processMessage({
    ...base,
    customerId: "missing-order-session",
    message: "Track order #9999"
  });
  const missingOrder = await harness.processMessage({
    ...base,
    customerId: "missing-order-session",
    message: "attacker@example.com"
  });
  assert.equal(
    missingOrder.reply,
    wrongContact.reply,
    "A missing order and a contact mismatch must produce the exact same response"
  );

  await harness.processMessage({
    ...base,
    customerId: "verified-session",
    message: "Track order #1001"
  });
  const verified = await harness.processMessage({
    ...base,
    customerId: "verified-session",
    message: "owner@example.com"
  });
  assert.match(verified.reply, /Order #1001 is currently Processing/i);
  assert.match(verified.reply, /Payment status is Paid/i);
  assert.equal(harness.orderLookups, 1);

  const callsBeforeReuse = harness.verificationCalls;
  const reused = await harness.processMessage({
    ...base,
    customerId: "verified-session",
    message: "Where is my order?"
  });
  assert.match(reused.reply, /Order #1001 is currently Processing/i);
  assert.equal(harness.verificationCalls, callsBeforeReuse, "A bound verified session should be reusable for 10 minutes");

  await harness.processMessage({
    ...base,
    customerId: "expired-session",
    message: "Track order #1001"
  });
  await harness.processMessage({
    ...base,
    customerId: "expired-session",
    message: "owner@example.com"
  });
  const expiredState = harness.states.get(harness.key("live-brand", "expired-session"));
  expiredState.context.expiresAt = new Date(Date.now() - 1000).toISOString();
  const afterExpiry = await harness.processMessage({
    ...base,
    customerId: "expired-session",
    message: "Track order #1001"
  });
  assert.equal(afterExpiry.reply, "To protect your order details, please share the email address or phone number used at checkout.");

  const wrongIp = await harness.processMessage({
    ...base,
    requestIp: "203.0.113.99",
    customerId: "verified-session",
    message: "Track order #1001"
  });
  assert.equal(wrongIp.reply, "To protect your order details, please share the email address or phone number used at checkout.");

  await harness.processMessage({
    ...base,
    customerId: "locked-session",
    message: "Track order #1001"
  });
  let lockedResponse = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    lockedResponse = await harness.processMessage({
      ...base,
      customerId: "locked-session",
      message: `wrong${attempt}@example.com`
    });
  }
  assert.equal(lockedResponse.reply, "Too many verification attempts. Please wait 15 minutes before trying again, or talk to support.");
  assert.equal(harness.states.get(harness.key("live-brand", "locked-session")).state, "order_verification_locked");

  const callsAtLock = harness.verificationCalls;
  const duringCooldown = await harness.processMessage({
    ...base,
    customerId: "locked-session",
    message: "owner@example.com"
  });
  assert.equal(duringCooldown.reply, lockedResponse.reply);
  assert.equal(harness.verificationCalls, callsAtLock, "Cooldown requests must not call Shopify");

  const persistedData = JSON.stringify({
    logs: harness.logs,
    memory: [...harness.memory.values()],
    states: [...harness.states.values()]
  });
  assert.doesNotMatch(persistedData, /owner@example\.com|attacker@example\.com|wrong\d@example\.com|9876543210/i);
  assert.match(persistedData, /\[email redacted\]/);
}

function verificationModuleReply(type) {
  const service = require("../integrations/shopify/shopifyOrderVerification.service");
  return type === "failed" ? service.ORDER_VERIFICATION_FAILED_REPLY : service.ORDER_VERIFICATION_REQUIRED_REPLY;
}

async function run() {
  const tests = [
    ["contact extraction and PII redaction", testExtractionAndRedaction],
    ["Shopify verification query and fail-closed requirement", testVerificationService],
    ["Support Brain order verification security flow", testSupportBrainSecurityFlow]
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
