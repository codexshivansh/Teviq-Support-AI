const express = require("express");
const {
  connect,
  disconnect,
  getStatus,
  syncBrand,
  getProducts
} = require("../controllers/shopify.controller");
const { asyncHandler } = require("../middleware/asyncHandler");
const { requireBrandAccess } = require("../middleware/brandAccess.middleware");

const router = express.Router();

router.get("/:brandId/status", requireBrandAccess, asyncHandler(getStatus));
router.post("/:brandId/connect", requireBrandAccess, asyncHandler(connect));
router.delete("/:brandId/connection", requireBrandAccess, asyncHandler(disconnect));
router.post("/:brandId/sync", requireBrandAccess, asyncHandler(syncBrand));
router.get("/:brandId/products", requireBrandAccess, asyncHandler(getProducts));

module.exports = router;
