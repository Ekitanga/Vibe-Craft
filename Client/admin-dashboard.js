(function () {
  "use strict";

  var priceFormatter = new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 });
  var dateFormatter = new Intl.DateTimeFormat("en-KE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function renderRecentOrders(orders) {
    var body = document.getElementById("recentOrdersBody");
    var recent = orders.slice(0, 6);

    if (!recent.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="4">No orders yet.</td></tr>';
      return;
    }

    body.innerHTML = recent
      .map(function (order) {
        var name = window.VibecraftAdmin.escapeHtml((order.customer && order.customer.name) || "Customer");
        var total = priceFormatter.format(Number(order.total || 0));
        var status = window.VibecraftAdmin.escapeHtml(order.status);
        var date = order.createdAt ? dateFormatter.format(new Date(order.createdAt)) : "—";

        return (
          "<tr><td>" +
          name +
          "</td><td>" +
          total +
          '</td><td><span class="status-pill status-' +
          status +
          '">' +
          status +
          "</span></td><td>" +
          date +
          "</td></tr>"
        );
      })
      .join("");
  }

  var STATUS_COLORS = {
    pending: "var(--status-warning)",
    confirmed: "var(--muted)",
    processing: "var(--muted)",
    completed: "var(--status-good)",
    cancelled: "var(--status-critical)",
  };
  var STATUS_LABELS = { pending: "Pending", confirmed: "Confirmed", processing: "Processing", completed: "Completed", cancelled: "Cancelled" };
  var shortDateFormatter = new Intl.DateTimeFormat("en-KE", { month: "short", day: "numeric" });
  var compactPriceFormatter = new Intl.NumberFormat("en-KE", { notation: "compact", maximumFractionDigits: 1 });

  function dayKey(date) {
    return date.toISOString().slice(0, 10);
  }

  function computeAnalytics(orders, products, categories) {
    var productById = {};
    products.forEach(function (product) { productById[product.id] = product; });
    var categoryById = {};
    categories.forEach(function (category) { categoryById[category.id] = category; });

    var days = [];
    var dayMap = {};
    for (var i = 13; i >= 0; i--) {
      var date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - i);
      var entry = { key: dayKey(date), label: shortDateFormatter.format(date), value: 0 };
      days.push(entry);
      dayMap[entry.key] = entry;
    }

    var statusCounts = { pending: 0, confirmed: 0, processing: 0, completed: 0, cancelled: 0 };
    var productUnits = {};
    var categoryRevenue = {};
    var customerKeys = {};
    var totalRevenue = 0;

    orders.forEach(function (order) {
      if (Object.prototype.hasOwnProperty.call(statusCounts, order.status)) statusCounts[order.status] += 1;

      var customer = order.customer || {};
      var customerKey = customer.phone || customer.email || customer.name;
      if (customerKey) customerKeys[customerKey] = true;

      if (order.status === "cancelled") return;

      totalRevenue += Number(order.total || 0);

      if (order.createdAt) {
        var entryForDay = dayMap[dayKey(new Date(order.createdAt))];
        if (entryForDay) entryForDay.value += Number(order.total || 0);
      }

      (order.items || []).forEach(function (item) {
        productUnits[item.productId] = (productUnits[item.productId] || 0) + Number(item.quantity || 0);
        var product = productById[item.productId];
        var categoryId = product && product.categoryId;
        if (categoryId) categoryRevenue[categoryId] = (categoryRevenue[categoryId] || 0) + Number(item.lineTotal || 0);
      });
    });

    var topProducts = Object.keys(productUnits)
      .map(function (productId) {
        var product = productById[productId];
        return { label: (product && product.name) || "Unknown product", value: productUnits[productId] };
      })
      .sort(function (a, b) { return b.value - a.value; })
      .slice(0, 6)
      .map(function (row) { return Object.assign(row, { displayValue: row.value + (row.value === 1 ? " unit" : " units") }); });

    var categoryRows = Object.keys(categoryRevenue)
      .map(function (categoryId) {
        var category = categoryById[categoryId];
        var value = categoryRevenue[categoryId];
        return { label: (category && category.name) || categoryId, value: value, displayValue: priceFormatter.format(value) };
      })
      .sort(function (a, b) { return b.value - a.value; });

    var statusRows = ["pending", "confirmed", "processing", "completed", "cancelled"].map(function (statusKey) {
      var count = statusCounts[statusKey];
      return { label: STATUS_LABELS[statusKey], value: count, displayValue: String(count), color: STATUS_COLORS[statusKey] };
    });

    return {
      revenueByDay: days,
      statusRows: statusRows,
      topProducts: topProducts,
      categoryRows: categoryRows,
      totalRevenue: totalRevenue,
      customerCount: Object.keys(customerKeys).length,
    };
  }

  function renderAnalytics(analytics) {
    setText("statRevenue", compactPriceFormatter.format(analytics.totalRevenue));
    document.getElementById("statRevenue").title = priceFormatter.format(analytics.totalRevenue);
    setText("statCustomers", analytics.customerCount);

    window.VibecraftCharts.renderLineChart(document.getElementById("chartRevenue"), analytics.revenueByDay, {
      ariaLabel: "Revenue over the last 14 days",
      emptyMessage: "No revenue yet.",
      formatValue: function (value) { return "Ksh " + compactPriceFormatter.format(value); },
    });

    window.VibecraftCharts.renderBarChart(document.getElementById("chartStatus"), analytics.statusRows, {
      ariaLabel: "Orders by status",
      emptyMessage: "No orders yet.",
      color: function (row) { return row.color; },
      labelWidth: 96,
      valueWidth: 40,
    });

    window.VibecraftCharts.renderRankedList(document.getElementById("chartTopProducts"), analytics.topProducts, {
      ariaLabel: "Top products by units sold",
      emptyMessage: "No sales yet.",
    });

    window.VibecraftCharts.renderBarChart(document.getElementById("chartCategoryRevenue"), analytics.categoryRows, {
      ariaLabel: "Revenue by category",
      emptyMessage: "No sales yet.",
      labelWidth: 110,
      valueWidth: 90,
    });
  }

  async function loadDashboard() {
    var status = document.getElementById("dashboardStatus");

    try {
      var responses = await Promise.all([
        window.VibecraftApi.get("admin/products"),
        window.VibecraftApi.get("admin/orders"),
        window.VibecraftApi.get("categories"),
        window.VibecraftApi.get("settings"),
      ]);
      var products = (responses[0] && responses[0].data) || [];
      var orders = (responses[1] && responses[1].data) || [];
      var categories = (responses[2] && responses[2].data) || [];
      var settings = (responses[3] && responses[3].data) || {};
      var lowStockThreshold = Number(settings.lowStockThreshold);
      if (!Number.isInteger(lowStockThreshold)) lowStockThreshold = window.VibecraftAdmin.lowStockThreshold;
      var lowStock = products.filter(function (product) {
        return Number(product.stock || 0) <= lowStockThreshold;
      });
      var pending = orders.filter(function (order) {
        return order.status === "pending";
      });

      setText("statProducts", products.length);
      setText("statPending", pending.length);
      setText("statLowStock", lowStock.length);
      setText("statOrders", orders.length);
      renderRecentOrders(orders);
      renderAnalytics(computeAnalytics(orders, products, categories));
    } catch (error) {
      status.textContent = error.message || "Could not load dashboard data.";
    }
  }

  async function boot() {
    var admin = await window.VibecraftAdmin.requireSession();
    if (!admin) return;

    window.VibecraftAdmin.wireSignOut();
    window.VibecraftAdmin.renderAccountMenu(admin);
    loadDashboard();
  }

  boot();
})();
