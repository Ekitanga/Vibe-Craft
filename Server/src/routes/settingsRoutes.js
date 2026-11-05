const express = require("express");
const siteSettingsController = require("../controllers/siteSettingsController");

const router = express.Router();

router.get("/", siteSettingsController.getSettings);

module.exports = router;
