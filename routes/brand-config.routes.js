const express = require("express");
const { getPublicBrandConfig } = require("../services/brand.service");

const router = express.Router();

router.get("/:brandId", async (req, res, next) => {
  try {
    const config = await getPublicBrandConfig(req.params.brandId);

    if (!config) {
      return res.status(404).json({
        error: "brand_not_found",
        message: "Brand config not found."
      });
    }

    return res.json(config);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
