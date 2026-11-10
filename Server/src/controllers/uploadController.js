const fs = require("fs/promises");
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

function uploadToCloudinary(file, folder, resourceType) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType || "image",
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

// Large videos arrive as temp files; upload from disk, then always remove the file.
async function uploadFileToCloudinary(file, folder, resourceType) {
  try {
    return await cloudinary.uploader.upload(file.path, { folder, resource_type: resourceType || "image", chunk_size: 20 * 1024 * 1024 });
  } finally {
    await fs.unlink(file.path).catch(() => {});
  }
}

const discardTempFile = async (file) => {
  if (file && file.path) await fs.unlink(file.path).catch(() => {});
};

// Cloudinary serves a JPG of the first frame for any uploaded video simply by requesting
// the same public ID with a .jpg extension under /image/upload/ instead of /video/upload/ —
// no separate poster upload or eager transformation needed.
function videoPosterUrl(secureUrl) {
  return secureUrl.replace("/video/upload/", "/image/upload/").replace(/\.[a-z0-9]+$/i, ".jpg");
}

// The browser-declared MIME type can be faked; check the file's real signature.
const looksLikeImage = (buffer) => {
  if (!buffer || buffer.length < 12) return false;
  const hex = buffer.subarray(0, 12).toString("hex");
  return (
    hex.startsWith("ffd8ff") || // JPEG
    hex.startsWith("89504e470d0a1a0a") || // PNG
    hex.startsWith("47494638") || // GIF
    (hex.startsWith("52494646") && buffer.subarray(8, 12).toString("ascii") === "WEBP") // WEBP
  );
};

const assertImages = (files) => {
  if (files.some((file) => !looksLikeImage(file.buffer))) {
    throw new HttpError(400, "One of the files is not a real JPEG, PNG, WEBP or GIF image.");
  }
};

const uploadImages = asyncHandler(async (req, res) => {
  const files = req.files || [];

  if (!files.length) {
    throw new HttpError(400, "No images were uploaded.");
  }
  assertImages(files);

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
  assertImages([req.file]);

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

const uploadTestimonialVideo = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, "No video was uploaded.");
  }

  if (!env.cloudinaryCloudName || !env.cloudinaryApiKey || !env.cloudinaryApiSecret) {
    await discardTempFile(req.file);
    throw new HttpError(500, "Cloudinary is not configured on the server.");
  }

  const video = await uploadFileToCloudinary(req.file, "vibecraft/testimonials", "video");

  res.status(201).json({
    success: true,
    data: {
      videoUrl: video.secure_url,
      posterUrl: videoPosterUrl(video.secure_url),
    },
  });
});

const uploadProductVideo = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, "No video was uploaded.");
  }

  if (!env.cloudinaryCloudName || !env.cloudinaryApiKey || !env.cloudinaryApiSecret) {
    await discardTempFile(req.file);
    throw new HttpError(500, "Cloudinary is not configured on the server.");
  }

  const video = await uploadFileToCloudinary(req.file, "vibecraft/products", "video");

  res.status(201).json({
    success: true,
    data: {
      videoUrl: video.secure_url,
      posterUrl: videoPosterUrl(video.secure_url),
    },
  });
});

module.exports = { uploadAvatar, uploadImages, uploadTestimonialVideo, uploadProductVideo };
