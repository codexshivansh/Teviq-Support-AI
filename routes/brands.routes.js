const express = require("express");
const { getBrandSettings, listBrandsForCurrentUser, updateBrandSettings } = require("../controllers/brands.controller");
const { requireBrandAccess } = require("../middleware/brandAccess.middleware");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

router.get("/", asyncHandler(listBrandsForCurrentUser));
router.get("/:brandId/settings", requireBrandAccess, asyncHandler(getBrandSettings));
router.patch("/:brandId/settings", requireBrandAccess, asyncHandler(updateBrandSettings));

module.exports = router;
