const crypto = require("crypto");
const {
  buildDashboardRedirect,
  normalizeShopDomain,
  safeReturnPath,
  verifyCallbackHmac
} = require("../integrations/shopify/shopifyOAuth.service");
const { toPublicConnection } = require("../integrations/shopify/shopifyConnection.store");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function signQuery(query, secret) {
  const message = Object.keys(query)
    .sort()
    .map((key) => `${key}=${query[key]}`)
    .join("&");
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

function run() {
  assert(
    normalizeShopDomain("https://Urban-Store.myshopify.com/admin") === "urban-store.myshopify.com",
    "valid Shopify domains should normalize"
  );
  assert(
    normalizeShopDomain("urban-store.myshopify.com.attacker.test") === "",
    "lookalike domains must be rejected"
  );
  assert(normalizeShopDomain("store.example.com") === "", "custom domains must not enter OAuth");

  const secret = "test-shopify-secret";
  const query = {
    code: "authorization-code",
    shop: "urban-store.myshopify.com",
    state: "state-value",
    timestamp: "1783987200"
  };
  const signedQuery = { ...query, hmac: signQuery(query, secret) };
  assert(verifyCallbackHmac(signedQuery, secret), "valid callback HMAC should pass");
  assert(
    !verifyCallbackHmac({ ...signedQuery, shop: "other-store.myshopify.com" }, secret),
    "tampered callback HMAC must fail"
  );

  assert(safeReturnPath("/shopify") === "/shopify", "Shopify return path should pass");
  assert(safeReturnPath("https://attacker.test") === "/shopify", "external return paths must be rejected");

  const publicConnection = toPublicConnection({
    brand_id: "urban-demo",
    shop_domain: "urban-store.myshopify.com",
    access_token_encrypted: "secret-access-token",
    refresh_token_encrypted: "secret-refresh-token",
    scopes: ["read_orders"],
    status: "active",
    product_count: 10,
    order_count: 5,
    categories: ["Accessories"]
  });
  assert(publicConnection.productCount === 10, "public projection should include safe metrics");
  assert(!("accessToken" in publicConnection), "public projection must not expose access token");
  assert(!("refreshToken" in publicConnection), "public projection must not expose refresh token");
  assert(!("scopes" in publicConnection), "public projection must not expose internal scopes");

  const redirect = buildDashboardRedirect("https://attacker.test", { shopify: "connected" });
  assert(
    redirect.startsWith("https://dashboard.teviq.in/shopify?"),
    "callback redirect must stay on the configured dashboard origin"
  );

  console.log("PASS Shopify OAuth domain validation");
  console.log("PASS Shopify OAuth HMAC validation");
  console.log("PASS Shopify OAuth redirect allowlist");
  console.log("PASS Shopify connection public projection");
}

run();
