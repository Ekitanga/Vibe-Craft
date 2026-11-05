const crypto = require("crypto");
const db = require("../db/postgres");
const HttpError = require("../utils/httpError");

const normalizeCode = (value) => String(value || "").trim().toUpperCase();

const mapPromotion = (row) => ({
  id: row.id,
  code: row.code,
  description: row.description || "",
  discountType: row.discount_type,
  discountValue: Number(row.discount_value),
  minimumSubtotal: Number(row.minimum_subtotal || 0),
  startsAt: row.starts_at,
  expiresAt: row.expires_at,
  usageLimit: row.usage_limit === null ? null : Number(row.usage_limit),
  usedCount: Number(row.used_count || 0),
  active: Boolean(row.active),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const isUsable = (row, now = new Date()) => {
  if (!row || !row.active) return false;
  if (row.starts_at && new Date(row.starts_at) > now) return false;
  if (row.expires_at && new Date(row.expires_at) < now) return false;
  if (row.usage_limit !== null && Number(row.used_count) >= Number(row.usage_limit)) return false;
  return true;
};

const calculateDiscount = (row, subtotal) => {
  const amount = Number(subtotal || 0);
  if (amount < Number(row.minimum_subtotal || 0)) return 0;
  const discount = row.discount_type === "percent"
    ? Math.floor(amount * Number(row.discount_value) / 100)
    : Number(row.discount_value);
  return Math.max(0, Math.min(amount, discount));
};

const validatePromotion = async (code, subtotal) => {
  const normalized = normalizeCode(code);
  if (!normalized) throw new HttpError(400, "Enter a promotion code.");
  const result = await db.query("SELECT * FROM promotions WHERE code = $1", [normalized]);
  const row = result.rows[0];
  if (!isUsable(row)) throw new HttpError(400, "That promotion is not active or has expired.");
  const discount = calculateDiscount(row, subtotal);
  if (!discount) throw new HttpError(400, `This promotion requires a minimum subtotal of KES ${Number(row.minimum_subtotal || 0).toLocaleString()}.`);
  return { promotion: mapPromotion(row), discountAmount: discount };
};

const listPromotions = async () => {
  const result = await db.query("SELECT * FROM promotions ORDER BY created_at DESC");
  return result.rows.map(mapPromotion);
};

const createPromotion = async (input = {}) => {
  const code = normalizeCode(input.code);
  const discountType = input.discountType === "fixed" ? "fixed" : input.discountType === "percent" ? "percent" : "";
  const discountValue = Number(input.discountValue);
  const minimumSubtotal = Number(input.minimumSubtotal || 0);
  const usageLimit = input.usageLimit === "" || input.usageLimit === undefined || input.usageLimit === null ? null : Number(input.usageLimit);

  if (!/^[A-Z0-9][A-Z0-9_-]{2,30}$/.test(code)) throw new HttpError(400, "Code must be 3–31 letters, numbers, hyphens, or underscores.");
  if (!discountType || !Number.isInteger(discountValue) || discountValue <= 0 || (discountType === "percent" && discountValue > 100)) {
    throw new HttpError(400, "Choose a valid percentage or fixed discount.");
  }
  if (!Number.isInteger(minimumSubtotal) || minimumSubtotal < 0) throw new HttpError(400, "Minimum subtotal must be a whole amount of 0 or more.");
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) throw new HttpError(400, "Usage limit must be a whole number of 1 or more.");

  try {
    const result = await db.query(
      `INSERT INTO promotions (id, code, description, discount_type, discount_value, minimum_subtotal, starts_at, expires_at, usage_limit, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [crypto.randomUUID(), code, String(input.description || "").trim().slice(0, 180), discountType, discountValue,
        minimumSubtotal, input.startsAt || null, input.expiresAt || null, usageLimit, input.active !== false]
    );
    return mapPromotion(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") throw new HttpError(409, "That promotion code already exists.");
    throw error;
  }
};

const updatePromotion = async (id, input = {}) => {
  const active = input.active === true || input.active === "true";
  const result = await db.query("UPDATE promotions SET active = $1 WHERE id = $2 RETURNING *", [active, id]);
  if (!result.rows[0]) throw new HttpError(404, "Promotion not found.");
  return mapPromotion(result.rows[0]);
};

const deletePromotion = async (id) => {
  const result = await db.query("DELETE FROM promotions WHERE id = $1 RETURNING id", [id]);
  if (!result.rows[0]) throw new HttpError(404, "Promotion not found.");
};

const applyPromotion = async (client, code, subtotal) => {
  if (!code) return { code: null, discountAmount: 0 };
  const result = await client.query("SELECT * FROM promotions WHERE code = $1 FOR UPDATE", [normalizeCode(code)]);
  const row = result.rows[0];
  if (!isUsable(row)) throw new HttpError(400, "That promotion is not active or has expired.");
  const discountAmount = calculateDiscount(row, subtotal);
  if (!discountAmount) throw new HttpError(400, "This promotion does not apply to this order subtotal.");
  await client.query("UPDATE promotions SET used_count = used_count + 1 WHERE id = $1", [row.id]);
  return { code: row.code, discountAmount };
};

module.exports = { applyPromotion, createPromotion, deletePromotion, listPromotions, updatePromotion, validatePromotion };
