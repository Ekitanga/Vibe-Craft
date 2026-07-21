(function () {
  "use strict";

  var statuses = ["pending", "confirmed", "processing", "completed", "cancelled"];
  var state = { orders: [] };
  var priceFormatter = new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 });
  var dateFormatter = new Intl.DateTimeFormat("en-KE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  var tableBody = document.getElementById("ordersTableBody");
  var orderCount = document.getElementById("orderCount");

  function statusOptions(selected) {
    return statuses
      .map(function (status) {
        var esc = window.VibecraftAdmin.escapeHtml(status);
        var label = status.charAt(0).toUpperCase() + status.slice(1);
        return '<option value="' + esc + '"' + (status === selected ? " selected" : "") + ">" + label + "</option>";
      })
      .join("");
  }

  function detailMarkup(order) {
    var escape = window.VibecraftAdmin.escapeHtml;
    var items = (order.items || [])
      .map(function (item) {
        return (
          "<li>" +
          item.quantity +
          "× " +
          escape(item.name) +
          " — " +
          priceFormatter.format(Number(item.lineTotal || 0)) +
          "</li>"
        );
      })
      .join("");

    var answers = (order.inquiryAnswers || [])
      .map(function (answer) {
        return "<li>" + escape(answer.questionLabel) + ": " + escape(answer.answerLabel || answer.answerValue) + "</li>";
      })
      .join("");

    return [
      '<div class="order-detail">',
      order.customer && order.customer.location ? "<div><strong>Location:</strong> " + escape(order.customer.location) + "</div>" : "",
      items ? '<div><strong>Items</strong><ul class="order-detail-items">' + items + "</ul></div>" : "",
      answers ? '<div><strong>Inquiry</strong><ul class="order-detail-items">' + answers + "</ul></div>" : "",
      order.notes ? '<p class="order-detail-notes">Notes: ' + escape(order.notes) + "</p>" : "",
      "</div>",
    ].join("");
  }

  function renderOrders() {
    orderCount.textContent = state.orders.length + (state.orders.length === 1 ? " order" : " orders");

    if (!state.orders.length) {
      tableBody.innerHTML = '<tr class="empty-row"><td colspan="7">No orders yet.</td></tr>';
      return;
    }

    var escape = window.VibecraftAdmin.escapeHtml;

    tableBody.innerHTML = state.orders
      .map(function (order) {
        var customer = order.customer || {};
        var date = order.createdAt ? dateFormatter.format(new Date(order.createdAt)) : "—";

        return [
          "<tr>",
          "<td>" + escape(customer.name || "Customer") + "</td>",
          "<td>" + escape(customer.phone || customer.email || "—") + "</td>",
          "<td>" + (order.items ? order.items.length : 0) + " item(s)</td>",
          "<td>" + priceFormatter.format(Number(order.total || 0)) + "</td>",
          '<td><select class="admin-status-select" data-order="' + escape(order.id) + '">' + statusOptions(order.status) + "</select></td>",
          "<td>" + date + "</td>",
          '<td><button type="button" data-toggle="' + escape(order.id) + '">Details</button></td>',
          "</tr>",
          '<tr class="order-detail-row is-hidden" data-detail-for="' + escape(order.id) + '">',
          '<td colspan="7">' + detailMarkup(order) + "</td>",
          "</tr>",
        ].join("");
      })
      .join("");
  }

  async function loadOrders() {
    var payload = await window.VibecraftApi.get("admin/orders");
    state.orders = (payload && payload.data) || [];
    renderOrders();
  }

  tableBody.addEventListener("click", function (event) {
    var toggleId = event.target.getAttribute("data-toggle");
    if (!toggleId) return;

    var row = tableBody.querySelector('[data-detail-for="' + toggleId + '"]');
    if (row) row.classList.toggle("is-hidden");
  });

  tableBody.addEventListener("change", async function (event) {
    var orderId = event.target.getAttribute("data-order");
    if (!orderId) return;

    var select = event.target;
    var previousValue = select.getAttribute("data-previous") || select.value;
    select.disabled = true;

    try {
      await window.VibecraftApi.patch("admin/orders/" + orderId + "/status", { status: select.value });
      select.setAttribute("data-previous", select.value);
    } catch (error) {
      select.value = previousValue;
      window.alert(error.message || "Could not update order status.");
    } finally {
      select.disabled = false;
    }
  });

  async function boot() {
    var admin = await window.VibecraftAdmin.requireSession();
    if (!admin) return;

    window.VibecraftAdmin.wireSignOut();
    window.VibecraftAdmin.renderAccountMenu(admin);

    try {
      await loadOrders();
    } catch (error) {
      tableBody.innerHTML = '<tr class="empty-row"><td colspan="7">Could not load orders.</td></tr>';
    }
  }

  boot();
})();
