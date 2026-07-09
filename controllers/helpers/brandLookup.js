const { getBrandById } = require("../../services/brand.service");

async function getBrandOrRespond(req, res) {
  const { brandId } = req.params;

  let brand;
  try {
    brand = await getBrandById(brandId);
  } catch (error) {
    console.error(`[brandLookup] Brand lookup failed for "${brandId}": ${error.message}`);
    res.status(error.statusCode || 503).json({
      error: error.code || "brand_lookup_failed",
      message: "Could not verify this brand right now. Please try again."
    });
    return null;
  }

  if (!brand) {
    res.status(404).json({
      error: "brand_not_found",
      message: "Brand not found."
    });
    return null;
  }

  return brand;
}

module.exports = { getBrandOrRespond };
