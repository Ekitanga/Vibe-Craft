(function () {
  "use strict";

  function currentPage() {
    return window.location.pathname === "/" ? "/admin" : window.location.pathname;
  }

  // The admin sign-in address (private when configured in Integrations → Security).
  function adminLoginPath() {
    var config = window.VIBECRAFT_ADMIN_LOGIN;
    return config && config.path ? config.path : "/login";
  }

  function loginUrl() {
    return adminLoginPath() + "?next=" + encodeURIComponent(currentPage());
  }

  async function requireSession() {
    try {
      var payload = await window.VibecraftApi.get("admin/auth/me");
      if (payload && payload.data) {
        var admin = payload.data;
        currentAdmin = admin;
        // A weak password (e.g. one set before the password rules) must be changed first.
        if (admin.mustChangePassword && currentPage() !== "/admin-team") {
          window.location.href = "/admin-team?changePassword=1";
          return null;
        }
        return admin;
      }
    } catch (_error) {
      // fall through to redirect
    }

    window.location.href = loginUrl();
    return null;
  }

  var currentAdmin = null;

  function can(permission, admin) {
    var subject = admin || currentAdmin;
    var held = (subject && subject.permissions) || [];
    var wanted = Array.isArray(permission) ? permission : [permission];
    return wanted.some(function (key) { return held.indexOf(key) !== -1; });
  }

  // Which permission each admin page needs (any of the listed ones).
  var PAGE_PERMISSIONS = {
    "admin-dashboard": ["dashboard.view"],
    "admin-products": ["products.manage"],
    "admin-orders": ["orders.view"],
    "admin-customers": ["customers.view"],
    "admin-testimonials": ["testimonials.manage"],
    "admin-settings": ["settings.manage"],
    "admin-promotions": ["promotions.manage"],
    "admin-marketing": ["marketing.view"],
    "admin-integrations": ["integrations.manage"],
    "admin-access": ["roles.manage", "team.manage", "team.view"],
  };

  var EXTRA_NAV = [
    { page: "admin-marketing", label: "Marketing" },
    { page: "admin-integrations", label: "Integrations" },
    { page: "admin-access", label: "Access" },
  ];

  function pageKeyFromHref(href) {
    return String(href || "").replace(/^\//, "").replace(/\.html$/, "").split(/[?#]/)[0];
  }

  function wireSignOut(buttonId) {
    var button = document.getElementById(buttonId || "adminSignOut");
    if (!button) return;

    button.addEventListener("click", async function () {
      try {
        await window.VibecraftApi.post("admin/auth/logout");
      } finally {
      window.location.href = adminLoginPath();
      }
    });
  }

  function renderAccountMenu(admin) {
    var toggle = document.getElementById("adminAccountToggle");
    var menu = document.getElementById("adminAccountMenu");
    if (!toggle || !menu || !admin) return;

    var name = admin.name || admin.email || "Admin";
    var initial = name.trim().charAt(0).toUpperCase() || "A";
    var avatar = document.getElementById("adminAccountAvatar");
    var menuName = document.getElementById("adminAccountMenuName");
    var menuEmail = document.getElementById("adminAccountEmail");

    if (avatar) avatar.textContent = initial;
    if (menuName) menuName.textContent = name;
    if (menuEmail) menuEmail.textContent = admin.email || "";

    var nav = document.querySelector(".admin-nav");
    if (nav) {
      EXTRA_NAV.forEach(function (item) {
        if (nav.querySelector('a[href="/' + item.page + '"], a[href="' + item.page + '.html"]')) return;
        var link = document.createElement("a");
        link.href = "/" + item.page;
        link.textContent = item.label;
        nav.appendChild(link);
      });
      // Every admin keeps the Team page: it is where they change their own password.
      nav.querySelectorAll("a").forEach(function (link) {
        var required = PAGE_PERMISSIONS[pageKeyFromHref(link.getAttribute("href"))];
        link.hidden = Boolean(required) && !can(required, admin);
      });
      markActiveNav();
    }
    guardPage(admin);

    function setOpen(isOpen) {
      toggle.setAttribute("aria-expanded", String(isOpen));
      menu.hidden = !isOpen;
    }

    toggle.addEventListener("click", function (event) {
      event.stopPropagation();
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    document.addEventListener("click", function (event) {
      if (!menu.hidden && !menu.contains(event.target) && event.target !== toggle) {
        setOpen(false);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !menu.hidden) setOpen(false);
    });
  }

  function markActiveNav() {
    var page = pageKeyFromHref(currentPage());
    if (page === "admin") page = "admin-dashboard";
    document.querySelectorAll(".admin-nav a").forEach(function (link) {
      if (pageKeyFromHref(link.getAttribute("href")) === page) {
        link.setAttribute("aria-current", "page");
      }
    });
  }

  // Shows a friendly message instead of a broken page when a role lacks access.
  function guardPage(admin, container) {
    var required = PAGE_PERMISSIONS[pageKeyFromHref(currentPage())];
    if (!required || can(required, admin)) return true;
    var host = container || document.querySelector(".admin-shell");
    if (host) {
      host.innerHTML = '<section class="admin-panel"><div class="admin-panel-heading"><div><h2>No access</h2>' +
        '<p class="panel-copy">Your role (' + escapeHtml(admin.roleName || admin.role) + ") does not include this page. Ask an owner if you need it.</p></div></div></section>";
    }
    return false;
  }

  function wireAdminNavigation() {
    var nav = document.querySelector(".admin-nav");
    var header = document.querySelector(".site-header");
    if (!nav || !header || document.getElementById("adminMenuToggle")) return;

    nav.id = "adminNav";
    var toggle = document.createElement("button");
    toggle.id = "adminMenuToggle";
    toggle.className = "admin-menu-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Open admin navigation");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "adminNav");
    toggle.innerHTML = '<span></span><span></span><span></span>';
    header.insertBefore(toggle, nav);

    function setOpen(isOpen) {
      toggle.setAttribute("aria-expanded", String(isOpen));
      toggle.setAttribute("aria-label", isOpen ? "Close admin navigation" : "Open admin navigation");
      nav.classList.toggle("is-open", isOpen);
    }

    toggle.addEventListener("click", function (event) {
      event.stopPropagation();
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () { setOpen(false); });
    });

    document.addEventListener("click", function (event) {
      if (toggle.getAttribute("aria-expanded") === "true" && !nav.contains(event.target) && event.target !== toggle) setOpen(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setOpen(false);
    });
  }

  var LOW_STOCK_THRESHOLD = 5;

  function loadSettings() {
    return window.VibecraftApi.get("settings").then(function (payload) {
      var threshold = Number(payload && payload.data && payload.data.lowStockThreshold);
      if (Number.isInteger(threshold) && threshold >= 0) LOW_STOCK_THRESHOLD = threshold;
      return payload && payload.data;
    });
  }

  function stockStatus(stock) {
    var value = Number(stock || 0);

    if (value <= 0) {
      return { label: "Out of stock", className: "stock-out" };
    }

    if (value <= LOW_STOCK_THRESHOLD) {
      return { label: value + " left — low stock", className: "stock-low" };
    }

    return { label: String(value), className: "stock-ok" };
  }

  function stockBadge(stock) {
    var status = stockStatus(stock);
    return '<span class="stock-pill ' + status.className + '">' + escapeHtml(status.label) + "</span>";
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  window.VibecraftAdmin = {
    requireSession: requireSession,
    wireSignOut: wireSignOut,
    renderAccountMenu: renderAccountMenu,
    markActiveNav: markActiveNav,
    escapeHtml: escapeHtml,
    can: can,
    guardPage: guardPage,
    loadSettings: loadSettings,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    stockStatus: stockStatus,
    stockBadge: stockBadge,
  };

  wireAdminNavigation();
  markActiveNav();
})();
