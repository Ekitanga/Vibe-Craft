const express = require("express");
const aiController = require("../controllers/aiController");
const { aiRateLimit } = require("../middleware/aiRateLimit");

const router = express.Router();

router.post("/chat", aiRateLimit, aiController.chat);

module.exports = router;
