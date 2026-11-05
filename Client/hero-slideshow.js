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

  var CART_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2.4l2.62 12.06a2 2 0 0 0 2 1.54h8.2a2 2 0 0 0 1.96-1.6l1.65-8.4H6.1"/></svg>';
  var WHATSAPP_ICON =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.45 1.32 4.95L2 22l5.2-1.36a9.9 9.9 0 0 0 4.84 1.24h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2Zm0 18.2a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.09.81.82-3-.2-.31a8.23 8.23 0 1 1 6.96 3.83Zm4.52-6.13c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.13-.17.25-.64.81-.78.97-.14.17-.29.19-.53.06-.25-.12-1.04-.38-1.99-1.22-.73-.66-1.23-1.46-1.37-1.71-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.24-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.36-.77-1.86-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.57.12.17 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.55.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.1-.23-.16-.48-.28Z"/></svg>';
  var CHECK_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L15 7.5"/></svg>';

  var state = {
    slides: [],
    index: 0,
    timer: null,
    isPaused: false,
    fillRatio: 0,
    fillDuration: 0,
    fillStartedAt: 0,
    pausedRemainingMs: 0,
  };

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function heroImageMarkup(product, index) {
    var specs = product.specs || {};
    var desktopImage = specs.cardDesktopImage || (product.images && product.images[0]) || "assets/outdoor-cinema.jpg";
    var mobileImage = specs.cardMobileImage;

    return '<picture>' +
      (mobileImage ? '<source media="(max-width: 820px)" srcset="' + escapeHtml(mobileImage) + '" />' : '') +
      '<img src="' + escapeHtml(desktopImage) + '" alt="' + escapeHtml(product.name) + '" loading="' + (index === 0 ? "eager" : "lazy") + '" />' +
      '</picture>';
  }

  function stockInfo(product) {
    var stock = Number(product.stock || 0);
    if (stock <= 0) return { label: "Out of stock", className: "is-out" };
    if (stock <= 5) return { label: stock + " left in stock", className: "is-low" };
    return { label: "In stock", className: "is-ok" };
  }

  function heroPriceMarkup(product) {
    var price = Number(product.price || 0);
    var compareAtPrice = Number(product.compareAtPrice || 0);
    if (compareAtPrice <= price) return '<span class="hero-slide-meta-price price-current">' + priceFormatter.format(price) + "</span>";
    var discountPercent = Math.round((1 - price / compareAtPrice) * 100);
    return '<span class="hero-slide-meta-price price-current">' + priceFormatter.format(price) + '</span><del class="hero-slide-meta-price-compare">' + priceFormatter.format(compareAtPrice) + '</del><span class="hero-slide-meta-discount">-' + discountPercent + '%</span>';
  }

  function whatsappUrl(product) {
    var productUrl = new URL("product.html?id=" + encodeURIComponent(product.id), window.location.href).href;
    var message = "Hi Vibecraft, I'm interested in " + product.name + ". Product link: " + productUrl;
    return window.VibecraftContact ? window.VibecraftContact.toWhatsAppUrl(message) : "https://wa.me/254707472897?text=" + encodeURIComponent(message);
  }

  function slideMarkup(product, index, categoryName) {
    var description = product.shortSummary || product.description || "";
    var stock = stockInfo(product);

    return [
      '<div class="hero-slide' + (index === 0 ? " is-active" : "") + '" data-index="' + index + '" aria-hidden="' + (index === 0 ? "false" : "true") + '">',
      heroImageMarkup(product, index),
      '<div class="hero-slide-scrim"></div>',
      '<div class="hero-slide-info">',
      '<div class="hero-slide-badges">',
      categoryName ? '<span class="hero-slide-badge hero-slide-badge-outline">' + escapeHtml(categoryName) + "</span>" : "",
      '<span class="hero-slide-badge">New arrival</span>',
      "</div>",
      '<h2 class="hero-slide-title">' + escapeHtml(product.name) + "</h2>",
      '<div class="hero-slide-meta">',
      heroPriceMarkup(product),
      '<span class="hero-slide-meta-dot" aria-hidden="true">•</span>',
      '<span class="hero-slide-meta-stock ' + stock.className + '">' + stock.label + "</span>",
      product.brand ? '<span class="hero-slide-meta-dot" aria-hidden="true">•</span><span class="hero-slide-meta-brand">' + escapeHtml(product.brand) + "</span>" : "",
      "</div>",
      description ? '<p class="hero-slide-desc">' + escapeHtml(description) + "</p>" : "",
      '<div class="hero-slide-actions">',
      '<a class="button button-dark hero-slide-cta" href="product.html?id=' + encodeURIComponent(product.id) + '">View product <span>↗</span></a>',
      '<button class="hero-slide-quickadd" type="button" data-product-id="' +
        escapeHtml(product.id) +
        '" aria-label="Add ' +
        escapeHtml(product.name) +
        ' to cart"' +
        (stock.className === "is-out" ? " disabled" : "") +
        ">" +
        CART_ICON +
        "</button>",
      '<a class="hero-slide-whatsapp" href="' + whatsappUrl(product) + '" target="_blank" rel="noopener noreferrer" aria-label="Get instant help about ' + escapeHtml(product.name) + ' on WhatsApp">' + WHATSAPP_ICON + "</a>",
      "</div>",
      "</div>",
      "</div>",
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
      fill.style.transform = i < index ? "scaleX(1)" : "scaleX(0)";
    });

    state.index = index;
  }

  // Animates the active segment's fill from `ratio` (0-1) to fully filled over `durationMs`,
  // using a compositor-only `transform` animation (not `width`) so it doesn't force layout on
  // every frame — that was the cause of visible stutter. Position is tracked via timestamps
  // rather than reading the rendered style back, which would itself force a layout flush.
  function animateFillFrom(ratio, durationMs) {
    state.fillRatio = ratio;
    state.fillDuration = durationMs;
    state.fillStartedAt = Date.now();

    var fill = activeFillEl();
    if (!fill) return;

    if (reduceMotion) {
      fill.style.transitionDuration = "0s";
      fill.style.transform = "scaleX(1)";
      return;
    }

    fill.style.transitionDuration = "0s";
    fill.style.transform = "scaleX(" + ratio + ")";
    // Force a reflow so the reset above applies before the transition below starts.
    // eslint-disable-next-line no-unused-expressions
    fill.offsetWidth;
    fill.style.transitionDuration = durationMs + "ms";
    fill.style.transform = "scaleX(1)";
  }

  function startAutoplay() {
    clearTimer();
    if (reduceMotion || state.slides.length <= 1 || state.isPaused) return;

    animateFillFrom(0, SLIDE_DURATION_MS);
    state.timer = setTimeout(function () {
      goTo(state.index + 1);
    }, SLIDE_DURATION_MS);
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

    var elapsed = Date.now() - state.fillStartedAt;
    var progress = state.fillDuration > 0 ? Math.min(1, elapsed / state.fillDuration) : 1;
    var overallRatio = Math.min(1, Math.max(0, state.fillRatio + (1 - state.fillRatio) * progress));

    var fill = activeFillEl();
    if (fill) {
      fill.style.transitionDuration = "0s";
      fill.style.transform = "scaleX(" + overallRatio + ")";
    }

    state.fillRatio = overallRatio;
    state.pausedRemainingMs = Math.max(0, state.fillDuration - elapsed);
  }

  function resume() {
    if (!state.isPaused) return;
    state.isPaused = false;
    if (reduceMotion || state.slides.length <= 1) return;

    var remainingMs = Math.max(400, state.pausedRemainingMs || 0);
    animateFillFrom(state.fillRatio, remainingMs);

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

    slidesEl.addEventListener("click", async function (event) {
      var btn = event.target.closest(".hero-slide-quickadd");
      if (!btn || btn.disabled || !window.VibecraftCart || !window.VibecraftApi) return;

      btn.disabled = true;
      var customer = await window.VibecraftApi.requireCustomer();
      if (!customer) {
        btn.disabled = false;
        return;
      }

      window.VibecraftCart.addItem(btn.getAttribute("data-product-id"), 1);
      btn.disabled = false;

      btn.classList.add("is-added");
      btn.innerHTML = CHECK_ICON;
      clearTimeout(btn._resetTimer);
      btn._resetTimer = setTimeout(function () {
        btn.classList.remove("is-added");
        btn.innerHTML = CART_ICON;
      }, 1600);
    });
  }

  async function boot() {
    try {
      var responses = await Promise.all([window.VibecraftApi.get("products"), window.VibecraftApi.get("categories")]);
      var products = ((responses[0] && responses[0].data) || [])
        .filter(function (product) { return /(^|-)?projectors$/.test(String(product.categoryId || "").toLowerCase()); })
        .slice(0, MAX_SLIDES);
      var categories = (responses[1] && responses[1].data) || [];
      var categoryNameById = {};
      categories.forEach(function (category) {
        categoryNameById[category.id] = category.name;
      });

      if (!products.length) return;

      state.slides = products;
      slidesEl.innerHTML = products
        .map(function (product, index) {
          return slideMarkup(product, index, categoryNameById[product.categoryId]);
        })
        .join("");
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
