(function () {
  "use strict";

  var form = document.getElementById("loginForm");
  var status = document.getElementById("loginStatus");

  if (!form) return;

  function setStatus(message, isError) {
    status.textContent = message || "";
    status.classList.toggle("is-error", Boolean(isError));
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    var submitButton = form.querySelector("button[type=submit]");
    setStatus("Signing you in...");
    submitButton.disabled = true;

    try {
      var payload = await window.VibecraftApi.post("auth/login", {
        email: form.email.value.trim(),
        password: form.password.value,
      });

      if (payload.data && payload.data.user) {
        if (typeof window.fbq === "function") window.fbq("track", "Login", { status: true });
        window.location.href = window.VibecraftApi.safeNext("index.html");
        return;
      }

      if (payload.data && payload.data.admin) {
        window.location.href = window.VibecraftApi.safeNext("admin-dashboard.html");
        return;
      }

      setStatus("Could not log you in.", true);
      submitButton.disabled = false;
    } catch (error) {
      setStatus(error.message || "Could not log you in.", true);
      submitButton.disabled = false;
    }
  });
})();
