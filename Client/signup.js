(function () {
  "use strict";

  var form = document.getElementById("signupForm");
  var status = document.getElementById("signupStatus");

  if (!form) return;

  function setStatus(message, isError) {
    status.textContent = message || "";
    status.classList.toggle("is-error", Boolean(isError));
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    var submitButton = form.querySelector("button[type=submit]");
    setStatus("Creating your account...");
    submitButton.disabled = true;

    try {
      await window.VibecraftApi.post("auth/signup", {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
        password: form.password.value,
      });

      if (typeof window.fbq === "function") {
        window.fbq("track", "CompleteRegistration", { status: true });
      }

      window.location.href = window.VibecraftApi.safeNext("account.html");
    } catch (error) {
      setStatus(error.message || "Could not create your account.", true);
      submitButton.disabled = false;
    }
  });
})();
