const { decryptValue, encryptValue } = require("../services/shopifyCredentials.service");

process.env.SHOPIFY_CLIENT_ID = "test-client-id";
process.env.SHOPIFY_CLIENT_SECRET = "test-client-secret";
process.env.SHOPIFY_CREDENTIALS_SECRET = "test-credential-encryption-secret";

const connectionStore = require("../integrations/shopify/shopifyConnection.store");
const provider = require("../integrations/shopify/shopifyAdmin.provider");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function encrypted(value) {
  return JSON.stringify(encryptValue(value));
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

async function testDirectMigration() {
  const legacyToken = "fake-legacy-token";
  const originalAccessEncrypted = encrypted(legacyToken);
  const connection = {
    brand_id: "brand-test",
    shop_domain: "teviq-test.myshopify.com",
    access_token_encrypted: originalAccessEncrypted,
    refresh_token_encrypted: null,
    access_token_expires_at: null,
    refresh_token_expires_at: null,
    status: "active"
  };
  let capturedRequest = null;
  let capturedWrite = null;
  const originalFetch = global.fetch;
  const originalConditionalUpdate = connectionStore.updateConnectionIfTokenVersionMatches;

  global.fetch = async (url, options) => {
    capturedRequest = { url, options };
    return response({
      access_token: "fake-expiring-access-token",
      refresh_token: "fake-rotating-refresh-token",
      expires_in: 3600,
      refresh_token_expires_in: 2592000,
      scope: "read_products,read_orders"
    });
  };
  connectionStore.updateConnectionIfTokenVersionMatches = async (brandId, expected, updates) => {
    capturedWrite = { brandId, expected, updates };
    return { ...connection, ...updates };
  };

  try {
    const migrated = await provider.migrateLegacyOfflineToken(connection);
    const body = new URLSearchParams(capturedRequest.options.body);
    assert(capturedRequest.url.endsWith("/admin/oauth/access_token"), "migration uses token endpoint");
    assert(
      body.get("grant_type") === "urn:ietf:params:oauth:grant-type:token-exchange",
      "migration uses Shopify token exchange grant"
    );
    assert(body.get("subject_token") === legacyToken, "migration submits the existing offline token");
    assert(
      body.get("subject_token_type") === "urn:shopify:params:oauth:token-type:offline-access-token",
      "migration declares the subject token type"
    );
    assert(
      body.get("requested_token_type") === "urn:shopify:params:oauth:token-type:offline-access-token",
      "migration requests an offline access token"
    );
    assert(body.get("expiring") === "1", "migration explicitly requests expiring tokens");
    assert(capturedWrite.brandId === connection.brand_id, "migration updates only the selected brand");
    assert(
      capturedWrite.expected.accessTokenEncrypted === originalAccessEncrypted &&
        capturedWrite.expected.refreshTokenEncrypted === null,
      "migration uses optimistic token-version matching"
    );
    assert(
      decryptValue(capturedWrite.updates.access_token_encrypted) === "fake-expiring-access-token",
      "new access token is encrypted before storage"
    );
    assert(
      decryptValue(capturedWrite.updates.refresh_token_encrypted) === "fake-rotating-refresh-token",
      "new refresh token is encrypted before storage"
    );
    assert(
      !JSON.stringify(capturedWrite.updates).includes("fake-expiring-access-token") &&
        !JSON.stringify(capturedWrite.updates).includes("fake-rotating-refresh-token"),
      "plaintext token values are not written to storage"
    );
    assert(provider.tokenMode(migrated) === "expiring_offline", "migrated state is complete");
  } finally {
    global.fetch = originalFetch;
    connectionStore.updateConnectionIfTokenVersionMatches = originalConditionalUpdate;
  }
}

async function testAlreadyMigratedIsNoop() {
  const connection = {
    brand_id: "brand-already-migrated",
    shop_domain: "already-migrated.myshopify.com",
    access_token_encrypted: encrypted("existing-access-token"),
    refresh_token_encrypted: encrypted("existing-refresh-token"),
    access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
    status: "active"
  };
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => {
    called = true;
    throw new Error("network must not be called for an already migrated connection");
  };

  try {
    const result = await provider.migrateLegacyOfflineToken(connection);
    assert(result === connection, "already migrated connection returns unchanged");
    assert(!called, "already migrated connection makes no provider request");
  } finally {
    global.fetch = originalFetch;
  }
}

async function testRotationRaceUsesNewerDatabaseState() {
  const connection = {
    brand_id: "brand-race",
    shop_domain: "race.myshopify.com",
    access_token_encrypted: encrypted("stale-access-token"),
    refresh_token_encrypted: encrypted("stale-refresh-token"),
    access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
    status: "active"
  };
  const newer = {
    ...connection,
    access_token_encrypted: encrypted("newer-access-token"),
    refresh_token_encrypted: encrypted("newer-refresh-token"),
    access_token_expires_at: new Date(Date.now() + 3600000).toISOString()
  };
  const originalConditionalUpdate = connectionStore.updateConnectionIfTokenVersionMatches;
  const originalGet = connectionStore.getConnectionByBrandId;
  connectionStore.updateConnectionIfTokenVersionMatches = async () => null;
  connectionStore.getConnectionByBrandId = async () => newer;

  try {
    const result = await provider.persistTokenPair(connection, {
      access_token: "losing-access-token",
      refresh_token: "losing-refresh-token",
      expires_in: 3600,
      refresh_token_expires_in: 2592000
    });
    assert(result === newer, "losing rotation converges on the newer database token pair");
  } finally {
    connectionStore.updateConnectionIfTokenVersionMatches = originalConditionalUpdate;
    connectionStore.getConnectionByBrandId = originalGet;
  }
}

async function testFailedCompareAndSwapDoesNotClaimSuccess() {
  const connection = {
    brand_id: "brand-conflict",
    shop_domain: "conflict.myshopify.com",
    access_token_encrypted: encrypted("unchanged-access-token"),
    refresh_token_encrypted: null,
    access_token_expires_at: null,
    status: "active"
  };
  const originalConditionalUpdate = connectionStore.updateConnectionIfTokenVersionMatches;
  const originalGet = connectionStore.getConnectionByBrandId;
  connectionStore.updateConnectionIfTokenVersionMatches = async () => null;
  connectionStore.getConnectionByBrandId = async () => connection;

  try {
    let error = null;
    try {
      await provider.persistTokenPair(connection, {
        access_token: "unpersisted-access-token",
        refresh_token: "unpersisted-refresh-token",
        expires_in: 3600,
        refresh_token_expires_in: 2592000
      });
    } catch (caught) {
      error = caught;
    }
    assert(error?.code === "shopify_token_rotation_conflict", "unchanged storage is a hard conflict");
  } finally {
    connectionStore.updateConnectionIfTokenVersionMatches = originalConditionalUpdate;
    connectionStore.getConnectionByBrandId = originalGet;
  }
}

async function run() {
  await testDirectMigration();
  await testAlreadyMigratedIsNoop();
  await testRotationRaceUsesNewerDatabaseState();
  await testFailedCompareAndSwapDoesNotClaimSuccess();
  console.log("PASS Shopify direct migration request");
  console.log("PASS Shopify encrypted token-pair persistence");
  console.log("PASS Shopify already-migrated no-op");
  console.log("PASS Shopify cross-instance rotation race handling");
  console.log("PASS Shopify failed compare-and-swap rejection");
}

run().catch((error) => {
  console.error("FAIL Shopify token migration test", error);
  process.exitCode = 1;
});
