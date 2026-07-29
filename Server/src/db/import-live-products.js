const crypto = require("crypto");
const db = require("./postgres");

const STORE_API = "https://vibecraft254.com/wp-json/wc/store/v1/products?per_page=100";
const POSTS_API = "https://vibecraft254.com/wp-json/wp/v2/product?per_page=100";

const CATEGORY_DEFINITIONS = {
  projectors: {
    name: "Projectors",
    description: "Projectors for home cinema, gaming, presentations, and events.",
  },
  "mini-projectors": {
    name: "Mini Projectors",
    description: "Compact, portable projectors for travel, dorms, and casual movie nights.",
  },
  "projector-stands": {
    name: "Projector Stands",
    description: "Tripods, mounts, and stands to set your projector up anywhere.",
  },
  screens: {
    name: "Projector Screens",
    description: "Tripod, wall-mounted, and portable projector screens.",
  },
  "uhd-projectors": {
    name: "UHD Projectors",
    description: "4K and Ultra HD projectors for the sharpest, most detailed picture.",
  },
  "laser-projectors": {
    name: "Laser Projectors",
    description: "Laser light source projectors for brighter rooms and longer lamp-free life.",
  },
};

const categoryIdFor = (categories) => {
  const names = (categories || []).map((category) => category.name);
  const preferred = names.find((name) => name !== "Projectors");
  if (preferred === "Projector Screens") return "screens";
  if (preferred === "Projector Stands") return "projector-stands";
  if (preferred === "Mini Projectors") return "mini-projectors";
  if (preferred === "UHD Projectors") return "uhd-projectors";
  if (preferred === "Laser Projectors") return "laser-projectors";
  return "projectors";
};

const decodeEntities = (value) =>
  String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&times;/gi, "×")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));

const htmlToText = (html) =>
  decodeEntities(String(html || "")
    .replace(/<\s*(br|\/p|\/li|\/tr|\/div|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, ""))
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();

const firstMatch = (text, pattern) => {
  const match = String(text || "").match(pattern);
  return match ? match[1].trim() : null;
};

const makeSpecs = (text) => {
  const resolution = firstMatch(text, /(?:native|physical|supported|output)\s+resolution\s*[:\-]?\s*([^\n]+)/i)
    || firstMatch(text, /(\b(?:4k|1080p|720p|1920x1080p|1280\*720p)\b[^\n]*)/i);
  const brightness = firstMatch(text, /((?:\d+[\s-]*)?\d+\s*ansi\s*lumens?)/i);
  const operatingSystem = firstMatch(text, /(?:operating|operation)\s+system\s*[:\-]?\s*([^\n]+)/i)
    || firstMatch(text, /\bos\s*[:\-]\s*([^\n]+)/i);
  const projectionSize = firstMatch(text, /(?:projection\s+size|projection\s+area)\s*[:\-]?\s*([^\n]+)/i);
  const throwRatio = firstMatch(text, /(\d+(?:\.\d+)?\s*:\s*1)/i);
  const specs = {};

  if (resolution) specs.resolution = resolution;
  if (brightness) specs.brightness = brightness;
  if (operatingSystem) specs.operatingSystem = operatingSystem;
  if (projectionSize) specs.projectionSize = projectionSize;
  if (throwRatio) specs.throwRatio = throwRatio;
  if (/wi-?fi/i.test(text)) specs.connectivity = "Wi-Fi";
  if (/bluetooth/i.test(text)) specs.connectivity = specs.connectivity ? `${specs.connectivity}, Bluetooth` : "Bluetooth";
  if (/speaker/i.test(text)) specs.speakerAudio = "Built-in speaker";
  if (/warranty/i.test(text)) specs.warranty = firstMatch(text, /warranty\s*[:\-]?\s*([^\n]+)/i) || "See source listing";

  return specs;
};

const toProduct = (source, post) => {
  const plainDescription = htmlToText(source.description) || source.name;
  const categoryId = categoryIdFor(source.categories);
  const isScreen = categoryId === "screens";
  const isStand = categoryId === "projector-stands";
  const currentPrice = Math.round(Number(source.prices.price) / 100);
  const regularPrice = Math.round(Number(source.prices.regular_price) / 100);
  const brightnessText = firstMatch(plainDescription, /((?:\d+[\s-]*)?\d+\s*ansi\s*lumens?)/i);
  const ansiLumens = brightnessText ? Number(brightnessText.replace(/[^0-9]/g, "")) : null;

  return {
    id: `live-${source.id}`,
    slug: source.slug,
    name: source.name,
    brand: null,
    categoryId,
    price: currentPrice,
    compareAtPrice: regularPrice !== currentPrice ? regularPrice : null,
    currency: source.prices.currency_code || "KES",
    // The source exposes stock status but not a quantity. Ten keeps the item visibly in stock
    // without creating a misleading "1 left" message in the storefront.
    stock: source.is_in_stock ? 10 : 0,
    featured: false,
    description: plainDescription,
    shortSummary: plainDescription.split("\n")[0].slice(0, 240),
    detailedDescription: source.description || null,
    resolution: firstMatch(plainDescription, /(\b(?:4k|1080p|720p|1920x1080p|1280\*720p)\b[^\n]*)/i),
    brightness: brightnessText,
    ansiLumens,
    projectorType: isScreen ? "screen" : isStand ? "stand" : "portable",
    smartOS: /android|smart projector|smart mini/i.test(`${source.name} ${plainDescription}`),
    wifi: /wi-?fi/i.test(plainDescription),
    bluetooth: /bluetooth/i.test(plainDescription),
    bestSellingRank: 0,
    createdAt: post?.date_gmt ? new Date(`${post.date_gmt}Z`).toISOString() : new Date().toISOString(),
    images: (source.images || []).map((image) => image.src).filter(Boolean),
    specs: makeSpecs(plainDescription),
    whatsInBox: [],
    idealUseCases: [],
    reviews: [],
    sourceProductId: source.id,
    sourceUrl: source.permalink,
  };
};

const upsertProduct = async (client, product) => {
  await client.query(
    `INSERT INTO products (
      id, slug, name, brand, category_id, price, compare_at_price, currency, stock,
      featured, description, short_summary, detailed_description, resolution, brightness,
      ansi_lumens, projector_type, smart_os, wifi, bluetooth, best_selling_rank, created_at
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
      description = EXCLUDED.description,
      short_summary = EXCLUDED.short_summary,
      detailed_description = EXCLUDED.detailed_description,
      resolution = EXCLUDED.resolution,
      brightness = EXCLUDED.brightness,
      ansi_lumens = EXCLUDED.ansi_lumens,
      projector_type = EXCLUDED.projector_type,
      smart_os = EXCLUDED.smart_os,
      wifi = EXCLUDED.wifi,
      bluetooth = EXCLUDED.bluetooth`,
    [
      product.id,
      product.slug,
      product.name,
      product.brand,
      product.categoryId,
      product.price,
      product.compareAtPrice,
      product.currency,
      product.stock,
      product.featured,
      product.description,
      product.shortSummary,
      product.detailedDescription,
      product.resolution,
      product.brightness,
      product.ansiLumens,
      product.projectorType,
      product.smartOS,
      product.wifi,
      product.bluetooth,
      product.bestSellingRank,
      product.createdAt,
    ]
  );

  await client.query("DELETE FROM product_images WHERE product_id = $1", [product.id]);
  await client.query("DELETE FROM product_specs WHERE product_id = $1", [product.id]);
  await client.query("DELETE FROM product_box_items WHERE product_id = $1", [product.id]);
  await client.query("DELETE FROM product_use_cases WHERE product_id = $1", [product.id]);
  await client.query("DELETE FROM product_reviews WHERE product_id = $1", [product.id]);

  const specs = product.specs || {};
  const knownSpecs = [
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
  ];
  const extraSpecs = Object.fromEntries(Object.entries(specs).filter(([key]) => !knownSpecs.includes(key)));

  await client.query(
    `INSERT INTO product_specs (
      product_id, resolution, brightness, operating_system, connectivity, projection_size,
      speaker_audio, warranty, throw_ratio, light_source, extra_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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
      JSON.stringify({ ...extraSpecs, sourceProductId: product.sourceProductId, sourceUrl: product.sourceUrl }),
    ]
  );

  for (const [index, url] of product.images.entries()) {
    await client.query(
      `INSERT INTO product_images (id, product_id, url, alt_text, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [crypto.randomUUID(), product.id, url, product.name, index]
    );
  }
};

const main = async () => {
  const [storeResponse, postsResponse] = await Promise.all([fetch(STORE_API), fetch(POSTS_API)]);
  if (!storeResponse.ok || !postsResponse.ok) {
    throw new Error(`Could not read the live catalog: ${storeResponse.status}/${postsResponse.status}`);
  }

  const sources = await storeResponse.json();
  const posts = await postsResponse.json();
  const postsById = new Map(posts.map((post) => [post.id, post]));
  const products = sources.map((source) => toProduct(source, postsById.get(source.id)));

  await db.withTransaction(async (client) => {
    for (const [id, category] of Object.entries(CATEGORY_DEFINITIONS)) {
      await client.query(
        `INSERT INTO categories (id, name, description)
         VALUES ($1, $2, $3)
         ON CONFLICT(id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`,
        [id, category.name, category.description]
      );
    }

    for (const product of products) {
      await upsertProduct(client, product);
    }
  });

  const result = await db.query(
    `SELECT p.id, p.name, p.price, p.compare_at_price, p.stock, c.name AS category
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.id LIKE 'live-%'
     ORDER BY p.created_at ASC, p.id ASC`
  );
  console.log(JSON.stringify({ imported: result.rowCount, products: result.rows }, null, 2));
  await db.pool.end();
};

main().catch(async (error) => {
  console.error(error);
  await db.pool.end();
  process.exit(1);
});
