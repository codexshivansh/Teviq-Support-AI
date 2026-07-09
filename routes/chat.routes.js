const express = require("express");
const { handleChat } = require("../controllers/chat.controller");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

router.post("/", asyncHandler(handleChat));

module.exports = router;
