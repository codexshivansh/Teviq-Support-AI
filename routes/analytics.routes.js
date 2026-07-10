const express = require("express");
const { getAnalytics } = require("../controllers/analytics.controller");
const { asyncHandler } = require("../middleware/asyncHandler");
const { requireBrandAccess } = require("../middleware/brandAccess.middleware");

const router = express.Router();

router.get("/:brandId", requireBrandAccess, asyncHandler(getAnalytics));

module.exports = router;
