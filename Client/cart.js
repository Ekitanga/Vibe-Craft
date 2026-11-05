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
  var checkoutDiscountRow = document.getElementById("checkoutDiscountRow");
  var checkoutDiscount = document.getElementById("checkoutDiscount");
  var checkoutCounty = document.getElementById("checkoutCounty");
  var checkoutFulfilment = document.getElementById("checkoutFulfilment");
  var checkoutFulfilmentOptions = document.querySelectorAll("[data-fulfilment-option]");
  var checkoutPickupCard = document.querySelector(".checkout-pickup-card");
  var form = document.getElementById("checkoutForm");
  var checkoutStatus = document.getElementById("checkoutStatus");
  var checkoutReceipt = document.getElementById("checkoutReceipt");
  var products = [];
  var customerAccount = null;
  var LAST_ORDER_KEY = "vibecraft_last_order";
  var receiptDateFormatter = new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  var pickupDeliveryDraft = null;
  var appliedPromotion = null;
  var PICKUP_LOCATION = {
    county: "Nairobi",
    town: "Nairobi CBD",
    address: "Rasumal House, 4th floor, Shop 14 — Dlight Gift Shop / Heltz Driving School building",
    landmark: "Opposite Imenti House, Tom Mboya Street",
  };

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

  function updateSubtotal(amount) {
    var hasItems = window.VibecraftCart.getItems().length > 0;
    var county = checkoutCounty.value;
    var isPickup = checkoutFulfilment && checkoutFulfilment.value === "pickup";
    var deliveryFee = !isPickup && hasItems && county && window.VibecraftDelivery
      ? window.VibecraftDelivery.getFee(county)
      : 0;
    var freeDeliveryMinimum = window.VibecraftDelivery && window.VibecraftDelivery.getFreeDeliveryMinimum
      ? window.VibecraftDelivery.getFreeDeliveryMinimum()
      : 0;
    if (!isPickup && freeDeliveryMinimum > 0 && amount >= freeDeliveryMinimum) deliveryFee = 0;
    var discountAmount = appliedPromotion ? Number(appliedPromotion.discountAmount || 0) : 0;

    checkoutSubtotal.textContent = formatPrice(amount);
    checkoutDeliveryFee.textContent = formatPrice(deliveryFee);
    checkoutDeliveryFeeLabel.textContent = county ? "(" + county + ")" : "";
    checkoutDeliveryFeeRow.hidden = isPickup || !hasItems || !county;
    checkoutTotal.textContent = formatPrice(Math.max(0, amount + deliveryFee - discountAmount));
    if (checkoutDiscountRow) checkoutDiscountRow.hidden = !discountAmount;
    if (checkoutDiscount) checkoutDiscount.textContent = "− " + formatPrice(discountAmount);
  }

  function syncFulfilmentFields() {
    var isPickup = checkoutFulfilment && checkoutFulfilment.value === "pickup";
    var fieldIds = ["checkoutCounty", "checkoutTown", "checkoutAddress", "checkoutLandmark"];

    checkoutFulfilmentOptions.forEach(function (option) {
      var isActive = option.getAttribute("data-fulfilment-option") === checkoutFulfilment.value;
      option.classList.toggle("is-active", isActive);
      option.setAttribute("aria-pressed", String(isActive));
    });
    if (checkoutPickupCard) checkoutPickupCard.classList.toggle("is-visible", isPickup);

    if (isPickup) {
      if (!pickupDeliveryDraft) {
        pickupDeliveryDraft = fieldIds.reduce(function (draft, id) {
          draft[id] = document.getElementById(id).value;
          return draft;
        }, {});
      }

      document.getElementById("checkoutCounty").value = PICKUP_LOCATION.county;
      document.getElementById("checkoutTown").value = PICKUP_LOCATION.town;
      document.getElementById("checkoutAddress").value = PICKUP_LOCATION.address;
      document.getElementById("checkoutLandmark").value = PICKUP_LOCATION.landmark;
    } else if (pickupDeliveryDraft) {
      fieldIds.forEach(function (id) {
        document.getElementById(id).value = pickupDeliveryDraft[id] || "";
      });
      pickupDeliveryDraft = null;
    }

    fieldIds.forEach(function (id) {
      document.getElementById(id).disabled = isPickup;
    });
    updateSubtotal(computeSubtotal(window.VibecraftCart.getItems()));
  }

  function renderReceipt(order) {
    var customer = order.customer || {};
    var delivery = order.delivery || {};
    var pickupRequested = String(order.notes || "").indexOf("Pickup requested") !== -1;
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
      '<div class="receipt-section receipt-delivery"><h3>' + (pickupRequested ? "Pickup" : "Delivery") + "</h3>",
      address ? "<p>" + escapeHtml(address) + (delivery.landmark ? " · Near " + escapeHtml(delivery.landmark) : "") + "</p>" : "",
      preferredDelivery ? "<p>Preferred time: " + escapeHtml(preferredDelivery) + "</p>" : "",
      "</div>",
      '<div class="receipt-total receipt-subtotal"><span>Items subtotal</span><strong>',
      formatPrice(Number(order.subtotal || Math.max(0, Number(order.total || 0) - Number(order.deliveryFee || 0)))),
      '</strong></div><div class="receipt-total receipt-delivery-fee"><span>Transport fee</span><strong>',
      formatPrice(order.deliveryFee || 0),
      '</strong></div>',
      Number(order.discountAmount || 0) ? '<div class="receipt-total receipt-discount"><span>Promotion (' + escapeHtml(order.promotionCode || "") + ')</span><strong>− ' + formatPrice(order.discountAmount || 0) + '</strong></div>' : "",
      '<div class="receipt-total"><span>Total</span><strong>',
      formatPrice(order.total),
      '</strong></div><p class="receipt-payment"><strong>Payment:</strong> ',
      order.mpesaCode ? "M-Pesa code " + escapeHtml(order.mpesaCode) : "M-Pesa Paybill 522533, Account 8055906",
      '</p><div class="receipt-actions"><button class="button button-dark" type="button" id="printReceipt">Print / save PDF</button>',
      '<a class="button button-outline" href="' + (window.VibecraftContact ? window.VibecraftContact.toWhatsAppUrl(whatsappText) : "https://wa.me/254707472897?text=" + encodeURIComponent(whatsappText)) + '" target="_blank" rel="noopener noreferrer">Contact on WhatsApp</a></div></div>',
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

    if (appliedPromotion) {
      appliedPromotion = null;
      var promotionStatus = document.getElementById("promotionStatus");
      if (promotionStatus) promotionStatus.textContent = "Cart changed — reapply your promotion code.";
    }
    render();
  });

  document.getElementById("applyPromotion").addEventListener("click", async function () {
    var input = document.getElementById("checkoutPromotionCode");
    var promotionStatus = document.getElementById("promotionStatus");
    var button = document.getElementById("applyPromotion");
    var code = input.value.trim();
    if (!code) { appliedPromotion = null; promotionStatus.textContent = "Enter a code first."; promotionStatus.classList.add("is-error"); return; }
    button.disabled = true;
    promotionStatus.textContent = "Checking…";
    promotionStatus.classList.remove("is-error");
    try {
      var result = await window.VibecraftApi.post("promotions/validate", { code: code, subtotal: computeSubtotal(window.VibecraftCart.getItems()) });
      appliedPromotion = result && result.data ? result.data : null;
      promotionStatus.textContent = appliedPromotion ? "Promotion applied. ✨" : "Promotion could not be applied.";
      updateSubtotal(computeSubtotal(window.VibecraftCart.getItems()));
    } catch (error) {
      appliedPromotion = null;
      promotionStatus.textContent = error.message || "That code is not available.";
      promotionStatus.classList.add("is-error");
      updateSubtotal(computeSubtotal(window.VibecraftCart.getItems()));
    } finally {
      button.disabled = false;
    }
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    var cartItems = window.VibecraftCart.getItems();
    if (!cartItems.length) return;

    customerAccount = await window.VibecraftApi.getCurrentCustomer();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    var submitButton = form.querySelector("button[type=submit]");
    checkoutStatus.textContent = "Placing your order...";
    checkoutStatus.classList.remove("is-error");
    submitButton.disabled = true;
    var isPickup = checkoutFulfilment && checkoutFulfilment.value === "pickup";
    var notesValue = document.getElementById("checkoutNotes").value.trim();

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
        notes: isPickup
          ? ["Pickup requested at Vibecraft location.", notesValue].filter(Boolean).join(" ")
          : notesValue || undefined,
        mpesaCode: document.getElementById("checkoutMpesaCode").value.trim() || undefined,
        promotionCode: appliedPromotion ? appliedPromotion.promotion.code : undefined,
      });

      var order = response && response.data ? response.data : {};
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
    var selectedCounty = select.value;
    var counties = window.VibecraftDelivery && window.VibecraftDelivery.getAvailableCounties
      ? window.VibecraftDelivery.getAvailableCounties()
      : KENYA_COUNTIES;
    if (selectedCounty && counties.indexOf(selectedCounty) === -1) selectedCounty = "";
    select.innerHTML =
      '<option value="">Choose a county</option>' +
      counties.map(function (county) {
        return '<option value="' + escapeHtml(county) + '">' + escapeHtml(county) + "</option>";
      }).join("");
    select.value = selectedCounty;
  }

  function setDeliveryDateMin() {
    document.getElementById("checkoutDeliveryDate").min = new Date().toISOString().slice(0, 10);
  }

  function refreshCheckoutTotals() {
    populateCounties();
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
    window.addEventListener("vibecraft:delivery-settings", refreshCheckoutTotals);
    if (checkoutFulfilment) checkoutFulfilment.addEventListener("change", syncFulfilmentFields);
    checkoutFulfilmentOptions.forEach(function (option) {
      option.addEventListener("click", function () {
        checkoutFulfilment.value = option.getAttribute("data-fulfilment-option");
        syncFulfilmentFields();
      });
    });
    syncFulfilmentFields();

    try {
      customerAccount = await window.VibecraftApi.getCurrentCustomer();
      var payload = await window.VibecraftApi.get("products");
      products = (payload && payload.data) || [];
      render();
      var cartItems = window.VibecraftCart.getItems();
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
