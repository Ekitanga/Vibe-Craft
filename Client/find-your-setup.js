(function () {
  "use strict";

  var messagesEl = document.getElementById("aiMessages");
  var form = document.getElementById("aiForm");
  var input = document.getElementById("aiInput");
  var suggestions = document.getElementById("aiSuggestions");
  var compareTools = document.getElementById("aiCompareTools");
  var compareFirst = document.getElementById("aiCompareFirst");
  var compareSecond = document.getElementById("aiCompareSecond");
  var compareButton = document.getElementById("aiCompareButton");
  var compareLoading = document.getElementById("aiCompareLoading");
  var comparisonResult = document.getElementById("aiComparisonResult");
  var newQuestionButton = document.getElementById("aiNewQuestion");

  if (!form) return;

  var leadTracked = false;

  var history = [];
  var compareProducts = [];

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatPrice(product) {
    if (!product || product.price == null) return "Not listed";
    return (product.currency || "KES") + " " + Number(product.price).toLocaleString();
  }

  function productValue(product, field) {
    if (!product) return "Not listed";
    var value = product[field];
    if (value == null || value === "") value = product.specs && product.specs[field];
    if (value == null || value === "") return "Not listed";
    return Array.isArray(value) ? value.join(", ") : String(value);
  }

  function booleanValue(value) {
    return value === true ? "Yes" : value === false ? "No" : "Not listed";
  }

  function numericValue(product, field) {
    var value = productValue(product, field);
    var number = Number(String(value).replace(/[^0-9.]/g, ""));
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function comparisonSummary(first, second) {
    var firstScore = 0;
    var secondScore = 0;
    var firstReasons = [];
    var secondReasons = [];
    var firstLumens = numericValue(first, "ansiLumens");
    var secondLumens = numericValue(second, "ansiLumens");
    var firstFeatures = [first.smartOS, first.wifi, first.bluetooth].filter(Boolean).length;
    var secondFeatures = [second.smartOS, second.wifi, second.bluetooth].filter(Boolean).length;

    if (firstLumens !== null && secondLumens !== null && firstLumens !== secondLumens) {
      if (firstLumens > secondLumens) { firstScore += 2; firstReasons.push("higher brightness"); }
      else { secondScore += 2; secondReasons.push("higher brightness"); }
    }
    if (first.price != null && second.price != null && first.price !== second.price) {
      if (first.price < second.price) { firstScore += 1; firstReasons.push("lower price"); }
      else { secondScore += 1; secondReasons.push("lower price"); }
    }
    if (firstFeatures !== secondFeatures) {
      if (firstFeatures > secondFeatures) { firstScore += 1; firstReasons.push("more built-in features"); }
      else { secondScore += 1; secondReasons.push("more built-in features"); }
    }

    if (firstScore === secondScore) {
      return {
        title: "Close call",
        notes: [
          first.name + " and " + second.name + " are close on the listed facts.",
          "Choose by price, features, or brightness for your room.",
        ],
      };
    }

    var winner = firstScore > secondScore ? first : second;
    var other = firstScore > secondScore ? second : first;
    var reasons = firstScore > secondScore ? firstReasons : secondReasons;
    return {
      title: winner.name + " wins overall",
      notes: [
        "Leads on " + reasons.join(", ") + ".",
        other.name + " is the alternative if its feature mix fits better.",
      ],
    };
  }

  function renderComparison(first, second) {
    if (!first || !second || !comparisonResult) return;

    var rows = [
      ["Price", formatPrice(first), formatPrice(second)],
      ["Availability", first.stock > 0 ? "In stock" : "Out of stock", second.stock > 0 ? "In stock" : "Out of stock"],
      ["Resolution", productValue(first, "resolution"), productValue(second, "resolution")],
      ["Brightness", productValue(first, "brightness"), productValue(second, "brightness")],
      ["ANSI lumens", productValue(first, "ansiLumens"), productValue(second, "ansiLumens")],
      ["Projector type", productValue(first, "projectorType"), productValue(second, "projectorType")],
      ["Smart OS", booleanValue(first.smartOS), booleanValue(second.smartOS)],
      ["Wi-Fi", booleanValue(first.wifi), booleanValue(second.wifi)],
      ["Bluetooth", booleanValue(first.bluetooth), booleanValue(second.bluetooth)],
    ].map(function (row) {
      return '<div class="ai-comparison-row"><div class="ai-comparison-label">' + escapeHtml(row[0]) + '</div><div class="ai-comparison-cell"><strong>' + escapeHtml(row[1]) + '</strong></div><div class="ai-comparison-cell"><strong>' + escapeHtml(row[2]) + '</strong></div></div>';
    }).join("");

    var summary = comparisonSummary(first, second);
    comparisonResult.innerHTML = '<div class="ai-comparison-head"><div><p class="eyebrow">Compare by what matters</p><strong>See the difference at a glance</strong></div><button type="button" class="ai-comparison-clear" id="aiComparisonClear">Clear</button></div>' +
      '<div class="ai-comparison-scroll" tabindex="0" role="region" aria-label="Product comparison"><div class="ai-comparison-board"><div class="ai-comparison-products"><div class="ai-comparison-feature-title">What changes<br>for you</div><div class="ai-comparison-product"><strong title="' + escapeHtml(first.name) + '">' + escapeHtml(first.name) + '</strong></div><div class="ai-comparison-product"><strong title="' + escapeHtml(second.name) + '">' + escapeHtml(second.name) + '</strong></div></div><div class="ai-comparison-rows">' + rows + '</div></div></div>' +
      '<div class="ai-comparison-summary"><p class="eyebrow">Quick take</p><ul class="ai-comparison-notes"><li><strong>' + escapeHtml(summary.title) + '</strong></li>' + summary.notes.map(function (note) { return '<li>' + escapeHtml(note) + '</li>'; }).join("") + '</ul></div>';
    comparisonResult.hidden = false;
    document.getElementById("aiComparisonClear").addEventListener("click", function () {
      comparisonResult.hidden = true;
      comparisonResult.innerHTML = "";
    });
    comparisonResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendMessage(role, text) {
    var wrap = document.createElement("div");
    wrap.className = "ai-message is-" + role;

    var avatar = document.createElement("span");
    avatar.setAttribute("aria-hidden", "true");

    if (role === "assistant") {
      avatar.className = "ai-message-avatar ai-orb ai-orb-avatar";
    } else if (role === "error") {
      avatar.className = "ai-message-avatar ai-error-avatar";
      avatar.textContent = "!";
    } else {
      avatar.className = "ai-message-avatar";
    }

    var bubble = document.createElement("div");
    bubble.className = "ai-message-bubble";
    bubble.textContent = text;

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    scrollToBottom();

    return bubble;
  }

  function appendThinking() {
    var wrap = document.createElement("div");
    wrap.className = "ai-message is-assistant is-thinking";
    wrap.id = "aiThinking";

    var avatar = document.createElement("span");
    avatar.className = "ai-message-avatar ai-orb ai-orb-avatar";
    avatar.setAttribute("aria-hidden", "true");

    var bubble = document.createElement("div");
    bubble.className = "ai-message-bubble";
    bubble.textContent = "Thinking…";

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    scrollToBottom();
  }

  function removeThinking() {
    var el = document.getElementById("aiThinking");
    if (el) el.remove();
  }

  async function sendMessage(text) {
    var trimmed = String(text || "").trim();
    if (!trimmed) return;

    var submitButton = form.querySelector("button[type=submit]");

    suggestions.hidden = true;

    appendMessage("user", trimmed);
    appendThinking();
    input.value = "";
    syncInputSubmit();
    input.disabled = true;
    submitButton.disabled = true;

    try {
      var payload = await window.VibecraftApi.post("ai/chat", { message: trimmed, history: history });
      var reply = (payload && payload.data && payload.data.reply) || "";

      removeThinking();
      appendMessage("assistant", reply);
      if (!leadTracked && window.VibecraftMeta) {
        window.VibecraftMeta.track("Lead", { content_name: "Vibecraft setup finder" });
        leadTracked = true;
      }

      history.push({ role: "user", content: trimmed });
      history.push({ role: "assistant", content: reply });
    } catch (error) {
      removeThinking();
      appendMessage("error", error.message || "Could not reach the AI assistant. Please try again.");
    } finally {
      input.disabled = false;
      submitButton.disabled = false;
      input.focus();
    }
  }

  function syncInputSubmit() {
    form.classList.toggle("has-input", input.value.trim().length > 0);
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    sendMessage(input.value);
  });

  input.addEventListener("input", syncInputSubmit);
  syncInputSubmit();

  suggestions.addEventListener("click", function (event) {
    var chip = event.target.closest(".ai-chip");
    if (!chip) return;
    sendMessage(chip.textContent);
  });

  function syncCompareButton() {
    compareButton.disabled = !compareFirst.value || !compareSecond.value || compareFirst.value === compareSecond.value;
  }

  async function loadCompareProducts() {
    try {
      var payload = await window.VibecraftApi.get("products");
      var products = ((payload && payload.data) || []).filter(function (product) { return product && product.id && product.name; });

      if (!products.length) throw new Error("No products");

      compareProducts = products;

      var options = products.map(function (product) {
        return '<option value="' + String(product.id).replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '">' + String(product.name).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</option>';
      }).join("");

      compareFirst.innerHTML = options;
      compareSecond.innerHTML = options;
      if (products.length > 1) compareSecond.selectedIndex = 1;
      if (compareLoading) compareLoading.hidden = true;
      syncCompareButton();
    } catch (_error) {
      compareTools.hidden = true;
    }
  }

  compareFirst.addEventListener("change", syncCompareButton);
  compareSecond.addEventListener("change", syncCompareButton);
  compareButton.addEventListener("click", function () {
    var first = compareProducts.find(function (product) { return product.id === compareFirst.value; });
    var second = compareProducts.find(function (product) { return product.id === compareSecond.value; });
    renderComparison(first, second);
  });

  newQuestionButton.addEventListener("click", function () {
    history = [];
    messagesEl.innerHTML = "";
    if (comparisonResult) {
      comparisonResult.hidden = true;
      comparisonResult.innerHTML = "";
    }
    suggestions.hidden = false;
    input.value = "";
    appendMessage("assistant", "Fresh question? Ask about a projector, delivery, shop location, payment, or how to reach us.");
    input.focus();
  });

  loadCompareProducts();

  appendMessage(
    "assistant",
    "Hey! Ask me about projectors, delivery, shop collection, our Nairobi location, payment, or how to reach us. I will turn the catalog into a short answer that actually makes sense."
  );
})();
