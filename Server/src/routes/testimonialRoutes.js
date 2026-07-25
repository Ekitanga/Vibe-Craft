const express = require("express");
const testimonialController = require("../controllers/testimonialController");

const router = express.Router();

router.get("/", testimonialController.listPublishedTestimonials);

module.exports = router;
