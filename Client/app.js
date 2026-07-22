(function () {
  "use strict";

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
    var link = document.querySelector("[data-auth-link]");

    if (!link || !window.VibecraftApi) return;

    try {
      var payload = await window.VibecraftApi.get("auth/me");

      if (payload && payload.data) {
        var user = payload.data;

        link.href = "account.html";
        link.textContent = "";
        if (user.profileImageUrl) {
          var profileImage = document.createElement("img");
          profileImage.src = user.profileImageUrl;
          profileImage.alt = "";
          profileImage.loading = "lazy";
          link.appendChild(profileImage);
        } else {
          link.textContent = getInitials(user);
        }
        link.classList.add("account-avatar-link");
        link.setAttribute("aria-label", "Open account menu for " + (user.name || user.email));
        link.title = user.name || user.email || "Account";
        wireCustomerAccountMenu(link, user);
        return;
      }
    } catch (_error) {
      // Not signed in as a customer - fall through to check for an admin session.
    }

    try {
      var adminPayload = await window.VibecraftApi.get("admin/auth/me");

      if (adminPayload && adminPayload.data) {
        link.href = "admin-dashboard.html";
        link.textContent = "Admin";
        link.setAttribute("aria-label", "Back to admin dashboard");
        link.title = "Back to admin dashboard";
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
