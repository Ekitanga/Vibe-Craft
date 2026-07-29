(function () {
  "use strict";

  var state = { testimonials: [], editingId: null, pendingVideoUrl: null, pendingPosterUrl: null };

  var form = document.getElementById("testimonialForm");
  var formStatus = document.getElementById("testimonialFormStatus");
  var formHeading = document.getElementById("formHeading");
  var resetFormButton = document.getElementById("resetFormButton");
  var tableBody = document.getElementById("testimonialsTableBody");
  var testimonialCount = document.getElementById("testimonialCount");
  var videoFileInput = document.getElementById("testimonialVideoFile");
  var videoUploadStatus = document.getElementById("testimonialVideoUploadStatus");
  var videoPreview = document.getElementById("testimonialVideoPreview");
  var writtenReviewField = document.getElementById("testimonialWrittenReviewField");
  var videoField = document.getElementById("testimonialVideoField");
  var reviewTypeInputs = document.querySelectorAll('input[name="testimonialReviewType"]');

  function setFormStatus(message, isError) {
    formStatus.textContent = message || "";
    formStatus.classList.toggle("is-error", Boolean(isError));
  }

  function renderVideoPreview() {
    if (!state.pendingVideoUrl) {
      videoPreview.innerHTML = "";
      return;
    }

    videoPreview.innerHTML =
      '<div class="image-preview-thumb testimonial-video-preview">' +
      (state.pendingPosterUrl
        ? '<img src="' + window.VibecraftAdmin.escapeHtml(state.pendingPosterUrl) + '" alt="" loading="lazy" />'
        : '<span>Video</span>') +
      '<button type="button" class="image-preview-remove" id="testimonialVideoRemove" aria-label="Remove this video">✕</button>' +
      "</div>";
  }

  function getReviewType() {
    var selected = document.querySelector('input[name="testimonialReviewType"]:checked');
    return selected ? selected.value : "video";
  }

  function syncReviewType() {
    var isWritten = getReviewType() === "written";
    writtenReviewField.hidden = !isWritten;
    videoField.hidden = isWritten;
    document.getElementById("testimonialQuote").required = isWritten;
  }

  reviewTypeInputs.forEach(function (input) {
    input.addEventListener("change", syncReviewType);
  });

  videoPreview.addEventListener("click", function (event) {
    if (event.target.id !== "testimonialVideoRemove") return;
    state.pendingVideoUrl = null;
    state.pendingPosterUrl = null;
    renderVideoPreview();
  });

  videoFileInput.addEventListener("change", async function () {
    var file = (videoFileInput.files || [])[0];
    if (!file) return;

    var formData = new FormData();
    formData.append("video", file);

    videoUploadStatus.textContent = "Uploading...";
    videoUploadStatus.classList.remove("is-error");

    try {
      var payload = await window.VibecraftApi.upload("admin/uploads/video", formData);
      state.pendingVideoUrl = payload.data.videoUrl;
      state.pendingPosterUrl = payload.data.posterUrl;
      renderVideoPreview();
      videoUploadStatus.textContent = "Video uploaded.";
    } catch (error) {
      videoUploadStatus.textContent = error.message || "Could not upload that video.";
      videoUploadStatus.classList.add("is-error");
    } finally {
      videoFileInput.value = "";
    }
  });

  function statusBadge(testimonial) {
    return testimonial.isPublished
      ? '<span class="stock-pill stock-ok">Published</span>'
      : '<span class="stock-pill stock-out">Hidden</span>';
  }

  function renderTable() {
    testimonialCount.textContent = state.testimonials.length + (state.testimonials.length === 1 ? " testimonial" : " testimonials");

    if (!state.testimonials.length) {
      tableBody.innerHTML = '<tr class="empty-row"><td colspan="7">No testimonials yet.</td></tr>';
      return;
    }

    tableBody.innerHTML = state.testimonials
      .map(function (testimonial) {
        var thumb = testimonial.posterUrl
          ? '<img class="admin-table-thumb" src="' + window.VibecraftAdmin.escapeHtml(testimonial.posterUrl) + '" alt="" loading="lazy" />'
          : testimonial.reviewType === "written"
          ? '<div class="testimonial-table-quote">' + window.VibecraftAdmin.escapeHtml(testimonial.quote || "Written review") + "</div>"
          : "";

        return [
          "<tr>",
          "<td>" + thumb + "</td>",
          "<td>" + window.VibecraftAdmin.escapeHtml(testimonial.clientName) + "</td>",
          "<td>" + window.VibecraftAdmin.escapeHtml(testimonial.reviewType === "written" ? "Written" : "Video") + "</td>",
          "<td>" + window.VibecraftAdmin.escapeHtml(testimonial.clientLocation || "—") + "</td>",
          "<td>" + statusBadge(testimonial) + "</td>",
          "<td>" + testimonial.sortOrder + "</td>",
          '<td><div class="admin-table-actions">' +
            '<button type="button" data-edit="' + window.VibecraftAdmin.escapeHtml(testimonial.id) + '">Edit</button>' +
            '<button type="button" class="is-danger" data-delete="' + window.VibecraftAdmin.escapeHtml(testimonial.id) + '">Delete</button>' +
            "</div></td>",
          "</tr>",
        ].join("");
      })
      .join("");
  }

  async function loadTestimonials() {
    var response = await window.VibecraftApi.get("admin/testimonials");
    state.testimonials = (response && response.data) || [];
    renderTable();
  }

  function resetForm() {
    form.reset();
    state.editingId = null;
    state.pendingVideoUrl = null;
    state.pendingPosterUrl = null;
    formHeading.textContent = "New testimonial";
    resetFormButton.hidden = true;
    document.getElementById("testimonialSortOrder").value = 0;
    document.getElementById("testimonialPublished").checked = true;
    document.querySelector('input[name="testimonialReviewType"][value="video"]').checked = true;
    syncReviewType();
    setFormStatus("");
    videoUploadStatus.textContent = "";
    videoUploadStatus.classList.remove("is-error");
    renderVideoPreview();
  }

  function fillFormForEdit(testimonial) {
    state.editingId = testimonial.id;
    state.pendingVideoUrl = testimonial.videoUrl || null;
    state.pendingPosterUrl = testimonial.posterUrl;
    formHeading.textContent = "Edit testimonial";
    resetFormButton.hidden = false;

    document.getElementById("testimonialClientName").value = testimonial.clientName || "";
    document.getElementById("testimonialClientLocation").value = testimonial.clientLocation || "";
    document.getElementById("testimonialSortOrder").value = testimonial.sortOrder != null ? testimonial.sortOrder : 0;
    document.getElementById("testimonialQuote").value = testimonial.quote || "";
    document.getElementById("testimonialPublished").checked = Boolean(testimonial.isPublished);
    document.querySelector('input[name="testimonialReviewType"][value="' + (testimonial.reviewType || (testimonial.videoUrl ? "video" : "written")) + '"]').checked = true;
    syncReviewType();
    renderVideoPreview();

    formHeading.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    var reviewType = getReviewType();
    var quote = document.getElementById("testimonialQuote").value.trim();

    if (reviewType === "video" && !state.pendingVideoUrl) {
      setFormStatus("Upload a video first.", true);
      return;
    }

    if (reviewType === "written" && !quote) {
      setFormStatus("Enter the written review first.", true);
      return;
    }

    var submitButton = form.querySelector("button[type=submit]");
    var payload = {
      clientName: document.getElementById("testimonialClientName").value.trim(),
      clientLocation: document.getElementById("testimonialClientLocation").value.trim(),
      quote: quote,
      reviewType: reviewType,
      videoUrl: reviewType === "video" ? state.pendingVideoUrl : null,
      posterUrl: reviewType === "video" ? state.pendingPosterUrl : null,
      isPublished: document.getElementById("testimonialPublished").checked,
      sortOrder: Number(document.getElementById("testimonialSortOrder").value || 0),
    };

    setFormStatus("Saving...");
    submitButton.disabled = true;

    try {
      if (state.editingId) {
        await window.VibecraftApi.patch("admin/testimonials/" + state.editingId, payload);
      } else {
        await window.VibecraftApi.post("admin/testimonials", payload);
      }

      resetForm();
      await loadTestimonials();
      setFormStatus("Saved.");
    } catch (error) {
      setFormStatus(error.message || "Could not save this testimonial.", true);
    } finally {
      submitButton.disabled = false;
    }
  });

  resetFormButton.addEventListener("click", resetForm);

  tableBody.addEventListener("click", async function (event) {
    var editId = event.target.getAttribute("data-edit");
    var deleteId = event.target.getAttribute("data-delete");

    if (editId) {
      var testimonial = state.testimonials.find(function (item) {
        return item.id === editId;
      });
      if (testimonial) fillFormForEdit(testimonial);
      return;
    }

    if (deleteId) {
      var target = state.testimonials.find(function (item) {
        return item.id === deleteId;
      });
      var confirmed = window.confirm('Delete the testimonial from "' + (target ? target.clientName : "this client") + '"? This cannot be undone.');
      if (!confirmed) return;

      try {
        await window.VibecraftApi.del("admin/testimonials/" + deleteId);
        if (state.editingId === deleteId) resetForm();
        await loadTestimonials();
      } catch (error) {
        window.alert(error.message || "Could not delete this testimonial.");
      }
    }
  });

  async function boot() {
    var admin = await window.VibecraftAdmin.requireSession();
    if (!admin) return;

    window.VibecraftAdmin.wireSignOut();
    window.VibecraftAdmin.renderAccountMenu(admin);

    try {
      await loadTestimonials();
    } catch (error) {
      tableBody.innerHTML = '<tr class="empty-row"><td colspan="7">Could not load testimonials.</td></tr>';
    }
  }

  boot();
})();
