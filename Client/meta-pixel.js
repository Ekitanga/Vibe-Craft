/* Vibecraft tracking: Meta Pixel + Conversions API relay + ad attribution.
 *
 * Configuration comes from the server (window.VIBECRAFT_TRACKING, injected into each
 * page from Admin → Integrations), so nothing here is hard-coded. Every event gets an
 * event ID that is sent both to the Pixel and to the server, which forwards it to the
 * Conversions API — Meta uses the shared ID to count each event once.
 */
(function () {
  "use strict";

  var config = window.VIBECRAFT_TRACKING || {};
  var consentConfig = config.consent || {};
  var FIRST_KEY = "vc_attr_first";
  var LAST_KEY = "vc_attr_last";
  var CONSENT_KEY = "vc_consent";
  var ATTRIBUTION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
  var pixelLoaded = false;

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (_e) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_e) { /* storage unavailable */ }
  }

  function randomId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  // ---- Attribution (UTM tags, Meta click ID, referrer) -----------------------------
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
    if (!Object.keys(touch).length && readTouch(LAST_KEY)) return; // plain referral doesn't overwrite a campaign
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

  // ---- Consent ---------------------------------------------------------------------
  function consentState() {
    return storageGet(CONSENT_KEY);
  }

  function trackingAllowed() {
    if (!config.pixelId) return false;
    if (consentState() === "denied") return false;
    if (consentConfig.requireConsent && consentState() !== "granted") return false;
    return true;
  }

  // ---- Pixel -----------------------------------------------------------------------
  function loadPixel() {
    if (pixelLoaded || !trackingAllowed()) return;
    pixelLoaded = true;

    /* Standard Meta Pixel loader. */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0";
      n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

    var userData = {};
    if (config.user) {
      Object.keys(config.user).forEach(function (key) {
        if (config.user[key]) userData[key] = String(config.user[key]).trim().toLowerCase();
      });
    }
    window.fbq("init", config.pixelId, userData);
    track("PageView");
  }

  function relay(eventName, eventId, params) {
    if (!config.serverEvents) return;
    var touch = readTouch(LAST_KEY) || {};
    var body = JSON.stringify({
      eventName: eventName,
      eventId: eventId,
      url: window.location.href.split("#")[0],
      fbclid: touch.fbclid,
      customData: params || {},
    });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon("/api/marketing/events", new Blob([body], { type: "application/json" }))) return;
    } catch (_e) { /* fall back to fetch */ }
    fetch("/api/marketing/events", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: body,
    }).catch(function () {});
  }

  // Fires a standard (or custom) event. Returns the event ID used.
  function track(eventName, params, options) {
    if (!eventName || !trackingAllowed()) return null;
    if (!pixelLoaded) loadPixel();
    var opts = options || {};
    var eventId = opts.eventId || eventName + "_" + randomId();
    if (typeof window.fbq === "function") {
      window.fbq(opts.custom ? "trackCustom" : "track", eventName, params || {}, { eventID: eventId });
    }
    if (!opts.custom && !opts.skipServer) relay(eventName, eventId, params);
    return eventId;
  }

  // Purchase uses the order's server-issued event ID; the server sends its own copy.
  function trackPurchase(order) {
    if (!order || !order.tracking || config.purchaseTrigger === "verified") return;
    var items = order.items || [];
    track("Purchase", {
      value: Number(order.total || 0),
      currency: order.currency || config.currency || "KES",
      content_type: "product",
      content_ids: items.map(function (item) { return item.productId; }),
      contents: items.map(function (item) { return { id: item.productId, quantity: item.quantity }; }),
      num_items: items.reduce(function (sum, item) { return sum + Number(item.quantity || 0); }, 0),
      order_id: order.orderNumber,
    }, { eventId: order.tracking.purchaseEventId, skipServer: true });
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
      // Rebuild with %20 (not "+") so WhatsApp shows spaces correctly.
      url.searchParams.delete("text");
      var others = url.searchParams.toString();
      anchor.href = url.origin + url.pathname + "?" + (others ? others + "&" : "") +
        "text=" + encodeURIComponent(text + "\n\nRef: " + touch.utm_campaign);
    } catch (_e) { /* leave the link unchanged */ }
  }

  document.addEventListener("click", function (event) {
    var target = event.target && event.target.closest ? event.target.closest("a[href], [data-meta-event]") : null;
    if (!target) return;

    var explicit = target.getAttribute("data-meta-event");
    if (explicit) {
      var label = target.getAttribute("data-meta-label") || String(target.textContent || "").trim().slice(0, 80);
      track(explicit, label ? { button_label: label } : {}, { custom: target.getAttribute("data-meta-custom") === "true" });
      return;
    }

    var href = target.getAttribute("href") || "";
    var method = contactMethod(href);
    if (method) {
      if (method === "whatsapp") addCampaignReference(target);
      track("Contact", { method: method });
    }
  }, true);

  // ---- AddToCart: every add-to-cart button goes through the cart store -------------
  document.addEventListener("cart:add", function (event) {
    var detail = (event && event.detail) || {};
    if (!detail.productId || !trackingAllowed()) return;
    var quantity = Number(detail.quantity || 1);
    fetch("/api/products/" + encodeURIComponent(detail.productId), { credentials: "same-origin" })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (payload) {
        var product = (payload && payload.data) || { id: detail.productId };
        track("AddToCart", {
          content_ids: [product.id],
          content_name: product.name,
          content_type: "product",
          contents: [{ id: product.id, quantity: quantity }],
          value: Number(product.price || 0) * quantity,
          currency: product.currency || "KES",
        });
      })
      .catch(function () {});
  });

  // ---- Consent banner (only when enabled in Admin → Integrations) --------------------
  function showConsentBanner() {
    if (!consentConfig.bannerEnabled || !config.pixelId || consentState()) return;
    var banner = document.createElement("div");
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Cookie consent");
    banner.className = "vc-consent-banner";
    banner.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:560px;margin:0 auto;" +
      "background:var(--surface,#fff);color:var(--ink,#1d1d1f);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.18);" +
      "padding:16px 18px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:14px;line-height:1.45";

    var message = document.createElement("p");
    message.style.cssText = "margin:0;flex:1 1 260px";
    message.textContent = (consentConfig.message || "We use cookies to measure our ads.") + " ";
    var link = document.createElement("a");
    link.href = consentConfig.policyUrl || "/privacy";
    link.textContent = "Privacy policy";
    link.style.textDecoration = "underline";
    message.appendChild(link);

    var actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px";
    function button(label, primary, value) {
      var element = document.createElement("button");
      element.type = "button";
      element.className = primary ? "button button-dark" : "button button-outline";
      element.textContent = label;
      element.addEventListener("click", function () {
        storageSet(CONSENT_KEY, value);
        banner.remove();
        if (value === "granted") {
          if (typeof window.fbq === "function") window.fbq("consent", "grant");
          loadPixel();
        } else if (typeof window.fbq === "function") {
          window.fbq("consent", "revoke");
        }
      });
      return element;
    }
    actions.appendChild(button(consentConfig.declineLabel || "No thanks", false, "denied"));
    actions.appendChild(button(consentConfig.acceptLabel || "Accept", true, "granted"));
    banner.appendChild(message);
    banner.appendChild(actions);
    document.body.appendChild(banner);
  }

  captureAttribution();
  loadPixel();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showConsentBanner);
  else showConsentBanner();

  window.VibecraftMeta = {
    track: track,
    trackPurchase: trackPurchase,
    getAttribution: getAttribution,
  };
})();
