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
