const os = require("os");
const crypto = require("crypto");
const multer = require("multer");
const HttpError = require("../utils/httpError");

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 8;

const ALLOWED_VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_VIDEO_FILE_SIZE = 80 * 1024 * 1024;

const storage = multer.memoryStorage();

// Videos (up to 80MB) are streamed to a temp file instead of RAM, so a few concurrent
// uploads cannot exhaust the server's memory. The controller deletes the file after use.
const videoStorage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (_req, _file, cb) => cb(null, `vibecraft-upload-${crypto.randomUUID()}`),
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
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES, fields: 20, fieldSize: 100 * 1024 },
});

const videoFileFilter = (_req, file, cb) => {
  if (!ALLOWED_VIDEO_MIME_TYPES.has(file.mimetype)) {
    cb(new HttpError(400, "Only MP4, WEBM, or MOV videos are allowed."));
    return;
  }
  cb(null, true);
};

const videoUpload = multer({
  storage: videoStorage,
  fileFilter: videoFileFilter,
  limits: { fileSize: MAX_VIDEO_FILE_SIZE, files: 1, fields: 10, fieldSize: 10 * 1024 },
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

const uploadAvatar = (req, res, next) => {
  upload.single("image")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        next(new HttpError(400, "The profile image must be 5MB or smaller."));
        return;
      }
      next(new HttpError(400, error.message));
      return;
    }

    next(error);
  });
};

const uploadVideo = (req, res, next) => {
  videoUpload.single("video")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        next(new HttpError(400, "The video must be 80MB or smaller."));
        return;
      }
      next(new HttpError(400, error.message));
      return;
    }

    next(error);
  });
};

module.exports = { uploadAvatar, uploadImages, uploadVideo };
