(function () {
  "use strict";

  var priceFormatter = new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 });
  var dateFormatter = new Intl.DateTimeFormat("en-KE", { month: "short", day: "numeric", year: "numeric" });
  var currentAccount = null;

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function redirectToLogin() {
    window.location.href = "login.html?next=" + encodeURIComponent("account.html");
  }

  function setStatus(el, message, isError) {
    el.textContent = message || "";
    el.classList.toggle("is-error", Boolean(isError));
  }

  function renderPasswordSection(account) {
    var heading = document.getElementById("passwordHeading");
    var currentField = document.getElementById("currentPasswordField");
    var currentInput = document.getElementById("currentPassword");
    var submitBtn = document.getElementById("passwordSubmit");

    if (account.hasPassword) {
      heading.textContent = "Password";
      currentField.hidden = false;
      currentInput.required = true;
      submitBtn.textContent = "Update password";
    } else {
      heading.textContent = "Set a password";
      currentField.hidden = true;
      currentInput.required = false;
      submitBtn.textContent = "Set password";
    }
  }

  function renderOrders(orders) {
    var listEl = document.getElementById("ordersList");
    var countEl = document.getElementById("orderCount");

    countEl.textContent = orders.length + (orders.length === 1 ? " order" : " orders");

    if (!orders.length) {
      listEl.innerHTML = '<p class="cart-empty">No orders yet. <a href="index.html#collection">Start shopping</a>.</p>';
      return;
    }

    listEl.innerHTML = orders.map(function (order) {
      var itemsHtml = order.items.map(function (item) {
        return "<li>" + item.quantity + "× " + escapeHtml(item.name) + "</li>";
      }).join("");
      var date = order.createdAt ? dateFormatter.format(new Date(order.createdAt)) : "—";

      return [
        '<div class="order-card">',
        '<div class="order-card-head"><span><strong>' + escapeHtml(order.orderNumber || "Order") + '</strong><br><span class="status-pill status-' + escapeHtml(order.status) + '">' + escapeHtml(order.status) + "</span></span>",
        '<span class="order-card-date">' + date + "</span></div>",
        '<ul class="order-card-items">' + itemsHtml + "</ul>",
        '<div class="order-card-total"><span>Total</span><strong>' + priceFormatter.format(order.total) + "</strong></div>",
        "</div>",
      ].join("");
    }).join("");
  }

  function renderWishlist() {
    var listEl = document.getElementById("wishlistList");
    var countEl = document.getElementById("wishlistCount");
    var items = window.VibecraftWishlist.getItems();

    countEl.textContent = items.length + (items.length === 1 ? " saved" : " saved");

    if (!items.length) {
      listEl.innerHTML = '<p class="cart-empty">No saved products yet. <a href="index.html#collection">Browse the collection</a>.</p>';
      return;
    }

    listEl.innerHTML = items.map(function (product) {
      var image = product.images && product.images[0] ? product.images[0] : "assets/outdoor-cinema.jpg";
      return '<article class="wishlist-item"><img src="' + escapeHtml(image) + '" alt="" loading="lazy"><div class="wishlist-item-copy"><a href="product.html?id=' + encodeURIComponent(product.id) + '"><strong>' + escapeHtml(product.name) + '</strong></a><span>' + priceFormatter.format(Number(product.price || 0)) + '</span></div><button class="wishlist-remove" type="button" data-remove-wishlist="' + escapeHtml(product.id) + '" aria-label="Remove ' + escapeHtml(product.name) + ' from wishlist">×</button></article>';
    }).join("");
  }

  async function loadOrders() {
    var listEl = document.getElementById("ordersList");

    try {
      var payload = await window.VibecraftApi.get("orders/mine");
      renderOrders((payload && payload.data) || []);
    } catch (_error) {
      listEl.innerHTML = '<p class="cart-empty">Could not load your orders.</p>';
    }
  }

  function applyAccount(account) {
    currentAccount = account;
    document.getElementById("accountGreeting").textContent = "Hey, " + (account.name || "there") + ".";
    document.getElementById("accountIntro").textContent = "Your orders, saved products, and password settings.";
    renderPasswordSection(account);
    document.getElementById("accountContent").hidden = false;
    document.getElementById("accountBottomActions").hidden = false;
  }

  async function boot() {
    var status = document.getElementById("accountStatus");
    var payload;

    try {
      payload = await window.VibecraftApi.get("auth/me");
    } catch (_error) {
      redirectToLogin();
      return;
    }

    var account = payload && payload.data;
    if (!account) {
      redirectToLogin();
      return;
    }

    applyAccount(account);
    status.textContent = "";
    renderWishlist();
    loadOrders();

    document.getElementById("wishlistList").addEventListener("click", function (event) {
      var removeButton = event.target.closest("[data-remove-wishlist]");
      if (!removeButton) return;
      window.VibecraftWishlist.remove(removeButton.getAttribute("data-remove-wishlist"));
      renderWishlist();
    });

    document.addEventListener("wishlist:change", renderWishlist);

    document.getElementById("passwordForm").addEventListener("submit", async function (event) {
      event.preventDefault();

      var form = event.target;
      var submitButton = form.querySelector("button[type=submit]");
      var passwordStatus = document.getElementById("passwordStatus");

      setStatus(passwordStatus, "Saving…");
      submitButton.disabled = true;

      try {
        await window.VibecraftApi.post("auth/change-password", {
          currentPassword: document.getElementById("currentPassword").value,
          newPassword: document.getElementById("newPassword").value,
        });
        form.reset();
        currentAccount.hasPassword = true;
        renderPasswordSection(currentAccount);
        setStatus(passwordStatus, "Password saved.");
      } catch (error) {
        setStatus(passwordStatus, error.message || "Could not update your password.", true);
      } finally {
        submitButton.disabled = false;
      }
    });

    document.getElementById("signOutButton").addEventListener("click", async function () {
      try {
        await window.VibecraftApi.post("auth/logout");
      } finally {
        window.location.href = "index.html";
      }
    });
  }

  boot();
})();
