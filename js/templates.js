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
    { title: "Booking confirmed", category: "Booking", channel: "email", subject: "Booking confirmed - [Booking Reference]", body: "Hi [Customer Name],\n\nYour booking has been confirmed.\n\n- Booking reference: [Booking Reference]\n- Service: [Service]\n- Route/Destination: [Route/Destination]\n- Travel date: [Date]\n- Passenger(s): [Passenger names]\n- Supplier/airline/hotel reference: [Supplier Reference]\n\nPlease review the details and inform us immediately if anything needs correction.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "Corporate request received", category: "Corporate", channel: "email", subject: "Corporate booking request received - [Company Name]", body: "Hi [Contact Name],\n\nThank you. We received the corporate booking request for [Company Name].\n\n- Company: [Company Name]\n- Requester: [Requester Name]\n- Service: [Service]\n- Route/Destination: [Route/Destination]\n- Travel date: [Date]\n- Traveller(s): [Traveller details]\n\nWe will review availability, payment/LPO requirements, and supplier conditions, then update you.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "Corporate LPO approval", category: "Corporate", channel: "whatsapp", body: "Hi [Contact Name], for booking [Booking Reference], please share LPO or written approval before supplier confirmation. Amount: AED [amount]. Approver: [name]." },
    { title: "Supplier availability request", category: "Supplier", channel: "email", subject: "Availability request - [Service] / [Route or Destination]", body: "Hi [Supplier Name],\n\nPlease check availability and best net rate for:\n\n- Service: [Service]\n- Route/Destination: [Route/Destination]\n- Travel date: [Date]\n- Passenger(s): [Details]\n- Required documents/notes: [Notes]\n\nPlease confirm net cost, availability, booking deadline, cancellation/refund rules, and supplier reference if holding.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
    { title: "Receipt sent WhatsApp", category: "Payment", channel: "whatsapp", body: "Hi [Customer Name], payment received for booking [Booking Reference]. Amount: AED [amount]. Receipt number: [receipt number]." },
    { title: "Cancellation refund update", category: "Support", channel: "email", subject: "Cancellation/refund update - Booking [Booking Reference]", body: "Hi [Customer Name],\n\nWe are updating you regarding cancellation/refund for booking [Booking Reference].\n\n- Booking reference: [Booking Reference]\n- Cancellation status: [Status]\n- Refund amount, if applicable: AED [Amount]\n- Expected timeline: [Timeline]\n- Supplier/airline/authority rule: [Rule]\n\nRefunds and cancellations depend on supplier, airline, hotel, visa authority, or payment provider rules.\n\nRegards,\nKRIDIYA Travel and Tourism FZ-LLC" },
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
    const required = ["Enquiry", "Sales", "Payment", "Documents", "Booking", "Corporate", "Supplier", "Support", "Internal"];
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
      '<div class="doc-control-next"><b>Covered categories</b><span>' + esc(Object.keys(byCategory).sort().join(", ")) + '</span></div>';
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
      return '<article class="template-card"><div class="template-card-head"><div><h2>' + esc(t.title) + '</h2><div class="ops-kv"><span class="ops-chip">' + esc(t.category) + '</span><span class="ops-chip">' + esc(label(t.channel)) + '</span></div></div><button class="btn btn-primary" type="button" data-template-index="' + esc(TEMPLATES.indexOf(t)) + '">Copy</button></div>' + (t.subject ? '<p class="template-subject"><b>Subject:</b> ' + esc(t.subject) + '</p>' : '') + '<pre>' + esc(t.body) + '</pre></article>';
    }).join("") || '<div class="account-main empty-state"><p>No templates match your filters.</p></div>';
  }

  async function copyTemplate(event) {
    const btn = event.target.closest("[data-template-index]");
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
