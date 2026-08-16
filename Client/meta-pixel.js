/* Meta Pixel: Vibecraft customer-facing pages */
!(function (f, b, e, v, n, t, s) {
  if (f.fbq) return;
  n = f.fbq = function () {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  };
  if (!f._fbq) f._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = "2.0";
  n.queue = [];
  t = b.createElement(e);
  t.async = true;
  t.src = v;
  s = b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t, s);
})(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

fbq("init", "27209025962115778");
fbq("track", "PageView");

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
