(function () {
  "use strict";

  var itemsList = document.getElementById("cartItemsList");
  var checkoutSubtotal = document.getElementById("checkoutSubtotal");
  var form = document.getElementById("checkoutForm");
  var checkoutStatus = document.getElementById("checkoutStatus");
  var products = [];

  function formatPrice(amount, currency) {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: currency || "KES",
      maximumFractionDigits: 0,
    }).format(Number(amount || 0));
  }

  function findProduct(id) {
    return products.find(function (product) {
      return product.id === id;
    });
  }

  function computeSubtotal(cartItems) {
    return cartItems.reduce(function (sum, item) {
      var product = findProduct(item.productId);
      return sum + (product ? product.price * item.quantity : 0);
    }, 0);
  }

  function updateSubtotal(amount) {
    checkoutSubtotal.textContent = formatPrice(amount);
  }

  function renderCartLine(item, product) {
    var image = product.images && product.images[0];

    return [
      '<div class="cart-line">',
      '<div class="cart-line-media">' + (image ? '<img src="' + image + '" alt="" />' : "") + "</div>",
      '<div class="cart-line-body">',
      "<h4>" + product.name + "</h4>",
      "<span>" + formatPrice(product.price, product.currency) + "</span>",
      '<div class="cart-line-controls">',
      '<div class="cart-qty">',
      '<button type="button" data-qty-minus="' + product.id + '" aria-label="Decrease quantity">−</button>',
      "<span>" + item.quantity + "</span>",
      '<button type="button" data-qty-plus="' + product.id + '" aria-label="Increase quantity">+</button>',
      "</div>",
      '<button type="button" class="cart-line-remove" data-remove="' + product.id + '">Remove</button>',
      "</div>",
      "</div>",
      "</div>",
    ].join("");
  }

  function render() {
    var cartItems = window.VibecraftCart.getItems();

    if (!cartItems.length) {
      itemsList.innerHTML = '<p class="cart-empty-state">Your cart is empty. <a href="index.html#collection">Browse the range</a>.</p>';
      form.hidden = true;
      updateSubtotal(0);
      return;
    }

    form.hidden = false;

    itemsList.innerHTML = cartItems
      .map(function (item) {
        var product = findProduct(item.productId);
        return product ? renderCartLine(item, product) : "";
      })
      .join("");

    updateSubtotal(computeSubtotal(cartItems));
  }

  itemsList.addEventListener("click", function (event) {
    var minusId = event.target.getAttribute("data-qty-minus");
    var plusId = event.target.getAttribute("data-qty-plus");
    var removeId = event.target.getAttribute("data-remove");

    if (!minusId && !plusId && !removeId) return;

    var cartItems = window.VibecraftCart.getItems();

    if (minusId) {
      var item = cartItems.find(function (candidate) {
        return candidate.productId === minusId;
      });
      if (item) window.VibecraftCart.setQuantity(minusId, item.quantity - 1);
    } else if (plusId) {
      var item2 = cartItems.find(function (candidate) {
        return candidate.productId === plusId;
      });
      if (item2) window.VibecraftCart.setQuantity(plusId, item2.quantity + 1);
    } else if (removeId) {
      window.VibecraftCart.removeItem(removeId);
    }

    render();
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    var cartItems = window.VibecraftCart.getItems();
    if (!cartItems.length) return;

    var submitButton = form.querySelector("button[type=submit]");
    checkoutStatus.textContent = "Placing your order...";
    checkoutStatus.classList.remove("is-error");
    submitButton.disabled = true;

    try {
      await window.VibecraftApi.post("orders", {
        customer: {
          name: document.getElementById("checkoutName").value.trim(),
          phone: document.getElementById("checkoutPhone").value.trim(),
          email: document.getElementById("checkoutEmail").value.trim() || undefined,
          location: document.getElementById("checkoutLocation").value.trim() || undefined,
        },
        items: cartItems.map(function (item) {
          return { productId: item.productId, quantity: item.quantity };
        }),
        notes: document.getElementById("checkoutNotes").value.trim() || undefined,
      });

      window.VibecraftCart.clear();
      itemsList.innerHTML = '<p class="cart-empty-state">Thank you — your order has been placed. We’ll reach out shortly to confirm.</p>';
      form.hidden = true;
      updateSubtotal(0);
    } catch (error) {
      checkoutStatus.textContent = error.message || "Could not place your order.";
      checkoutStatus.classList.add("is-error");
      submitButton.disabled = false;
    }
  });

  async function prefillFromAccount() {
    try {
      var payload = await window.VibecraftApi.get("auth/me");
      var account = payload && payload.data;
      if (!account) return;

      if (account.name) document.getElementById("checkoutName").value = account.name;
      if (account.phone) document.getElementById("checkoutPhone").value = account.phone;
      if (account.email) document.getElementById("checkoutEmail").value = account.email;
    } catch (_error) {
      // Not signed in - leave the checkout form blank.
    }
  }

  async function boot() {
    try {
      var payload = await window.VibecraftApi.get("products");
      products = (payload && payload.data) || [];
      render();
      prefillFromAccount();
    } catch (_error) {
      itemsList.innerHTML = '<p class="cart-empty-state">Could not load your cart.</p>';
    }
  }

  boot();
})();
