(function () {
  "use strict";

  var API_BASE = window.VIBECRAFT_API_BASE || "/api";

  function buildUrl(path) {
    return API_BASE + "/" + String(path || "").replace(/^\/+/, "");
  }

  async function handleResponse(response) {
    var payload = null;

    try {
      payload = await response.json();
    } catch (_error) {
      payload = null;
    }

    // Sign-in/sign-up/sign-out return the nonce for the new session ("" when signed out).
    if (payload && payload.data && typeof payload.data.nonce === "string" && window.VIBECRAFT_WP) window.VIBECRAFT_WP.nonce = payload.data.nonce;

    if (!response.ok) {
      var error = new Error((payload && payload.message) || "Something went wrong. Please try again.");
      error.status = response.status;
      error.details = payload && payload.details;
      throw error;
    }

    return payload;
  }

  async function request(path, options) {
    var opts = options || {};
    var fetchOptions = {
      method: opts.method || "GET",
      credentials: "include",
    };

    fetchOptions.headers = {};
    // WordPress: signed-in requests carry the REST nonce (cookie authentication).
    var wp = window.VIBECRAFT_WP || {};
    if (wp.nonce) fetchOptions.headers["X-WP-Nonce"] = wp.nonce;
    if (opts.body !== undefined) {
      fetchOptions.headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(opts.body);
    }

    var response = await fetch(buildUrl(path), fetchOptions);
    // A page served from a cache can carry an expired nonce: retry once without it.
    if (response.status === 403 && fetchOptions.headers["X-WP-Nonce"]) {
      var probe = await response.clone().json().catch(function () { return null; });
      if (probe && probe.code === "rest_cookie_invalid_nonce") {
        delete fetchOptions.headers["X-WP-Nonce"];
        if (window.VIBECRAFT_WP) window.VIBECRAFT_WP.nonce = "";
        response = await fetch(buildUrl(path), fetchOptions);
      }
    }
    return handleResponse(response);
  }

  async function upload(path, formData) {
    var response = await fetch(buildUrl(path), {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    return handleResponse(response);
  }

  function safeNext(fallback) {
    var next = new URLSearchParams(window.location.search).get("next") || "";
    return /^(?:\/[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]+\.html)(?:[?#][^<>]*)?$/.test(next) ? next : fallback;
  }

  async function getCurrentCustomer() {
    try {
      var payload = await request("auth/me", { method: "GET" });
      return payload && payload.data ? payload.data : null;
    } catch (_error) {
      return null;
    }
  }

  async function requireCustomer() {
    var customer = await getCurrentCustomer();
    if (customer) return customer;

    var currentPath = window.location.pathname === "/" ? "/" : window.location.pathname;
    var next = currentPath + window.location.search + window.location.hash;
    window.location.href = "/login?next=" + encodeURIComponent(next);
    return null;
  }

  // Product page address: /products/<slug> (the id also works and redirects).
  function productUrl(product) {
    var key = product && (product.slug || product.id);
    return "/products/" + encodeURIComponent(key || "");
  }

  window.VibecraftApi = {
    productUrl: productUrl,
    get: function (path) {
      return request(path, { method: "GET" });
    },
    post: function (path, body) {
      return request(path, { method: "POST", body: body || {} });
    },
    patch: function (path, body) {
      return request(path, { method: "PATCH", body: body || {} });
    },
    del: function (path) {
      return request(path, { method: "DELETE" });
    },
    getCurrentCustomer: getCurrentCustomer,
    requireCustomer: requireCustomer,
    upload: upload,
    safeNext: safeNext,
  };
})();
