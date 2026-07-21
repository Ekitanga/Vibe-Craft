const asyncHandler = require("../utils/asyncHandler");
const categoryService = require("../services/categoryService");

const listCategories = asyncHandler(async (_req, res) => {
  const categories = await categoryService.listCategories();

  res.json({
    success: true,
    count: categories.length,
    data: categories,
  });
});

module.exports = {
  listCategories,
};
