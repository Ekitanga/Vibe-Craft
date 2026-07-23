(function () {
  "use strict";

  var MAX_SLIDES = 10;
  var SLIDE_DURATION_MS = 6000;

  var sectionEl = document.getElementById("top");
  var slidesEl = document.getElementById("heroSlides");
  var prevBtn = document.getElementById("heroPrev");
  var nextBtn = document.getElementById("heroNext");
  var progressEl = document.getElementById("heroProgress");

  if (!sectionEl || !slidesEl || !window.VibecraftApi) return;

  var priceFormatter = new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 });
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var state = { slides: [], index: 0, timer: null, isPaused: false };

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function slideMarkup(product, index) {
    var image = (product.images && product.images[0]) || "assets/outdoor-cinema.jpg";

    return [
      '<a class="hero-slide' + (index === 0 ? " is-active" : "") + '" href="product.html?id=' + encodeURIComponent(product.id) + '" data-index="' + index + '" aria-hidden="' + (index === 0 ? "false" : "true") + '">',
      '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(product.name) + '" loading="' + (index === 0 ? "eager" : "lazy") + '" />',
      '<div class="hero-slide-scrim"></div>',
      '<div class="hero-slide-info">',
      '<span class="hero-slide-badge">New arrival</span>',
      '<h2 class="hero-slide-title">' + escapeHtml(product.name) + "</h2>",
      '<p class="hero-slide-price">' + priceFormatter.format(Number(product.price || 0)) + "</p>",
      '<span class="button button-dark hero-slide-cta">View product <span>↗</span></span>',
      "</div>",
      "</a>",
    ].join("");
  }

  function progressSegMarkup(product, index) {
    return (
      '<button class="hero-progress-seg' + (index === 0 ? " is-active" : "") + '" type="button" role="tab" data-index="' + index +
      '" aria-label="Show ' + escapeHtml(product.name) + '" aria-current="' + (index === 0 ? "true" : "false") + '">' +
      '<span class="hero-progress-fill"></span>' +
      "</button>"
    );
  }

  function clearTimer() {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  function activeFillEl() {
    return progressEl.querySelector(".hero-progress-seg.is-active .hero-progress-fill");
  }

  function setActiveSlide(index) {
    var slideEls = slidesEl.querySelectorAll(".hero-slide");
    var segEls = progressEl.querySelectorAll(".hero-progress-seg");

    slideEls.forEach(function (el, i) {
      el.classList.toggle("is-active", i === index);
      el.setAttribute("aria-hidden", i === index ? "false" : "true");
    });

    segEls.forEach(function (el, i) {
      el.classList.toggle("is-active", i === index);
      el.setAttribute("aria-current", i === index ? "true" : "false");

      var fill = el.querySelector(".hero-progress-fill");
      if (!fill) return;

      fill.style.transitionDuration = "0s";
      fill.style.width = i < index ? "100%" : "0%";
    });

    state.index = index;
  }

  function startAutoplay(durationOverrideMs) {
    clearTimer();
    if (reduceMotion || state.slides.length <= 1 || state.isPaused) return;

    var duration = durationOverrideMs || SLIDE_DURATION_MS;
    var fill = activeFillEl();

    if (fill) {
      fill.style.transitionDuration = "0s";
      fill.style.width = "0%";
      // Force a reflow so the reset above applies before the transition below starts.
      // eslint-disable-next-line no-unused-expressions
      fill.offsetWidth;
      fill.style.transitionDuration = duration + "ms";
      fill.style.width = "100%";
    }

    state.timer = setTimeout(function () {
      goTo(state.index + 1);
    }, duration);
  }

  function goTo(nextIndex) {
    if (!state.slides.length) return;

    var wrapped = ((nextIndex % state.slides.length) + state.slides.length) % state.slides.length;
    setActiveSlide(wrapped);
    startAutoplay();
  }

  function pause() {
    if (state.isPaused) return;
    state.isPaused = true;
    clearTimer();

    var fill = activeFillEl();
    if (!fill) return;

    var currentWidth = parseFloat(window.getComputedStyle(fill).width) || 0;
    var trackWidth = fill.parentElement.clientWidth || 1;
    fill._frozenRatio = Math.min(1, currentWidth / trackWidth);
    fill.style.transitionDuration = "0s";
    fill.style.width = fill._frozenRatio * 100 + "%";
  }

  function resume() {
    if (!state.isPaused) return;
    state.isPaused = false;
    if (reduceMotion || state.slides.length <= 1) return;

    var fill = activeFillEl();
    if (!fill) {
      startAutoplay();
      return;
    }

    var ratio = fill._frozenRatio || 0;
    var remainingMs = Math.max(400, (1 - ratio) * SLIDE_DURATION_MS);

    fill.style.transitionDuration = remainingMs + "ms";
    fill.style.width = "100%";

    state.timer = setTimeout(function () {
      goTo(state.index + 1);
    }, remainingMs);
  }

  function wireControls() {
    prevBtn.addEventListener("click", function () {
      goTo(state.index - 1);
    });

    nextBtn.addEventListener("click", function () {
      goTo(state.index + 1);
    });

    progressEl.addEventListener("click", function (event) {
      var seg = event.target.closest(".hero-progress-seg");
      if (!seg) return;
      goTo(Number(seg.getAttribute("data-index")));
    });

    sectionEl.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") goTo(state.index - 1);
      if (event.key === "ArrowRight") goTo(state.index + 1);
    });

    sectionEl.addEventListener("mouseenter", pause);
    sectionEl.addEventListener("mouseleave", resume);
    sectionEl.addEventListener("focusin", pause);
    sectionEl.addEventListener("focusout", resume);

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) pause();
      else resume();
    });

    var touchState = null;

    slidesEl.addEventListener(
      "touchstart",
      function (event) {
        var touch = event.touches[0];
        touchState = { startX: touch.clientX, startY: touch.clientY, time: Date.now() };
      },
      { passive: true }
    );

    slidesEl.addEventListener("touchend", function (event) {
      if (!touchState) return;

      var touch = event.changedTouches[0];
      var dx = touch.clientX - touchState.startX;
      var dy = touch.clientY - touchState.startY;
      var dt = Date.now() - touchState.time;
      touchState = null;

      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) && dt < 600) {
        event.preventDefault();
        goTo(state.index + (dx < 0 ? 1 : -1));
      }
    });
  }

  async function boot() {
    try {
      var payload = await window.VibecraftApi.get("products");
      var products = ((payload && payload.data) || []).slice(0, MAX_SLIDES);

      if (!products.length) return;

      state.slides = products;
      slidesEl.innerHTML = products.map(slideMarkup).join("");
      progressEl.innerHTML = products.map(progressSegMarkup).join("");

      if (products.length > 1) {
        prevBtn.hidden = false;
        nextBtn.hidden = false;
      }
      progressEl.hidden = false;

      wireControls();
      startAutoplay();
    } catch (_error) {
      // Keep the static fallback slide already in the markup.
    }
  }

  boot();
})();
