const crypto = require("crypto");
const db = require("../db/postgres");
const HttpError = require("../utils/httpError");
const { deliveryFees: DEFAULT_DELIVERY_FEES } = require("../config/deliveryFees");

const DEFAULT_SETTINGS = {
  storeName: "Vibecraft",
  tagline: "Big picture energy, made practical.",
  heroTitle: "See more in every room.",
  heroDescription: "Thoughtful projector setups for movie nights, big ideas, and shared moments.",
  phone: "0707 472897",
  whatsapp: "0707 472897",
  contactEmail: "",
  paybill: "522533",
  mpesaAccount: "8055906",
  address: "Rasumal House, 4th floor, Shop 14",
  openingHours: "Monday to Saturday: 8:00 AM – 7:00 PM",
  announcement: "",
  primaryColor: "#cc3355",
  accentColor: "#ffd2d5",
  lowStockThreshold: 5,
  deliveryFees: { ...DEFAULT_DELIVERY_FEES },
  deliveryAvailability: Object.keys(DEFAULT_DELIVERY_FEES).reduce((result, county) => {
    result[county] = true;
    return result;
  }, {}),
  socialLinks: {
    instagram: "https://www.instagram.com/vibecraft254?igsh=MTRsNHB5ZTM2dDgxOQ==",
    tiktok: "https://www.tiktok.com/@vibecraft254?_r=1&_t=ZS-98E36EYoUz7",
    facebook: "",
    youtube: "",
  },
  freeDeliveryMinimum: 0,
};

const toSettings = (row) => ({
  storeName: row.store_name,
  tagline: row.tagline,
  heroTitle: row.hero_title,
  heroDescription: row.hero_description,
  phone: row.phone,
  whatsapp: row.whatsapp,
  contactEmail: row.contact_email || "",
  paybill: row.paybill,
  mpesaAccount: row.mpesa_account,
  address: row.address,
  openingHours: row.opening_hours,
  announcement: row.announcement,
  primaryColor: row.primary_color,
  accentColor: row.accent_color,
  lowStockThreshold: row.low_stock_threshold,
  deliveryFees: row.delivery_fees && Object.keys(row.delivery_fees).length ? row.delivery_fees : { ...DEFAULT_DELIVERY_FEES },
  deliveryAvailability: row.delivery_availability && Object.keys(row.delivery_availability).length
    ? row.delivery_availability
    : Object.keys(row.delivery_fees && Object.keys(row.delivery_fees).length ? row.delivery_fees : DEFAULT_DELIVERY_FEES).reduce((result, county) => {
      result[county] = true;
      return result;
    }, {}),
  socialLinks: row.social_links && typeof row.social_links === "object" && Object.keys(row.social_links).length
    ? row.social_links
    : { ...DEFAULT_SETTINGS.socialLinks },
  freeDeliveryMinimum: Number(row.free_delivery_minimum || 0),
});

const getSettings = async () => {
  const result = await db.query("SELECT * FROM site_settings WHERE id = 1");
  return result.rows[0] ? toSettings(result.rows[0]) : { ...DEFAULT_SETTINGS };
};

const getConfiguredDeliveryFee = async (county, subtotal) => {
  const settings = await getSettings();
  if (Number(settings.freeDeliveryMinimum) > 0 && Number(subtotal || 0) >= Number(settings.freeDeliveryMinimum)) return 0;
  if (settings.deliveryAvailability[String(county || "").trim()] === false) return 0;
  return Number(settings.deliveryFees[String(county || "").trim()] || 0);
};

const isDeliveryCountyAvailable = async (county) => {
  const settings = await getSettings();
  const name = String(county || "").trim();
  return Boolean(settings.deliveryFees[name]) || settings.deliveryFees[name] === 0
    ? settings.deliveryAvailability[name] !== false
    : false;
};

const cleanText = (value, fallback, maxLength) => {
  const text = String(value === undefined || value === null ? fallback : value).trim();
  if (text.length > maxLength) throw new HttpError(400, `Setting is too long (maximum ${maxLength} characters).`);
  return text;
};

const cleanEmail = (value, fallback) => {
  const email = cleanText(value, fallback || "", 254);
  if (email && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email)) throw new HttpError(400, "Contact email must be a valid email address.");
  return email;
};

const cleanColor = (value, fallback) => {
  const color = cleanText(value, fallback, 7);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new HttpError(400, "Colours must be six-digit hex values, like #cc3355.");
  return color;
};

const cleanDeliveryFees = (value, fallback) => {
  const input = value === undefined || value === null ? fallback : value;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "Delivery fees must be a county-to-amount map.");
  return Object.entries(input).reduce((fees, [county, amount]) => {
    const name = String(county).trim();
    const fee = Number(amount);
    if (!name || name.length > 60 || !Number.isInteger(fee) || fee < 0 || fee > 100000) {
      throw new HttpError(400, "Delivery fees must use valid county names and whole amounts from 0 to 100,000.");
    }
    fees[name] = fee;
    return fees;
  }, {});
};

const cleanDeliveryAvailability = (value, fallback, deliveryFees) => {
  const input = value === undefined || value === null ? fallback : value;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "Delivery availability must be a county-to-status map.");
  return Object.keys(deliveryFees).reduce((availability, county) => {
    if (input[county] !== undefined && typeof input[county] !== "boolean") {
      throw new HttpError(400, "Delivery availability values must be true or false.");
    }
    availability[county] = input[county] !== false;
    return availability;
  }, {});
};

const cleanSocialLinks = (value, fallback) => {
  const input = value === undefined || value === null ? fallback : value;
  const safeFallback = fallback && typeof fallback === "object" ? fallback : {};
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "Social links must be a link map.");
  return ["instagram", "tiktok", "facebook", "youtube"].reduce((links, key) => {
    const link = cleanText(input[key], safeFallback[key] || "", 300);
    if (link && !/^https?:\/\//i.test(link)) throw new HttpError(400, "Social links must start with http:// or https://.");
    links[key] = link;
    return links;
  }, {});
};

const updateSettings = async (input = {}, adminId) => {
  const current = await getSettings();
  const threshold = input.lowStockThreshold === undefined || input.lowStockThreshold === ""
    ? current.lowStockThreshold
    : Number(input.lowStockThreshold);

  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) {
    throw new HttpError(400, "Low-stock threshold must be a whole number from 0 to 100.");
  }

  const deliveryFees = cleanDeliveryFees(input.deliveryFees, current.deliveryFees);
  const values = {
    storeName: cleanText(input.storeName, current.storeName, 80),
    tagline: cleanText(input.tagline, current.tagline, 160),
    heroTitle: cleanText(input.heroTitle, current.heroTitle, 120),
    heroDescription: cleanText(input.heroDescription, current.heroDescription, 240),
    phone: cleanText(input.phone, current.phone, 40),
    whatsapp: cleanText(input.whatsapp, current.whatsapp, 40),
    contactEmail: cleanEmail(input.contactEmail, current.contactEmail),
    paybill: cleanText(input.paybill, current.paybill, 40),
    mpesaAccount: cleanText(input.mpesaAccount, current.mpesaAccount, 60),
    address: cleanText(input.address, current.address, 180),
    openingHours: cleanText(input.openingHours, current.openingHours, 180),
    announcement: cleanText(input.announcement, current.announcement, 180),
    primaryColor: cleanColor(input.primaryColor, current.primaryColor),
    accentColor: cleanColor(input.accentColor, current.accentColor),
    lowStockThreshold: threshold,
    deliveryFees,
    deliveryAvailability: cleanDeliveryAvailability(input.deliveryAvailability, current.deliveryAvailability, deliveryFees),
    socialLinks: cleanSocialLinks(input.socialLinks, current.socialLinks),
    freeDeliveryMinimum: input.freeDeliveryMinimum === undefined || input.freeDeliveryMinimum === ""
      ? current.freeDeliveryMinimum
      : Number(input.freeDeliveryMinimum),
  };

  if (!Number.isInteger(values.freeDeliveryMinimum) || values.freeDeliveryMinimum < 0 || values.freeDeliveryMinimum > 10000000) {
    throw new HttpError(400, "Free-delivery minimum must be a whole amount from 0 to 10,000,000.");
  }

  return db.withTransaction(async (client) => {
    const currentResult = await client.query("SELECT * FROM site_settings WHERE id = 1 FOR UPDATE");
    const currentRow = currentResult.rows[0];
    if (!currentRow) throw new HttpError(500, "Store settings have not been initialized.");

    await client.query(
      "INSERT INTO site_settings_history (id, settings, changed_by) VALUES ($1, $2::jsonb, $3)",
      [crypto.randomUUID(), JSON.stringify(toSettings(currentRow)), adminId || null]
    );

    const result = await client.query(
      `UPDATE site_settings SET
        store_name = $1, tagline = $2, hero_title = $3, hero_description = $4,
        phone = $5, whatsapp = $6, paybill = $7, mpesa_account = $8,
        address = $9, opening_hours = $10, announcement = $11,
        primary_color = $12, accent_color = $13, low_stock_threshold = $14,
        delivery_fees = $15, delivery_availability = $16, social_links = $17, free_delivery_minimum = $18,
        contact_email = $19
       WHERE id = 1
       RETURNING *`,
      [values.storeName, values.tagline, values.heroTitle, values.heroDescription, values.phone, values.whatsapp,
        values.paybill, values.mpesaAccount, values.address, values.openingHours, values.announcement,
        values.primaryColor, values.accentColor, values.lowStockThreshold, JSON.stringify(values.deliveryFees), JSON.stringify(values.deliveryAvailability), JSON.stringify(values.socialLinks), values.freeDeliveryMinimum, values.contactEmail]
    );

    return toSettings(result.rows[0]);
  });
};

const getPreviousSettings = async () => {
  const result = await db.query("SELECT settings FROM site_settings_history ORDER BY created_at DESC LIMIT 1");
  return result.rows[0] ? result.rows[0].settings : null;
};

const resetPreviousSettings = async (adminId) => db.withTransaction(async (client) => {
  const currentResult = await client.query("SELECT * FROM site_settings WHERE id = 1 FOR UPDATE");
  const previousResult = await client.query("SELECT settings FROM site_settings_history ORDER BY created_at DESC LIMIT 1");
  const currentRow = currentResult.rows[0];
  const previous = previousResult.rows[0] && previousResult.rows[0].settings;

  if (!currentRow) throw new HttpError(500, "Store settings have not been initialized.");
  if (!previous) throw new HttpError(400, "There is no previous settings version to restore.");

  await client.query(
    "INSERT INTO site_settings_history (id, settings, changed_by) VALUES ($1, $2::jsonb, $3)",
    [crypto.randomUUID(), JSON.stringify(toSettings(currentRow)), adminId || null]
  );

  const result = await client.query(
    `UPDATE site_settings SET
      store_name = $1, tagline = $2, hero_title = $3, hero_description = $4,
      phone = $5, whatsapp = $6, paybill = $7, mpesa_account = $8,
      address = $9, opening_hours = $10, announcement = $11,
      primary_color = $12, accent_color = $13, low_stock_threshold = $14,
      delivery_fees = $15, delivery_availability = $16, social_links = $17, free_delivery_minimum = $18,
      contact_email = $19
     WHERE id = 1
     RETURNING *`,
    [previous.storeName, previous.tagline, previous.heroTitle, previous.heroDescription, previous.phone, previous.whatsapp,
      previous.paybill, previous.mpesaAccount, previous.address, previous.openingHours, previous.announcement,
      previous.primaryColor, previous.accentColor, previous.lowStockThreshold, JSON.stringify(previous.deliveryFees || {}), JSON.stringify(previous.deliveryAvailability || {}), JSON.stringify(previous.socialLinks || DEFAULT_SETTINGS.socialLinks), previous.freeDeliveryMinimum || 0, previous.contactEmail || ""]
  );

  return toSettings(result.rows[0]);
});

module.exports = { DEFAULT_SETTINGS, getConfiguredDeliveryFee, getPreviousSettings, getSettings, isDeliveryCountyAvailable, resetPreviousSettings, updateSettings };
