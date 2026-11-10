(function () {
  "use strict";

  var cards = document.getElementById("roleCards");
  var createSection = document.getElementById("createRoleSection");
  var createForm = document.getElementById("createRoleForm");
  var createStatus = document.getElementById("createRoleStatus");
  var state = { me: null, roles: [], permissions: [] };

  function escape(value) {
    return window.VibecraftAdmin.escapeHtml(value);
  }

  function isOwner() {
    return state.me && state.me.role === "owner";
  }

  function canEditRole(role) {
    if (!window.VibecraftAdmin.can("roles.manage", state.me) || role.key === "owner") return false;
    return isOwner() || role.rank < state.me.rank;
  }

  // A permission can only be granted by someone who holds it.
  function canGrant(permissionKey) {
    return isOwner() || state.me.permissions.indexOf(permissionKey) !== -1;
  }

  function permissionChecklist(selected, disabled, prefix) {
    var lastGroup = "";
    return state.permissions.map(function (permission) {
      var heading = permission.group !== lastGroup ? '<p class="perm-group-title">' + escape(permission.group) + "</p>" : "";
      lastGroup = permission.group;
      var checked = selected.indexOf(permission.key) !== -1;
      var lock = disabled || !canGrant(permission.key);
      return heading + '<label class="field-checkbox"><input type="checkbox" value="' + escape(permission.key) + '" data-perm="' + prefix + '"' +
        (checked ? " checked" : "") + (lock ? " disabled" : "") + " /><span>" + escape(permission.label) + "<small>" + escape(permission.description) + "</small></span></label>";
    }).join("");
  }

  function roleCard(role) {
    var editable = canEditRole(role);
    var members = role.memberCount === 1 ? "1 admin" : (role.memberCount || 0) + " admins";
    var badge = role.isSystem ? " · built-in" : " · custom";
    var details = editable
      ? '<div class="form-grid">' +
        '<div class="field"><label>Name</label><input data-field="name" value="' + escape(role.name) + '" maxlength="40" /></div>' +
        '<div class="field"><label>Rank</label><input data-field="rank" type="number" min="1" max="99" value="' + role.rank + '" /></div>' +
        '<div class="field field-wide"><label>Description</label><input data-field="description" value="' + escape(role.description) + '" maxlength="200" /></div></div>'
      : '<p class="panel-copy">' + escape(role.description) + "</p>";

    return '<section class="admin-panel" data-role="' + escape(role.key) + '">' +
      '<div class="admin-panel-heading"><div><h2>' + escape(role.name) + '</h2><p class="panel-copy">Rank ' + role.rank + " · " + members + badge + "</p></div>" +
      (role.key === "owner" ? '<span class="status-pill status-completed">Full access</span>' : "") + "</div>" +
      details +
      '<div class="perm-grid">' + permissionChecklist(role.permissions, !editable, role.key) + "</div>" +
      (editable
        ? '<div class="panel-actions"><button class="button button-dark auth-submit" type="button" data-save="' + escape(role.key) + '">Save ' + escape(role.name) + "</button>" +
          (!role.isSystem ? '<button class="button button-outline auth-submit" type="button" data-delete="' + escape(role.key) + '">Delete role</button>' : "") +
          '<p class="form-status" data-status role="status"></p></div>'
        : "") +
      "</section>";
  }

  function render() {
    cards.innerHTML = state.roles.map(roleCard).join("");
    createSection.hidden = !window.VibecraftAdmin.can("roles.manage", state.me);
    document.getElementById("newRolePermissions").innerHTML = permissionChecklist([], false, "__new");
    var rankInput = document.getElementById("newRoleRank");
    if (!isOwner()) rankInput.max = String(Math.max(1, state.me.rank - 1));
  }

  async function load() {
    var payload = await window.VibecraftApi.get("admin/roles");
    state.roles = payload.data.roles || [];
    state.permissions = payload.data.permissions || [];
    render();
  }

  function selectedPermissions(prefix) {
    return Array.prototype.slice.call(document.querySelectorAll('input[data-perm="' + prefix + '"]:checked')).map(function (input) {
      return input.value;
    });
  }

  cards.addEventListener("click", async function (event) {
    var saveButton = event.target.closest("[data-save]");
    var deleteButton = event.target.closest("[data-delete]");
    if (!saveButton && !deleteButton) return;
    var card = event.target.closest("[data-role]");
    var key = card.getAttribute("data-role");
    var status = card.querySelector("[data-status]");

    try {
      if (deleteButton) {
        if (!window.confirm("Delete this role? Admins must be moved to another role first.")) return;
        await window.VibecraftApi.del("admin/roles/" + encodeURIComponent(key));
        await load();
        return;
      }
      saveButton.disabled = true;
      status.textContent = "Saving…";
      status.classList.remove("is-error");
      await window.VibecraftApi.patch("admin/roles/" + encodeURIComponent(key), {
        name: card.querySelector('[data-field="name"]').value,
        rank: Number(card.querySelector('[data-field="rank"]').value),
        description: card.querySelector('[data-field="description"]').value,
        permissions: selectedPermissions(key),
      });
      await load();
      var fresh = document.querySelector('[data-role="' + key + '"] [data-status]');
      if (fresh) fresh.textContent = "Saved. Admins with this role get the change on their next page load.";
    } catch (error) {
      if (status) {
        status.textContent = error.message || "Could not save.";
        status.classList.add("is-error");
      } else {
        window.alert(error.message || "Could not complete that action.");
      }
    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  });

  createForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    createStatus.textContent = "Creating…";
    createStatus.classList.remove("is-error");
    try {
      await window.VibecraftApi.post("admin/roles", {
        name: document.getElementById("newRoleName").value,
        rank: Number(document.getElementById("newRoleRank").value),
        description: document.getElementById("newRoleDescription").value,
        permissions: selectedPermissions("__new"),
      });
      createForm.reset();
      await load();
      createStatus.textContent = "Role created. Assign it to people on the Team page.";
    } catch (error) {
      createStatus.textContent = error.message || "Could not create the role.";
      createStatus.classList.add("is-error");
    }
  });

  async function boot() {
    var admin = await window.VibecraftAdmin.requireSession();
    if (!admin) return;
    state.me = admin;
    window.VibecraftAdmin.wireSignOut();
    window.VibecraftAdmin.renderAccountMenu(admin);
    if (!window.VibecraftAdmin.can(["roles.manage", "team.manage", "team.view"], admin)) return;
    try {
      await load();
    } catch (error) {
      cards.innerHTML = '<section class="admin-panel"><p class="form-status is-error">' + escape(error.message || "Could not load roles.") + "</p></section>";
    }
  }

  boot();
})();
