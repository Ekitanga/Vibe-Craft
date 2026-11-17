const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");

test.before(async () => {
  await h.start();
  await h.db.query("UPDATE products SET slug = 'cinema-pro' WHERE id = 'p1'");
  await h.db.query(
    `INSERT INTO product_specs (product_id, resolution, extra_json) VALUES ('p1', '1080p', $1::jsonb)
     ON CONFLICT (product_id) DO UPDATE SET extra_json = EXCLUDED.extra_json`,
    [JSON.stringify({ sourceUrl: "https://old.example/p", sourceProductId: 42 })]
  );
});
test.after(h.stop);

test("product pages live at /products/<slug> with a canonical address", async () => {
  const page = await h.client().get("/products/cinema-pro");
  assert.equal(page.status, 200);
  assert.match(page.text, /<base href="\/">/);
  assert.match(page.text, /<link rel="canonical" href="[^"]*\/products\/cinema-pro"/);
  assert.match(page.text, /og:title" content="Cinema Pro/);
  assert.equal((await h.client().get("/products/no-such-thing")).status, 404);
});

test("old and id-based product links redirect permanently, keeping ad parameters", async () => {
  const old = await h.client().get("/product?id=p1&utm_source=facebook&fbclid=abc");
  assert.equal(old.status, 301);
  assert.equal(old.headers.get("location"), "/products/cinema-pro?utm_source=facebook&fbclid=abc");
  const byId = await h.client().get("/products/p1");
  assert.equal(byId.status, 301);
  assert.equal(byId.headers.get("location"), "/products/cinema-pro");
  assert.equal((await h.client().get("/product.html?id=p1")).status, 301);
  assert.equal((await h.client().get("/product")).headers.get("location"), "/shop");
});

test("home page sections have their own addresses", async () => {
  for (const path of ["/about", "/contact", "/shop"]) {
    const page = await h.client().get(path);
    assert.equal(page.status, 200, path);
    assert.match(page.text, /id="collection"/);
  }
});

test("the product API accepts the slug and hides import bookkeeping", async () => {
  const bySlug = await h.client().get("/api/products/cinema-pro");
  assert.equal(bySlug.status, 200);
  assert.equal(bySlug.json.data.id, "p1");
  const internal = await require("../src/services/productService").getProductById("p1");
  assert.equal(internal.specs.sourceUrl, "https://old.example/p", "the admin side still has it");
  const list = await h.client().get("/api/products");
  list.json.data.forEach((product) => {
    assert.equal(product.specs.sourceUrl, undefined);
    assert.equal(product.specs.sourceProductId, undefined);
  });
});

test("feeds and the sitemap use the clean product address", async () => {
  assert.match((await h.client().get("/feeds/meta-catalog.xml")).text, /<g:link>[^<]*\/products\/cinema-pro<\/g:link>/);
  assert.match((await h.client().get("/sitemap.xml")).text, /\/products\/cinema-pro</);
});
