const express = require("express");
const aiController = require("../controllers/aiController");
const { aiLimit } = require("../middleware/abuseLimits");

const router = express.Router();

router.post("/chat", aiLimit, aiController.chat);

module.exports = router;
