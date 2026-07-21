(function () {
  "use strict";

  function redirectToLogin() {
    window.location.href = "login.html?next=" + encodeURIComponent("account.html");
  }

  async function boot() {
    var status = document.getElementById("accountStatus");
    var payload;

    try {
      payload = await window.VibecraftApi.get("auth/me");
    } catch (_error) {
      redirectToLogin();
      return;
    }

    var user = payload && payload.data;

    if (!user) {
      redirectToLogin();
      return;
    }

    document.getElementById("accountGreeting").textContent = "Hey, " + (user.name || "there") + ".";
    document.getElementById("accountIntro").textContent = "Here's what we have on file for you.";
    document.getElementById("accountName").textContent = user.name || "-";
    document.getElementById("accountEmail").textContent = user.email || "-";
    document.getElementById("accountPhone").textContent = user.phone || "-";
    document.getElementById("accountCard").hidden = false;
    status.textContent = "";

    document.getElementById("signOutButton").addEventListener("click", async function () {
      try {
        await window.VibecraftApi.post("auth/logout");
      } finally {
        window.location.href = "index.html";
      }
    });
  }

  boot();
})();
