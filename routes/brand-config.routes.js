const express = require("express");
const { getPublicBrandConfig } = require("../services/brand.service");

const router = express.Router();

router.get("/:brandId", (req, res) => {
  const config = getPublicBrandConfig(req.params.brandId);

  if (!config) {
    return res.status(404).json({
      error: "brand_not_found",
      message: "Brand config not found."
    });
  }

  return res.json(config);
});

module.exports = router;
