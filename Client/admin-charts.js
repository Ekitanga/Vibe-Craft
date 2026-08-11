window.VibecraftCharts = (function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var tooltip = null;

  function el(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        node.setAttribute(key, attrs[key]);
      });
    }
    return node;
  }

  function roundedBarPath(x0, y, length, thickness, radius) {
    if (length <= 0) return "";
    var r = Math.max(0, Math.min(radius, length / 2, thickness / 2));
    var x1 = x0 + length;
    var y1 = y + thickness;

    return [
      "M", x0, y,
      "L", x1 - r, y,
      "A", r, r, 0, 0, 1, x1, y + r,
      "L", x1, y1 - r,
      "A", r, r, 0, 0, 1, x1 - r, y1,
      "L", x0, y1,
      "Z",
    ].join(" ");
  }

  function niceMax(value) {
    if (!value || value <= 0) return 10;
    var magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    var normalized = value / magnitude;
    var step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return step * magnitude;
  }

  function ensureTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    document.body.appendChild(tooltip);
    return tooltip;
  }

  // Value leads (Strong), category/label follows — matches how the reader scans a tooltip.
  function showTooltip(x, y, valueText, labelText) {
    var tip = ensureTooltip();
    tip.textContent = "";

    var strong = document.createElement("strong");
    strong.textContent = valueText;
    tip.appendChild(strong);

    if (labelText) {
      var span = document.createElement("span");
      span.textContent = labelText;
      tip.appendChild(span);
    }

    tip.style.left = x + "px";
    tip.style.top = y - 10 + "px";
    tip.classList.add("is-visible");
  }

  function hideTooltip() {
    if (tooltip) tooltip.classList.remove("is-visible");
  }

  function renderEmpty(container, message) {
    container.textContent = "";
    var p = document.createElement("p");
    p.className = "chart-empty";
    p.textContent = message;
    container.appendChild(p);
  }

  function renderBarChart(container, rows, opts) {
    opts = opts || {};
    container.textContent = "";

    if (!rows.length) {
      renderEmpty(container, opts.emptyMessage || "No data yet.");
      return;
    }

    var barThickness = 20;
    var rowGap = 18;
    var rowHeight = barThickness + rowGap;
    var labelWidth = opts.labelWidth || 132;
    var valueWidth = opts.valueWidth || 84;
    // Keep the SVG's coordinate system close to its rendered width on phones.
    // Scaling a 560px canvas down to a ~290px card makes labels unreadably tiny.
    var width = Math.max(360, container.clientWidth || 560);
    var chartWidth = width - labelWidth - valueWidth;
    var height = rows.length * rowHeight + rowGap / 2;
    var maxValue = niceMax(Math.max.apply(null, rows.map(function (row) { return row.value; })));

    var svg = el("svg", {
      viewBox: "0 0 " + width + " " + height,
      class: "chart-svg",
      role: "img",
      "aria-label": opts.ariaLabel || "Bar chart",
    });

    rows.forEach(function (row, index) {
      var y = rowGap / 2 + index * rowHeight;
      var displayValue = row.displayValue != null ? row.displayValue : String(row.value);
      var barLength = maxValue > 0 ? (row.value / maxValue) * chartWidth : 0;
      var color = typeof opts.color === "function" ? opts.color(row) : opts.color || "var(--orange)";

      var label = el("text", { x: 0, y: y + barThickness / 2, class: "chart-axis-text chart-bar-label", "dominant-baseline": "middle" });
      label.textContent = row.label;
      svg.appendChild(label);

      if (barLength > 0) {
        var bar = el("path", { d: roundedBarPath(labelWidth, y, barLength, barThickness, 4), fill: color, class: "chart-bar-fill" });
        svg.appendChild(bar);
      }

      var valueLabel = el("text", { x: labelWidth + chartWidth + 10, y: y + barThickness / 2, class: "chart-axis-text chart-bar-value", "dominant-baseline": "middle" });
      valueLabel.textContent = displayValue;
      svg.appendChild(valueLabel);

      var hit = el("rect", { x: 0, y: y - rowGap / 2, width: width, height: rowHeight, fill: "transparent", tabindex: "0" });
      hit.setAttribute("role", "img");
      hit.setAttribute("aria-label", row.label + ": " + displayValue);

      var handleShow = function (event) {
        showTooltip(event.clientX, event.clientY, displayValue, row.label);
      };
      hit.addEventListener("pointerenter", handleShow);
      hit.addEventListener("pointermove", handleShow);
      hit.addEventListener("pointerleave", hideTooltip);
      hit.addEventListener("focus", function () {
        var rect = hit.getBoundingClientRect();
        showTooltip(rect.left + rect.width / 2, rect.top, displayValue, row.label);
      });
      hit.addEventListener("blur", hideTooltip);
      svg.appendChild(hit);
    });

    container.appendChild(svg);
  }

  function renderLineChart(container, points, opts) {
    opts = opts || {};
    container.textContent = "";

    if (!points.length) {
      renderEmpty(container, opts.emptyMessage || "No data yet.");
      return;
    }

    // Use a compact mobile canvas so SVG labels stay legible at narrow widths.
    var width = Math.max(360, container.clientWidth || 640);
    var height = 220;
    var padding = { top: 20, right: 16, bottom: 28, left: 46 };
    var chartWidth = width - padding.left - padding.right;
    var chartHeight = height - padding.top - padding.bottom;
    var maxValue = niceMax(Math.max.apply(null, points.map(function (point) { return point.value; })));
    var formatValue = opts.formatValue || function (value) { return String(Math.round(value)); };

    function xFor(index) {
      return padding.left + (points.length > 1 ? (index / (points.length - 1)) * chartWidth : chartWidth / 2);
    }
    function yFor(value) {
      return padding.top + chartHeight - (maxValue > 0 ? (value / maxValue) * chartHeight : 0);
    }

    var svg = el("svg", { viewBox: "0 0 " + width + " " + height, class: "chart-svg", role: "img", "aria-label": opts.ariaLabel || "Line chart" });

    [0, 0.5, 1].forEach(function (fraction) {
      var value = maxValue * fraction;
      var y = yFor(value);
      svg.appendChild(el("line", { x1: padding.left, x2: width - padding.right, y1: y, y2: y, class: "chart-gridline" }));
      var tick = el("text", { x: padding.left - 8, y: y, class: "chart-axis-text", "text-anchor": "end", "dominant-baseline": "middle" });
      tick.textContent = formatValue(value, true);
      svg.appendChild(tick);
    });

    [0, Math.floor((points.length - 1) / 2), points.length - 1].forEach(function (index) {
      var tick = el("text", { x: xFor(index), y: height - 6, class: "chart-axis-text", "text-anchor": "middle" });
      tick.textContent = points[index].label;
      svg.appendChild(tick);
    });

    var areaPath = "M " + xFor(0) + " " + yFor(0);
    points.forEach(function (point, index) { areaPath += " L " + xFor(index) + " " + yFor(point.value); });
    areaPath += " L " + xFor(points.length - 1) + " " + yFor(0) + " Z";
    svg.appendChild(el("path", { d: areaPath, fill: opts.color || "var(--orange)", opacity: "0.1", stroke: "none" }));

    var linePath = points.map(function (point, index) { return (index === 0 ? "M " : "L ") + xFor(index) + " " + yFor(point.value); }).join(" ");
    svg.appendChild(el("path", { d: linePath, fill: "none", stroke: opts.color || "var(--orange)", "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" }));

    var lastIndex = points.length - 1;
    var lastPoint = points[lastIndex];
    svg.appendChild(el("circle", { cx: xFor(lastIndex), cy: yFor(lastPoint.value), r: 5, fill: opts.color || "var(--orange)", stroke: "var(--paper)", "stroke-width": "2" }));
    var endLabel = el("text", { x: xFor(lastIndex), y: yFor(lastPoint.value) - 12, class: "chart-end-label", "text-anchor": "end" });
    endLabel.textContent = formatValue(lastPoint.value, false);
    svg.appendChild(endLabel);

    var crosshair = el("line", { x1: 0, x2: 0, y1: padding.top, y2: height - padding.bottom, class: "chart-crosshair", opacity: "0" });
    svg.appendChild(crosshair);
    var marker = el("circle", { r: 5, fill: opts.color || "var(--orange)", stroke: "var(--paper)", "stroke-width": "2", opacity: "0" });
    svg.appendChild(marker);

    var overlay = el("rect", { x: padding.left, y: padding.top, width: chartWidth, height: chartHeight, fill: "transparent", tabindex: "0" });

    function updateFromIndex(index, clientX, clientY) {
      var point = points[index];
      var x = xFor(index);
      var y = yFor(point.value);
      crosshair.setAttribute("x1", x);
      crosshair.setAttribute("x2", x);
      crosshair.setAttribute("opacity", "1");
      marker.setAttribute("cx", x);
      marker.setAttribute("cy", y);
      marker.setAttribute("opacity", "1");
      showTooltip(clientX, clientY, formatValue(point.value, false), point.label);
    }

    overlay.addEventListener("pointermove", function (event) {
      var rect = svg.getBoundingClientRect();
      var scale = rect.width / width;
      var localX = (event.clientX - rect.left) / scale;
      var ratio = (localX - padding.left) / chartWidth;
      var index = Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
      updateFromIndex(index, event.clientX, event.clientY);
    });
    overlay.addEventListener("pointerleave", function () {
      crosshair.setAttribute("opacity", "0");
      marker.setAttribute("opacity", "0");
      hideTooltip();
    });
    overlay.addEventListener("focus", function () {
      var rect = overlay.getBoundingClientRect();
      updateFromIndex(lastIndex, rect.left + rect.width, rect.top);
    });
    overlay.addEventListener("blur", function () {
      crosshair.setAttribute("opacity", "0");
      marker.setAttribute("opacity", "0");
      hideTooltip();
    });

    svg.appendChild(overlay);
    container.appendChild(svg);
  }

  function renderRankedList(container, rows, opts) {
    opts = opts || {};
    container.textContent = "";

    if (!rows.length) {
      renderEmpty(container, opts.emptyMessage || "No data yet.");
      return;
    }

    var maxValue = Math.max.apply(null, rows.map(function (row) { return row.value; })) || 1;
    var list = document.createElement("ol");
    list.className = "ranked-list";
    list.setAttribute("aria-label", opts.ariaLabel || "Ranked list");

    rows.forEach(function (row, index) {
      var item = document.createElement("li");
      item.className = "ranked-item";

      var head = document.createElement("div");
      head.className = "ranked-item-head";

      var rank = document.createElement("span");
      rank.className = "ranked-item-rank";
      rank.textContent = String(index + 1).padStart(2, "0");

      var label = document.createElement("strong");
      label.className = "ranked-item-label";
      label.textContent = row.label;

      var value = document.createElement("span");
      value.className = "ranked-item-value";
      value.textContent = row.displayValue != null ? row.displayValue : String(row.value);

      head.appendChild(rank);
      head.appendChild(label);
      head.appendChild(value);

      var track = document.createElement("div");
      track.className = "ranked-item-track";
      track.setAttribute("role", "img");
      track.setAttribute("aria-label", row.label + ": " + value.textContent);

      var fill = document.createElement("span");
      fill.className = "ranked-item-fill";
      fill.style.width = Math.max(0, (Number(row.value) / maxValue) * 100) + "%";
      if (row.color) fill.style.background = row.color;
      track.appendChild(fill);

      item.appendChild(head);
      item.appendChild(track);
      list.appendChild(item);
    });

    container.appendChild(list);
  }

  return {
    renderBarChart: renderBarChart,
    renderLineChart: renderLineChart,
    renderRankedList: renderRankedList,
  };
})();
