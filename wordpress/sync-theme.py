"""Copies the approved storefront (Client/) into the WordPress theme, unchanged in look,
with the few adjustments WordPress needs. Run after changing anything in Client/:

    python wordpress/sync-theme.py

Each adjustment checks that its target text still exists, so a changed storefront file
fails loudly here instead of silently breaking the theme.
"""
import io
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIENT = os.path.join(ROOT, "Client")
THEME = os.path.join(ROOT, "wordpress", "theme", "vibecraft")
THEME_SRC = os.path.join(ROOT, "wordpress", "theme-src")

PAGES = ["index.html", "product.html", "cart.html", "account.html", "login.html", "signup.html", "find-your-setup.html"]
SKIP_JS = {"meta-pixel.js"}  # replaced by vc-meta.js (Meta's plugin loads the Pixel)


def read(path):
    with io.open(path, encoding="utf-8", newline="") as handle:
        return handle.read().replace("\r\n", "\n")


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text.replace("\r\n", "\n"))


def patch(name, text, old, new, count=1):
    found = text.count(old)
    if found != count:
        sys.exit(f"sync-theme: {name}: expected {count} match(es) for {old[:60]!r}, found {found}")
    return text.replace(old, new)


def js_assets(text):
    # Inside single-quoted HTML strings: src="assets/…"  →  src="' + VC_THEME_URL + 'assets/…
    text = text.replace('src="assets/', "src=\"' + window.VC_THEME_URL + 'assets/")
    # Plain string literals: "assets/…"  →  window.VC_THEME_URL + "assets/…"
    return re.sub(r'(?<![\w=])"assets/', 'window.VC_THEME_URL + "assets/', text)


JS_PATCHES = {
    "api.js": [
        (
            """    if (opts.body !== undefined) {
      fetchOptions.headers = { "Content-Type": "application/json" };
      fetchOptions.body = JSON.stringify(opts.body);
    }""",
            """    fetchOptions.headers = {};
    // WordPress: signed-in requests carry the REST nonce (cookie authentication).
    var wp = window.VIBECRAFT_WP || {};
    if (wp.nonce) fetchOptions.headers["X-WP-Nonce"] = wp.nonce;
    if (opts.body !== undefined) {
      fetchOptions.headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(opts.body);
    }""",
        ),
        (
            """    if (!response.ok) {
      var error""",
            """    // Sign-in/sign-up/sign-out return the nonce for the new session ("" when signed out).
    if (payload && payload.data && typeof payload.data.nonce === "string" && window.VIBECRAFT_WP) window.VIBECRAFT_WP.nonce = payload.data.nonce;

    if (!response.ok) {
      var error""",
        ),
        (
            """    var response = await fetch(buildUrl(path), fetchOptions);
    return handleResponse(response);""",
            """    var response = await fetch(buildUrl(path), fetchOptions);
    // A page served from a cache can carry an expired nonce: retry once without it.
    if (response.status === 403 && fetchOptions.headers["X-WP-Nonce"]) {
      var probe = await response.clone().json().catch(function () { return null; });
      if (probe && probe.code === "rest_cookie_invalid_nonce") {
        delete fetchOptions.headers["X-WP-Nonce"];
        if (window.VIBECRAFT_WP) window.VIBECRAFT_WP.nonce = "";
        response = await fetch(buildUrl(path), fetchOptions);
      }
    }
    return handleResponse(response);""",
        ),
    ],
    "cart.js": [
        # After placing the order, open WooCommerce's confirmation page (same receipt
        # design); Meta's plugin records the Purchase there.
        (
            """      if (window.VibecraftMeta) window.VibecraftMeta.trackPurchase(order);""",
            """      if (window.VibecraftMeta) window.VibecraftMeta.trackPurchase(order);
      if (order.receiptUrl) {
        window.VibecraftCart.clear();
        window.location.assign(order.receiptUrl);
        return;
      }""",
        ),
        (
            """  async function boot() {
    populateCounties();""",
            """  async function boot() {
    // Order confirmation page: show the receipt for the order just placed.
    if (window.VC_ORDER) {
      itemsList.innerHTML = '<p class="cart-empty-state">Thank you — your order has been placed. We’ll reach out shortly to confirm.</p>';
      form.hidden = true;
      updateSubtotal(0);
      renderReceipt(window.VC_ORDER);
      return;
    }
    populateCounties();""",
        ),
    ],
}


def main():
    if not os.path.isdir(THEME):
        sys.exit("Theme folder missing: " + THEME)
    # Pages (the PHP renderer adapts links and asset addresses at runtime).
    for page in PAGES:
        write(os.path.join(THEME, "html", page), read(os.path.join(CLIENT, page)))

    # Scripts.
    js_dir = os.path.join(THEME, "js")
    shutil.rmtree(js_dir, ignore_errors=True)
    for name in sorted(os.listdir(CLIENT)):
        if not name.endswith(".js") or name.startswith("admin") or name in SKIP_JS:
            continue
        text = js_assets(read(os.path.join(CLIENT, name)))
        for old, new in JS_PATCHES.get(name, []):
            text = patch(name, text, old, new)
        if name == "google-config.js":
            text = "// Set in WooCommerce → Vibecraft → Vibe AI & sign-in.\nwindow.GOOGLE_CLIENT_ID = window.GOOGLE_CLIENT_ID || \"\";\n"
        write(os.path.join(js_dir, name), text)
    shutil.copy(os.path.join(THEME_SRC, "vc-meta.js"), os.path.join(js_dir, "vc-meta.js"))

    # Styles (unchanged) with the WordPress theme header.
    header = read(os.path.join(THEME_SRC, "style-header.css"))
    write(os.path.join(THEME, "style.css"), header + "\n" + read(os.path.join(CLIENT, "style.css")))

    # Images, logo, video.
    shutil.rmtree(os.path.join(THEME, "assets"), ignore_errors=True)
    shutil.copytree(os.path.join(CLIENT, "assets"), os.path.join(THEME, "assets"))
    print("Theme synced from Client/:", len(PAGES), "pages,", len(os.listdir(js_dir)), "scripts.")


if __name__ == "__main__":
    main()
