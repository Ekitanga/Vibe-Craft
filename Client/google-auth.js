(function () {
  "use strict";

  function handleCredentialResponse(response) {
    var mount = document.getElementById("googleSignInButton");
    var status = document.getElementById("googleSignInStatus");
    var redirectDefault = (mount && mount.getAttribute("data-redirect")) || "index.html";

    window.VibecraftApi.post("auth/google", { idToken: response.credential })
      .then(function () {
        window.location.href = window.VibecraftApi.safeNext(redirectDefault);
      })
      .catch(function (error) {
        if (!status) return;
        status.textContent = error.message || "Could not sign in with Google.";
        status.classList.add("is-error");
      });
  }

  function init() {
    var mount = document.getElementById("googleSignInButton");
    if (!mount || !window.google || !window.google.accounts || !window.google.accounts.id) return;

    var clientId = window.GOOGLE_CLIENT_ID;
    if (!clientId) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredentialResponse,
    });

    window.google.accounts.id.renderButton(mount, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "pill",
      width: 320,
    });
  }

  init();
})();
