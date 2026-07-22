const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("./postgres");
const env = require("../config/env");
const { categories, products } = require("../data/catalog");

const schemaPath = path.join(__dirname, "postgres-schema.sql");
const resetRequested = process.argv.includes("--reset");

const toBoolean = (value) => value === true || value === "true" || value === 1;

const nullableNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return Number(value);
};

const listValue = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const makeChildId = (parts) =>
  crypto
    .createHash("sha1")
    .update(parts.filter(Boolean).join(":"))
    .digest("hex");

const seedCategories = async (client) => {
  for (const category of categories) {
    await client.query(
      `INSERT INTO categories (id, name, description)
       VALUES ($1, $2, $3)
       ON CONFLICT(id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description`,
      [category.id, category.name, category.description || null]
    );
  }
};

const seedProductChildren = async (client, product) => {
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
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(id) DO UPDATE SET
         url = EXCLUDED.url,
         alt_text = EXCLUDED.alt_text,
         sort_order = EXCLUDED.sort_order`,
      [makeChildId([product.id, "image", index, url]), product.id, url, product.name, index]
    );
  }

  for (const [index, label] of listValue(product.whatsInBox).entries()) {
    await client.query(
      `INSERT INTO product_box_items (id, product_id, label, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(id) DO UPDATE SET
         label = EXCLUDED.label,
         sort_order = EXCLUDED.sort_order`,
      [makeChildId([product.id, "box", index, label]), product.id, label, index]
    );
  }

  for (const [index, label] of listValue(product.idealUseCases).entries()) {
    await client.query(
      `INSERT INTO product_use_cases (id, product_id, label, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(id) DO UPDATE SET
         label = EXCLUDED.label,
         sort_order = EXCLUDED.sort_order`,
      [makeChildId([product.id, "use-case", index, label]), product.id, label, index]
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT(id) DO UPDATE SET
        customer_name = EXCLUDED.customer_name,
        rating = EXCLUDED.rating,
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        review_date = EXCLUDED.review_date,
        sort_order = EXCLUDED.sort_order`,
      [
        makeChildId([product.id, "review", index, review.name, review.title]),
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

const seedProducts = async (client) => {
  for (const product of products) {
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

    await seedProductChildren(client, product);
  }
};

const countRows = async (tableName) => {
  const result = await db.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);

  return result.rows[0].count;
};

const initializePostgres = async () => {
  const schema = fs.readFileSync(schemaPath, "utf8");

  await db.query(schema);
  await db.query("ALTER TABLE customer_accounts ADD COLUMN IF NOT EXISTS profile_image_url TEXT");

  await db.withTransaction(async (client) => {
    if (resetRequested) {
      await client.query(
        `TRUNCATE
          admin_sessions,
          admin_users,
          customer_sessions,
          customer_accounts,
          inquiry_answers,
          order_recommendations,
          order_items,
          orders,
          customers,
          product_reviews,
          product_use_cases,
          product_box_items,
          product_images,
          product_specs,
          products,
          categories
        CASCADE`
      );
    }

    await seedCategories(client);
    await seedProducts(client);
  });

  const summary = {
    database: env.pgDatabase,
    host: env.databaseUrl ? "DATABASE_URL" : env.pgHost,
    categories: await countRows("categories"),
    products: await countRows("products"),
    productImages: await countRows("product_images"),
    productSpecs: await countRows("product_specs"),
    productReviews: await countRows("product_reviews"),
    orders: await countRows("orders"),
  };

  console.log(JSON.stringify(summary, null, 2));
  await db.pool.end();
};

initializePostgres().catch(async (error) => {
  console.error(error);
  await db.pool.end();
  process.exit(1);
});
