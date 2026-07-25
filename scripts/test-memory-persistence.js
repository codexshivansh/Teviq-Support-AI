const assert = require("assert");

process.env.SUPABASE_URL = "https://test-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

const {
  addConversationMessage,
  getConversationMemory,
  resetMemoryForTests
} = require("../services/memory.service");

async function run() {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      async json() {
        return [
          {
            message: "Second question",
            reply: "Second answer",
            created_at: "2026-07-24T10:02:00.000Z"
          },
          {
            message: "First question",
            reply: "First answer",
            created_at: "2026-07-24T10:01:00.000Z"
          }
        ];
      }
    };
  };

  try {
    resetMemoryForTests();
    addConversationMessage("urban-demo", "guest 123", "user", "Current follow-up");

    const hydrated = await getConversationMemory("urban-demo", "guest 123");
    assert.deepStrictEqual(
      hydrated.map(({ role, content }) => ({ role, content })),
      [
        { role: "user", content: "First question" },
        { role: "assistant", content: "First answer" },
        { role: "user", content: "Second question" },
        { role: "assistant", content: "Second answer" },
        { role: "user", content: "Current follow-up" }
      ]
    );
    assert.strictEqual(calls.length, 1);
    assert.match(calls[0].url, /brand_id=eq\.urban-demo/);
    assert.match(calls[0].url, /customer_id=eq\.guest%20123/);
    assert.match(calls[0].url, /limit=5/);
    assert.strictEqual(calls[0].options.headers.Authorization, "Bearer test-service-role-key");

    addConversationMessage("urban-demo", "guest 123", "assistant", "Current answer");
    await getConversationMemory("urban-demo", "guest 123");
    assert.strictEqual(calls.length, 1, "Warm sessions should not refetch persistent history.");

    resetMemoryForTests();
    global.fetch = async () => {
      throw new Error("network unavailable");
    };
    addConversationMessage("urban-demo", "guest_456", "user", "Fallback question");
    const fallback = await getConversationMemory("urban-demo", "guest_456");
    assert.deepStrictEqual(
      fallback.map(({ role, content }) => ({ role, content })),
      [{ role: "user", content: "Fallback question" }]
    );

    console.log("PASS cold sessions hydrate the last five persisted chat turns");
    console.log("PASS persistent memory queries are brand/customer scoped");
    console.log("PASS warm sessions keep the fast in-process path");
    console.log("PASS Supabase failure falls back without breaking chat");
  } finally {
    global.fetch = originalFetch;
    resetMemoryForTests();
  }
}

run().catch((error) => {
  console.error(`FAIL ${error.stack || error.message}`);
  process.exitCode = 1;
});
