const express = require("express");
const { runDelayCheck } = require("../controllers/internal.controller");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

router.post("/run-delay-check", asyncHandler(runDelayCheck));

module.exports = router;
