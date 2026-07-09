const shopifySyncService = require("../integrations/shopify/shopifySync.service");
const { getBrandOrRespond } = require("./helpers/brandLookup");

async function getStatus(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  return res.json(shopifySyncService.getStatus(brand.brandId));
}

async function syncBrand(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  return res.json(shopifySyncService.syncBrand(brand.brandId));
}

async function getProducts(req, res) {
  const brand = await getBrandOrRespond(req, res);
  if (!brand) return;

  return res.json({
    brandId: brand.brandId,
    provider: "shopify-demo",
    products: shopifySyncService.listProducts(brand.brandId)
  });
}

module.exports = {
  getStatus,
  syncBrand,
  getProducts
};
