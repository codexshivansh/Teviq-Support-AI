const assert = require("node:assert/strict");
const { beginOauth, completeOauth, REQUIRED_SCOPES } = require("../integrations/instagram/instagramOAuth.service");

process.env.INSTAGRAM_APP_ID = "test-app-id";
process.env.INSTAGRAM_APP_SECRET = "test-app-secret";
process.env.INSTAGRAM_REDIRECT_URI = "https://api.example.test/api/instagram/oauth/callback";
process.env.DASHBOARD_URL = "https://dashboard.example.test";
process.env.SHOPIFY_CREDENTIALS_SECRET = "test-encryption-secret";
process.env.SUPABASE_URL = "https://supabase.example.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

const originalFetch = global.fetch;
let savedState;
let savedConnection;
const responses = [
  { access_token: "short-lived-token", user_id: "ig-user-789" },
  { access_token: "long-lived-token", expires_in: 5184000 },
  { user_id: "ig-user-789", username: "helloteviq" }
];

global.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  if (url.hostname === "supabase.example.test" && url.pathname.endsWith("/instagram_oauth_states")) {
    if (options.method === "POST") {
      savedState = JSON.parse(options.body);
      return new Response("[]", { status: 201 });
    }
    if (options.method === "DELETE" && url.searchParams.has("state_hash")) {
      return new Response(JSON.stringify(savedState ? [savedState] : []), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  }
  if (url.hostname === "api.instagram.com" && url.pathname.endsWith("/oauth/access_token")) {
    assert.equal(options.method, "POST");
    assert.equal(new URLSearchParams(options.body).get("code"), "test-code");
    return new Response(JSON.stringify(responses.shift()), { status: 200 });
  }
  if (url.hostname === "graph.instagram.com" && url.pathname === "/access_token") {
    assert.equal(url.searchParams.get("grant_type"), "ig_exchange_token");
    return new Response(JSON.stringify(responses.shift()), { status: 200 });
  }
  if (url.hostname === "graph.instagram.com" && url.pathname === "/me") {
    assert.equal(url.searchParams.get("fields"), "user_id,username");
    return new Response(JSON.stringify(responses.shift()), { status: 200 });
  }
  if (url.hostname === "supabase.example.test" && url.pathname.endsWith("/instagram_connections")) {
    savedConnection = JSON.parse(options.body);
    return new Response(JSON.stringify([savedConnection]), { status: 201 });
  }
  throw new Error(`Unexpected mocked fetch: ${options.method || "GET"} ${url.origin}${url.pathname}`);
};

async function run() {
  try {
    const started = await beginOauth({ brandId: "teviq", clerkUserId: "user-1" });
    const authorizationUrl = new URL(started.authorizationUrl);
    assert.equal(authorizationUrl.origin, "https://www.instagram.com");
    assert.equal(authorizationUrl.pathname, "/oauth/authorize");
    assert.equal(authorizationUrl.searchParams.get("client_id"), "test-app-id");
    assert.equal(authorizationUrl.searchParams.get("redirect_uri"), process.env.INSTAGRAM_REDIRECT_URI);
    assert.deepEqual(authorizationUrl.searchParams.get("scope").split(","), REQUIRED_SCOPES);
    assert.ok(savedState.state_hash);
    assert.notEqual(savedState.state_hash, authorizationUrl.searchParams.get("state"));

    const result = await completeOauth({ state: authorizationUrl.searchParams.get("state"), code: "test-code" });
    assert.equal(result.connection.username, "helloteviq");
    assert.equal(result.connection.instagramUserId, "ig-user-789");
    assert.equal(result.connection.status, "active");
    assert.equal(savedConnection.brand_id, "teviq");
    assert.notEqual(savedConnection.access_token_encrypted, "long-lived-token");
    assert.ok(savedConnection.token_expires_at);
    assert.deepEqual(savedConnection.scopes, REQUIRED_SCOPES);
    console.log("Instagram OAuth state, exchange, account identity, and encrypted persistence tests passed.");
  } finally {
    global.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
