const assert = require("node:assert/strict");

const now = new Date("2026-10-16T00:00:00.000Z");
const days = (count) => count * 24 * 60 * 60 * 1000;
const updates = new Map();
const connectionStorePath = require.resolve("../integrations/instagram/instagramConnection.store");
require.cache[connectionStorePath] = {
  id: connectionStorePath,
  filename: connectionStorePath,
  loaded: true,
  exports: {
    listConnectionsExpiringBefore: async () => [
      {
        brand_id: "refresh-me",
        access_token_encrypted: "cipher-old",
        token_issued_at: new Date(now.getTime() - days(2)).toISOString(),
        token_expires_at: new Date(now.getTime() + days(2)).toISOString()
      },
      {
        brand_id: "expired",
        access_token_encrypted: "cipher-expired",
        token_issued_at: new Date(now.getTime() - days(70)).toISOString(),
        token_expires_at: new Date(now.getTime() - days(1)).toISOString()
      },
      {
        brand_id: "too-new",
        access_token_encrypted: "cipher-new",
        token_issued_at: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(),
        token_expires_at: new Date(now.getTime() + days(59)).toISOString()
      }
    ],
    updateConnection: async (brandId, changes) => {
      updates.set(brandId, changes);
      return { brand_id: brandId, ...changes };
    }
  }
};
const credentialsPath = require.resolve("../services/shopifyCredentials.service");
require.cache[credentialsPath] = {
  id: credentialsPath,
  filename: credentialsPath,
  loaded: true,
  exports: {
    decryptValue: (ciphertext) => `plain:${ciphertext}`,
    encryptValue: (value) => ({ algorithm: "mock", value: `encrypted:${value}` })
  }
};

let requestCount = 0;
global.fetch = async (input) => {
  requestCount += 1;
  const url = new URL(String(input));
  assert.equal(url.origin, "https://graph.instagram.com");
  assert.equal(url.pathname, "/refresh_access_token");
  assert.equal(url.searchParams.get("grant_type"), "ig_refresh_token");
  assert.equal(url.searchParams.get("access_token"), "plain:cipher-old");
  return new Response(JSON.stringify({ access_token: "refreshed-token", expires_in: 5184000 }), { status: 200 });
};

async function run() {
  const { refreshExpiringTokens } = require("../integrations/instagram/instagramTokenRefresh.service");
  const result = await refreshExpiringTokens({ now, withinDays: 7 });
  assert.deepEqual(result, { checked: 3, refreshed: 1, skippedTooNew: 1, expired: 1, failed: 0 });
  assert.equal(requestCount, 1);
  assert.match(updates.get("refresh-me").access_token_encrypted, /refreshed-token/);
  assert.equal(updates.get("refresh-me").status, "active");
  assert.equal(updates.get("expired").status, "error");
  assert.equal(updates.has("too-new"), false);
  console.log("Instagram token refresh tests passed: refresh, 24-hour minimum age, and expired-token reconnect status.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
