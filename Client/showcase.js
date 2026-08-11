(function () {
  "use strict";

  var main = document.querySelector("main");
  if (!main || !window.VibecraftApi) return;

  main.innerHTML = [
    '<section class="hero-slideshow showcase-hero" id="top" aria-roledescription="carousel" aria-label="Featured projectors">',
    '  <div class="hero-slides" id="heroSlides">',
    '    <div class="hero-slide is-active" data-index="0">',
    '      <img src="assets/outdoor-cinema.jpg" alt="Outdoor cinema setup at sunset" />',
    '      <div class="hero-slide-scrim"></div>',
    '      <div class="hero-slide-info">',
    '        <div class="hero-slide-badges"><span class="hero-slide-badge">Vibecraft collection</span></div>',
    '        <h1 class="hero-slide-title">Projectors, in their element.</h1>',
    '        <p class="hero-slide-desc">Home cinema, boardroom, or somewhere in between.</p>',
    '        <div class="hero-slide-actions"><a class="button button-dark hero-slide-cta" href="#collection">Explore the collection <span>&#8594;</span></a></div>',
    '      </div>',
    '    </div>',
    '  </div>',
    '  <button class="hero-arrow hero-arrow-prev" id="heroPrev" type="button" aria-label="Previous projector" hidden>&#8249;</button>',
    '  <button class="hero-arrow hero-arrow-next" id="heroNext" type="button" aria-label="Next projector" hidden>&#8250;</button>',
    '  <div class="hero-progress" id="heroProgress" role="tablist" aria-label="Choose a featured projector" hidden></div>',
    '</section>',
    '<section class="shop-section showcase-collection section-shell" id="collection">',
    '  <div class="showcase-filters" id="showcaseFilters" role="tablist" aria-label="Filter products">',
    '    <button class="showcase-filter is-active" type="button" role="tab" aria-selected="true" data-filter="all">All</button>',
    '    <button class="showcase-filter" type="button" role="tab" aria-selected="false" data-filter="projectors">Projectors</button>',
    '    <button class="showcase-filter" type="button" role="tab" aria-selected="false" data-filter="screens">Screens</button>',
    '    <button class="showcase-filter" type="button" role="tab" aria-selected="false" data-filter="portable">Portable</button>',
    '    <button class="showcase-filter" type="button" role="tab" aria-selected="false" data-filter="office">Office</button>',
    '  </div>',
    '  <div class="showcase-grid" id="shopCategories" aria-live="polite"><p class="shop-rail-status" role="status">Loading products...</p></div>',
    '</section>',
    '<dialog class="quick-view-dialog" id="quickViewDialog" aria-labelledby="quickViewTitle"><button class="quick-view-close" type="button" data-close-quick-view aria-label="Close quick view">×</button><div id="quickViewContent"></div></dialog>',
    '<section class="room-showcase section-shell" id="rooms">',
    '  <div class="section-heading"><div><p class="eyebrow">Shop by room</p><h2>See it <em>there.</em></h2></div><p class="section-note">A better picture starts with the right space.</p></div>',
    '  <div class="room-grid">',
    '    <a class="room-tile room-tile-home" href="#collection" data-room-filter="portable"><span>Home cinema</span><strong>Settle in</strong></a>',
    '    <a class="room-tile room-tile-office" href="#collection" data-room-filter="office"><span>Work &amp; learn</span><strong>Bring clarity</strong></a>',
    '    <a class="room-tile room-tile-outdoor" href="#collection" data-room-filter="all"><span>Open air</span><strong>Take it outside</strong></a>',
    '  </div>',
    '</section>',
  ].join("");

  var gallery = document.getElementById("shopCategories");
  var filters = document.getElementById("showcaseFilters");
  var searchToggle = document.getElementById("navSearchToggle");
  var searchPanel = document.getElementById("productSearchPanel");
  var searchForm = document.getElementById("productSearchForm");
  var searchInput = document.getElementById("productSearchInput");
  var searchStatus = document.getElementById("productSearchStatus");
  var products = [];
  var currencyFormatters = {};
  var activeFilter = "all";
  var searchQuery = new URLSearchParams(window.location.search).get("search") || "";
  searchQuery = searchQuery.trim().toLowerCase();
  if (searchInput) searchInput.value = searchQuery;
  var fallbackProducts = [
    { id: "vc-cinebeam-pro-4k", name: "VC CineBeam Pro 4K Smart Projector", brand: "Vibecraft", categoryId: "projectors", projectorType: "home", resolution: "4K UHD support", price: 189000, currency: "KES", images: ["https://images.unsplash.com/photo-1756729924040-9d0084a4fdbe?auto=format&fit=crop&q=82&w=1400"], shortSummary: "Premium home cinema." },
    { id: "vc-lumen-home-1080", name: "VC Lumen Home 1080 Smart Projector", brand: "Vibecraft", categoryId: "projectors", projectorType: "portable", resolution: "1080p", price: 68500, currency: "KES", images: ["https://images.unsplash.com/photo-1750994700092-19f94d4da5ff?auto=format&fit=crop&q=82&w=1400"], shortSummary: "Compact everyday viewing." },
    { id: "vc-boardroom-x5000", name: "VC Boardroom X5000 Presentation Projector", brand: "Vibecraft", categoryId: "projectors", projectorType: "office", resolution: "5000 ANSI lumens", price: 142000, currency: "KES", images: ["https://images.unsplash.com/photo-1756729924123-d7e8d85afaec?auto=format&fit=crop&q=82&w=1400"], shortSummary: "Bright room clarity." },
    { id: "vc-tripod-screen-100", name: "VC FlexView 100 Inch Tripod Screen", brand: "Vibecraft", categoryId: "screens", projectorType: "portable", resolution: "4K ready surface", price: 23500, currency: "KES", images: ["assets/outdoor-cinema.jpg"], shortSummary: "A cleaner projection surface." }
  ];

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function formatPrice(amount, currency) {
    var code = currency || "KES";
    if (!currencyFormatters[code]) currencyFormatters[code] = new Intl.NumberFormat("en-KE", { style: "currency", currency: code, maximumFractionDigits: 0 });
    return currencyFormatters[code].format(Number(amount || 0));
  }

  function priceMarkup(product) {
    var price = Number(product.price || 0);
    var compareAtPrice = Number(product.compareAtPrice || 0);
    var isDiscounted = compareAtPrice > price;

    if (!isDiscounted) return '<strong class="price-current">' + formatPrice(price, product.currency) + "</strong>";

    var discountPercent = Math.round((1 - price / compareAtPrice) * 100);
    return '<span class="price-stack"><strong class="price-current">' + formatPrice(price, product.currency) + '</strong><del class="price-compare">' + formatPrice(compareAtPrice, product.currency) + '</del><span class="price-discount">-' + discountPercent + '%</span></span>';
  }

  function isProjectorProduct(product) {
    return /(^|-)?projectors$/.test(String(product.categoryId || "").toLowerCase());
  }

  function productMatches(product, filter) {
    if (filter === "all") return true;
    if (filter === "portable" || filter === "office") return product.projectorType === filter;
    if (filter === "projectors") return isProjectorProduct(product);
    return product.categoryId === filter;
  }

  function productMarkup(product, index) {
    var image = product.images && product.images[0] ? product.images[0] : "assets/outdoor-cinema.jpg";
    var isWishlisted = window.VibecraftWishlist && window.VibecraftWishlist.has(product.id);
    return [
      '<article class="product-card showcase-card" data-product-id="' + escapeHtml(product.id) + '" data-category="' + escapeHtml(product.categoryId) + '" data-type="' + escapeHtml(product.projectorType || "") + '">',
      '<a class="showcase-card-link" data-product-link href="product.html?id=' + encodeURIComponent(product.id) + '"><div class="product-card-media"><img src="' + escapeHtml(image) + '" alt="' + escapeHtml(product.name) + '" loading="' + (index < 3 ? "eager" : "lazy") + '" />',
      '</div>',
      '<div class="product-card-body"><h3>' + escapeHtml(product.name) + '</h3>',
      '<div class="showcase-card-meta">' + priceMarkup(product) + '</div></div></a>',
      '<div class="showcase-card-actions">',
      '<button class="showcase-card-cart" type="button" data-card-action="cart" data-product-id="' + escapeHtml(product.id) + '" aria-label="Add ' + escapeHtml(product.name) + ' to cart"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2.4l2.62 12.06a2 2 0 0 0 2 1.54h8.2a2 2 0 0 0 1.96-1.6l1.65-8.4H6.1"/></svg></button>',
      '<button class="showcase-card-icon' + (isWishlisted ? " is-selected" : "") + '" type="button" data-card-action="wishlist" data-product-id="' + escapeHtml(product.id) + '" aria-pressed="' + (isWishlisted ? "true" : "false") + '" aria-label="' + (isWishlisted ? "Remove from wishlist" : "Add to wishlist") + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 8.7c0 5.3-8.8 10.1-8.8 10.1S3.2 14 3.2 8.7A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.7Z"/></svg></button>',
      '<button class="showcase-card-icon" type="button" data-card-action="quick-view" data-product-id="' + escapeHtml(product.id) + '" aria-label="Quick view ' + escapeHtml(product.name) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg></button>',
      '</div></article>'
    ].join("");
  }

  function renderGallery(filter) {
    activeFilter = filter;
    var visible = products.filter(function (product) {
      if (!productMatches(product, filter)) return false;
      if (!searchQuery) return true;
      return [product.name, product.brand, product.categoryId, product.projectorType].join(" ").toLowerCase().indexOf(searchQuery) !== -1;
    });
    gallery.innerHTML = visible.length ? visible.map(productMarkup).join("") : '<p class="shop-rail-status">No products found for &ldquo;' + escapeHtml(searchQuery) + '&rdquo;.</p>';
    if (searchStatus) searchStatus.textContent = searchQuery ? visible.length + " result" + (visible.length === 1 ? "" : "s") + " found" : "Search the collection by name or type.";
  }

  function specValue(product, key, fallback) {
    return product[key] || (product.specs && product.specs[key]) || fallback || "-";
  }

  function numericLumens(product) {
    var value = Number(product.ansiLumens || 0);
    if (value) return value;
    var brightness = String(specValue(product, "brightness", "")).replace(/,/g, "").match(/\d+/);
    return brightness ? Number(brightness[0]) : 0;
  }

  function localComparisonSummary(selected) {
    if (selected.length < 2) return "Select at least two products for a comparison.";

    var brightest = selected.slice().sort(function (a, b) { return numericLumens(b) - numericLumens(a); })[0];
    var cheapest = selected.slice().sort(function (a, b) { return Number(a.price || 0) - Number(b.price || 0); })[0];
    var lines = [brightest.name + " is the stronger bright-room pick because it has the highest listed brightness."];

    if (cheapest.id !== brightest.id) lines.push(cheapest.name + " is the value pick at " + formatPrice(cheapest.price, cheapest.currency) + ".");
    lines.push("For the best choice, match the brighter option to daylight-heavy rooms and the lower-priced option to everyday viewing or a tighter budget.");
    return lines.join(" ");
  }

  async function requestAiComparison(selected) {
    var verdictText = document.getElementById("compareVerdictText");
    var verdictStatus = document.getElementById("compareVerdictStatus");

    if (selected.length < 2) {
      verdictText.textContent = localComparisonSummary(selected);
      verdictStatus.textContent = "Choose two or three products";
      return;
    }

    var prompt = [
      "Compare these selected Vibecraft products like a concise GSMArena buyer's guide.",
      "Say which one is better for bright rooms, which is better for image quality or features, and which is better value.",
      "Give a clear overall recommendation, but explain when another option makes more sense.",
      "Use only exact catalog facts. Keep it to 3 short paragraphs or 4 short bullets. Do not repeat the entire spec table.",
      "Selected products: " + selected.map(function (product) {
        return product.name + " | price: " + formatPrice(product.price, product.currency) + " | resolution: " + specValue(product, "resolution") + " | brightness: " + specValue(product, "brightness") + " | type: " + specValue(product, "projectorType", product.categoryId) + " | summary: " + (product.shortSummary || "");
      }).join(" || ")
    ].join("\n");

    try {
      var payload = await window.VibecraftApi.post("ai/chat", { message: prompt, history: [] });
      verdictText.textContent = payload && payload.data && payload.data.reply ? payload.data.reply : localComparisonSummary(selected);
      verdictStatus.textContent = "Catalog-aware summary";
    } catch (_error) {
      verdictText.textContent = localComparisonSummary(selected);
      verdictStatus.textContent = "Quick summary";
    }
  }

  function renderCompareDialog() {
    var body = document.getElementById("compareDialogBody");
    var selected = compareIds.map(function (id) { return products.find(function (product) { return product.id === id; }); }).filter(Boolean);
    body.innerHTML = '<section class="compare-verdict" aria-live="polite"><div class="compare-verdict-head"><div class="compare-verdict-title"><span class="ai-orb ai-orb-avatar" aria-hidden="true"></span><div><p class="eyebrow">AI comparison</p><strong>Which one is better?</strong></div></div><span id="compareVerdictStatus">Comparing...</span></div><p id="compareVerdictText">Reading the selected products...</p></section><div class="compare-table-scroll" aria-hidden="true"><span>Swipe left to see more</span><span>↔</span></div><div class="compare-table-wrap" tabindex="0" role="region" aria-label="Scrollable product comparison"><table class="compare-table"><thead><tr><th> </th>' + selected.map(function (product) { return '<th>' + escapeHtml(product.name) + '</th>'; }).join("") + '</tr></thead><tbody>' + [
      ["Price", selected.map(function (product) { return formatPrice(product.price, product.currency); })],
      ["Resolution", selected.map(function (product) { return specValue(product, "resolution"); })],
      ["Brightness", selected.map(function (product) { return specValue(product, "brightness"); })],
      ["Projection size", selected.map(function (product) { return specValue(product, "projectionSize"); })],
      ["Type", selected.map(function (product) { return specValue(product, "projectorType", product.categoryId); })]
    ].map(function (row) { return '<tr><th>' + row[0] + '</th>' + row[1].map(function (value) { return '<td>' + escapeHtml(value) + '</td>'; }).join("") + '</tr>'; }).join("") + '</tbody></table></div>';
    requestAiComparison(selected);
  }

  function renderQuickView(product) {
    var dialog = document.getElementById("quickViewDialog");
    var content = document.getElementById("quickViewContent");
    if (!dialog || !content || !product) return;

    var image = product.images && product.images[0] ? product.images[0] : "assets/outdoor-cinema.jpg";
    content.innerHTML = '<div class="quick-view-layout"><div class="quick-view-image"><img src="' + escapeHtml(image) + '" alt="' + escapeHtml(product.name) + '"></div><div class="quick-view-copy"><p class="eyebrow">Quick view</p><h2 id="quickViewTitle">' + escapeHtml(product.name) + '</h2><p class="quick-view-price">' + priceMarkup(product) + '</p><p>' + escapeHtml(product.shortSummary || product.description || "A practical addition to your setup.") + '</p><div class="quick-view-actions"><button class="button button-dark" type="button" data-quick-add="' + escapeHtml(product.id) + '">Add to cart</button><a class="button button-outline" href="product.html?id=' + encodeURIComponent(product.id) + '">View details</a></div></div></div>';
    dialog.showModal();
  }

  function selectFilter(filter) {
    filters.querySelectorAll("[data-filter]").forEach(function (button) {
      var active = button.getAttribute("data-filter") === filter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    renderGallery(filter);
  }

  document.querySelectorAll("[data-scene-filter]").forEach(function (button) {
    button.addEventListener("click", function () {
      document.querySelectorAll("[data-scene-filter]").forEach(function (item) { item.classList.toggle("is-active", item === button); });
      selectFilter(button.getAttribute("data-scene-filter"));
    });
  });

  filters.addEventListener("click", function (event) {
    var button = event.target.closest("[data-filter]");
    if (button) selectFilter(button.getAttribute("data-filter"));
  });

  gallery.addEventListener("click", function (event) {
    var button = event.target.closest("[data-card-action]");
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    var productId = button.getAttribute("data-product-id");
    var product = products.find(function (item) { return item.id === productId; });
    if (!product) return;

    if (button.getAttribute("data-card-action") === "cart") {
      window.VibecraftCart.addItem(product.id, 1);
      button.classList.add("is-added");
      window.setTimeout(function () { button.classList.remove("is-added"); }, 1400);
    } else if (button.getAttribute("data-card-action") === "wishlist") {
      window.VibecraftWishlist.toggle(product);
    } else if (button.getAttribute("data-card-action") === "quick-view") {
      renderQuickView(product);
    }
  });

  document.getElementById("quickViewDialog").addEventListener("click", function (event) {
    if (event.target.closest("[data-close-quick-view]")) document.getElementById("quickViewDialog").close();
    var addButton = event.target.closest("[data-quick-add]");
    if (!addButton) return;
    window.VibecraftCart.addItem(addButton.getAttribute("data-quick-add"), 1);
    addButton.textContent = "Added to cart";
  });

  document.addEventListener("wishlist:change", function () { renderGallery(activeFilter); });

  document.querySelectorAll("[data-room-filter]").forEach(function (tile) {
    tile.addEventListener("click", function () {
      selectFilter(tile.getAttribute("data-room-filter"));
    });
  });

  function setSearchOpen(isOpen) {
    if (!searchPanel || !searchToggle) return;
    searchPanel.hidden = !isOpen;
    searchToggle.setAttribute("aria-expanded", String(isOpen));
    if (isOpen && searchInput) window.setTimeout(function () { searchInput.focus(); }, 0);
  }

  if (searchToggle && searchPanel && searchInput) {
    searchToggle.addEventListener("click", function () { setSearchOpen(searchPanel.hidden); });
    searchInput.addEventListener("input", function () {
      searchQuery = searchInput.value.trim().toLowerCase();
      renderGallery(activeFilter);
    });
    searchForm.addEventListener("submit", function (event) {
      event.preventDefault();
      document.getElementById("collection").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    document.addEventListener("click", function (event) {
      if (!searchPanel.hidden && !searchPanel.contains(event.target) && !searchToggle.contains(event.target)) setSearchOpen(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setSearchOpen(false);
    });
  }

  window.VibecraftApi.get("products").then(function (payload) {
    products = (payload && payload.data) || fallbackProducts;
    if (!products.length) products = fallbackProducts;
    renderGallery("all");
  }).catch(function () {
    products = fallbackProducts;
    renderGallery("all");
  });
})();
