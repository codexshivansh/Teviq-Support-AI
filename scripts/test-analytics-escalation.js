const assert = require("assert");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

const { getEscalationRate, getEscalationTrend } = require("../services/chatAnalytics.service");

const now = Date.now();
const rows = [
  {
    customer_id: "customer-a",
    created_at: new Date(now - 65 * 60 * 1000).toISOString(),
    escalated: false
  },
  {
    customer_id: "customer-a",
    created_at: new Date(now - 10 * 60 * 1000).toISOString(),
    escalated: false
  },
  {
    customer_id: "customer-a",
    created_at: new Date(now - 5 * 60 * 1000).toISOString(),
    escalated: true
  },
  {
    customer_id: "customer-b",
    created_at: new Date(now - 8 * 60 * 1000).toISOString(),
    escalated: false
  }
];

const originalFetch = global.fetch;
global.fetch = async () => ({
  ok: true,
  text: async () => JSON.stringify(rows)
});

async function run() {
  try {
    const rate = await getEscalationRate("test-brand", 30);
    assert.equal(rate.escalatedCount, 1);
    assert.equal(rate.totalConversations, 3);
    assert.equal(rate.totalMessages, 4);
    assert.equal(rate.rate, 1 / 3);

    const trend = await getEscalationTrend("test-brand", 30);
    const totals = trend.reduce(
      (sum, day) => ({
        escalated: sum.escalated + day.escalatedCount,
        handled: sum.handled + day.nonEscalatedCount
      }),
      { escalated: 0, handled: 0 }
    );

    assert.deepEqual(totals, { escalated: 1, handled: 2 });
    console.log("PASS escalation rate counts escalated conversations once");
    console.log("PASS escalation trend uses conversation-level sessions");
  } finally {
    global.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
