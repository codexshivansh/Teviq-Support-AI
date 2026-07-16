const demoBrands = new Map(
  ["vastra-demo", "urban-demo", "beauty-demo"].map((brandId) => [
    brandId,
    require(`../data/brands/${brandId}.json`)
  ])
);
const state = new Map();

function replaceModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require(resolved);
  require.cache[resolved].exports = exports;
}

replaceModule("../services/brand.service", {
  getBrandById: async (brandId) => demoBrands.get(brandId) || null
});
replaceModule("../services/conversationState.service", {
  getState: async (brandId, customerId, channel = "widget") =>
    state.get(`${brandId}:${customerId}:${channel}`) || { state: "idle", context: {}, updatedAt: null },
  setState: async (brandId, customerId, channel = "widget", nextState, context = {}) => {
    const value = { state: nextState, context, updatedAt: new Date().toISOString() };
    state.set(`${brandId}:${customerId}:${channel}`, value);
    return value;
  }
});
replaceModule("../services/analytics.service", { appendChatLog: async () => {} });
replaceModule("../knowledge/retrieval.service", {
  retrieveKnowledge: async ({ brandId, query }) => ({
    brandId,
    query,
    confidence: 0,
    confidenceLabel: "low",
    lowConfidence: true,
    matches: [],
    citations: [],
    contextText: ""
  })
});
replaceModule("../services/ai.service", {
  generateSupportReply: async ({ brand, intent }) => ({
    reply:
      intent === "payment_cod"
        ? brand.policies.cod
        : "I can help with confirmed brand information.",
    source: "system",
    confidence: "high",
    needsEscalation: false
  })
});

const { processMessage } = require("../brain/supportBrain");

const tests = [
  {
    name: "FAQ",
    input: { brandId: "vastra-demo", message: "Do you support COD?", customerId: "brain_faq" },
    expect: (res) => res.intent === "payment_cod" && res.reply
  },
  {
    name: "order tracking with valid order",
    input: { brandId: "vastra-demo", message: "Track order TVQ1001", customerId: "brain_order" },
    expect: (res) => res.intent === "order_tracking" && res.reply.includes("Delivered")
  },
  {
    name: "order tracking without order ID",
    input: { brandId: "vastra-demo", message: "Where is my order?", customerId: "brain_missing_order" },
    expect: (res) => res.intent === "order_tracking" && /order id/i.test(res.reply)
  },
  {
    name: "return allowed for Delivered",
    input: { brandId: "vastra-demo", message: "Can I return order TVQ1001?", customerId: "brain_return_yes" },
    expect: (res) => res.intent === "return_exchange" && /reason|wajah/i.test(res.reply)
  },
  {
    name: "return denied for Processing",
    input: { brandId: "vastra-demo", message: "Can I return order TVQ1003?", customerId: "brain_return_no" },
    expect: (res) => res.intent === "return_exchange" && /Processing/i.test(res.reply)
  },
  {
    name: "cancellation allowed for Processing",
    input: { brandId: "vastra-demo", message: "Cancel order TVQ1003", customerId: "brain_cancel_yes" },
    expect: (res) => res.intent === "cancellation" && /reason|wajah/i.test(res.reply)
  },
  {
    name: "cancellation denied for Delivered",
    input: { brandId: "vastra-demo", message: "Cancel order TVQ1001", customerId: "brain_cancel_no" },
    expect: (res) => res.intent === "cancellation" && /Delivered/i.test(res.reply)
  },
  {
    name: "hard escalation",
    input: { brandId: "vastra-demo", message: "This is fraud, I will call police", customerId: "brain_escalation" },
    expect: (res) => res.escalated === true && /WhatsApp|Email/i.test(res.reply)
  },
  {
    name: "lead capture",
    input: { brandId: "vastra-demo", message: "I want to talk to human", customerId: "brain_lead" },
    expect: (res) => res.intent === "human_support" && /phone number|email/i.test(res.reply)
  },
  {
    name: "invalid brand",
    input: { brandId: "missing-demo", message: "Hello", customerId: "brain_invalid" },
    expect: (res) => res.statusCode === 403 && res.warnings.includes("brand_unavailable")
  }
];

async function run() {
  let failed = false;

  for (const test of tests) {
    const result = await processMessage(test.input);
    if (!test.expect(result)) {
      failed = true;
      console.error(`FAIL ${test.name}`, result);
    } else {
      console.log(`PASS ${test.name}`);
    }
  }

  if (failed) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
