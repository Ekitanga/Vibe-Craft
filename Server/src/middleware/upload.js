const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const HttpError = require("../utils/httpError");

const uploadsDir = path.join(__dirname, "../../uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 8;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomUUID() + ext);
  },
});

const fileFilter = (_req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(new HttpError(400, "Only JPEG, PNG, WEBP, or GIF images are allowed."));
    return;
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
});

const uploadImages = (req, res, next) => {
  upload.array("images", MAX_FILES)(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        next(new HttpError(400, "Each image must be 5MB or smaller."));
        return;
      }
      if (error.code === "LIMIT_FILE_COUNT") {
        next(new HttpError(400, "You can upload up to " + MAX_FILES + " images at a time."));
        return;
      }
      next(new HttpError(400, error.message));
      return;
    }

    next(error);
  });
};

module.exports = { uploadImages, uploadsDir };
