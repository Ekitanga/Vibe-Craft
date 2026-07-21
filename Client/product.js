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
        return specs[key];
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

  function getCartQuantity(productId) {
    var existing = window.VibecraftCart.getItems().find(function (item) {
      return item.productId === productId;
    });
    return existing ? existing.quantity : 0;
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

      var image = product.images && product.images[0];
      var imageEl = document.getElementById("productDetailImage");
      imageEl.src = image || "";
      imageEl.alt = product.name;

      document.getElementById("productDetailName").textContent = product.name;
      document.getElementById("productDetailPrice").textContent = formatPrice(product.price, product.currency);
      document.getElementById("productDetailSummary").textContent = product.shortSummary || "";
      document.getElementById("productDetailDescription").textContent = product.description || "";

      var stock = Number(product.stock || 0);
      var stockEl = document.getElementById("productDetailStock");
      var addButton = document.getElementById("addToCartButton");
      var qtyMinusButton = document.getElementById("qtyMinus");
      var qtyPlusButton = document.getElementById("qtyPlus");
      var addStatus = document.getElementById("addToCartStatus");
      var outOfStock = stock <= 0;

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

      addButton.addEventListener("click", function () {
        window.VibecraftCart.addItem(product.id, qty);
        syncAddToCartUI();
        addStatus.textContent = "Added to cart.";
        setTimeout(function () {
          addStatus.textContent = "";
        }, 2500);
      });

      document.addEventListener("cart:change", syncAddToCartUI);

      syncAddToCartUI();

      status.hidden = true;
      detail.hidden = false;
    } catch (error) {
      status.textContent = error.message || "Could not load this product.";
    }
  }

  boot();
})();
