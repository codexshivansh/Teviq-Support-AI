const express = require("express");
const { runDelayCheck, runCartRecoveryCheck } = require("../controllers/internal.controller");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

router.post("/run-delay-check", asyncHandler(runDelayCheck));
router.post("/run-cart-recovery-check", asyncHandler(runCartRecoveryCheck));

module.exports = router;
