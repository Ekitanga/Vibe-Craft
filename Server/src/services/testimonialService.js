const crypto = require("crypto");
const db = require("../db/postgres");
const HttpError = require("../utils/httpError");

const toBoolean = (value) => value === true || value === "true" || value === 1;

const mapTestimonialRow = (row) => ({
  id: row.id,
  clientName: row.client_name,
  clientLocation: row.client_location,
  quote: row.quote,
  reviewType: row.review_type || (row.video_url ? "video" : "written"),
  videoUrl: row.video_url,
  posterUrl: row.poster_url,
  isPublished: row.is_published,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const listTestimonials = async ({ publishedOnly } = {}) => {
  const where = publishedOnly ? "WHERE is_published = TRUE" : "";
  const result = await db.query(
    `SELECT * FROM testimonials ${where} ORDER BY sort_order ASC, created_at ASC`
  );

  return result.rows.map(mapTestimonialRow);
};

const getTestimonialById = async (id) => {
  const result = await db.query("SELECT * FROM testimonials WHERE id = $1", [id]);

  if (!result.rows[0]) {
    throw new HttpError(404, "Testimonial not found");
  }

  return mapTestimonialRow(result.rows[0]);
};

const validatePayload = (payload, { partial } = {}) => {
  if (!partial || payload.clientName !== undefined) {
    if (!payload.clientName || !String(payload.clientName).trim()) {
      throw new HttpError(400, "clientName is required");
    }
  }

  const reviewType = payload.reviewType || (payload.videoUrl ? "video" : "written");

  if (!['video', 'written'].includes(reviewType)) {
    throw new HttpError(400, "reviewType must be video or written");
  }

  if (reviewType === "video" && (!partial || payload.videoUrl !== undefined)) {
    if (!payload.videoUrl || !String(payload.videoUrl).trim()) {
      throw new HttpError(400, "videoUrl is required for video testimonials");
    }
  }

  if (reviewType === "written" && (!partial || payload.quote !== undefined)) {
    if (!payload.quote || !String(payload.quote).trim()) {
      throw new HttpError(400, "quote is required for written reviews");
    }
  }
};

const createTestimonial = async (payload) => {
  validatePayload(payload);

  const id = crypto.randomUUID();
  const reviewType = payload.reviewType || "video";

  const result = await db.query(
    `INSERT INTO testimonials (id, client_name, client_location, quote, review_type, video_url, poster_url, is_published, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      id,
      payload.clientName.trim(),
      payload.clientLocation || null,
      payload.quote || null,
      reviewType,
      reviewType === "video" ? payload.videoUrl : null,
      reviewType === "video" ? payload.posterUrl || null : null,
      payload.isPublished === undefined ? true : toBoolean(payload.isPublished),
      Number(payload.sortOrder || 0),
    ]
  );

  return mapTestimonialRow(result.rows[0]);
};

const updateTestimonial = async (id, payload) => {
  const existing = await getTestimonialById(id);
  validatePayload(payload, { partial: true });

  const merged = {
    clientName: payload.clientName === undefined ? existing.clientName : payload.clientName,
    clientLocation: payload.clientLocation === undefined ? existing.clientLocation : payload.clientLocation,
    quote: payload.quote === undefined ? existing.quote : payload.quote,
    reviewType: payload.reviewType === undefined ? existing.reviewType : payload.reviewType,
    videoUrl: payload.videoUrl === undefined ? existing.videoUrl : payload.videoUrl,
    posterUrl: payload.posterUrl === undefined ? existing.posterUrl : payload.posterUrl,
    isPublished: payload.isPublished === undefined ? existing.isPublished : toBoolean(payload.isPublished),
    sortOrder: payload.sortOrder === undefined ? existing.sortOrder : Number(payload.sortOrder),
  };

  if (merged.reviewType === "written") {
    merged.videoUrl = null;
    merged.posterUrl = null;
  }

  if (merged.reviewType === "video" && !merged.videoUrl) {
    throw new HttpError(400, "videoUrl is required for video testimonials");
  }

  if (merged.reviewType === "written" && !merged.quote) {
    throw new HttpError(400, "quote is required for written reviews");
  }

  const result = await db.query(
    `UPDATE testimonials SET
       client_name = $2,
       client_location = $3,
       quote = $4,
       review_type = $5,
       video_url = $6,
       poster_url = $7,
       is_published = $8,
       sort_order = $9
     WHERE id = $1
     RETURNING *`,
    [
      id,
      merged.clientName.trim(),
      merged.clientLocation || null,
      merged.quote || null,
      merged.reviewType,
      merged.videoUrl || null,
      merged.posterUrl || null,
      merged.isPublished,
      merged.sortOrder,
    ]
  );

  return mapTestimonialRow(result.rows[0]);
};

const deleteTestimonial = async (id) => {
  await getTestimonialById(id);
  await db.query("DELETE FROM testimonials WHERE id = $1", [id]);
};

module.exports = {
  listTestimonials,
  getTestimonialById,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
};
