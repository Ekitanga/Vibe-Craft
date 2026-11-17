const asyncHandler = require("../utils/asyncHandler");
const productService = require("../services/productService");
const auditService = require("../services/auditService");

const listProducts = asyncHandler(async (req, res) => {
  const products = (await productService.listProducts(req.query)).map(productService.toPublicProduct);

  res.json({
    success: true,
    count: products.length,
    data: products,
  });
});

const getProduct = asyncHandler(async (req, res) => {
  const product = await productService.getProductByIdOrSlug(req.params.id);

  res.json({
    success: true,
    data: productService.toPublicProduct(product),
  });
});

const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body);
  await auditService.record(req.admin, "create_product", "product", product.id, { name: product.name });

  res.status(201).json({
    success: true,
    data: product,
  });
});

const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body);
  await auditService.record(req.admin, "update_product", "product", product.id, { name: product.name });

  res.json({
    success: true,
    data: product,
  });
});

const deleteProduct = asyncHandler(async (req, res) => {
  await productService.deleteProduct(req.params.id);
  await auditService.record(req.admin, "delete_product", "product", req.params.id);

  res.status(204).send();
});

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
};
