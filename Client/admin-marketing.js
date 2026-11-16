(function () {
  "use strict";

  var rangeForm = document.getElementById("rangeForm");
  var since = document.getElementById("rangeSince");
  var until = document.getElementById("rangeUntil");
  var rangeStatus = document.getElementById("rangeStatus");
  var dateFormatter = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" });
  var LINK_LABELS = {
    catalogFeedXml: ["Catalog feed (XML)", "Commerce Manager → Catalog → Data sources → Data feed → Scheduled feed."],
    catalogFeedCsv: ["Catalog feed (CSV)", "Alternative format of the same feed."],
    leadAdsWebhook: ["Lead Ads webhook callback URL", "Meta app → Webhooks → Page → subscribe to “leadgen”."],
    webhookVerifyToken: ["Webhook verify token", "Paste together with the callback URL."],
    mpesaCallback: ["M-Pesa callback URL", "Used automatically for STK Push. Keep it private."],
    privacyPolicy: ["Privacy policy URL", "Required by Meta for ads and lead forms."],
    termsOfService: ["Terms URL", ""],
    sitemap: ["Sitemap", "Submit in Google Search Console."],
    utmExample: ["Tagged ad link example", "Use utm_campaign so orders show up per campaign above."],
  };

  function escape(value) {
    return window.VibecraftAdmin.escapeHtml(value);
  }

  function kes(amount) {
    return "KES " + Math.round(Number(amount || 0)).toLocaleString("en-KE");
  }

  function iso(date) {
    return date.toISOString().slice(0, 10);
  }

  function rows(list, columns, empty) {
    if (!list || !list.length) return '<tr class="empty-row"><td colspan="' + columns + '">' + escape(empty) + "</td></tr>";
    return list.join("");
  }

  function stat(label, value, exact) {
    return '<div class="admin-stat"' + (exact ? ' title="' + escape(exact) + '"' : "") + "><span>" + escape(label) + "</span><strong>" + escape(value) + "</strong></div>";
  }

  // Short form for the stat cards (KES 342.5K) so large amounts are not cut off.
  function kesCompact(amount) {
    var value = Number(amount || 0);
    if (Math.abs(value) < 100000) return kes(value);
    return "KES " + new Intl.NumberFormat("en-KE", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }

  function renderReport(report) {
    var meta = report.meta || {};
    var insights = meta.insights || {};
    document.getElementById("marketingStats").innerHTML = [
      stat("Orders", report.totals.orders),
      stat("Revenue", kesCompact(report.totals.revenue), kes(report.totals.revenue)),
      stat("From Meta ads", kesCompact(meta.revenue), kes(meta.revenue)),
      stat("Meta ad spend", insights.configured && !insights.error ? kesCompact(meta.spend) : "—", insights.configured ? kes(meta.spend) : ""),
      stat("Return on ad spend", meta.roas === null || meta.roas === undefined ? "—" : meta.roas + "×"),
      stat("Ad clicks", insights.configured && !insights.error ? Number(insights.clicks || 0).toLocaleString("en-KE") : "—"),
    ].join("");

    var entryRow = function (entry) {
      return "<tr><td>" + escape(entry.key) + "</td><td>" + entry.orders + "</td><td>" + kes(entry.revenue) + "</td><td>" + kes(entry.paidRevenue) + "</td></tr>";
    };
    document.getElementById("channelRows").innerHTML = rows(report.channels.map(entryRow), 4, "No orders in this period.");
    document.getElementById("campaignRows").innerHTML = rows(
      report.campaigns.map(entryRow).concat(report.promotions.map(function (entry) {
        return "<tr><td>Promo code " + escape(entry.key) + "</td><td>" + entry.orders + "</td><td>" + kes(entry.revenue) + "</td><td>" + kes(entry.paidRevenue) + "</td></tr>";
      })),
      4,
      "No tagged campaigns or promo codes used in this period."
    );

    var notice = document.getElementById("insightsNotice");
    if (!insights.configured) {
      notice.textContent = "Connect your ad account in Integrations → Meta → Reporting to see spend and ROAS.";
      notice.hidden = false;
    } else if (insights.error) {
      notice.textContent = "Meta returned an error: " + insights.error;
      notice.classList.add("is-warning");
      notice.hidden = false;
    } else if (insights.needsExchangeRate) {
      notice.textContent = "Your ad account is billed in " + insights.accountCurrency + ". Set the exchange rate in Integrations → Meta → Reporting to see spend in KES and return on ad spend.";
      notice.classList.add("is-warning");
      notice.hidden = false;
    } else {
      notice.hidden = true;
    }
    document.getElementById("campaignSpendRows").innerHTML = rows(
      (insights.campaigns || []).map(function (campaign) {
        return "<tr><td>" + escape(campaign.name) + "</td><td>" + kes(campaign.spend) + "</td><td>" + Number(campaign.impressions).toLocaleString("en-KE") + "</td><td>" + Number(campaign.clicks).toLocaleString("en-KE") + "</td></tr>";
      }),
      4,
      insights.configured ? "No campaign spend in this period." : "Not connected yet."
    );
  }

  function renderLinks(links) {
    document.getElementById("setupLinks").innerHTML = Object.keys(LINK_LABELS)
      .filter(function (key) { return links[key]; })
      .map(function (key) {
        var label = LINK_LABELS[key];
        return '<div class="field field-wide"><label>' + escape(label[0]) + '</label><div class="copy-row"><code>' + escape(links[key]) +
          '</code><button class="button button-outline" type="button" data-copy="' + escape(links[key]) + '">Copy</button></div>' +
          (label[1] ? "<small>" + escape(label[1]) + "</small>" : "") + "</div>";
      })
      .join("");
  }

  function renderEvents(events) {
    document.getElementById("eventRows").innerHTML = rows(
      (events || []).map(function (event) {
        var ok = event.status === "sent";
        var detail = event.detail && (event.detail.error || (event.detail.test ? "test event" : ""));
        return "<tr><td>" + escape(event.eventName) + "</td><td>" + escape(event.source) + '</td><td><span class="status-pill ' +
          (ok ? "status-completed" : "status-cancelled") + '">' + (ok ? "Sent" : "Error") + "</span>" + (detail ? "<small>" + escape(detail) + "</small>" : "") +
          "</td><td>" + dateFormatter.format(new Date(event.createdAt)) + "</td></tr>";
      }),
      4,
      "No server-side events yet. Turn on the Conversions API in Integrations → Meta."
    );
  }

  async function loadLeads() {
    var payload = await window.VibecraftApi.get("admin/marketing/leads");
    var leads = (payload && payload.data) || [];
    document.getElementById("leadRows").innerHTML = rows(
      leads.map(function (lead) {
        var extra = Object.keys(lead.fields || {})
          .filter(function (key) { return ["full_name", "email", "phone_number"].indexOf(key) === -1; })
          .map(function (key) { return key.replace(/_/g, " ") + ": " + lead.fields[key]; })
          .join(" · ");
        var options = ["new", "contacted", "converted", "closed"].map(function (status) {
          return '<option value="' + status + '"' + (status === lead.status ? " selected" : "") + ">" + status.charAt(0).toUpperCase() + status.slice(1) + "</option>";
        }).join("");
        return "<tr><td>" + escape(lead.name || "Lead") + (extra ? "<small>" + escape(extra) + "</small>" : "") + "</td><td>" +
          escape(lead.phone || "—") + "<small>" + escape(lead.email || "") + "</small></td><td>" + escape(lead.campaignName || "—") + "</td><td>" +
          dateFormatter.format(new Date(lead.createdAt)) + '</td><td><select class="admin-status-select" data-lead="' + escape(lead.id) + '">' + options + "</select></td></tr>";
      }),
      5,
      "No leads yet."
    );
  }

  async function load() {
    rangeStatus.textContent = "Loading…";
    rangeStatus.classList.remove("is-error");
    try {
      var payload = await window.VibecraftApi.get("admin/marketing/overview?since=" + encodeURIComponent(since.value) + "&until=" + encodeURIComponent(until.value));
      renderReport(payload.data.report);
      renderLinks(payload.data.links);
      renderEvents(payload.data.events);
      await loadLeads();
      rangeStatus.textContent = "";
    } catch (error) {
      rangeStatus.textContent = error.message || "Could not load marketing data.";
      rangeStatus.classList.add("is-error");
    }
  }

  rangeForm.addEventListener("submit", function (event) {
    event.preventDefault();
    load();
  });

  document.addEventListener("click", async function (event) {
    var copy = event.target.closest("[data-copy]");
    if (!copy) return;
    try {
      await navigator.clipboard.writeText(copy.getAttribute("data-copy"));
      copy.textContent = "Copied";
    } catch (_error) {
      copy.textContent = "Select & copy";
    }
  });

  document.getElementById("leadRows").addEventListener("change", async function (event) {
    var select = event.target.closest("select[data-lead]");
    if (!select) return;
    select.disabled = true;
    try {
      await window.VibecraftApi.patch("admin/marketing/leads/" + encodeURIComponent(select.getAttribute("data-lead")), { status: select.value });
    } catch (error) {
      window.alert(error.message || "Could not update the lead.");
    } finally {
      select.disabled = false;
    }
  });

  async function boot() {
    var admin = await window.VibecraftAdmin.requireSession();
    if (!admin) return;
    window.VibecraftAdmin.wireSignOut();
    window.VibecraftAdmin.renderAccountMenu(admin);
    if (!window.VibecraftAdmin.can("marketing.view", admin)) return;

    var today = new Date();
    until.value = iso(today);
    since.value = iso(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000));
    load();
  }

  boot();
})();
