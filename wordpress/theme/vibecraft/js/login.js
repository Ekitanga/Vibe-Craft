(function () {
  "use strict";

  var form = document.getElementById("loginForm");
  var status = document.getElementById("loginStatus");

  if (!form) return;

  // Set by the server only on the private admin sign-in page.
  var adminLogin = window.VIBECRAFT_ADMIN_LOGIN && window.VIBECRAFT_ADMIN_LOGIN.loginPage ? window.VIBECRAFT_ADMIN_LOGIN : null;

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
      var credentials = { email: form.email.value.trim(), password: form.password.value };
      if (adminLogin) credentials.loginPath = adminLogin.path;
      var payload = await window.VibecraftApi.post(adminLogin ? "admin/auth/login" : "auth/login", credentials);

      if (payload.data && payload.data.user) {
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
