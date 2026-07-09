const express = require("express");
const { getPublicBrandConfig } = require("../services/brand.service");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

router.get(
  "/:brandId",
  asyncHandler(async (req, res) => {
    const config = await getPublicBrandConfig(req.params.brandId);

    if (!config) {
      return res.status(404).json({
        error: "brand_not_found",
        message: "Brand config not found."
      });
    }

    return res.json(config);
  })
);

module.exports = router;
