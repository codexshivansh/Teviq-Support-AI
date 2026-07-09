const express = require("express");
const {
  completeOnboarding,
  getShopifyConnectionStatus,
  saveBrandSetup,
  testShopifyConnection
} = require("../controllers/onboarding.controller");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

router.post("/brand-setup", asyncHandler(saveBrandSetup));
router.get("/shopify/status", asyncHandler(getShopifyConnectionStatus));
router.post("/shopify/test-connection", asyncHandler(testShopifyConnection));
router.post("/complete", asyncHandler(completeOnboarding));

module.exports = router;
