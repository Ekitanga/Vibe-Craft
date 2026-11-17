(function () {
  "use strict";

  var containerEl = document.getElementById("shopCategories");

  if (!containerEl || !window.VibecraftApi) return;

  var priceFormatters = {};
  var railControls = [];

  function formatPrice(amount, currency) {
    var code = currency || "KES";

    if (!priceFormatters[code]) {
      priceFormatters[code] = new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency: code,
        maximumFractionDigits: 0,
      });
    }

    return priceFormatters[code].format(Number(amount || 0));
  }

  function priceMarkup(product) {
    var price = Number(product.price || 0);
    var compareAtPrice = Number(product.compareAtPrice || 0);
    if (compareAtPrice <= price) return '<span class="price-current">' + formatPrice(price, product.currency) + "</span>";
    var discountPercent = Math.round((1 - price / compareAtPrice) * 100);
    return '<span class="price-stack"><span class="price-current">' + formatPrice(price, product.currency) + '</span><del class="price-compare">' + formatPrice(compareAtPrice, product.currency) + '</del><span class="price-discount">-' + discountPercent + '%</span></span>';
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function cardImageMarkup(product) {
    var specs = product.specs || {};
    var desktopImage = specs.cardDesktopImage || (product.images && product.images[0]);
    var mobileImage = specs.cardMobileImage;
    if (!desktopImage && !mobileImage) return "";

    return '<picture>' +
      (mobileImage ? '<source media="(max-width: 560px)" srcset="' + escapeHtml(mobileImage) + '" />' : '') +
      '<img src="' + escapeHtml(desktopImage || mobileImage) + '" alt="' + escapeHtml(product.name) + '" loading="lazy" />' +
      '</picture>';
  }

  function skeletonCardMarkup() {
    return [
      '<article class="product-card is-skeleton" aria-hidden="true">',
      '<div class="product-card-media"></div>',
      '<div class="product-card-body">',
      '<span class="skeleton-bar w-60"></span>',
      '<span class="skeleton-bar w-40"></span>',
      "</div>",
      "</article>",
    ].join("");
  }

  function renderSkeleton() {
    var groups = "";

    for (var g = 0; g < 2; g++) {
      var cards = "";
      for (var i = 0; i < 3; i++) cards += skeletonCardMarkup();

      groups += [
        '<section class="category-rail is-skeleton" aria-hidden="true">',
        '<div class="category-rail-heading"><span class="skeleton-bar heading"></span></div>',
        '<div class="shop-rail-wrap"><div class="shop-rail">' + cards + "</div></div>",
        "</section>",
      ].join("");
    }

    containerEl.innerHTML = groups;
  }

  function productCardMarkup(product) {
    var stock = Number(product.stock || 0);
    var lowStock = stock > 0 && stock <= 3;
    var outOfStock = stock <= 0;
    var stockLabel = outOfStock ? "Out of stock" : lowStock ? stock + " left" : "In stock";

    return [
      '<a class="product-card" href="' + window.VibecraftApi.productUrl(product) + '">',
      '<div class="product-card-media">',
      cardImageMarkup(product),
      product.featured ? '<span class="product-card-badge">Featured</span>' : "",
      "</div>",
      '<div class="product-card-body">',
      "<h3>" + escapeHtml(product.name) + "</h3>",
      '<p class="product-card-summary">' + escapeHtml(product.shortSummary || product.description || "") + "</p>",
      '<div class="product-card-footer">',
      '<span class="product-card-price">' + priceMarkup(product) + "</span>",
      '<span class="product-card-stock' + (lowStock ? " is-low" : "") + '">' + stockLabel + "</span>",
      "</div>",
      "</div>",
      "</a>",
    ].join("");
  }

  function categoryRailMarkup(category, products) {
    return [
      '<section class="category-rail" data-category="' + escapeHtml(category.id) + '">',
      '<div class="category-rail-heading">',
      "<h3>" + escapeHtml(category.name) + "</h3>",
      category.description ? "<p>" + escapeHtml(category.description) + "</p>" : "",
      "</div>",
      '<div class="shop-rail-wrap">',
      '<button class="rail-arrow rail-arrow-prev" type="button" aria-label="Scroll ' +
        escapeHtml(category.name) +
        ' left" disabled>‹</button>',
      '<div class="shop-rail" tabindex="0" aria-label="' + escapeHtml(category.name) + ' products">',
      products.map(productCardMarkup).join(""),
      "</div>",
      '<button class="rail-arrow rail-arrow-next" type="button" aria-label="Scroll ' +
        escapeHtml(category.name) +
        ' right">›</button>',
      "</div>",
      "</section>",
    ].join("");
  }

  function initRail(wrapEl) {
    var railEl = wrapEl.querySelector(".shop-rail");
    var prevBtn = wrapEl.querySelector(".rail-arrow-prev");
    var nextBtn = wrapEl.querySelector(".rail-arrow-next");

    function updateArrows() {
      var maxScroll = railEl.scrollWidth - railEl.clientWidth - 2;
      prevBtn.disabled = railEl.scrollLeft <= 0;
      nextBtn.disabled = railEl.scrollLeft >= maxScroll;
    }

    function cardStep() {
      var card = railEl.querySelector(".product-card");
      return card ? card.getBoundingClientRect().width + 16 : railEl.clientWidth * 0.8;
    }

    prevBtn.addEventListener("click", function () {
      railEl.scrollBy({ left: -cardStep(), behavior: "smooth" });
    });

    nextBtn.addEventListener("click", function () {
      railEl.scrollBy({ left: cardStep(), behavior: "smooth" });
    });

    railEl.addEventListener("scroll", updateArrows);

    var dragState = null;

    railEl.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "touch") return;

      dragState = { pointerId: event.pointerId, startX: event.clientX, startScroll: railEl.scrollLeft, moved: false };
    });

    railEl.addEventListener("pointermove", function (event) {
      if (!dragState || event.pointerId !== dragState.pointerId) return;

      var delta = event.clientX - dragState.startX;

      if (!dragState.moved) {
        // Only commit to "this is a drag" (and only then capture the pointer) once the
        // movement is unambiguous. Capturing on every pointerdown would hijack the click
        // that follows an ordinary click/tap, since a captured pointer's click gets
        // retargeted to this rail instead of the card link underneath it.
        if (Math.abs(delta) <= 10) return;
        dragState.moved = true;
        railEl.classList.add("is-dragging");
        railEl.setPointerCapture(event.pointerId);
      }

      railEl.scrollLeft = dragState.startScroll - delta;
    });

    function endDrag(event) {
      if (!dragState) return;

      var moved = dragState.moved;
      dragState = null;

      if (moved) {
        railEl.classList.remove("is-dragging");

        if (railEl.hasPointerCapture(event.pointerId)) {
          railEl.releasePointerCapture(event.pointerId);
        }

        railEl.addEventListener(
          "click",
          function (clickEvent) {
            clickEvent.preventDefault();
            clickEvent.stopPropagation();
          },
          { capture: true, once: true }
        );
      }
    }

    railEl.addEventListener("pointerup", endDrag);
    railEl.addEventListener("pointercancel", endDrag);
    railEl.addEventListener("pointerleave", function (event) {
      if (dragState) endDrag(event);
    });

    // Touch browsers cancel the synthetic click if the finger drifts at all during a tap
    // (which is common inside a horizontally-scrollable rail), so handle taps explicitly
    // instead of relying on that click.
    var touchState = null;

    railEl.addEventListener(
      "touchstart",
      function (event) {
        var touch = event.touches[0];
        var card = event.target.closest(".product-card");
        touchState = card ? { startX: touch.clientX, startY: touch.clientY, time: Date.now(), card: card } : null;
      },
      { passive: true }
    );

    railEl.addEventListener("touchend", function (event) {
      if (!touchState) return;

      var touch = event.changedTouches[0];
      var dx = Math.abs(touch.clientX - touchState.startX);
      var dy = Math.abs(touch.clientY - touchState.startY);
      var dt = Date.now() - touchState.time;
      var card = touchState.card;
      touchState = null;

      if (dx < 10 && dy < 10 && dt < 500) {
        event.preventDefault();
        window.location.href = card.href;
      }
    });

    updateArrows();
    railControls.push(updateArrows);
  }

  function renderCategories(categories, products) {
    railControls = [];

    var byCategory = products.reduce(function (map, product) {
      var list = map[product.categoryId] || [];
      list.push(product);
      map[product.categoryId] = list;
      return map;
    }, {});

    var populated = categories.filter(function (category) {
      return byCategory[category.id] && byCategory[category.id].length;
    });

    if (!populated.length) {
      containerEl.innerHTML = '<p class="shop-rail-status">No products yet — check back soon.</p>';
      return;
    }

    containerEl.innerHTML = populated
      .map(function (category) {
        return categoryRailMarkup(category, byCategory[category.id]);
      })
      .join("");

    containerEl.querySelectorAll(".shop-rail-wrap").forEach(initRail);
  }

  window.addEventListener("resize", function () {
    railControls.forEach(function (update) {
      update();
    });
  });

  async function boot() {
    renderSkeleton();

    try {
      var responses = await Promise.all([window.VibecraftApi.get("categories"), window.VibecraftApi.get("products")]);
      var categories = (responses[0] && responses[0].data) || [];
      var products = (responses[1] && responses[1].data) || [];

      renderCategories(categories, products);
    } catch (_error) {
      containerEl.innerHTML = '<p class="shop-rail-status">Could not load products right now.</p>';
    }
  }

  boot();
})();
