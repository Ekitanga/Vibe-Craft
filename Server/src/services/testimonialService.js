const crypto = require("crypto");
const db = require("../db/postgres");
const HttpError = require("../utils/httpError");

const toBoolean = (value) => value === true || value === "true" || value === 1;

const mapTestimonialRow = (row) => ({
  id: row.id,
  clientName: row.client_name,
  clientLocation: row.client_location,
  quote: row.quote,
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

  if (!partial || payload.videoUrl !== undefined) {
    if (!payload.videoUrl || !String(payload.videoUrl).trim()) {
      throw new HttpError(400, "videoUrl is required");
    }
  }
};

const createTestimonial = async (payload) => {
  validatePayload(payload);

  const id = crypto.randomUUID();

  const result = await db.query(
    `INSERT INTO testimonials (id, client_name, client_location, quote, video_url, poster_url, is_published, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      id,
      payload.clientName.trim(),
      payload.clientLocation || null,
      payload.quote || null,
      payload.videoUrl,
      payload.posterUrl || null,
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
    videoUrl: payload.videoUrl === undefined ? existing.videoUrl : payload.videoUrl,
    posterUrl: payload.posterUrl === undefined ? existing.posterUrl : payload.posterUrl,
    isPublished: payload.isPublished === undefined ? existing.isPublished : toBoolean(payload.isPublished),
    sortOrder: payload.sortOrder === undefined ? existing.sortOrder : Number(payload.sortOrder),
  };

  const result = await db.query(
    `UPDATE testimonials SET
       client_name = $2,
       client_location = $3,
       quote = $4,
       video_url = $5,
       poster_url = $6,
       is_published = $7,
       sort_order = $8
     WHERE id = $1
     RETURNING *`,
    [
      id,
      merged.clientName.trim(),
      merged.clientLocation || null,
      merged.quote || null,
      merged.videoUrl,
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
