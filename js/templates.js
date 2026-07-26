"use strict";
(function () {
  if (document.body.dataset.page !== "templates") return;

  const TEMPLATES = [
    { title: "New enquiry reply", category: "Enquiry", channel: "email", subject: "Your travel enquiry with Kridiya Travel", body: "Hi [Customer Name],\n\nThank you for contacting KRIDIYA Travel and Tourism.\n\nWe received your enquiry for:\n- Service: [Flight/Visa/Hotel/Package/etc.]\n- Destination/Route: [Destination or route]\n- Travel date: [Date]\n- Passengers: [Passenger count]\n\nWe are checking the best available options and will update you shortly.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "New enquiry WhatsApp", category: "Enquiry", channel: "whatsapp", body: "Hi [Customer Name], thank you for contacting KRIDIYA Travel. We received your enquiry for [service] to [destination/route]. We are checking the best available options and will update you shortly." },
    { title: "Quote sent", category: "Sales", channel: "email", subject: "Travel quote from Kridiya Travel - [Destination/Route]", body: "Hi [Customer Name],\n\nPlease find the quote details below:\n\n- Service: [Service]\n- Route/Destination: [Route/Destination]\n- Travel date: [Date]\n- Passenger(s): [Names or count]\n- Total amount: AED [Amount]\n- Supplier/airline/hotel: [Details]\n- Valid until: [Date/Time]\n\nFares, availability, visa rules, and supplier conditions can change until booking and payment are completed.\n\nTo proceed, please confirm and arrange payment.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "Quote WhatsApp", category: "Sales", channel: "whatsapp", body: "Hi [Customer Name], your quote is ready. [Service] for [route/destination], total AED [amount]. Fare/availability can change until payment and booking confirmation. Please confirm if we can proceed." },
    { title: "Payment request", category: "Payment", channel: "email", subject: "Payment request - Booking [Booking Reference]", body: "Hi [Customer Name],\n\nTo proceed with your booking, please arrange payment:\n\n- Booking reference: [Booking Reference]\n- Service: [Service]\n- Total booking value: AED [Total]\n- Amount due now: AED [Amount Due]\n- Payment method: [Bank transfer/payment link/cash]\n\nBank/payment details:\n[Paste bank details or payment link]\n\nPlease send the payment proof once completed. Booking, ticketing, visa submission, or supplier confirmation will proceed after payment is confirmed.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "Payment request WhatsApp", category: "Payment", channel: "whatsapp", body: "Hi [Customer Name], payment is required to proceed with booking [Booking Reference]. Amount due: AED [amount]. Please pay by [bank/payment link] and send proof. We will proceed after payment is confirmed." },
    { title: "Documents request", category: "Documents", channel: "email", subject: "Documents required for [Service]", body: "Hi [Customer Name],\n\nTo continue with your [service], please share the following documents:\n\n- [Document 1]\n- [Document 2]\n- [Document 3]\n\nPlease make sure all documents are clear and valid. Passport copies should show the full details page clearly.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "Flight documents required", category: "Documents", channel: "email", subject: "Documents required for flight booking", body: "Hi [Customer Name],\n\nFor your flight booking, please share/check:\n\n- Passport copy for each passenger\n- Passenger name exactly as passport\n- Date of birth if required by airline\n- Visa/residence permit if required for destination/transit\n- Mobile number and email\n- Preferred baggage/seat/meal if any\n\nPlease check spelling carefully before ticketing. Name correction after ticketing may not be possible or may carry airline charges.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "Visa documents required", category: "Documents", channel: "email", subject: "Documents required for visa application - [Country]", body: "Hi [Customer Name],\n\nFor your [Country] visa application, please share:\n\n- Passport copy valid at least 6 months\n- UAE visa / Emirates ID copy if applicable\n- Passport-size photo\n- Travel dates and purpose of travel\n- Employment/NOC or salary certificate if required\n- Bank statement if required\n- Hotel/flight booking if required\n- Previous visa/refusal copy if applicable\n\nVisa approval is at the discretion of the relevant authority. We can submit only after complete documents and payment.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "Hotel documents required", category: "Documents", channel: "email", subject: "Details required for hotel booking", body: "Hi [Customer Name],\n\nFor your hotel booking, please confirm/share:\n\n- Guest full names\n- Check-in and check-out dates\n- Room type and occupancy\n- Passport/ID copy if required by the hotel\n- Special requests, bed type, smoking/non-smoking preference\n- Arrival time if known\n\nHotel requests are subject to availability and hotel policy.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "Umrah documents required", category: "Documents", channel: "email", subject: "Documents required for Umrah package", body: "Hi [Customer Name],\n\nFor your Umrah package, please share:\n\n- Passport copy valid at least 6 months\n- UAE visa / Emirates ID copy if applicable\n- Passport-size photo\n- Vaccination certificate if required\n- Mahram/family documents if required\n- Travel dates and preferred room sharing\n\nUmrah visa, hotel, transport and package rules are subject to Saudi authority and supplier conditions.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "Booking confirmed", category: "Booking", channel: "email", subject: "Booking confirmed - [Booking Reference]", body: "Hi [Customer Name],\n\nYour booking has been confirmed.\n\n- Booking reference: [Booking Reference]\n- Service: [Service]\n- Route/Destination: [Route/Destination]\n- Travel date: [Date]\n- Passenger(s): [Passenger names]\n- Supplier/airline/hotel reference: [Supplier Reference]\n\nPlease review the details and inform us immediately if anything needs correction.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "Ticket issued", category: "Booking", channel: "whatsapp", body: "Hi [Customer Name], your ticket/document for [Booking Reference] has been issued. Please check all names, dates, route, baggage and timings immediately. Contact us now if anything looks incorrect." },
    { title: "Travel reminder", category: "Booking", channel: "whatsapp", body: "Hi [Customer Name], reminder for your travel on [Date]. Please carry passport, visa/residence documents, ticket/voucher and arrive early as per airline/hotel/supplier instructions. Safe travels from Kridiya Travel." },
    { title: "Corporate request received", category: "Corporate", channel: "email", subject: "Corporate booking request received - [Company Name]", body: "Hi [Contact Name],\n\nThank you. We received the corporate booking request for [Company Name].\n\n- Company: [Company Name]\n- Requester: [Requester Name]\n- Service: [Service]\n- Route/Destination: [Route/Destination]\n- Travel date: [Date]\n- Traveller(s): [Traveller details]\n\nWe will review availability, payment/LPO requirements, and supplier conditions, then update you.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "Corporate LPO approval", category: "Corporate", channel: "whatsapp", body: "Hi [Contact Name], for booking [Booking Reference], please share LPO or written approval before supplier confirmation. Amount: AED [amount]. Approver: [name]." },
    { title: "Supplier availability request", category: "Supplier", channel: "email", subject: "Availability request - [Service] / [Route or Destination]", body: "Hi [Supplier Name],\n\nPlease check availability and best net rate for:\n\n- Service: [Service]\n- Route/Destination: [Route/Destination]\n- Travel date: [Date]\n- Passenger(s): [Details]\n- Required documents/notes: [Notes]\n\nPlease confirm net cost, availability, booking deadline, cancellation/refund rules, and supplier reference if holding.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "Supplier booking confirmation request", category: "Supplier", channel: "email", subject: "Booking confirmation request - [Booking Reference]", body: "Hi [Supplier Name],\n\nPlease confirm the booking below:\n\n- Kridiya reference: [Booking Reference]\n- Service: [Service]\n- Customer/traveller: [Name]\n- Travel/service date: [Date]\n- Net cost: AED [Amount]\n- Supplier reference/PNR/voucher: [Reference]\n\nPlease send invoice, cancellation/refund rules, payment deadline, and final voucher/ticket if issued.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "Receipt sent WhatsApp", category: "Payment", channel: "whatsapp", body: "Hi [Customer Name], payment received for booking [Booking Reference]. Amount: AED [amount]. Receipt number: [receipt number]." },
    { title: "Payment proof received", category: "Payment", channel: "whatsapp", body: "Hi [Customer Name], we received your payment proof for [Booking Reference]. Our team will verify it and update you once payment is confirmed in our account." },
    { title: "Balance payment reminder", category: "Payment", channel: "whatsapp", body: "Hi [Customer Name], reminder: balance payment of AED [amount] is pending for [Booking Reference]. Please complete payment before [deadline] to avoid cancellation or fare/rate change." },
    { title: "Refund bank details request", category: "Refund", channel: "email", subject: "Bank details required for refund - [Booking Reference]", body: "Hi [Customer Name],\n\nTo process your refund for [Booking Reference], please share:\n\n- Account holder name\n- Bank name\n- IBAN/account number\n- SWIFT/BIC if applicable\n- Payment proof/receipt if not already shared\n\nRefund amount and timeline depend on supplier/airline/hotel/visa authority/payment provider rules.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "Refund completed", category: "Refund", channel: "whatsapp", body: "Hi [Customer Name], refund for [Booking Reference] has been completed/processed. Amount: AED [amount]. Method: [method]. Bank/provider processing time may still apply." },
    { title: "Cancellation refund update", category: "Support", channel: "email", subject: "Cancellation/refund update - Booking [Booking Reference]", body: "Hi [Customer Name],\n\nWe are updating you regarding cancellation/refund for booking [Booking Reference].\n\n- Booking reference: [Booking Reference]\n- Cancellation status: [Status]\n- Refund amount, if applicable: AED [Amount]\n- Expected timeline: [Timeline]\n- Supplier/airline/authority rule: [Rule]\n\nRefunds and cancellations depend on supplier, airline, hotel, visa authority, or payment provider rules.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "Visa rejection update", category: "Support", channel: "email", subject: "Visa application update - [Customer Name]", body: "Hi [Customer Name],\n\nWe are sorry to inform you that the visa application for [Country/Visa Type] was not approved by the relevant authority.\n\nReason provided, if any:\n[Reason]\n\nNext steps:\n[Reapply / alternative options / additional documents]\n\nEmbassy/government fees are controlled by the authority and may be non-refundable once submitted. Our team can advise the best next step.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "Complaint acknowledgement", category: "Support", channel: "email", subject: "We received your concern - [Booking Reference]", body: "Hi [Customer Name],\n\nWe received your concern regarding [Booking Reference].\n\nSummary:\n[Issue]\n\nWe are reviewing the details and will update you by [Date/Time]. If supplier/airline/hotel review is required, their response timeline may apply.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "Staff daily closing", category: "Internal", channel: "internal", body: "Date: [Date]\nStaff: [Name]\n\nNew enquiries:\nQuotes sent:\nBookings confirmed:\nPayments received:\nSupplier payments pending:\nRefunds pending:\nDocuments issued:\nUrgent follow-up tomorrow:\nRisks/blockers:\nNotes for owner:" },
    { title: "Staff handover note", category: "Internal", channel: "internal", body: "Booking: [Booking Reference]\nCustomer/company: [Name]\nService: [Service]\nCurrent status: [Status]\nPayment status: [Status]\nSupplier status/ref: [Supplier status/ref]\nPending action: [What to do next]\nDeadline: [Date/time]\nImportant notes: [Notes]" }
  ];

  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }
  function label(v) { return String(v || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function fullText(t) { return (t.subject ? "Subject: " + t.subject + "\n\n" : "") + t.body; }
  function countBy(key) {
    return TEMPLATES.reduce(function (acc, t) {
      acc[t[key]] = (acc[t[key]] || 0) + 1;
      return acc;
    }, {});
  }
  function renderTemplateControl(rows) {
    const panel = document.getElementById("template-control-panel");
    if (!panel) return;
    const byCategory = countBy("category");
    const byChannel = countBy("channel");
    const required = ["Enquiry", "Sales", "Payment", "Documents", "Booking", "Corporate", "Supplier", "Support", "Refund", "Internal"];
    const missing = required.filter(function (c) { return !byCategory[c]; });
    const next = missing.length
      ? "Add missing template categories: " + missing.join(", ") + "."
      : "Template coverage is ready. Use filters to copy the next customer/staff message.";
    panel.innerHTML =
      '<div class="doc-control-summary doc-' + esc(missing.length ? "warn" : "ok") + '"><div><b>' + esc(missing.length ? missing.length + " gap(s)" : "Covered") + '</b><span>' + esc(next) + '</span></div><span class="staff-risk ' + esc(missing.length ? "warn" : "ok") + '">' + esc(rows.length) + ' visible</span></div>' +
      '<div class="doc-control-grid">' +
        '<div><b>' + esc(byChannel.email || 0) + '</b><span>Email templates</span></div>' +
        '<div><b>' + esc(byChannel.whatsapp || 0) + '</b><span>WhatsApp templates</span></div>' +
        '<div><b>' + esc(byChannel.internal || 0) + '</b><span>Internal templates</span></div>' +
        '<div><b>' + esc(Object.keys(byCategory).length) + '</b><span>Categories</span></div>' +
      '</div>' +
      '<div class="doc-control-next"><b>Covered categories</b><span>' + esc(Object.keys(byCategory).sort().join(", ")) + '</span></div>' +
      '<div class="doc-control-next"><b>PDF-ready templates</b><span>Every template has Open PDF view. Use browser Print -> Save as PDF for a clean file.</span></div>';
  }
  function templatePrintHTML(t) {
    const subject = t.subject ? "<h2>Subject</h2><p>" + esc(t.subject) + "</p>" : "";
    return "<!doctype html><html><head><meta charset='utf-8'><title>" + esc(t.title) + "</title><style>body{font-family:Arial,sans-serif;margin:40px;color:#1f2933;line-height:1.55}h1{font-size:22px;margin:0 0 6px;color:#a3480f}h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#8a4210;margin:22px 0 8px}.meta{font-size:12px;color:#667085;border-bottom:2px solid #c9601c;padding-bottom:14px;margin-bottom:22px}.body{white-space:pre-wrap;border:1px solid #ead7bf;background:#fff8ef;border-radius:10px;padding:18px}.foot{margin-top:28px;font-size:11px;color:#667085;border-top:1px solid #eee;padding-top:12px}@media print{body{margin:18mm}}</style></head><body><h1>" + esc(t.title) + "</h1><div class='meta'>KRIDIYA Travel and Tourism FZ-LLC / " + esc(t.category) + " / " + esc(label(t.channel)) + "</div>" + subject + "<h2>Template</h2><div class='body'>" + esc(t.body) + "</div><div class='foot'>Template generated from admin.kridiyatravel.com. Replace placeholders before sending.</div><script>setTimeout(function(){window.print()},250)</script></body></html>";
  }
  function openTemplatePDF(t) {
    const win = window.open("", "_blank");
    if (!win) { toast("Please allow pop-ups to open the PDF view."); return; }
    win.document.open();
    win.document.write(templatePrintHTML(t));
    win.document.close();
    win.focus();
  }

  async function boot() {
    const gate = document.getElementById("templates-gate");
    const app = document.getElementById("templates-app");
    const user = await KridiyaAuth.currentUser();
    if (!user) { renderLoginForm(gate, boot); return; }
    const sb = await KridiyaAuth.client();
    const staffCheck = await sb.rpc("is_staff");
    if (staffCheck.error || staffCheck.data !== true) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>You do not have access.</b><br>Templates are for staff only.</p></div>';
      return;
    }
    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    fillFilters();
    render();
    ["template-search", "template-channel", "template-category"].forEach(function (id) {
      document.getElementById(id).addEventListener("input", render);
      document.getElementById(id).addEventListener("change", render);
    });
    document.getElementById("template-list").addEventListener("click", copyTemplate);
  }

  function fillFilters() {
    const categories = Array.from(new Set(TEMPLATES.map(function (t) { return t.category; }))).sort();
    document.getElementById("template-category").innerHTML = '<option value="">All</option>' + categories.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join("");
  }

  function filtered() {
    const q = document.getElementById("template-search").value.trim().toLowerCase();
    const channel = document.getElementById("template-channel").value;
    const category = document.getElementById("template-category").value;
    return TEMPLATES.filter(function (t) {
      const hay = (t.title + " " + t.category + " " + t.channel + " " + (t.subject || "") + " " + t.body).toLowerCase();
      if (q && hay.indexOf(q) === -1) return false;
      if (channel && t.channel !== channel) return false;
      if (category && t.category !== category) return false;
      return true;
    });
  }

  function render() {
    const rows = filtered();
    renderTemplateControl(rows);
    document.getElementById("template-stats").innerHTML =
      '<div class="stat-tile"><div class="num">' + rows.length + '</div><div class="label">Visible templates</div></div>' +
      '<div class="stat-tile"><div class="num">' + TEMPLATES.length + '</div><div class="label">Total templates</div></div>' +
      '<div class="stat-tile"><div class="num">Email</div><div class="label">Outlook ready</div></div>' +
      '<div class="stat-tile"><div class="num">WA</div><div class="label">WhatsApp ready</div></div>';
    document.getElementById("template-list").innerHTML = rows.map(function (t, index) {
      return '<article class="template-card"><div class="template-card-head"><div><h2>' + esc(t.title) + '</h2><div class="ops-kv"><span class="ops-chip">' + esc(t.category) + '</span><span class="ops-chip">' + esc(label(t.channel)) + '</span></div></div><div class="section-actions"><button class="btn btn-primary" type="button" data-template-index="' + esc(TEMPLATES.indexOf(t)) + '">Copy</button><button class="btn btn-outline" type="button" data-template-pdf="' + esc(TEMPLATES.indexOf(t)) + '">Open PDF view</button></div></div>' + (t.subject ? '<p class="template-subject"><b>Subject:</b> ' + esc(t.subject) + '</p>' : '') + '<pre>' + esc(t.body) + '</pre></article>';
    }).join("") || '<div class="account-main empty-state"><p>No templates match your filters.</p></div>';
  }

  async function copyTemplate(event) {
    const btn = event.target.closest("[data-template-index]");
    const pdfBtn = event.target.closest("[data-template-pdf]");
    if (pdfBtn) {
      openTemplatePDF(TEMPLATES[Number(pdfBtn.dataset.templatePdf)]);
      return;
    }
    if (!btn) return;
    const template = TEMPLATES[Number(btn.dataset.templateIndex)];
    try {
      await navigator.clipboard.writeText(fullText(template));
      toast("Template copied.");
    } catch (err) {
      toast("Could not copy automatically. Select the text and copy manually.");
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
