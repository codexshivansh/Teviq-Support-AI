const express = require("express");
const { receiveWebhook } = require("../controllers/shopifyWebhook.controller");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

router.post(
  "/webhooks",
  express.raw({ type: "application/json", limit: "1mb" }),
  asyncHandler(receiveWebhook)
);

module.exports = router;
