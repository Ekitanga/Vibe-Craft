(function () {
  "use strict";

  var status = document.getElementById("productPageStatus");
  var detail = document.getElementById("productDetail");
  var qty = 1;
  var maxQty = 99;

  function getProductId() {
    return new URLSearchParams(window.location.search).get("id");
  }

  function formatPrice(amount, currency) {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: currency || "KES",
      maximumFractionDigits: 0,
    }).format(Number(amount || 0));
  }

  function priceMarkup(product) {
    var price = Number(product.price || 0);
    var compareAtPrice = Number(product.compareAtPrice || 0);
    var isDiscounted = compareAtPrice > price;

    if (!isDiscounted) return '<span class="price-current">' + formatPrice(price, product.currency) + "</span>";

    var discountPercent = Math.round((1 - price / compareAtPrice) * 100);
    return '<span class="price-stack"><span class="price-current">' + formatPrice(price, product.currency) + '</span><del class="price-compare">' + formatPrice(compareAtPrice, product.currency) + '</del><span class="price-discount">-' + discountPercent + '%</span></span>';
  }

  function humanizeKey(key) {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, function (char) {
        return char.toUpperCase();
      });
  }

  function renderSpecs(specs) {
    var wrap = document.getElementById("productDetailSpecsWrap");
    var list = document.getElementById("productDetailSpecsList");
    var entries = Object.keys(specs || {})
      .filter(function (key) {
        return specs[key] && !["cardDesktopImage", "cardMobileImage", "videos"].includes(key);
      })
      .map(function (key) {
        return [key, specs[key]];
      });

    if (!entries.length) {
      wrap.hidden = true;
      return;
    }

    list.innerHTML = entries
      .map(function (entry) {
        return "<dt>" + humanizeKey(entry[0]) + "</dt><dd>" + entry[1] + "</dd>";
      })
      .join("");
    wrap.hidden = false;
  }

  function renderList(wrapId, listId, items) {
    var wrap = document.getElementById(wrapId);
    var list = document.getElementById(listId);

    if (!items || !items.length) {
      wrap.hidden = true;
      return;
    }

    list.innerHTML = items
      .map(function (item) {
        return "<li>" + item + "</li>";
      })
      .join("");
    wrap.hidden = false;
  }

  function setQtyDisplay() {
    document.getElementById("qtyValue").textContent = qty;
  }

  function videoPosterUrl(src) {
    var value = String(src || "");
    if (value.indexOf("/video/upload/") === -1) return "";
    return value
      .replace("/video/upload/", "/image/upload/")
      .replace(/\.[a-z0-9]+(?=($|\?))/i, ".jpg");
  }

  function playableVideoUrl(src) {
    var value = String(src || "");
    if (value.indexOf("res.cloudinary.com") === -1 || value.indexOf("/video/upload/") === -1) return value;

    return value
      .replace("/video/upload/", "/video/upload/f_mp4,vc_h264/")
      .replace(/\.[a-z0-9]+(?=($|\?))/i, ".mp4");
  }

  function renderThumbnails(images, videos, mainImageEl, mainVideoEl, thumbsEl) {
    var gallery = (images || []).filter(Boolean).map(function (src) {
      return { type: "image", src: src };
    }).concat((videos || []).filter(Boolean).map(function (src) {
      return { type: "video", src: src };
    }));

    thumbsEl.innerHTML = "";

    if (gallery[0] && gallery[0].type === "video") {
      mainImageEl.hidden = true;
      mainVideoEl.hidden = false;
      mainVideoEl.src = playableVideoUrl(gallery[0].src);
      mainVideoEl.poster = videoPosterUrl(gallery[0].src);
      mainVideoEl.load();
    }

    if (gallery.length < 2) {
      thumbsEl.hidden = true;
      return;
    }

    thumbsEl.hidden = false;

    gallery.forEach(function (item, index) {
      var thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "product-thumb" + (index === 0 ? " is-active" : "");
      thumb.setAttribute("aria-label", item.type === "video" ? "Play product video" : "Show image " + (index + 1));

      if (item.type === "video") {
        var videoThumb = document.createElement("video");
        videoThumb.src = playableVideoUrl(item.src);
        videoThumb.poster = videoPosterUrl(item.src);
        videoThumb.muted = true;
        videoThumb.playsInline = true;
        videoThumb.preload = "metadata";
        thumb.appendChild(videoThumb);

        var videoLabel = document.createElement("span");
        videoLabel.className = "product-thumb-video-label";
        videoLabel.textContent = "Video";
        thumb.appendChild(videoLabel);
      } else {
        var img = document.createElement("img");
        img.src = item.src;
        img.alt = "";
        img.loading = "lazy";
        thumb.appendChild(img);
      }

      thumb.addEventListener("click", function () {
        if (item.type === "video") {
          mainImageEl.hidden = true;
          mainVideoEl.hidden = false;
          mainVideoEl.src = playableVideoUrl(item.src);
          mainVideoEl.poster = videoPosterUrl(item.src);
          mainVideoEl.load();
        } else {
          mainVideoEl.pause();
          mainVideoEl.hidden = true;
          mainImageEl.hidden = false;
          mainImageEl.src = item.src;
        }
        thumbsEl.querySelectorAll(".product-thumb").forEach(function (el) {
          el.classList.remove("is-active");
        });
        thumb.classList.add("is-active");
      });

      thumbsEl.appendChild(thumb);
    });

  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function relatedCardMarkup(product) {
    var specs = product.specs || {};
    var desktopImage = specs.cardDesktopImage || (product.images && product.images[0]);
    var mobileImage = specs.cardMobileImage;
    var imageMarkup = desktopImage
      ? '<picture>' +
        (mobileImage ? '<source media="(max-width: 560px)" srcset="' + escapeHtml(mobileImage) + '" />' : "") +
        '<img src="' + escapeHtml(desktopImage) + '" alt="' + escapeHtml(product.name) + '" loading="lazy" />' +
        '</picture>'
      : "";

    return [
      '<a class="product-card showcase-card" href="product.html?id=' + encodeURIComponent(product.id) + '">',
      '<div class="product-card-media">',
      imageMarkup,
      product.featured ? '<span class="product-card-badge">Featured</span>' : "",
      "</div>",
      '<div class="product-card-body">',
      "<h3>" + escapeHtml(product.name) + "</h3>",
      '<div class="showcase-card-meta">' + priceMarkup(product) + "</div>",
      "</div>",
      "</a>",
    ].join("");
  }

  // Ranks candidates by how closely they match the current product: same category and
  // brand matter most, then price closeness, then any shared headline specs — so the rail
  // fills with genuinely comparable projectors rather than just "everything else."
  function similarityScore(base, candidate) {
    var score = 0;

    if (candidate.categoryId && candidate.categoryId === base.categoryId) score += 50;
    if (base.brand && candidate.brand && base.brand.toLowerCase() === candidate.brand.toLowerCase()) score += 20;

    var basePrice = Number(base.price || 0);
    var candidatePrice = Number(candidate.price || 0);
    var priceDiff = Math.abs(basePrice - candidatePrice) / Math.max(basePrice, candidatePrice, 1);
    score += Math.max(0, 30 * (1 - priceDiff));

    var baseSpecs = base.specs || {};
    var candidateSpecs = candidate.specs || {};
    if (baseSpecs.resolution && baseSpecs.resolution === candidateSpecs.resolution) score += 10;
    if (baseSpecs.brightness && baseSpecs.brightness === candidateSpecs.brightness) score += 5;

    return score;
  }

  function initRelatedRail(wrapEl) {
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

    window.addEventListener("resize", updateArrows);
    updateArrows();
  }

  async function renderRelatedProducts(product) {
    var section = document.getElementById("relatedProductsSection");

    try {
      var payload = await window.VibecraftApi.get("products");
      var all = (payload && payload.data) || [];

      var related = all
        .filter(function (candidate) {
          return candidate.id !== product.id;
        })
        .map(function (candidate) {
          return { product: candidate, score: similarityScore(product, candidate) };
        })
        .sort(function (a, b) {
          return b.score - a.score;
        })
        .slice(0, 4)
        .map(function (entry) {
          return entry.product;
        });

      if (!related.length) return;

      document.getElementById("relatedProductsRail").innerHTML = related.map(relatedCardMarkup).join("");
      section.hidden = false;
      initRelatedRail(section.querySelector(".shop-rail-wrap"));
    } catch (_error) {
      // Related products are a nice-to-have; leave the section hidden on failure.
    }
  }

  function getCartQuantity(productId) {
    var existing = window.VibecraftCart.getItems().find(function (item) {
      return item.productId === productId;
    });
    return existing ? existing.quantity : 0;
  }

  function enableHoverZoom(frame, image, video) {
    if (!frame || !image) return;

    function photoIsVisible() {
      return !image.hidden && (!video || video.hidden);
    }

    function setZoomOrigin(event) {
      if (!photoIsVisible()) return;
      var rect = frame.getBoundingClientRect();
      var x = ((event.clientX - rect.left) / rect.width) * 100;
      var y = ((event.clientY - rect.top) / rect.height) * 100;
      image.style.transformOrigin = Math.max(0, Math.min(100, x)) + "% " + Math.max(0, Math.min(100, y)) + "%";
    }

    function clearZoom() {
      frame.classList.remove("is-hover-zoomed");
      image.style.transformOrigin = "center center";
    }

    frame.addEventListener("pointerenter", function (event) {
      if (event.pointerType === "touch" || !photoIsVisible()) return;
      setZoomOrigin(event);
      frame.classList.add("is-hover-zoomed");
    });
    frame.addEventListener("pointermove", function (event) {
      if (event.pointerType !== "touch") setZoomOrigin(event);
    });
    frame.addEventListener("pointerleave", clearZoom);
  }

  async function loadCategoryName(categoryId) {
    try {
      var payload = await window.VibecraftApi.get("categories");
      var categories = (payload && payload.data) || [];
      var category = categories.find(function (item) {
        return item.id === categoryId;
      });
      document.getElementById("productDetailCategory").textContent = category ? category.name : "Vibecraft";
    } catch (_error) {
      document.getElementById("productDetailCategory").textContent = "";
    }
  }

  async function boot() {
    var id = getProductId();

    if (!id) {
      status.textContent = "Product not found.";
      return;
    }

    try {
      var payload = await window.VibecraftApi.get("products/" + id);
      var product = payload.data;

      document.title = "Vibecraft — " + product.name;
      loadCategoryName(product.categoryId);

      var productSpecs = product.specs || {};
      var videos = Array.isArray(productSpecs.videos) ? productSpecs.videos : [];
      var image = product.images && product.images[0];
      var imageEl = document.getElementById("productDetailImage");
      var videoEl = document.getElementById("productDetailVideo");
      enableHoverZoom(document.querySelector(".product-detail-image-frame"), imageEl, videoEl);
      var lightbox = document.getElementById("productLightbox");
      var lightboxImage = document.getElementById("productLightboxImage");
      imageEl.src = image || "";
      imageEl.alt = product.name;
      videoEl.hidden = true;
      var zoomButton = document.getElementById("productImageZoom");
      if (zoomButton) {
        zoomButton.addEventListener("click", function () {
          lightboxImage.src = imageEl.src;
          lightboxImage.alt = imageEl.alt;
          lightbox.showModal();
        });
      }
      document.getElementById("productLightboxClose").addEventListener("click", function () { lightbox.close(); });
      lightbox.addEventListener("click", function (event) {
        if (event.target === lightbox) lightbox.close();
      });
      renderThumbnails(product.images, videos, imageEl, videoEl, document.getElementById("productDetailThumbs"));

      document.getElementById("productDetailName").textContent = product.name;
      document.getElementById("productDetailPrice").innerHTML = priceMarkup(product);
      document.getElementById("productDetailSummary").textContent = product.shortSummary || "";

      var visualFacts = document.getElementById("productVisualFacts");
      var factEntries = [
        ["Resolution", product.resolution || productSpecs.resolution],
        ["Brightness", product.brightness || productSpecs.brightness],
        ["Size", productSpecs.projectionSize],
      ].filter(function (entry) { return entry[1]; }).slice(0, 3);
      if (visualFacts) {
        visualFacts.innerHTML = factEntries.map(function (entry) {
          return '<div class="product-visual-fact"><span>' + escapeHtml(entry[0]) + '</span><strong>' + escapeHtml(entry[1]) + '</strong></div>';
        }).join("");
      }
      document.getElementById("productDetailDescription").textContent = product.description || "";

      var stock = Number(product.stock || 0);
      var stockEl = document.getElementById("productDetailStock");
      var addButton = document.getElementById("addToCartButton");
      var buyNowButton = document.getElementById("buyNowButton");
      var whatsappButton = document.getElementById("whatsappProductButton");
      var qtyMinusButton = document.getElementById("qtyMinus");
      var qtyPlusButton = document.getElementById("qtyPlus");
      var addStatus = document.getElementById("addToCartStatus");
      var outOfStock = stock <= 0;

      whatsappButton.href = "https://wa.me/254707472897?text=" + encodeURIComponent(
        "Hi Vibecraft, I'd like to order or ask about " + product.name + ". Product link: " + window.location.href
      );
      whatsappButton.setAttribute("aria-label", "Get instant help about " + product.name + " on WhatsApp");

      if (outOfStock) {
        stockEl.textContent = "Out of stock";
        stockEl.classList.add("is-out");
      } else if (stock <= 3) {
        stockEl.textContent = stock + " left in stock";
        stockEl.classList.add("is-low");
      } else {
        stockEl.textContent = "In stock";
      }

      maxQty = stock > 0 ? stock : maxQty;

      renderSpecs(product.specs);
      renderList("productDetailBoxWrap", "productDetailBoxList", product.whatsInBox);
      renderList("productDetailUseCasesWrap", "productDetailUseCasesList", product.idealUseCases);

      // Add to cart only ever adds once; once the item is in the cart, +/- adjust the cart quantity directly.
      function syncAddToCartUI() {
        if (outOfStock) {
          qty = 0;
          addButton.textContent = "Out of stock";
          addButton.disabled = true;
          buyNowButton.disabled = true;
          qtyMinusButton.disabled = true;
          qtyPlusButton.disabled = true;
          setQtyDisplay();
          return;
        }

        var cartQty = getCartQuantity(product.id);

        qtyMinusButton.disabled = false;
        qtyPlusButton.disabled = false;

        if (cartQty > 0) {
          qty = cartQty;
          addButton.textContent = "Added to cart";
          addButton.disabled = true;
        } else {
          qty = 1;
          addButton.textContent = "Add to cart";
          addButton.disabled = false;
        }

        buyNowButton.disabled = false;

        setQtyDisplay();
      }

      qtyMinusButton.addEventListener("click", function () {
        if (getCartQuantity(product.id) > 0) {
          window.VibecraftCart.setQuantity(product.id, getCartQuantity(product.id) - 1);
          syncAddToCartUI();
        } else {
          qty = Math.max(1, qty - 1);
          setQtyDisplay();
        }
      });

      qtyPlusButton.addEventListener("click", function () {
        if (getCartQuantity(product.id) > 0) {
          window.VibecraftCart.setQuantity(product.id, Math.min(maxQty, getCartQuantity(product.id) + 1));
          syncAddToCartUI();
        } else {
          qty = Math.min(maxQty, qty + 1);
          setQtyDisplay();
        }
      });

      addButton.addEventListener("click", async function () {
        if (!window.VibecraftApi) return;

        addButton.disabled = true;
        var customer = await window.VibecraftApi.requireCustomer();
        if (!customer) {
          addButton.disabled = false;
          return;
        }

        window.VibecraftCart.addItem(product.id, qty);
        syncAddToCartUI();
        addStatus.textContent = "Added to cart.";
        setTimeout(function () {
          addStatus.textContent = "";
        }, 2500);
      });

      buyNowButton.addEventListener("click", async function () {
        if (!window.VibecraftApi || outOfStock) return;

        buyNowButton.disabled = true;
        var customer = await window.VibecraftApi.getCurrentCustomer();
        if (!customer) {
          window.location.href = "login.html?next=cart.html";
          return;
        }

        if (getCartQuantity(product.id) > 0) {
          window.VibecraftCart.setQuantity(product.id, qty);
        } else {
          window.VibecraftCart.addItem(product.id, qty);
        }
        window.location.href = "cart.html";
      });

      document.addEventListener("cart:change", syncAddToCartUI);

      syncAddToCartUI();

      status.hidden = true;
      detail.hidden = false;

      renderRelatedProducts(product);
    } catch (error) {
      status.textContent = error.message || "Could not load this product.";
    }
  }

  boot();
})();
