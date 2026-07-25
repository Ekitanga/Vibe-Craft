const asyncHandler = require("../utils/asyncHandler");
const testimonialService = require("../services/testimonialService");

const listPublishedTestimonials = asyncHandler(async (_req, res) => {
  const testimonials = await testimonialService.listTestimonials({ publishedOnly: true });

  res.json({
    success: true,
    count: testimonials.length,
    data: testimonials,
  });
});

const listAllTestimonials = asyncHandler(async (_req, res) => {
  const testimonials = await testimonialService.listTestimonials();

  res.json({
    success: true,
    count: testimonials.length,
    data: testimonials,
  });
});

const createTestimonial = asyncHandler(async (req, res) => {
  const testimonial = await testimonialService.createTestimonial(req.body);

  res.status(201).json({
    success: true,
    data: testimonial,
  });
});

const updateTestimonial = asyncHandler(async (req, res) => {
  const testimonial = await testimonialService.updateTestimonial(req.params.id, req.body);

  res.json({
    success: true,
    data: testimonial,
  });
});

const deleteTestimonial = asyncHandler(async (req, res) => {
  await testimonialService.deleteTestimonial(req.params.id);

  res.status(204).send();
});

module.exports = {
  listPublishedTestimonials,
  listAllTestimonials,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
};
