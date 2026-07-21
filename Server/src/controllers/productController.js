const asyncHandler = require("../utils/asyncHandler");
const productService = require("../services/productService");

const listProducts = asyncHandler(async (req, res) => {
  const products = await productService.listProducts(req.query);

  res.json({
    success: true,
    count: products.length,
    data: products,
  });
});

const getProduct = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id);

  res.json({
    success: true,
    data: product,
  });
});

const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body);

  res.status(201).json({
    success: true,
    data: product,
  });
});

const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body);

  res.json({
    success: true,
    data: product,
  });
});

const deleteProduct = asyncHandler(async (req, res) => {
  await productService.deleteProduct(req.params.id);

  res.status(204).send();
});

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
};
