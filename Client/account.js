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

  function renderProfilePhoto(account) {
    var photo = document.getElementById("profilePhoto");
    var fallback = document.getElementById("profilePhotoFallback");

    if (!photo || !fallback) return;

    fallback.textContent = String(account.name || account.email || "U").trim().slice(0, 1).toUpperCase();

    if (account.profileImageUrl) {
      photo.src = account.profileImageUrl;
      photo.hidden = false;
      fallback.hidden = true;
      return;
    }

    photo.removeAttribute("src");
    photo.hidden = true;
    fallback.hidden = false;
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

  async function handleGoogleLinkCredential(response) {
    var msgEl = document.getElementById("googleConnectionStatusMsg");

    try {
      var payload = await window.VibecraftApi.post("auth/google/link", { idToken: response.credential });
      currentAccount = payload.data;
      renderGoogleConnection(currentAccount);
      renderPasswordSection(currentAccount);
      setStatus(msgEl, "Google account connected.");
    } catch (error) {
      setStatus(msgEl, error.message || "Could not connect Google.", true);
    }
  }

  function renderGoogleConnection(account) {
    var statusEl = document.getElementById("googleConnectionStatus");
    var actionMount = document.getElementById("googleConnectionAction");
    var msgEl = document.getElementById("googleConnectionStatusMsg");

    actionMount.innerHTML = "";
    setStatus(msgEl, "");

    if (account.hasGoogleLinked) {
      statusEl.textContent = "Connected";

      var disconnectBtn = document.createElement("button");
      disconnectBtn.type = "button";
      disconnectBtn.className = "button button-outline";
      disconnectBtn.textContent = "Disconnect";
      disconnectBtn.addEventListener("click", async function () {
        if (!window.confirm("Disconnect your Google account? You'll still be able to sign in with your password.")) return;

        disconnectBtn.disabled = true;

        try {
          var payload = await window.VibecraftApi.post("auth/google/unlink");
          currentAccount = payload.data;
          renderGoogleConnection(currentAccount);
          renderPasswordSection(currentAccount);
          setStatus(msgEl, "Google account disconnected.");
        } catch (error) {
          setStatus(msgEl, error.message || "Could not disconnect Google.", true);
          disconnectBtn.disabled = false;
        }
      });
      actionMount.appendChild(disconnectBtn);
      return;
    }

    statusEl.textContent = "Not connected";

    var mountDiv = document.createElement("div");
    actionMount.appendChild(mountDiv);

    if (window.google && window.google.accounts && window.google.accounts.id && window.GOOGLE_CLIENT_ID) {
      window.google.accounts.id.initialize({
        client_id: window.GOOGLE_CLIENT_ID,
        callback: handleGoogleLinkCredential,
      });
      window.google.accounts.id.renderButton(mountDiv, {
        type: "standard",
        theme: "outline",
        size: "medium",
        shape: "pill",
        text: "signin_with",
      });
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

    listEl.innerHTML = orders
      .map(function (order) {
        var itemsHtml = order.items
          .map(function (item) {
            return "<li>" + item.quantity + "× " + escapeHtml(item.name) + "</li>";
          })
          .join("");
        var date = order.createdAt ? dateFormatter.format(new Date(order.createdAt)) : "—";

        return [
          '<div class="order-card">',
          '<div class="order-card-head">',
          '<span class="status-pill status-' + escapeHtml(order.status) + '">' + escapeHtml(order.status) + "</span>",
          '<span class="order-card-date">' + date + "</span>",
          "</div>",
          '<ul class="order-card-items">' + itemsHtml + "</ul>",
          '<div class="order-card-total"><span>Total</span><strong>' + priceFormatter.format(order.total) + "</strong></div>",
          "</div>",
        ].join("");
      })
      .join("");
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
    document.getElementById("accountIntro").textContent = "Manage your details, password, and orders.";
    document.getElementById("profileName").value = account.name || "";
    document.getElementById("profileEmail").value = account.email || "";
    document.getElementById("profilePhone").value = account.phone || "";
    renderProfilePhoto(account);

    renderPasswordSection(account);
    renderGoogleConnection(account);

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
    loadOrders();

    document.getElementById("profilePhotoInput").addEventListener("change", async function (event) {
      var file = event.target.files && event.target.files[0];
      var statusEl = document.getElementById("profilePhotoStatus");
      if (!file) return;

      var formData = new FormData();
      formData.append("image", file);
      setStatus(statusEl, "Uploading…");

      try {
        var payload = await window.VibecraftApi.upload("auth/me/avatar", formData);
        applyAccount(payload.data);
        setStatus(statusEl, "Profile photo saved.");
      } catch (error) {
        setStatus(statusEl, error.message || "Could not upload your profile photo.", true);
      } finally {
        event.target.value = "";
      }
    });

    document.getElementById("profileForm").addEventListener("submit", async function (event) {
      event.preventDefault();

      var form = event.target;
      var submitButton = form.querySelector("button[type=submit]");
      var profileStatus = document.getElementById("profileStatus");

      setStatus(profileStatus, "Saving…");
      submitButton.disabled = true;

      try {
        var payload = await window.VibecraftApi.patch("auth/me", {
          name: document.getElementById("profileName").value.trim(),
          phone: document.getElementById("profilePhone").value.trim(),
        });
        currentAccount = payload.data;
        document.getElementById("accountGreeting").textContent = "Hey, " + (currentAccount.name || "there") + ".";
        setStatus(profileStatus, "Saved.");
      } catch (error) {
        setStatus(profileStatus, error.message || "Could not save your profile.", true);
      } finally {
        submitButton.disabled = false;
      }
    });

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
