(function () {
  "use strict";

  function currentPage() {
    return window.location.pathname === "/" ? "/admin" : window.location.pathname;
  }

  function loginUrl() {
    return "/login?next=" + encodeURIComponent(currentPage());
  }

  async function requireSession() {
    try {
      var payload = await window.VibecraftApi.get("admin/auth/me");
      if (payload && payload.data) return payload.data;
    } catch (_error) {
      // fall through to redirect
    }

    window.location.href = loginUrl();
    return null;
  }

  function wireSignOut(buttonId) {
    var button = document.getElementById(buttonId || "adminSignOut");
    if (!button) return;

    button.addEventListener("click", async function () {
      try {
        await window.VibecraftApi.post("admin/auth/logout");
      } finally {
      window.location.href = "/login";
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

    var canManageSettings = ["owner", "admin", "manager"].indexOf(admin.role) !== -1;
    var canManageTeam = ["owner", "admin"].indexOf(admin.role) !== -1;
    document.querySelectorAll(".admin-nav a").forEach(function (link) {
      var href = link.getAttribute("href") || "";
      if (href === "/admin-settings" || href === "/admin-promotions" || href === "admin-settings.html" || href === "admin-promotions.html") link.hidden = !canManageSettings;
      if (href === "/admin-team" || href === "admin-team.html") link.hidden = !canManageTeam;
    });

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
    var page = currentPage();
    document.querySelectorAll(".admin-nav a").forEach(function (link) {
      if (link.getAttribute("href") === page) {
        link.setAttribute("aria-current", "page");
      }
    });
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
    loadSettings: loadSettings,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    stockStatus: stockStatus,
    stockBadge: stockBadge,
  };

  wireAdminNavigation();
  markActiveNav();
})();
