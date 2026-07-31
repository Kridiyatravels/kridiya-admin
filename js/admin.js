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
  let focusEmail = "";  // customers.html deep-link: show only this person's enquiries
  let focusId = "";     // deep-link: expand + scroll to a specific enquiry
  let notesByEnquiry = {};
  let requestsByEnquiry = {};
  let quotesByEnquiry = {};
  let quoteDraftsByEnquiry = {};
  let bookingByEnquiry = {};
  let canCreateBookings = false;
  let canEditCorporates = false;
  let activeSort = "created_desc";

  function esc(v) {
    return KridiyaAuth.escapeHTML(String(v == null ? "" : v));
  }

  function fmtMoney(amount, currency) {
    return currency + " " + Number(amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function quotePrice(quote) {
    const price = Number(quote && quote.price_amount);
    return Number.isFinite(price) ? price : Number.MAX_SAFE_INTEGER;
  }

  function sortQuoteOptions(quotes) {
    return (quotes || []).slice().sort(function (a, b) {
      const byPrice = quotePrice(a) - quotePrice(b);
      if (byPrice) return byPrice;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });
  }

  function quoteName(title) {
    return String(title || "").replace(/^Option\s+\d+\s*:\s*/i, "").trim();
  }

  function numberedQuoteTitle(title, index) {
    const name = quoteName(title);
    return "Option " + (index + 1) + (name ? ": " + name : "");
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

  function firstName(enq) {
    return enq.full_name ? enq.full_name.trim().split(/\s+/)[0] : "there";
  }

  function hoursSince(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return null;
    return (Date.now() - d.getTime()) / 36e5;
  }

  function ageLabel(hours) {
    if (hours == null) return "No date";
    if (hours < 1) return "Just now";
    if (hours < 24) return Math.floor(hours) + "h";
    return Math.floor(hours / 24) + "d";
  }

  function latestTouch(enq, notes, quotes) {
    const dates = [enq.created_at].concat(
      notes.map(function (n) { return n.created_at; }),
      quotes.map(function (q) { return q.created_at; })
    ).filter(Boolean).map(function (x) { return new Date(x).getTime(); }).filter(function (x) { return !isNaN(x); });
    return dates.length ? new Date(Math.max.apply(null, dates)).toISOString() : enq.created_at;
  }

  function marketingSource(enq) {
    const fields = [
      enq.last_touch_source,
      enq.utm_source,
      enq.first_touch_source,
      detail(enq, "utm_source"),
      detail(enq, "source"),
      detail(enq, "Lead_source"),
      detail(enq, "How_did_you_find_us"),
      detail(enq, "Request_type")
    ].filter(Boolean).join(" ");
    if (/google|search/i.test(fields)) return "Google/Search";
    if (/instagram|facebook|meta|social/i.test(fields)) return "Social";
    if (/whatsapp|call/i.test(fields)) return "Direct";
    if (/corporate|b2b/i.test(fields) || isCorporateEnquiry(enq)) return "Corporate";
    return "Website";
  }

  function followUpStage(enq, notes, quotes, booking) {
    if (booking) return { label: "Won", tone: "success", action: "Keep booking service tight and ask for referral after completion." };
    if (enq.status === "closed") return { label: "Closed", tone: "neutral", action: "Check notes before reopening this lead." };
    if (!quotes.length) return { label: "Pre-quote", tone: "warn", action: "Send quote or request missing details." };
    if (needsFollowUp(enq)) return { label: "Quote follow-up", tone: "hot", action: "Follow up with urgency, validity, and payment next step." };
    if (isStale(enq)) return { label: "Stale", tone: "hot", action: "Send a short revival message or mark outcome." };
    return { label: "Active", tone: "info", action: "Keep lead warm and record the next customer signal." };
  }

  function followUpText(enq, quotes, type) {
    const lead = firstName(enq);
    const latestQuote = quotes && quotes.length ? quotes[0] : null;
    const quoted = latestQuote ? " The latest option is " + fmtMoney(latestQuote.price_amount, latestQuote.currency || "AED") + "." : "";
    if (type === "email") {
      return "Hi " + lead + ",\n\nI am following up on your Kridiya Travel enquiry " + enq.reference + " for " + enq.summary + "." + quoted + "\n\nPlease let me know if you would like us to proceed, revise the option, or hold it for a later date.\n\nRegards,\nKridiya Travel";
    }
    return "Hello " + lead + ", this is Kridiya Travel following up on enquiry " + enq.reference + " (" + enq.summary + ")." + quoted + " Would you like us to proceed, revise the option, or keep it on hold?";
  }

  function marketingFollowUp(enq, notes, quotes, booking) {
    const stage = followUpStage(enq, notes, quotes, booking);
    const lastTouch = latestTouch(enq, notes, quotes);
    const touchAge = hoursSince(lastTouch);
    const leadAge = hoursSince(enq.created_at);
    const hot = stage.tone === "hot" || (touchAge != null && touchAge >= 24 && !booking);
    return '<div class="marketing-follow ' + (hot ? "is-hot" : "") + '">' +
      '<div class="marketing-follow-main">' +
        '<span class="marketing-chip marketing-' + KridiyaAuth.escapeHTML(stage.tone) + '">' + KridiyaAuth.escapeHTML(stage.label) + '</span>' +
        '<span><b>Source</b> ' + KridiyaAuth.escapeHTML(marketingSource(enq)) + '</span>' +
        '<span><b>Lead age</b> ' + KridiyaAuth.escapeHTML(ageLabel(leadAge)) + '</span>' +
        '<span><b>Last touch</b> ' + KridiyaAuth.escapeHTML(ageLabel(touchAge)) + '</span>' +
      '</div>' +
      '<p>' + KridiyaAuth.escapeHTML(stage.action) + '</p>' +
      '<div class="marketing-actions">' +
        '<button type="button" class="btn btn-outline js-copy-followup" data-id="' + enq.id + '" data-kind="whatsapp">Copy WhatsApp follow-up</button>' +
        '<button type="button" class="btn btn-outline js-copy-followup" data-id="' + enq.id + '" data-kind="email">Copy email follow-up</button>' +
        '<button type="button" class="btn btn-outline js-quick-note" data-id="' + enq.id + '" data-note="Marketing follow-up: customer interested, next action required.">Interested</button>' +
        '<button type="button" class="btn btn-outline js-quick-note" data-id="' + enq.id + '" data-note="Marketing follow-up: customer not ready now, keep warm for later.">Keep warm</button>' +
        '<button type="button" class="btn btn-outline js-quick-note" data-id="' + enq.id + '" data-note="Marketing follow-up: lead lost or unresponsive.">Lost/unresponsive</button>' +
      '</div>' +
    '</div>';
  }

  function localDateTimeValue(value) {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    const pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function crmSelectOptions(options, selected, blankLabel) {
    return '<option value="">' + blankLabel + "</option>" + options.map(function (value) {
      return '<option value="' + value + '"' + (value === selected ? " selected" : "") + ">" +
        KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(value)) + "</option>";
    }).join("");
  }

  function crmFieldsHTML(enq) {
    const source = enq.last_touch_source || enq.utm_source || enq.first_touch_source || marketingSource(enq);
    const consent = enq.marketing_consent ? "Opted in" : "Not opted in";
    return '<form class="enquiry-crm-form" data-id="' + enq.id + '">' +
      '<div class="crm-field"><label>Source</label><input value="' + KridiyaAuth.escapeHTML(source || "Unknown") + '" readonly></div>' +
      '<div class="crm-field"><label>Lead temperature</label><select name="lead_temperature">' +
        crmSelectOptions(["cold", "warm", "hot"], enq.lead_temperature, "Not set") + "</select></div>" +
      '<div class="crm-field"><label>Lead score</label><input name="lead_score" type="number" min="0" max="100" value="' +
        KridiyaAuth.escapeHTML(enq.lead_score == null ? "" : String(enq.lead_score)) + '"></div>' +
      '<div class="crm-field"><label>Next action</label><input name="next_action" maxlength="500" value="' +
        KridiyaAuth.escapeHTML(enq.next_action || "") + '" placeholder="Call, revise quote, request passport…"></div>' +
      '<div class="crm-field"><label>Next action date</label><input name="next_action_at" type="datetime-local" value="' +
        localDateTimeValue(enq.next_action_at) + '"></div>' +
      '<div class="crm-field"><label>Lost reason</label><select name="lost_reason">' +
        crmSelectOptions(["price", "no_response", "dates_changed", "not_available", "booked_elsewhere", "duplicate", "invalid_enquiry", "visa_ineligible", "payment_issue", "other"], enq.lost_reason, "Not lost") + "</select></div>" +
      '<div class="crm-field"><label>Est. booking value (AED)</label><input name="estimated_booking_value" type="number" min="0" step="0.01" value="' +
        KridiyaAuth.escapeHTML(enq.estimated_booking_value == null ? "" : String(enq.estimated_booking_value)) + '"></div>' +
      '<div class="crm-field"><label>Est. gross profit (AED)</label><input name="estimated_gross_profit" type="number" step="0.01" value="' +
        KridiyaAuth.escapeHTML(enq.estimated_gross_profit == null ? "" : String(enq.estimated_gross_profit)) + '"></div>' +
      '<div class="crm-field"><label>Marketing consent</label><input value="' + consent + '" readonly></div>' +
      '<button class="btn btn-primary" type="submit">Save CRM details</button>' +
    "</form>";
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
      return '<div class="admin-notes" data-convert-for="' + enq.id + '" hidden><p class="form-note">You need create booking and edit corporate permissions to approve or convert this corporate enquiry.</p></div>';
    }
    return '<div class="admin-notes corporate-convert-panel" data-convert-for="' + enq.id + '" hidden>' +
      '<div class="corporate-approval-head"><div><b>Approve corporate portal access</b><p>After creating the user in Supabase Auth, paste the user ID here. The system activates the corporate account, links the contact, creates portal access, and opens the booking record.</p></div><span>Staff controlled</span></div>' +
      '<form class="corporate-approval-form" data-id="' + enq.id + '" onsubmit="return false">' +
        '<div class="corporate-approval-grid">' +
          '<label><span>Supabase Auth user ID</span><input name="auth_user_id" placeholder="73eebf6a-0328-48aa-ba6c-e2013ac217b5" required></label>' +
          '<label><span>Portal role</span><select name="role"><option value="travel_coordinator">Travel coordinator</option><option value="company_admin">Company admin</option><option value="finance">Finance team</option><option value="traveller">Traveller</option></select></label>' +
        '</div>' +
        '<div class="corporate-permission-grid">' +
          '<label><input type="checkbox" name="can_request" checked><span>Can submit requests</span></label>' +
          '<label><input type="checkbox" name="can_approve_quotes"><span>Can approve quotes</span></label>' +
          '<label><input type="checkbox" name="can_view_finance"><span>Can view finance</span></label>' +
          '<label><input type="checkbox" name="can_view_documents" checked><span>Can view documents</span></label>' +
        '</div>' +
        '<label class="corporate-approval-note"><span>Approval note</span><input name="notes" value="Approved corporate portal account from staff enquiries"></label>' +
        '<div class="section-actions">' +
          '<button type="submit" class="btn btn-primary approve-corporate-btn">Approve portal access</button>' +
        '</div>' +
      '</form>' +
      '<div class="section-actions corporate-booking-only">' +
        '<button type="button" class="btn btn-outline convert-corporate-btn" data-id="' + enq.id + '">Convert booking only</button>' +
      '</div>' +
    '</div>';
  }

  const QUOTE_TERMS_BY_SERVICE = {
    flight:
      "- Fares are subject to availability and may change until the ticket is issued.\n" +
      "- Full payment is required before ticketing.\n" +
      "- Date changes, cancellations and no-shows are subject to airline penalties plus service fees.\n" +
      "- Passenger names must match the passport exactly.\n" +
      "- Passport and visa requirements are the traveller's responsibility unless arranged by Kridiya Travel.",
    hotel:
      "- Rates and rooms are subject to availability until the booking is confirmed.\n" +
      "- Tourism fees, security deposits and incidental charges are payable directly unless stated as included.\n" +
      "- Check-in, cancellation, amendment and no-show rules follow the selected hotel's policy.\n" +
      "- Guest names and ages must be correct before confirmation.",
    visa:
      "- Visa approval is solely at the discretion of the relevant immigration authority.\n" +
      "- Processing time starts only after all required documents and payment are received.\n" +
      "- Government, embassy and service fees are non-refundable once processing begins.\n" +
      "- The passport must meet the destination's validity and blank-page requirements.",
    holiday:
      "- Package components are subject to availability until full payment and confirmation.\n" +
      "- Airline, hotel, transfer and activity cancellation rules apply to their respective components.\n" +
      "- Itinerary timings may change due to operational conditions.\n" +
      "- Passport and visa requirements are the traveller's responsibility unless included.",
    umrah:
      "- Package services are subject to visa, flight, hotel and transport availability.\n" +
      "- Room sharing and hotel distances are as stated in the selected option.\n" +
      "- Saudi entry, health and permit requirements must be met by every pilgrim.\n" +
      "- Changes and cancellations are subject to supplier and airline penalties.",
    cruise:
      "- Cruise fares and cabins are subject to availability until confirmed.\n" +
      "- Port fees, gratuities, beverages and shore excursions are included only when stated.\n" +
      "- Passenger names and passport details must match travel documents.\n" +
      "- Cruise line amendment, cancellation and no-show rules apply.",
    transfer:
      "- The quoted rate covers the stated route, vehicle, passenger count and luggage allowance.\n" +
      "- Waiting time, route changes, extra stops and excess luggage may incur additional charges.\n" +
      "- Flight delays must be reported promptly when flight monitoring is not included.\n" +
      "- Cancellation and no-show charges apply according to the supplier's policy.",
    insurance:
      "- Cover is subject to the insurer's policy wording, eligibility rules, limits and exclusions.\n" +
      "- Medical conditions and high-risk activities must be declared before purchase.\n" +
      "- Policy details must be checked before travel; premiums are normally non-refundable after issue.",
    other:
      "- Services are subject to supplier availability until payment and written confirmation.\n" +
      "- Amendments, cancellations and no-shows follow the stated supplier conditions.\n" +
      "- Only items listed under inclusions form part of this quotation."
  };

  function quoteTerms(service) {
    return QUOTE_TERMS_BY_SERVICE[service] || QUOTE_TERMS_BY_SERVICE.other;
  }

  function fmtQuoteDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    return isNaN(d) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  const QUOTE_ADDONS_BY_SERVICE = {
    flight: [
      { name: "Extra baggage", hint: "e.g. +10kg" },
      { name: "Seat selection", hint: "window / aisle / extra legroom" },
      { name: "Meal", hint: "special meal" },
      { name: "Travel insurance", hint: "" }
    ],
    hotel: [
      { name: "Breakfast", hint: "per room / stay" },
      { name: "Extra bed", hint: "per night" },
      { name: "Airport transfer", hint: "one way / return" },
      { name: "Early check-in / late check-out", hint: "" }
    ],
    visa: [
      { name: "Express processing", hint: "" },
      { name: "Document assistance", hint: "" },
      { name: "Travel insurance", hint: "" },
      { name: "Courier service", hint: "" }
    ],
    holiday: [
      { name: "Private transfers", hint: "" },
      { name: "Optional excursion", hint: "" },
      { name: "Extra night", hint: "" },
      { name: "Travel insurance", hint: "" }
    ],
    umrah: [
      { name: "Ziyarat tour", hint: "" },
      { name: "Private transfer", hint: "" },
      { name: "Extra night", hint: "" },
      { name: "Visa processing", hint: "" }
    ],
    cruise: [
      { name: "Beverage package", hint: "" },
      { name: "Gratuities", hint: "" },
      { name: "Shore excursion", hint: "" },
      { name: "Travel insurance", hint: "" }
    ],
    transfer: [
      { name: "Meet and greet", hint: "" },
      { name: "Child seat", hint: "" },
      { name: "Extra waiting time", hint: "" },
      { name: "Additional stop", hint: "" }
    ],
    insurance: [
      { name: "Trip cancellation cover", hint: "" },
      { name: "Adventure sports cover", hint: "" },
      { name: "Pre-existing condition cover", hint: "" },
      { name: "Policy extension", hint: "" }
    ],
    other: [
      { name: "Optional upgrade", hint: "" },
      { name: "Priority service", hint: "" },
      { name: "Delivery / courier", hint: "" },
      { name: "Additional support", hint: "" }
    ]
  };

  function quoteAddons(service) {
    return QUOTE_ADDONS_BY_SERVICE[service] || QUOTE_ADDONS_BY_SERVICE.other;
  }

  /* The tick-box add-on grid shown inside the quote form. */
  function quoteAddonFields(service) {
    return '<fieldset class="qf-addons">' +
      '<legend>Optional add-ons</legend>' +
      quoteAddons(service).map(function (a) {
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
    const list = sortQuoteOptions(quotesByEnquiry[enq.id] || []);
    if (!list.length) return "";
    const name = enq.full_name ? enq.full_name.split(" ")[0] : "there";
    const out = [];
    out.push("Hello " + name + ", thank you for choosing Kridiya Travel and Tourism. ✈️");
    out.push("");
    out.push("Here " + (list.length > 1 ? "are your options" : "is your quote") + ":");
    list.forEach(function (q, i) {
      out.push("");
      out.push("*" + numberedQuoteTitle(q.title, i) + "*");
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
      out.push("Price: " + fmtMoney(q.price_amount, q.currency) + " " + quotePriceBasis(enq.service_type));
      const adds = Array.isArray(q.addons) ? q.addons : [];
      if (adds.length) {
        out.push("Optional add-ons:");
        adds.forEach(function (a) { out.push("  + " + a.name + (a.price != null ? " (" + fmtMoney(a.price, q.currency) + ")" : "")); });
      }
    });
    out.push("");
    out.push("*Terms & Conditions:*");
    ((list[0] && list[0].terms) ? list[0].terms : quoteTerms(enq.service_type)).split("\n").forEach(function (t) {
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
      { n: "h_category", label: "Category", t: "select", ph: "Hotel category…", opts: ["3 star", "4 star", "5 star", "Hotel apartment", "Resort"] },
      { n: "h_checkin", label: "Check-in", t: "date" },
      { n: "h_checkout", label: "Check-out", t: "date" },
      { n: "h_room", label: "Room type", t: "text", ph: "Room type — e.g. Deluxe Double" },
      { n: "h_rooms", label: "Rooms", t: "text", ph: "Rooms — e.g. 1 room" },
      { n: "h_meal", label: "Meal plan", t: "select", opts: ["Room only", "Breakfast included", "Half board", "Full board", "All inclusive"] },
      { n: "h_guests", label: "Guests", t: "text", ph: "Guests — e.g. 2 adults, 1 child" },
      { n: "h_policy", label: "Rate conditions", t: "select", ph: "Rate conditions…", opts: ["Refundable", "Partially refundable", "Non-refundable", "Pay at hotel"] }
    ],
    holiday: [
      { n: "ho_dest", label: "Destination", t: "text", ph: "Destination — e.g. Bali, Indonesia", wide: true },
      { n: "ho_from", label: "Travel start", t: "date" },
      { n: "ho_to", label: "Travel end", t: "date" },
      { n: "ho_duration", label: "Duration", t: "text", ph: "Duration — e.g. 5 nights / 6 days" },
      { n: "ho_flights", label: "Flights", t: "text", ph: "Flights — airline / routing", wide: true },
      { n: "ho_hotels", label: "Hotel(s)", t: "text", ph: "Hotel(s)", wide: true },
      { n: "ho_room", label: "Room / meal plan", t: "text", ph: "Room and meal plan" },
      { n: "ho_transfer", label: "Transfers", t: "select", ph: "Transfers…", opts: ["Not included", "Shared return transfer", "Private return transfer"] },
      { n: "ho_incl", label: "Inclusions", t: "text", ph: "Tours, activities and other inclusions", wide: true },
      { n: "ho_trav", label: "Travellers", t: "text", ph: "Travellers — e.g. 2 adults, 1 child", wide: true }
    ],
    umrah: [
      { n: "um_from", label: "Departure city", t: "text", ph: "Departure city — e.g. Dubai" },
      { n: "um_transport", label: "Transport", t: "select", opts: ["Flight", "Bus", "Flight + Bus"] },
      { n: "um_start", label: "Travel start", t: "date" },
      { n: "um_end", label: "Travel end", t: "date" },
      { n: "um_makkah", label: "Hotel — Makkah", t: "text", ph: "Hotel — Makkah" },
      { n: "um_makkah_nights", label: "Makkah nights", t: "text", ph: "e.g. 7 nights" },
      { n: "um_madinah", label: "Hotel — Madinah", t: "text", ph: "Hotel — Madinah" },
      { n: "um_madinah_nights", label: "Madinah nights", t: "text", ph: "e.g. 5 nights" },
      { n: "um_room", label: "Room type", t: "select", opts: ["Quad sharing", "Triple sharing", "Double", "Single"] },
      { n: "um_meal", label: "Meal plan", t: "select", ph: "Meal plan…", opts: ["Room only", "Breakfast", "Half board", "Full board"] },
      { n: "um_visa", label: "Umrah visa", t: "select", ph: "Visa…", opts: ["Included", "Not included", "Not required"] },
      { n: "um_pax", label: "Pilgrims", t: "text", ph: "Pilgrims — e.g. 2 adults", wide: true }
    ],
    cruise: [
      { n: "cr_line", label: "Cruise line", t: "text", ph: "Cruise line — e.g. MSC Cruises" },
      { n: "cr_ship", label: "Ship", t: "text", ph: "Ship name" },
      { n: "cr_sail", label: "Sailing date", t: "date" },
      { n: "cr_nights", label: "Duration", t: "text", ph: "Duration — e.g. 5 nights" },
      { n: "cr_cabin", label: "Cabin type", t: "select", opts: ["Interior", "Ocean view", "Balcony", "Suite"] },
      { n: "cr_cabin_detail", label: "Cabin details", t: "text", ph: "Deck / occupancy / cabin category" },
      { n: "cr_itin", label: "Itinerary", t: "text", ph: "Itinerary / ports", wide: true },
      { n: "cr_dining", label: "Dining", t: "select", ph: "Dining…", opts: ["Included", "Dining package included", "Not included"] },
      { n: "cr_fees", label: "Taxes / port fees", t: "select", ph: "Taxes and fees…", opts: ["Included", "Not included"] },
      { n: "cr_guests", label: "Guests", t: "text", ph: "Guests — e.g. 2 adults", wide: true }
    ],
    transfer: [
      { n: "tr_type", label: "Transfer type", t: "select", opts: ["Airport pickup", "Airport drop-off", "Round trip", "Point to point", "Hourly / disposal"] },
      { n: "tr_from", label: "From", t: "text", ph: "From — pickup location", wide: true },
      { n: "tr_to", label: "To", t: "text", ph: "To — drop-off location", wide: true },
      { n: "tr_date", label: "Date", t: "date" },
      { n: "tr_time", label: "Pickup time", t: "text", ph: "Pickup time (optional)" },
      { n: "tr_flight", label: "Flight number", t: "text", ph: "Flight number (if applicable)" },
      { n: "tr_vehicle", label: "Vehicle", t: "select", opts: ["Sedan", "SUV", "Van", "Minibus", "Luxury / limousine"] },
      { n: "tr_pax", label: "Passengers", t: "text", ph: "Passengers — e.g. 3" },
      { n: "tr_luggage", label: "Luggage", t: "text", ph: "Luggage — e.g. 3 large bags" },
      { n: "tr_wait", label: "Included waiting", t: "text", ph: "e.g. 60 minutes" }
    ],
    insurance: [
      { n: "in_plan", label: "Plan", t: "text", ph: "Plan — e.g. Schengen Travel Insurance", wide: true },
      { n: "in_provider", label: "Insurer", t: "text", ph: "Insurer" },
      { n: "in_coverage", label: "Coverage", t: "text", ph: "Coverage — e.g. €30,000 medical" },
      { n: "in_area", label: "Area of cover", t: "text", ph: "Area — e.g. Worldwide / Schengen" },
      { n: "in_from", label: "Cover start", t: "date" },
      { n: "in_to", label: "Cover end", t: "date" },
      { n: "in_excess", label: "Policy excess", t: "text", ph: "Excess — e.g. AED 250" },
      { n: "in_benefits", label: "Key benefits", t: "text", ph: "Medical, baggage, delay, cancellation…", wide: true },
      { n: "in_pax", label: "Insured persons", t: "text", ph: "Insured — e.g. 2 adults", wide: true }
    ],
    other: [
      { n: "ot_service", label: "Service", t: "text", ph: "Service name", wide: true },
      { n: "ot_provider", label: "Supplier", t: "text", ph: "Supplier / provider" },
      { n: "ot_date", label: "Service date", t: "date" },
      { n: "ot_details", label: "Details", t: "text", ph: "Exact service details", wide: true },
      { n: "ot_inclusions", label: "Inclusions", t: "text", ph: "What is included", wide: true },
      { n: "ot_basis", label: "Price basis", t: "text", ph: "Per person / group / service" }
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

  /* Precise, service-aware example for the "Option label" placeholder. */
  const QUOTE_TITLE_EG = {
    flight: "Air Arabia",
    hotel: "Hilton Dubai",
    visa: "UAE 30-day tourist visa",
    holiday: "Bali, 5 nights",
    umrah: "14-night Umrah package",
    cruise: "MSC, 5 nights",
    transfer: "Dubai Airport pickup",
    insurance: "Schengen travel cover",
    other: "Service or supplier name"
  };
  function quoteTitlePlaceholder(service) {
    return "Option name — e.g. " + (QUOTE_TITLE_EG[service] || QUOTE_TITLE_EG.other);
  }
  /* Service-aware price hint. */
  const QUOTE_PRICE_EG = {
    flight: "Fare / person",
    hotel: "Price / room",
    visa: "Price / applicant",
    holiday: "Price / person",
    umrah: "Price / person",
    cruise: "Price / person",
    transfer: "Price / trip",
    insurance: "Price / person",
    other: "Total price"
  };
  function quotePricePlaceholder(service) {
    return QUOTE_PRICE_EG[service] || "Price";
  }
  const QUOTE_PRICE_BASIS = {
    flight: "per person",
    hotel: "per room",
    visa: "per applicant",
    holiday: "per person",
    umrah: "per person",
    cruise: "per person",
    transfer: "per trip",
    insurance: "per person",
    other: "total"
  };
  function quotePriceBasis(service) {
    return QUOTE_PRICE_BASIS[service] || QUOTE_PRICE_BASIS.other;
  }

  /* Service-specific fields for the quote form. Bespoke builders for flight
     (default) and visa; the rest are config-driven from QUOTE_SERVICE_FIELDS. */
  function quoteServiceFields(enq) {
    const st = enq.service_type || "";
    if (st === "visa") {
      return "" +
        '<input class="qf qf-wide" name="v_country" type="text" placeholder="Country — e.g. United Arab Emirates">' +
        '<input class="qf" name="v_nationality" type="text" placeholder="Applicant nationality">' +
        '<input class="qf" name="v_type" type="text" placeholder="Visa type — e.g. Tourist 30 days">' +
        '<select class="qf" name="v_entries"><option value="">Entries…</option><option value="Single entry">Single entry</option><option value="Multiple entry">Multiple entry</option></select>' +
        '<input class="qf" name="v_validity" type="text" placeholder="Validity — e.g. 60 days">' +
        '<input class="qf" name="v_processing" type="text" placeholder="Processing — e.g. 3–4 working days">' +
        '<input class="qf qf-wide" name="v_inclusions" type="text" placeholder="Included — government fee, insurance, assistance…">';
    }
    if (QUOTE_SERVICE_FIELDS[st]) return buildServiceFields(QUOTE_SERVICE_FIELDS[st]);
    return "" +
      '<input class="qf" name="airline" type="text" placeholder="Airline — e.g. Air Arabia">' +
      '<select class="qf" name="stops"><option value="">Stops…</option><option value="Direct">Direct</option><option value="1 stop">1 stop</option><option value="2 stops">2 stops</option></select>' +
      '<input class="qf" name="flight_number" type="text" placeholder="Flight number(s)">' +
      '<select class="qf" name="cabin"><option value="">Cabin…</option><option value="Economy">Economy</option><option value="Premium economy">Premium economy</option><option value="Business">Business</option><option value="First">First</option></select>' +
      '<select class="qf qf-wide" name="fare_type"><option value="">Fare conditions…</option><option value="Refundable">Refundable</option><option value="Partially refundable">Partially refundable</option><option value="Non-refundable">Non-refundable</option><option value="Changeable with fee">Changeable with fee</option></select>' +
      '<span class="ac-wrap qf-wide"><input class="qf" name="from" type="text" placeholder="From — type city or airport (e.g. Dubai)" data-airport></span>' +
      '<span class="ac-wrap qf-wide"><input class="qf" name="to" type="text" placeholder="To — type city or airport (e.g. Colombo)" data-airport></span>' +
      '<label class="qf-date"><span class="qf-cap">Onward date</span><input class="qf" name="depart_date" type="date"></label>' +
      '<label class="qf-date"><span class="qf-cap">Return date</span><input class="qf" name="return_date" type="date"></label>' +
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
      put("Applicant nationality", form.v_nationality.value);
      put("Visa type", form.v_type.value);
      put("Entries", form.v_entries.value);
      put("Validity", form.v_validity.value);
      put("Processing", form.v_processing.value);
      put("Included", form.v_inclusions.value);
      return d;
    }
    if (QUOTE_SERVICE_FIELDS[st]) return gatherServiceData(form, QUOTE_SERVICE_FIELDS[st]);
    const airline = form.airline.value.trim();
    const stops = form.stops.value;
    if (airline) d["Airline"] = airline + (stops ? " (" + stops + ")" : "");
    else if (stops) d["Type"] = stops;
    put("Flight number", form.flight_number.value);
    put("Cabin", form.cabin.value);
    put("Fare conditions", form.fare_type.value);
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

  function gatherQuoteFormOption(form, optionIndex) {
    const title = form.title.value.trim();
    const price = parseFloat(form.price_amount.value);
    if (!title) {
      form.title.setCustomValidity("Enter the airline, hotel, package or option name.");
      form.title.reportValidity();
      form.title.setCustomValidity("");
      return null;
    }
    if (!(price >= 0)) {
      form.price_amount.setCustomValidity("Enter a valid price.");
      form.price_amount.reportValidity();
      form.price_amount.setCustomValidity("");
      return null;
    }
    const currency = (form.currency.value || "AED").trim().toUpperCase();
    const validUntil = form.valid_until.value ? new Date(form.valid_until.value).toISOString() : null;
    return {
      title: numberedQuoteTitle(title, optionIndex),
      option_data: gatherOptionData(form),
      addons: gatherAddons(form),
      price_amount: price,
      currency: currency,
      valid_until: validUntil,
      terms: form.terms.value.trim() || null
    };
  }

  function quoteFormHasOption(form) {
    return Boolean(form.title.value.trim() || form.price_amount.value.trim());
  }

  function resetQuoteForm(form) {
    form.reset();
    form.querySelectorAll(".addon-price").forEach(function (price) {
      price.value = "";
      price.disabled = true;
    });
    form.title.focus();
  }

  function reopenQuotePanel(listEl, enquiryId) {
    const row = listEl.querySelector('.admin-enq[data-id="' + enquiryId + '"]');
    if (row) row.classList.add("expanded");
    const panel = listEl.querySelector('.admin-notes[data-quotes-for="' + enquiryId + '"]');
    if (panel) panel.hidden = false;
  }

  function quoteDraftsHTML(drafts, enquiryId) {
    if (!drafts.length) return "";
    return '<div class="quote-draft-list"><div class="quote-draft-heading"><b>Options ready to save</b><span>' +
      drafts.length + " draft" + (drafts.length === 1 ? "" : "s") + "</span></div>" +
      sortQuoteOptions(drafts).map(function (draft, index) {
        return '<div class="quote-draft-row">' +
          '<span class="quote-draft-number">' + (index + 1) + "</span>" +
          '<div><b>' + KridiyaAuth.escapeHTML(numberedQuoteTitle(draft.title, index)) + '</b><small>' +
            fmtMoney(draft.price_amount, draft.currency) + "</small></div>" +
          '<button type="button" class="quote-remove js-remove-quote-draft" data-index="' + drafts.indexOf(draft) +
            '" data-enq="' + enquiryId +
            '" title="Remove this draft option" aria-label="Remove draft option">×</button>' +
        "</div>";
      }).join("") +
    "</div>";
  }

  function matchesFilters(enq) {
    const statusF = document.getElementById("flt-status").value;
    const serviceF = document.getElementById("flt-service").value;
    const attentionF = document.getElementById("flt-attention").value;
    const searchF = (document.getElementById("flt-search").value || "").trim().toLowerCase();
    const todayOnly = document.getElementById("flt-today").checked;
    if (statusF && enq.status !== statusF) return false;
    if (serviceF && enq.service_type !== serviceF) return false;
    if (todayOnly && new Date(enq.created_at).toDateString() !== new Date().toDateString()) return false;
    if (focusEmail && String(enq.email || "").trim().toLowerCase() !== focusEmail) return false;
    if (attentionF && !attentionMatch(enq, attentionF)) return false;
    if (searchF && searchable(enq).indexOf(searchF) === -1) return false;
    return true;
  }
  function searchable(enq) {
    return [enq.full_name, enq.email, enq.phone, enq.reference, enq.summary, enq.service_type].join(" ").toLowerCase();
  }
  function isStale(enq) {
    if (["confirmed", "booked", "documents_sent", "closed"].indexOf(enq.status) !== -1) return false;
    const ageHours = (Date.now() - new Date(enq.created_at).getTime()) / 36e5;
    return ageHours >= 24 && !(quotesByEnquiry[enq.id] || []).length && !bookingByEnquiry[enq.id];
  }
  function needsQuote(enq) {
    return ["received", "checking_availability"].indexOf(enq.status) !== -1 && !bookingByEnquiry[enq.id];
  }
  function needsFollowUp(enq) {
    return ["quote_sent", "payment_pending"].indexOf(enq.status) !== -1 && !bookingByEnquiry[enq.id];
  }
  function attentionMatch(enq, type) {
    if (type === "needs_quote") return needsQuote(enq);
    if (type === "follow_up") return needsFollowUp(enq);
    if (type === "corporate") return isCorporateEnquiry(enq);
    if (type === "converted") return !!bookingByEnquiry[enq.id];
    if (type === "stale") return isStale(enq);
    return true;
  }

  function attentionRank(enq) {
    if (isStale(enq)) return 0;
    if (needsQuote(enq)) return 1;
    if (needsFollowUp(enq)) return 2;
    if (isCorporateEnquiry(enq)) return 3;
    if (bookingByEnquiry[enq.id]) return 5;
    return 4;
  }

  function enquiryTime(enq) {
    const t = new Date(enq.created_at || 0).getTime();
    return isNaN(t) ? 0 : t;
  }

  function sortEnquiries(rows) {
    return rows.slice().sort(function (a, b) {
      if (activeSort === "created_asc") return enquiryTime(a) - enquiryTime(b);
      if (activeSort === "name_asc") return String(a.full_name || a.email || "").localeCompare(String(b.full_name || b.email || ""));
      if (activeSort === "status_asc") return String(a.status || "").localeCompare(String(b.status || "")) || enquiryTime(b) - enquiryTime(a);
      if (activeSort === "attention_first") return attentionRank(a) - attentionRank(b) || enquiryTime(b) - enquiryTime(a);
      return enquiryTime(b) - enquiryTime(a);
    });
  }

  function syncSortMenu() {
    const wrap = document.getElementById("admin-sort");
    if (!wrap) return;
    const active = wrap.querySelector('[data-sort="' + activeSort + '"]') || wrap.querySelector("[data-sort]");
    wrap.querySelectorAll(".booking-sort-item").forEach(function (btn) {
      const on = btn === active;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-checked", String(on));
    });
    const label = active && active.querySelector("b");
    const text = document.querySelector("#admin-sort-btn b");
    if (label && text) text.textContent = label.textContent;
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
    const visible = sortEnquiries(allEnquiries.filter(matchesFilters));
    syncSortMenu();
    renderCrmControl(visible);
    const countEl = document.getElementById("admin-count");
    if (focusEmail) {
      countEl.innerHTML = "Showing <b>" + KridiyaAuth.escapeHTML(focusEmail) + "</b> · " + visible.length +
        ' of ' + allEnquiries.length + ' — <a href="admin.html">show all</a>';
    } else {
      countEl.textContent = visible.length + " of " + allEnquiries.length + " enquiries";
    }

    if (!visible.length) {
      listEl.innerHTML = '<div class="account-main empty-state"><p>No enquiries match' +
        (focusEmail ? ' for <b>' + KridiyaAuth.escapeHTML(focusEmail) + '</b>. <a href="admin.html">Show all</a>' : ' these filters.') + "</p></div>";
      return;
    }

    listEl.innerHTML = visible.map(function (enq) {
      const created = new Date(enq.created_at);
      const notes = notesByEnquiry[enq.id] || [];
      const requests = requestsByEnquiry[enq.id] || [];
      const quotes = sortQuoteOptions(quotesByEnquiry[enq.id] || []);
      const quoteDrafts = quoteDraftsByEnquiry[enq.id] || [];
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
          marketingFollowUp(enq, notes, quotes, booking) +
          crmFieldsHTML(enq) +
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
            '<a class="btn btn-outline" href="customers.html?email=' + encodeURIComponent(enq.email || "") + '">' + icon("user") + " Customer</a>" +
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
                ? quotes.map(function (q, i) {
                    const adds = Array.isArray(q.addons) ? q.addons : [];
                    const od = (q.option_data && typeof q.option_data === "object") ? q.option_data : {};
                    const odLines = Object.keys(od).map(function (k) { return od[k] ? '<p class="quote-line">' + KridiyaAuth.escapeHTML(k) + ": " + KridiyaAuth.escapeHTML(String(od[k])) + "</p>" : ""; }).join("");
                    const legacy = ((q.airline || q.stops) ? '<p class="quote-line">' + KridiyaAuth.escapeHTML([q.airline, q.stops].filter(Boolean).join(" · ")) + "</p>" : "") +
                      (q.outbound ? '<p class="quote-line">Onward: ' + KridiyaAuth.escapeHTML(q.outbound) + "</p>" : "") +
                      (q.inbound ? '<p class="quote-line">Return: ' + KridiyaAuth.escapeHTML(q.inbound) + "</p>" : "") +
                      (q.baggage ? '<p class="quote-line">Baggage: ' + KridiyaAuth.escapeHTML(q.baggage) + "</p>" : "");
                    return '<div class="admin-note quote-option">' +
                      '<p class="quote-option-head"><b>' + KridiyaAuth.escapeHTML(numberedQuoteTitle(q.title, i)) + "</b> — " + fmtMoney(q.price_amount, q.currency) + " " + quotePriceBasis(enq.service_type) + ' <span class="admin-badge">' + KridiyaAuth.statusLabel(q.status) + "</span>" +
                        '<button type="button" class="quote-remove js-remove-quote" data-id="' + q.id + '" data-enq="' + enq.id + '" title="Remove this option" aria-label="Remove option">×</button></p>' +
                      (odLines || legacy) +
                      (adds.length ? '<div class="ops-kv">' + adds.map(function (a) { return '<span class="ops-chip">+ ' + KridiyaAuth.escapeHTML(a.name) + (a.price != null ? " " + fmtMoney(a.price, q.currency) : "") + "</span>"; }).join("") + "</div>" : "") +
                      (q.valid_until ? '<p class="form-note" style="margin:0.2rem 0 0">Valid until ' + fmtWhen(q.valid_until) + "</p>" : "") +
                      "</div>";
                  }).join("")
                : '<p class="form-note">No saved quote yet. Build one or more options below, then save the complete quote.</p>') +
            "</div>" +
            quoteDraftsHTML(quoteDrafts, enq.id) +
            '<form class="admin-quote-form pro-quote-form" data-id="' + enq.id + '" data-service="' + KridiyaAuth.escapeHTML(enq.service_type || "") + '" novalidate>' +
              '<div class="quote-builder-head"><div><b>Build quote options</b><span>Add each supplier or package, then save once.</span></div><span class="quote-option-step">Option ' + (quoteDrafts.length + 1) + "</span></div>" +
              '<div class="qf-grid">' +
                '<input class="qf qf-wide" name="title" type="text" placeholder="' + KridiyaAuth.escapeHTML(quoteTitlePlaceholder(enq.service_type || "")) + '" required>' +
                quoteServiceFields(enq) +
                '<input class="qf" name="price_amount" type="number" min="0" step="0.01" placeholder="' + KridiyaAuth.escapeHTML(quotePricePlaceholder(enq.service_type || "")) + '" required>' +
                '<input class="qf" name="currency" type="text" value="AED" maxlength="3">' +
                '<input class="qf qf-wide" name="valid_until" type="datetime-local" title="Quote valid until">' +
              "</div>" +
              quoteAddonFields(enq.service_type || "") +
              '<label class="qf-terms-label" for="quote-terms-' + enq.id + '">Terms and conditions</label>' +
              '<textarea class="qf qf-area" id="quote-terms-' + enq.id + '" name="terms">' + KridiyaAuth.escapeHTML(quoteTerms(enq.service_type || "")) + "</textarea>" +
              '<div class="quote-builder-actions">' +
                '<button class="btn btn-outline js-add-quote-option" type="button">+ Add another option</button>' +
                '<button class="btn btn-primary" type="submit">Save quote</button>' +
              "</div>" +
            "</form>" +
          "</div>" +
          (booking ? "" : convertPanel(enq)) +
          "</div>" +
        "</div>"
      );
    }).join("");
    if (typeof initAirportAC === "function") initAirportAC(listEl);
  }

  function renderCrmControl(visible) {
    const panel = document.getElementById("crm-control-panel");
    if (!panel) return;
    const total = allEnquiries.length || 1;
    const converted = allEnquiries.filter(function (e) { return !!bookingByEnquiry[e.id]; }).length;
    const stale = visible.filter(isStale).length;
    const quoteQueue = visible.filter(needsQuote).length;
    const followUp = visible.filter(needsFollowUp).length;
    const corporate = visible.filter(isCorporateEnquiry).length;
    const conversion = Math.round((converted / total) * 100);
    let next = "Review new enquiries and send quotes.";
    let filter = "needs_quote";
    if (stale) { next = "Follow up stale enquiries older than 24 hours."; filter = "stale"; }
    else if (followUp) { next = "Follow up quotes and payment-pending enquiries."; filter = "follow_up"; }
    else if (corporate) { next = "Review corporate leads and convert where ready."; filter = "corporate"; }
    panel.innerHTML =
      '<div class="crm-summary"><div><b>' + esc(conversion) + '%</b><span>Conversion visibility</span><p>' + esc(converted) + ' converted / ' + esc(allEnquiries.length) + ' total enquiries</p></div><button class="btn btn-primary js-crm-filter" data-filter="' + esc(filter) + '" type="button">Show next queue</button></div>' +
      '<div class="crm-metric-grid">' +
        '<div><b>' + esc(quoteQueue) + '</b><span>Needs quote</span></div>' +
        '<div><b>' + esc(followUp) + '</b><span>Follow-up</span></div>' +
        '<div><b>' + esc(corporate) + '</b><span>Corporate</span></div>' +
        '<div><b>' + esc(stale) + '</b><span>Stale</span></div>' +
      '</div>' +
      '<div class="crm-next"><b>Next sales action</b><span>' + esc(next) + '</span></div>';
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
    ["flt-status", "flt-service", "flt-attention", "flt-today"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", renderList);
    });
    document.getElementById("flt-search").addEventListener("input", renderList);
    const sortBtn = document.getElementById("admin-sort-btn");
    const sortMenu = document.getElementById("admin-sort-menu");
    if (sortBtn && sortMenu) {
      sortBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const open = sortMenu.hidden;
        sortMenu.hidden = !open;
        sortBtn.setAttribute("aria-expanded", String(open));
      });
      sortMenu.addEventListener("click", function (e) {
        const btn = e.target.closest(".booking-sort-item");
        if (!btn) return;
        activeSort = btn.dataset.sort || "created_desc";
        sortMenu.hidden = true;
        sortBtn.setAttribute("aria-expanded", "false");
        renderList();
      });
      document.addEventListener("click", function (e) {
        if (!sortMenu.hidden && !document.getElementById("admin-sort").contains(e.target)) {
          sortMenu.hidden = true;
          sortBtn.setAttribute("aria-expanded", "false");
        }
      });
    }

    const listEl = document.getElementById("admin-list");
    const crmPanel = document.getElementById("crm-control-panel");
    if (crmPanel) {
      crmPanel.addEventListener("click", function (e) {
        const crmFilter = e.target.closest(".js-crm-filter");
        if (!crmFilter) return;
        document.getElementById("flt-attention").value = crmFilter.dataset.filter || "";
        renderList();
      });
    }

    listEl.addEventListener("change", async function (e) {
      if (!e.target.classList.contains("status-select")) return;
      const select = e.target;
      const id = select.dataset.id;
      const newStatus = select.value;
      const row = allEnquiries.find(function (r) { return r.id === id; });
      const statusUpdate = { status: newStatus };
      const now = new Date().toISOString();
      if (newStatus === "checking_availability" && row && !row.first_response_at) {
        statusUpdate.first_response_at = now;
        statusUpdate.qualified_at = row.qualified_at || now;
      }
      if (newStatus === "quote_sent" && row && !row.quote_sent_at) statusUpdate.quote_sent_at = now;
      if ((newStatus === "confirmed" || newStatus === "booked") && row && !row.booking_confirmed_at) {
        statusUpdate.booking_confirmed_at = now;
      }
      select.disabled = true;
      let result = await sb.from("enquiries").update(statusUpdate).eq("id", id);
      if (result.error && (result.error.code === "PGRST204" || result.error.code === "42703")) {
        result = await sb.from("enquiries").update({ status: newStatus }).eq("id", id);
      }
      select.disabled = false;
      if (result.error) {
        toast("Could not update status: " + result.error.message);
        return;
      }
      const prevStatus = row ? row.status : null;
      if (row) Object.assign(row, statusUpdate);
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
      const addQuoteOptionBtn = e.target.closest(".js-add-quote-option");
      if (addQuoteOptionBtn) {
        const quoteForm = addQuoteOptionBtn.closest(".admin-quote-form");
        const enquiryId = quoteForm.dataset.id;
        const drafts = quoteDraftsByEnquiry[enquiryId] || [];
        const draft = gatherQuoteFormOption(quoteForm, drafts.length);
        if (!draft) return;
        if (!quoteDraftsByEnquiry[enquiryId]) quoteDraftsByEnquiry[enquiryId] = [];
        quoteDraftsByEnquiry[enquiryId].push(draft);
        resetQuoteForm(quoteForm);
        renderList();
        reopenQuotePanel(listEl, enquiryId);
        toast("Option added. Add another option or save the quote.");
        return;
      }
      const removeQuoteDraftBtn = e.target.closest(".js-remove-quote-draft");
      if (removeQuoteDraftBtn) {
        const enquiryId = removeQuoteDraftBtn.dataset.enq;
        const draftIndex = Number(removeQuoteDraftBtn.dataset.index);
        if (quoteDraftsByEnquiry[enquiryId] && Number.isInteger(draftIndex)) {
          quoteDraftsByEnquiry[enquiryId].splice(draftIndex, 1);
        }
        renderList();
        reopenQuotePanel(listEl, enquiryId);
        toast("Draft option removed.");
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
      const followBtn = e.target.closest(".js-copy-followup");
      if (followBtn) {
        const id = followBtn.dataset.id;
        const enq = allEnquiries.find(function (r) { return r.id === id; });
        if (!enq) return;
        const text = followUpText(enq, quotesByEnquiry[id] || [], followBtn.dataset.kind);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () { toast("Follow-up copied."); },
            function () { toast("Could not copy automatically."); }
          );
        } else {
          toast("Copy not supported on this browser.");
        }
        return;
      }
      const quickNoteBtn = e.target.closest(".js-quick-note");
      if (quickNoteBtn) {
        await saveQuickMarketingNote(quickNoteBtn);
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
      const form = e.target.closest(".enquiry-crm-form");
      if (!form) return;
      e.preventDefault();
      const id = form.dataset.id;
      const valueOrNull = function (name) {
        const value = String(form.elements[name].value || "").trim();
        return value || null;
      };
      const numberOrNull = function (name) {
        const value = valueOrNull(name);
        return value === null ? null : Number(value);
      };
      const localNextAction = valueOrNull("next_action_at");
      const update = {
        lead_temperature: valueOrNull("lead_temperature"),
        lead_score: numberOrNull("lead_score"),
        next_action: valueOrNull("next_action"),
        next_action_at: localNextAction ? new Date(localNextAction).toISOString() : null,
        lost_reason: valueOrNull("lost_reason"),
        estimated_booking_value: numberOrNull("estimated_booking_value"),
        estimated_gross_profit: numberOrNull("estimated_gross_profit")
      };
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      const result = await sb.from("enquiries").update(update).eq("id", id).select("*").single();
      btn.disabled = false;
      if (result.error) {
        toast("Could not save CRM details: " + result.error.message);
        return;
      }
      const rowIndex = allEnquiries.findIndex(function (row) { return row.id === id; });
      if (rowIndex !== -1) allEnquiries[rowIndex] = result.data;
      logActivity(sb, currentStaffId, "enquiry.crm_updated", "enquiry", id, update);
      renderList();
      toast("CRM details saved.");
    });

    listEl.addEventListener("submit", async function (e) {
      const form = e.target.closest(".corporate-approval-form");
      if (!form) return;
      e.preventDefault();
      await approveCorporateApplication(form);
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
      const drafts = (quoteDraftsByEnquiry[id] || []).slice();
      if (quoteFormHasOption(form) || !drafts.length) {
        const currentOption = gatherQuoteFormOption(form, drafts.length);
        if (!currentOption) return;
        drafts.push(currentOption);
      }
      const sortedOptions = sortQuoteOptions(drafts).map(function (option, index) {
        return {
          enquiry_id: id,
          title: numberedQuoteTitle(option.title, index),
          option_data: option.option_data,
          addons: option.addons,
          price_amount: option.price_amount,
          currency: option.currency,
          valid_until: option.valid_until,
          terms: option.terms,
          created_by: currentStaffId
        };
      });
      const btn = form.querySelector('button[type="submit"]');
      const addBtn = form.querySelector(".js-add-quote-option");
      btn.disabled = true;
      if (addBtn) addBtn.disabled = true;
      const result = await sb
        .from("quotes")
        .insert(sortedOptions)
        .select("*");
      btn.disabled = false;
      if (addBtn) addBtn.disabled = false;
      if (result.error) {
        toast("Could not save quote: " + result.error.message);
        return;
      }
      if (!quotesByEnquiry[id]) quotesByEnquiry[id] = [];
      quotesByEnquiry[id] = sortQuoteOptions(quotesByEnquiry[id].concat(result.data || []));
      const quoteTimestamp = new Date().toISOString();
      let enquiryUpdate = await sb.from("enquiries")
        .update({ status: "quote_sent", quote_sent_at: quoteTimestamp })
        .eq("id", id);
      if (enquiryUpdate.error && (enquiryUpdate.error.code === "PGRST204" || enquiryUpdate.error.code === "42703")) {
        enquiryUpdate = await sb.from("enquiries").update({ status: "quote_sent" }).eq("id", id);
      }
      const quoteEnq = allEnquiries.find(function (r) { return r.id === id; });
      if (!enquiryUpdate.error && quoteEnq) {
        quoteEnq.status = "quote_sent";
        quoteEnq.quote_sent_at = quoteTimestamp;
      }
      delete quoteDraftsByEnquiry[id];
      renderList();
      reopenQuotePanel(listEl, id);
      logActivity(sb, currentStaffId, "enquiry.quote_sent", "enquiry", id, {
        reference: quoteEnq ? quoteEnq.reference : null,
        options: sortedOptions.length,
        lowest_amount: sortedOptions[0].price_amount,
        currency: sortedOptions[0].currency
      });
      toast(sortedOptions.length + " quote option" + (sortedOptions.length === 1 ? "" : "s") + " saved, lowest price first.");
    });
  }

  async function saveQuickMarketingNote(btn) {
    const id = btn.dataset.id;
    const note = btn.dataset.note || "";
    if (!id || !note) return;
    btn.disabled = true;
    const result = await sb
      .from("enquiry_notes")
      .insert({ enquiry_id: id, note: note, created_by: currentStaffId })
      .select("id, enquiry_id, note, created_at")
      .single();
    btn.disabled = false;
    if (result.error) {
      toast("Could not save outcome: " + result.error.message);
      return;
    }
    if (!notesByEnquiry[id]) notesByEnquiry[id] = [];
    notesByEnquiry[id].unshift(result.data);
    renderList();
    const enq = allEnquiries.find(function (r) { return r.id === id; });
    logActivity(sb, currentStaffId, "enquiry.marketing_outcome_added", "enquiry", id, { reference: enq ? enq.reference : null, note: note });
    toast("Marketing outcome saved.");
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

  async function approveCorporateApplication(form) {
    const id = form.dataset.id;
    const enq = allEnquiries.find(function (r) { return r.id === id; });
    if (!enq) return;
    const companyName = detail(enq, "Company_name") || enq.full_name || "this company";
    const authUserId = (form.auth_user_id.value || "").trim();
    if (!authUserId) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authUserId)) {
      toast("That does not look like a valid Auth user ID.");
      form.auth_user_id.focus();
      return;
    }
    if (!confirm("Approve " + companyName + " and activate corporate portal access now?")) return;

    const btn = form.querySelector(".approve-corporate-btn");
    btn.disabled = true;
    btn.textContent = "Approving...";
    try {
      const result = await sb.rpc("approve_corporate_application", {
        p_enquiry_id: id,
        p_auth_user_id: authUserId,
        p_role: form.role.value || "travel_coordinator",
        p_can_request: form.can_request.checked,
        p_can_approve_quotes: form.can_approve_quotes.checked,
        p_can_view_finance: form.can_view_finance.checked,
        p_can_view_documents: form.can_view_documents.checked,
        p_notes: form.notes.value || "Approved corporate portal account from staff enquiries"
      });
      if (result.error) throw result.error;
      const data = result.data || {};
      logActivity(sb, currentStaffId, "corporate.application_approved", "corporate_account", data.corporate_account_id || null, {
        reference: enq.reference,
        company_name: companyName,
        booking_id: data.booking_id || null,
        portal_member_id: data.corporate_portal_member_id || null
      });
      toast("Corporate portal approved. Opening linked booking.");
      setTimeout(function () {
        if (data.booking_id) location.href = "booking-detail.html?id=" + encodeURIComponent(data.booking_id);
        else location.href = "corporate.html";
      }, 450);
    } catch (err) {
      toast("Could not approve corporate portal: " + err.message);
      btn.disabled = false;
      btn.textContent = "Approve portal access";
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

    const params = new URLSearchParams(location.search);
    focusEmail = (params.get("email") || "").trim().toLowerCase();
    focusId = (params.get("focus") || "").trim();

    populateFilterOptions();
    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    renderList();
    wireEvents();

    // Deep-link from Customers: expand and scroll to a specific enquiry.
    if (focusId) {
      const row = document.querySelector('.admin-enq[data-id="' + (window.CSS && CSS.escape ? CSS.escape(focusId) : focusId) + '"]');
      if (row) {
        row.classList.add("expanded");
        if (row.scrollIntoView) row.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
