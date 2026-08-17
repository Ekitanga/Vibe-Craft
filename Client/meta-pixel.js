/* Meta Pixel event helpers. The base code is inline in each page <head>. */

window.VibecraftMeta = {
  track: function (eventName, params, options) {
    if (typeof window.fbq !== "function" || !eventName) return;

    var method = options && options.custom ? "trackCustom" : "track";
    window.fbq(method, eventName, params || {});
  },
};

document.addEventListener("click", function (event) {
  var target = event.target && event.target.closest ? event.target.closest("[data-meta-event]") : null;
  if (!target) return;

  var eventName = target.getAttribute("data-meta-event");
  var custom = target.getAttribute("data-meta-custom") === "true";
  if (!eventName && target.matches('a[href*="find-your-setup.html"]')) {
    eventName = "SetupFinderClick";
    custom = true;
  }
  if (!eventName) return;

  var label = target.getAttribute("data-meta-label") || String(target.textContent || "").trim().slice(0, 80);
  window.VibecraftMeta.track(
    eventName,
    label ? { button_label: label } : {},
    { custom: custom }
  );
});
