(function () {
  "use strict";

  var state = { admins: [] };
  var dateFormatter = new Intl.DateTimeFormat("en-KE", { month: "short", day: "numeric", year: "numeric" });
  var currentAdminId = null;

  var form = document.getElementById("adminInviteForm");
  var formStatus = document.getElementById("adminInviteStatus");
  var tableBody = document.getElementById("adminsTableBody");
  var adminCount = document.getElementById("adminCount");

  var passwordForm = document.getElementById("adminChangePasswordForm");
  var passwordStatus = document.getElementById("adminChangePasswordStatus");

  function setFormStatus(message, isError) {
    formStatus.textContent = message || "";
    formStatus.classList.toggle("is-error", Boolean(isError));
  }

  function setPasswordStatus(message, isError) {
    passwordStatus.textContent = message || "";
    passwordStatus.classList.toggle("is-error", Boolean(isError));
  }

  function renderAdmins() {
    adminCount.textContent = state.admins.length + (state.admins.length === 1 ? " admin" : " admins");

    if (!state.admins.length) {
      tableBody.innerHTML = '<tr class="empty-row"><td colspan="3">No admins yet.</td></tr>';
      return;
    }

    var escape = window.VibecraftAdmin.escapeHtml;

    tableBody.innerHTML = state.admins
      .map(function (admin) {
        var name = escape(admin.name || "Admin") + (admin.id === currentAdminId ? " (you)" : "");
        var date = admin.createdAt ? dateFormatter.format(new Date(admin.createdAt)) : "—";

        return "<tr><td>" + name + "</td><td>" + escape(admin.email) + "</td><td>" + date + "</td></tr>";
      })
      .join("");
  }

  async function loadAdmins() {
    var payload = await window.VibecraftApi.get("admin/admins");
    state.admins = (payload && payload.data) || [];
    renderAdmins();
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    var submitButton = form.querySelector("button[type=submit]");
    var payload = {
      name: document.getElementById("adminName").value.trim(),
      email: document.getElementById("adminEmail").value.trim(),
      password: document.getElementById("adminPassword").value,
    };

    setFormStatus("Adding…");
    submitButton.disabled = true;

    try {
      await window.VibecraftApi.post("admin/admins", payload);
      form.reset();
      await loadAdmins();
      setFormStatus("Admin added.");
    } catch (error) {
      setFormStatus(error.message || "Could not add this admin.", true);
    } finally {
      submitButton.disabled = false;
    }
  });

  passwordForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    var submitButton = passwordForm.querySelector("button[type=submit]");
    var payload = {
      currentPassword: document.getElementById("currentPassword").value,
      newPassword: document.getElementById("newPassword").value,
    };

    setPasswordStatus("Updating…");
    submitButton.disabled = true;

    try {
      await window.VibecraftApi.post("admin/auth/change-password", payload);
      passwordForm.reset();
      setPasswordStatus("Password updated.");
    } catch (error) {
      setPasswordStatus(error.message || "Could not update your password.", true);
    } finally {
      submitButton.disabled = false;
    }
  });

  async function boot() {
    var admin = await window.VibecraftAdmin.requireSession();
    if (!admin) return;

    currentAdminId = admin.id;

    window.VibecraftAdmin.wireSignOut();
    window.VibecraftAdmin.renderAccountMenu(admin);

    try {
      await loadAdmins();
    } catch (error) {
      tableBody.innerHTML = '<tr class="empty-row"><td colspan="3">Could not load admins.</td></tr>';
    }
  }

  boot();
})();
