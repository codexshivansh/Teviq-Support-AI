const express = require("express");
const { listBrandsForCurrentUser } = require("../controllers/brands.controller");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

router.get("/", asyncHandler(listBrandsForCurrentUser));

module.exports = router;
