// Product catalog feed for Meta Commerce Manager (Advantage+ catalog ads, dynamic
// retargeting, Facebook & Instagram Shops). Product IDs match the content_ids sent by
// the Pixel and Conversions API, which is what lets Meta connect ads to products.
const productService = require("./productService");
const categoryService = require("./categoryService");
const { absoluteUrl } = require("./publicUrl");

const xmlEscape = (value) =>
  String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Strip characters that are illegal in XML 1.0.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const csvEscape = (value) => {
  const text = String(value === undefined || value === null ? "" : value).replace(/\r?\n/g, " ");
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const money = (amount, currency) => `${Number(amount || 0).toFixed(2)} ${currency || "KES"}`;

const isVideo = (url) => /\/video\/upload\//.test(url) || /\.(mp4|webm|mov)(\?|$)/i.test(url);

const buildItems = async (baseUrl) => {
  const [products, categories] = await Promise.all([productService.listProducts(), categoryService.listCategories()]);
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  return products
    .map((product) => {
      const images = (product.images || []).filter((url) => !isVideo(url)).map((url) => absoluteUrl(baseUrl, url)).filter(Boolean);
      const onSale = product.compareAtPrice && Number(product.compareAtPrice) > Number(product.price);
      const description = String(product.shortSummary || product.description || product.name).replace(/\s+/g, " ").trim().slice(0, 5000);
      return {
        id: product.id,
        title: String(product.name).slice(0, 200),
        description: description || product.name,
        availability: product.stock > 0 ? "in stock" : "out of stock",
        condition: "new",
        price: money(onSale ? product.compareAtPrice : product.price, product.currency),
        sale_price: onSale ? money(product.price, product.currency) : "",
        link: `${baseUrl}/product?id=${encodeURIComponent(product.id)}`,
        image_link: images[0] || "",
        additional_image_link: images.slice(1, 10).join(","),
        brand: product.brand || (product.specs && product.specs.brand) || "Vibecraft",
        product_type: categoryNames.get(product.categoryId) || "",
        quantity_to_sell_on_facebook: Math.max(0, Number(product.stock || 0)),
      };
    })
    // Meta rejects items without an image; skip them rather than fail the whole feed.
    .filter((item) => item.image_link);
};

const FIELDS = [
  "id", "title", "description", "availability", "condition", "price", "sale_price", "link", "image_link",
  "additional_image_link", "brand", "product_type", "quantity_to_sell_on_facebook",
];

const toXml = (items, { storeName, baseUrl }) => {
  const entries = items
    .map((item) => {
      const fields = FIELDS.filter((field) => item[field] !== "" && item[field] !== undefined)
        .map((field) => `      <g:${field}>${xmlEscape(item[field])}</g:${field}>`)
        .join("\n");
      return `    <item>\n${fields}\n    </item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xmlEscape(storeName)}</title>
    <link>${xmlEscape(baseUrl)}</link>
    <description>${xmlEscape(storeName)} product catalog</description>
${entries}
  </channel>
</rss>
`;
};

const toCsv = (items) =>
  [FIELDS.join(","), ...items.map((item) => FIELDS.map((field) => csvEscape(item[field])).join(","))].join("\n") + "\n";

module.exports = { buildItems, toCsv, toXml, xmlEscape };
