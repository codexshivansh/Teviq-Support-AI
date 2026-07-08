const { getBrandById } = require("../services/brand.service");
const shopifySyncService = require("../integrations/shopify/shopifySync.service");

async function getBrandOrRespond(req, res) {
  const brand = await getBrandById(req.params.brandId);
  if (!brand) {
    res.status(404).json({
      error: "brand_not_found",
      message: "Brand not found."
    });
    return null;
  }

  return brand;
}

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
