const express = require("express");
const { getMe, setMyBrand, promoteMeToAdmin } = require("../controllers/me.controller");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

router.get("/", asyncHandler(getMe));
router.post("/brand", asyncHandler(setMyBrand));
router.post("/promote-admin", asyncHandler(promoteMeToAdmin));

module.exports = router;
