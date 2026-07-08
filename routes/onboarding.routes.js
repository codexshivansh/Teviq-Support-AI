const express = require("express");
const {
  completeOnboarding,
  getShopifyConnectionStatus,
  saveBrandSetup,
  testShopifyConnection
} = require("../controllers/onboarding.controller");

const router = express.Router();

router.post("/brand-setup", saveBrandSetup);
router.get("/shopify/status", getShopifyConnectionStatus);
router.post("/shopify/test-connection", testShopifyConnection);
router.post("/complete", completeOnboarding);

module.exports = router;
