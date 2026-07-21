(function () {
  "use strict";

  function currentPage() {
    return window.location.pathname.split("/").pop() || "admin-dashboard.html";
  }

  function loginUrl() {
    return "login.html?next=" + encodeURIComponent(currentPage());
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
        window.location.href = "login.html";
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
  };

  markActiveNav();
})();
