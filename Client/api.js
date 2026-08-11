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

    if (opts.body !== undefined) {
      fetchOptions.headers = { "Content-Type": "application/json" };
      fetchOptions.body = JSON.stringify(opts.body);
    }

    var response = await fetch(buildUrl(path), fetchOptions);
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
    return /^[a-zA-Z0-9_-]+\.html(?:[?#][^<>]*)?$/.test(next) ? next : fallback;
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

    var fileName = window.location.pathname.split("/").pop() || "index.html";
    if (!/^[a-zA-Z0-9_-]+\.html$/.test(fileName)) fileName = "index.html";
    var next = fileName + window.location.search + window.location.hash;
    window.location.href = "login.html?next=" + encodeURIComponent(next);
    return null;
  }

  window.VibecraftApi = {
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
