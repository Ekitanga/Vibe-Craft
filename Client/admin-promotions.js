(function () {
  "use strict";
  var form = document.getElementById("promotionForm");
  var status = document.getElementById("promotionFormStatus");
  var body = document.getElementById("promotionsTableBody");
  var count = document.getElementById("promotionCount");
  var dateFormatter = new Intl.DateTimeFormat("en-KE", { month: "short", day: "numeric", year: "numeric" });
  var escape = function (value) { return window.VibecraftAdmin.escapeHtml(value); };

  function setStatus(message, isError) { status.textContent = message || ""; status.classList.toggle("is-error", Boolean(isError)); }
  function render(promotions) {
    count.textContent = promotions.length + (promotions.length === 1 ? " promotion" : " promotions");
    if (!promotions.length) { body.innerHTML = '<tr class="empty-row"><td colspan="6">No promotions yet.</td></tr>'; return; }
    body.innerHTML = promotions.map(function (promotion) {
      var offer = promotion.discountType === "percent" ? promotion.discountValue + "% off" : "KES " + promotion.discountValue.toLocaleString() + " off";
      var usage = promotion.usageLimit === null ? promotion.usedCount + " used" : promotion.usedCount + " / " + promotion.usageLimit;
      var active = promotion.active ? "Active" : "Paused";
      var date = promotion.expiresAt ? "until " + dateFormatter.format(new Date(promotion.expiresAt)) : "No expiry";
      return '<tr><td><strong>' + escape(promotion.code) + '</strong><small>' + escape(promotion.description || "") + '</small></td><td>' + offer + '</td><td>KES ' + Number(promotion.minimumSubtotal || 0).toLocaleString() + '</td><td>' + usage + '</td><td><span class="status-pill ' + (promotion.active ? "status-completed" : "status-cancelled") + '">' + active + '</span><small>' + date + '</small></td><td><button class="text-button" type="button" data-toggle="' + promotion.id + '">' + (promotion.active ? "Pause" : "Activate") + '</button> <button class="text-button is-danger" type="button" data-delete="' + promotion.id + '">Delete</button></td></tr>';
    }).join("");
  }
  async function load() { var payload = await window.VibecraftApi.get("admin/promotions"); render((payload && payload.data) || []); }

  form.addEventListener("submit", async function (event) {
    event.preventDefault(); var submit = form.querySelector("button[type=submit]");
    setStatus("Creating…"); submit.disabled = true;
    try {
      await window.VibecraftApi.post("admin/promotions", {
        code: document.getElementById("promotionCode").value.trim(),
        description: document.getElementById("promotionDescription").value.trim(),
        discountType: document.getElementById("promotionType").value,
        discountValue: Number(document.getElementById("promotionValue").value),
        minimumSubtotal: Number(document.getElementById("promotionMinimum").value || 0),
        usageLimit: document.getElementById("promotionUsageLimit").value ? Number(document.getElementById("promotionUsageLimit").value) : null,
      });
      form.reset(); document.getElementById("promotionMinimum").value = 0; await load(); setStatus("Promotion created.");
    } catch (error) { setStatus(error.message || "Could not create promotion.", true); } finally { submit.disabled = false; }
  });
  body.addEventListener("click", async function (event) {
    var toggle = event.target.getAttribute("data-toggle"); var remove = event.target.getAttribute("data-delete");
    try {
      if (toggle) await window.VibecraftApi.patch("admin/promotions/" + toggle, { active: event.target.textContent === "Activate" });
      if (remove && window.confirm("Delete this promotion?")) await window.VibecraftApi.del("admin/promotions/" + remove);
      await load();
    } catch (error) { window.alert(error.message || "Could not update promotion."); }
  });
  (async function boot() {
    var admin = await window.VibecraftAdmin.requireSession(); if (!admin) return;
    window.VibecraftAdmin.wireSignOut(); window.VibecraftAdmin.renderAccountMenu(admin);
    try { await load(); } catch (error) { body.innerHTML = '<tr class="empty-row"><td colspan="6">Could not load promotions.</td></tr>'; }
  })();
})();
