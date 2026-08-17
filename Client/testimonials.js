(function () {
  "use strict";

  var STACK_DEPTH = 3; // active card + this many peeking behind it

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function writtenFrameMarkup(testimonial) {
    return [
      '<div class="testimonial-written-frame">',
      testimonial.quote ? '<p class="testimonial-written-quote">' + escapeHtml(testimonial.quote) + "</p>" : "",
      "</div>",
    ].join("");
  }

  function writtenCardMarkup(testimonial, index) {
    return [
      '<div class="testimonial-slide" data-index="' + index + '">',
      writtenFrameMarkup(testimonial),
      "</div>",
    ].join("");
  }

  function cardMarkup(testimonial, index) {
    if (testimonial.reviewType === "written" || !testimonial.videoUrl) {
      return writtenCardMarkup(testimonial, index);
    }

    return [
      '<div class="testimonial-slide" data-index="' + index + '">',
      '<div class="testimonial-video-frame">',
      '<video class="testimonial-video" controls playsinline preload="metadata"' +
        (testimonial.posterUrl ? ' poster="' + escapeHtml(testimonial.posterUrl) + '"' : "") +
        ">",
      '<source src="' + escapeHtml(testimonial.videoUrl) + '" />',
      "</video>",
      "</div>",
      '<p class="testimonial-video-location"><span class="location-pin" aria-hidden="true">📍</span> Find us at Rasumal House, 4th floor, Shop 14, opposite Imenti House, Nairobi. <a href="https://www.google.com/maps/dir/?api=1&amp;destination=-1.2826763864005812%2C36.82444935619709" target="_blank" rel="noopener noreferrer">Map ↗</a></p>',
      "</div>",
    ].join("");
  }

  function replaceWithWrittenReview(slide, testimonial) {
    testimonial.reviewType = "written";
    testimonial.videoUrl = null;
    testimonial.posterUrl = null;
    slide.innerHTML = writtenFrameMarkup(testimonial);
  }

  function metaMarkup(testimonial) {
    if (!testimonial.quote && !testimonial.clientName) return "";

    return (
      (testimonial.reviewType !== "written" && testimonial.quote ? '<p class="testimonial-quote">' + escapeHtml(testimonial.quote) + "</p>" : "") +
      '<p class="testimonial-client">' +
      escapeHtml(testimonial.clientName) +
      (testimonial.clientLocation ? ", " + escapeHtml(testimonial.clientLocation) : "") +
      "</p>"
    );
  }

  function initCarousel(root, testimonials) {
    var stackEl = root.querySelector(".testimonial-stack");
    var metaEl = root.querySelector(".testimonial-meta");
    var dotsEl = root.querySelector(".testimonial-dots");
    var prevBtn = root.querySelector(".testimonial-prev");
    var nextBtn = root.querySelector(".testimonial-next");
    var index = 0;

    stackEl.innerHTML = testimonials.map(cardMarkup).join("");
    metaEl.innerHTML = metaMarkup(testimonials[0]);

    stackEl.querySelectorAll("video").forEach(function (video) {
      video.addEventListener("error", function () {
        var slide = video.closest(".testimonial-slide");
        var failedIndex = slide ? Number(slide.getAttribute("data-index")) : -1;
        var failedTestimonial = testimonials[failedIndex];

        if (!slide || !failedTestimonial) return;

        if (failedTestimonial.quote) {
          replaceWithWrittenReview(slide, failedTestimonial);
          if (failedIndex === index) metaEl.innerHTML = metaMarkup(failedTestimonial);
        } else {
          slide.hidden = true;
          if (failedIndex === index) root.hidden = true;
        }
      });
    });

    dotsEl.innerHTML = testimonials
      .map(function (_testimonial, i) {
        return (
          '<button type="button" class="testimonial-dot' +
          (i === 0 ? " is-active" : "") +
          '" data-index="' +
          i +
          '" aria-label="Show testimonial ' +
          (i + 1) +
          '"></button>'
        );
      })
      .join("");

    var hasMultiple = testimonials.length > 1;
    prevBtn.hidden = !hasMultiple;
    nextBtn.hidden = !hasMultiple;
    dotsEl.hidden = !hasMultiple;

    // Slides behind the active one peek out from the corner (offset + scaled down) so
    // there's more here without touching the buttons — how far back the stack goes is
    // capped by STACK_DEPTH so a long reel doesn't pile up into a messy heap.
    function setActive(nextIndex) {
      stackEl.querySelectorAll("video").forEach(function (video) {
        video.pause();
      });

      index = ((nextIndex % testimonials.length) + testimonials.length) % testimonials.length;

      stackEl.querySelectorAll(".testimonial-slide").forEach(function (el, i) {
        var distance = (i - index + testimonials.length) % testimonials.length;

        el.classList.remove("is-active", "is-stack-1", "is-stack-2");
        if (distance === 0) el.classList.add("is-active");
        else if (distance === 1 && STACK_DEPTH > 1) el.classList.add("is-stack-1");
        else if (distance === 2 && STACK_DEPTH > 2) el.classList.add("is-stack-2");
      });

      dotsEl.querySelectorAll(".testimonial-dot").forEach(function (el, i) {
        el.classList.toggle("is-active", i === index);
      });

      metaEl.innerHTML = metaMarkup(testimonials[index]);
    }

    setActive(0);

    prevBtn.addEventListener("click", function () {
      setActive(index - 1);
    });
    nextBtn.addEventListener("click", function () {
      setActive(index + 1);
    });
    dotsEl.addEventListener("click", function (event) {
      var dot = event.target.closest(".testimonial-dot");
      if (!dot) return;
      setActive(Number(dot.getAttribute("data-index")));
    });
  }

  // Mounts a testimonial video carousel into `root` (an element containing
  // .testimonial-stack / .testimonial-meta / .testimonial-dots / .testimonial-prev / .testimonial-next).
  // Fetches the published reel and stays hidden if there's nothing to show or the
  // request fails — this is a marketing nice-to-have, never a page-blocking dependency.
  async function mount(root) {
    if (!root || !window.VibecraftApi) return;

    try {
      var payload = await window.VibecraftApi.get("testimonials");
      var testimonials = (payload && payload.data) || [];

      if (!testimonials.length) return;

      initCarousel(root, testimonials);
      root.hidden = false;
    } catch (_error) {
      // Leave hidden on failure.
    }
  }

  window.VibecraftTestimonials = { mount: mount };
})();
