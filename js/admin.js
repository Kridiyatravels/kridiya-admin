/* ============================================================
   Kridiya Travel — staff enquiry admin (admin.kridiyatravel.com)
   Read/write access is enforced server-side by RLS (public.is_staff());
   this page just renders what Supabase allows the signed-in user to see.
   ============================================================ */
"use strict";

(function () {
  if (document.body.dataset.page !== "admin") return;

  const STATUS_OPTIONS = [
    "received", "checking_availability", "quote_sent", "confirmed",
    "payment_pending", "booked", "documents_sent", "closed"
  ];
  const SERVICE_OPTIONS = ["flight", "hotel", "holiday", "visa", "umrah", "cruise", "transfer", "insurance", "other"];

  let sb = null;
  let currentStaffId = null;
  let allEnquiries = [];
  let notesByEnquiry = {};
  let requestsByEnquiry = {};
  let quotesByEnquiry = {};
  let bookingByEnquiry = {};
  let canCreateBookings = false;
  let canEditCorporates = false;

  function fmtMoney(amount, currency) {
    return currency + " " + Number(amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtWhen(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function waReplyLink(enq) {
    const phone = String(enq.phone || "").replace(/[^0-9]/g, "");
    if (!phone) return "";
    const firstName = enq.full_name ? enq.full_name.split(" ")[0] : "there";
    const text = "Hello " + firstName + ", this is Kridiya Travel. Following up on your enquiry " +
      enq.reference + " (" + enq.summary + ").";
    return "https://wa.me/" + phone + "?text=" + encodeURIComponent(text);
  }

  function mailReplyLink(enq) {
    const firstName = enq.full_name ? enq.full_name.split(" ")[0] : "";
    const subject = "Re: " + enq.reference + " — your Kridiya Travel enquiry";
    const body = "Hi " + firstName + ",\n\nThanks for your enquiry (" + enq.summary + ").\n\n";
    return "mailto:" + encodeURIComponent(enq.email) + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  function detail(enq, key) {
    return enq && enq.details && enq.details[key] ? String(enq.details[key]).trim() : "";
  }

  function isCorporateEnquiry(enq) {
    const requestType = detail(enq, "Request_type");
    return Boolean(
      detail(enq, "Company_name") ||
      /corporate|b2b/i.test(requestType) ||
      /corporate/i.test(enq.summary || "")
    );
  }

  function corporatePreview(enq) {
    if (!isCorporateEnquiry(enq)) return "";
    const items = [
      ["Company", detail(enq, "Company_name")],
      ["Service", detail(enq, "Service_needed")],
      ["Route", detail(enq, "Route_or_destination")],
      ["Travellers", detail(enq, "Travellers_count")],
      ["LPO", detail(enq, "LPO_required")],
      ["Billing", detail(enq, "Billing_email")]
    ].filter(function (x) { return x[1]; });
    return items.length ? '<div class="ops-kv corporate-enquiry-preview">' + items.map(function (x) {
      return '<span class="ops-chip">' + KridiyaAuth.escapeHTML(x[0]) + ': ' + KridiyaAuth.escapeHTML(x[1]) + '</span>';
    }).join("") + '</div>' : "";
  }

  function convertPanel(enq) {
    if (!isCorporateEnquiry(enq)) return "";
    if (!canCreateBookings || !canEditCorporates) {
      return '<div class="admin-notes" data-convert-for="' + enq.id + '" hidden><p class="form-note">You need create booking and edit corporate permissions to convert this enquiry.</p></div>';
    }
    return '<div class="admin-notes corporate-convert-panel" data-convert-for="' + enq.id + '" hidden>' +
      '<p class="form-note">This will create or reuse the corporate company, create the contact, create a linked corporate booking, and mark this enquiry as confirmed.</p>' +
      '<button type="button" class="btn btn-primary convert-corporate-btn" data-id="' + enq.id + '">Convert to corporate booking</button>' +
    '</div>';
  }

  const DEFAULT_QUOTE_TERMS =
    "- Fares are subject to availability and may change until the ticket is issued.\n" +
    "- Full payment is required before booking confirmation.\n" +
    "- Date changes, cancellations and no-shows are subject to airline penalties plus service fees.\n" +
    "- Passport must be valid for at least 6 months from the travel date.\n" +
    "- Visa (if required) is the traveller's responsibility unless arranged by Kridiya Travel.";

  function fmtQuoteDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    return isNaN(d) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  /* Preset optional add-ons offered on every quote option. */
  const QUOTE_ADDONS = [
    { name: "Extra baggage", hint: "e.g. +10kg" },
    { name: "Seat selection", hint: "e.g. window / extra legroom" },
    { name: "Meal", hint: "e.g. special meal" },
    { name: "Travel insurance", hint: "" }
  ];

  /* The tick-box add-on grid shown inside the quote form. */
  function quoteAddonFields() {
    return '<fieldset class="qf-addons">' +
      '<legend>Optional add-ons</legend>' +
      QUOTE_ADDONS.map(function (a) {
        return '<label class="addon-item">' +
          '<input type="checkbox" class="addon-check" value="' + KridiyaAuth.escapeHTML(a.name) + '">' +
          '<span class="addon-name">' + KridiyaAuth.escapeHTML(a.name) + "</span>" +
          '<input type="number" class="addon-price" min="0" step="0.01" placeholder="Price"' +
            (a.hint ? ' title="' + KridiyaAuth.escapeHTML(a.hint) + '"' : "") + " disabled>" +
        "</label>";
      }).join("") +
    "</fieldset>";
  }

  /* Reads the ticked add-ons into [{name, price}]. */
  function gatherAddons(form) {
    const out = [];
    form.querySelectorAll(".addon-item").forEach(function (item) {
      const cb = item.querySelector(".addon-check");
      if (!cb || !cb.checked) return;
      const priceEl = item.querySelector(".addon-price");
      const price = priceEl ? parseFloat(priceEl.value) : NaN;
      out.push({ name: cb.value, price: (price >= 0 ? price : null) });
    });
    return out;
  }

  /* Builds the professional customer message from every option added to
     this enquiry, ready to paste into WhatsApp. */
  function buildQuoteMessage(enq) {
    const list = (quotesByEnquiry[enq.id] || []).slice().reverse();
    if (!list.length) return "";
    const name = enq.full_name ? enq.full_name.split(" ")[0] : "there";
    const out = [];
    out.push("Hello " + name + ", thank you for choosing Kridiya Travel and Tourism. ✈️");
    out.push("");
    out.push("Here " + (list.length > 1 ? "are your options" : "is your quote") + ":");
    list.forEach(function (q, i) {
      out.push("");
      out.push("*" + (q.title || ("Option " + (i + 1))) + "*");
      const od = (q.option_data && typeof q.option_data === "object") ? q.option_data : {};
      const odKeys = Object.keys(od);
      if (odKeys.length) {
        odKeys.forEach(function (k) { if (od[k]) out.push(k + ": " + od[k]); });
      } else {
        if (q.airline) out.push("Airline: " + q.airline + (q.stops ? " (" + q.stops + ")" : ""));
        else if (q.stops) out.push("Type: " + q.stops);
        if (q.outbound) out.push("Onward: " + q.outbound);
        if (q.inbound) out.push("Return: " + q.inbound);
        if (q.baggage) out.push("Baggage: " + q.baggage);
      }
      out.push("Fare: " + fmtMoney(q.price_amount, q.currency) + " per person");
      const adds = Array.isArray(q.addons) ? q.addons : [];
      if (adds.length) {
        out.push("Optional add-ons:");
        adds.forEach(function (a) { out.push("  + " + a.name + (a.price != null ? " (" + fmtMoney(a.price, q.currency) + ")" : "")); });
      }
    });
    out.push("");
    out.push("*Terms & Conditions:*");
    ((list[0] && list[0].terms) ? list[0].terms : DEFAULT_QUOTE_TERMS).split("\n").forEach(function (t) {
      if (t.trim()) out.push(t.trim());
    });
    if (list[0] && list[0].valid_until) { out.push(""); out.push("Prices valid until " + fmtWhen(list[0].valid_until) + "."); }
    out.push("");
    out.push("To confirm, please reply and complete payment. Payment is required before booking. 🙏");
    return out.join("\n");
  }

  /* Config-driven fields for the non-flight/visa services. Each descriptor
     drives the form input AND how it is read back into option_data, so the
     review cards and the WhatsApp copy (both generic over option_data) stay
     in sync automatically. t: "text" | "date" | "select". */
  const QUOTE_SERVICE_FIELDS = {
    hotel: [
      { n: "h_hotel", label: "Hotel", t: "text", ph: "Hotel — e.g. Hilton Dubai", wide: true },
      { n: "h_location", label: "Location", t: "text", ph: "City / area" },
      { n: "h_checkin", label: "Check-in", t: "date" },
      { n: "h_checkout", label: "Check-out", t: "date" },
      { n: "h_room", label: "Room type", t: "text", ph: "Room type — e.g. Deluxe Double" },
      { n: "h_meal", label: "Meal plan", t: "select", opts: ["Room only", "Breakfast included", "Half board", "Full board", "All inclusive"] },
      { n: "h_guests", label: "Guests", t: "text", ph: "Guests — e.g. 2 adults", wide: true }
    ],
    holiday: [
      { n: "ho_dest", label: "Destination", t: "text", ph: "Destination — e.g. Bali, Indonesia", wide: true },
      { n: "ho_from", label: "Travel start", t: "date" },
      { n: "ho_to", label: "Travel end", t: "date" },
      { n: "ho_hotels", label: "Hotel(s)", t: "text", ph: "Hotel(s)", wide: true },
      { n: "ho_incl", label: "Inclusions", t: "text", ph: "Inclusions — flights, transfers, tours…", wide: true },
      { n: "ho_trav", label: "Travellers", t: "text", ph: "Travellers — e.g. 2 adults, 1 child", wide: true }
    ],
    umrah: [
      { n: "um_from", label: "Departure city", t: "text", ph: "Departure city — e.g. Dubai" },
      { n: "um_transport", label: "Transport", t: "select", opts: ["Flight", "Bus", "Flight + Bus"] },
      { n: "um_start", label: "Travel start", t: "date" },
      { n: "um_end", label: "Travel end", t: "date" },
      { n: "um_makkah", label: "Hotel — Makkah", t: "text", ph: "Hotel — Makkah" },
      { n: "um_madinah", label: "Hotel — Madinah", t: "text", ph: "Hotel — Madinah" },
      { n: "um_room", label: "Room type", t: "select", opts: ["Quad sharing", "Triple sharing", "Double", "Single"] },
      { n: "um_pax", label: "Pilgrims", t: "text", ph: "Pilgrims — e.g. 2 adults", wide: true }
    ],
    cruise: [
      { n: "cr_line", label: "Cruise line", t: "text", ph: "Cruise line — e.g. MSC Cruises" },
      { n: "cr_ship", label: "Ship", t: "text", ph: "Ship name" },
      { n: "cr_sail", label: "Sailing date", t: "date" },
      { n: "cr_nights", label: "Duration", t: "text", ph: "Duration — e.g. 5 nights" },
      { n: "cr_cabin", label: "Cabin type", t: "select", opts: ["Interior", "Ocean view", "Balcony", "Suite"] },
      { n: "cr_itin", label: "Itinerary", t: "text", ph: "Itinerary / ports", wide: true },
      { n: "cr_guests", label: "Guests", t: "text", ph: "Guests — e.g. 2 adults", wide: true }
    ],
    transfer: [
      { n: "tr_type", label: "Transfer type", t: "select", opts: ["Airport pickup", "Airport drop-off", "Round trip", "Point to point", "Hourly / disposal"] },
      { n: "tr_from", label: "From", t: "text", ph: "From — pickup location", wide: true },
      { n: "tr_to", label: "To", t: "text", ph: "To — drop-off location", wide: true },
      { n: "tr_date", label: "Date", t: "date" },
      { n: "tr_time", label: "Pickup time", t: "text", ph: "Pickup time (optional)" },
      { n: "tr_vehicle", label: "Vehicle", t: "select", opts: ["Sedan", "SUV", "Van", "Minibus", "Luxury / limousine"] },
      { n: "tr_pax", label: "Passengers", t: "text", ph: "Passengers — e.g. 3 + luggage" }
    ],
    insurance: [
      { n: "in_plan", label: "Plan", t: "text", ph: "Plan — e.g. Schengen Travel Insurance", wide: true },
      { n: "in_provider", label: "Insurer", t: "text", ph: "Insurer" },
      { n: "in_coverage", label: "Coverage", t: "text", ph: "Coverage — e.g. €30,000 medical" },
      { n: "in_area", label: "Area of cover", t: "text", ph: "Area — e.g. Worldwide / Schengen" },
      { n: "in_from", label: "Cover start", t: "date" },
      { n: "in_to", label: "Cover end", t: "date" },
      { n: "in_pax", label: "Insured persons", t: "text", ph: "Insured — e.g. 2 adults", wide: true }
    ]
  };

  /* Builds the inputs for one service config. Date fields get a visible
     caption so it's clear which date is which. */
  function buildServiceFields(fields) {
    const esc = KridiyaAuth.escapeHTML;
    return fields.map(function (f) {
      const wide = f.wide ? " qf-wide" : "";
      if (f.t === "select") {
        return '<select class="qf' + wide + '" name="' + f.n + '"><option value="">' + esc(f.ph || (f.label + "…")) + "</option>" +
          f.opts.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + "</option>"; }).join("") + "</select>";
      }
      if (f.t === "date") {
        return '<label class="qf-date' + wide + '"><span class="qf-cap">' + esc(f.label) + '</span>' +
          '<input class="qf" name="' + f.n + '" type="date"></label>';
      }
      return '<input class="qf' + wide + '" name="' + f.n + '" type="text" placeholder="' + esc(f.ph || f.label) + '">';
    }).join("");
  }

  /* Reads a service config back into a flat {label: value} option_data. */
  function gatherServiceData(form, fields) {
    const d = {};
    fields.forEach(function (f) {
      const el = form.elements[f.n];
      if (!el) return;
      let v = String(el.value == null ? "" : el.value).trim();
      if (!v) return;
      if (f.t === "date") v = fmtQuoteDate(v);
      d[f.label] = v;
    });
    return d;
  }

  /* Service-specific fields for the quote form. Bespoke builders for flight
     (default) and visa; the rest are config-driven from QUOTE_SERVICE_FIELDS. */
  function quoteServiceFields(enq) {
    const st = enq.service_type || "";
    if (st === "visa") {
      return "" +
        '<input class="qf qf-wide" name="v_country" type="text" placeholder="Country — e.g. United Arab Emirates">' +
        '<input class="qf" name="v_type" type="text" placeholder="Visa type — e.g. Tourist 30 days">' +
        '<select class="qf" name="v_entries"><option value="">Entries…</option><option value="Single entry">Single entry</option><option value="Multiple entry">Multiple entry</option></select>' +
        '<input class="qf" name="v_validity" type="text" placeholder="Validity — e.g. 60 days">' +
        '<input class="qf" name="v_processing" type="text" placeholder="Processing — e.g. 3–4 working days">';
    }
    if (QUOTE_SERVICE_FIELDS[st]) return buildServiceFields(QUOTE_SERVICE_FIELDS[st]);
    return "" +
      '<input class="qf" name="airline" type="text" placeholder="Airline — e.g. Air Arabia">' +
      '<select class="qf" name="stops"><option value="">Stops…</option><option value="Direct">Direct</option><option value="1 stop">1 stop</option><option value="2 stops">2 stops</option></select>' +
      '<span class="ac-wrap qf-wide"><input class="qf" name="from" type="text" placeholder="From — type city or airport (e.g. Dubai)" data-airport></span>' +
      '<span class="ac-wrap qf-wide"><input class="qf" name="to" type="text" placeholder="To — type city or airport (e.g. Colombo)" data-airport></span>' +
      '<input class="qf" name="depart_date" type="date">' +
      '<input class="qf" name="return_date" type="date">' +
      '<input class="qf" name="depart_time" type="text" placeholder="Onward time (optional)">' +
      '<input class="qf" name="return_time" type="text" placeholder="Return time (optional)">' +
      '<input class="qf qf-wide" name="baggage" type="text" placeholder="Baggage — e.g. 30kg + 7kg cabin">';
  }

  /* Reads the service-specific inputs into a flat {label: value} object
     stored on the quote as option_data. */
  function gatherOptionData(form) {
    const st = form.dataset.service || "";
    const d = {};
    function put(k, v) { const t = String(v == null ? "" : v).trim(); if (t) d[k] = t; }
    if (st === "visa") {
      put("Country", form.v_country.value);
      put("Visa type", form.v_type.value);
      put("Entries", form.v_entries.value);
      put("Validity", form.v_validity.value);
      put("Processing", form.v_processing.value);
      return d;
    }
    if (QUOTE_SERVICE_FIELDS[st]) return gatherServiceData(form, QUOTE_SERVICE_FIELDS[st]);
    const airline = form.airline.value.trim();
    const stops = form.stops.value;
    if (airline) d["Airline"] = airline + (stops ? " (" + stops + ")" : "");
    else if (stops) d["Type"] = stops;
    const fromA = resolveAirport(form.from), toA = resolveAirport(form.to);
    const routeFwd = (fromA && toA) ? fromA.city + " (" + fromA.iata + ") → " + toA.city + " (" + toA.iata + ")" : [form.from.value.trim(), form.to.value.trim()].filter(Boolean).join(" → ");
    const routeRev = (fromA && toA) ? toA.city + " (" + toA.iata + ") → " + fromA.city + " (" + fromA.iata + ")" : [form.to.value.trim(), form.from.value.trim()].filter(Boolean).join(" → ");
    const dTime = form.depart_time.value.trim(), rTime = form.return_time.value.trim();
    const onward = [routeFwd, fmtQuoteDate(form.depart_date.value), dTime].filter(Boolean).join(" · ");
    const ret = (form.return_date.value || rTime) ? [routeRev, fmtQuoteDate(form.return_date.value), rTime].filter(Boolean).join(" · ") : "";
    if (onward) d["Onward"] = onward;
    if (ret) d["Return"] = ret;
    put("Baggage", form.baggage.value);
    return d;
  }

  function matchesFilters(enq) {
    const statusF = document.getElementById("flt-status").value;
    const serviceF = document.getElementById("flt-service").value;
    const todayOnly = document.getElementById("flt-today").checked;
    if (statusF && enq.status !== statusF) return false;
    if (serviceF && enq.service_type !== serviceF) return false;
    if (todayOnly && new Date(enq.created_at).toDateString() !== new Date().toDateString()) return false;
    return true;
  }

  function renderStatTiles() {
    const row = document.getElementById("stat-row");
    if (!row) return;
    const today = new Date().toDateString();
    const newToday = allEnquiries.filter(function (e) { return new Date(e.created_at).toDateString() === today; }).length;
    const awaitingQuote = allEnquiries.filter(function (e) { return e.status === "received" || e.status === "checking_availability"; }).length;
    const quotesOut = allEnquiries.filter(function (e) { return e.status === "quote_sent" || e.status === "payment_pending"; }).length;
    const confirmed = allEnquiries.filter(function (e) { return e.status === "confirmed" || e.status === "booked"; }).length;
    const tiles = [
      { num: newToday, label: "New today", accent: "var(--status-checking)" },
      { num: awaitingQuote, label: "Awaiting a quote", accent: "var(--status-received)" },
      { num: quotesOut, label: "Quote sent, waiting", accent: "var(--status-quoted)" },
      { num: confirmed, label: "Confirmed", accent: "var(--status-confirmed)" }
    ];
    row.innerHTML = tiles.map(function (t) {
      return '<div class="stat-tile" style="--tile-accent:' + t.accent + '"><div class="num">' + t.num + '</div><div class="label">' + t.label + "</div></div>";
    }).join("");
  }

  function renderList() {
    renderStatTiles();
    const listEl = document.getElementById("admin-list");
    const visible = allEnquiries.filter(matchesFilters);
    document.getElementById("admin-count").textContent = visible.length + " of " + allEnquiries.length + " enquiries";

    if (!visible.length) {
      listEl.innerHTML = '<div class="account-main empty-state"><p>No enquiries match these filters.</p></div>';
      return;
    }

    listEl.innerHTML = visible.map(function (enq) {
      const created = new Date(enq.created_at);
      const notes = notesByEnquiry[enq.id] || [];
      const requests = requestsByEnquiry[enq.id] || [];
      const quotes = quotesByEnquiry[enq.id] || [];
      const wa = waReplyLink(enq);
      const initial = (enq.full_name || "?").trim().charAt(0).toUpperCase();
      const corporate = isCorporateEnquiry(enq);
      const booking = bookingByEnquiry[enq.id];
      return (
        '<div class="account-main admin-enq" data-id="' + enq.id + '">' +
          '<div class="enq-row-head">' +
            '<div class="enq-avatar">' + initial + "</div>" +
            '<div class="enq-row-main">' +
              '<div class="top-line"><b>' + KridiyaAuth.escapeHTML(enq.full_name) + "</b>" +
                '<span class="status-badge" style="' + statusStyle(enq.status) + '">' + KridiyaAuth.statusLabel(enq.status) + "</span>" +
                '<span class="admin-badge">' + KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(enq.service_type)) + "</span>" +
                (booking ? '<span class="admin-badge admin-badge-converted" title="' + KridiyaAuth.escapeHTML(booking.booking_reference || "") + '">' + icon("check") + ' Converted</span>' : "") +
              "</div>" +
              '<div class="sub-line">' + KridiyaAuth.escapeHTML(enq.reference) + " · " + KridiyaAuth.escapeHTML(enq.summary) + "</div>" +
            "</div>" +
            '<time class="enq-row-time">' + created.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + "</time>" +
            icon("chevron", "enq-chevron") +
          "</div>" +
          '<div class="enq-row-body">' +
          '<p style="margin:0 0 0.2rem"><b>Contact</b> · ' +
            (enq.phone ? '<a href="tel:' + KridiyaAuth.escapeHTML(enq.phone) + '">' + KridiyaAuth.escapeHTML(enq.phone) + "</a> · " : "") +
            '<a href="mailto:' + KridiyaAuth.escapeHTML(enq.email) + '">' + KridiyaAuth.escapeHTML(enq.email) + "</a></p>" +
          corporatePreview(enq) +
          '<div class="admin-enq-actions">' +
            '<select class="status-select status-pill-select" data-id="' + enq.id + '" style="' + statusStyle(enq.status) + '">' +
              STATUS_OPTIONS.map(function (s) {
                return '<option value="' + s + '"' + (s === enq.status ? " selected" : "") + ">" + KridiyaAuth.statusLabel(s) + "</option>";
              }).join("") +
            "</select>" +
            (wa ? '<a class="btn btn-wa" target="_blank" rel="noopener" href="' + wa + '">' + icon("whatsapp") + " WhatsApp</a>" : "") +
            '<a class="btn btn-outline" href="' + mailReplyLink(enq) + '">' + icon("mail") + " Email</a>" +
            '<button type="button" class="btn btn-outline notes-toggle" data-id="' + enq.id + '">Notes (' + notes.length + ")</button>" +
            '<button type="button" class="btn btn-outline requests-toggle" data-id="' + enq.id + '">Requests (' + requests.length + ")</button>" +
            '<button type="button" class="btn btn-outline quotes-toggle" data-id="' + enq.id + '">Quote (' + quotes.length + ")</button>" +
            (booking
              ? '<a class="btn btn-primary" href="booking-detail.html?id=' + KridiyaAuth.escapeHTML(booking.id) + '">Open booking</a>'
              : (corporate ? '<button type="button" class="btn btn-outline convert-toggle" data-id="' + enq.id + '">Convert</button>' : "")) +
            '<a class="btn btn-outline" href="documents.html?enquiry=' + enq.id + '">Document</a>' +
          "</div>" +
          '<div class="admin-notes" data-notes-for="' + enq.id + '" hidden>' +
            '<div class="admin-notes-list">' +
              (notes.length
                ? notes.map(function (n) {
                    return '<div class="admin-note"><p>' + KridiyaAuth.escapeHTML(n.note) + "</p><time>" +
                      new Date(n.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) +
                      "</time></div>";
                  }).join("")
                : '<p class="form-note">No internal notes yet.</p>') +
            "</div>" +
            '<form class="admin-note-form" data-id="' + enq.id + '">' +
              '<textarea placeholder="Add an internal note (staff only, customer never sees this)…" required></textarea>' +
              '<button class="btn btn-primary" type="submit">Add note</button>' +
            "</form>" +
          "</div>" +
          '<div class="admin-notes" data-requests-for="' + enq.id + '" hidden>' +
            '<div class="admin-notes-list">' +
              (requests.length
                ? requests.map(function (r) {
                    const answered = r.responded_at
                      ? (r.kind === "file"
                          ? (r.response_file_path
                              ? '<button type="button" class="btn btn-outline view-file-btn" data-path="' + KridiyaAuth.escapeHTML(r.response_file_path) + '">View file: ' + KridiyaAuth.escapeHTML(r.response_file_name || "uploaded file") + "</button>"
                              : '<span class="form-note">No file uploaded.</span>')
                          : '<p style="margin:0.3rem 0 0">' + KridiyaAuth.escapeHTML(r.response_text || "") + "</p>")
                      : '<span class="form-note">Waiting on customer.</span>';
                    return '<div class="admin-note"><p><b>' + KridiyaAuth.escapeHTML(r.label) + '</b> <span class="admin-badge">' + (r.kind === "file" ? "File" : "Text") + "</span></p>" + answered + "</div>";
                  }).join("")
                : '<p class="form-note">No requests sent yet.</p>') +
            "</div>" +
            '<form class="admin-request-form" data-id="' + enq.id + '">' +
              '<select name="kind"><option value="text">Text answer</option><option value="file">File upload</option></select>' +
              '<input name="label" type="text" placeholder="e.g. Passport number and expiry date" required style="flex:1 1 260px;min-height:44px;border:1px solid var(--line);border-radius:var(--r-sm);padding:0 0.7rem">' +
              '<button class="btn btn-primary" type="submit">Ask</button>' +
            "</form>" +
          "</div>" +
          '<div class="admin-notes" data-quotes-for="' + enq.id + '" hidden>' +
            (quotes.length ? '<div class="quote-actions-bar"><button type="button" class="btn btn-primary js-copy-quotes" data-id="' + enq.id + '">' + icon("mail") + ' Copy for WhatsApp</button><span class="form-note">' + quotes.length + ' option(s) in this quote</span></div>' : '') +
            '<div class="admin-notes-list">' +
              (quotes.length
                ? quotes.slice().reverse().map(function (q, i) {
                    const adds = Array.isArray(q.addons) ? q.addons : [];
                    const od = (q.option_data && typeof q.option_data === "object") ? q.option_data : {};
                    const odLines = Object.keys(od).map(function (k) { return od[k] ? '<p class="quote-line">' + KridiyaAuth.escapeHTML(k) + ": " + KridiyaAuth.escapeHTML(String(od[k])) + "</p>" : ""; }).join("");
                    const legacy = ((q.airline || q.stops) ? '<p class="quote-line">' + KridiyaAuth.escapeHTML([q.airline, q.stops].filter(Boolean).join(" · ")) + "</p>" : "") +
                      (q.outbound ? '<p class="quote-line">Onward: ' + KridiyaAuth.escapeHTML(q.outbound) + "</p>" : "") +
                      (q.inbound ? '<p class="quote-line">Return: ' + KridiyaAuth.escapeHTML(q.inbound) + "</p>" : "") +
                      (q.baggage ? '<p class="quote-line">Baggage: ' + KridiyaAuth.escapeHTML(q.baggage) + "</p>" : "");
                    return '<div class="admin-note quote-option">' +
                      '<p class="quote-option-head"><b>' + KridiyaAuth.escapeHTML(q.title || ("Option " + (i + 1))) + "</b> — " + fmtMoney(q.price_amount, q.currency) + '/person <span class="admin-badge">' + KridiyaAuth.statusLabel(q.status) + "</span>" +
                        '<button type="button" class="quote-remove js-remove-quote" data-id="' + q.id + '" data-enq="' + enq.id + '" title="Remove this option" aria-label="Remove option">×</button></p>' +
                      (odLines || legacy) +
                      (adds.length ? '<div class="ops-kv">' + adds.map(function (a) { return '<span class="ops-chip">+ ' + KridiyaAuth.escapeHTML(a.name) + (a.price != null ? " " + fmtMoney(a.price, q.currency) : "") + "</span>"; }).join("") + "</div>" : "") +
                      (q.valid_until ? '<p class="form-note" style="margin:0.2rem 0 0">Valid until ' + fmtWhen(q.valid_until) + "</p>" : "") +
                      "</div>";
                  }).join("")
                : '<p class="form-note">No options added yet. Build an option below and click “+ Add option”. Add as many as you like, then Copy for WhatsApp.</p>') +
            "</div>" +
            '<form class="admin-quote-form pro-quote-form" data-id="' + enq.id + '" data-service="' + KridiyaAuth.escapeHTML(enq.service_type || "") + '">' +
              '<div class="qf-grid">' +
                '<input class="qf qf-wide" name="title" type="text" placeholder="Option label — e.g. Option 1: Air Arabia" required>' +
                quoteServiceFields(enq) +
                '<input class="qf" name="price_amount" type="number" min="0" step="0.01" placeholder="' + ((enq.service_type === "visa") ? "Price / applicant" : "Fare / person") + '" required>' +
                '<input class="qf" name="currency" type="text" value="AED" maxlength="3">' +
                '<input class="qf qf-wide" name="valid_until" type="datetime-local" title="Quote valid until">' +
              "</div>" +
              quoteAddonFields() +
              '<textarea class="qf qf-area" name="terms">' + KridiyaAuth.escapeHTML(DEFAULT_QUOTE_TERMS) + "</textarea>" +
              '<button class="btn btn-primary" type="submit">+ Add option</button>' +
            "</form>" +
          "</div>" +
          (booking ? "" : convertPanel(enq)) +
          "</div>" +
        "</div>"
      );
    }).join("");
    if (typeof initAirportAC === "function") initAirportAC(listEl);
  }

  async function loadEnquiries() {
    const result = await sb.from("enquiries").select("*").order("created_at", { ascending: false });
    if (result.error) throw result.error;
    allEnquiries = result.data || [];
  }

  async function loadNotes() {
    const result = await sb.from("enquiry_notes").select("id, enquiry_id, note, created_at").order("created_at", { ascending: false });
    if (result.error) throw result.error;
    notesByEnquiry = {};
    (result.data || []).forEach(function (n) {
      if (!notesByEnquiry[n.enquiry_id]) notesByEnquiry[n.enquiry_id] = [];
      notesByEnquiry[n.enquiry_id].push(n);
    });
  }

  async function loadRequests() {
    const result = await sb.from("enquiry_requests").select("*").order("created_at", { ascending: false });
    if (result.error) throw result.error;
    requestsByEnquiry = {};
    (result.data || []).forEach(function (r) {
      if (!requestsByEnquiry[r.enquiry_id]) requestsByEnquiry[r.enquiry_id] = [];
      requestsByEnquiry[r.enquiry_id].push(r);
    });
  }

  async function loadQuotes() {
    const result = await sb.from("quotes").select("*").order("created_at", { ascending: false });
    if (result.error) throw result.error;
    quotesByEnquiry = {};
    (result.data || []).forEach(function (q) {
      if (!quotesByEnquiry[q.enquiry_id]) quotesByEnquiry[q.enquiry_id] = [];
      quotesByEnquiry[q.enquiry_id].push(q);
    });
  }

  /* Which enquiries already have a booking? Lets us show a "Converted"
     badge + "Open booking" button up front, and hide the Convert action
     so the same enquiry is never converted twice by mistake. */
  async function loadBookingLinks() {
    const result = await sb.from("bookings").select("id, booking_reference, enquiry_id").not("enquiry_id", "is", null);
    if (result.error) throw result.error;
    bookingByEnquiry = {};
    (result.data || []).forEach(function (b) {
      if (!bookingByEnquiry[b.enquiry_id]) bookingByEnquiry[b.enquiry_id] = b;
    });
  }

  function populateFilterOptions() {
    const statusSel = document.getElementById("flt-status");
    STATUS_OPTIONS.forEach(function (s) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = KridiyaAuth.statusLabel(s);
      statusSel.appendChild(opt);
    });
    const serviceSel = document.getElementById("flt-service");
    SERVICE_OPTIONS.forEach(function (s) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = KridiyaAuth.statusLabel(s);
      serviceSel.appendChild(opt);
    });
  }

  function wireEvents() {
    ["flt-status", "flt-service", "flt-today"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", renderList);
    });

    const listEl = document.getElementById("admin-list");

    listEl.addEventListener("change", async function (e) {
      if (!e.target.classList.contains("status-select")) return;
      const select = e.target;
      const id = select.dataset.id;
      const newStatus = select.value;
      select.disabled = true;
      const result = await sb.from("enquiries").update({ status: newStatus }).eq("id", id);
      select.disabled = false;
      if (result.error) {
        toast("Could not update status: " + result.error.message);
        return;
      }
      const row = allEnquiries.find(function (r) { return r.id === id; });
      const prevStatus = row ? row.status : null;
      if (row) row.status = newStatus;
      select.setAttribute("style", statusStyle(newStatus));
      const badge = select.closest(".admin-enq").querySelector(".enq-row-head .status-badge");
      if (badge) {
        badge.setAttribute("style", statusStyle(newStatus));
        badge.textContent = KridiyaAuth.statusLabel(newStatus);
      }
      logActivity(sb, currentStaffId, "enquiry.status_changed", "enquiry", id, { reference: row ? row.reference : null, from: prevStatus, to: newStatus });
      toast("Status updated.");
    });

    listEl.addEventListener("click", async function (e) {
      const rowHead = e.target.closest(".enq-row-head");
      if (rowHead) {
        rowHead.closest(".admin-enq").classList.toggle("expanded");
        return;
      }
      const notesBtn = e.target.closest(".notes-toggle");
      if (notesBtn) {
        const panel = listEl.querySelector('.admin-notes[data-notes-for="' + notesBtn.dataset.id + '"]');
        if (panel) panel.hidden = !panel.hidden;
        return;
      }
      const reqBtn = e.target.closest(".requests-toggle");
      if (reqBtn) {
        const panel = listEl.querySelector('.admin-notes[data-requests-for="' + reqBtn.dataset.id + '"]');
        if (panel) panel.hidden = !panel.hidden;
        return;
      }
      const quoteBtn = e.target.closest(".quotes-toggle");
      if (quoteBtn) {
        const panel = listEl.querySelector('.admin-notes[data-quotes-for="' + quoteBtn.dataset.id + '"]');
        if (panel) panel.hidden = !panel.hidden;
        return;
      }
      const copyQuoteBtn = e.target.closest(".js-copy-quotes");
      if (copyQuoteBtn) {
        const cqEnq = allEnquiries.find(function (r) { return r.id === copyQuoteBtn.dataset.id; });
        if (cqEnq) {
          const text = buildQuoteMessage(cqEnq);
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
              function () { toast("Quote copied — paste into WhatsApp."); },
              function () { toast("Could not copy automatically — select the text manually."); }
            );
          } else {
            toast("Copy not supported on this browser.");
          }
        }
        return;
      }
      const removeQuoteBtn = e.target.closest(".js-remove-quote");
      if (removeQuoteBtn) {
        if (!confirm("Remove this option from the quote?")) return;
        const qid = removeQuoteBtn.dataset.id;
        const eqid = removeQuoteBtn.dataset.enq;
        removeQuoteBtn.disabled = true;
        const del = await sb.from("quotes").delete().eq("id", qid);
        if (del.error) { removeQuoteBtn.disabled = false; toast("Could not remove option: " + del.error.message); return; }
        if (quotesByEnquiry[eqid]) quotesByEnquiry[eqid] = quotesByEnquiry[eqid].filter(function (q) { return q.id !== qid; });
        renderList();
        const panel = listEl.querySelector('.admin-notes[data-quotes-for="' + eqid + '"]');
        if (panel) panel.hidden = false;
        toast("Option removed.");
        return;
      }
      const convertBtn = e.target.closest(".convert-toggle");
      if (convertBtn) {
        const panel = listEl.querySelector('.admin-notes[data-convert-for="' + convertBtn.dataset.id + '"]');
        if (panel) panel.hidden = !panel.hidden;
        return;
      }
      const doConvertBtn = e.target.closest(".convert-corporate-btn");
      if (doConvertBtn) {
        await convertCorporateEnquiry(doConvertBtn);
        return;
      }
      const viewBtn = e.target.closest(".view-file-btn");
      if (viewBtn) {
        viewBtn.disabled = true;
        const result = await sb.storage.from("enquiry-uploads").createSignedUrl(viewBtn.dataset.path, 120);
        viewBtn.disabled = false;
        if (result.error || !result.data) {
          toast("Could not open file: " + (result.error ? result.error.message : "unknown error"));
          return;
        }
        window.open(result.data.signedUrl, "_blank", "noopener");
      }
    });

    listEl.addEventListener("submit", async function (e) {
      const form = e.target.closest(".admin-note-form");
      if (!form) return;
      e.preventDefault();
      const textarea = form.querySelector("textarea");
      const note = textarea.value.trim();
      if (!note) return;
      const id = form.dataset.id;
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      const result = await sb
        .from("enquiry_notes")
        .insert({ enquiry_id: id, note: note, created_by: currentStaffId })
        .select("id, enquiry_id, note, created_at")
        .single();
      btn.disabled = false;
      if (result.error) {
        toast("Could not save note: " + result.error.message);
        return;
      }
      if (!notesByEnquiry[id]) notesByEnquiry[id] = [];
      notesByEnquiry[id].unshift(result.data);
      renderList();
      const panel = listEl.querySelector('.admin-notes[data-notes-for="' + id + '"]');
      if (panel) panel.hidden = false;
      const noteRow = allEnquiries.find(function (r) { return r.id === id; });
      logActivity(sb, currentStaffId, "enquiry.note_added", "enquiry", id, { reference: noteRow ? noteRow.reference : null });
    });

    listEl.addEventListener("submit", async function (e) {
      const form = e.target.closest(".admin-request-form");
      if (!form) return;
      e.preventDefault();
      const id = form.dataset.id;
      const label = form.label.value.trim();
      if (!label) return;
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      const result = await sb
        .from("enquiry_requests")
        .insert({ enquiry_id: id, kind: form.kind.value, label: label, created_by: currentStaffId })
        .select("*")
        .single();
      btn.disabled = false;
      if (result.error) {
        toast("Could not send request: " + result.error.message);
        return;
      }
      if (!requestsByEnquiry[id]) requestsByEnquiry[id] = [];
      requestsByEnquiry[id].unshift(result.data);
      renderList();
      const panel = listEl.querySelector('.admin-notes[data-requests-for="' + id + '"]');
      if (panel) panel.hidden = false;
      const reqEnq = allEnquiries.find(function (r) { return r.id === id; });
      logActivity(sb, currentStaffId, "enquiry.request_sent", "enquiry", id, { reference: reqEnq ? reqEnq.reference : null, kind: form.kind.value, label: label });
      toast("Request sent to customer.");
    });

    listEl.addEventListener("change", function (e) {
      const cb = e.target.closest(".addon-check");
      if (!cb) return;
      const price = cb.closest(".addon-item").querySelector(".addon-price");
      if (!price) return;
      price.disabled = !cb.checked;
      if (!cb.checked) price.value = "";
      else price.focus();
    });

    listEl.addEventListener("submit", async function (e) {
      const form = e.target.closest(".admin-quote-form");
      if (!form) return;
      e.preventDefault();
      const id = form.dataset.id;
      const title = form.title.value.trim();
      const price = parseFloat(form.price_amount.value);
      if (!title || !(price >= 0)) return;
      const currency = (form.currency.value || "AED").trim().toUpperCase();
      const validUntil = form.valid_until.value ? new Date(form.valid_until.value).toISOString() : null;
      const terms = form.terms.value.trim();
      const optionData = gatherOptionData(form);
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      const result = await sb
        .from("quotes")
        .insert({
          enquiry_id: id,
          title: title,
          option_data: optionData,
          addons: gatherAddons(form),
          price_amount: price,
          currency: currency,
          valid_until: validUntil,
          terms: terms || null,
          created_by: currentStaffId
        })
        .select("*")
        .single();
      btn.disabled = false;
      if (result.error) {
        toast("Could not send quote: " + result.error.message);
        return;
      }
      if (!quotesByEnquiry[id]) quotesByEnquiry[id] = [];
      quotesByEnquiry[id].unshift(result.data);
      renderList();
      const panel = listEl.querySelector('.admin-notes[data-quotes-for="' + id + '"]');
      if (panel) panel.hidden = false;
      const quoteEnq = allEnquiries.find(function (r) { return r.id === id; });
      logActivity(sb, currentStaffId, "enquiry.quote_sent", "enquiry", id, { reference: quoteEnq ? quoteEnq.reference : null, title: title, amount: price, currency: currency });
      toast("Quote sent to customer.");
    });
  }

  async function convertCorporateEnquiry(btn) {
    const id = btn.dataset.id;
    const enq = allEnquiries.find(function (r) { return r.id === id; });
    if (!enq) return;
    if (!detail(enq, "Company_name")) {
      toast("Company name is missing on this enquiry.");
      return;
    }
    if (!confirm("Convert " + detail(enq, "Company_name") + " into a corporate booking?")) return;
    btn.disabled = true;
    btn.textContent = "Converting...";
    try {
      const result = await sb.rpc("convert_corporate_enquiry_to_booking", {
        p_enquiry_id: id
      });
      if (result.error) throw result.error;
      const data = result.data || {};
      logActivity(sb, currentStaffId, "enquiry.converted_to_corporate_booking", "booking", data.booking_id || null, {
        reference: enq.reference,
        company_name: detail(enq, "Company_name"),
        existing_booking: data.existing_booking === true
      });
      toast(data.existing_booking ? "Booking already exists. Opening it now." : "Corporate booking created.");
      setTimeout(function () {
        location.href = "booking-detail.html?id=" + encodeURIComponent(data.booking_id);
      }, 450);
    } catch (err) {
      toast("Could not convert enquiry: " + err.message);
      btn.disabled = false;
      btn.textContent = "Convert to corporate booking";
    }
  }

  async function boot() {
    const gate = document.getElementById("admin-gate");
    const app = document.getElementById("admin-app");

    const user = await KridiyaAuth.currentUser();
    if (!user) {
      renderLoginForm(gate, boot);
      return;
    }
    currentStaffId = user.id;

    sb = await KridiyaAuth.client();
    let staff = false;
    try {
      const check = await sb.rpc("is_staff");
      staff = !check.error && check.data === true;
    } catch (e) {
      staff = false;
    }

    if (!staff) {
      gate.innerHTML =
        '<div class="account-main empty-state">' +
          "<p><b>You do not have admin access.</b><br>This site is for Kridiya Travel staff only.</p>" +
          '<button type="button" class="btn btn-primary" id="staff-gate-logout">Log out</button>' +
        "</div>";
      document.getElementById("staff-gate-logout").addEventListener("click", async function () {
        await KridiyaAuth.logout();
        location.reload();
      });
      return;
    }

    try {
      await Promise.all([loadEnquiries(), loadNotes(), loadRequests(), loadQuotes(), loadBookingLinks()]);
      const perms = await Promise.all([
        sb.rpc("has_staff_permission", { permission_name: "create_bookings" }),
        sb.rpc("has_staff_permission", { permission_name: "edit_corporates" })
      ]);
      canCreateBookings = !perms[0].error && perms[0].data === true;
      canEditCorporates = !perms[1].error && perms[1].data === true;
    } catch (err) {
      gate.innerHTML = '<div class="account-main empty-state"><p>Could not load enquiries: ' + KridiyaAuth.escapeHTML(err.message) + "</p></div>";
      return;
    }

    populateFilterOptions();
    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    renderList();
    wireEvents();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
