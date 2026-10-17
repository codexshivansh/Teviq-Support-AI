const assert = require("node:assert/strict");
const store = require("../integrations/instagram/instagramConnection.store");
const credentials = require("../services/shopifyCredentials.service");

credentials.decryptValue = () => "test-token";
let active = true;
store.getConnectionByBrandId = async (brandId) => ({
  status: active ? "active" : "disconnected",
  instagram_user_id: `account-${brandId}`,
  access_token_encrypted: "encrypted"
});
const { enrichInstagramConversations } = require("../services/instagramCustomerProfiles.service");

let calls = 0;
global.fetch = async (url, options) => {
  calls++;
  assert.equal(url.origin, "https://graph.instagram.com");
  assert.equal(url.searchParams.get("fields"), "username,name");
  assert.equal(url.searchParams.has("access_token"), false);
  assert.equal(options.headers.Authorization, "Bearer test-token");
  assert(options.signal instanceof AbortSignal);
  return { ok: true, json: async () => ({ username: `sender_${calls}`, name: "Test Sender" }) };
};

async function run() {
  const conversations = [
    { customerId: "sender-1", customer: "sender-1", channel: "instagram" },
    { customerId: "sender-1", customer: "sender-1", channel: "instagram" },
    { customerId: "sender-1", customer: "Original website name", channel: "widget" }
  ];
  const result = await enrichInstagramConversations({ brandId: "brand-a", conversations });
  assert.equal(calls, 1, "sessions for one sender should share one lookup");
  assert.equal(result[0].customer, "@sender_1");
  assert.equal(result[0].customerUsername, "sender_1");
  assert.equal(result[0].customerId, "sender-1", "manual replies must retain the real scoped sender ID");
  assert.strictEqual(result[2], conversations[2], "other channels must remain unchanged");
  assert.equal(JSON.stringify(result).includes("test-token"), false);
  await enrichInstagramConversations({ brandId: "brand-a", conversations });
  assert.equal(calls, 1, "repeat inbox loads should use cached profile metadata");
  const otherBrand = await enrichInstagramConversations({ brandId: "brand-b", conversations });
  assert.equal(calls, 2, "cache entries must not cross brand/account boundaries");
  assert.equal(otherBrand[0].customer, "@sender_2");

  global.fetch = async () => { throw new Error("Provider unavailable"); };
  const failed = await enrichInstagramConversations({ brandId: "brand-c", conversations });
  assert.strictEqual(failed[0], conversations[0], "profile failure must preserve conversation access");
  active = false;
  const disconnected = await enrichInstagramConversations({ brandId: "brand-a", conversations });
  assert.strictEqual(disconnected, conversations, "disconnected accounts must not expose cached metadata");
  console.log("Instagram customer profile enrichment, cache isolation, ID preservation, and failure fallback passed.");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
