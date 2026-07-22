const express = require("express");
const {
  runDelayCheck,
  runCartRecoveryCheck,
  runChatRetention
} = require("../controllers/internal.controller");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

router.post("/run-delay-check", asyncHandler(runDelayCheck));
router.post("/run-cart-recovery-check", asyncHandler(runCartRecoveryCheck));
router.post("/run-chat-retention", asyncHandler(runChatRetention));

module.exports = router;
