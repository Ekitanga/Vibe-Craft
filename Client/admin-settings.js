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
  var form = document.getElementById("settingsForm");
  var status = document.getElementById("settingsStatus");
  var resetButton = document.getElementById("resetSettings");
  var countySelect = document.getElementById("deliveryCountySelect");
  var countyTrigger = document.getElementById("deliveryCountyTrigger");
  var countyTriggerLabel = document.getElementById("deliveryCountyTriggerLabel");
  var countyMenu = document.getElementById("deliveryCountyMenu");
  var countyFee = document.getElementById("deliveryCountyFee");
  var countyEnabled = document.getElementById("deliveryCountyEnabled");
  var saveCountyButton = document.getElementById("saveDeliveryCounty");
  var removeCountyButton = document.getElementById("removeDeliveryCounty");
  var fields = ["storeName", "tagline", "heroTitle", "heroDescription", "announcement", "phone", "whatsapp", "paybill", "mpesaAccount", "address", "openingHours", "freeDeliveryMinimum", "primaryColor", "accentColor", "lowStockThreshold"];
  var socialFields = {
    socialInstagram: "instagram",
    socialTiktok: "tiktok",
    socialFacebook: "facebook",
    socialYoutube: "youtube",
  };
  var defaultSocialLinks = {
    instagram: "https://www.instagram.com/vibecraft254?igsh=MTRsNHB5ZTM2dDgxOQ==",
    tiktok: "https://www.tiktok.com/@vibecraft254?_r=1&_t=ZS-98E36EYoUz7",
    facebook: "",
    youtube: "",
  };
  var deliveryRows = [];

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setStatus(message, isError) {
    status.textContent = message || "";
    status.classList.toggle("is-error", Boolean(isError));
  }

  function populateCountyOptions() {
    var counties = KENYA_COUNTIES.slice();
    deliveryRows.forEach(function (row) {
      if (counties.indexOf(row.county) === -1) counties.push(row.county);
    });
    countySelect.innerHTML = '<option value="">Choose a county</option>' + counties.map(function (county) {
      var configured = deliveryRows.some(function (row) { return row.county === county; });
      return '<option value="' + escapeHtml(county) + '">' + escapeHtml(county) + (configured ? " (configured)" : "") + "</option>";
    }).join("");
    countyMenu.innerHTML = counties.map(function (county) {
      var row = deliveryRows.find(function (item) { return item.county === county; });
      var feeLabel = row ? "KES " + Number(row.fee || 0) : "Not configured";
      var statusLabel = row ? (row.enabled ? "Available" : "Temporarily off") : "Add fee";
      return '<button class="delivery-county-option" data-county="' + escapeHtml(county) + '" type="button" role="option">' +
        '<span><strong>' + escapeHtml(county) + '</strong><small>' + feeLabel + '</small></span>' +
        '<span class="delivery-county-option-status ' + (row && row.enabled ? "is-available" : "") + '">' + statusLabel + '</span>' +
      '</button>';
    }).join("");
  }

  function resetCountyEditor() {
    countySelect.value = "";
    countyFee.value = "0";
    countyEnabled.checked = true;
    saveCountyButton.textContent = "Add county";
    removeCountyButton.disabled = true;
    countyTriggerLabel.textContent = "Choose a county";
    countyMenu.querySelectorAll(".delivery-county-option").forEach(function (option) { option.classList.remove("is-selected"); });
  }

  function loadSelectedCounty() {
    var county = countySelect.value;
    var row = deliveryRows.find(function (item) { return item.county === county; });
    var savedFee = row ? Number(row.fee) : 0;
    countyFee.value = Number.isFinite(savedFee) ? String(savedFee) : "0";
    countyEnabled.checked = row ? row.enabled : true;
    saveCountyButton.textContent = row ? "Update county" : "Add county";
    removeCountyButton.disabled = !row;
    countyTriggerLabel.textContent = row ? county + " · KES " + savedFee : county ? county + " · Not configured" : "Choose a county";
    countyMenu.querySelectorAll(".delivery-county-option").forEach(function (option) {
      option.classList.toggle("is-selected", option.getAttribute("data-county") === county);
    });
  }

  function captureSelectedCounty() {
    var county = countySelect.value;
    var row = deliveryRows.find(function (item) { return item.county === county; });
    if (!row) return;
    row.fee = countyFee.value;
    row.enabled = countyEnabled.checked;
  }

  function readDeliveryRows() {
    captureSelectedCounty();
    var fees = {};
    var availability = {};
    deliveryRows.forEach(function (row) {
      var fee = Number(row.fee);
      if (!row.county || row.county.length > 60 || !Number.isInteger(fee) || fee < 0 || fee > 100000) {
        throw new Error("Delivery counties need whole fees from 0 to 100,000 KES.");
      }
      fees[row.county] = fee;
      availability[row.county] = row.enabled;
    });
    return { fees: fees, availability: availability };
  }

  function fill(settings) {
    fields.forEach(function (key) {
      var input = document.getElementById(key);
      if (input) input.value = settings[key] === undefined || settings[key] === null ? "" : settings[key];
    });

    var links = Object.assign({}, defaultSocialLinks, settings.socialLinks || {});
    Object.keys(socialFields).forEach(function (id) {
      var input = document.getElementById(id);
      if (input) input.value = links[socialFields[id]] || "";
    });

    var fees = settings.deliveryFees || {};
    var availability = settings.deliveryAvailability || {};
    deliveryRows = Object.keys(fees).map(function (county) {
      return { county: county, fee: fees[county], enabled: availability[county] !== false };
    });
    populateCountyOptions();
    if (deliveryRows.length) {
      countySelect.value = deliveryRows[0].county;
      loadSelectedCounty();
    } else {
      resetCountyEditor();
    }
  }

  saveCountyButton.addEventListener("click", function () {
    var county = countySelect.value;
    var fee = Number(countyFee.value);
    if (!county) { setStatus("Choose a county first.", true); return; }
    if (!Number.isInteger(fee) || fee < 0 || fee > 100000) { setStatus("Delivery fees must be whole amounts from 0 to 100,000 KES.", true); return; }

    var row = deliveryRows.find(function (item) { return item.county === county; });
    if (row) {
      row.fee = fee;
      row.enabled = countyEnabled.checked;
    } else {
      deliveryRows.push({ county: county, fee: fee, enabled: countyEnabled.checked });
    }
    populateCountyOptions();
    countySelect.value = county;
    loadSelectedCounty();
    setStatus((row ? "County updated" : "County added") + ". Remember to save settings. ✨");
  });

  countySelect.addEventListener("change", function () {
    captureSelectedCounty();
    loadSelectedCounty();
  });

  countyTrigger.addEventListener("click", function (event) {
    event.stopPropagation();
    var isOpen = !countyMenu.hidden;
    countyMenu.hidden = isOpen;
    countyTrigger.setAttribute("aria-expanded", String(!isOpen));
  });

  countyMenu.addEventListener("click", function (event) {
    var option = event.target.closest ? event.target.closest("[data-county]") : null;
    if (!option) return;
    captureSelectedCounty();
    countySelect.value = option.getAttribute("data-county");
    loadSelectedCounty();
    countyMenu.hidden = true;
    countyTrigger.setAttribute("aria-expanded", "false");
  });

  document.addEventListener("click", function (event) {
    if (!countyMenu.hidden && !countyMenu.contains(event.target) && event.target !== countyTrigger && !countyTrigger.contains(event.target)) {
      countyMenu.hidden = true;
      countyTrigger.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      countyMenu.hidden = true;
      countyTrigger.setAttribute("aria-expanded", "false");
    }
  });

  removeCountyButton.addEventListener("click", function () {
    var county = countySelect.value;
    if (!county) return;
    if (!window.confirm("Stop delivery to " + county + "? You can add it again later.")) return;
    deliveryRows = deliveryRows.filter(function (row) { return row.county !== county; });
    populateCountyOptions();
    resetCountyEditor();
    setStatus(county + " removed. Remember to save settings.");
  });

  function read() {
    var output = fields.reduce(function (result, key) {
      result[key] = document.getElementById(key).value.trim();
      return result;
    }, {});
    var delivery = readDeliveryRows();
    output.deliveryFees = delivery.fees;
    output.deliveryAvailability = delivery.availability;
    output.socialLinks = Object.keys(socialFields).reduce(function (links, id) {
      links[socialFields[id]] = document.getElementById(id).value.trim();
      return links;
    }, {});
    return output;
  }

  async function loadSettings() {
    var responses = await Promise.all([
      window.VibecraftApi.get("admin/settings"),
      window.VibecraftApi.get("admin/settings/previous"),
    ]);
    fill((responses[0] && responses[0].data) || {});
    resetButton.disabled = !(responses[1] && responses[1].hasPrevious);
  }

  resetButton.addEventListener("click", async function () {
    if (!window.confirm("Reset to the previous saved settings? Your current settings will be kept as the next previous version.")) return;
    resetButton.disabled = true;
    setStatus("Restoring previous settings…");
    try {
      var payload = await window.VibecraftApi.post("admin/settings/reset-previous");
      fill((payload && payload.data) || {});
      resetButton.disabled = false;
      setStatus("Previous settings restored. 🔄");
    } catch (error) {
      resetButton.disabled = false;
      setStatus(error.message || "Could not restore previous settings.", true);
    }
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var submit = document.getElementById("saveSettings");
    setStatus("Saving…");
    submit.disabled = true;

    try {
      await window.VibecraftApi.patch("admin/settings", read());
      setStatus("Settings saved. The storefront is now up to date. ✨");
    } catch (error) {
      setStatus(error.message || "Could not save settings.", true);
    } finally {
      submit.disabled = false;
    }
  });

  async function boot() {
    var admin = await window.VibecraftAdmin.requireSession();
    if (!admin) return;
    window.VibecraftAdmin.wireSignOut();
    window.VibecraftAdmin.renderAccountMenu(admin);

    try {
      await loadSettings();
    } catch (error) {
      setStatus(error.message || "Could not load settings.", true);
    }
  }

  boot();
})();
