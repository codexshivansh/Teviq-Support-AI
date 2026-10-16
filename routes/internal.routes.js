const express = require("express");
const {
  runDelayCheck,
  runCartRecoveryCheck,
  runChatRetention,
  runInstagramTokenRefresh
} = require("../controllers/internal.controller");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

router.post("/run-delay-check", asyncHandler(runDelayCheck));
router.post("/run-cart-recovery-check", asyncHandler(runCartRecoveryCheck));
router.post("/run-chat-retention", asyncHandler(runChatRetention));
router.post("/refresh-instagram-tokens", asyncHandler(runInstagramTokenRefresh));

module.exports = router;
