const express = require("express");
const { getStatus, syncBrand, getProducts } = require("../controllers/shopify.controller");

const router = express.Router();

router.get("/:brandId/status", getStatus);
router.post("/:brandId/sync", syncBrand);
router.get("/:brandId/products", getProducts);

module.exports = router;
