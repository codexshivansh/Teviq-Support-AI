require("dotenv").config();

const {
  migrateBrandToExpiringOfflineToken,
  tokenMode
} = require("../integrations/shopify/shopifyAdmin.provider");

function getBrandId(argv) {
  const brandFlagIndex = argv.indexOf("--brand");
  const fromFlag = brandFlagIndex >= 0 ? argv[brandFlagIndex + 1] : "";
  return String(fromFlag || process.env.SHOPIFY_MIGRATION_BRAND_ID || "").trim();
}

async function main() {
  const brandId = getBrandId(process.argv.slice(2));
  if (!brandId) {
    throw new Error(
      "Refusing to run without an explicit brand. Use --brand <brand-id> in a controlled maintenance window."
    );
  }

  const connection = await migrateBrandToExpiringOfflineToken(brandId);
  const mode = tokenMode(connection);
  if (mode !== "expiring_offline") {
    throw new Error("Shopify migration did not produce a complete expiring offline token pair.");
  }

  // Never print access tokens, refresh tokens, app secrets or encrypted payloads.
  console.log(JSON.stringify({
    brandId: connection.brand_id,
    shopDomain: connection.shop_domain,
    tokenMode: mode,
    accessTokenExpiresAt: connection.access_token_expires_at,
    refreshTokenExpiresAt: connection.refresh_token_expires_at,
    status: connection.status
  }, null, 2));
}

main().catch((error) => {
  console.error(`Shopify token migration failed: ${error.message}`);
  process.exitCode = 1;
});
