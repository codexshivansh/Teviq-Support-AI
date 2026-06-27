const express = require("express");
const { handleChat } = require("../controllers/chat.controller");

const router = express.Router();

router.post("/", handleChat);

module.exports = router;
