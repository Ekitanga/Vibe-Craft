(function () {
  "use strict";

  var contact = window.VibecraftContact = window.VibecraftContact || {};
  contact.whatsapp = contact.whatsapp || "0707 472897";
  contact.toPhoneDigits = function (value) {
    var digits = String(value || "").replace(/\D/g, "");
    if (digits.indexOf("0") === 0) return "254" + digits.slice(1);
    if (digits.indexOf("254") === 0) return digits;
    return digits;
  };
  contact.toWhatsAppUrl = function (message) {
    return "https://wa.me/" + contact.toPhoneDigits(contact.whatsapp) + (message ? "?text=" + encodeURIComponent(message) : "");
  };
  contact.applyWhatsAppLinks = function () {
    var phoneDigits = contact.toPhoneDigits(contact.whatsapp);
    if (!phoneDigits) return;
    document.querySelectorAll('a[href*="wa.me/"]').forEach(function (link) {
      var url = new URL(link.href, window.location.href);
      if (url.hostname !== "wa.me") return;
      link.href = "https://wa.me/" + phoneDigits + url.search;
      if (link.id === "footerWhatsapp" || link.textContent.indexOf("WhatsApp:") !== -1) {
        link.textContent = "WhatsApp: " + contact.whatsapp;
      } else if (link.parentElement && link.parentElement.textContent.indexOf("WhatsApp:") !== -1 && link.textContent.trim()) {
        link.textContent = contact.whatsapp;
      }
    });
  };
  contact.setWhatsApp = function (value) {
    contact.whatsapp = value || contact.whatsapp;
    contact.applyWhatsAppLinks();
    window.dispatchEvent(new Event("vibecraft:contact-settings"));
  };

  var cleanPages = {
    "index.html": "/",
    "login.html": "/login",
    "signup.html": "/signup",
    "account.html": "/account",
    "cart.html": "/cart",
    "product.html": "/product",
    "find-your-setup.html": "/find-your-setup",
    "admin-dashboard.html": "/admin",
    "admin-products.html": "/admin-products",
    "admin-orders.html": "/admin-orders",
    "admin-customers.html": "/admin-customers",
    "admin-testimonials.html": "/admin-testimonials",
    "admin-team.html": "/admin-team",
    "admin-settings.html": "/admin-settings",
    "admin-promotions.html": "/admin-promotions",
  };

  // Home page sections have their own addresses (/about, /contact, /shop) instead of #anchors.
  var sectionPaths = { top: "/", about: "/about", contact: "/contact", collection: "/shop" };
  // First id that exists wins (the home page script replaces the static #about band).
  var sectionIds = { "/about": ["about", "rooms"], "/contact": ["contact"], "/shop": ["collection"] };
  var homePaths = { "/": true, "/about": true, "/contact": true, "/shop": true, "/index.html": true };

  function cleanInternalUrl(rawUrl) {
    var url = new URL(rawUrl, window.location.href);
    if (url.origin !== window.location.origin) return null;
    var fileName = url.pathname.split("/").pop();
    var isHome = url.pathname === "/" || fileName === "index.html";
    var section = url.hash ? url.hash.slice(1) : "";
    if (isHome && section && Object.prototype.hasOwnProperty.call(sectionPaths, section)) {
      return sectionPaths[section] + url.search;
    }
    var cleanPath = cleanPages[fileName];
    return cleanPath ? cleanPath + url.search + url.hash : null;
  }

  function scrollToSection(path, smooth) {
    var target = null;
    (sectionIds[path] || []).some(function (id) {
      target = document.getElementById(id);
      return Boolean(target);
    });
    if (target) target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    else if (path === "/") window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
  }

  document.querySelectorAll('a[href]').forEach(function (link) {
    var cleanUrl = cleanInternalUrl(link.href);
    if (cleanUrl) link.setAttribute("href", cleanUrl);
  });

  document.addEventListener("click", function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target.closest ? event.target.closest("a[href]") : null;
    if (!link) return;
    var cleanUrl = cleanInternalUrl(link.href);
    if (!cleanUrl) return;
    event.preventDefault();
    var target = new URL(cleanUrl, window.location.origin);
    // Already on the home page: scroll to the section without reloading.
    if (homePaths[window.location.pathname] && (sectionIds[target.pathname] || target.pathname === "/") && !target.search) {
      if (window.location.pathname !== target.pathname) window.history.pushState(null, "", target.pathname);
      scrollToSection(target.pathname, true);
      return;
    }
    window.location.assign(cleanUrl);
  }, true);

  // Opened directly at /about, /contact or /shop: scroll there once the page has laid out.
  if (sectionIds[window.location.pathname]) {
    window.addEventListener("load", function () {
      scrollToSection(window.location.pathname, false);
      // Products load after the page; settle on the section once they are in.
      window.setTimeout(function () { scrollToSection(window.location.pathname, false); }, 900);
    });
  }
  window.addEventListener("popstate", function () {
    if (homePaths[window.location.pathname]) scrollToSection(window.location.pathname, false);
  });

  if (!document.querySelector(".admin-nav") && window.VibecraftApi) {
    function setText(id, value) {
      var element = document.getElementById(id);
      if (element && value !== undefined && value !== null) element.textContent = value;
    }

    function kenyaPhone(value) {
      var digits = String(value || "").replace(/\D/g, "");
      if (digits.indexOf("0") === 0) return "254" + digits.slice(1);
      if (digits.indexOf("254") === 0) return digits;
      return digits;
    }

    function applySocialLinks(links, storeName) {
      var host = document.querySelector(".footer-social");
      if (!host || !links || typeof links !== "object") return;
      var keys = ["instagram", "tiktok", "facebook", "youtube"];
      var anchors = keys.map(function (key, index) {
        var anchor = host.querySelector('a[data-social-key="' + key + '"]');
        if (!anchor && index < 2) anchor = host.querySelectorAll("a")[index];
        if (anchor) anchor.setAttribute("data-social-key", key);
        return anchor;
      });
      keys.forEach(function (key, index) {
        var link = String((links || {})[key] || "").trim();
        var anchor = anchors[index];
        if (!anchor && link) {
          anchor = document.createElement("a");
          anchor.className = "social-configured-link";
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          anchor.setAttribute("data-social-key", key);
          anchor.textContent = key === "youtube" ? "YT" : key.slice(0, 1).toUpperCase();
          host.appendChild(anchor);
          anchors[index] = anchor;
        }
        if (!anchor) return;
        if (link) anchor.href = link;
        anchor.hidden = !link;
        anchor.setAttribute("aria-label", (storeName || "Store") + " on " + key);
      });
    }

    window.VibecraftApi.get("settings").then(function (payload) {
      var settings = (payload && payload.data) || {};
      var root = document.documentElement;
      if (/^#[0-9a-fA-F]{6}$/.test(settings.primaryColor || "")) root.style.setProperty("--orange", settings.primaryColor);
      if (/^#[0-9a-fA-F]{6}$/.test(settings.accentColor || "")) root.style.setProperty("--lime", settings.accentColor);

      document.querySelectorAll("[data-setting]").forEach(function (element) {
        var value = settings[element.getAttribute("data-setting")];
        if (value !== undefined && value !== null && value !== "") element.textContent = value;
      });
      setText("homeHeroTitle", settings.heroTitle);
      setText("homeHeroDescription", settings.heroDescription);
      setText("footerPaybill", settings.paybill);
      setText("footerMpesaAccount", settings.mpesaAccount);
      setText("checkoutPaybill", settings.paybill);
      setText("checkoutMpesaAccount", settings.mpesaAccount);
      setText("footerAddress", settings.address);
      setText("footerOpeningHours", settings.openingHours);

      var phone = settings.phone || "";
      var whatsapp = settings.whatsapp || phone;
      var phoneLink = document.getElementById("footerPhone");
      var whatsappLink = document.getElementById("footerWhatsapp");
      if (phoneLink) { phoneLink.textContent = "Call: " + phone; phoneLink.href = "tel:+" + kenyaPhone(phone); }
      if (whatsappLink) { whatsappLink.textContent = "WhatsApp: " + whatsapp; whatsappLink.href = "https://wa.me/" + kenyaPhone(whatsapp); }
      contact.setWhatsApp(whatsapp);
      applySocialLinks(settings.socialLinks, settings.storeName);

      var announcement = document.getElementById("storeAnnouncement");
      if (announcement) { announcement.textContent = settings.announcement || ""; announcement.hidden = !settings.announcement; }
      if (document.getElementById("homeHeroTitle")) document.title = (settings.storeName || "Vibecraft") + " — See more in every room";
    }).catch(function () {
      // The storefront keeps its built-in defaults when the API is unavailable.
    });
  }
})();

(function () {
  "use strict";

  var STORAGE_KEY = "vibecraft_theme";
  var header = document.querySelector(".site-header");

  if (header && !header.querySelector(".admin-account")) {
    var themeHost = header.querySelector(".account-menu-wrap");
    var themeIcons =
      '<svg class="theme-toggle-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>' +
      '<svg class="theme-toggle-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
    var themeMarkup =
      '<button class="theme-toggle" id="themeToggle" type="button" aria-label="Toggle dark mode" aria-pressed="false">' +
        themeIcons +
      "</button>";
    if (themeHost) themeHost.insertAdjacentHTML("beforebegin", themeMarkup);
    else header.insertAdjacentHTML("beforeend", themeMarkup);

    var themeToggle = document.getElementById("themeToggle");

    var currentTheme = function () {
      return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    };

    var applyTheme = function (theme) {
      if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
      else document.documentElement.removeAttribute("data-theme");
      themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
    };

    applyTheme(currentTheme());

    themeToggle.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch (_error) {
        // Ignore storage errors (private browsing, etc.) - theme just won't persist.
      }
    });
  }

  var menuToggle = document.getElementById("menuToggle");
  var siteNav = document.getElementById("siteNav");
  var menuBackdrop = document.getElementById("menuBackdrop");
  var navClose = document.getElementById("navClose");
  var year = document.getElementById("year");

  if (year) year.textContent = new Date().getFullYear();

  if (window.VibecraftContact) window.VibecraftContact.applyWhatsAppLinks();

  if (menuToggle && siteNav) {
    function setMenuState(isOpen) {
      siteNav.classList.toggle("is-open", isOpen);
      document.body.classList.toggle("menu-open", isOpen);
      menuToggle.setAttribute("aria-expanded", String(isOpen));
      menuToggle.textContent = isOpen ? "Close" : "Menu";
      if (menuBackdrop) menuBackdrop.hidden = !isOpen;
    }

    menuToggle.addEventListener("click", function () {
      setMenuState(!siteNav.classList.contains("is-open"));
    });

    if (menuBackdrop) menuBackdrop.addEventListener("click", function () { setMenuState(false); });
    if (navClose) navClose.addEventListener("click", function () { setMenuState(false); });
    siteNav.querySelectorAll("a").forEach(function (link) { link.addEventListener("click", function () { setMenuState(false); }); });
    document.addEventListener("keydown", function (event) { if (event.key === "Escape") setMenuState(false); });
  }
})();

(function () {
  "use strict";

  // The home page's showcase.js owns live filtering. Other pages still get
  // the same navbar search affordance and send the query to the collection.
  var searchToggle = document.getElementById("navSearchToggle");
  var searchPanel = document.getElementById("productSearchPanel");
  var searchForm = document.getElementById("productSearchForm");
  var searchInput = document.getElementById("productSearchInput");

  if (!searchToggle || !searchPanel || !searchForm || !searchInput || document.getElementById("shopCategories") || /(?:^|\/)index\.html$/i.test(window.location.pathname) || window.location.pathname === "/") return;

  function setSearchOpen(isOpen) {
    searchPanel.hidden = !isOpen;
    searchToggle.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) window.setTimeout(function () { searchInput.focus(); }, 0);
  }

  searchToggle.addEventListener("click", function () {
    setSearchOpen(searchPanel.hidden);
  });

  searchForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var query = searchInput.value.trim();
    window.location.href = "index.html" + (query ? "?search=" + encodeURIComponent(query) : "#collection");
  });

  document.addEventListener("click", function (event) {
    if (!searchPanel.hidden && !searchPanel.contains(event.target) && !searchToggle.contains(event.target)) setSearchOpen(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") setSearchOpen(false);
  });
})();

(function () {
  "use strict";

  function getInitials(user) {
    var parts = String(user.name || "").trim().split(/\s+/).filter(Boolean);

    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

    return String(user.email || "U").slice(0, 2).toUpperCase();
  }

  function wireCustomerAccountMenu(link, user) {
    var menu = document.getElementById("customerAccountMenu");
    if (!menu) return;

    var nameEl = document.getElementById("customerAccountName");
    var emailEl = document.getElementById("customerAccountEmail");
    if (nameEl) nameEl.textContent = user.name || "Account";
    if (emailEl) emailEl.textContent = user.email || "";

    var signOutBtn = document.getElementById("customerAccountSignOut");
    if (signOutBtn) {
      signOutBtn.addEventListener("click", async function () {
        try {
          await window.VibecraftApi.post("auth/logout");
        } finally {
          window.location.href = "index.html";
        }
      });
    }

    // Below 821px the dropdown is hidden (CSS) and the avatar just navigates to account.html directly.
    if (!window.matchMedia("(min-width: 821px)").matches) return;

    link.setAttribute("aria-haspopup", "true");
    link.setAttribute("aria-expanded", "false");

    function setMenuOpen(isOpen) {
      menu.hidden = !isOpen;
      link.setAttribute("aria-expanded", String(isOpen));
    }

    link.addEventListener("click", function (event) {
      event.preventDefault();
      setMenuOpen(menu.hidden);
    });

    document.addEventListener("click", function (event) {
      if (!menu.hidden && !menu.contains(event.target) && event.target !== link) {
        setMenuOpen(false);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !menu.hidden) setMenuOpen(false);
    });
  }

  async function syncAuthLink() {
    var authLinks = Array.prototype.slice.call(document.querySelectorAll("[data-auth-link]"));
    var link = document.querySelector(".desktop-auth-link") || authLinks[0];

    if (!authLinks.length || !window.VibecraftApi) return;

    try {
      var payload = await window.VibecraftApi.get("auth/me");

      if (payload && payload.data) {
        var user = payload.data;

        authLinks.forEach(function (authLink) {
          authLink.href = "account.html";
          authLink.textContent = "";
          if (user.profileImageUrl) {
            var profileImage = document.createElement("img");
            profileImage.src = user.profileImageUrl;
            profileImage.alt = "";
            profileImage.loading = "lazy";
            authLink.appendChild(profileImage);
          } else {
            authLink.textContent = authLink.classList.contains("mobile-login-link") ? "My account" : getInitials(user);
          }
          authLink.setAttribute("aria-label", "Open account for " + (user.name || user.email));
          authLink.title = user.name || user.email || "Account";
        });
        link.classList.add("account-avatar-link");
        wireCustomerAccountMenu(link, user);
        return;
      }
    } catch (_error) {
      // Not signed in as a customer - fall through to check for an admin session.
    }

    try {
      var adminPayload = await window.VibecraftApi.get("admin/auth/me");

      if (adminPayload && adminPayload.data) {
        authLinks.forEach(function (authLink) {
          authLink.href = "admin-dashboard.html";
          authLink.textContent = "Admin";
          authLink.setAttribute("aria-label", "Back to admin dashboard");
          authLink.title = "Back to admin dashboard";
        });
      }
    } catch (_error) {
      // Not signed in at all - leave the default "Log in" link as-is.
    }
  }

  syncAuthLink();
})();

(function () {
  "use strict";

  var cartToggle = document.getElementById("cartToggle");
  var cartDrawer = document.getElementById("cartDrawer");
  var cartClose = document.getElementById("cartClose");
  var cartBackdrop = document.getElementById("cartBackdrop");
  var cartDrawerBody = document.getElementById("cartDrawerBody");
  var cartDrawerSubtotal = document.getElementById("cartDrawerSubtotal");
  var cartPreviewBody = document.getElementById("cartPreviewBody");

  if (!cartToggle || !cartDrawer || !window.VibecraftCart) return;

  function formatPrice(amount, currency) {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: currency || "KES",
      maximumFractionDigits: 0,
    }).format(Number(amount || 0));
  }

  function cartLineMarkup(item, product) {
    var image = product.images && product.images[0];

    return [
      '<div class="cart-line">',
      '<div class="cart-line-media">' + (image ? '<img src="' + image + '" alt="" />' : "") + "</div>",
      '<div class="cart-line-body">',
      "<h4>" + product.name + "</h4>",
      "<span>" + item.quantity + " × " + formatPrice(product.price, product.currency) + "</span>",
      "</div>",
      "</div>",
    ].join("");
  }

  function setCartState(isOpen) {
    cartDrawer.classList.toggle("is-open", isOpen);
    cartDrawer.setAttribute("aria-hidden", String(!isOpen));
    document.body.classList.toggle("menu-open", isOpen);
    cartToggle.setAttribute("aria-expanded", String(isOpen));
    if (cartBackdrop) cartBackdrop.hidden = !isOpen;
  }

  async function renderCartWidgets() {
    var items = window.VibecraftCart.getItems();
    var emptyMarkup = '<p class="cart-empty">Your cart is empty.</p>';

    if (!items.length) {
      cartDrawerBody.innerHTML = emptyMarkup;
      cartDrawerSubtotal.textContent = formatPrice(0);
      if (cartPreviewBody) cartPreviewBody.innerHTML = emptyMarkup;
      return;
    }

    try {
      var payload = await window.VibecraftApi.get("products");
      var products = (payload && payload.data) || [];
      var subtotal = 0;

      var markup = items
        .map(function (item) {
          var product = products.find(function (candidate) {
            return candidate.id === item.productId;
          });

          if (!product) return "";

          subtotal += product.price * item.quantity;
          return cartLineMarkup(item, product);
        })
        .join("");

      cartDrawerBody.innerHTML = markup || emptyMarkup;
      cartDrawerSubtotal.textContent = formatPrice(subtotal);
      if (cartPreviewBody) cartPreviewBody.innerHTML = markup || emptyMarkup;
    } catch (_error) {
      var errorMarkup = '<p class="cart-empty">Could not load your cart.</p>';
      cartDrawerBody.innerHTML = errorMarkup;
      if (cartPreviewBody) cartPreviewBody.innerHTML = errorMarkup;
    }
  }

  cartToggle.addEventListener("click", function () {
    setCartState(!cartDrawer.classList.contains("is-open"));
  });

  if (cartClose) cartClose.addEventListener("click", function () { setCartState(false); });
  if (cartBackdrop) cartBackdrop.addEventListener("click", function () { setCartState(false); });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && cartDrawer.classList.contains("is-open")) setCartState(false);
  });

  document.addEventListener("cart:change", renderCartWidgets);

  renderCartWidgets();
})();

/* Mobile side menu: slides in from the left with search, product categories and contacts. */
(function () {
  "use strict";

  var nav = document.getElementById("siteNav");
  var toggle = document.getElementById("menuToggle");
  if (!nav || !toggle || !window.VibecraftApi || nav.querySelector(".drawer-shop")) return;

  var CACHE_KEY = "vibecraft_menu_categories_v1";
  var ICONS = {
    all: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
    projector: '<rect x="2.5" y="7" width="19" height="10" rx="3"/><circle cx="15.5" cy="12" r="2.6"/><path d="M6 12h3M6 19.5h2M16 19.5h2"/>',
    screen: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8.5 20.5h7"/>',
    stand: '<path d="M12 3v9M12 12l-6 9M12 12l6 9M12 12v9M9 3h6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
  };

  function svg(name, cls) {
    return '<svg class="' + (cls || "drawer-icon") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function iconFor(id) {
    if (id === "all") return "all";
    if (/screen/.test(id)) return "screen";
    if (/stand|mount|tripod/.test(id)) return "stand";
    return "projector";
  }

  // Same rule as the home page filter: "Projectors" covers every kind of projector.
  function inCategory(product, id) {
    var cat = String(product.categoryId || "").toLowerCase();
    if (id === "all") return true;
    if (id === "projectors") return /(^|-)projectors$/.test(cat);
    return cat === id;
  }

  function isHome() {
    return !!document.getElementById("showcaseFilters");
  }

  var brand = document.querySelector(".site-header .brand-image");
  var shop = document.createElement("div");
  shop.className = "drawer-shop drawer-only";
  shop.innerHTML =
    '<a class="drawer-brand" href="/" aria-label="Vibecraft254 home">' + (brand ? brand.innerHTML : "Vibecraft254") + "</a>" +
    '<form class="drawer-search" role="search" action="/shop">' +
    '<label class="sr-only" for="drawerSearchInput">Search products</label>' +
    svg("search") +
    '<input id="drawerSearchInput" name="search" type="search" placeholder="Search projectors, screens…" autocomplete="off" />' +
    "</form>" +
    '<p class="drawer-label">Shop by category</p>' +
    '<ul class="drawer-cats" id="drawerCategories"><li class="drawer-cats-loading"><span class="loading-dot" aria-hidden="true"></span> Loading categories…</li></ul>' +
    '<p class="drawer-label">Menu</p>';
  var close = nav.querySelector(".nav-close");
  nav.insertBefore(shop, close ? close.nextSibling : nav.firstChild);

  // Extra menu rows (mobile only), placed after Contact.
  var contactLink = nav.querySelector('a[href$="#contact"], a[href="/contact"]');
  var extra = document.createElement("div");
  extra.innerHTML =
    '<a class="drawer-only drawer-ai-link" href="/find-your-setup">Vibe AI ✨</a>' +
    '<a class="drawer-only" href="/#find-us">Visit our shop</a>';
  var anchor = contactLink ? contactLink.nextSibling : null;
  while (extra.firstChild) nav.insertBefore(extra.firstChild, anchor);

  var foot = document.createElement("div");
  foot.className = "drawer-foot drawer-only";
  nav.appendChild(foot);

  function renderFoot() {
    var phone = document.getElementById("footerPhone");
    var wa = document.getElementById("footerWhatsapp");
    var waHref = wa ? wa.getAttribute("href") : "https://wa.me/254707472897";
    var telHref = phone ? phone.getAttribute("href") : "";
    foot.innerHTML =
      '<a class="drawer-contact drawer-contact-wa" href="' + escapeHtml(waHref) + '" target="_blank" rel="noopener noreferrer">WhatsApp us</a>' +
      (telHref ? '<a class="drawer-contact" href="' + escapeHtml(telHref) + '">Call us</a>' : "");
  }

  function renderCategories(categories, products) {
    var list = document.getElementById("drawerCategories");
    var rows = [{ id: "all", name: "All products" }].concat(categories);
    var html = rows
      .map(function (category) {
        var count = products.filter(function (p) { return inCategory(p, category.id); }).length;
        if (!count) return "";
        return (
          '<li><a href="/shop?category=' + encodeURIComponent(category.id) + '" data-drawer-category="' + escapeHtml(category.id) + '">' +
          '<span class="drawer-cat-icon">' + svg(iconFor(category.id)) + "</span>" +
          '<span class="drawer-cat-name">' + escapeHtml(category.name) + "</span>" +
          '<span class="drawer-cat-count">' + count + "</span>" +
          svg("chevron", "drawer-chevron") +
          "</a></li>"
        );
      })
      .join("");
    list.innerHTML = html || '<li class="drawer-cats-loading">No categories yet.</li>';
  }

  var loaded = false;
  function loadCategories() {
    if (loaded) return;
    loaded = true;
    try {
      var cached = JSON.parse(window.sessionStorage.getItem(CACHE_KEY) || "null");
      if (cached && Date.now() - cached.at < 10 * 60 * 1000) {
        renderCategories(cached.categories, cached.products);
        return;
      }
    } catch (_e) { /* no storage */ }
    Promise.all([window.VibecraftApi.get("categories"), window.VibecraftApi.get("products")])
      .then(function (res) {
        var categories = (res[0] && res[0].data) || [];
        var products = ((res[1] && res[1].data) || []).map(function (p) { return { categoryId: p.categoryId }; });
        renderCategories(categories, products);
        try { window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), categories: categories, products: products })); } catch (_e) { /* ignore */ }
      })
      .catch(function () {
        loaded = false;
        document.getElementById("drawerCategories").innerHTML = '<li><a href="/shop" data-drawer-category="all"><span class="drawer-cat-icon">' + svg("all") + '</span><span class="drawer-cat-name">All products</span>' + svg("chevron", "drawer-chevron") + "</a></li>";
      });
  }

  function closeMenu() {
    if (nav.classList.contains("is-open")) toggle.click();
  }

  toggle.addEventListener("click", function () {
    if (nav.classList.contains("is-open")) {
      renderFoot();
      loadCategories();
    }
  });
  toggle.addEventListener("touchstart", loadCategories, { once: true, passive: true });

  nav.addEventListener("click", function (event) {
    var link = event.target.closest("[data-drawer-category]");
    if (!link || !isHome() || !window.VibecraftShowcase) return;
    event.preventDefault();
    closeMenu();
    window.VibecraftShowcase.showCategory(link.getAttribute("data-drawer-category"));
  });

  shop.querySelector(".drawer-search").addEventListener("submit", function (event) {
    var query = this.querySelector("input").value.trim();
    if (!isHome() || !window.VibecraftShowcase) return; // other pages: normal submit to /shop?search=…
    event.preventDefault();
    closeMenu();
    window.VibecraftShowcase.search(query);
  });
})();
