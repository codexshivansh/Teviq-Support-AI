const express = require("express");
const { getConversations } = require("../controllers/conversations.controller");
const { asyncHandler } = require("../middleware/asyncHandler");
const { requireBrandAccess } = require("../middleware/brandAccess.middleware");

const router = express.Router();

router.get("/:brandId", requireBrandAccess, asyncHandler(getConversations));

module.exports = router;
