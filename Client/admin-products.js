(function () {
  "use strict";

  var state = { categories: [], products: [], editingId: null };
  var priceFormatter = new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 });

  var form = document.getElementById("productForm");
  var formStatus = document.getElementById("productFormStatus");
  var formHeading = document.getElementById("formHeading");
  var resetFormButton = document.getElementById("resetFormButton");
  var categorySelect = document.getElementById("productCategory");
  var tableBody = document.getElementById("productsTableBody");
  var productCount = document.getElementById("productCount");
  var imagesTextarea = document.getElementById("productImages");
  var imageFilesInput = document.getElementById("productImageFiles");
  var imageUploadStatus = document.getElementById("productImageUploadStatus");
  var imagePreview = document.getElementById("productImagePreview");
  var desktopCardImageInput = document.getElementById("productDesktopCardImage");
  var mobileCardImageInput = document.getElementById("productMobileCardImage");
  var desktopCardImageFileInput = document.getElementById("productDesktopCardImageFile");
  var mobileCardImageFileInput = document.getElementById("productMobileCardImageFile");
  var desktopCardImageStatus = document.getElementById("productDesktopCardImageStatus");
  var mobileCardImageStatus = document.getElementById("productMobileCardImageStatus");
  var productVideosInput = document.getElementById("productVideos");
  var productVideoFileInput = document.getElementById("productVideoFile");
  var productVideoUploadStatus = document.getElementById("productVideoUploadStatus");

  function setFormStatus(message, isError) {
    formStatus.textContent = message || "";
    formStatus.classList.toggle("is-error", Boolean(isError));
  }

  function parseLines(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
  }

  function joinLines(list) {
    return (list || []).join("\n");
  }

  function renderImagePreview() {
    var urls = parseLines(imagesTextarea.value);

    imagePreview.innerHTML = urls
      .map(function (url, index) {
        return (
          '<div class="image-preview-thumb' + (index === 0 ? ' is-main' : '') + '">' +
          '<img src="' + window.VibecraftAdmin.escapeHtml(url) + '" alt="" loading="lazy" />' +
          (index === 0
            ? '<span class="image-preview-main-badge">Main image</span>'
            : '<button type="button" class="image-preview-main" data-main-index="' + index + '">Use as main</button>') +
          '<button type="button" class="image-preview-remove" data-remove-index="' + index + '" aria-label="Remove this image">✕</button>' +
          "</div>"
        );
      })
      .join("");
  }

  imagePreview.addEventListener("click", function (event) {
    var mainIndexAttr = event.target.getAttribute("data-main-index");
    if (mainIndexAttr !== null) {
      var mainIndex = Number(mainIndexAttr);
      var urls = parseLines(imagesTextarea.value);
      if (mainIndex > 0 && mainIndex < urls.length) {
        urls.unshift(urls.splice(mainIndex, 1)[0]);
        imagesTextarea.value = joinLines(urls);
        renderImagePreview();
      }
      return;
    }

    var indexAttr = event.target.getAttribute("data-remove-index");
    if (indexAttr === null) return;

    var urls = parseLines(imagesTextarea.value);
    urls.splice(Number(indexAttr), 1);
    imagesTextarea.value = joinLines(urls);
    renderImagePreview();
  });

  imagesTextarea.addEventListener("input", renderImagePreview);

  imageFilesInput.addEventListener("change", async function () {
    var files = Array.from(imageFilesInput.files || []);
    if (!files.length) return;

    var formData = new FormData();
    files.forEach(function (file) {
      formData.append("images", file);
    });

    imageUploadStatus.textContent = "Uploading...";
    imageUploadStatus.classList.remove("is-error");

    try {
      var payload = await window.VibecraftApi.upload("admin/uploads", formData);
      var urls = (payload && payload.data && payload.data.urls) || [];
      var existing = parseLines(imagesTextarea.value);

      imagesTextarea.value = joinLines(existing.concat(urls));
      renderImagePreview();
      imageUploadStatus.textContent = urls.length + (urls.length === 1 ? " image uploaded." : " images uploaded.");
    } catch (error) {
      imageUploadStatus.textContent = error.message || "Could not upload those images.";
      imageUploadStatus.classList.add("is-error");
    } finally {
      imageFilesInput.value = "";
    }
  });

  function wireCardImageUpload(fileInput, urlInput, statusEl, label) {
    fileInput.addEventListener("change", async function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;

      var formData = new FormData();
      formData.append("images", file);
      statusEl.textContent = "Uploading...";
      statusEl.classList.remove("is-error");

      try {
        var payload = await window.VibecraftApi.upload("admin/uploads", formData);
        var url = payload && payload.data && payload.data.urls && payload.data.urls[0];
        if (!url) throw new Error("No image URL was returned.");
        urlInput.value = url;
        statusEl.textContent = label + " uploaded.";
      } catch (error) {
        statusEl.textContent = error.message || "Could not upload this image.";
        statusEl.classList.add("is-error");
      } finally {
        fileInput.value = "";
      }
    });
  }

  wireCardImageUpload(desktopCardImageFileInput, desktopCardImageInput, desktopCardImageStatus, "Desktop image");
  wireCardImageUpload(mobileCardImageFileInput, mobileCardImageInput, mobileCardImageStatus, "Mobile image");

  productVideoFileInput.addEventListener("change", async function () {
    var file = productVideoFileInput.files && productVideoFileInput.files[0];
    if (!file) return;

    var formData = new FormData();
    formData.append("video", file);
    productVideoUploadStatus.textContent = "Uploading...";
    productVideoUploadStatus.classList.remove("is-error");

    try {
      var payload;
      try {
        payload = await window.VibecraftApi.upload("admin/uploads/product-video", formData);
      } catch (error) {
        if (error.status !== 404) throw error;
        // Older deployments already expose the testimonial video endpoint with
        // the same response shape, so keep uploads working during rollout.
        payload = await window.VibecraftApi.upload("admin/uploads/video", formData);
      }
      var url = payload && payload.data && payload.data.videoUrl;
      if (!url) throw new Error("No video URL was returned.");
      var existingVideos = parseLines(productVideosInput.value);
      productVideosInput.value = joinLines(existingVideos.concat(url));
      productVideoUploadStatus.textContent = "Video uploaded.";
    } catch (error) {
      productVideoUploadStatus.textContent = error.message || "Could not upload this video.";
      productVideoUploadStatus.classList.add("is-error");
    } finally {
      productVideoFileInput.value = "";
    }
  });

  function categoryName(categoryId) {
    var category = state.categories.find(function (item) {
      return item.id === categoryId;
    });
    return category ? category.name : "—";
  }

  function renderCategoryOptions() {
    if (!state.categories.length) {
      categorySelect.innerHTML = '<option value="">No categories available</option>';
      categorySelect.disabled = true;
      return;
    }

    categorySelect.disabled = false;
    categorySelect.innerHTML = '<option value="">Choose a category</option>' +
      state.categories
        .map(function (category) {
          return '<option value="' + window.VibecraftAdmin.escapeHtml(category.id) + '">' + window.VibecraftAdmin.escapeHtml(category.name) + "</option>";
        })
        .join("");
  }

  function renderCategoryError() {
    categorySelect.innerHTML = '<option value="">Could not load categories</option>';
    categorySelect.disabled = true;
  }

  async function loadCategories() {
    var response = await window.VibecraftApi.get("categories");
    state.categories = (response && response.data) || [];
    renderCategoryOptions();
  }

  async function loadProducts() {
    var response = await window.VibecraftApi.get("admin/products");
    state.products = (response && response.data) || [];
    renderProductsTable();
  }

  function renderProductsTable() {
    productCount.textContent = state.products.length + (state.products.length === 1 ? " product" : " products");

    if (!state.products.length) {
      tableBody.innerHTML = '<tr class="empty-row"><td colspan="6">No products yet.</td></tr>';
      return;
    }

    tableBody.innerHTML = state.products
      .map(function (product, index) {
        return [
          "<tr>",
          "<td>" + (index + 1) + "</td>",
          "<td>" + window.VibecraftAdmin.escapeHtml(product.name) + "</td>",
          "<td>" + window.VibecraftAdmin.escapeHtml(categoryName(product.categoryId)) + "</td>",
          "<td>" + priceFormatter.format(Number(product.price || 0)) + "</td>",
          "<td>" + window.VibecraftAdmin.stockBadge(product.stock) + "</td>",
          '<td><div class="admin-table-actions">' +
            '<button type="button" data-edit="' + window.VibecraftAdmin.escapeHtml(product.id) + '">Edit</button>' +
            '<button type="button" class="is-danger" data-delete="' + window.VibecraftAdmin.escapeHtml(product.id) + '">Delete</button>' +
            "</div></td>",
          "</tr>",
        ].join("");
      })
      .join("");
  }

  function resetForm() {
    form.reset();
    state.editingId = null;
    formHeading.textContent = "New product";
    resetFormButton.hidden = true;
    setFormStatus("");
    imageUploadStatus.textContent = "";
    imageUploadStatus.classList.remove("is-error");
    desktopCardImageInput.value = "";
    mobileCardImageInput.value = "";
    productVideosInput.value = "";
    desktopCardImageStatus.textContent = "";
    mobileCardImageStatus.textContent = "";
    desktopCardImageStatus.classList.remove("is-error");
    mobileCardImageStatus.classList.remove("is-error");
    productVideoUploadStatus.textContent = "";
    productVideoUploadStatus.classList.remove("is-error");
    renderImagePreview();
  }

  function fillFormForEdit(product) {
    state.editingId = product.id;
    formHeading.textContent = "Edit product";
    resetFormButton.hidden = false;

    document.getElementById("productName").value = product.name || "";
    categorySelect.value = product.categoryId || "";
    document.getElementById("productBrand").value = product.brand || "";
    document.getElementById("productPrice").value = product.price != null ? product.price : "";
    document.getElementById("productCompareAt").value = product.compareAtPrice != null ? product.compareAtPrice : "";
    document.getElementById("productStock").value = product.stock != null ? product.stock : "";
    document.getElementById("productResolution").value = product.resolution || "";
    document.getElementById("productBrightness").value = product.brightness || "";
    document.getElementById("productSummary").value = product.shortSummary || "";
    document.getElementById("productDescription").value = product.description || "";
    imagesTextarea.value = joinLines(product.images);
    desktopCardImageInput.value = (product.specs && product.specs.cardDesktopImage) || "";
    mobileCardImageInput.value = (product.specs && product.specs.cardMobileImage) || "";
    productVideosInput.value = joinLines(product.specs && product.specs.videos);
    document.getElementById("productBoxItems").value = joinLines(product.whatsInBox);
    document.getElementById("productUseCases").value = joinLines(product.idealUseCases);
    document.getElementById("productFeatured").checked = Boolean(product.featured);
    renderImagePreview();

    formHeading.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadCatalog() {
    try {
      await loadCategories();
    } catch (error) {
      renderCategoryError();
      throw error;
    }

    await loadProducts();
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    var submitButton = form.querySelector("button[type=submit]");
    var payload = {
      name: document.getElementById("productName").value.trim(),
      categoryId: categorySelect.value,
      brand: document.getElementById("productBrand").value.trim(),
      price: Number(document.getElementById("productPrice").value),
      compareAtPrice: document.getElementById("productCompareAt").value ? Number(document.getElementById("productCompareAt").value) : null,
      currency: "KES",
      stock: Number(document.getElementById("productStock").value),
      resolution: document.getElementById("productResolution").value.trim(),
      brightness: document.getElementById("productBrightness").value.trim(),
      shortSummary: document.getElementById("productSummary").value.trim(),
      description: document.getElementById("productDescription").value.trim(),
      images: parseLines(document.getElementById("productImages").value),
      whatsInBox: parseLines(document.getElementById("productBoxItems").value),
      idealUseCases: parseLines(document.getElementById("productUseCases").value),
      featured: document.getElementById("productFeatured").checked,
      specs: Object.assign({}, (state.products.find(function (item) { return item.id === state.editingId; }) || {}).specs || {}, {
        cardDesktopImage: desktopCardImageInput.value.trim() || null,
        cardMobileImage: mobileCardImageInput.value.trim() || null,
        videos: parseLines(productVideosInput.value),
      }),
    };

    setFormStatus("Saving...");
    submitButton.disabled = true;

    try {
      if (state.editingId) {
        await window.VibecraftApi.patch("admin/products/" + state.editingId, payload);
      } else {
        await window.VibecraftApi.post("admin/products", payload);
      }

      resetForm();
      await loadCatalog();
      setFormStatus("Saved.");
    } catch (error) {
      setFormStatus(error.message || "Could not save this product.", true);
    } finally {
      submitButton.disabled = false;
    }
  });

  resetFormButton.addEventListener("click", resetForm);

  tableBody.addEventListener("click", async function (event) {
    var editId = event.target.getAttribute("data-edit");
    var deleteId = event.target.getAttribute("data-delete");

    if (editId) {
      var product = state.products.find(function (item) {
        return item.id === editId;
      });
      if (product) fillFormForEdit(product);
      return;
    }

    if (deleteId) {
      var target = state.products.find(function (item) {
        return item.id === deleteId;
      });
      var confirmed = window.confirm('Delete "' + (target ? target.name : "this product") + '"? This cannot be undone.');
      if (!confirmed) return;

      try {
        await window.VibecraftApi.del("admin/products/" + deleteId);
        if (state.editingId === deleteId) resetForm();
        await loadCatalog();
      } catch (error) {
        window.alert(error.message || "Could not delete this product.");
      }
    }
  });

  async function boot() {
    var admin = await window.VibecraftAdmin.requireSession();
    if (!admin) return;

    window.VibecraftAdmin.wireSignOut();
    window.VibecraftAdmin.renderAccountMenu(admin);

    try {
      await loadCatalog();
    } catch (error) {
      tableBody.innerHTML = '<tr class="empty-row"><td colspan="6">Could not load products.</td></tr>';
    }
  }

  boot();
})();
