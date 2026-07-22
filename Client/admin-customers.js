(function () {
  "use strict";

  var state = { customers: [] };
  var dateFormatter = new Intl.DateTimeFormat("en-KE", { month: "short", day: "numeric", year: "numeric" });

  var tableBody = document.getElementById("customersTableBody");
  var customerCount = document.getElementById("customerCount");

  function signupMethodPill(customer) {
    if (customer.hasGoogleLinked && customer.hasPassword) {
      return '<span class="auth-pill auth-pill-google">Google + password</span>';
    }
    if (customer.hasGoogleLinked) {
      return '<span class="auth-pill auth-pill-google">Google</span>';
    }
    return '<span class="auth-pill auth-pill-manual">Password</span>';
  }

  function renderCustomers() {
    customerCount.textContent = state.customers.length + (state.customers.length === 1 ? " customer" : " customers");

    if (!state.customers.length) {
      tableBody.innerHTML = '<tr class="empty-row"><td colspan="5">No registered customers yet.</td></tr>';
      return;
    }

    var escape = window.VibecraftAdmin.escapeHtml;

    tableBody.innerHTML = state.customers
      .map(function (customer) {
        var date = customer.createdAt ? dateFormatter.format(new Date(customer.createdAt)) : "—";

        return [
          "<tr>",
          "<td>" + escape(customer.name || "Customer") + "</td>",
          "<td>" + escape(customer.email || "—") + "</td>",
          "<td>" + escape(customer.phone || "—") + "</td>",
          "<td>" + signupMethodPill(customer) + "</td>",
          "<td>" + date + "</td>",
          "</tr>",
        ].join("");
      })
      .join("");
  }

  async function loadCustomers() {
    var payload = await window.VibecraftApi.get("admin/customers");
    state.customers = (payload && payload.data) || [];
    renderCustomers();
  }

  async function boot() {
    var admin = await window.VibecraftAdmin.requireSession();
    if (!admin) return;

    window.VibecraftAdmin.wireSignOut();
    window.VibecraftAdmin.renderAccountMenu(admin);

    try {
      await loadCustomers();
    } catch (error) {
      tableBody.innerHTML = '<tr class="empty-row"><td colspan="5">Could not load customers.</td></tr>';
    }
  }

  boot();
})();
