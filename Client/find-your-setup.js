(function () {
  "use strict";

  var messagesEl = document.getElementById("aiMessages");
  var form = document.getElementById("aiForm");
  var input = document.getElementById("aiInput");
  var suggestions = document.getElementById("aiSuggestions");

  if (!form) return;

  var history = [];

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
    input.disabled = true;
    submitButton.disabled = true;

    try {
      var payload = await window.VibecraftApi.post("ai/chat", { message: trimmed, history: history });
      var reply = (payload && payload.data && payload.data.reply) || "";

      removeThinking();
      appendMessage("assistant", reply);

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

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    sendMessage(input.value);
  });

  suggestions.addEventListener("click", function (event) {
    var chip = event.target.closest(".ai-chip");
    if (!chip) return;
    sendMessage(chip.textContent);
  });

  appendMessage(
    "assistant",
    "Hi! I'm the Vibecraft assistant. Ask me about prices, specs, stock, or what setup fits your room — I'll only tell you about what we actually sell."
  );
})();
