(function () {
  "use strict";

  var state = { admins: [], roles: [], me: null };
  var dateFormatter = new Intl.DateTimeFormat("en-KE", { month: "short", day: "numeric", year: "numeric" });

  var form = document.getElementById("adminInviteForm");
  var formStatus = document.getElementById("adminInviteStatus");
  var inviteSection = document.getElementById("inviteSection");
  var roleSelect = document.getElementById("adminRole");
  var tableBody = document.getElementById("adminsTableBody");
  var adminCount = document.getElementById("adminCount");
  var auditTableBody = document.getElementById("auditTableBody");
  var auditSection = auditTableBody ? auditTableBody.closest(".admin-panel") : null;

  var passwordForm = document.getElementById("adminChangePasswordForm");
  var passwordStatus = document.getElementById("adminChangePasswordStatus");
  var passwordNotice = document.getElementById("passwordChangeNotice");

  function escape(value) {
    return window.VibecraftAdmin.escapeHtml(value);
  }

  function setFormStatus(message, isError) {
    formStatus.textContent = message || "";
    formStatus.classList.toggle("is-error", Boolean(isError));
  }

  function setPasswordStatus(message, isError) {
    passwordStatus.textContent = message || "";
    passwordStatus.classList.toggle("is-error", Boolean(isError));
  }

  function can(permission) {
    return window.VibecraftAdmin.can(permission, state.me);
  }

  function isOwner() {
    return state.me && state.me.role === "owner";
  }

  // Roles this admin may hand out: lower rank than their own (owners: any).
  function assignableRoles() {
    return state.roles.filter(function (role) {
      return isOwner() || role.rank < state.me.rank;
    });
  }

  function canManage(target) {
    if (!can("team.manage") || !state.me || target.id === state.me.id) return false;
    return isOwner() || Number(target.rank || 0) < Number(state.me.rank || 0);
  }

  function renderRoleOptions() {
    var roles = assignableRoles();
    if (!roles.length) return;
    roleSelect.innerHTML = roles
      .map(function (role) {
        return '<option value="' + escape(role.key) + '">' + escape(role.name) + (role.description ? " — " + escape(role.description) : "") + "</option>";
      })
      .join("");
    var lowest = roles[roles.length - 1];
    if (lowest) roleSelect.value = lowest.key;
  }

  function roleCell(admin) {
    if (!canManage(admin)) return escape(admin.roleName || admin.role || "admin");
    var options = assignableRoles();
    if (!options.some(function (role) { return role.key === admin.role; })) {
      options = [{ key: admin.role, name: admin.roleName || admin.role }].concat(options);
    }
    return '<select class="admin-status-select" data-role-for="' + escape(admin.id) + '" aria-label="Role for ' + escape(admin.name || admin.email) + '">' +
      options.map(function (role) {
        return '<option value="' + escape(role.key) + '"' + (role.key === admin.role ? " selected" : "") + ">" + escape(role.name) + "</option>";
      }).join("") +
      "</select>";
  }

  function statusCell(admin) {
    var label = admin.isActive ? "Active" : "Disabled";
    var pill = '<span class="status-pill ' + (admin.isActive ? "status-completed" : "status-cancelled") + '">' + label + "</span>";
    var sessions = admin.activeSessions ? '<small>' + admin.activeSessions + " signed-in device" + (admin.activeSessions === 1 ? "" : "s") + "</small>" : "";
    var last = admin.lastLoginAt ? '<small>Last sign-in ' + dateFormatter.format(new Date(admin.lastLoginAt)) + "</small>" : "";
    return pill + sessions + last;
  }

  function actionsCell(admin) {
    if (!canManage(admin)) {
      if (state.me && admin.id === state.me.id) {
        return '<button type="button" class="text-button" data-action="revoke" data-id="' + escape(admin.id) + '">Sign out other devices</button>';
      }
      return "—";
    }
    var id = escape(admin.id);
    return '<div class="admin-table-actions">' +
      '<button type="button" class="text-button" data-action="toggle" data-id="' + id + '">' + (admin.isActive ? "Disable" : "Enable") + "</button>" +
      '<button type="button" class="text-button" data-action="reset" data-id="' + id + '">Reset password</button>' +
      '<button type="button" class="text-button" data-action="revoke" data-id="' + id + '">Sign out everywhere</button>' +
      '<button type="button" class="text-button is-danger" data-action="remove" data-id="' + id + '">Remove</button>' +
      "</div>";
  }

  function renderAdmins() {
    adminCount.textContent = state.admins.length + (state.admins.length === 1 ? " admin" : " admins");

    if (!state.admins.length) {
      tableBody.innerHTML = '<tr class="empty-row"><td colspan="6">No admins yet.</td></tr>';
      return;
    }

    tableBody.innerHTML = state.admins
      .map(function (admin) {
        var name = escape(admin.name || "Admin") + (state.me && admin.id === state.me.id ? " (you)" : "");
        var date = admin.createdAt ? dateFormatter.format(new Date(admin.createdAt)) : "—";
        return "<tr><td>" + name + "</td><td>" + escape(admin.email) + "</td><td>" + roleCell(admin) + "</td><td>" +
          statusCell(admin) + "</td><td>" + date + "</td><td>" + actionsCell(admin) + "</td></tr>";
      })
      .join("");
  }

  async function loadAdmins() {
    var payload = await window.VibecraftApi.get("admin/admins");
    state.admins = (payload && payload.data) || [];
    renderAdmins();
  }

  async function loadRoles() {
    var payload = await window.VibecraftApi.get("admin/roles");
    state.roles = (payload && payload.data && payload.data.roles) || [];
    renderRoleOptions();
  }

  async function loadAudit() {
    var payload = await window.VibecraftApi.get("admin/audit-logs?limit=50");
    var logs = (payload && payload.data) || [];
    if (!logs.length) {
      auditTableBody.innerHTML = '<tr class="empty-row"><td colspan="4">No activity yet.</td></tr>';
      return;
    }
    auditTableBody.innerHTML = logs.map(function (log) {
      var details = Object.keys(log.details || {}).map(function (key) { return key + ": " + log.details[key]; }).join(", ");
      var date = log.createdAt ? dateFormatter.format(new Date(log.createdAt)) : "—";
      return "<tr><td>" + escape(log.adminName) + "</td><td>" + escape(log.action.replace(/_/g, " ")) + "</td><td>" + escape(details || "—") + "</td><td>" + date + "</td></tr>";
    }).join("");
  }

  function findAdmin(id) {
    return state.admins.find(function (admin) { return admin.id === id; });
  }

  async function runAction(action, admin) {
    var label = admin.name || admin.email;
    if (action === "toggle") {
      if (admin.isActive && !window.confirm("Disable " + label + "? They will be signed out and unable to sign in until re-enabled.")) return;
      await window.VibecraftApi.patch("admin/admins/" + encodeURIComponent(admin.id), { isActive: !admin.isActive });
      return admin.isActive ? label + " disabled." : label + " enabled.";
    }
    if (action === "reset") {
      var password = window.prompt("New temporary password for " + label + " (at least 10 characters). They will be asked to change it after signing in.");
      if (!password) return null;
      await window.VibecraftApi.post("admin/admins/" + encodeURIComponent(admin.id) + "/reset-password", { newPassword: password });
      return "Password reset. Share it with " + label + " privately.";
    }
    if (action === "revoke") {
      var self = state.me && admin.id === state.me.id;
      if (!window.confirm(self ? "Sign out all your sessions, including this one?" : "Sign " + label + " out of every device?")) return null;
      await window.VibecraftApi.post("admin/admins/" + encodeURIComponent(admin.id) + "/revoke-sessions");
      if (self) {
        window.location.href = "/login";
        return null;
      }
      return label + " was signed out everywhere.";
    }
    if (action === "remove") {
      if (!window.confirm("Remove " + label + " from the admin team? This cannot be undone.")) return null;
      await window.VibecraftApi.del("admin/admins/" + encodeURIComponent(admin.id));
      return label + " removed.";
    }
    return null;
  }

  tableBody.addEventListener("click", async function (event) {
    var button = event.target.closest("button[data-action]");
    if (!button) return;
    var admin = findAdmin(button.getAttribute("data-id"));
    if (!admin) return;
    button.disabled = true;
    try {
      var message = await runAction(button.getAttribute("data-action"), admin);
      await loadAdmins();
      if (can("audit.view")) await loadAudit();
      if (message) adminCount.textContent = message;
    } catch (error) {
      window.alert(error.message || "That action failed.");
    } finally {
      button.disabled = false;
    }
  });

  tableBody.addEventListener("change", async function (event) {
    var select = event.target.closest("select[data-role-for]");
    if (!select) return;
    var admin = findAdmin(select.getAttribute("data-role-for"));
    if (!admin) return;
    if (!window.confirm("Change " + (admin.name || admin.email) + "'s role? They will need to sign in again.")) {
      select.value = admin.role;
      return;
    }
    select.disabled = true;
    try {
      await window.VibecraftApi.patch("admin/admins/" + encodeURIComponent(admin.id), { role: select.value });
      await loadAdmins();
      if (can("audit.view")) await loadAudit();
    } catch (error) {
      window.alert(error.message || "Could not change the role.");
      select.value = admin.role;
    } finally {
      select.disabled = false;
    }
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    var submitButton = form.querySelector("button[type=submit]");
    var payload = {
      name: document.getElementById("adminName").value.trim(),
      email: document.getElementById("adminEmail").value.trim(),
      password: document.getElementById("adminPassword").value,
      role: roleSelect.value,
    };

    setFormStatus("Adding…");
    submitButton.disabled = true;

    try {
      await window.VibecraftApi.post("admin/admins", payload);
      form.reset();
      renderRoleOptions();
      await loadAdmins();
      if (can("audit.view")) await loadAudit();
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
      if (state.me && state.me.mustChangePassword) {
        setPasswordStatus("Password updated. Loading the admin area…");
        window.location.href = "/admin-dashboard";
        return;
      }
      setPasswordStatus("Password updated. Your other devices were signed out.");
    } catch (error) {
      setPasswordStatus(error.message || "Could not update your password.", true);
    } finally {
      submitButton.disabled = false;
    }
  });

  async function boot() {
    var admin = await window.VibecraftAdmin.requireSession();
    if (!admin) return;

    state.me = admin;
    window.VibecraftAdmin.wireSignOut();
    window.VibecraftAdmin.renderAccountMenu(admin);

    var newPasswordHint = document.querySelector("#newPassword + small");
    if (newPasswordHint) newPasswordHint.textContent = "At least 10 characters. Avoid common passwords.";

    if (admin.mustChangePassword) {
      passwordNotice.hidden = false;
      document.getElementById("currentPassword").focus();
      if (inviteSection) inviteSection.hidden = true;
      tableBody.closest(".admin-panel").hidden = true;
      if (auditSection) auditSection.hidden = true;
      return;
    }

    if (inviteSection) inviteSection.hidden = !can("team.manage");
    if (auditSection) auditSection.hidden = !can("audit.view");
    if (!can(["team.view", "team.manage"])) tableBody.closest(".admin-panel").hidden = true;

    try {
      if (can(["team.view", "team.manage", "roles.manage"])) await loadRoles();
      if (can(["team.view", "team.manage"])) await loadAdmins();
      if (can("audit.view")) await loadAudit();
    } catch (error) {
      tableBody.innerHTML = '<tr class="empty-row"><td colspan="6">Could not load admins.</td></tr>';
      if (auditTableBody) auditTableBody.innerHTML = '<tr class="empty-row"><td colspan="4">Could not load activity.</td></tr>';
    }
  }

  boot();
})();
