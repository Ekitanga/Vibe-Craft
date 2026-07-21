(function () {
  "use strict";

  var STORAGE_KEY = "vibecraft_cart";

  function readCart() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  function writeCart(items) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    updateBadge();
    document.dispatchEvent(new CustomEvent("cart:change"));
  }

  function totalCount() {
    return readCart().reduce(function (sum, item) {
      return sum + item.quantity;
    }, 0);
  }

  function addItem(productId, quantity) {
    var items = readCart();
    var existing = items.find(function (item) {
      return item.productId === productId;
    });

    if (existing) {
      existing.quantity += quantity;
    } else {
      items.push({ productId: productId, quantity: quantity });
    }

    writeCart(items);
  }

  function setQuantity(productId, quantity) {
    var items = readCart();

    if (quantity <= 0) {
      items = items.filter(function (item) {
        return item.productId !== productId;
      });
    } else {
      var existing = items.find(function (item) {
        return item.productId === productId;
      });
      if (existing) existing.quantity = quantity;
    }

    writeCart(items);
  }

  function removeItem(productId) {
    writeCart(
      readCart().filter(function (item) {
        return item.productId !== productId;
      })
    );
  }

  function clearCart() {
    writeCart([]);
  }

  function updateBadge() {
    var count = totalCount();
    document.querySelectorAll(".cart-count").forEach(function (badge) {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    });
  }

  window.VibecraftCart = {
    getItems: readCart,
    addItem: addItem,
    setQuantity: setQuantity,
    removeItem: removeItem,
    clear: clearCart,
    count: totalCount,
  };

  updateBadge();
})();
