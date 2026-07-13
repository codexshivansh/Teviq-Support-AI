const express = require("express");
const { oauthCallback } = require("../controllers/shopify.controller");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

router.get("/oauth/callback", asyncHandler(oauthCallback));

module.exports = router;
