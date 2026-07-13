const shopifyIntegrationService = require("../integrations/shopify/shopifyIntegration.service");
const shopifyOauthService = require("../integrations/shopify/shopifyOAuth.service");
const { getBrandOrRespond } = require("./helpers/brandLookup");

async function getStatus(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  return res.json(await shopifyIntegrationService.getStatus(brand.brandId));
}

async function syncBrand(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  return res.json(await shopifyIntegrationService.syncBrand(brand.brandId));
}

async function getProducts(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;
  const [status, products] = await Promise.all([
    shopifyIntegrationService.getStatus(brand.brandId),
    shopifyIntegrationService.listProducts(brand.brandId)
  ]);

  return res.json({
    brandId: brand.brandId,
    provider: status.provider,
    products
  });
}

async function connect(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  if (!brand.isActive) {
    return res.status(403).json({
      error: "brand_inactive",
      message: "This brand workspace is not active."
    });
  }

  const result = await shopifyIntegrationService.beginConnection({
    brandId: brand.brandId,
    clerkUserId: req.auth.userId,
    shopDomain: req.body?.storeUrl,
    returnPath: req.body?.returnPath
  });

  return res.json({ ok: true, ...result });
}

async function disconnect(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  await shopifyIntegrationService.disconnect(brand.brandId);
  return res.json({ ok: true, connected: false });
}

async function oauthCallback(req, res) {
  try {
    const result = await shopifyOauthService.completeOauth(req.query);
    return res.redirect(
      303,
      shopifyOauthService.buildDashboardRedirect(result.returnPath, {
        shopify: "connected"
      })
    );
  } catch (error) {
    console.error("[shopify-oauth] Callback failed", {
      code: error.code,
      message: error.message
    });
    return res.redirect(
      303,
      shopifyOauthService.buildDashboardRedirect(error.returnPath, {
        shopify: "error",
        code: error.code || "shopify_connection_failed"
      })
    );
  }
}

module.exports = {
  connect,
  disconnect,
  getStatus,
  syncBrand,
  getProducts,
  oauthCallback
};
