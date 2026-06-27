const { getBrandById } = require("../services/brand.service");
const shopifySyncService = require("../integrations/shopify/shopifySync.service");

function getBrandOrRespond(req, res) {
  const brand = getBrandById(req.params.brandId);
  if (!brand) {
    res.status(404).json({
      error: "brand_not_found",
      message: "Brand not found."
    });
    return null;
  }

  return brand;
}

function getStatus(req, res) {
  const brand = getBrandOrRespond(req, res);
  if (!brand) return;

  return res.json(shopifySyncService.getStatus(brand.brandId));
}

function syncBrand(req, res) {
  const brand = getBrandOrRespond(req, res);
  if (!brand) return;

  return res.json(shopifySyncService.syncBrand(brand.brandId));
}

function getProducts(req, res) {
  const brand = getBrandOrRespond(req, res);
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
