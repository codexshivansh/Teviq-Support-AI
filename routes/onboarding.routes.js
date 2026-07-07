const express = require("express");
const {
  completeOnboarding,
  saveBrandSetup
} = require("../controllers/onboarding.controller");

const router = express.Router();

router.post("/brand-setup", saveBrandSetup);
router.post("/complete", completeOnboarding);

module.exports = router;
