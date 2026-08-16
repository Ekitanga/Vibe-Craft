(function () {
  "use strict";

  var KENYA_COUNTIES = [
    "Mombasa", "Kwale", "Kilifi", "Tana River", "Lamu", "Taita-Taveta", "Garissa", "Wajir", "Mandera",
    "Marsabit", "Isiolo", "Meru", "Tharaka-Nithi", "Embu", "Kitui", "Machakos", "Makueni", "Nyandarua",
    "Nyeri", "Kirinyaga", "Murang'a", "Kiambu", "Turkana", "West Pokot", "Samburu", "Trans Nzoia",
    "Uasin Gishu", "Elgeyo-Marakwet", "Nandi", "Baringo", "Laikipia", "Nakuru", "Narok", "Kajiado",
    "Kericho", "Bomet", "Kakamega", "Vihiga", "Bungoma", "Busia", "Siaya", "Kisumu", "Homa Bay",
    "Migori", "Kisii", "Nyamira", "Nairobi",
  ];

  var itemsList = document.getElementById("cartItemsList");
  var checkoutSubtotal = document.getElementById("checkoutSubtotal");
  var checkoutDeliveryFeeRow = document.getElementById("checkoutDeliveryFeeRow");
  var checkoutDeliveryFeeLabel = document.getElementById("checkoutDeliveryFeeLabel");
  var checkoutDeliveryFee = document.getElementById("checkoutDeliveryFee");
  var checkoutTotal = document.getElementById("checkoutTotal");
  var checkoutCounty = document.getElementById("checkoutCounty");
  var form = document.getElementById("checkoutForm");
  var checkoutAuthGate = document.getElementById("checkoutAuthGate");
  var checkoutStatus = document.getElementById("checkoutStatus");
  var checkoutReceipt = document.getElementById("checkoutReceipt");
  var products = [];
  var customerAccount = null;
  var LAST_ORDER_KEY = "vibecraft_last_order";
  var receiptDateFormatter = new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

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

  function pixelCartParams(cartItems, value) {
    return {
      content_ids: cartItems.map(function (item) { return item.productId; }),
      contents: cartItems.map(function (item) {
        return { id: item.productId, quantity: item.quantity };
      }),
      content_type: "product",
      num_items: cartItems.reduce(function (sum, item) { return sum + item.quantity; }, 0),
      value: Number(value || 0),
      currency: "KES",
    };
  }

  function updateSubtotal(amount) {
    var hasItems = window.VibecraftCart.getItems().length > 0;
    var county = checkoutCounty.value;
    var deliveryFee = hasItems && county && window.VibecraftDelivery
      ? window.VibecraftDelivery.getFee(county)
      : 0;

    checkoutSubtotal.textContent = formatPrice(amount);
    checkoutDeliveryFee.textContent = formatPrice(deliveryFee);
    checkoutDeliveryFeeLabel.textContent = county ? "(" + county + ")" : "";
    checkoutDeliveryFeeRow.hidden = !hasItems || !county;
    checkoutTotal.textContent = formatPrice(amount + deliveryFee);
  }

  function renderReceipt(order) {
    var customer = order.customer || {};
    var delivery = order.delivery || {};
    var orderNumber = order.orderNumber || "VC-" + String(order.id || "").replace(/-/g, "").slice(-8).toUpperCase();
    var paid = Boolean(order.paymentVerified);
    var paymentStatus = paid ? "Payment verified" : "Payment pending verification";
    var address = [delivery.address, delivery.town, delivery.county].filter(Boolean).join(", ");
    var preferredDelivery = [delivery.preferredDate, delivery.preferredTime].filter(Boolean).join(" · ");
    var itemRows = (order.items || [])
      .map(function (item) {
        return [
          "<tr><td>",
          escapeHtml(item.name),
          "<small>",
          escapeHtml(item.quantity),
          " × ",
          formatPrice(item.unitPrice),
          " each</small></td><td>",
          formatPrice(item.lineTotal),
          "</td></tr>",
        ].join("");
      })
      .join("");
    var whatsappText = [
      "Hello Vibecraft, I am following up on order " + orderNumber + ".",
      "Customer: " + (customer.name || ""),
      "Total: " + formatPrice(order.total),
      order.mpesaCode ? "M-Pesa code: " + order.mpesaCode : "Payment code: pending",
    ].join("\n");

    checkoutReceipt.innerHTML = [
      '<div class="receipt-card">',
      '<div class="receipt-head"><div><p class="eyebrow">Vibecraft254</p><h2>',
      paid ? "Payment receipt" : "Order confirmation",
      "</h2><p class=\"receipt-intro\">",
      paid ? "Your payment has been verified." : "Your order is received and we will confirm payment shortly.",
      '</p></div><span class="status-pill ',
      paid ? "status-completed" : "status-pending",
      '">',
      paymentStatus,
      "</span></div>",
      '<div class="receipt-meta">',
      '<div><span>Order number</span><strong>',
      escapeHtml(orderNumber),
      "</strong></div><div><span>Date</span><strong>",
      escapeHtml(receiptDateFormatter.format(new Date(order.createdAt || Date.now()))),
      "</strong></div><div><span>Customer</span><strong>",
      escapeHtml(customer.name || "Customer"),
      "</strong></div><div><span>Phone</span><strong>",
      escapeHtml(customer.phone || "—"),
      "</strong></div></div>",
      '<div class="receipt-section"><h3>Items</h3><table class="receipt-items"><tbody>',
      itemRows,
      "</tbody></table></div>",
      '<div class="receipt-section receipt-delivery"><h3>Delivery</h3>',
      address ? "<p>" + escapeHtml(address) + (delivery.landmark ? " · Near " + escapeHtml(delivery.landmark) : "") + "</p>" : "",
      preferredDelivery ? "<p>Preferred time: " + escapeHtml(preferredDelivery) + "</p>" : "",
      "</div>",
      '<div class="receipt-total receipt-subtotal"><span>Items subtotal</span><strong>',
      formatPrice(Number(order.subtotal || Math.max(0, Number(order.total || 0) - Number(order.deliveryFee || 0)))),
      '</strong></div><div class="receipt-total receipt-delivery-fee"><span>Transport fee</span><strong>',
      formatPrice(order.deliveryFee || 0),
      '</strong></div><div class="receipt-total"><span>Total</span><strong>',
      formatPrice(order.total),
      '</strong></div><p class="receipt-payment"><strong>Payment:</strong> ',
      order.mpesaCode ? "M-Pesa code " + escapeHtml(order.mpesaCode) : "M-Pesa Paybill 522533, Account 8055906",
      '</p><div class="receipt-actions"><button class="button button-dark" type="button" id="printReceipt">Print / save PDF</button>',
      '<a class="button button-outline" href="https://wa.me/254707472897?text=',
      encodeURIComponent(whatsappText),
      '" target="_blank" rel="noopener noreferrer">Contact on WhatsApp</a></div></div>',
    ].join("");

    checkoutReceipt.hidden = false;
    document.getElementById("printReceipt").addEventListener("click", function () {
      window.print();
    });
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

    if (cartItems.length) checkoutReceipt.hidden = true;

    if (!cartItems.length) {
      itemsList.innerHTML = '<p class="cart-empty-state">Your cart is empty. <a href="index.html#collection">Browse the range</a>.</p>';
      form.hidden = true;
      if (checkoutAuthGate) checkoutAuthGate.hidden = true;
      updateSubtotal(0);
      return;
    }

    form.hidden = !customerAccount;
    if (checkoutAuthGate) checkoutAuthGate.hidden = Boolean(customerAccount);

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

    var customer = await window.VibecraftApi.requireCustomer();
    if (!customer) return;
    customerAccount = customer;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    var submitButton = form.querySelector("button[type=submit]");
    checkoutStatus.textContent = "Placing your order...";
    checkoutStatus.classList.remove("is-error");
    submitButton.disabled = true;

    try {
      var response = await window.VibecraftApi.post("orders", {
        customer: {
          name: document.getElementById("checkoutName").value.trim(),
          phone: document.getElementById("checkoutPhone").value.trim(),
          email: document.getElementById("checkoutEmail").value.trim() || undefined,
        },
        delivery: {
          county: document.getElementById("checkoutCounty").value,
          town: document.getElementById("checkoutTown").value.trim(),
          address: document.getElementById("checkoutAddress").value.trim(),
          landmark: document.getElementById("checkoutLandmark").value.trim() || undefined,
          preferredDate: document.getElementById("checkoutDeliveryDate").value || undefined,
          preferredTime: document.getElementById("checkoutDeliveryTime").value || undefined,
        },
        items: cartItems.map(function (item) {
          return { productId: item.productId, quantity: item.quantity };
        }),
        notes: document.getElementById("checkoutNotes").value.trim() || undefined,
        mpesaCode: document.getElementById("checkoutMpesaCode").value.trim() || undefined,
      });

      var order = response && response.data ? response.data : {};
      if (window.VibecraftMeta) {
        window.VibecraftMeta.track("Purchase", pixelCartParams(cartItems, order.total || computeSubtotal(cartItems)));
      }
      try {
        window.sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
      } catch (_error) {
        // The receipt still works for the current page if session storage is unavailable.
      }
      renderReceipt(order);
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

  function populateCounties() {
    var select = document.getElementById("checkoutCounty");
    select.innerHTML =
      '<option value="">Choose a county</option>' +
      KENYA_COUNTIES.map(function (county) {
        return '<option value="' + county + '">' + county + "</option>";
      }).join("");
  }

  function setDeliveryDateMin() {
    document.getElementById("checkoutDeliveryDate").min = new Date().toISOString().slice(0, 10);
  }

  function refreshCheckoutTotals() {
    updateSubtotal(computeSubtotal(window.VibecraftCart.getItems()));
  }

  function restoreLastReceipt() {
    if (window.VibecraftCart.getItems().length) return;

    try {
      var saved = window.sessionStorage.getItem(LAST_ORDER_KEY);
      if (saved) renderReceipt(JSON.parse(saved));
    } catch (_error) {
      // Ignore malformed or unavailable session data.
    }
  }

  async function boot() {
    populateCounties();
    setDeliveryDateMin();
    checkoutCounty.addEventListener("change", refreshCheckoutTotals);

    try {
      customerAccount = await window.VibecraftApi.getCurrentCustomer();
      var payload = await window.VibecraftApi.get("products");
      products = (payload && payload.data) || [];
      render();
      var cartItems = window.VibecraftCart.getItems();
      if (cartItems.length && window.VibecraftMeta) {
        window.VibecraftMeta.track("InitiateCheckout", pixelCartParams(cartItems, computeSubtotal(cartItems)));
      }
      if (customerAccount) {
        restoreLastReceipt();
        prefillFromAccount();
      }
    } catch (_error) {
      itemsList.innerHTML = '<p class="cart-empty-state">Could not load your cart.</p>';
    }
  }

  boot();
})();
