const assert = require("node:assert/strict");

process.env.SUPABASE_URL = "https://supabase.example.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

let sentMessages = [];
let loggedRows = [];
let lastInboundAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

const brandLookupPath = require.resolve("../controllers/helpers/brandLookup");
require.cache[brandLookupPath] = {
  id: brandLookupPath,
  filename: brandLookupPath,
  loaded: true,
  exports: { getBrandOrRespond: async () => ({ brandId: "teviq", isActive: true }) }
};
const connectionStorePath = require.resolve("../integrations/instagram/instagramConnection.store");
require.cache[connectionStorePath] = {
  id: connectionStorePath,
  filename: connectionStorePath,
  loaded: true,
  exports: {
    getConnectionByBrandId: async () => ({
      instagram_user_id: "ig-business-id",
      access_token_encrypted: "ciphertext",
      status: "active"
    })
  }
};
const credentialsPath = require.resolve("../services/shopifyCredentials.service");
require.cache[credentialsPath] = {
  id: credentialsPath,
  filename: credentialsPath,
  loaded: true,
  exports: { decryptValue: (value) => value === "ciphertext" ? "decrypted-token" : "" }
};
const instagramServicePath = require.resolve("../services/instagram.service");
require.cache[instagramServicePath] = {
  id: instagramServicePath,
  filename: instagramServicePath,
  loaded: true,
  exports: {
    sendInstagramMessage: async (message) => {
      sentMessages.push(message);
      return { message_id: "outbound-1" };
    }
  }
};
const analyticsPath = require.resolve("../services/analytics.service");
require.cache[analyticsPath] = {
  id: analyticsPath,
  filename: analyticsPath,
  loaded: true,
  exports: { appendChatLog: async (row) => loggedRows.push(row) }
};

global.fetch = async () => new Response(JSON.stringify([{ message: "Hi, is this available?", created_at: lastInboundAt }]), { status: 200 });
const { sendManualReply } = require("../controllers/instagram.controller");

async function invoke(sessionType = "clerk") {
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; }
  };
  await sendManualReply({
    auth: { sessionType, userId: "user-1" },
    params: { brandId: "teviq" },
    body: { customerId: "ig-customer-id", text: "Yes, it is available." }
  }, res);
  return result;
}

async function run() {
  const sent = await invoke();
  assert.equal(sent.statusCode, 200);
  assert.deepEqual(sent.body, { ok: true, messageId: "outbound-1" });
  assert.equal(sentMessages[0].instagramAccountId, "ig-business-id");
  assert.equal(sentMessages[0].to, "ig-customer-id");
  assert.equal(sentMessages[0].accessToken, "decrypted-token");
  assert.equal(loggedRows[0].channel, "instagram");
  assert.equal(loggedRows[0].source, "human_agent");

  const sendsBeforeWindowCheck = sentMessages.length;
  lastInboundAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const closed = await invoke();
  assert.equal(closed.statusCode, 422);
  assert.equal(closed.body.error, "window_expired");
  assert.equal(sentMessages.length, sendsBeforeWindowCheck);

  const closedSession = await invoke("demo");
  assert.equal(closedSession.statusCode, 401);
  console.log("Instagram manual reply tests passed: authenticated send, transcript logging, closed-window block, and demo-session block.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
