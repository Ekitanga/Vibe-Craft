const cloudinary = require("cloudinary").v2;
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const env = require("../config/env");
const customerAuthService = require("../services/customerAuthService");

cloudinary.config({
  cloud_name: env.cloudinaryCloudName,
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret,
  secure: true,
});

function uploadToCloudinary(file, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      }
    );

    stream.end(file.buffer);
  });
}

const uploadImages = asyncHandler(async (req, res) => {
  const files = req.files || [];

  if (!files.length) {
    throw new HttpError(400, "No images were uploaded.");
  }

  if (!env.cloudinaryCloudName || !env.cloudinaryApiKey || !env.cloudinaryApiSecret) {
    throw new HttpError(500, "Cloudinary is not configured on the server.");
  }

  const results = await Promise.all(files.map((file) => uploadToCloudinary(file, "vibecraft/products")));

  res.status(201).json({
    success: true,
    data: {
      urls: results.map((image) => image.secure_url),
      publicIds: results.map((image) => image.public_id),
    },
  });
});

const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, "No profile image was uploaded.");
  }

  if (!env.cloudinaryCloudName || !env.cloudinaryApiKey || !env.cloudinaryApiSecret) {
    throw new HttpError(500, "Cloudinary is not configured on the server.");
  }

  const image = await uploadToCloudinary(req.file, "vibecraft/avatars");
  const account = await customerAuthService.updateProfileImage(req.customer.id, image.secure_url);

  res.status(200).json({
    success: true,
    data: account,
  });
});

module.exports = { uploadAvatar, uploadImages };
