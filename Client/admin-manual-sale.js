/* Orders page: record a sale closed on WhatsApp, by phone or in the shop. */
(function () {
  "use strict";

  var section = document.getElementById("manualSaleSection");
  var form = document.getElementById("manualSaleForm");
  if (!section || !form) return;

  var productSelect = document.getElementById("saleProduct");
  var qtyInput = document.getElementById("saleQty");
  var itemsBody = document.getElementById("saleItems");
  var totalLabel = document.getElementById("saleTotal");
  var statusMessage = document.getElementById("saleStatusMessage");
  var fulfillment = document.getElementById("saleFulfillment");
  var deliveryFields = document.getElementById("saleDeliveryFields");
  var products = [];
  var items = [];

  function escape(value) {
    return window.VibecraftAdmin.escapeHtml(value);
  }

  function kes(amount) {
    return "KES " + Math.round(Number(amount || 0)).toLocaleString("en-KE");
  }

  function setStatus(message, isError) {
    statusMessage.textContent = message || "";
    statusMessage.classList.toggle("is-error", Boolean(isError));
  }

  function findProduct(id) {
    return products.find(function (product) { return product.id === id; });
  }

  function renderItems() {
    if (!items.length) {
      itemsBody.innerHTML = '<tr class="empty-row"><td colspan="4">No items yet.</td></tr>';
      totalLabel.textContent = "";
      return;
    }
    var subtotal = 0;
    itemsBody.innerHTML = items.map(function (item, index) {
      var product = findProduct(item.productId) || { name: item.productId, price: 0 };
      var line = Number(product.price || 0) * item.quantity;
      subtotal += line;
      return "<tr><td>" + escape(product.name) + "</td><td>" + item.quantity + "</td><td>" + kes(line) +
        '</td><td><button type="button" class="text-button is-danger" data-remove-item="' + index + '">Remove</button></td></tr>';
    }).join("");
    totalLabel.textContent = "· " + kes(subtotal) + (fulfillment.value === "delivery" ? " + delivery" : "");
  }

  async function loadProducts() {
    var payload = await window.VibecraftApi.get("products");
    products = (payload && payload.data) || [];
    productSelect.innerHTML = '<option value="">Choose a product</option>' + products.map(function (product) {
      var stock = Number(product.stock || 0);
      return '<option value="' + escape(product.id) + '"' + (stock <= 0 ? " disabled" : "") + ">" + escape(product.name) + " — " + kes(product.price) +
        (stock <= 0 ? " (out of stock)" : " (" + stock + " in stock)") + "</option>";
    }).join("");
  }

  document.getElementById("saleAddItem").addEventListener("click", function () {
    var productId = productSelect.value;
    var quantity = Number(qtyInput.value);
    if (!productId) { setStatus("Choose a product first.", true); return; }
    if (!Number.isInteger(quantity) || quantity < 1) { setStatus("Quantity must be a whole number of at least 1.", true); return; }
    var existing = items.find(function (item) { return item.productId === productId; });
    if (existing) existing.quantity += quantity;
    else items.push({ productId: productId, quantity: quantity });
    qtyInput.value = "1";
    productSelect.value = "";
    setStatus("");
    renderItems();
  });

  itemsBody.addEventListener("click", function (event) {
    var button = event.target.closest("[data-remove-item]");
    if (!button) return;
    items.splice(Number(button.getAttribute("data-remove-item")), 1);
    renderItems();
  });

  fulfillment.addEventListener("change", function () {
    deliveryFields.hidden = fulfillment.value !== "delivery";
    renderItems();
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!items.length) { setStatus("Add at least one item.", true); return; }
    var value = function (id) { return document.getElementById(id).value.trim(); };
    if (value("saleName").length < 2 || value("salePhone").replace(/\D/g, "").length < 9) {
      setStatus("Enter the customer's name and a valid phone number.", true);
      return;
    }

    var isDelivery = fulfillment.value === "delivery";
    var payload = {
      channel: value("saleChannel"),
      status: value("saleStatus"),
      customer: { name: value("saleName"), phone: value("salePhone"), email: value("saleEmail") || undefined },
      items: items,
      fulfillment: fulfillment.value,
      delivery: isDelivery ? { county: value("saleCounty"), town: value("saleTown"), address: value("saleAddress") } : {},
      deliveryFee: isDelivery && value("saleDeliveryFee") !== "" ? Number(value("saleDeliveryFee")) : undefined,
      mpesaCode: value("saleMpesa") || undefined,
      paid: document.getElementById("salePaid").checked,
      fromMetaAd: document.getElementById("saleFromAd").checked,
      campaign: value("saleCampaign") || undefined,
      notes: value("saleNotes") || undefined,
    };

    var submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    setStatus("Recording…");
    try {
      var response = await window.VibecraftApi.post("admin/orders/manual", payload);
      var order = response.data || {};
      form.reset();
      items = [];
      deliveryFields.hidden = true;
      renderItems();
      await loadProducts();
      setStatus("Recorded " + (order.orderNumber || "the sale") + " for " + kes(order.total) + ". Stock and reports are updated.");
      document.dispatchEvent(new CustomEvent("orders:changed"));
    } catch (error) {
      setStatus(error.message || "Could not record the sale.", true);
    } finally {
      submit.disabled = false;
    }
  });

  async function boot() {
    var payload;
    try {
      payload = await window.VibecraftApi.get("admin/auth/me");
    } catch (_error) {
      return;
    }
    var admin = payload && payload.data;
    if (!admin || !window.VibecraftAdmin.can("orders.manage", admin)) return;
    section.hidden = false;
    if (!window.VibecraftAdmin.can("payments.verify", admin)) {
      var paid = document.getElementById("salePaid");
      paid.disabled = true;
      paid.parentElement.title = "Needs the Verify payments permission";
    }
    try {
      await loadProducts();
    } catch (_error) {
      productSelect.innerHTML = '<option value="">Could not load products</option>';
    }
  }

  boot();
})();
