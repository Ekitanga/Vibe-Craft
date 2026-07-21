const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const env = require("../config/env");
const { categories, products } = require("../data/catalog");

const schemaPath = path.join(__dirname, "schema.sql");
const dbPath = path.resolve(env.dbPath);
const resetRequested = process.argv.includes("--reset");

const boolToInt = (value) => (value ? 1 : 0);

const nullableNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return Number(value);
};

const listValue = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const jsonOrNull = (value) => {
  if (!value || Object.keys(value).length === 0) {
    return null;
  }

  return JSON.stringify(value);
};

const makeChildId = (parts) =>
  crypto
    .createHash("sha1")
    .update(parts.filter(Boolean).join(":"))
    .digest("hex");

const runStatement = (db, sql, values = []) => {
  db.prepare(sql).run(...values);
};

const countRows = (db, tableName) => {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();

  return row.count;
};

const seedCategories = (db) => {
  const insertCategory = db.prepare(
    `INSERT INTO categories (id, name, description)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       updated_at = CURRENT_TIMESTAMP`
  );

  categories.forEach((category) => {
    insertCategory.run(category.id, category.name, category.description || null);
  });
};

const seedProductChildren = (db, product) => {
  const specs = product.specs || {};
  const knownSpecKeys = new Set([
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
  ]);
  const extraSpecs = Object.keys(specs).reduce((output, key) => {
    if (!knownSpecKeys.has(key)) {
      output[key] = specs[key];
    }

    return output;
  }, {});

  runStatement(db, "DELETE FROM product_images WHERE product_id = ?", [product.id]);
  runStatement(db, "DELETE FROM product_box_items WHERE product_id = ?", [product.id]);
  runStatement(db, "DELETE FROM product_use_cases WHERE product_id = ?", [product.id]);
  runStatement(db, "DELETE FROM product_reviews WHERE product_id = ?", [product.id]);

  db.prepare(
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(product_id) DO UPDATE SET
      resolution = excluded.resolution,
      brightness = excluded.brightness,
      operating_system = excluded.operating_system,
      connectivity = excluded.connectivity,
      projection_size = excluded.projection_size,
      speaker_audio = excluded.speaker_audio,
      warranty = excluded.warranty,
      throw_ratio = excluded.throw_ratio,
      light_source = excluded.light_source,
      extra_json = excluded.extra_json,
      updated_at = CURRENT_TIMESTAMP`
  ).run(
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
    jsonOrNull(extraSpecs)
  );

  const insertImage = db.prepare(
    `INSERT INTO product_images (id, product_id, url, alt_text, sort_order)
     VALUES (?, ?, ?, ?, ?)`
  );
  listValue(product.images).forEach((url, index) => {
    insertImage.run(makeChildId([product.id, "image", index, url]), product.id, url, product.name, index);
  });

  const insertBoxItem = db.prepare(
    `INSERT INTO product_box_items (id, product_id, label, sort_order)
     VALUES (?, ?, ?, ?)`
  );
  listValue(product.whatsInBox).forEach((label, index) => {
    insertBoxItem.run(makeChildId([product.id, "box", index, label]), product.id, label, index);
  });

  const insertUseCase = db.prepare(
    `INSERT INTO product_use_cases (id, product_id, label, sort_order)
     VALUES (?, ?, ?, ?)`
  );
  listValue(product.idealUseCases).forEach((label, index) => {
    insertUseCase.run(makeChildId([product.id, "use-case", index, label]), product.id, label, index);
  });

  const insertReview = db.prepare(
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  listValue(product.reviews).forEach((review, index) => {
    insertReview.run(
      makeChildId([product.id, "review", index, review.name, review.title]),
      product.id,
      review.name || "Verified customer",
      Math.max(1, Math.min(5, Number(review.rating || 5))),
      review.title || null,
      review.body || null,
      review.date || null,
      index
    );
  });
};

const seedProducts = (db) => {
  const insertProduct = db.prepare(
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
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      slug = excluded.slug,
      name = excluded.name,
      brand = excluded.brand,
      category_id = excluded.category_id,
      price = excluded.price,
      compare_at_price = excluded.compare_at_price,
      currency = excluded.currency,
      stock = excluded.stock,
      featured = excluded.featured,
      description = excluded.description,
      short_summary = excluded.short_summary,
      detailed_description = excluded.detailed_description,
      resolution = excluded.resolution,
      brightness = excluded.brightness,
      ansi_lumens = excluded.ansi_lumens,
      projector_type = excluded.projector_type,
      smart_os = excluded.smart_os,
      wifi = excluded.wifi,
      bluetooth = excluded.bluetooth,
      best_selling_rank = excluded.best_selling_rank,
      updated_at = CURRENT_TIMESTAMP`
  );

  products.forEach((product) => {
    insertProduct.run(
      product.id,
      product.slug,
      product.name,
      product.brand || product.specs?.brand || null,
      product.categoryId,
      Number(product.price || 0),
      nullableNumber(product.compareAtPrice),
      product.currency || "KES",
      Number(product.stock || 0),
      boolToInt(product.featured),
      product.description,
      product.shortSummary || null,
      product.detailedDescription || null,
      product.resolution || product.specs?.resolution || null,
      product.brightness || product.specs?.brightness || null,
      nullableNumber(product.ansiLumens),
      product.projectorType || null,
      boolToInt(product.smartOS),
      boolToInt(product.wifi),
      boolToInt(product.bluetooth),
      Number(product.bestSellingRank || 0),
      product.createdAt || new Date().toISOString()
    );

    seedProductChildren(db, product);
  });
};

const initializeDatabase = () => {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  if (resetRequested && fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const db = new DatabaseSync(dbPath);
  const schema = fs.readFileSync(schemaPath, "utf8");

  try {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(schema);
    db.exec("BEGIN");
    seedCategories(db);
    seedProducts(db);
    db.exec("COMMIT");

    const summary = {
      dbPath,
      categories: countRows(db, "categories"),
      products: countRows(db, "products"),
      productImages: countRows(db, "product_images"),
      productSpecs: countRows(db, "product_specs"),
      productReviews: countRows(db, "product_reviews"),
      orders: countRows(db, "orders"),
    };

    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch (_rollbackError) {
      // Ignore rollback errors when the transaction was not started.
    }

    throw error;
  } finally {
    db.close();
  }
};

initializeDatabase();
