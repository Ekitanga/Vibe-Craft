(function () {
  "use strict";

  var STORAGE_KEY = "vibecraft_wishlist";

  function readItems() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(function (item) { return item && item.id; }) : [];
    } catch (_error) {
      return [];
    }
  }

  function writeItems(items) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    document.dispatchEvent(new CustomEvent("wishlist:change"));
  }

  function has(productId) {
    return readItems().some(function (item) { return item.id === productId; });
  }

  function toggle(product) {
    if (!product || !product.id) return false;

    var items = readItems();
    var existingIndex = items.findIndex(function (item) { return item.id === product.id; });

    if (existingIndex !== -1) {
      items.splice(existingIndex, 1);
      writeItems(items);
      return false;
    }

    items.push(product);
    writeItems(items);
    return true;
  }

  function remove(productId) {
    writeItems(readItems().filter(function (item) { return item.id !== productId; }));
  }

  window.VibecraftWishlist = {
    getItems: readItems,
    has: has,
    toggle: toggle,
    remove: remove,
    clear: function () { writeItems([]); },
  };
})();
