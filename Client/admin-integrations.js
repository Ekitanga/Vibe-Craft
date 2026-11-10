(function () {
  "use strict";

  var host = document.getElementById("integrationSections");
  var jump = document.getElementById("sectionJump");
  var encryptionNotice = document.getElementById("encryptionNotice");
  var TESTABLE = { meta: "Test Meta connection", mpesa: "Test Daraja sign-in", email: "Send test email" };
  var dateFormatter = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" });
  var sections = [];

  function escape(value) {
    return window.VibecraftAdmin.escapeHtml(value);
  }

  function fieldId(section, field) {
    return "f_" + section.key + "_" + field.key;
  }

  function inputFor(section, field, value) {
    var id = fieldId(section, field);
    var attrs = 'id="' + id + '" name="' + escape(field.key) + '"' + (field.placeholder ? ' placeholder="' + escape(field.placeholder) + '"' : "");

    if (field.type === "boolean") {
      return '<label class="field-checkbox"><input type="checkbox" ' + attrs + (value ? " checked" : "") + " /> " + escape(field.label) + "</label>";
    }
    if (field.type === "select") {
      return '<select ' + attrs + ">" + field.options.map(function (option) {
        return '<option value="' + escape(option.value) + '"' + (option.value === value ? " selected" : "") + ">" + escape(option.label) + "</option>";
      }).join("") + "</select>";
    }
    if (field.type === "textarea") {
      return '<textarea ' + attrs + ' rows="' + (field.rows || 3) + '"' + (field.maxLength ? ' maxlength="' + field.maxLength + '"' : "") + ">" + escape(value || "") + "</textarea>";
    }
    if (field.type === "list") {
      return '<input ' + attrs + ' value="' + escape((value || []).join(", ")) + '" />';
    }
    if (field.type === "number") {
      return '<input type="number" step="1" ' + attrs + (field.min !== undefined ? ' min="' + field.min + '"' : "") + (field.max !== undefined ? ' max="' + field.max + '"' : "") + ' value="' + escape(value) + '" />';
    }
    if (field.type === "secret") {
      var status = value || { set: false };
      if (field.reveal && status.value) {
        return '<div class="copy-row"><code>' + escape(status.value) + '</code><button class="button button-outline" type="button" data-copy="' + escape(status.value) + '">Copy</button></div>' +
          '<div class="secret-meta"><button class="text-button" type="button" data-regenerate="' + escape(field.key) + '">Generate a new one</button></div>';
      }
      var placeholder = status.set ? "Saved (" + (status.hint || "hidden") + ") — type to replace" : "Not set";
      return '<input type="password" autocomplete="new-password" ' + attrs + ' placeholder="' + escape(placeholder) + '" />' +
        '<div class="secret-meta">' +
        (status.set ? '<span>✓ Stored encrypted</span><label><input type="checkbox" data-clear="' + escape(field.key) + '" /> Remove</label>' : "<span>Not set</span>") +
        (field.generate ? '<button class="text-button" type="button" data-regenerate="' + escape(field.key) + '">Generate new</button>' : "") +
        "</div>";
    }
    var type = field.type === "url" ? "url" : field.type === "email" ? "email" : "text";
    return '<input type="' + type + '" ' + attrs + ' value="' + escape(value || "") + '" />';
  }

  function fieldMarkup(section, field) {
    var value = section.values[field.key];
    var wide = field.type === "textarea" || field.type === "list" || field.type === "url" ? " field-wide" : "";
    var help = field.help ? "<small>" + escape(field.help) + "</small>" : "";
    if (field.type === "boolean") return '<div class="field field-wide">' + inputFor(section, field, value) + help + "</div>";
    return '<div class="field' + wide + '"><label for="' + fieldId(section, field) + '">' + escape(field.label) + "</label>" + inputFor(section, field, value) + help + "</div>";
  }

  function sectionMarkup(section) {
    var groups = [];
    section.fields.forEach(function (field) {
      var name = field.group || "";
      var group = groups.find(function (item) { return item.name === name; });
      if (!group) {
        group = { name: name, fields: [] };
        groups.push(group);
      }
      group.fields.push(field);
    });

    var body = groups.map(function (group) {
      return (group.name ? '<h3 class="integration-group">' + escape(group.name) + "</h3>" : "") +
        '<div class="form-grid">' + group.fields.map(function (field) { return fieldMarkup(section, field); }).join("") + "</div>";
    }).join("");

    var updated = section.updatedAt ? "Last saved " + dateFormatter.format(new Date(section.updatedAt)) : "Not saved yet — showing defaults";
    var test = TESTABLE[section.key]
      ? '<button class="button button-outline auth-submit" type="button" data-test="' + section.key + '">' + TESTABLE[section.key] + "</button>"
      : "";

    return '<section class="admin-panel" id="section-' + escape(section.key) + '">' +
      '<div class="admin-panel-heading"><div><h2>' + escape(section.title) + '</h2><p class="panel-copy">' + escape(section.description) + "</p></div>" +
      '<span class="form-status">' + escape(updated) + "</span></div>" +
      '<form data-section="' + escape(section.key) + '" novalidate>' + body +
      '<div class="panel-actions"><button class="button button-dark auth-submit" type="submit">Save ' + escape(section.title) + "</button>" + test +
      '<p class="form-status" data-status role="status" aria-live="polite"></p></div>' +
      '<ul class="check-results" data-results hidden></ul></form></section>';
  }

  function render() {
    host.innerHTML = sections.map(sectionMarkup).join("");
    jump.innerHTML = sections.map(function (section) {
      return '<a href="#section-' + escape(section.key) + '">' + escape(section.title) + "</a>";
    }).join("");
  }

  function collect(form, section) {
    var values = {};
    var clearSecrets = [];
    section.fields.forEach(function (field) {
      var input = form.querySelector("#" + fieldId(section, field));
      if (field.type === "secret") {
        if (input && input.value.trim()) values[field.key] = input.value.trim();
        var clear = form.querySelector('[data-clear="' + field.key + '"]');
        if (clear && clear.checked) clearSecrets.push(field.key);
        return;
      }
      if (!input) return;
      values[field.key] = field.type === "boolean" ? input.checked : input.value;
    });
    return { values: values, clearSecrets: clearSecrets };
  }

  function setStatus(form, message, isError) {
    var status = form.querySelector("[data-status]");
    status.textContent = message || "";
    status.classList.toggle("is-error", Boolean(isError));
  }

  function replaceSection(updated) {
    sections = sections.map(function (section) { return section.key === updated.key ? updated : section; });
    var current = document.getElementById("section-" + updated.key);
    var wrapper = document.createElement("div");
    wrapper.innerHTML = sectionMarkup(updated);
    current.replaceWith(wrapper.firstChild);
  }

  async function save(form, extra) {
    var key = form.getAttribute("data-section");
    var section = sections.find(function (item) { return item.key === key; });
    var payload = Object.assign(collect(form, section), extra || {});
    setStatus(form, "Saving…");
    try {
      var response = await window.VibecraftApi.patch("admin/integrations/" + encodeURIComponent(key), payload);
      replaceSection(response.data);
      var fresh = document.querySelector('form[data-section="' + key + '"]');
      setStatus(fresh, "Saved. ✨");
    } catch (error) {
      setStatus(form, error.message || "Could not save.", true);
    }
  }

  host.addEventListener("submit", function (event) {
    var form = event.target.closest("form[data-section]");
    if (!form) return;
    event.preventDefault();
    save(form);
  });

  host.addEventListener("click", async function (event) {
    var copy = event.target.closest("[data-copy]");
    if (copy) {
      try {
        await navigator.clipboard.writeText(copy.getAttribute("data-copy"));
        copy.textContent = "Copied";
      } catch (_error) {
        copy.textContent = "Select & copy";
      }
      return;
    }

    var regenerate = event.target.closest("[data-regenerate]");
    if (regenerate) {
      if (!window.confirm("Generate a new value? You'll need to update it wherever the old one was pasted.")) return;
      save(regenerate.closest("form"), { regenerate: [regenerate.getAttribute("data-regenerate")] });
      return;
    }

    var test = event.target.closest("[data-test]");
    if (test) {
      var form = test.closest("form");
      var key = test.getAttribute("data-test");
      var results = form.querySelector("[data-results]");
      var body = {};
      if (key === "email") {
        var to = window.prompt("Send a test email to:", "");
        if (!to) return;
        body.to = to;
      }
      test.disabled = true;
      setStatus(form, "Testing… (save first if you changed anything)");
      try {
        var response = await window.VibecraftApi.post("admin/integrations/" + key + "/test", body);
        var data = response.data || {};
        var checks = data.checks || [{ name: "Result", ok: data.ok !== false, message: data.message }];
        results.innerHTML = checks.map(function (check) {
          return '<li class="' + (check.ok ? "" : "is-fail") + '"><strong>' + escape(check.name) + ":</strong> " + escape(check.message || "") + "</li>";
        }).join("");
        results.hidden = false;
        setStatus(form, "");
      } catch (error) {
        results.hidden = true;
        setStatus(form, error.message || "Test failed.", true);
      } finally {
        test.disabled = false;
      }
    }
  });

  async function boot() {
    var admin = await window.VibecraftAdmin.requireSession();
    if (!admin) return;
    window.VibecraftAdmin.wireSignOut();
    window.VibecraftAdmin.renderAccountMenu(admin);
    if (!window.VibecraftAdmin.can("integrations.manage", admin)) return;

    try {
      var payload = await window.VibecraftApi.get("admin/integrations");
      sections = payload.data.sections || [];
      var encryption = payload.data.encryption || {};
      encryptionNotice.textContent = "🔐 " + (encryption.message || "");
      encryptionNotice.classList.toggle("is-warning", encryption.source !== "env");
      encryptionNotice.classList.toggle("is-ok", encryption.source === "env");
      encryptionNotice.hidden = !encryption.message;
      render();
      if (window.location.hash) {
        var target = document.getElementById(window.location.hash.slice(1));
        if (target) target.scrollIntoView();
      }
    } catch (error) {
      host.innerHTML = '<section class="admin-panel"><p class="form-status is-error">' + escape(error.message || "Could not load integrations.") + "</p></section>";
    }
  }

  boot();
})();
