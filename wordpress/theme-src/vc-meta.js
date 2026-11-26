/* Vibecraft tracking on WordPress.
 *
 * Meta's official plugin (Facebook for WooCommerce) loads the Pixel and reports
 * PageView, ViewContent and Purchase (browser + Conversions API). This script only adds
 * what the plugin cannot see on this storefront:
 *   - ad attribution (UTM tags, Meta click ID) saved with each order;
 *   - the campaign reference added to WhatsApp messages ("Ref: <campaign>");
 *   - Contact (WhatsApp / call) clicks, AddToCart and InitiateCheckout, sent to the
 *     same Pixel with the catalog's product IDs.
 * It never loads a Pixel of its own: without Meta's plugin it only records attribution.
 */
(function () {
  "use strict";

  var FIRST_KEY = "vc_attr_first";
  var LAST_KEY = "vc_attr_last";
  var ATTRIBUTION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
  var productCache = null;

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (_e) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_e) { /* storage unavailable */ }
  }

  function readTouch(key) {
    try {
      var value = JSON.parse(storageGet(key) || "null");
      if (!value || !value.at || Date.now() - new Date(value.at).getTime() > ATTRIBUTION_MAX_AGE_MS) return null;
      return value;
    } catch (_e) {
      return null;
    }
  }

  function captureAttribution() {
    var params = new URLSearchParams(window.location.search);
    var touch = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"].forEach(function (name) {
      var value = params.get(name);
      if (value) touch[name] = value.slice(0, name === "fbclid" ? 500 : 150);
    });
    var referrer = "";
    try {
      if (document.referrer && new URL(document.referrer).host !== window.location.host) referrer = document.referrer.slice(0, 500);
    } catch (_e) { referrer = ""; }
    if (!Object.keys(touch).length && !referrer) return;
    if (!Object.keys(touch).length && readTouch(LAST_KEY)) return; // a plain referral doesn't overwrite a campaign
    touch.landingPage = (window.location.pathname + window.location.search).slice(0, 500);
    if (referrer) touch.referrer = referrer;
    touch.at = new Date().toISOString();
    var serialized = JSON.stringify(touch);
    if (!readTouch(FIRST_KEY)) storageSet(FIRST_KEY, serialized);
    storageSet(LAST_KEY, serialized);
  }

  function getAttribution() {
    return {
      first: readTouch(FIRST_KEY) || undefined,
      last: readTouch(LAST_KEY) || undefined,
      checkoutUrl: window.location.href.split("#")[0].slice(0, 500),
    };
  }

  function randomId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  // Sends to the Pixel loaded by Meta's plugin (if any). Product IDs are translated to
  // the IDs Meta's catalog uses, so dynamic product ads can match them.
  function track(eventName, params) {
    if (typeof window.fbq !== "function" || !eventName) return null;
    var eventId = eventName + "_" + randomId();
    window.fbq("track", eventName, params || {}, { eventID: eventId });
    return eventId;
  }

  function products() {
    if (!productCache) {
      productCache = window.VibecraftApi
        ? window.VibecraftApi.get("products").then(function (payload) { return (payload && payload.data) || []; }).catch(function () { return []; })
        : Promise.resolve([]);
    }
    return productCache;
  }

  function contentIdFor(list, id) {
    var product = list.find(function (candidate) { return candidate.id === String(id); });
    return product && product.metaContentId ? product.metaContentId : String(id);
  }

  // The product page and others call track("ViewContent"/"InitiateCheckout"/"Lead").
  // ViewContent is already sent by Meta's plugin on product pages, so it is skipped here.
  function trackFromPage(eventName, params) {
    if (eventName === "ViewContent" || eventName === "Purchase") return null;
    if (!params || !params.content_ids) return track(eventName, params);
    products().then(function (list) {
      var mapped = Object.assign({}, params, {
        content_ids: params.content_ids.map(function (id) { return contentIdFor(list, id); }),
      });
      if (params.contents) {
        mapped.contents = params.contents.map(function (item) { return Object.assign({}, item, { id: contentIdFor(list, item.id) }); });
      }
      track(eventName, mapped);
    });
    return null;
  }

  // ---- Contact clicks & WhatsApp campaign references --------------------------------
  function contactMethod(href) {
    if (/^https:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(href)) return "whatsapp";
    if (/^tel:/i.test(href)) return "phone";
    if (/^mailto:/i.test(href)) return "email";
    return "";
  }

  function addCampaignReference(anchor) {
    var touch = readTouch(LAST_KEY);
    if (!touch || !touch.utm_campaign) return;
    try {
      var url = new URL(anchor.href);
      var text = url.searchParams.get("text");
      if (!text || text.indexOf("Ref:") !== -1) return;
      var updated = text + "\n\nRef: " + touch.utm_campaign;
      anchor.href = url.origin + url.pathname + "?text=" + encodeURIComponent(updated);
    } catch (_e) { /* leave the link unchanged */ }
  }

  document.addEventListener("click", function (event) {
    var target = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!target) return;
    var method = contactMethod(target.getAttribute("href") || "");
    if (method) {
      if (method === "whatsapp") addCampaignReference(target);
      track("Contact", { method: method });
    }
  }, true);

  // ---- AddToCart: every add-to-cart button goes through the cart store -------------
  document.addEventListener("cart:add", function (event) {
    var detail = (event && event.detail) || {};
    if (!detail.productId) return;
    var quantity = Number(detail.quantity || 1);
    products().then(function (list) {
      var product = list.find(function (candidate) { return candidate.id === String(detail.productId); }) || { id: detail.productId };
      track("AddToCart", {
        content_ids: [product.metaContentId || String(product.id)],
        content_name: product.name,
        content_type: "product",
        contents: [{ id: product.metaContentId || String(product.id), quantity: quantity }],
        value: Number(product.price || 0) * quantity,
        currency: product.currency || "KES",
      });
    });
  });

  captureAttribution();

  window.VibecraftMeta = {
    track: trackFromPage,
    // The Purchase is reported by Meta's plugin on the order confirmation page.
    trackPurchase: function () { return null; },
    getAttribution: getAttribution,
  };
})();
