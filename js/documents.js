/* ============================================================
   Kridiya Travel — document generator (admin.kridiyatravel.com)
   Builds invoices, e-tickets, cancellation notices and visa
   rejection notices as clean print-ready pages, and logs every
   one issued to public.documents for the account/admin history.
   Staff only — gated the same way as admin.html.
   ============================================================ */
"use strict";

(function () {
  if (document.body.dataset.page !== "documents") return;

  const LOGO_URL = "https://kridiyatravel.com/assets/logo.png";
  const VAT_RATE = 0.05; // UAE standard rate

  /* Preset add-ons — mirror the quote builder. Used as included-extras
     tick-boxes on e-tickets and as quick-add chips on invoices. */
  const PRESET_ADDONS = ["Extra baggage", "Seat selection", "Meal", "Travel insurance"];
  const INVOICE_EXTRAS = ["Extra baggage", "Seat selection", "Meal", "Travel insurance", "Visa fee", "Service charge", "Airport transfer"];
  const INVOICE_SERVICE_PRESETS = {
    flight: {
      label: "Flight",
      items: ["Flight ticket", "Service charge"],
      extras: ["Extra baggage", "Seat selection", "Meal", "Travel insurance", "Airport transfer"],
      note: "Payment before ticketing. Fare, seat, baggage, change, cancellation and no-show rules are subject to airline policy."
    },
    visa: {
      label: "Visa",
      items: ["Visa fee", "Visa service charge"],
      extras: ["Travel insurance", "Document typing", "Appointment assistance", "Courier / delivery"],
      note: "Embassy/government fees and visa decisions are controlled by the relevant authority. Submission starts after payment and complete documents."
    },
    hotel: {
      label: "Hotel",
      items: ["Hotel booking", "Service charge"],
      extras: ["Breakfast / meal plan", "Extra bed", "Airport transfer", "Tourism tax / city tax"],
      note: "Hotel rates, check-in rules, cancellation policy and city/tourism taxes are subject to hotel or supplier policy."
    },
    holiday: {
      label: "Holiday package",
      items: ["Holiday package", "Service charge"],
      extras: ["Tours / activities", "Airport transfer", "Travel insurance", "Visa assistance"],
      note: "Package components are subject to supplier availability. Any changes, cancellation or refunds follow airline, hotel and supplier rules."
    },
    umrah: {
      label: "Umrah",
      items: ["Umrah package", "Service charge"],
      extras: ["Ziyarat", "Transport upgrade", "Meal plan", "Travel insurance"],
      note: "Umrah package, visa, transport and hotel rules are subject to Saudi authority and supplier conditions."
    },
    cruise: {
      label: "Cruise",
      items: ["Cruise package", "Service charge"],
      extras: ["Port charges", "Gratuities", "Travel insurance", "Shore excursion"],
      note: "Cruise booking, cancellation, port, visa and onboard rules are subject to cruise line policy."
    },
    other: {
      label: "Other",
      items: ["Travel service", "Service charge"],
      extras: INVOICE_EXTRAS,
      note: "Supplier rules, payment terms, changes, cancellations and refunds apply as per the relevant service provider."
    }
  };
  const QUOTE_SERVICE_PRESETS = {
    flight: {
      label: "Flight",
      optionLabel: "Airline option",
      terms: "Fares are subject to availability and may change until ticketing. Baggage, seats, changes, cancellations and no-show rules follow the selected airline and fare conditions."
    },
    hotel: {
      label: "Hotel",
      optionLabel: "Hotel option",
      fields: [
        ["hotel_name", "Hotel name", "text", "e.g. Address Beach Resort"],
        ["location", "Location", "text", "City / area"],
        ["checkin", "Check-in", "date", ""],
        ["checkout", "Check-out", "date", ""],
        ["room_type", "Room type", "text", "e.g. Deluxe King", "room_type"],
        ["rooms_guests", "Rooms / guests", "text", "e.g. 1 room, 2 adults"],
        ["meal_plan", "Meal plan", "text", "Room only / breakfast / half board", "meal_plan"],
        ["cancellation", "Cancellation terms", "text", "Refundable until..."]
      ],
      terms: "Hotel rates and room availability are subject to confirmation. Check-in rules, cancellation conditions and tourism or city taxes follow the selected hotel and supplier."
    },
    holiday: {
      label: "Holiday package",
      optionLabel: "Package option",
      fields: [
        ["package_name", "Package name", "text", "e.g. Georgia Explorer"],
        ["destination", "Destination", "text", "City / country"],
        ["date_from", "Travel start", "date", ""],
        ["date_to", "Travel end", "date", ""],
        ["duration", "Duration", "text", "e.g. 5 days / 4 nights"],
        ["accommodation", "Accommodation", "text", "Hotel and room details"],
        ["inclusions", "Inclusions", "textarea", "Flights, hotel, transfers, tours..."],
        ["exclusions", "Exclusions", "textarea", "Visa, meals, personal expenses..."]
      ],
      terms: "Package components are subject to supplier availability. Changes, cancellations and refunds follow the applicable airline, hotel, tour and transfer supplier conditions."
    },
    visa: {
      label: "Visa",
      optionLabel: "Visa option",
      fields: [
        ["country", "Destination country", "text", ""],
        ["visa_type", "Visa type", "text", "e.g. 30-day tourist visa"],
        ["entry_type", "Entry type", "text", "Single / multiple"],
        ["processing_time", "Processing time", "text", "e.g. 5-7 working days"],
        ["validity", "Validity / stay", "text", "e.g. Valid 60 days, 30-day stay"],
        ["requirements", "Key requirements", "textarea", "Passport, photo, bank statement..."],
        ["included", "Included services", "textarea", "Application review, typing, submission..."],
        ["government_fee", "Government fee note", "text", "Included / payable separately"]
      ],
      terms: "Visa approval and processing times are controlled by the relevant authority. Fees may be non-refundable after submission, and approval is never guaranteed."
    },
    umrah: {
      label: "Umrah",
      optionLabel: "Umrah option",
      fields: [
        ["package_name", "Package name", "text", ""],
        ["date_from", "Travel start", "date", ""],
        ["date_to", "Travel end", "date", ""],
        ["transport", "Transport", "text", "Flight / bus / private transfer"],
        ["hotel_makkah", "Makkah hotel", "text", ""],
        ["hotel_madinah", "Madinah hotel", "text", ""],
        ["room_type", "Room type", "text", "Double / triple / quad", "room_type"],
        ["inclusions", "Inclusions", "textarea", "Visa, hotels, transport, ziyarat..."]
      ],
      terms: "Umrah visa, transport, hotel and permit conditions are subject to Saudi authority and supplier rules. Availability must be reconfirmed before payment."
    },
    cruise: {
      label: "Cruise",
      optionLabel: "Cruise option",
      fields: [
        ["cruise_line", "Cruise line", "text", ""],
        ["ship_name", "Ship", "text", ""],
        ["sail_date", "Sailing date", "date", ""],
        ["return_date", "Return date", "date", ""],
        ["itinerary", "Itinerary / ports", "textarea", ""],
        ["cabin_type", "Cabin type", "text", "Interior / ocean view / balcony", "cruise_cabin"],
        ["occupancy", "Occupancy", "text", "e.g. 2 adults"],
        ["inclusions", "Inclusions", "textarea", "Meals, port charges, gratuities..."]
      ],
      terms: "Cruise fares, cabin availability, port charges, gratuities, visa requirements and cancellation rules follow the selected cruise line."
    },
    transfer: {
      label: "Transfer",
      optionLabel: "Transfer option",
      fields: [
        ["provider", "Provider", "text", ""],
        ["vehicle", "Vehicle", "text", "Sedan / SUV / van / coach"],
        ["pickup", "Pickup", "text", "Airport / hotel / address"],
        ["dropoff", "Drop-off", "text", ""],
        ["service_date", "Date", "date", ""],
        ["service_time", "Pickup time", "time", ""],
        ["passengers", "Passengers", "text", ""],
        ["baggage", "Baggage capacity", "text", ""]
      ],
      terms: "Transfer timing and vehicle are subject to supplier confirmation. Waiting time, excess baggage, route changes and additional stops may incur extra charges."
    },
    insurance: {
      label: "Travel insurance",
      optionLabel: "Insurance option",
      fields: [
        ["provider", "Insurer", "text", ""],
        ["plan_name", "Plan", "text", ""],
        ["coverage_area", "Coverage area", "text", "Worldwide / Schengen / regional"],
        ["date_from", "Coverage start", "date", ""],
        ["date_to", "Coverage end", "date", ""],
        ["travellers", "Travellers / ages", "text", ""],
        ["benefits", "Main benefits", "textarea", "Medical, baggage, cancellation..."],
        ["excess", "Excess / deductible", "text", ""]
      ],
      terms: "Coverage, exclusions, excesses and claim decisions follow the insurer's policy wording. Customers should review the full policy before purchase."
    },
    other: {
      label: "Other service",
      optionLabel: "Service option",
      fields: [
        ["option_name", "Option name", "text", ""],
        ["provider", "Provider", "text", ""],
        ["description", "Service details", "textarea", ""],
        ["inclusions", "Inclusions", "textarea", ""],
        ["exclusions", "Exclusions", "textarea", ""],
        ["delivery", "Delivery / validity", "text", ""]
      ],
      terms: "Availability, payment, changes, cancellations and refunds follow the conditions of the relevant service provider."
    }
  };
  const DOCUMENT_REQUIREMENTS = {
    flight: ["Passport copy", "Visa/residence permit if required", "Passenger name exactly as passport", "Travel dates and route", "Mobile number and email"],
    visa: ["Passport copy valid at least 6 months", "UAE visa / Emirates ID copy if applicable", "Passport-size photo", "Travel dates", "Employment/NOC or salary certificate if required", "Bank statement if required", "Hotel/flight booking if required", "Previous visa/refusal copy if applicable"],
    hotel: ["Guest full name", "Passport/ID copy if required by hotel", "Check-in and check-out dates", "Room type and occupancy", "Special requests"],
    holiday: ["Passport copies for all travellers", "Travel dates", "Passenger ages", "Rooming list", "Visa status if applicable", "Meal/tour/transfer preferences"],
    umrah: ["Passport copy valid at least 6 months", "UAE visa / Emirates ID copy if applicable", "Passport-size photo", "Vaccination certificate if required", "Mahram/family documents if required", "Travel dates"],
    cruise: ["Passport copy valid at least 6 months", "Visa/residence permit if required", "Passenger date of birth", "Emergency contact", "Dining/cabin preference", "Travel insurance if required"],
    insurance: ["Passport copy", "Travel dates", "Destination countries", "Date of birth", "Contact details"],
    corporate: ["Company trade licence", "Authorized requester details", "Billing email", "LPO or written approval if required", "Traveller details", "Payment proof or credit approval"],
    cancellation_refund: ["Booking reference", "Customer cancellation request in writing", "Original ticket/voucher/invoice", "Payment proof", "Customer bank details for refund", "Supplier/airline refund rule"]
  };

  const DOC_KINDS = [
    { id: "invoice", label: "Invoice", docType: "invoice" },
    { id: "eticket_flight_oneway", label: "Flight - One-way", docType: "eticket", service: "flight", trip: "One-way", nameField: "passengers" },
    { id: "eticket_flight_roundtrip", label: "Flight - Round-trip", docType: "eticket", service: "flight", trip: "Round-trip", nameField: "passengers" },
    { id: "eticket_flight_multicity", label: "Flight - Multi-city", docType: "eticket", service: "flight", trip: "Multi-city", nameField: "passengers" },
    { id: "eticket_hotel", label: "E-Ticket — Hotel voucher", docType: "eticket", service: "hotel", nameField: "guests" },
    { id: "eticket_visa", label: "E-Ticket — Visa confirmation", docType: "eticket", service: "visa", nameField: "applicants" },
    { id: "eticket_holiday", label: "E-Ticket — Holiday package", docType: "eticket", service: "holiday", nameField: "travellers" },
    { id: "eticket_umrah", label: "E-Ticket — Umrah package", docType: "eticket", service: "umrah", nameField: "pilgrims" },
    { id: "eticket_cruise", label: "E-Ticket — Cruise package", docType: "eticket", service: "cruise", nameField: "guests" },
    { id: "eticket_transfer", label: "Transfer Quote - Service Options", docType: "eticket", service: "transfer", nameField: "customer_name" },
    { id: "eticket_insurance", label: "Travel Insurance Quote - Policy Options", docType: "eticket", service: "insurance", nameField: "customer_name" },
    { id: "eticket_other", label: "E-Ticket — Other travel service", docType: "eticket", service: "other", nameField: "customer_name" },
    { id: "cancellation", label: "Cancellation notice", docType: "cancellation" },
    { id: "visa_rejection", label: "Visa rejection notice", docType: "visa_rejection", nameField: "applicants" }
  ];

  const DEFAULT_BUSINESS_SETTINGS = {
    legal_name: "KRIDIYA Travel and Tourism FZ-LLC",
    trade_license_no: "5033347",
    vat_registered: false,
    trn: "",
    bank_name: "Wio Bank",
    bank_account_name: "KRIDIYA Travel and Tourism FZ-LLC",
    bank_iban: "AE540860000009813682904",
    bank_swift: "WIOBAEADXXX",
    bank_address: "Etihad Airways Centre 5th Floor, Abu Dhabi, UAE",
    cancellation_policy: "Supplier, airline, hotel, visa authority, payment provider, and fare/package rules apply. Refunds, changes, penalties, and timelines depend on the relevant supplier or authority.",
    invoice_footer_note: "Payment before booking. Bank address: Etihad Airways Centre 5th Floor, Abu Dhabi, UAE."
  };
  const CANCELLATION_POLICY_PRESETS = {
    general: "Supplier, airline, hotel, visa authority, payment provider, and fare/package rules apply. Refunds, changes, penalties, and timelines depend on the relevant supplier or authority.",
    flight_standard: "Changes, cancellation, refunds, and no-show are subject to airline and supplier rules. Airline/supplier penalties, fare difference, service charges, and payment gateway charges may apply. Refunds, if applicable, will be processed only after airline/supplier approval and may take additional working days.",
    flight_non_refundable: "This ticket/fare may be non-refundable. Changes, cancellation, refunds, and no-show are subject to airline and supplier rules. Airline/supplier penalties, fare difference, service charges, and payment gateway charges may apply.",
    visa: "Visa approval, rejection, cancellation, processing time, and refund eligibility are controlled by the relevant embassy, immigration authority, or visa supplier. Government/embassy fees and service charges may be non-refundable once processing or submission has started.",
    hotel_package: "Hotel, holiday package, transfer, tour, and activity changes or cancellations are subject to supplier rules, availability, and deadline conditions. Supplier penalties, no-show charges, fare differences, service charges, and payment gateway charges may apply."
  };

  let sb = null;
  let currentUserId = null;
  let settings = null;
  let linkedEnquiry = null;

  /* ---------- Small helpers ---------- */
  function money(amount, currency) {
    const n = Number(amount || 0);
    return (currency || "AED") + " " + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  /* VAT flag is tolerant of boolean true or the string "true". */
  function isVatRegistered() {
    return !!settings && (settings.vat_registered === true || settings.vat_registered === "true");
  }
  function todayISO() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function nl2br(v) {
    return esc(v).replace(/\n/g, "<br>");
  }
  function findKind(id) {
    return DOC_KINDS.find(function (k) { return k.id === id; });
  }
  function withBusinessDefaults(row) {
    const out = Object.assign({}, DEFAULT_BUSINESS_SETTINGS, row || {});
    Object.keys(DEFAULT_BUSINESS_SETTINGS).forEach(function (key) {
      if (typeof out[key] === "string" && !out[key].trim()) out[key] = DEFAULT_BUSINESS_SETTINGS[key];
      if (out[key] == null) out[key] = DEFAULT_BUSINESS_SETTINGS[key];
    });
    out.vat_registered = out.vat_registered === true || out.vat_registered === "true";
    return out;
  }
  function settingReady(name) {
    return !!(settings && String(settings[name] || "").trim());
  }
  function docReadiness() {
    const kind = findKind(document.getElementById("doc-kind") ? document.getElementById("doc-kind").value : "invoice") || DOC_KINDS[0];
    const missing = [];
    if (!settingReady("legal_name")) missing.push("Legal name");
    if (!settingReady("trade_license_no")) missing.push("Trade licence");
    if (isVatRegistered() && !settingReady("trn")) missing.push("TRN");
    if (kind.docType === "invoice" && (!settingReady("bank_iban") || !settingReady("bank_account_name"))) missing.push("Bank details");
    if (!linkedEnquiry) missing.push("Linked enquiry optional");
    const tone = missing.filter(function (x) { return x !== "Linked enquiry optional"; }).length ? "warn" : "ok";
    const next = tone === "warn"
      ? "Complete business settings before issuing final customer documents."
      : linkedEnquiry
        ? "Linked enquiry is ready. Preview first, then Save & Print."
        : "Settings are ready. Link an enquiry when possible for a cleaner audit trail.";
    return { kind: kind, missing: missing, tone: tone, next: next };
  }
  function renderDocControl() {
    const panel = document.getElementById("doc-control-panel");
    if (!panel || !settings) return;
    const ready = docReadiness();
    const invoiceKinds = DOC_KINDS.filter(function (k) { return k.docType === "invoice"; }).length;
    const ticketKinds = DOC_KINDS.filter(function (k) { return k.docType === "eticket"; }).length;
    const supportKinds = DOC_KINDS.length - invoiceKinds - ticketKinds;
    panel.innerHTML =
      '<div class="doc-control-summary doc-' + esc(ready.tone) + '"><div><b>' + esc(ready.kind.label) + '</b><span>' + esc(ready.next) + '</span></div><span class="staff-risk ' + esc(ready.tone === "ok" ? "ok" : "warn") + '">' + esc(ready.tone === "ok" ? "Ready" : "Review") + '</span></div>' +
      '<div class="doc-control-grid">' +
        '<div><b>' + esc(invoiceKinds) + '</b><span>Invoice types</span></div>' +
        '<div><b>' + esc(ticketKinds) + '</b><span>Ticket/voucher types</span></div>' +
        '<div><b>' + esc(supportKinds) + '</b><span>Support notices</span></div>' +
        '<div><b>' + esc(linkedEnquiry ? "Yes" : "No") + '</b><span>Enquiry linked</span></div>' +
      '</div>' +
      '<div class="doc-control-next"><b>Readiness checks</b><span>' + esc(ready.missing.length ? ready.missing.join(", ") : "Business settings, document type, and audit trail are ready.") + '</span></div>';
  }
  function requirementListHTML(service) {
    const list = DOCUMENT_REQUIREMENTS[service] || DOCUMENT_REQUIREMENTS.flight;
    return '<div class="doc-required-card"><div><b>Internal document checklist</b><span>' + esc((INVOICE_SERVICE_PRESETS[service] && INVOICE_SERVICE_PRESETS[service].label) || "Selected service") + ' - staff only, not printed on the customer invoice/PDF.</span></div><ul>' +
      list.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") +
      "</ul></div>";
  }

  /* ---------- Print document shell (shared by every kind) ---------- */
  const PRINT_CSS =
    "body{font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;margin:0;padding:2.4rem 2.6rem;background:#fff}" +
    ".doc-letterhead{display:flex;justify-content:space-between;align-items:flex-start;gap:1.5rem;border-bottom:3px solid #c9601c;padding-bottom:1rem;margin-bottom:1.6rem}" +
    ".doc-brand{display:flex;gap:0.9rem;align-items:flex-start}" +
    ".doc-logo{width:52px;height:52px;object-fit:contain}" +
    ".doc-brand b{font-size:1.15rem;color:#a3480f}" +
    ".doc-brand p{margin:0.2rem 0 0;font-size:0.78rem;font-family:Arial,sans-serif;color:#555;line-height:1.5}" +
    ".doc-meta{text-align:right;font-family:Arial,sans-serif}" +
    ".doc-type-label{font-size:0.72rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#a3480f}" +
    ".doc-number{font-size:1.3rem;font-weight:700;margin-top:0.2rem}" +
    ".doc-date{font-size:0.8rem;color:#666;margin-top:0.15rem}" +
    "h2{font-family:Arial,sans-serif;font-size:1rem;color:#a3480f;margin:1.6rem 0 0.5rem;text-transform:uppercase;letter-spacing:0.04em}" +
    "h3.quote-journey-title{font-family:Arial,sans-serif;font-size:0.82rem;color:#333;margin:1rem 0 0.35rem}" +
    "table{width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:0.86rem}" +
    "table th{text-align:left;background:#fdf1e4;padding:0.5rem 0.7rem;border-bottom:2px solid #e8b98a;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.03em;color:#8a4210}" +
    "table td{padding:0.55rem 0.7rem;border-bottom:1px solid #eee;vertical-align:top}" +
    "table.totals td{border:none;padding:0.3rem 0.7rem}" +
    "table.totals .label{text-align:right;color:#555}" +
    "table.totals .grand td{font-weight:700;font-size:1rem;border-top:2px solid #c9601c;padding-top:0.6rem}" +
    ".kv{font-family:Arial,sans-serif;font-size:0.88rem;display:grid;grid-template-columns:170px 1fr;gap:0.35rem 1rem;margin-bottom:0.3rem}" +
    ".kv .k{color:#777}" +
    ".kv .v{color:#1a1a1a;font-weight:600}" +
    ".note{font-family:Arial,sans-serif;font-size:0.82rem;color:#555;white-space:pre-line;line-height:1.6}" +
    ".box{background:#fdf1e4;border:1px solid #f0d3ae;border-radius:8px;padding:0.9rem 1.1rem;margin-top:0.6rem}" +
    ".ticket-panel{font-family:Arial,sans-serif;border:1px solid #e4e4e4;background:#fff;margin-top:0.75rem;break-inside:avoid}" +
    ".ticket-panel-head{padding:0.48rem 0.7rem;background:#f6f6f6;border-bottom:1px solid #e4e4e4;font-size:0.76rem;font-weight:800;text-transform:uppercase;color:#333}" +
    ".ticket-passenger-row{display:grid;grid-template-columns:150px 1fr 1fr;gap:1rem;align-items:center;padding:0.7rem;border-bottom:1px solid #eee}" +
    ".ticket-passenger-row:last-child{border-bottom:0}" +
    ".ticket-code-slot{width:150px;min-height:72px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #e5e5e5;background:#fff}" +
    ".ticket-code-img{max-width:142px;max-height:82px;width:auto;height:auto;object-fit:contain;display:block}" +
    ".ticket-code-placeholder{font-size:0.72rem;color:#777;text-align:center;line-height:1.35;padding:0.5rem}" +
    ".ticket-passenger-name span,.ticket-passenger-extra span{display:block;font-size:0.68rem;color:#777;text-transform:uppercase;font-weight:800;margin-bottom:0.18rem}" +
    ".ticket-passenger-name b,.ticket-passenger-extra b{display:block;font-size:0.82rem;color:#111;line-height:1.35}" +
    ".ticket-meta-grid{font-family:Arial,sans-serif;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;border:1px solid #e4e4e4;border-bottom:0;margin-top:0.85rem;break-inside:avoid}" +
    ".ticket-meta-item{min-height:46px;padding:0.5rem 0.65rem;border-right:1px solid #eee;border-bottom:1px solid #eee}" +
    ".ticket-meta-item:nth-child(4n){border-right:0}" +
    ".ticket-meta-item span{display:block;font-size:0.66rem;text-transform:uppercase;color:#777;font-weight:800;margin-bottom:0.14rem}" +
    ".ticket-meta-item b{display:block;font-size:0.84rem;color:#111;line-height:1.35}" +
    ".ticket-code-box{display:flex;align-items:center;gap:1rem;border:1px solid #eee;background:#fafafa;padding:0.8rem 1rem;font-family:Arial,sans-serif;break-inside:avoid}" +
    ".ticket-code-value{margin-top:0.25rem;font-size:0.82rem;font-weight:700;word-break:break-word}" +
    ".print-quote-option{margin-top:1.35rem;padding-top:1rem;border-top:2px solid #e8b98a;break-inside:avoid}" +
    ".print-quote-option-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;font-family:Arial,sans-serif;margin-bottom:0.8rem}" +
    ".print-quote-option-head div{display:grid;gap:0.15rem}.print-quote-option-head span{font-size:0.72rem;color:#777;text-transform:uppercase}.print-quote-option-head b{font-size:1rem;color:#1a1a1a}.print-quote-option-head strong{font-size:1rem;color:#a3480f;white-space:nowrap}" +
    ".quote-option-meta{margin-bottom:0.75rem}.quote-connection-row td{background:#fafafa;color:#666;font-size:0.76rem;font-style:italic;padding:0.3rem 0.7rem}" +
    ".footer-note{margin-top:2.4rem;padding-top:1rem;border-top:1px solid #eee;font-family:Arial,sans-serif;font-size:0.74rem;color:#888}" +
    /* ---- Typography and colour system ------------------------------------
       Appended last so it wins over the rules above without disturbing the
       forty structural rules that lay these documents out.

       The documents were set in Georgia with Arial tables: a serif letterhead
       over sans-serif data. That mix is what reads as dated. Airlines, banks
       and every modern statement use one sans family throughout and let
       weight and spacing carry the hierarchy instead. Colours move onto the
       same brand tokens as the website and the rest of the admin.
       --------------------------------------------------------------------- */
    "body{font-family:'Plus Jakarta Sans','Segoe UI',Helvetica,Arial,sans-serif;color:#2f2415;line-height:1.5;font-size:13px;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    ".doc-letterhead{border-bottom:2px solid #e3d5be;padding-bottom:1.1rem;margin-bottom:1.8rem}" +
    ".doc-brand b{font-family:inherit;font-size:17px;font-weight:800;color:#1e1509;letter-spacing:-0.01em}" +
    ".doc-brand p{font-family:inherit;font-size:11px;color:#79694f;line-height:1.55}" +
    ".doc-logo{width:46px;height:46px}" +
    ".doc-meta{font-family:inherit}" +
    ".doc-type-label{font-size:11px;font-weight:800;letter-spacing:0.09em;color:#b6530f}" +
    ".doc-number{font-size:20px;font-weight:800;color:#1e1509;letter-spacing:-0.01em;margin-top:5px}" +
    ".doc-date{font-size:12px;color:#79694f;margin-top:4px}" +
    "h2{font-family:inherit;font-size:11px;font-weight:800;letter-spacing:0.09em;color:#79694f;text-transform:uppercase;margin:1.7rem 0 0.6rem;padding-bottom:7px;border-bottom:1px solid #f1e8d8}" +
    "h3,h3.quote-journey-title{font-family:inherit;font-size:13px;font-weight:700;color:#1e1509}" +
    "table{font-family:inherit;font-size:13px}" +
    "table th{background:#fff4e6;border-bottom:1px solid #e3d5be;font-size:11px;font-weight:800;letter-spacing:0.05em;color:#b6530f;padding:0.55rem 0.7rem}" +
    "table td{border-bottom:1px solid #f1e8d8;color:#2f2415;padding:0.6rem 0.7rem}" +
    "table.totals .label{color:#79694f}" +
    "table.totals .grand td{border-top:2px solid #e3d5be;font-size:15px;font-weight:800;color:#1e1509}" +
    ".kv{font-family:inherit;font-size:13px}" +
    ".kv .k{color:#79694f}" +
    ".footer-note{font-family:inherit;font-size:11.5px;color:#79694f;border-top:1px solid #f1e8d8;line-height:1.6}" +
    ".ticket-meta-grid,.ticket-code-box,.print-quote-option-head{font-family:inherit}" +
    ".ticket-meta-item span,.ticket-passenger-name span,.ticket-passenger-extra span{font-size:10.5px;color:#79694f;letter-spacing:0.05em}" +
    ".ticket-meta-item b,.ticket-passenger-name b,.ticket-passenger-extra b{font-size:13px;color:#2f2415;font-weight:700}" +
    ".print-quote-option{border-top:1px solid #e3d5be}" +
    ".print-quote-option-head strong{color:#b6530f;font-weight:800}" +
    ".print-quote-option-head b{color:#1e1509;font-weight:800}" +
    ".quote-connection-row td{background:#fdf8f0;color:#79694f;font-style:normal;font-size:12px}" +
    "@media print{body{padding:0.4in}.ticket-passenger-row{grid-template-columns:150px 1fr 1fr}.ticket-meta-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}";

  function letterheadHTML(docLabel, docNumber, docDate) {
    let addr =
      "FDRK7105, Compass Building, Al Shohada Road, Al Hamra Industrial Zone-FZ, Ras Al Khaimah, United Arab Emirates<br>" +
      "+971 50 941 3873 &middot; info@kridiyatravel.com &middot; kridiyatravel.com";
    if (settings.trade_license_no) addr += "<br>Trade licence: " + esc(settings.trade_license_no);
    if (settings.vat_registered && settings.trn) addr += "<br>TRN: " + esc(settings.trn);
    return (
      '<div class="doc-letterhead">' +
        '<div class="doc-brand">' +
          '<img src="' + LOGO_URL + '" alt="" class="doc-logo">' +
          "<div><b>" + esc(settings.legal_name) + "</b><p>" + addr + "</p></div>" +
        "</div>" +
        '<div class="doc-meta">' +
          '<div class="doc-type-label">' + esc(docLabel) + "</div>" +
          '<div class="doc-number">' + esc(docNumber || "DRAFT") + "</div>" +
          '<div class="doc-date">' + esc(fmtDate(docDate)) + "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function bankBoxHTML() {
    if (!settings.bank_iban && !settings.bank_name) return "";
    return (
      '<div class="box"><b style="font-family:Arial,sans-serif;font-size:0.8rem">Bank transfer details</b>' +
      '<div class="kv" style="margin-top:0.5rem">' +
        (settings.bank_account_name ? '<span class="k">Account name</span><span class="v">' + esc(settings.bank_account_name) + "</span>" : "") +
        (settings.bank_name ? '<span class="k">Bank</span><span class="v">' + esc(settings.bank_name) + "</span>" : "") +
        (settings.bank_iban ? '<span class="k">IBAN</span><span class="v">' + esc(settings.bank_iban) + "</span>" : "") +
        (settings.bank_swift ? '<span class="k">SWIFT/BIC</span><span class="v">' + esc(settings.bank_swift) + "</span>" : "") +
        (settings.bank_address ? '<span class="k">Bank address</span><span class="v">' + esc(settings.bank_address) + "</span>" : "") +
      "</div></div>"
    );
  }

  function standaloneDocHTML(title, bodyHTML) {
    return (
      "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>" + esc(title) + "</title><style>" + PRINT_CSS + "</style></head><body>" +
      bodyHTML +
      '<div class="footer-note">Kridiya Travel and Tourism &mdash; issued via admin.kridiyatravel.com. This document is confidential and intended for the named recipient only.</div>' +
      "</body></html>"
    );
  }

  function openPrintWindow(title, bodyHTML) {
    const win = window.open("", "_blank");
    if (!win) { toast("Please allow pop-ups to view/print the document."); return; }
    win.document.open();
    win.document.write(standaloneDocHTML(title, bodyHTML));
    win.document.close();
    win.focus();
  }

  let lastRender = null; // {title, body} of the most recent preview/generate

  function showInlinePreview(title, bodyHTML) {
    lastRender = { title: title, body: bodyHTML };
    const mount = document.getElementById("doc-preview");
    mount.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.className = "doc-preview-frame";
    mount.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(standaloneDocHTML(title, bodyHTML));
    doc.close();
    const reopen = document.getElementById("reopen-print");
    if (reopen) reopen.hidden = false;
  }

  /* ---------- Repeatable rows widget ---------- */
  function renderRepeatable(containerId, addBtnId, rowHTMLFn, initial) {
    const container = document.getElementById(containerId);
    const addBtn = document.getElementById(addBtnId);
    let count = 0;
    function addRow() {
      const div = document.createElement("div");
      div.className = "repeat-row";
      div.dataset.index = String(count);
      div.innerHTML = rowHTMLFn(count) + '<button type="button" class="btn btn-outline repeat-remove">Remove</button>';
      container.appendChild(div);
      count++;
    }
    container.innerHTML = "";
    count = 0;
    for (let i = 0; i < initial; i++) addRow();
    if (addBtn) addBtn.addEventListener("click", addRow);
    container.addEventListener("click", function (e) {
      const btn = e.target.closest(".repeat-remove");
      if (!btn) return;
      if (container.children.length <= 1) return;
      btn.closest(".repeat-row").remove();
    });
    return {
      addRow: addRow,
      clear: function () { container.innerHTML = ""; count = 0; }
    };
  }
  function rowsOf(containerId) {
    return Array.from(document.getElementById(containerId).children);
  }
  function fieldVal(row, name) {
    const el = row.querySelector('[name="' + name + '"]');
    return el ? el.value.trim() : "";
  }
  function namedVal(scope, name) {
    const el = scope.querySelector('[name="' + name + '"]');
    return el ? el.value.trim() : "";
  }
  function namedFile(scope, name) {
    const el = scope.querySelector('[name="' + name + '"]');
    return el && el.files && el.files.length ? el.files[0] : null;
  }
  function readImageDataURL(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { resolve(""); return; }
      if (!/^image\//.test(file.type || "")) {
        reject(new Error("QR/barcode upload must be an image file."));
        return;
      }
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(new Error("Could not read the QR/barcode image.")); };
      reader.readAsDataURL(file);
    });
  }
  async function attachTicketBarcodeImage(form, data) {
    const file = namedFile(form, "ticket_barcode_file");
    if (!file) return data;
    data.ticket_barcode_image = await readImageDataURL(file);
    data.ticket_barcode_file_name = file.name || "";
    return data;
  }
  /* Safe numeric read: never returns NaN. */
  function num(v, fallback) {
    const n = parseFloat(v);
    return isFinite(n) ? n : (fallback || 0);
  }

  /* Preset add-on tick-boxes for e-ticket forms (included extras). */
  function addonChecksHTML(nameAttr) {
    return '<div class="field col-12 doc-addon-field"><label class="doc-addon-title">OPTIONAL EXTRAS INCLUDED</label>' +
      '<div class="doc-addon-checks">' +
      PRESET_ADDONS.map(function (a) {
        return '<label class="doc-addon-check"><input type="checkbox" name="' + nameAttr + '" value="' + esc(a) + '"> ' + esc(a) + "</label>";
      }).join("") +
      "</div></div>";
  }
  function gatherAddonChecks(form, nameAttr) {
    if (!form) return [];
    return Array.from(form.querySelectorAll('input[name="' + nameAttr + '"]:checked')).map(function (c) { return c.value; });
  }

  /* ================= FORM BUILDERS + RENDERERS PER KIND ================= */

  function prefillName() { return linkedEnquiry ? linkedEnquiry.full_name : ""; }
  function deriveCustomerName(kind, data) {
    if (data.customer_name) return data.customer_name;
    if (kind.nameField && data[kind.nameField]) {
      const first = String(data[kind.nameField]).split("\n")[0].trim();
      if (first) return first;
    }
    return prefillName();
  }
  function prefillEmail() { return linkedEnquiry ? linkedEnquiry.email : ""; }
  function prefillPhone() { return linkedEnquiry ? linkedEnquiry.phone : ""; }
  function prefillRef() { return linkedEnquiry ? linkedEnquiry.reference : ""; }

  /* ---- Customer quotation: several complete options in one document ---- */
  function quoteFieldHTML(field) {
    const key = field[0];
    const labelText = field[1];
    const type = field[2];
    const placeholder = field[3] || "";
    const preset = field[4] ? ' data-preset="' + esc(field[4]) + '"' : "";
    const control = type === "textarea"
      ? '<textarea data-field="' + esc(key) + '" placeholder="' + esc(placeholder) + '"></textarea>'
      : '<input data-field="' + esc(key) + '" type="' + esc(type) + '" placeholder="' + esc(placeholder) + '"' + preset + '>';
    return '<div class="field ' + (type === "textarea" ? "col-12" : "col-6") + '"><label>' + esc(labelText.toUpperCase()) + "</label>" + control + "</div>";
  }
  function quoteOptionValue(option, key) {
    const el = option.querySelector('[data-field="' + key + '"]');
    return el ? el.value.trim() : "";
  }
  function quoteFlightSegmentHTML() {
    return (
      '<div class="quote-flight-segment">' +
        '<div class="field-row quote-flight-segment-grid">' +
          '<div class="field col-3"><label>AIRLINE</label><input data-segment-field="airline" data-preset="airline"></div>' +
          '<div class="field col-3"><label>OPERATED BY</label><input data-segment-field="operated_by" placeholder="If different"></div>' +
          '<div class="field col-3"><label>FLIGHT NO.</label><input data-segment-field="flightno" placeholder="e.g. G9 401"></div>' +
          '<div class="field col-3"><label>FROM</label><input data-segment-field="from" data-airport placeholder="Dubai (DXB)"></div>' +
          '<div class="field col-3"><label>TO</label><input data-segment-field="to" data-airport placeholder="Chennai (MAA)"></div>' +
          '<div class="field col-3"><label>DEPARTURE TERMINAL</label><input data-segment-field="departure_terminal" placeholder="e.g. T1"></div>' +
          '<div class="field col-3"><label>ARRIVAL TERMINAL</label><input data-segment-field="arrival_terminal" placeholder="e.g. T3"></div>' +
          '<div class="field col-3"><label>DEPARTURE</label><input data-segment-field="departure" type="datetime-local"></div>' +
          '<div class="field col-3"><label>ARRIVAL</label><input data-segment-field="arrival" type="datetime-local"></div>' +
        "</div>" +
        '<button type="button" class="btn btn-outline quote-remove-segment" aria-label="Remove flight segment">Remove segment</button>' +
      "</div>"
    );
  }
  function quoteJourneyHTML(direction, labelText) {
    return (
      '<section class="quote-journey" data-direction="' + esc(direction) + '">' +
        '<div class="quote-journey-head"><div><b>' + esc(labelText) + '</b><span>Add one row for a direct flight, or more rows for connections.</span></div>' +
          '<button type="button" class="btn btn-outline quote-add-segment">+ Add connecting flight</button></div>' +
        '<div class="quote-flight-segments">' + quoteFlightSegmentHTML() + "</div>" +
      "</section>"
    );
  }
  function quoteFlightOptionBody(fixedTripType) {
    const tripType = fixedTripType || "roundtrip";
    const tripLabel = tripType === "oneway" ? "One way" : tripType === "multicity" ? "Multi-city" : "Round trip";
    const journeys = tripType === "roundtrip"
      ? quoteJourneyHTML("onward", "Onward journey") + quoteJourneyHTML("return", "Return journey")
      : tripType === "multicity"
        ? quoteJourneyHTML("itinerary", "Flight itinerary")
        : quoteJourneyHTML("onward", "Onward journey");
    return (
      '<div class="field-row quote-option-core">' +
        '<div class="field col-6"><label>OPTION NAME / AIRLINE</label><input data-field="option_name" data-preset="airline" placeholder="e.g. Air Arabia"></div>' +
        '<div class="field col-3"><label>TRIP TYPE</label><input value="' + esc(tripLabel) + '" disabled><input data-field="trip_type" type="hidden" value="' + esc(tripType) + '"></div>' +
        '<div class="field col-3"><label>PRICE / PERSON</label><input data-field="price" type="number" min="0" step="0.01" placeholder="0.00"></div>' +
        '<div class="field col-4"><label>CLASS</label><input data-field="cabin" data-preset="cabin" value="Economy"></div>' +
        '<div class="field col-4"><label>BOOKING CLASS / FARE BASIS</label><input data-field="fare_basis" placeholder="e.g. V / Saver"></div>' +
        '<div class="field col-4"><label>BOOKING STATUS</label><input data-field="booking_status" data-preset="booking_status" placeholder="e.g. Available / On request"></div>' +
        '<div class="field col-4"><label>BAGGAGE</label><input data-field="baggage" placeholder="e.g. 30kg + 7kg cabin"></div>' +
        '<div class="field col-4"><label>FARE / BOOKING NOTE</label><input data-field="fare_note" placeholder="Refundable / changes allowed..."></div>' +
        '<div class="field col-4"><label>QUOTE / RESERVATION REF (OPTIONAL)</label><input data-field="pnr"></div>' +
        '<div class="field col-4"><label>BASE FARE / PERSON</label><input data-field="base_fare" type="number" min="0" step="0.01" placeholder="0.00"></div>' +
        '<div class="field col-4"><label>TAXES / FEES / PERSON</label><input data-field="taxes" type="number" min="0" step="0.01" placeholder="0.00"></div>' +
        '<div class="field col-4"><label>PAYMENT DEADLINE</label><input data-field="payment_deadline" type="datetime-local"></div>' +
        '<div class="field col-4"><label>CUSTOMER DECISION</label><select data-field="customer_decision"><option value="offered">Offered</option><option value="selected">Selected by customer</option><option value="not_selected">Not selected</option></select></div>' +
        '<div class="field col-12"><label>OPTIONAL EXTRAS INCLUDED</label><div class="doc-addon-checks">' +
          PRESET_ADDONS.map(function (extra) {
            return '<label class="doc-addon-check"><input type="checkbox" data-flight-extra value="' + esc(extra) + '"> ' + esc(extra) + "</label>";
          }).join("") +
        "</div></div>" +
        '<div class="field col-12"><label>AIRLINE RULES / CHANGE / CANCELLATION / NO-SHOW</label><textarea data-field="airline_rules" placeholder="Paste or summarize the airline fare rules for this option."></textarea></div>' +
      "</div>" +
      '<div class="quote-journeys">' + journeys + "</div>"
    );
  }
  function quoteGenericOptionBody(service) {
    const preset = QUOTE_SERVICE_PRESETS[service] || QUOTE_SERVICE_PRESETS.other;
    return (
      '<div class="field-row quote-option-core">' +
        '<div class="field col-6"><label>OPTION LABEL</label><input data-field="label" placeholder="e.g. Best value / Flexible / Premium"></div>' +
        '<div class="field col-3"><label>PRICE</label><input data-field="price" type="number" min="0" step="0.01" placeholder="0.00"></div>' +
        '<div class="field col-3"><label>PRICE BASIS</label><select data-field="price_basis"><option value="total">Total</option><option value="per person">Per person</option><option value="per applicant">Per applicant</option><option value="per room">Per room</option><option value="per night">Per night</option><option value="per vehicle">Per vehicle</option><option value="per policy">Per policy</option></select></div>' +
        '<div class="field col-4"><label>CUSTOMER DECISION</label><select data-field="customer_decision"><option value="offered">Offered</option><option value="selected">Selected by customer</option><option value="not_selected">Not selected</option></select></div>' +
        preset.fields.map(quoteFieldHTML).join("") +
      "</div>"
    );
  }
  function buildFormQuotation(mount, fixedService, fixedTripType) {
    const serviceControl = fixedService
      ? '<div class="field col-4"><label>SERVICE</label><input value="' + esc((QUOTE_SERVICE_PRESETS[fixedService] || QUOTE_SERVICE_PRESETS.other).label) + '" disabled><input name="quote_service" type="hidden" value="' + esc(fixedService) + '"></div>'
      : '<div class="field col-4"><label>SERVICE</label><select name="quote_service" id="quote-service">' +
          Object.keys(QUOTE_SERVICE_PRESETS).map(function (key) { return '<option value="' + esc(key) + '">' + esc(QUOTE_SERVICE_PRESETS[key].label) + "</option>"; }).join("") +
        "</select></div>";
    mount.innerHTML =
      '<div class="field-row doc-quote-customer-row">' +
        '<div class="field col-6"><label>CUSTOMER NAME</label><input name="customer_name" required value="' + esc(prefillName()) + '"></div>' +
        '<div class="field col-6"><label>EMAIL</label><input name="customer_email" type="email" value="' + esc(prefillEmail()) + '"></div>' +
        '<div class="field col-4"><label>PHONE / WHATSAPP</label><input name="customer_phone" value="' + esc(prefillPhone()) + '"></div>' +
        serviceControl +
        '<div class="field col-2"><label>CURRENCY</label><input name="currency" class="currency-input" value="AED" maxlength="3"></div>' +
        '<div class="field col-2"><label>VALID UNTIL</label><input name="valid_until" type="datetime-local"></div>' +
        '<div class="field col-12"><label>TRAVELLERS / GUESTS</label><textarea name="travellers" placeholder="Names or traveller count">' + esc(prefillName()) + "</textarea></div>" +
      "</div>" +
      '<div class="doc-quote-builder-head"><div><h3>Service options</h3><p>Add complete alternatives for this service. Saved and printed options are automatically ordered by price.</p></div>' +
        '<button type="button" class="btn btn-outline quote-add-option">+ Add another option</button></div>' +
      '<div id="quote-options" class="doc-quote-options"></div>' +
      '<button type="button" class="btn btn-outline doc-quote-add-bottom quote-add-option">+ Add another option</button>' +
      '<div class="field"><label>TERMS / IMPORTANT NOTES</label><textarea name="terms"></textarea></div>';

    const serviceSel = mount.querySelector('[name="quote_service"]');
    const optionsMount = mount.querySelector("#quote-options");
    const termsEl = mount.querySelector('[name="terms"]');
    let optionSequence = 0;

    function renumberOptions() {
      Array.from(optionsMount.children).forEach(function (option, index) {
        const numberEl = option.querySelector(".doc-quote-option-number");
        if (numberEl) numberEl.textContent = "Option " + (index + 1);
        const remove = option.querySelector(".doc-quote-remove-option");
        if (remove) remove.disabled = optionsMount.children.length <= 1;
      });
    }
    function initQuoteAirports(scope) {
      if (typeof initAirportAC === "function") initAirportAC(scope);
    }
    function initQuotePresets(scope) {
      if (typeof initPresetAC === "function") initPresetAC(scope);
    }
    function addOption() {
      const service = serviceSel.value;
      const preset = QUOTE_SERVICE_PRESETS[service] || QUOTE_SERVICE_PRESETS.other;
      const option = document.createElement("section");
      option.className = "doc-quote-option";
      option.dataset.optionId = String(optionSequence++);
      option.innerHTML =
        '<div class="doc-quote-option-head"><div><span class="doc-quote-option-number"></span><b>' + esc(preset.optionLabel) + '</b></div>' +
          '<button type="button" class="btn btn-outline doc-quote-remove-option">Remove option</button></div>' +
        '<div class="doc-quote-option-body">' + (service === "flight" ? quoteFlightOptionBody(fixedTripType) : quoteGenericOptionBody(service)) + "</div>";
      optionsMount.appendChild(option);
      renumberOptions();
      initQuoteAirports(option);
      initQuotePresets(option);
    }
    function resetForService() {
      optionsMount.innerHTML = "";
      optionSequence = 0;
      termsEl.value = (QUOTE_SERVICE_PRESETS[serviceSel.value] || QUOTE_SERVICE_PRESETS.other).terms;
      addOption();
    }

    mount.querySelectorAll(".quote-add-option").forEach(function (button) { button.addEventListener("click", addOption); });
    serviceSel.addEventListener("change", resetForService);
    optionsMount.addEventListener("click", function (event) {
      const addSegment = event.target.closest(".quote-add-segment");
      if (addSegment) {
        const journey = addSegment.closest(".quote-journey");
        const segments = journey.querySelector(".quote-flight-segments");
        segments.insertAdjacentHTML("beforeend", quoteFlightSegmentHTML());
        initQuoteAirports(segments.lastElementChild);
        initQuotePresets(segments.lastElementChild);
        return;
      }
      const removeSegment = event.target.closest(".quote-remove-segment");
      if (removeSegment) {
        const segments = removeSegment.closest(".quote-flight-segments");
        if (segments.children.length > 1) removeSegment.closest(".quote-flight-segment").remove();
        return;
      }
      const removeOption = event.target.closest(".doc-quote-remove-option");
      if (removeOption && optionsMount.children.length > 1) {
        removeOption.closest(".doc-quote-option").remove();
        renumberOptions();
      }
    });
    optionsMount.addEventListener("change", function (event) {
      if (!event.target.matches('[data-field="trip_type"]')) return;
      const option = event.target.closest(".doc-quote-option");
      const returnJourney = option.querySelector('[data-direction="return"]');
      returnJourney.hidden = event.target.value === "oneway";
    });
    if (!fixedService && linkedEnquiry && QUOTE_SERVICE_PRESETS[linkedEnquiry.service_type]) {
      serviceSel.value = linkedEnquiry.service_type;
    }
    resetForService();
  }
  function gatherQuoteSegment(segment) {
    function segmentValue(key) {
      const el = segment.querySelector('[data-segment-field="' + key + '"]');
      return el ? el.value.trim() : "";
    }
    return {
      airline: segmentValue("airline"),
      operated_by: segmentValue("operated_by"),
      flightno: segmentValue("flightno"),
      from: segmentValue("from"),
      to: segmentValue("to"),
      departure_terminal: segmentValue("departure_terminal"),
      arrival_terminal: segmentValue("arrival_terminal"),
      departure: segmentValue("departure"),
      arrival: segmentValue("arrival")
    };
  }
  function gatherQuotation(form) {
    const service = namedVal(form, "quote_service") || "flight";
    const preset = QUOTE_SERVICE_PRESETS[service] || QUOTE_SERVICE_PRESETS.other;
    const options = Array.from(form.querySelectorAll(".doc-quote-option")).map(function (option, index) {
      const price = num(quoteOptionValue(option, "price"));
      if (price <= 0) throw new Error("Enter a price greater than zero for option " + (index + 1) + ".");
      if (service === "flight") {
        const tripType = quoteOptionValue(option, "trip_type") || "roundtrip";
        const journeys = Array.from(option.querySelectorAll(".quote-journey")).filter(function (journey) {
          return journey.dataset.direction !== "return" || tripType === "roundtrip";
        }).map(function (journey) {
          const segments = Array.from(journey.querySelectorAll(".quote-flight-segment")).map(gatherQuoteSegment).filter(function (segment) {
            return segment.from || segment.to || segment.flightno;
          });
          return { direction: journey.dataset.direction, segments: segments };
        });
        if (!journeys[0] || !journeys[0].segments.length) throw new Error("Add at least one onward flight for option " + (index + 1) + ".");
        if (tripType === "roundtrip" && (!journeys[1] || !journeys[1].segments.length)) {
          throw new Error("Add at least one return flight for option " + (index + 1) + ", or change it to one way.");
        }
        journeys.forEach(function (journey) {
          journey.segments.forEach(function (segment, segmentIndex) {
            if (!segment.from || !segment.to) {
              throw new Error("Complete the From and To airports for " + journey.direction + " segment " + (segmentIndex + 1) + " in option " + (index + 1) + ".");
            }
          });
        });
        return {
          label: quoteOptionValue(option, "option_name") || "Flight option " + (index + 1),
          price: price,
          trip_type: tripType,
          cabin: quoteOptionValue(option, "cabin"),
          fare_basis: quoteOptionValue(option, "fare_basis"),
          booking_status: quoteOptionValue(option, "booking_status"),
          baggage: quoteOptionValue(option, "baggage"),
          fare_note: quoteOptionValue(option, "fare_note"),
          pnr: quoteOptionValue(option, "pnr"),
          base_fare: quoteOptionValue(option, "base_fare"),
          taxes: quoteOptionValue(option, "taxes"),
          payment_deadline: quoteOptionValue(option, "payment_deadline"),
          customer_decision: quoteOptionValue(option, "customer_decision") || "offered",
          airline_rules: quoteOptionValue(option, "airline_rules"),
          extras: Array.from(option.querySelectorAll("[data-flight-extra]:checked")).map(function (input) { return input.value; }),
          journeys: journeys
        };
      }
      const details = {};
      preset.fields.forEach(function (field) { details[field[0]] = quoteOptionValue(option, field[0]); });
      const fallback = details.hotel_name || details.package_name || details.visa_type || details.cruise_line || details.provider || details.option_name;
      return {
        label: quoteOptionValue(option, "label") || fallback || preset.optionLabel + " " + (index + 1),
        price: price,
        price_basis: quoteOptionValue(option, "price_basis") || "total",
        customer_decision: quoteOptionValue(option, "customer_decision") || "offered",
        details: details
      };
    }).sort(function (a, b) { return a.price - b.price; });
    if (!options.length) throw new Error("Add at least one quote option.");
    return {
      customer_name: namedVal(form, "customer_name"),
      customer_email: namedVal(form, "customer_email"),
      customer_phone: namedVal(form, "customer_phone"),
      service: service,
      travellers: namedVal(form, "travellers"),
      currency: (namedVal(form, "currency") || "AED").toUpperCase(),
      valid_until: namedVal(form, "valid_until"),
      terms: namedVal(form, "terms"),
      reference: prefillRef(),
      document_purpose: "quote",
      document_type_override: "quotation",
      options: options,
      total: options[0].price
    };
  }
  function fmtDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function quoteLayover(previous, current) {
    if (!previous || !current || !previous.arrival || !current.departure) return "";
    const minutes = Math.round((new Date(current.departure) - new Date(previous.arrival)) / 60000);
    if (!isFinite(minutes) || minutes < 0) return "";
    return Math.floor(minutes / 60) + "h " + (minutes % 60) + "m";
  }
  function quoteDecisionLabel(value) {
    if (value === "selected") return "Selected by customer";
    if (value === "not_selected") return "Not selected";
    return "Offered";
  }
  function renderQuoteFlightOption(option, optionNumber) {
    const journeys = option.journeys.map(function (journey) {
      const rows = journey.segments.map(function (segment, index) {
        const previous = journey.segments[index - 1];
        const layover = quoteLayover(previous, segment);
        const connection = index > 0
          ? '<tr class="quote-connection-row"><td colspan="5">Connection in ' + esc(previous.to || segment.from) + (layover ? " — " + esc(layover) : "") + "</td></tr>"
          : "";
        const carrier = esc(segment.airline) + " " + esc(segment.flightno) + (segment.operated_by ? "<br><small>Operated by " + esc(segment.operated_by) + "</small>" : "");
        const route = esc(segment.from) + " &rarr; " + esc(segment.to) +
          (segment.departure_terminal || segment.arrival_terminal ? "<br><small>" + esc(segment.departure_terminal ? "Dep " + segment.departure_terminal : "") + esc(segment.departure_terminal && segment.arrival_terminal ? " / " : "") + esc(segment.arrival_terminal ? "Arr " + segment.arrival_terminal : "") + "</small>" : "");
        return connection + "<tr><td>" + (index + 1) + "</td><td>" + carrier +
          "</td><td>" + route + "</td><td>" + esc(fmtDateTime(segment.departure)) +
          "</td><td>" + esc(fmtDateTime(segment.arrival)) + "</td></tr>";
      }).join("");
      const journeyLabel = journey.direction === "return" ? "Return journey" : journey.direction === "itinerary" ? "Flight itinerary" : "Onward journey";
      return '<h3 class="quote-journey-title">' + esc(journeyLabel) + "</h3>" +
        "<table><thead><tr><th>Leg</th><th>Flight</th><th>Route</th><th>Departure</th><th>Arrival</th></tr></thead><tbody>" + rows + "</tbody></table>";
    }).join("");
    return (
      '<section class="print-quote-option">' +
        '<div class="print-quote-option-head"><div><span>Option ' + optionNumber + '</span><b>' + esc(option.label) + '</b></div><strong>' + money(option.price, option.currency) + " / person</strong></div>" +
        '<div class="kv quote-option-meta"><span class="k">Trip</span><span class="v">' + esc(option.trip_type === "oneway" ? "One way" : option.trip_type === "multicity" ? "Multi-city" : "Round trip") + "</span>" +
          '<span class="k">Customer decision</span><span class="v">' + esc(quoteDecisionLabel(option.customer_decision)) + "</span>" +
          (option.cabin ? '<span class="k">Class</span><span class="v">' + esc(option.cabin) + "</span>" : "") +
          (option.fare_basis ? '<span class="k">Booking class / fare basis</span><span class="v">' + esc(option.fare_basis) + "</span>" : "") +
          (option.booking_status ? '<span class="k">Booking status</span><span class="v">' + esc(option.booking_status) + "</span>" : "") +
          (option.baggage ? '<span class="k">Baggage</span><span class="v">' + esc(option.baggage) + "</span>" : "") +
          (option.fare_note ? '<span class="k">Fare note</span><span class="v">' + esc(option.fare_note) + "</span>" : "") +
          (option.pnr ? '<span class="k">Quote / reservation ref</span><span class="v">' + esc(option.pnr) + "</span>" : "") +
          (option.base_fare ? '<span class="k">Base fare / person</span><span class="v">' + money(option.base_fare, option.currency) + "</span>" : "") +
          (option.taxes ? '<span class="k">Taxes / fees / person</span><span class="v">' + money(option.taxes, option.currency) + "</span>" : "") +
          (option.payment_deadline ? '<span class="k">Payment deadline</span><span class="v">' + esc(fmtDateTime(option.payment_deadline)) + "</span>" : "") +
          (option.extras && option.extras.length ? '<span class="k">Extras included</span><span class="v">' + esc(option.extras.join(", ")) + "</span>" : "") +
        "</div>" + journeys +
        (option.airline_rules ? "<h3>Airline rules</h3><p class='note'>" + nl2br(option.airline_rules) + "</p>" : "") +
      "</section>"
    );
  }
  function renderQuoteGenericOption(option, optionNumber, service, currency) {
    const preset = QUOTE_SERVICE_PRESETS[service] || QUOTE_SERVICE_PRESETS.other;
    const details = preset.fields.map(function (field) {
      const value = option.details && option.details[field[0]];
      return value ? '<span class="k">' + esc(field[1]) + '</span><span class="v">' + nl2br(value) + "</span>" : "";
    }).join("");
    return (
      '<section class="print-quote-option">' +
        '<div class="print-quote-option-head"><div><span>Option ' + optionNumber + '</span><b>' + esc(option.label) + '</b></div><strong>' + money(option.price, currency) + (option.price_basis && option.price_basis !== "total" ? " / " + esc(option.price_basis.replace(/^per /, "")) : " total") + "</strong></div>" +
        '<div class="kv quote-option-meta"><span class="k">Customer decision</span><span class="v">' + esc(quoteDecisionLabel(option.customer_decision)) + "</span>" + details + "</div>" +
      "</section>"
    );
  }
  function renderQuotation(data, docNumber, documentLabel) {
    const servicePreset = QUOTE_SERVICE_PRESETS[data.service] || QUOTE_SERVICE_PRESETS.other;
    const options = (data.options || []).slice().sort(function (a, b) { return num(a.price) - num(b.price); });
    const summary = options.map(function (option, index) {
      const basis = data.service === "flight" ? " / person" : option.price_basis && option.price_basis !== "total" ? " / " + esc(option.price_basis.replace(/^per /, "")) : " total";
      return "<tr><td>Option " + (index + 1) + "</td><td>" + esc(option.label) + "</td><td>" + (index === 0 ? "Lowest price" : "Alternative") + "</td><td><b>" + money(option.price, data.currency) + basis + "</b></td></tr>";
    }).join("");
    const detail = options.map(function (option, index) {
      if (data.service === "flight") {
        option.currency = data.currency;
        return renderQuoteFlightOption(option, index + 1);
      }
      return renderQuoteGenericOption(option, index + 1, data.service, data.currency);
    }).join("");
    return (
      letterheadHTML(documentLabel || (servicePreset.label + " Quote / Proposed Itinerary"), docNumber, todayISO()) +
      '<div class="kv"><span class="k">Prepared for</span><span class="v">' + esc(data.customer_name) + "</span>" +
        (data.customer_email ? '<span class="k">Email</span><span class="v">' + esc(data.customer_email) + "</span>" : "") +
        (data.customer_phone ? '<span class="k">Phone / WhatsApp</span><span class="v">' + esc(data.customer_phone) + "</span>" : "") +
        (data.travellers ? '<span class="k">Travellers / guests</span><span class="v">' + nl2br(data.travellers) + "</span>" : "") +
        (data.valid_until ? '<span class="k">Valid until</span><span class="v">' + esc(fmtDateTime(data.valid_until)) + "</span>" : "") +
        (data.reference ? '<span class="k">Kridiya reference</span><span class="v">' + esc(data.reference) + "</span>" : "") +
      "</div>" +
      "<h2>Options at a glance</h2>" +
      "<table><thead><tr><th>Option</th><th>Provider / package</th><th>Position</th><th>Price</th></tr></thead><tbody>" + summary + "</tbody></table>" +
      detail +
      '<div class="box"><p class="note" style="margin:0">This is a proposed itinerary/quote and not an issued ticket, voucher, visa approval, insurance policy, or supplier confirmation. Fare, seat, room, cabin, visa, insurance, package and service availability may change until payment and final supplier confirmation.</p></div>' +
      (data.terms ? "<h2>Important terms</h2><p class='note'>" + nl2br(data.terms) + "</p>" : "")
    );
  }

  /* ---- Invoice ---- */
  function buildFormInvoice(mount) {
    mount.innerHTML =
      '<div class="field-row doc-invoice-customer-row">' +
        '<div class="field col-6"><label>BILL TO</label><input name="customer_name" required value="' + esc(prefillName()) + '"></div>' +
        '<div class="field col-6"><label>EMAIL</label><input name="customer_email" type="email" value="' + esc(prefillEmail()) + '"></div>' +
        '<div class="field col-6"><label>INVOICE DATE</label><input name="invoice_date" type="date" value="' + todayISO() + '"></div>' +
        '<div class="field col-6"><label>CURRENCY</label><input class="currency-input" name="currency" value="AED" maxlength="3"></div>' +
        '<div class="field col-12"><label>SERVICE / INVOICE TYPE</label><select name="invoice_service" id="invoice-service">' +
          Object.keys(INVOICE_SERVICE_PRESETS).map(function (k) { return '<option value="' + esc(k) + '">' + esc(INVOICE_SERVICE_PRESETS[k].label) + "</option>"; }).join("") +
        "</select></div>" +
      "</div>" +
      '<div id="invoice-doc-requirements"></div>' +
      '<h3 class="doc-subhead">Line items</h3>' +
      '<div id="rep-items"></div>' +
      '<button type="button" id="add-item" class="btn btn-outline doc-add-repeat">+ Add line item</button>' +
      '<div class="doc-addon-chips" id="inv-addons"><span class="doc-addon-chips-label">Quick add:</span>' +
        INVOICE_EXTRAS.map(function (a) { return '<button type="button" class="chip-add" data-addon="' + esc(a) + '">+ ' + esc(a) + "</button>"; }).join("") +
      "</div>" +
      '<div class="field-row doc-money-row">' +
        '<div class="field col-4"><label>DISCOUNT (' + esc((settings && settings.default_currency) || "AED") + ')</label><input name="discount" type="number" min="0" step="0.01" placeholder="0.00"></div>' +
        '<div class="field col-4"><label>AMOUNT PAID / ADVANCE</label><input name="amount_paid" type="number" min="0" step="0.01" placeholder="0.00"></div>' +
        '<div class="field col-4"><label>VAT</label><input value="' + (isVatRegistered() ? "5% (VAT registered)" : "Not applied") + '" disabled></div>' +
      "</div>" +
      '<div class="field"><label>NOTES / TERMS</label><textarea name="notes">' + esc((settings && settings.invoice_footer_note) || "") + "</textarea></div>" +
      '<div class="field"><label>STRIPE PAYMENT LINK (OPTIONAL)</label><input name="payment_link" placeholder="https://buy.stripe.com/..."></div>';
    const repeat = renderRepeatable("rep-items", "add-item", function (i) {
      return (
        '<div class="field-row repeat-field-row">' +
        '<div class="field col-6"><label>DESCRIPTION</label><input name="desc_' + i + '" placeholder="e.g. Flight ticket, Dubai to Kochi"></div>' +
        '<div class="field col-2"><label>QTY</label><input name="qty_' + i + '" type="number" min="1" value="1"></div>' +
        '<div class="field col-4"><label>UNIT PRICE</label><input name="price_' + i + '" type="number" min="0" step="0.01" value="0"></div>' +
        "</div>"
      );
    }, 1);
    function applyInvoicePreset(service) {
      const preset = INVOICE_SERVICE_PRESETS[service] || INVOICE_SERVICE_PRESETS.other;
      repeat.clear();
      preset.items.forEach(function (item) {
        repeat.addRow();
        const rows = rowsOf("rep-items");
        const last = rows[rows.length - 1];
        const descEl = last && last.querySelector('input[name^="desc_"]');
        if (descEl) descEl.value = item;
      });
      const notesEl = mount.querySelector('textarea[name="notes"]');
      if (notesEl) notesEl.value = preset.note;
      const reqEl = document.getElementById("invoice-doc-requirements");
      if (reqEl) reqEl.innerHTML = requirementListHTML(service);
      const chips = document.getElementById("inv-addons");
      if (chips) {
        chips.innerHTML = '<span class="doc-addon-chips-label">Quick add:</span>' +
          preset.extras.map(function (a) { return '<button type="button" class="chip-add" data-addon="' + esc(a) + '">+ ' + esc(a) + "</button>"; }).join("");
      }
    }
    const serviceSel = document.getElementById("invoice-service");
    if (linkedEnquiry && linkedEnquiry.service_type && INVOICE_SERVICE_PRESETS[linkedEnquiry.service_type]) {
      serviceSel.value = linkedEnquiry.service_type;
    }
    applyInvoicePreset(serviceSel.value);
    serviceSel.addEventListener("change", function () { applyInvoicePreset(serviceSel.value); });
    /* Quick-add chips append a pre-labelled line item, ready for its price. */
    const chips = document.getElementById("inv-addons");
    const addBtn = document.getElementById("add-item");
    if (chips && addBtn) {
      chips.addEventListener("click", function (e) {
        const b = e.target.closest("[data-addon]");
        if (!b) return;
        addBtn.click();
        const rows = rowsOf("rep-items");
        const last = rows[rows.length - 1];
        if (!last) return;
        const descEl = last.querySelector('input[name^="desc_"]');
        if (descEl) { descEl.value = b.dataset.addon; }
        const priceEl = last.querySelector('input[name^="price_"]');
        if (priceEl) { priceEl.focus(); priceEl.select(); }
      });
    }
  }
  function gatherInvoice(form) {
    const items = rowsOf("rep-items").map(function (row) {
      const idx = row.dataset.index;
      return {
        description: fieldVal(row, "desc_" + idx),
        qty: parseFloat(fieldVal(row, "qty_" + idx)) || 1,
        unit_price: parseFloat(fieldVal(row, "price_" + idx)) || 0
      };
    }).filter(function (it) { return it.description; });
    const currency = (form.currency.value || "AED").toUpperCase();
    const subtotal = items.reduce(function (s, it) { return s + it.qty * it.unit_price; }, 0);
    const discount = Math.min(Math.max(0, num(form.discount && form.discount.value)), subtotal);
    const taxable = Math.max(0, subtotal - discount);
    const vatApplies = isVatRegistered();
    const vat = vatApplies ? Math.round(taxable * VAT_RATE * 100) / 100 : 0;
    const total = Math.round((taxable + vat) * 100) / 100;
    const paid = Math.max(0, num(form.amount_paid && form.amount_paid.value));
    const balance = Math.round((total - paid) * 100) / 100;
    return {
      customer_name: form.customer_name.value.trim(),
      customer_email: form.customer_email.value.trim(),
      invoice_service: form.invoice_service ? form.invoice_service.value : "flight",
      invoice_date: form.invoice_date.value || todayISO(),
      currency: currency,
      items: items,
      subtotal: subtotal,
      discount: discount,
      vat_applies: vatApplies,
      vat: vat,
      total: total,
      paid: paid,
      balance: balance,
      notes: form.notes.value.trim(),
      payment_link: form.payment_link.value.trim()
    };
  }
  function renderInvoice(data, docNumber) {
    const rows = data.items.map(function (it) {
      return "<tr><td>" + esc(it.description) + "</td><td>" + it.qty + "</td><td>" + money(it.unit_price, data.currency) + "</td><td>" + money(it.qty * it.unit_price, data.currency) + "</td></tr>";
    }).join("");
    const vatNote = data.vat_applies ? "" : "<h2>VAT</h2><p class='note'>VAT is not applied. KRIDIYA Travel and Tourism FZ-LLC is not VAT registered at this time.</p>";
    return (
      letterheadHTML("Invoice", docNumber, data.invoice_date) +
      '<div class="kv"><span class="k">Bill to</span><span class="v">' + esc(data.customer_name) + "</span>" +
        (data.customer_email ? '<span class="k">Email</span><span class="v">' + esc(data.customer_email) + "</span>" : "") +
        '<span class="k">Service</span><span class="v">' + esc((INVOICE_SERVICE_PRESETS[data.invoice_service] && INVOICE_SERVICE_PRESETS[data.invoice_service].label) || data.invoice_service) + "</span>" +
        (linkedEnquiry ? '<span class="k">Reference</span><span class="v">' + esc(linkedEnquiry.reference) + "</span>" : "") +
      "</div>" +
      "<h2>Charges</h2>" +
      "<table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>" + rows + "</tbody></table>" +
      '<table class="totals" style="max-width:340px;margin-left:auto;margin-top:0.4rem">' +
        '<tr><td class="label">Subtotal</td><td>' + money(data.subtotal, data.currency) + "</td></tr>" +
        (data.discount > 0 ? '<tr><td class="label">Discount</td><td>&minus; ' + money(data.discount, data.currency) + "</td></tr>" : "") +
        (data.vat_applies ? '<tr><td class="label">VAT (5%)</td><td>' + money(data.vat, data.currency) + "</td></tr>" : "") +
        '<tr class="grand"><td class="label">Total' + (data.paid > 0 ? "" : " due") + '</td><td>' + money(data.total, data.currency) + "</td></tr>" +
        (data.paid > 0 ? '<tr><td class="label">Amount paid</td><td>&minus; ' + money(data.paid, data.currency) + "</td></tr>" : "") +
        (data.paid > 0 ? '<tr class="grand"><td class="label">Balance due</td><td>' + money(data.balance, data.currency) + "</td></tr>" : "") +
      "</table>" +
      (data.payment_link ? '<div class="box"><b style="font-family:Arial,sans-serif;font-size:0.8rem">Pay online</b><p class="note" style="margin:0.4rem 0 0">' + esc(data.payment_link) + "</p></div>" : "") +
      bankBoxHTML() +
      vatNote +
      (data.notes ? "<h2>Notes</h2><p class='note'>" + nl2br(data.notes) + "</p>" : "")
    );
  }

  /* ---- Flight e-ticket (one-way / round-trip / multi-city share the same builder, leg count differs) ---- */
  function buildFormFlightDocument(mount, fixedTripType, legCount) {
    mount.innerHTML =
      '<div class="field-row">' +
        '<div class="field col-6"><label>DOCUMENT PURPOSE</label><select name="document_purpose" id="flight-document-purpose"><option value="quote">Quote / Proposed itinerary</option><option value="issued">Issued e-ticket</option></select></div>' +
      "</div>" +
      '<div id="flight-document-fields"></div>';
    const purposeSel = mount.querySelector('[name="document_purpose"]');
    const inner = mount.querySelector("#flight-document-fields");
    function renderPurposeForm() {
      if (purposeSel.value === "issued") {
        buildFormFlight(inner, legCount);
      } else {
        buildFormQuotation(inner, "flight", fixedTripType);
      }
    }
    purposeSel.addEventListener("change", renderPurposeForm);
    renderPurposeForm();
  }
  function gatherFlightDocument(form) {
    const purpose = namedVal(form, "document_purpose") || "quote";
    if (purpose === "issued") return gatherFlight(form);
    return gatherQuotation(form);
  }
  function buildFormFlight(mount, legCount) {
    mount.innerHTML =
      '<div id="rep-legs"></div>' +
      (legCount === "multi" ? '<button type="button" id="add-item" class="btn btn-outline doc-add-repeat">+ Add flight leg</button>' : "") +
      '<div class="doc-repeat-section">' +
        '<div class="doc-repeat-head"><div><h3>Passengers</h3><p>Add each passenger separately. Ticket number can stay pending if the supplier does not show it yet.</p></div><button type="button" id="add-ticket-passenger" class="btn btn-outline">+ Add passenger</button></div>' +
        '<div id="rep-ticket-passengers" class="doc-repeat-stack"></div>' +
      '</div>' +
      '<div class="field-row doc-ticket-form-row">' +
        '<div class="field doc-span-3"><label>CLASS</label><input name="cabin" data-preset="cabin" value="Economy"></div>' +
        '<div class="field doc-span-3"><label>AIRLINE PNR / BOOKING REF</label><input name="pnr"></div>' +
        '<div class="field doc-span-3"><label>CHECK-IN BAGGAGE (KG)</label><input name="checkin_baggage_kg" type="number" min="0" step="1" value="0" inputmode="numeric"></div>' +
        '<div class="field doc-span-3"><label>CABIN BAGGAGE (KG)</label><input name="cabin_baggage_kg" type="number" min="0" step="1" value="0" inputmode="numeric"></div>' +
        '<div class="field doc-span-3"><label>ISSUE DATE</label><input name="issue_date" type="date" value="' + todayISO() + '"></div>' +
        '<div class="field doc-span-3"><label>ISSUING AIRLINE</label><input name="issuing_airline" data-preset="airline"></div>' +
        '<div class="field doc-span-3"><label>BOOKING STATUS</label><input name="booking_status" data-preset="booking_status" placeholder="Confirmed / Ticketed"></div>' +
        '<div class="field doc-span-3"><label>BOOKING CLASS / FARE BASIS</label><input name="fare_basis" placeholder="e.g. V / Saver"></div>' +
        '<div class="field doc-span-3"><label>BASE FARE</label><input name="base_fare" type="number" min="0" step="0.01"></div>' +
        '<div class="field doc-span-3"><label>TAXES / FEES</label><input name="taxes" type="number" min="0" step="0.01"></div>' +
        '<div class="field doc-span-3"><label>TOTAL PAID</label><input name="total_paid" type="number" min="0" step="0.01"></div>' +
        '<div class="field doc-span-3"><label>CURRENCY</label><input class="currency-input" name="currency" value="AED" maxlength="3"></div>' +
        '<div class="field doc-span-4"><label>PAYMENT STATUS</label><input name="payment_status" placeholder="Paid / Balance due"></div>' +
        '<div class="field doc-span-4"><label>PAYMENT METHOD</label><input name="payment_method" data-preset="payment_method" placeholder="Cash / bank transfer / card"></div>' +
        '<div class="field doc-span-4"><label>AIRLINE RECORD LOCATOR</label><input name="airline_locator" placeholder="If different from PNR"></div>' +
        '<div class="field doc-span-4"><label>TICKET QR / BARCODE IMAGE</label><input name="ticket_barcode_file" type="file" accept="image/*"><small>Optional. Upload the real QR/barcode image from airline or supplier.</small></div>' +
        '<div class="field doc-span-4"><label>TICKET QR / BARCODE IMAGE URL</label><input name="ticket_barcode_url" placeholder="Optional image link"></div>' +
        '<div class="field doc-span-4"><label>TICKET QR / BARCODE VALUE</label><input name="ticket_barcode_value" placeholder="Optional code/reference text"></div>' +
        '<div class="field doc-span-12 doc-tall-field"><label>CHANGE / CANCELLATION / NO-SHOW RULES</label><textarea name="airline_rules" placeholder="Paste the airline fare rules or the key rule summary."></textarea></div>' +
        addonChecksHTML("flight_addon") +
      "</div>";
    renderRepeatable("rep-ticket-passengers", "add-ticket-passenger", function (i) {
      return (
        '<div class="field-row doc-passenger-box">' +
          '<div class="field doc-span-6"><label>PASSENGER #' + (i + 1) + ' NAME</label><input name="passenger_name_' + i + '" value="' + (i === 0 ? esc(prefillName()) : "") + '" placeholder="Name as per passport"></div>' +
          '<div class="field doc-span-6"><label>TICKET NUMBER <span class="label-soft">(OPTIONAL)</span></label><input name="passenger_ticket_' + i + '" placeholder="13-digit number if shown, or leave blank"></div>' +
        "</div>"
      );
    }, 1);
    const initial = legCount === "round" ? 2 : 1;
    renderRepeatable("rep-legs", "add-item", function (i) {
      return (
        '<div class="field-row repeat-field-row">' +
        '<div class="field col-3"><label>AIRLINE</label><input name="airline_' + i + '" data-preset="airline"></div>' +
        '<div class="field col-3"><label>OPERATED BY</label><input name="operated_by_' + i + '" placeholder="If different"></div>' +
        '<div class="field col-3"><label>FLIGHT NO.</label><input name="flightno_' + i + '"></div>' +
        '<div class="field col-3"><label>FROM</label><input name="from_' + i + '" data-airport placeholder="Dubai (DXB)"></div>' +
        '<div class="field col-3"><label>TO</label><input name="to_' + i + '" data-airport placeholder="Kochi (COK)"></div>' +
        '<div class="field col-3"><label>DEPARTURE TERMINAL</label><input name="departure_terminal_' + i + '" placeholder="e.g. T1"></div>' +
        '<div class="field col-3"><label>ARRIVAL TERMINAL</label><input name="arrival_terminal_' + i + '" placeholder="e.g. T3"></div>' +
        '<div class="field col-4"><label>DATE</label><input name="date_' + i + '" type="date"></div>' +
        '<div class="field col-4"><label>DEPART</label><input name="deptime_' + i + '" type="time"></div>' +
        '<div class="field col-4"><label>ARRIVE</label><input name="arrtime_' + i + '" type="time"></div>' +
        "</div>"
      );
    }, legCount === "multi" ? 2 : initial);
    /* Attach airport autocomplete now, and again after each new leg is added.
       Guarded so it's a no-op if airport-ac.js failed to load. */
    if (typeof initAirportAC === "function") {
      initAirportAC(mount);
      const legAddBtn = document.getElementById("add-item");
      if (legAddBtn) legAddBtn.addEventListener("click", function () { setTimeout(function () { initAirportAC(mount); }, 0); });
    }
    if (typeof initPresetAC === "function") {
      initPresetAC(mount);
      const legAddBtn = document.getElementById("add-item");
      if (legAddBtn) legAddBtn.addEventListener("click", function () { setTimeout(function () { initPresetAC(mount); }, 0); });
    }
  }
  function gatherFlight(form) {
    const passengerRecords = rowsOf("rep-ticket-passengers").map(function (row) {
      const idx = row.dataset.index;
      return {
        name: fieldVal(row, "passenger_name_" + idx),
        ticket_number: fieldVal(row, "passenger_ticket_" + idx)
      };
    }).filter(function (p) { return p.name || p.ticket_number; });
    const legs = rowsOf("rep-legs").map(function (row) {
      const idx = row.dataset.index;
      return {
        airline: fieldVal(row, "airline_" + idx),
        operated_by: fieldVal(row, "operated_by_" + idx),
        flightno: fieldVal(row, "flightno_" + idx),
        from: fieldVal(row, "from_" + idx),
        to: fieldVal(row, "to_" + idx),
        departure_terminal: fieldVal(row, "departure_terminal_" + idx),
        arrival_terminal: fieldVal(row, "arrival_terminal_" + idx),
        date: fieldVal(row, "date_" + idx),
        deptime: fieldVal(row, "deptime_" + idx),
        arrtime: fieldVal(row, "arrtime_" + idx)
      };
    }).filter(function (l) { return l.from || l.to; });
    const data = {
      legs: legs,
      passenger_records: passengerRecords,
      passengers: passengerRecords.map(function (p) { return p.name; }).filter(Boolean).join("\n"),
      cabin: namedVal(form, "cabin"),
      checkin_baggage_kg: namedVal(form, "checkin_baggage_kg") || "0",
      cabin_baggage_kg: namedVal(form, "cabin_baggage_kg") || "0",
      pnr: namedVal(form, "pnr"),
      ticket_numbers: passengerRecords.map(function (p) {
        return p.ticket_number ? ((p.name ? p.name + " - " : "") + p.ticket_number) : "";
      }).filter(Boolean).join("\n"),
      ticket_barcode_url: namedVal(form, "ticket_barcode_url"),
      ticket_barcode_value: namedVal(form, "ticket_barcode_value"),
      ticket_barcode_image: "",
      ticket_barcode_file_name: "",
      issue_date: namedVal(form, "issue_date") || todayISO(),
      issuing_airline: namedVal(form, "issuing_airline"),
      booking_status: namedVal(form, "booking_status"),
      fare_basis: namedVal(form, "fare_basis"),
      base_fare: namedVal(form, "base_fare") ? parseFloat(namedVal(form, "base_fare")) : null,
      taxes: namedVal(form, "taxes") ? parseFloat(namedVal(form, "taxes")) : null,
      total_paid: namedVal(form, "total_paid") ? parseFloat(namedVal(form, "total_paid")) : null,
      currency: (namedVal(form, "currency") || "AED").toUpperCase(),
      payment_status: namedVal(form, "payment_status"),
      payment_method: namedVal(form, "payment_method"),
      airline_locator: namedVal(form, "airline_locator"),
      airline_rules: namedVal(form, "airline_rules"),
      extras: gatherAddonChecks(form, "flight_addon")
    };
    const missing = [];
    if (!data.passengers) missing.push("passenger name");
    if (!data.pnr) missing.push("airline PNR / booking ref");
    if (!data.issue_date) missing.push("issue date");
    if (!data.issuing_airline) missing.push("issuing airline");
    if (!data.legs.length) missing.push("at least one flight leg");
    data.legs.forEach(function (leg, index) {
      if (!leg.from || !leg.to || !leg.date || !leg.deptime) missing.push("complete route/date/time for leg " + (index + 1));
    });
    if (missing.length) throw new Error("Issued e-ticket needs: " + missing.join(", ") + ".");
    data.document_purpose = "issued";
    data.document_type_override = "eticket";
    return data;
  }
  function renderFlight(data, docNumber, tripLabel) {
    const legRows = data.legs.map(function (l, i) {
      return (
        "<tr><td>" + (i + 1) + "</td><td>" + esc(l.airline) + " " + esc(l.flightno) + "</td><td>" + esc(l.from) + " &rarr; " + esc(l.to) +
        "</td><td>" + fmtDate(l.date) + "</td><td>" + esc(l.deptime) + " &ndash; " + esc(l.arrtime) + "</td></tr>"
      );
    }).join("");
    return (
      letterheadHTML("E-Ticket — " + tripLabel + " Flight", docNumber, todayISO()) +
      passengerSummaryHTML(data) +
      '<div class="kv">' +
        '<span class="k">Class</span><span class="v">' + esc(data.cabin) + "</span>" +
        '<span class="k">Check-in baggage</span><span class="v">' + esc(data.checkin_baggage_kg || "0") + " kg</span>" +
        '<span class="k">Cabin baggage</span><span class="v">' + esc(data.cabin_baggage_kg || "0") + " kg</span>" +
        (data.extras && data.extras.length ? '<span class="k">Extras included</span><span class="v">' + esc(data.extras.join(", ")) + "</span>" : "") +
        (data.pnr ? '<span class="k">Airline PNR</span><span class="v">' + esc(data.pnr) + "</span>" : "") +
        (linkedEnquiry ? '<span class="k">Kridiya reference</span><span class="v">' + esc(linkedEnquiry.reference) + "</span>" : "") +
      "</div>" +
      "<h2>Flight details</h2>" +
      "<table><thead><tr><th>Leg</th><th>Flight</th><th>Route</th><th>Date</th><th>Time</th></tr></thead><tbody>" + legRows + "</tbody></table>" +
      '<div class="box"><p class="note" style="margin:0">Please arrive at the airport at least 3 hours before departure for international flights. Carry a valid passport/visa as required for your destination. Contact Kridiya Travel immediately if any flight time changes.</p></div>'
    );
  }

  function renderIssuedFlight(data, docNumber, tripLabel) {
    const legRows = data.legs.map(function (l, i) {
      const carrier = esc(l.airline) + " " + esc(l.flightno) + (l.operated_by ? "<br><small>Operated by " + esc(l.operated_by) + "</small>" : "");
      const route = esc(l.from) + " &rarr; " + esc(l.to) +
        (l.departure_terminal || l.arrival_terminal ? "<br><small>" + esc(l.departure_terminal ? "Dep " + l.departure_terminal : "") + esc(l.departure_terminal && l.arrival_terminal ? " / " : "") + esc(l.arrival_terminal ? "Arr " + l.arrival_terminal : "") + "</small>" : "");
      return (
        "<tr><td>" + (i + 1) + "</td><td>" + carrier + "</td><td>" + route +
        "</td><td>" + fmtDate(l.date) + "</td><td>" + esc(l.deptime) + " &ndash; " + esc(l.arrtime) + "</td></tr>"
      );
    }).join("");
    return (
      letterheadHTML("E-Ticket — " + tripLabel + " Flight", docNumber, data.issue_date || todayISO()) +
      issuedPassengerPanelHTML(data) +
      issuedTicketMetaHTML(data) +
      "<h2>Flight details</h2>" +
      "<table><thead><tr><th>Leg</th><th>Flight</th><th>Route</th><th>Date</th><th>Time</th></tr></thead><tbody>" + legRows + "</tbody></table>" +
      (data.airline_rules ? "<h2>Change / cancellation / no-show rules</h2><p class='note'>" + nl2br(data.airline_rules) + "</p>" : "") +
      '<div class="box"><p class="note" style="margin:0">This is an issued e-ticket itinerary. Boarding pass barcode or QR code is only shown when provided by the airline or supplier. Kridiya Travel does not generate airline boarding codes.</p></div>'
    );
  }

  function passengerSummaryHTML(data) {
    const records = passengerRecords(data);
    if (!records.length) return "";
    return '<h2>Passenger details</h2><table><thead><tr><th>Passenger</th><th>Ticket number</th></tr></thead><tbody>' + records.map(function (p) {
      return '<tr><td>' + esc(p.name || "-") + '</td><td>' + esc(p.ticket_number || "Not shown / pending") + '</td></tr>';
    }).join("") + "</tbody></table>";
  }

  function passengerRecords(data) {
    const ticketLines = String(data.ticket_numbers || "").split(/\n+/).filter(Boolean);
    return data.passenger_records && data.passenger_records.length
      ? data.passenger_records
      : String(data.passengers || "").split(/\n+/).filter(Boolean).map(function (name, index) { return { name: name, ticket_number: ticketLines[index] || "" }; });
  }

  function ticketBarcodeImageHTML(data) {
    const src = data.ticket_barcode_image || data.ticket_barcode_url || "";
    if (!src && !data.ticket_barcode_value) return '<div class="ticket-code-placeholder">No QR / barcode attached</div>';
    return (src ? '<img class="ticket-code-img" src="' + esc(src) + '" alt="Ticket QR or barcode">' : "") +
      (data.ticket_barcode_value ? '<div class="ticket-code-value">' + esc(data.ticket_barcode_value) + "</div>" : "");
  }

  function issuedPassengerPanelHTML(data) {
    const records = passengerRecords(data);
    if (!records.length) return "";
    return '<h2>Traveller(s) information</h2><div class="ticket-panel"><div class="ticket-panel-head">Onward</div>' + records.map(function (p, index) {
      return '<div class="ticket-passenger-row">' +
        '<div class="ticket-code-slot">' + (index === 0 ? ticketBarcodeImageHTML(data) : "") + "</div>" +
        '<div class="ticket-passenger-name"><span>Name</span><b>' + esc(p.name || "-") + '</b><span style="margin-top:0.45rem">Ticket no.</span><b>' + esc(p.ticket_number || "Not shown / pending") + "</b></div>" +
        '<div class="ticket-passenger-extra"><span>Purchased add-ons</span><b>' + esc(data.extras && data.extras.length ? data.extras.join(", ") : "Nil") + '</b><span style="margin-top:0.45rem">Baggage</span><b>Check-in ' + esc(data.checkin_baggage_kg || "0") + " kg / Cabin " + esc(data.cabin_baggage_kg || "0") + " kg</b></div>" +
      "</div>";
    }).join("") + "</div>";
  }

  function metaItemHTML(labelText, value) {
    return value == null || value === "" ? "" : '<div class="ticket-meta-item"><span>' + esc(labelText) + '</span><b>' + esc(value) + "</b></div>";
  }

  function issuedTicketMetaHTML(data) {
    const items =
      metaItemHTML("Class", data.cabin) +
      metaItemHTML("Issuing airline", data.issuing_airline) +
      metaItemHTML("Booking status", data.booking_status) +
      metaItemHTML("Fare basis", data.fare_basis) +
      metaItemHTML("Check-in baggage", (data.checkin_baggage_kg || "0") + " kg") +
      metaItemHTML("Cabin baggage", (data.cabin_baggage_kg || "0") + " kg") +
      metaItemHTML("Airline PNR", data.pnr) +
      metaItemHTML("Record locator", data.airline_locator) +
      metaItemHTML("Base fare", data.base_fare != null ? money(data.base_fare, data.currency) : "") +
      metaItemHTML("Taxes / fees", data.taxes != null ? money(data.taxes, data.currency) : "") +
      metaItemHTML("Total paid", data.total_paid != null ? money(data.total_paid, data.currency) : "") +
      metaItemHTML("Payment", [data.payment_status, data.payment_method].filter(Boolean).join(" / ")) +
      (linkedEnquiry ? metaItemHTML("Kridiya reference", linkedEnquiry.reference) : "");
    return items ? '<div class="ticket-meta-grid">' + items + "</div>" : "";
  }

  function ticketBarcodeHTML(data) {
    if (!data.ticket_barcode_image && !data.ticket_barcode_url && !data.ticket_barcode_value) return "";
    const src = data.ticket_barcode_image || data.ticket_barcode_url || "";
    const img = src
      ? '<img class="ticket-code-img" src="' + esc(src) + '" alt="Ticket QR or barcode">'
      : "";
    const value = data.ticket_barcode_value
      ? '<div class="ticket-code-value">' + esc(data.ticket_barcode_value) + "</div>"
      : "";
    return '<h2>Ticket QR / Barcode</h2><div class="ticket-code-box">' + img + '<div><b>Airline/supplier provided code</b>' + value + '<p class="note" style="margin:0.35rem 0 0">Use only the real ticket QR/barcode or code value from the airline or supplier.</p></div></div>';
  }

  /* ---- Hotel e-ticket ---- */
  function buildFormHotel(mount) {
    mount.innerHTML =
      '<div class="field-row">' +
        '<div class="field col-6"><label>HOTEL NAME</label><input name="hotel_name"></div>' +
        '<div class="field col-6"><label>HOTEL ADDRESS / CITY</label><input name="hotel_address"></div>' +
        '<div class="field col-3"><label>CHECK-IN</label><input name="checkin" type="date"></div>' +
        '<div class="field col-3"><label>CHECK-OUT</label><input name="checkout" type="date"></div>' +
        '<div class="field col-3"><label>ROOM TYPE</label><input name="room_type" data-preset="room_type"></div>' +
        '<div class="field col-3"><label>MEAL PLAN</label><input name="meal_plan" data-preset="meal_plan" placeholder="e.g. Breakfast included"></div>' +
        '<div class="field col-6"><label>GUEST NAME(S), ONE PER LINE</label><textarea name="guests">' + esc(prefillName()) + "</textarea></div>" +
        '<div class="field col-6"><label>HOTEL CONFIRMATION NUMBER</label><input name="confirmation_no"></div>' +
      "</div>";
  }
  function gatherHotel(form) {
    return {
      hotel_name: form.hotel_name.value.trim(),
      hotel_address: form.hotel_address.value.trim(),
      checkin: form.checkin.value,
      checkout: form.checkout.value,
      room_type: form.room_type.value.trim(),
      meal_plan: form.meal_plan.value.trim(),
      guests: form.guests.value.trim(),
      confirmation_no: form.confirmation_no.value.trim()
    };
  }
  function renderHotel(data, docNumber) {
    const nights = (data.checkin && data.checkout)
      ? Math.max(1, Math.round((new Date(data.checkout) - new Date(data.checkin)) / 86400000))
      : "";
    return (
      letterheadHTML("E-Ticket — Hotel Voucher", docNumber, todayISO()) +
      '<div class="kv"><span class="k">Hotel</span><span class="v">' + esc(data.hotel_name) + "</span>" +
        (data.hotel_address ? '<span class="k">Address</span><span class="v">' + esc(data.hotel_address) + "</span>" : "") +
        '<span class="k">Check-in</span><span class="v">' + fmtDate(data.checkin) + "</span>" +
        '<span class="k">Check-out</span><span class="v">' + fmtDate(data.checkout) + (nights ? " (" + nights + " night" + (nights === 1 ? "" : "s") + ")" : "") + "</span>" +
        (data.room_type ? '<span class="k">Room type</span><span class="v">' + esc(data.room_type) + "</span>" : "") +
        (data.meal_plan ? '<span class="k">Meal plan</span><span class="v">' + esc(data.meal_plan) + "</span>" : "") +
        '<span class="k">Guest(s)</span><span class="v">' + nl2br(data.guests) + "</span>" +
        (data.confirmation_no ? '<span class="k">Confirmation no.</span><span class="v">' + esc(data.confirmation_no) + "</span>" : "") +
        (linkedEnquiry ? '<span class="k">Kridiya reference</span><span class="v">' + esc(linkedEnquiry.reference) + "</span>" : "") +
      "</div>" +
      '<div class="box"><p class="note" style="margin:0">Please present this voucher along with a valid ID/passport at check-in. Contact Kridiya Travel for any changes to this reservation.</p></div>'
    );
  }

  /* ---- Visa e-ticket (confirmation) ---- */
  function buildFormVisa(mount) {
    mount.innerHTML =
      '<div class="field-row">' +
        '<div class="field col-6"><label>VISA TYPE</label><input name="visa_type" placeholder="e.g. Tourist Visa, 30 days"></div>' +
        '<div class="field col-6"><label>DESTINATION COUNTRY</label><input name="country"></div>' +
        '<div class="field col-6"><label>APPLICANT NAME(S), ONE PER LINE</label><textarea name="applicants">' + esc(prefillName()) + "</textarea></div>" +
        '<div class="field col-6"><label>PASSPORT NUMBER(S)</label><textarea name="passport_nos"></textarea></div>' +
        '<div class="field col-3"><label>VALID FROM</label><input name="valid_from" type="date"></div>' +
        '<div class="field col-3"><label>VALID TO</label><input name="valid_to" type="date"></div>' +
        '<div class="field col-3"><label>ENTRY TYPE</label><input name="entry_type" placeholder="Single / Multiple"></div>' +
        '<div class="field col-3"><label>VISA FILE / REFERENCE NO.</label><input name="visa_ref"></div>' +
      "</div>";
  }
  function gatherVisa(form) {
    return {
      visa_type: form.visa_type.value.trim(),
      country: form.country.value.trim(),
      applicants: form.applicants.value.trim(),
      passport_nos: form.passport_nos.value.trim(),
      valid_from: form.valid_from.value,
      valid_to: form.valid_to.value,
      entry_type: form.entry_type.value.trim(),
      visa_ref: form.visa_ref.value.trim()
    };
  }
  function renderVisa(data, docNumber) {
    return (
      letterheadHTML("E-Ticket — Visa Confirmation", docNumber, todayISO()) +
      '<div class="kv"><span class="k">Visa type</span><span class="v">' + esc(data.visa_type) + "</span>" +
        '<span class="k">Destination</span><span class="v">' + esc(data.country) + "</span>" +
        '<span class="k">Applicant(s)</span><span class="v">' + nl2br(data.applicants) + "</span>" +
        (data.passport_nos ? '<span class="k">Passport no.</span><span class="v">' + nl2br(data.passport_nos) + "</span>" : "") +
        '<span class="k">Valid</span><span class="v">' + fmtDate(data.valid_from) + " &ndash; " + fmtDate(data.valid_to) + "</span>" +
        (data.entry_type ? '<span class="k">Entry type</span><span class="v">' + esc(data.entry_type) + "</span>" : "") +
        (data.visa_ref ? '<span class="k">Visa reference</span><span class="v">' + esc(data.visa_ref) + "</span>" : "") +
        (linkedEnquiry ? '<span class="k">Kridiya reference</span><span class="v">' + esc(linkedEnquiry.reference) + "</span>" : "") +
      "</div>" +
      '<div class="box"><p class="note" style="margin:0">Please check all details against your passport before travel. Visa conditions are set by the destination country\'s authorities, not Kridiya Travel.</p></div>'
    );
  }

  /* ---- Holiday / Umrah / Cruise e-tickets ---- */
  function buildFormHoliday(mount) {
    mount.innerHTML =
      '<div class="field-row">' +
        '<div class="field col-6"><label>DESTINATION</label><input name="destination"></div>' +
        '<div class="field col-3"><label>TRAVEL START</label><input name="date_from" type="date"></div>' +
        '<div class="field col-3"><label>TRAVEL END</label><input name="date_to" type="date"></div>' +
        '<div class="field col-6"><label>HOTEL(S)</label><input name="hotels"></div>' +
        '<div class="field col-6"><label>INCLUSIONS</label><input name="inclusions" placeholder="Flights, transfers, breakfast, tours…"></div>' +
        '<div class="field col-12"><label>TRAVELLER NAME(S), ONE PER LINE</label><textarea name="travellers">' + esc(prefillName()) + "</textarea></div>" +
      "</div>";
  }
  function gatherHoliday(form) {
    return {
      destination: form.destination.value.trim(),
      date_from: form.date_from.value,
      date_to: form.date_to.value,
      hotels: form.hotels.value.trim(),
      inclusions: form.inclusions.value.trim(),
      travellers: form.travellers.value.trim()
    };
  }
  function renderHoliday(data, docNumber) {
    return (
      letterheadHTML("E-Ticket — Holiday Package", docNumber, todayISO()) +
      '<div class="kv"><span class="k">Destination</span><span class="v">' + esc(data.destination) + "</span>" +
        '<span class="k">Dates</span><span class="v">' + fmtDate(data.date_from) + " &ndash; " + fmtDate(data.date_to) + "</span>" +
        (data.hotels ? '<span class="k">Hotel(s)</span><span class="v">' + esc(data.hotels) + "</span>" : "") +
        (data.inclusions ? '<span class="k">Inclusions</span><span class="v">' + esc(data.inclusions) + "</span>" : "") +
        '<span class="k">Traveller(s)</span><span class="v">' + nl2br(data.travellers) + "</span>" +
        (linkedEnquiry ? '<span class="k">Kridiya reference</span><span class="v">' + esc(linkedEnquiry.reference) + "</span>" : "") +
      "</div>"
    );
  }

  function buildFormUmrah(mount) {
    mount.innerHTML =
      '<div class="field-row">' +
        '<div class="field col-6"><label>DEPARTURE CITY</label><input name="departure_city"></div>' +
        '<div class="field col-6"><label>TRANSPORT</label><input name="transport" placeholder="Bus / Flight"></div>' +
        '<div class="field col-3"><label>TRAVEL START</label><input name="date_from" type="date"></div>' +
        '<div class="field col-3"><label>TRAVEL END</label><input name="date_to" type="date"></div>' +
        '<div class="field col-3"><label>HOTEL — MAKKAH</label><input name="hotel_makkah"></div>' +
        '<div class="field col-3"><label>HOTEL — MADINAH</label><input name="hotel_madinah"></div>' +
        '<div class="field col-6"><label>ROOM TYPE</label><input name="room_type" data-preset="room_type" placeholder="Quad / Triple / Double"></div>' +
        '<div class="field col-12"><label>PILGRIM NAME(S), ONE PER LINE</label><textarea name="pilgrims">' + esc(prefillName()) + "</textarea></div>" +
      "</div>";
  }
  function gatherUmrah(form) {
    return {
      departure_city: form.departure_city.value.trim(),
      transport: form.transport.value.trim(),
      date_from: form.date_from.value,
      date_to: form.date_to.value,
      hotel_makkah: form.hotel_makkah.value.trim(),
      hotel_madinah: form.hotel_madinah.value.trim(),
      room_type: form.room_type.value.trim(),
      pilgrims: form.pilgrims.value.trim()
    };
  }
  function renderUmrah(data, docNumber) {
    return (
      letterheadHTML("E-Ticket — Umrah Package", docNumber, todayISO()) +
      '<div class="kv"><span class="k">Departure city</span><span class="v">' + esc(data.departure_city) + "</span>" +
        (data.transport ? '<span class="k">Transport</span><span class="v">' + esc(data.transport) + "</span>" : "") +
        '<span class="k">Dates</span><span class="v">' + fmtDate(data.date_from) + " &ndash; " + fmtDate(data.date_to) + "</span>" +
        (data.hotel_makkah ? '<span class="k">Hotel — Makkah</span><span class="v">' + esc(data.hotel_makkah) + "</span>" : "") +
        (data.hotel_madinah ? '<span class="k">Hotel — Madinah</span><span class="v">' + esc(data.hotel_madinah) + "</span>" : "") +
        (data.room_type ? '<span class="k">Room type</span><span class="v">' + esc(data.room_type) + "</span>" : "") +
        '<span class="k">Pilgrim(s)</span><span class="v">' + nl2br(data.pilgrims) + "</span>" +
        (linkedEnquiry ? '<span class="k">Kridiya reference</span><span class="v">' + esc(linkedEnquiry.reference) + "</span>" : "") +
      "</div>"
    );
  }

  function buildFormCruise(mount) {
    mount.innerHTML =
      '<div class="field-row">' +
        '<div class="field col-6"><label>CRUISE LINE</label><input name="cruise_line"></div>' +
        '<div class="field col-6"><label>SHIP NAME</label><input name="ship_name"></div>' +
        '<div class="field col-3"><label>SAILING DATE</label><input name="sail_date" type="date"></div>' +
        '<div class="field col-3"><label>CABIN TYPE</label><input name="cabin_type" data-preset="cruise_cabin"></div>' +
        '<div class="field col-12"><label>ITINERARY / PORTS</label><input name="itinerary"></div>' +
        '<div class="field col-12"><label>GUEST NAME(S), ONE PER LINE</label><textarea name="guests">' + esc(prefillName()) + "</textarea></div>" +
      "</div>";
  }
  function gatherCruise(form) {
    return {
      cruise_line: form.cruise_line.value.trim(),
      ship_name: form.ship_name.value.trim(),
      sail_date: form.sail_date.value,
      cabin_type: form.cabin_type.value.trim(),
      itinerary: form.itinerary.value.trim(),
      guests: form.guests.value.trim()
    };
  }
  function renderCruise(data, docNumber) {
    return (
      letterheadHTML("E-Ticket — Cruise Package", docNumber, todayISO()) +
      '<div class="kv"><span class="k">Cruise line</span><span class="v">' + esc(data.cruise_line) + "</span>" +
        (data.ship_name ? '<span class="k">Ship</span><span class="v">' + esc(data.ship_name) + "</span>" : "") +
        '<span class="k">Sailing date</span><span class="v">' + fmtDate(data.sail_date) + "</span>" +
        (data.cabin_type ? '<span class="k">Cabin type</span><span class="v">' + esc(data.cabin_type) + "</span>" : "") +
        (data.itinerary ? '<span class="k">Itinerary</span><span class="v">' + esc(data.itinerary) + "</span>" : "") +
        '<span class="k">Guest(s)</span><span class="v">' + nl2br(data.guests) + "</span>" +
        (linkedEnquiry ? '<span class="k">Kridiya reference</span><span class="v">' + esc(linkedEnquiry.reference) + "</span>" : "") +
      "</div>"
    );
  }

  /* ---- Cancellation notice ---- */
  function buildFormCancellation(mount) {
    mount.innerHTML =
      '<div class="field-row">' +
        '<div class="field col-6"><label>CUSTOMER NAME</label><input name="customer_name" required value="' + esc(prefillName()) + '"></div>' +
        '<div class="field col-6"><label>ORIGINAL BOOKING / INVOICE REFERENCE</label><input name="original_ref" value="' + esc(prefillRef()) + '"></div>' +
        '<div class="field col-12"><label>WHAT IS BEING CANCELLED</label><textarea name="what_cancelled" placeholder="e.g. Flight ticket DXB-COK-DXB, 2 adults"></textarea></div>' +
        '<div class="field col-4"><label>CANCELLATION DATE</label><input name="cancel_date" type="date" value="' + todayISO() + '"></div>' +
        '<div class="field col-4"><label>REFUND AMOUNT</label><input name="refund_amount" type="number" min="0" step="0.01"></div>' +
        '<div class="field col-4"><label>CURRENCY</label><input class="currency-input" name="currency" value="AED" maxlength="3"></div>' +
        '<div class="field col-6"><label>REFUND METHOD</label><input name="refund_method" data-preset="payment_method" placeholder="e.g. Original payment method, bank transfer"></div>' +
        '<div class="field col-6"><label>EXPECTED REFUND TIMEFRAME</label><input name="refund_timeframe" placeholder="e.g. 7-14 business days"></div>' +
        '<div class="field col-6"><label>CANCELLATION FEE (IF ANY)</label><input name="cancel_fee" type="number" min="0" step="0.01"></div>' +
        '<div class="field col-12"><label>NOTES</label><textarea name="notes"></textarea></div>' +
      "</div>";
  }
  function gatherCancellation(form) {
    return {
      customer_name: form.customer_name.value.trim(),
      original_ref: form.original_ref.value.trim(),
      what_cancelled: form.what_cancelled.value.trim(),
      cancel_date: form.cancel_date.value || todayISO(),
      refund_amount: form.refund_amount.value ? parseFloat(form.refund_amount.value) : null,
      currency: (form.currency.value || "AED").toUpperCase(),
      refund_method: form.refund_method.value.trim(),
      refund_timeframe: form.refund_timeframe.value.trim(),
      cancel_fee: form.cancel_fee.value ? parseFloat(form.cancel_fee.value) : null,
      notes: form.notes.value.trim()
    };
  }
  function renderCancellation(data, docNumber) {
    return (
      letterheadHTML("Cancellation Notice", docNumber, data.cancel_date) +
      '<div class="kv"><span class="k">Customer</span><span class="v">' + esc(data.customer_name) + "</span>" +
        (data.original_ref ? '<span class="k">Original reference</span><span class="v">' + esc(data.original_ref) + "</span>" : "") +
      "</div>" +
      "<h2>Cancelled</h2><p class='note'>" + nl2br(data.what_cancelled) + "</p>" +
      "<h2>Refund</h2>" +
      '<div class="kv">' +
        (data.refund_amount != null
          ? '<span class="k">Refund amount</span><span class="v">' + money(data.refund_amount, data.currency) + "</span>"
          : '<span class="k">Refund amount</span><span class="v">Non-refundable</span>') +
        (data.refund_method ? '<span class="k">Refund method</span><span class="v">' + esc(data.refund_method) + "</span>" : "") +
        (data.refund_timeframe ? '<span class="k">Expected timeframe</span><span class="v">' + esc(data.refund_timeframe) + "</span>" : "") +
        (data.cancel_fee ? '<span class="k">Cancellation fee</span><span class="v">' + money(data.cancel_fee, data.currency) + "</span>" : "") +
      "</div>" +
      (data.notes ? "<h2>Notes</h2><p class='note'>" + nl2br(data.notes) + "</p>" : "")
    );
  }

  /* ---- Visa rejection notice ---- */
  function buildFormRejection(mount) {
    mount.innerHTML =
      '<div class="field-row">' +
        '<div class="field col-6"><label>APPLICANT NAME(S)</label><textarea name="applicants">' + esc(prefillName()) + "</textarea></div>" +
        '<div class="field col-6"><label>VISA TYPE / DESTINATION</label><input name="visa_type"></div>' +
        '<div class="field col-6"><label>APPLICATION REFERENCE</label><input name="application_ref" value="' + esc(prefillRef()) + '"></div>' +
        '<div class="field col-6"><label>REJECTION DATE</label><input name="rejection_date" type="date" value="' + todayISO() + '"></div>' +
        '<div class="field col-12"><label>REASON GIVEN BY EMBASSY/AUTHORITY</label><textarea name="reason" placeholder="As communicated to us — paste it as given"></textarea></div>' +
        '<div class="field col-12"><label>NEXT STEPS FOR THE CUSTOMER</label><textarea name="next_steps">We can help you reapply with a stronger file, or advise on alternative visa options. Please contact us to discuss the best next step for your situation.</textarea></div>' +
        '<div class="field col-12"><label>FEE / REFUND NOTE</label><textarea name="fee_note">Embassy/government fees are set and collected by the relevant authority and are non-refundable once submitted. Our service fee is handled per our standard terms.</textarea></div>' +
      "</div>";
  }
  function gatherRejection(form) {
    return {
      applicants: form.applicants.value.trim(),
      visa_type: form.visa_type.value.trim(),
      application_ref: form.application_ref.value.trim(),
      rejection_date: form.rejection_date.value || todayISO(),
      reason: form.reason.value.trim(),
      next_steps: form.next_steps.value.trim(),
      fee_note: form.fee_note.value.trim()
    };
  }
  function renderRejection(data, docNumber) {
    return (
      letterheadHTML("Visa Application Update", docNumber, data.rejection_date) +
      '<div class="kv"><span class="k">Applicant(s)</span><span class="v">' + nl2br(data.applicants) + "</span>" +
        (data.visa_type ? '<span class="k">Visa type</span><span class="v">' + esc(data.visa_type) + "</span>" : "") +
        (data.application_ref ? '<span class="k">Application reference</span><span class="v">' + esc(data.application_ref) + "</span>" : "") +
      "</div>" +
      '<p class="note">We\'re sorry to let you know that this visa application was not approved.</p>' +
      (data.reason ? "<h2>Reason provided</h2><p class='note'>" + nl2br(data.reason) + "</p>" : "") +
      "<h2>What happens next</h2><p class='note'>" + nl2br(data.next_steps) + "</p>" +
      "<h2>Fees</h2><p class='note'>" + nl2br(data.fee_note) + "</p>"
    );
  }

  /* ================= Kind registry: form builder + gather + render ================= */
  const HANDLERS = {
    quotation: {
      render: function (d, n) { return renderQuotation(d, n, "Customer Quote — " + ((QUOTE_SERVICE_PRESETS[d.service] || QUOTE_SERVICE_PRESETS.other).label)); }
    },
    invoice: { build: buildFormInvoice, gather: gatherInvoice, render: function (d, n) { return renderInvoice(d, n); } },
    eticket_flight_oneway: {
      build: function (m) { buildFormFlightDocument(m, "oneway", 1); },
      gather: gatherFlightDocument,
      render: function (d, n) { return Array.isArray(d.options) ? renderQuotation(d, n, "Flight Quote - One-way Proposed Itinerary") : renderIssuedFlight(d, n, "One-way"); }
    },
    eticket_flight_roundtrip: {
      build: function (m) { buildFormFlightDocument(m, "roundtrip", "round"); },
      gather: gatherFlightDocument,
      render: function (d, n) { return Array.isArray(d.options) ? renderQuotation(d, n, "Flight Quote - Round-trip Proposed Itinerary") : renderIssuedFlight(d, n, "Round-trip"); }
    },
    eticket_flight_multicity: {
      build: function (m) { buildFormFlightDocument(m, "multicity", "multi"); },
      gather: gatherFlightDocument,
      render: function (d, n) { return Array.isArray(d.options) ? renderQuotation(d, n, "Flight Quote - Multi-city Proposed Itinerary") : renderIssuedFlight(d, n, "Multi-city"); }
    },
    eticket_hotel: {
      build: function (m) { buildFormQuotation(m, "hotel"); },
      gather: gatherQuotation,
      render: function (d, n) { return Array.isArray(d.options) ? renderQuotation(d, n, "Hotel Quote - Stay Options") : renderHotel(d, n); }
    },
    eticket_visa: {
      build: function (m) { buildFormQuotation(m, "visa"); },
      gather: gatherQuotation,
      render: function (d, n) { return Array.isArray(d.options) ? renderQuotation(d, n, "Visa Quote - Service Options") : renderVisa(d, n); }
    },
    eticket_holiday: {
      build: function (m) { buildFormQuotation(m, "holiday"); },
      gather: gatherQuotation,
      render: function (d, n) { return Array.isArray(d.options) ? renderQuotation(d, n, "Holiday Quote - Package Options") : renderHoliday(d, n); }
    },
    eticket_umrah: {
      build: function (m) { buildFormQuotation(m, "umrah"); },
      gather: gatherQuotation,
      render: function (d, n) { return Array.isArray(d.options) ? renderQuotation(d, n, "Umrah Quote - Package Options") : renderUmrah(d, n); }
    },
    eticket_cruise: {
      build: function (m) { buildFormQuotation(m, "cruise"); },
      gather: gatherQuotation,
      render: function (d, n) { return Array.isArray(d.options) ? renderQuotation(d, n, "Cruise Quote - Package Options") : renderCruise(d, n); }
    },
    eticket_transfer: {
      build: function (m) { buildFormQuotation(m, "transfer"); },
      gather: gatherQuotation,
      render: function (d, n) { return renderQuotation(d, n, "Transfer Quote - Service Options"); }
    },
    eticket_insurance: {
      build: function (m) { buildFormQuotation(m, "insurance"); },
      gather: gatherQuotation,
      render: function (d, n) { return renderQuotation(d, n, "Travel Insurance Quote - Policy Options"); }
    },
    eticket_other: {
      build: function (m) { buildFormQuotation(m, "other"); },
      gather: gatherQuotation,
      render: function (d, n) { return renderQuotation(d, n, "Travel Service Quote - Options"); }
    },
    cancellation: { build: buildFormCancellation, gather: gatherCancellation, render: renderCancellation },
    visa_rejection: { build: buildFormRejection, gather: gatherRejection, render: renderRejection }
  };

  /* ================= Page wiring ================= */
  async function loadSettings() {
    const result = await sb.from("business_settings").select("*").eq("id", true).single();
    if (result.error) throw result.error;
    settings = withBusinessDefaults(result.data);
  }

  function populateSettingsForm() {
    const form = document.getElementById("settings-form");
    form.legal_name.value = settings.legal_name || "";
    form.trade_license_no.value = settings.trade_license_no || "";
    form.vat_registered.value = settings.vat_registered ? "true" : "false";
    form.trn.value = settings.trn || "";
    form.bank_name.value = settings.bank_name || "";
    form.bank_account_name.value = settings.bank_account_name || "";
    form.bank_iban.value = settings.bank_iban || "";
    form.bank_swift.value = settings.bank_swift || "";
    form.bank_address.value = settings.bank_address || "";
    form.cancellation_policy.value = settings.cancellation_policy || "";
    if (form.cancellation_policy_preset) {
      form.cancellation_policy_preset.value = cancellationPolicyPresetFor(settings.cancellation_policy || "");
    }
    form.invoice_footer_note.value = settings.invoice_footer_note || "";
  }

  function cancellationPolicyPresetFor(text) {
    const normalized = String(text || "").trim();
    const found = Object.keys(CANCELLATION_POLICY_PRESETS).find(function (key) {
      return CANCELLATION_POLICY_PRESETS[key] === normalized;
    });
    return found || "custom";
  }

  function applyCancellationPolicyPreset() {
    const form = document.getElementById("settings-form");
    if (!form || !form.cancellation_policy_preset || !form.cancellation_policy) return;
    const key = form.cancellation_policy_preset.value;
    if (key === "custom") return;
    form.cancellation_policy.value = CANCELLATION_POLICY_PRESETS[key] || form.cancellation_policy.value;
  }

  function syncCancellationPolicyPreset() {
    const form = document.getElementById("settings-form");
    if (!form || !form.cancellation_policy_preset || !form.cancellation_policy) return;
    form.cancellation_policy_preset.value = cancellationPolicyPresetFor(form.cancellation_policy.value);
  }

  function settingsSummaryItem(labelText, value) {
    return '<button type="button" class="business-settings-item js-settings-edit"><span>' + esc(labelText) + '</span><b>' + esc(value || "Not set") + "</b></button>";
  }

  function renderSettingsSummary() {
    const mount = document.getElementById("settings-summary");
    if (!mount || !settings) return;
    mount.innerHTML =
      '<div class="business-settings-status"><div><b>Saved company profile</b><span>These details are shared by all staff and printed on generated documents.</span></div><span class="staff-risk ok">Saved for all</span></div>' +
      '<div class="business-settings-grid">' +
        settingsSummaryItem("Legal name", settings.legal_name) +
        settingsSummaryItem("Trade licence", settings.trade_license_no) +
        settingsSummaryItem("VAT / TRN", settings.vat_registered ? (settings.trn || "VAT registered") : "Not VAT registered") +
        settingsSummaryItem("Bank", settings.bank_name) +
        settingsSummaryItem("Account name", settings.bank_account_name) +
        settingsSummaryItem("IBAN", settings.bank_iban) +
        settingsSummaryItem("SWIFT / BIC", settings.bank_swift) +
        settingsSummaryItem("Cancellation policy", settings.cancellation_policy) +
      "</div>" +
      '<p class="form-note business-settings-hint">Click any saved item or Edit to change it. Reset removes your custom text and restores the default company settings.</p>';
  }

  function setSettingsEditing(open) {
    const form = document.getElementById("settings-form");
    const btn = document.getElementById("settings-toggle");
    const summary = document.getElementById("settings-summary");
    if (!form || !btn) return;
    if (open) populateSettingsForm();
    form.hidden = !open;
    if (summary) summary.hidden = open;
    btn.textContent = open ? "Close" : "Edit";
  }

  async function saveSettings() {
    const form = document.getElementById("settings-form");
    const btn = document.getElementById("settings-save");
    btn.disabled = true;
    const update = {
      legal_name: form.legal_name.value.trim() || DEFAULT_BUSINESS_SETTINGS.legal_name,
      trade_license_no: form.trade_license_no.value.trim() || DEFAULT_BUSINESS_SETTINGS.trade_license_no,
      vat_registered: form.vat_registered.value === "true",
      trn: form.trn.value.trim() || null,
      bank_name: form.bank_name.value.trim() || DEFAULT_BUSINESS_SETTINGS.bank_name,
      bank_account_name: form.bank_account_name.value.trim() || DEFAULT_BUSINESS_SETTINGS.bank_account_name,
      bank_iban: form.bank_iban.value.trim() || DEFAULT_BUSINESS_SETTINGS.bank_iban,
      bank_swift: form.bank_swift.value.trim() || DEFAULT_BUSINESS_SETTINGS.bank_swift,
      bank_address: form.bank_address.value.trim() || DEFAULT_BUSINESS_SETTINGS.bank_address,
      cancellation_policy: form.cancellation_policy.value.trim() || DEFAULT_BUSINESS_SETTINGS.cancellation_policy,
      invoice_footer_note: form.invoice_footer_note.value.trim() || DEFAULT_BUSINESS_SETTINGS.invoice_footer_note
    };
    const result = await sb.from("business_settings").update(update).eq("id", true).select("*").single();
    btn.disabled = false;
    if (result.error) { toast("Could not save settings: " + result.error.message); return; }
    settings = withBusinessDefaults(result.data);
    logActivity(sb, currentUserId, "settings.updated", "business_settings", null, {});
    toast("Business settings saved.");
    renderSettingsSummary();
    renderDocControl();
    setSettingsEditing(false);
  }

  async function resetSettingsToDefaults() {
    if (!confirm("Reset business settings to the default Kridiya company details for all staff?")) return;
    const btn = document.getElementById("settings-reset");
    if (btn) btn.disabled = true;
    const update = Object.assign({}, DEFAULT_BUSINESS_SETTINGS);
    const result = await sb.from("business_settings").update(update).eq("id", true).select("*").single();
    if (btn) btn.disabled = false;
    if (result.error) { toast("Could not reset settings: " + result.error.message); return; }
    settings = withBusinessDefaults(result.data);
    populateSettingsForm();
    renderSettingsSummary();
    renderDocControl();
    logActivity(sb, currentUserId, "settings.reset", "business_settings", null, {});
    toast("Business settings reset to defaults.");
  }

  async function searchEnquiries(query) {
    let q = sb.from("enquiries").select("id, reference, full_name, email, phone, service_type, summary").order("created_at", { ascending: false }).limit(15);
    if (query) q = q.or("reference.ilike.%" + query + "%,full_name.ilike.%" + query + "%");
    const result = await q;
    if (result.error) throw result.error;
    return result.data || [];
  }

  function renderKindOptions() {
    const sel = document.getElementById("doc-kind");
    sel.innerHTML = DOC_KINDS.map(function (k) { return '<option value="' + k.id + '">' + esc(k.label) + "</option>"; }).join("");
  }
  function docArchiveTitle(row) {
    const kind = (row.payload && row.payload.kind) || "";
    const def = findKind(kind);
    return (def ? def.label : label(row.document_type)) + " " + row.document_number;
  }
  function renderArchivedDocument(row) {
    const data = row.payload || {};
    const kindId = data.kind;
    const handler = HANDLERS[kindId];
    if (!handler) {
      toast("This archived document type cannot be reopened yet.");
      return;
    }
    const bodyHTML = handler.render(data, row.document_number);
    openPrintWindow(docArchiveTitle(row), bodyHTML);
  }
  async function loadDocumentArchive() {
    const mount = document.getElementById("doc-archive-list");
    if (!mount || !sb) return;
    mount.innerHTML = '<p class="form-note">Loading document archive...</p>';
    const result = await sb
      .from("documents")
      .select("id, document_number, document_type, enquiry_id, customer_name, customer_email, amount_total, currency, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (result.error) {
      mount.innerHTML = '<div class="form-banner error">Could not load archive: ' + esc(result.error.message) + "</div>";
      return;
    }
    const rows = result.data || [];
    if (!rows.length) {
      mount.innerHTML = '<p class="form-note">No issued documents yet.</p>';
      return;
    }
    window.__kridiyaDocArchive = rows;
    mount.innerHTML = rows.map(function (row, index) {
      const created = row.created_at ? new Date(row.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "No date";
      const amount = row.amount_total != null ? money(row.amount_total, row.currency || "AED") : "No amount";
      return '<div class="ops-row doc-archive-row"><div class="ops-row-main"><b>' + esc(docArchiveTitle(row)) + '</b><p>' + esc(row.customer_name || "No customer") + (row.customer_email ? " - " + esc(row.customer_email) : "") + " - " + esc(created) + '</p><div class="ops-kv"><span class="ops-chip">' + esc(label(row.document_type)) + '</span><span class="ops-chip">' + esc(amount) + '</span>' + (row.enquiry_id ? '<span class="ops-chip">Linked enquiry</span>' : "") + '</div></div><div class="ops-row-actions"><button class="btn btn-outline js-open-archive-doc" data-index="' + esc(index) + '" type="button">Open PDF view</button></div></div>';
    }).join("");
  }

  function rebuildForm() {
    const kindId = document.getElementById("doc-kind").value;
    const handler = HANDLERS[kindId];
    const mount = document.getElementById("doc-fields");
    handler.build(mount);
    if (typeof initPresetAC === "function") initPresetAC(mount);
    document.getElementById("doc-preview").innerHTML = "";
    document.getElementById("save-print-btn").disabled = false;
    renderDocControl();
  }

  async function handleGenerate() {
    const kindId = document.getElementById("doc-kind").value;
    const kind = findKind(kindId);
    const handler = HANDLERS[kindId];
    const form = document.getElementById("doc-fields");
    let data;
    try {
      data = handler.gather(form);
      await attachTicketBarcodeImage(form, data);
    } catch (err) {
      toast(err.message || "Complete the required document details.");
      return;
    }

    const customerName = deriveCustomerName(kind, data);
    if (!customerName) {
      toast("Enter the customer's name first.");
      return;
    }

    const btn = document.getElementById("save-print-btn");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const insertResult = await sb
        .from("documents")
        .insert({
          document_type: data.document_type_override || kind.docType,
          enquiry_id: linkedEnquiry ? linkedEnquiry.id : null,
          customer_name: customerName,
          customer_email: data.customer_email || prefillEmail() || null,
          amount_total: data.total != null ? data.total : null,
          currency: data.currency || "AED",
          payload: Object.assign({}, data, { kind: kindId, service: kind.service || null }),
          created_by: currentUserId
        })
        .select("*")
        .single();
      if (insertResult.error) throw insertResult.error;

      const doc = insertResult.data;
      const bodyHTML = handler.render(data, doc.document_number);
      const title = kind.label + " " + doc.document_number;
      showInlinePreview(title, bodyHTML);
      document.getElementById("doc-preview-number").textContent = doc.document_number;
      openPrintWindow(title, bodyHTML);
      logActivity(sb, currentUserId, "document.generated", "document", doc.id, { number: doc.document_number, kind: kindId, customer: customerName });
      loadDocumentArchive();
      toast(title + " saved.");
    } catch (err) {
      toast("Could not save document: " + err.message);
    }
    btn.disabled = false;
    btn.textContent = "Save & Print";
  }

  /* Draft preview — renders exactly what will print, WITHOUT saving or
     consuming a document number. Safe to click any number of times. */
  async function handlePreview() {
    const kindId = document.getElementById("doc-kind").value;
    const kind = findKind(kindId);
    const handler = HANDLERS[kindId];
    if (!kind || !handler) { toast("Pick a document type first."); return; }
    const form = document.getElementById("doc-fields");
    let data, bodyHTML;
    try {
      data = handler.gather(form);
      await attachTicketBarcodeImage(form, data);
      bodyHTML = handler.render(data, ""); // empty number -> shows DRAFT watermark
    } catch (err) {
      toast("Could not build preview: " + err.message);
      return;
    }
    const title = kind.label + " (draft preview)";
    showInlinePreview(title, bodyHTML);
    const numEl = document.getElementById("doc-preview-number");
    if (numEl) numEl.textContent = "DRAFT — not saved";
    const card = document.getElementById("doc-preview-card");
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "start" });
    toast("Draft preview only — nothing saved. Use Save & Print to issue it.");
  }

  function businessMailIdentityData() {
    const phone = (document.getElementById("sig-phone") && document.getElementById("sig-phone").value.trim()) || "+971 50 941 3873";
    const email = (document.getElementById("sig-email") && document.getElementById("sig-email").value.trim()) || "info@kridiyatravel.com";
    return {
      name: (document.getElementById("sig-name") && document.getElementById("sig-name").value.trim()) || "Kridiya Travel",
      title: (document.getElementById("sig-title") && document.getElementById("sig-title").value.trim()) || "Travel Consultant",
      phone: phone,
      phoneHref: phone.replace(/[^\d+]/g, ""),
      email: email,
      website: "kridiyatravel.com",
      legal: settings.legal_name || "KRIDIYA Travel and Tourism FZ-LLC",
      address: "Ras Al Khaimah, United Arab Emirates"
    };
  }

  function buildSignatureHTML(data) {
    return (
      '<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;border-collapse:collapse;max-width:620px">' +
        "<tr>" +
          '<td style="padding-right:16px;border-right:3px solid #c9601c;vertical-align:middle">' +
            '<img src="' + LOGO_URL + '" width="64" height="64" alt="Kridiya Travel" style="display:block;border:0;width:64px;height:64px;object-fit:contain">' +
          "</td>" +
          '<td style="padding-left:16px;vertical-align:middle">' +
            '<div style="font-size:16px;font-weight:700;color:#111827;line-height:1.25">' + esc(data.name) + "</div>" +
            '<div style="font-size:13px;color:#a3480f;font-weight:700;margin-top:2px;line-height:1.35">' + esc(data.title) + " | " + esc(data.legal) + "</div>" +
            '<div style="font-size:12px;color:#4b5563;margin-top:7px;line-height:1.65">' +
              '<a href="tel:' + esc(data.phoneHref) + '" style="color:#4b5563;text-decoration:none">' + esc(data.phone) + '</a> &nbsp;|&nbsp; ' +
              '<a href="mailto:' + esc(data.email) + '" style="color:#4b5563;text-decoration:none">' + esc(data.email) + '</a> &nbsp;|&nbsp; ' +
              '<a href="https://kridiyatravel.com" style="color:#4b5563;text-decoration:none">' + esc(data.website) + "</a>" +
              "<br>" + esc(data.address) +
            "</div>" +
            '<div style="font-size:11px;color:#6b7280;margin-top:7px;line-height:1.5">' +
              '<span style="color:#a3480f;font-weight:700">Your Journey, Our Passion.</span> &nbsp;|&nbsp; ' +
              '<a href="https://www.instagram.com/kridiyatravel" style="color:#6b7280;text-decoration:none">Instagram</a> &nbsp;|&nbsp; ' +
              '<a href="https://www.facebook.com/profile.php?id=61592086520680" style="color:#6b7280;text-decoration:none">Facebook</a>' +
            "</div>" +
          "</td>" +
        "</tr>" +
        '<tr><td colspan="2" style="padding-top:10px;font-size:10.5px;color:#8a8f98;line-height:1.45">This email and any attachments are confidential and intended only for the named recipient. Travel fares, availability, visa rules, supplier terms, and refund timelines may change until booking/payment/authority confirmation is complete.</td></tr>' +
      "</table>"
    );
  }

  function buildReplySignatureHTML(data) {
    return (
      '<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;border-collapse:collapse;max-width:520px">' +
        '<tr><td style="vertical-align:middle;padding-right:10px"><img src="' + LOGO_URL + '" width="38" height="38" alt="Kridiya Travel" style="display:block;border:0;width:38px;height:38px"></td>' +
        '<td style="vertical-align:middle;border-left:2px solid #c9601c;padding-left:10px">' +
          '<div style="font-size:14px;font-weight:700;color:#111827;line-height:1.25">' + esc(data.name) + '</div>' +
          '<div style="font-size:12px;color:#a3480f;font-weight:700">' + esc(data.title) + ' | Kridiya Travel</div>' +
          '<div style="font-size:11.5px;color:#4b5563;margin-top:4px"><a href="tel:' + esc(data.phoneHref) + '" style="color:#4b5563;text-decoration:none">' + esc(data.phone) + '</a> | <a href="https://kridiyatravel.com" style="color:#4b5563;text-decoration:none">kridiyatravel.com</a></div>' +
        "</td></tr>" +
      "</table>"
    );
  }

  function buildMailBannerHTML(data) {
    return (
      '<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;border-collapse:collapse;width:100%;max-width:680px;background:#fff8ef;border:1px solid #ead7bf">' +
        '<tr><td style="padding:16px 18px;background:#ffffff;border-bottom:3px solid #c9601c">' +
          '<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;width:100%"><tr>' +
            '<td style="vertical-align:middle;width:58px"><img src="' + LOGO_URL + '" width="58" height="58" alt="Kridiya Travel" style="display:block;border:0;width:58px;height:58px"></td>' +
            '<td style="vertical-align:middle;padding-left:12px"><div style="font-size:18px;font-weight:800;color:#a3480f;line-height:1.25">KRIDIYA Travel and Tourism FZ-LLC</div><div style="font-size:12px;color:#4b5563;margin-top:3px">Your Journey, Our Passion. | Flights | Visas | Hotels | Holidays | Umrah</div></td>' +
          "</tr></table>" +
        "</td></tr>" +
        '<tr><td style="padding:14px 18px;font-size:12px;color:#4b5563;line-height:1.65">' +
          '<b style="color:#111827">Contact:</b> <a href="tel:' + esc(data.phoneHref) + '" style="color:#4b5563;text-decoration:none">' + esc(data.phone) + '</a> | <a href="mailto:' + esc(data.email) + '" style="color:#4b5563;text-decoration:none">' + esc(data.email) + '</a> | <a href="https://kridiyatravel.com" style="color:#4b5563;text-decoration:none">kridiyatravel.com</a><br>' +
          '<span style="font-size:11px;color:#6b7280">Travel documents, fares, booking deadlines, visa decisions, and refund rules depend on the relevant airline, hotel, supplier, authority, or payment provider.</span>' +
        "</td></tr>" +
      "</table>"
    );
  }

  function buildEmailIdentityHTML() {
    const data = businessMailIdentityData();
    const style = (document.getElementById("sig-style") && document.getElementById("sig-style").value) || "full";
    if (style === "reply") return buildReplySignatureHTML(data);
    if (style === "banner") return buildMailBannerHTML(data);
    return buildSignatureHTML(data);
  }
  async function boot() {
    const gate = document.getElementById("doc-gate");
    const app = document.getElementById("doc-app");

    const user = await KridiyaAuth.currentUser();
    if (!user) { renderLoginForm(gate, boot); return; }
    currentUserId = user.id;

    sb = await KridiyaAuth.client();
    let staff = false;
    try {
      const check = await sb.rpc("is_staff");
      staff = !check.error && check.data === true;
    } catch (e) { staff = false; }

    if (!staff) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>You do not have access to this page.</b><br>Documents are for Kridiya Travel staff only.</p><button type="button" class="btn btn-primary" id="staff-gate-logout">Log out</button></div>';
      document.getElementById("staff-gate-logout").addEventListener("click", async function () {
        await KridiyaAuth.logout();
        location.reload();
      });
      return;
    }

    try {
      await loadSettings();
    } catch (err) {
      gate.innerHTML = '<div class="account-main empty-state"><p>Could not load business settings: ' + esc(err.message) + "</p></div>";
      return;
    }

    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    renderKindOptions();
    renderDocControl();
    renderSettingsSummary();
    loadDocumentArchive();

    document.getElementById("settings-toggle").addEventListener("click", function () { setSettingsEditing(document.getElementById("settings-form").hidden); });
    document.getElementById("settings-summary").addEventListener("click", function (e) {
      if (e.target.closest(".js-settings-edit")) setSettingsEditing(true);
    });
    document.getElementById("settings-save").addEventListener("click", saveSettings);
    document.getElementById("settings-reset").addEventListener("click", resetSettingsToDefaults);
    document.getElementById("cancellation-policy-preset").addEventListener("change", applyCancellationPolicyPreset);
    document.getElementById("settings-form").cancellation_policy.addEventListener("input", syncCancellationPolicyPreset);
    document.getElementById("doc-archive-refresh").addEventListener("click", loadDocumentArchive);

    document.getElementById("sig-build").addEventListener("click", function () {
      const html = buildEmailIdentityHTML();
      document.getElementById("sig-preview").innerHTML = html;
      document.getElementById("sig-preview-wrap").hidden = false;
    });
    document.getElementById("sig-copy").addEventListener("click", async function () {
      const html = document.getElementById("sig-preview").innerHTML;
      try {
        const item = new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }) });
        await navigator.clipboard.write([item]);
        toast("Email identity copied. Paste it into Outlook.");
      } catch (e) {
        try {
          await navigator.clipboard.writeText(html);
          toast("Copied as HTML source. Use the source copy if formatting is lost.");
        } catch (e2) {
          toast("Could not copy automatically. Select the preview and copy manually.");
        }
      }
    });
    document.getElementById("sig-copy-source").addEventListener("click", async function () {
      const html = document.getElementById("sig-preview").innerHTML;
      try {
        await navigator.clipboard.writeText(html);
        toast("HTML source copied.");
      } catch (e) {
        toast("Could not copy source automatically.");
      }
    });
    document.getElementById("sig-reset").addEventListener("click", function () {
      document.getElementById("sig-name").value = "Indirani Alagarsamy";
      document.getElementById("sig-title").value = "Founder";
      document.getElementById("sig-phone").value = "+971 50 941 3873";
      document.getElementById("sig-email").value = "info@kridiyatravel.com";
      document.getElementById("sig-style").value = "full";
      document.getElementById("sig-preview").innerHTML = buildEmailIdentityHTML();
      document.getElementById("sig-preview-wrap").hidden = false;
      toast("Email identity fields reset.");
    });
    document.getElementById("doc-archive-list").addEventListener("click", function (e) {
      const btn = e.target.closest(".js-open-archive-doc");
      if (!btn) return;
      const row = (window.__kridiyaDocArchive || [])[Number(btn.dataset.index)];
      if (row) renderArchivedDocument(row);
    });
    const p = new URLSearchParams(location.search);
    const enquiryId = p.get("enquiry");
    if (enquiryId) {
      const result = await sb.from("enquiries").select("id, reference, full_name, email, phone, service_type, summary").eq("id", enquiryId).maybeSingle();
      if (result.data) {
        linkedEnquiry = result.data;
        document.getElementById("linked-enquiry-box").innerHTML =
          "Linked to <b>" + esc(linkedEnquiry.reference) + "</b> — " + esc(linkedEnquiry.full_name) + " (" + esc(linkedEnquiry.summary || linkedEnquiry.service_type) + ")" +
          (linkedEnquiry.email ? ' · <a href="customers.html?email=' + encodeURIComponent(linkedEnquiry.email) + '">Customer profile</a>' : "");
        document.getElementById("linked-enquiry-box").hidden = false;
        renderDocControl();
      }
    }

    rebuildForm();
    document.getElementById("doc-kind").addEventListener("change", rebuildForm);
    document.getElementById("save-print-btn").addEventListener("click", handleGenerate);
    const previewBtn = document.getElementById("preview-btn");
    if (previewBtn) previewBtn.addEventListener("click", handlePreview);
    const reopenBtn = document.getElementById("reopen-print");
    if (reopenBtn) reopenBtn.addEventListener("click", function () {
      if (lastRender) openPrintWindow(lastRender.title, lastRender.body);
    });

    const searchInput = document.getElementById("enquiry-search");
    const searchResults = document.getElementById("enquiry-search-results");
    let searchTimer = null;
    searchInput.addEventListener("input", function () {
      clearTimeout(searchTimer);
      const q = searchInput.value.trim();
      searchTimer = setTimeout(async function () {
        const rows = await searchEnquiries(q);
        searchResults.innerHTML = rows.map(function (r) {
          return '<button type="button" class="search-hit" data-id="' + r.id + '">' + esc(r.reference) + " — " + esc(r.full_name) + '<span class="form-note">' + esc(r.summary || r.service_type) + "</span></button>";
        }).join("") || '<p class="form-note">No matches.</p>';
      }, 250);
    });
    searchResults.addEventListener("click", function (e) {
      const btn = e.target.closest(".search-hit");
      if (!btn) return;
      sb.from("enquiries").select("id, reference, full_name, email, phone, service_type, summary").eq("id", btn.dataset.id).maybeSingle().then(function (result) {
        if (!result.data) return;
        linkedEnquiry = result.data;
        document.getElementById("linked-enquiry-box").innerHTML =
          "Linked to <b>" + esc(linkedEnquiry.reference) + "</b> — " + esc(linkedEnquiry.full_name) + " (" + esc(linkedEnquiry.summary || linkedEnquiry.service_type) + ")" +
          (linkedEnquiry.email ? ' · <a href="customers.html?email=' + encodeURIComponent(linkedEnquiry.email) + '">Customer profile</a>' : "");
        document.getElementById("linked-enquiry-box").hidden = false;
        searchResults.innerHTML = "";
        searchInput.value = "";
        rebuildForm();
        renderDocControl();
      });
    });
    document.getElementById("unlink-enquiry").addEventListener("click", function () {
      linkedEnquiry = null;
      document.getElementById("linked-enquiry-box").hidden = true;
      rebuildForm();
      renderDocControl();
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
