const crypto = require("crypto");
const db = require("../db/postgres");
const HttpError = require("../utils/httpError");
const { findCategoryById } = require("./categoryService");

const toBoolean = (value) => value === true || value === "true" || value === 1;

const nullableNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return Number(value);
};

const listValue = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const buildSlug = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const mapProductRow = (row) => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  brand: row.brand,
  categoryId: row.category_id,
  price: Number(row.price || 0),
  compareAtPrice: row.compare_at_price === null ? null : Number(row.compare_at_price),
  currency: row.currency,
  stock: Number(row.stock || 0),
  featured: Boolean(row.featured),
  description: row.description,
  shortSummary: row.short_summary,
  detailedDescription: row.detailed_description,
  resolution: row.resolution,
  brightness: row.brightness,
  ansiLumens: row.ansi_lumens === null ? null : Number(row.ansi_lumens),
  projectorType: row.projector_type,
  smartOS: Boolean(row.smart_os),
  wifi: Boolean(row.wifi),
  bluetooth: Boolean(row.bluetooth),
  bestSellingRank: Number(row.best_selling_rank || 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  images: [],
  specs: {},
  whatsInBox: [],
  idealUseCases: [],
  reviews: [],
});

const addSpecValue = (target, key, value) => {
  if (value !== undefined && value !== null && value !== "") {
    target[key] = value;
  }
};

const hydrateProducts = async (products) => {
  const ids = products.map((product) => product.id);
  const byId = new Map(
    products.map((product) => {
      return [product.id, product];
    })
  );

  if (!ids.length) {
    return products;
  }

  const [imagesResult, specsResult, boxItemsResult, useCasesResult, reviewsResult] = await Promise.all([
    db.query(
      `SELECT product_id, url
       FROM product_images
       WHERE product_id = ANY($1::text[])
       ORDER BY sort_order ASC, created_at ASC`,
      [ids]
    ),
    db.query(
      `SELECT *
       FROM product_specs
       WHERE product_id = ANY($1::text[])`,
      [ids]
    ),
    db.query(
      `SELECT product_id, label
       FROM product_box_items
       WHERE product_id = ANY($1::text[])
       ORDER BY sort_order ASC`,
      [ids]
    ),
    db.query(
      `SELECT product_id, label
       FROM product_use_cases
       WHERE product_id = ANY($1::text[])
       ORDER BY sort_order ASC`,
      [ids]
    ),
    db.query(
      `SELECT product_id, customer_name, rating, title, body, review_date
       FROM product_reviews
       WHERE product_id = ANY($1::text[])
       ORDER BY sort_order ASC, created_at ASC`,
      [ids]
    ),
  ]);

  imagesResult.rows.forEach((row) => {
    byId.get(row.product_id)?.images.push(row.url);
  });

  specsResult.rows.forEach((row) => {
    const product = byId.get(row.product_id);
    const specs = {};
    const extraSpecs = row.extra_json || {};

    if (!product) {
      return;
    }

    addSpecValue(specs, "brand", product.brand);
    addSpecValue(specs, "resolution", row.resolution);
    addSpecValue(specs, "brightness", row.brightness);
    addSpecValue(specs, "operatingSystem", row.operating_system);
    addSpecValue(specs, "connectivity", row.connectivity);
    addSpecValue(specs, "projectionSize", row.projection_size);
    addSpecValue(specs, "speakerAudio", row.speaker_audio);
    addSpecValue(specs, "warranty", row.warranty);
    addSpecValue(specs, "throwRatio", row.throw_ratio);
    addSpecValue(specs, "lightSource", row.light_source);
    Object.assign(specs, extraSpecs);
    product.specs = specs;
  });

  boxItemsResult.rows.forEach((row) => {
    byId.get(row.product_id)?.whatsInBox.push(row.label);
  });

  useCasesResult.rows.forEach((row) => {
    byId.get(row.product_id)?.idealUseCases.push(row.label);
  });

  reviewsResult.rows.forEach((row) => {
    byId.get(row.product_id)?.reviews.push({
      name: row.customer_name,
      rating: Number(row.rating || 5),
      title: row.title,
      body: row.body,
      date: row.review_date,
    });
  });

  return products;
};

const listProducts = async (filters = {}) => {
  const where = [];
  const params = [];

  if (filters.category) {
    params.push(filters.category);
    where.push(`p.category_id = $${params.length}`);
  }

  if (filters.featured !== undefined) {
    params.push(toBoolean(filters.featured));
    where.push(`p.featured = $${params.length}`);
  }

  if (filters.inStock !== undefined) {
    where.push(toBoolean(filters.inStock) ? "p.stock > 0" : "p.stock <= 0");
  }

  if (filters.search && filters.search.trim()) {
    params.push(`%${filters.search.trim()}%`);
    where.push(
      `(p.name ILIKE $${params.length}
        OR p.description ILIKE $${params.length}
        OR p.brand ILIKE $${params.length}
        OR EXISTS (
          SELECT 1
          FROM product_specs ps
          WHERE ps.product_id = p.id
            AND concat_ws(' ', ps.resolution, ps.brightness, ps.operating_system, ps.connectivity, ps.projection_size, ps.speaker_audio, ps.warranty) ILIKE $${params.length}
        ))`
    );
  }

  const result = await db.query(
    `SELECT p.*
     FROM products p
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY p.created_at DESC, p.name ASC`,
    params
  );
  const products = result.rows.map(mapProductRow);

  return hydrateProducts(products);
};

const getProductById = async (id) => {
  const result = await db.query(
    `SELECT *
     FROM products
     WHERE id = $1`,
    [id]
  );

  if (!result.rows[0]) {
    throw new HttpError(404, "Product not found");
  }

  const products = await hydrateProducts([mapProductRow(result.rows[0])]);

  return products[0];
};

const validateProductPayload = async (payload, options = {}) => {
  const requiredFields = ["name", "categoryId", "price", "currency", "stock", "description"];
  const missingFields = requiredFields.filter((field) => payload[field] === undefined || payload[field] === "");

  if (!options.partial && missingFields.length > 0) {
    throw new HttpError(400, "Missing required product fields", missingFields);
  }

  if (payload.categoryId && !(await findCategoryById(payload.categoryId))) {
    throw new HttpError(400, "Invalid categoryId");
  }

  if (payload.price !== undefined && Number(payload.price) < 0) {
    throw new HttpError(400, "Product price cannot be negative");
  }

  if (payload.stock !== undefined && Number(payload.stock) < 0) {
    throw new HttpError(400, "Product stock cannot be negative");
  }
};

const mergeProductPayload = (product, payload) => {
  const merged = {
    ...product,
    ...payload,
    categoryId: payload.categoryId === undefined ? product.categoryId : payload.categoryId,
    compareAtPrice: payload.compareAtPrice === undefined ? product.compareAtPrice : payload.compareAtPrice,
    shortSummary: payload.shortSummary === undefined ? product.shortSummary : payload.shortSummary,
    detailedDescription:
      payload.detailedDescription === undefined ? product.detailedDescription : payload.detailedDescription,
    ansiLumens: payload.ansiLumens === undefined ? product.ansiLumens : payload.ansiLumens,
    projectorType: payload.projectorType === undefined ? product.projectorType : payload.projectorType,
    smartOS: payload.smartOS === undefined ? product.smartOS : payload.smartOS,
    wifi: payload.wifi === undefined ? product.wifi : payload.wifi,
    bluetooth: payload.bluetooth === undefined ? product.bluetooth : payload.bluetooth,
    images: payload.images === undefined ? product.images : payload.images,
    specs: payload.specs === undefined ? product.specs : payload.specs,
    whatsInBox: payload.whatsInBox === undefined ? product.whatsInBox : payload.whatsInBox,
    idealUseCases: payload.idealUseCases === undefined ? product.idealUseCases : payload.idealUseCases,
    reviews: payload.reviews === undefined ? product.reviews : payload.reviews,
  };

  merged.price = Number(merged.price);
  merged.stock = Number(merged.stock);
  merged.slug = merged.slug || buildSlug(merged.name);
  merged.currency = merged.currency || "KES";

  return merged;
};

const replaceProductChildren = async (client, product) => {
  const specs = product.specs || {};
  const extraSpecs = Object.keys(specs).reduce((output, key) => {
    if (
      ![
        "brand",
        "resolution",
        "brightness",
        "operatingSystem",
        "connectivity",
        "projectionSize",
        "speakerAudio",
        "warranty",
        "throwRatio",
        "lightSource",
      ].includes(key)
    ) {
      output[key] = specs[key];
    }

    return output;
  }, {});

  await client.query("DELETE FROM product_images WHERE product_id = $1", [product.id]);
  await client.query("DELETE FROM product_box_items WHERE product_id = $1", [product.id]);
  await client.query("DELETE FROM product_use_cases WHERE product_id = $1", [product.id]);
  await client.query("DELETE FROM product_reviews WHERE product_id = $1", [product.id]);

  await client.query(
    `INSERT INTO product_specs (
      product_id,
      resolution,
      brightness,
      operating_system,
      connectivity,
      projection_size,
      speaker_audio,
      warranty,
      throw_ratio,
      light_source,
      extra_json
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT(product_id) DO UPDATE SET
      resolution = EXCLUDED.resolution,
      brightness = EXCLUDED.brightness,
      operating_system = EXCLUDED.operating_system,
      connectivity = EXCLUDED.connectivity,
      projection_size = EXCLUDED.projection_size,
      speaker_audio = EXCLUDED.speaker_audio,
      warranty = EXCLUDED.warranty,
      throw_ratio = EXCLUDED.throw_ratio,
      light_source = EXCLUDED.light_source,
      extra_json = EXCLUDED.extra_json`,
    [
      product.id,
      product.resolution || specs.resolution || null,
      product.brightness || specs.brightness || null,
      specs.operatingSystem || null,
      specs.connectivity || null,
      specs.projectionSize || null,
      specs.speakerAudio || null,
      specs.warranty || null,
      specs.throwRatio || null,
      specs.lightSource || null,
      Object.keys(extraSpecs).length ? JSON.stringify(extraSpecs) : null,
    ]
  );

  for (const [index, url] of listValue(product.images).entries()) {
    await client.query(
      `INSERT INTO product_images (id, product_id, url, alt_text, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [crypto.randomUUID(), product.id, url, product.name, index]
    );
  }

  for (const [index, label] of listValue(product.whatsInBox).entries()) {
    await client.query(
      `INSERT INTO product_box_items (id, product_id, label, sort_order)
       VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), product.id, label, index]
    );
  }

  for (const [index, label] of listValue(product.idealUseCases).entries()) {
    await client.query(
      `INSERT INTO product_use_cases (id, product_id, label, sort_order)
       VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), product.id, label, index]
    );
  }

  for (const [index, review] of listValue(product.reviews).entries()) {
    await client.query(
      `INSERT INTO product_reviews (
        id,
        product_id,
        customer_name,
        rating,
        title,
        body,
        review_date,
        sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        crypto.randomUUID(),
        product.id,
        review.name || "Verified customer",
        Math.max(1, Math.min(5, Number(review.rating || 5))),
        review.title || null,
        review.body || null,
        review.date || null,
        index,
      ]
    );
  }
};

const upsertProduct = async (client, product) => {
  await client.query(
    `INSERT INTO products (
      id,
      slug,
      name,
      brand,
      category_id,
      price,
      compare_at_price,
      currency,
      stock,
      featured,
      description,
      short_summary,
      detailed_description,
      resolution,
      brightness,
      ansi_lumens,
      projector_type,
      smart_os,
      wifi,
      bluetooth,
      best_selling_rank,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
    ON CONFLICT(id) DO UPDATE SET
      slug = EXCLUDED.slug,
      name = EXCLUDED.name,
      brand = EXCLUDED.brand,
      category_id = EXCLUDED.category_id,
      price = EXCLUDED.price,
      compare_at_price = EXCLUDED.compare_at_price,
      currency = EXCLUDED.currency,
      stock = EXCLUDED.stock,
      featured = EXCLUDED.featured,
      description = EXCLUDED.description,
      short_summary = EXCLUDED.short_summary,
      detailed_description = EXCLUDED.detailed_description,
      resolution = EXCLUDED.resolution,
      brightness = EXCLUDED.brightness,
      ansi_lumens = EXCLUDED.ansi_lumens,
      projector_type = EXCLUDED.projector_type,
      smart_os = EXCLUDED.smart_os,
      wifi = EXCLUDED.wifi,
      bluetooth = EXCLUDED.bluetooth,
      best_selling_rank = EXCLUDED.best_selling_rank`,
    [
      product.id,
      product.slug,
      product.name,
      product.brand || product.specs?.brand || null,
      product.categoryId,
      Number(product.price || 0),
      nullableNumber(product.compareAtPrice),
      product.currency || "KES",
      Number(product.stock || 0),
      toBoolean(product.featured),
      product.description,
      product.shortSummary || null,
      product.detailedDescription || null,
      product.resolution || product.specs?.resolution || null,
      product.brightness || product.specs?.brightness || null,
      nullableNumber(product.ansiLumens),
      product.projectorType || null,
      toBoolean(product.smartOS),
      toBoolean(product.wifi),
      toBoolean(product.bluetooth),
      Number(product.bestSellingRank || 0),
      product.createdAt || new Date().toISOString(),
    ]
  );

  await replaceProductChildren(client, product);
};

const createProduct = async (payload) => {
  await validateProductPayload(payload);

  const product = mergeProductPayload(
    {
      id: crypto.randomUUID(),
      slug: payload.slug || buildSlug(payload.name),
      brand: null,
      compareAtPrice: null,
      featured: false,
      images: [],
      specs: {},
      whatsInBox: [],
      idealUseCases: [],
      reviews: [],
      smartOS: false,
      wifi: false,
      bluetooth: false,
      bestSellingRank: 0,
      createdAt: new Date().toISOString(),
    },
    payload
  );

  await db.withTransaction(async (client) => {
    await upsertProduct(client, product);
  });

  return getProductById(product.id);
};

const updateProduct = async (id, payload) => {
  await validateProductPayload(payload, { partial: true });

  const product = await getProductById(id);
  const updatedProduct = mergeProductPayload(product, payload);

  await db.withTransaction(async (client) => {
    await upsertProduct(client, updatedProduct);
  });

  return getProductById(id);
};

const deleteProduct = async (id) => {
  await getProductById(id);
  await db.query("DELETE FROM products WHERE id = $1", [id]);
};

module.exports = {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
