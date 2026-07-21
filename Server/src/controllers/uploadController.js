const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");

const uploadImages = asyncHandler(async (req, res) => {
  const files = req.files || [];

  if (!files.length) {
    throw new HttpError(400, "No images were uploaded.");
  }

  const urls = files.map((file) => "/uploads/" + file.filename);

  res.status(201).json({
    success: true,
    data: { urls },
  });
});

module.exports = { uploadImages };
