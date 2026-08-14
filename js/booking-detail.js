"use strict";
(function () {
  if (location.pathname.indexOf("booking-detail.html") === -1) return;
  let sb = null;
  let bookingId = null;
  let detail = null;
  let quoteContext = { quotes: [], can_edit_quotes: false };
  let workflow = { tasks: [], timeline: [], can_edit_tasks: false, can_view_activity: false };
  let businessSettings = null;

  const BOOKING_STATUS = ["enquiry", "quote_sent", "payment_pending", "confirmed", "paid", "ticketed", "completed", "cancelled", "refunded"];
  const PAYMENT_STATUS = ["not_requested", "request_sent", "proof_received", "partially_paid", "paid", "supplier_payment_pending", "supplier_paid", "refund_pending", "refunded", "failed", "cancelled"];
  const DOC_STATUS = ["not_started", "draft", "generated", "sent", "archived"];
  const PASSENGER_TYPES = ["adult", "child", "infant"];
  const TASK_TYPES = ["follow_up", "customer_call", "supplier_check", "payment", "documents", "ticketing", "visa", "corporate_approval", "other"];
  const TASK_PRIORITIES = ["low", "normal", "high", "urgent"];
  const DOCUMENT_TYPES = ["passport_copy", "photo", "visa_form", "ticket_or_pnr", "emirates_id", "trade_license", "trn_certificate", "lpo", "approval_email", "invoice", "insurance_policy", "voucher", "other"];
  const REQUIRED_DOCUMENTS = {
    flight: ["passport_copy", "ticket_or_pnr"],
    visa: ["passport_copy", "photo", "visa_form"],
    hotel: ["passport_copy", "voucher"],
    holiday: ["passport_copy", "ticket_or_pnr", "voucher"],
    umrah: ["passport_copy", "photo", "visa_form"],
    cruise: ["passport_copy", "visa_form"],
    insurance: ["passport_copy", "insurance_policy"],
    transfer: ["passport_copy", "voucher"],
    other: ["passport_copy", "other"]
  };

  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }
  function label(v) { return String(v || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function money(v, c) { return v == null ? "Hidden" : (c || "AED") + " " + Number(v || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  /* Tile amount: "Restricted" only when the user truly can't see it,
     "—" when it just hasn't been entered yet, otherwise the amount. */
  function moneyTile(v, c, canView) {
    if (canView === false) return "Restricted";
    return v == null ? "—" : (c || "AED") + " " + Number(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function optionList(values, current) { return values.map(function (v) { return '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(label(v)) + '</option>'; }).join(""); }
  function dateText(v) { return v ? new Date(v + "T00:00:00").toLocaleDateString("en-GB") : "Not set"; }
  function dateTimeText(v) { return v ? new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not set"; }
  function safeFileName(name) { return String(name || "document").replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 90) || "document"; }
  function isMicrosoftPath(path) { return String(path || "").indexOf("Kridiya Business/") === 0; }
  async function invokeMicrosoftUpload(formData) {
    const result = await sb.functions.invoke("microsoft-documents", { body: formData });
    if (result.error) {
      var message = result.error.message || "Microsoft storage failed";
      try {
        if (result.error.context && typeof result.error.context.json === "function") {
          var payload = await result.error.context.json();
          if (payload && payload.error) message = payload.error;
        }
      } catch (_) { /* Preserve the original invocation error. */ }
      throw new Error(message);
    }
    return result.data;
  }
  async function downloadMicrosoft(body, fileName) {
    const sessionResult = await sb.auth.getSession();
    const token = sessionResult.data && sessionResult.data.session && sessionResult.data.session.access_token;
    if (!token) throw new Error("Please log in again.");
    const response = await fetch(SUPABASE_URL + "/functions/v1/microsoft-documents", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const failure = await response.json().catch(function () { return {}; });
      throw new Error(failure.error || "Could not download the document.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeFileName(fileName || "document");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }
  function amountNum(v) { return Number(v || 0); }
  function paymentReceivedTotal() { return (detail.payments || []).filter(function (p) { return p.status === "received"; }).reduce(function (sum, p) { return sum + amountNum(p.amount); }, 0); }
  function bookingBalance() { return Math.max(0, amountNum(detail.booking.selling_price) - paymentReceivedTotal()); }
  function paymentIsCleared(status) { return ["paid", "received", "payment_received", "completed"].indexOf(String(status || "").toLowerCase()) !== -1; }
  function bookingIsConfirmed(status) { return ["confirmed", "paid", "ticketed", "completed"].indexOf(String(status || "").toLowerCase()) !== -1; }
  function isPortalBooking() {
    const source = String((detail.booking || {}).source || (quoteContext || {}).source || "").toLowerCase();
    return source === "portal" || source === "corporate_portal";
  }
  function bookingNotes() {
    const b = detail && detail.booking ? detail.booking : {};
    return String(b.staff_notes || b.notes || b.internal_notes || b.description || "");
  }
  function isDocumentHandoff() {
    const b = detail && detail.booking ? detail.booking : {};
    return /^document request\s*-/i.test(String(b.title || "")) || /document handoff request from corporate portal/i.test(bookingNotes());
  }
  function documentHandoffType() {
    const b = detail && detail.booking ? detail.booking : {};
    const titleMatch = String(b.title || "").match(/^document request\s*-\s*(.+)$/i);
    if (titleMatch && titleMatch[1]) return titleMatch[1].trim();
    const noteMatch = bookingNotes().match(/Document needed:\s*([^\n]+)/i);
    return noteMatch && noteMatch[1] ? noteMatch[1].trim() : "Requested document";
  }
  function documentHandoffRef() {
    const match = bookingNotes().match(/Booking:\s*(KRI-\d{4}-\d+)/i);
    return match && match[1] ? match[1] : "Original booking";
  }
  function documentHandoffNote() {
    const match = bookingNotes().match(/Company note:\s*([^\n]+)/i);
    return match && match[1] ? match[1].trim() : "No company note supplied.";
  }
  function documentHandoffTypeKey() {
    const requested = documentHandoffType().toLowerCase();
    if (/ticket|pnr/.test(requested)) return "ticket_or_pnr";
    if (/hotel|voucher/.test(requested)) return "voucher";
    if (/visa/.test(requested)) return "visa_form";
    if (/insurance/.test(requested)) return "insurance_policy";
    if (/receipt|invoice|statement/.test(requested)) return "invoice";
    if (/lpo/.test(requested)) return "lpo";
    if (/approval/.test(requested)) return "approval_email";
    if (/passport/.test(requested)) return "passport_copy";
    return "other";
  }
  function paymentControlNote() {
    const b = detail.booking;
    if (paymentIsCleared(b.payment_status)) return { text: "Payment control OK. Money is marked as received/paid.", tone: "ok" };
    if (b.booking_kind === "corporate" || detail.corporate) return { text: "Corporate control: collect payment approval/LPO before supplier confirmation.", tone: "warn" };
    if (bookingIsConfirmed(b.status)) return { text: "Risk: booking is confirmed before payment is fully received.", tone: "risk" };
    return { text: "Rule: collect payment before booking/supplier confirmation.", tone: "warn" };
  }
  function taskOpen(t) { return t.status !== "completed" && t.status !== "done"; }
  function hasSupplierInvoice() { return (detail.supplier_payments || []).some(function (p) { return !!p.supplier_invoice_path; }); }
  function supplierPaidEnough() {
    const rows = detail.supplier_payments || [];
    return rows.length && rows.some(function (p) { return p.status === "paid" || amountNum(p.amount_paid) >= amountNum(p.amount_payable); });
  }
  function supplierTotals() {
    const rows = detail.supplier_payments || [];
    const payable = rows.reduce(function (sum, p) { return sum + amountNum(p.amount_payable); }, 0);
    const paid = rows.reduce(function (sum, p) { return sum + amountNum(p.amount_paid); }, 0);
    const disputed = rows.filter(function (p) { return p.status === "disputed"; }).length;
    const invoices = rows.filter(function (p) { return !!p.supplier_invoice_path; }).length;
    const sharepoint = rows.filter(function (p) { return !!p.sharepoint_invoice_url; }).length;
    return { payable: payable, paid: paid, balance: Math.max(0, payable - paid), disputed: disputed, invoices: invoices, sharepoint: sharepoint };
  }
  function supplierControl() {
    const b = detail.booking;
    const t = supplierTotals();
    const expected = amountNum(b.supplier_cost);
    const sale = amountNum(b.selling_price);
    const gross = sale - Math.max(expected, t.payable);
    const invoiceMissing = (detail.supplier_payments || []).length > 0 && t.invoices === 0;
    if (!b.supplier_reference && !t.payable) {
      return { tone: "risk", title: "Supplier not controlled", action: "Record supplier name, reference, payable cost, and invoice trail before closing this booking.", totals: t, gross: gross };
    }
    if (t.disputed) {
      return { tone: "risk", title: "Supplier dispute open", action: "Resolve the dispute and keep the supplier rule/invoice note attached.", totals: t, gross: gross };
    }
    if (invoiceMissing) {
      return { tone: "warn", title: "Supplier invoice missing", action: "Upload the supplier invoice or add the SharePoint copy link.", totals: t, gross: gross };
    }
    if (t.balance > 0) {
      return { tone: "warn", title: "Supplier payable open", action: "Track due amount and pay supplier only after customer payment/approval is controlled.", totals: t, gross: gross };
    }
    if (b.supplier_reference || t.payable) {
      return { tone: "ok", title: "Supplier trail ready", action: "Supplier reference, payable, and payment trail are ready for finance review.", totals: t, gross: gross };
    }
    return { tone: "warn", title: "Supplier details pending", action: "Add supplier reference and expected net cost.", totals: t, gross: gross };
  }
  function renderSupplierControl() {
    const b = detail.booking;
    const c = supplierControl();
    const invoiceText = c.totals.invoices ? c.totals.invoices + " attached" : "Missing";
    const sharepointText = c.totals.sharepoint ? c.totals.sharepoint + " backed up" : "Not noted";
    return '<div class="supplier-control supplier-' + esc(c.tone) + '">' +
      '<div class="supplier-control-head"><div><b>' + esc(c.title) + '</b><p>' + esc(c.action) + '</p></div><span class="staff-risk ' + esc(c.tone === "ok" ? "ok" : c.tone === "risk" ? "risk" : "warn") + '">' + esc(label(c.tone)) + '</span></div>' +
      '<div class="supplier-control-grid">' +
        '<span><b>' + esc(money(c.totals.payable || amountNum(b.supplier_cost), b.currency)) + '</b><small>Payable / expected cost</small></span>' +
        '<span><b>' + esc(money(c.totals.paid, b.currency)) + '</b><small>Paid to supplier</small></span>' +
        '<span><b>' + esc(money(c.totals.balance, b.currency)) + '</b><small>Supplier balance</small></span>' +
        '<span><b>' + esc(money(c.gross, b.currency)) + '</b><small>Gross margin view</small></span>' +
        '<span><b>' + esc(b.supplier_reference || "Missing") + '</b><small>Supplier reference</small></span>' +
        '<span><b>' + esc(invoiceText) + '</b><small>Invoice file</small></span>' +
        '<span><b>' + esc(sharepointText) + '</b><small>SharePoint backup</small></span>' +
        '<span><b>' + esc(c.totals.disputed) + '</b><small>Disputes</small></span>' +
      '</div>' +
    '</div>';
  }
  function documentsReady() {
    return ["generated", "sent", "archived"].indexOf(String(detail.booking.document_status || "")) !== -1 || (detail.documents || []).length > 0;
  }
  function bookingWorkflowSteps() {
    const b = detail.booking;
    const received = paymentReceivedTotal();
    const sale = amountNum(b.selling_price);
    const openTasks = (workflow.tasks || []).filter(taskOpen).length;
    return [
      { key: "customer", title: "Customer linked", done: !!detail.customer || !!detail.corporate, note: detail.customer ? detail.customer.full_name : (detail.corporate ? detail.corporate.company_name : "Add customer/company context") },
      { key: "passengers", title: "Traveller details", done: (detail.passengers || []).length > 0, note: (detail.passengers || []).length + " passenger(s)" },
      { key: "payment", title: "Payment controlled", done: paymentIsCleared(b.payment_status) || (sale > 0 && received >= sale), tone: bookingIsConfirmed(b.status) && !paymentIsCleared(b.payment_status) ? "risk" : "", note: "Received " + money(received, b.currency) + " / Balance " + money(bookingBalance(), b.currency) },
      { key: "supplier", title: "Supplier controlled", done: !!b.supplier_reference || supplierPaidEnough(), note: b.supplier_reference || (supplierPaidEnough() ? "Supplier payment recorded" : "Add supplier reference/payment") },
      { key: "invoice", title: "Supplier invoice", done: hasSupplierInvoice(), note: hasSupplierInvoice() ? "Invoice attached" : "Upload when received" },
      { key: "documents", title: "Documents ready", done: documentsReady(), note: label(b.document_status) + " / " + (detail.documents || []).length + " record(s)" },
      { key: "tasks", title: "Open tasks clear", done: openTasks === 0, tone: openTasks ? "warn" : "", note: openTasks + " open task(s)" }
    ];
  }
  function bookingRisks() {
    const b = detail.booking;
    const risks = [];
    if (bookingIsConfirmed(b.status) && !paymentIsCleared(b.payment_status)) risks.push(["Payment risk", "Booking is confirmed before payment is fully cleared.", "payments"]);
    if ((b.booking_kind === "corporate" || detail.corporate) && detail.corporate && detail.corporate.lpo_required && !b.lpo_number) risks.push(["Corporate control", "LPO is required but not recorded.", "corporate"]);
    if (b.payment_status === "refund_pending") risks.push(["Refund pending", "Refund is waiting for approval or completion.", "refund"]);
    if (!b.supplier_reference) risks.push(["Supplier reference", "Supplier reference is not recorded yet.", "supplier"]);
    if (!documentsReady()) risks.push(["Document risk", "Documents are not ready for customer handover.", "documents"]);
    if ((workflow.tasks || []).some(function (t) { return taskOpen(t) && t.due_at && new Date(t.due_at) < new Date(); })) risks.push(["Overdue task", "One or more booking tasks are overdue.", "tasks"]);
    return risks;
  }
  function nextBookingAction() {
    const b = detail.booking;
    if (bookingIsConfirmed(b.status) && !paymentIsCleared(b.payment_status)) return { title: "Verify or collect payment", href: "#customer-payment-panel", text: "Do this before further supplier/customer handover." };
    if ((b.booking_kind === "corporate" || detail.corporate) && detail.corporate && detail.corporate.lpo_required && !b.lpo_number) return { title: "Record LPO or approval", href: "#booking-corporate-panel", text: "Corporate approval must be clear before closing control." };
    if (isDocumentHandoff() && !documentsReady()) return { title: "Prepare requested document", href: "#booking-document-panel", text: "Upload or record the requested " + documentHandoffType() + " and release it only when customer-safe." };
    if (!b.supplier_reference && !isDocumentHandoff()) return { title: "Add supplier reference", href: "#booking-status-form", text: "Connect the booking to supplier confirmation." };
    if (!documentsReady()) return { title: "Prepare documents", href: "#booking-document-panel", text: "Upload or record required documents." };
    if ((workflow.tasks || []).filter(taskOpen).length) return { title: "Close open tasks", href: "#booking-task-panel", text: "Finish pending staff follow-ups." };
    return { title: "Ready for final review", href: "#booking-status-form", text: "Check details, then complete/close when appropriate." };
  }

  async function boot() {
    const gate = document.getElementById("booking-detail-gate");
    const app = document.getElementById("booking-detail-app");
    bookingId = new URLSearchParams(location.search).get("id");
    if (!bookingId) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>Missing booking.</b><br>Open a booking from the booking list.</p><a class="btn btn-primary" href="bookings.html">Back to bookings</a></div>';
      return;
    }
    const user = await KridiyaAuth.currentUser();
    if (!user) { renderLoginForm(gate, boot); return; }
    sb = await KridiyaAuth.client();
    const staffCheck = await sb.rpc("is_staff");
    if (staffCheck.error || staffCheck.data !== true) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>You do not have access.</b><br>Bookings are for staff only.</p></div>';
      return;
    }
    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    await loadDetail();
  }

  async function loadDetail() {
    const result = await sb.rpc("get_operations_booking_detail", { p_booking_id: bookingId });
    if (result.error || !result.data) {
      document.getElementById("booking-detail-app").innerHTML = '<div class="account-main empty-state"><p>Could not load booking: ' + esc(result.error ? result.error.message : "Not found") + '</p></div>';
      return;
    }
    detail = result.data;
    await loadWorkflow();
    await loadQuoteContext();
    if (!businessSettings) await loadBusinessSettings();
    renderAll();
  }

  async function loadQuoteContext() {
    const result = await sb.rpc("get_booking_quote_context", { p_booking_id: bookingId });
    if (result.error || !result.data) {
      quoteContext = { quotes: [], can_edit_quotes: false };
      return;
    }
    quoteContext = result.data;
  }

  function renderAll() {
    const b = detail.booking;
    document.getElementById("booking-title").textContent = b.booking_reference + " - " + b.title;
    document.getElementById("booking-subtitle").textContent = isDocumentHandoff() ? "Document handoff / Corporate portal / " + documentHandoffRef() : label(b.service_type) + " / " + label(b.booking_kind) + (b.route_or_destination ? " / " + b.route_or_destination : "");
    document.getElementById("booking-detail-stats").innerHTML = [
      ["Selling price", moneyTile(b.selling_price, b.currency, detail.can_view_payments || detail.can_view_profit), "var(--status-quoted)"],
      ["Supplier cost", moneyTile(b.supplier_cost, b.currency, detail.can_view_profit || detail.can_view_payments), "var(--status-payment)"],
      ["Gross profit", moneyTile(b.gross_profit, b.currency, detail.can_view_profit), "var(--status-confirmed)"],
      ["Payment", label(b.payment_status), "var(--status-docs)"]
    ].map(function (s) { return '<div class="stat-tile" style="--tile-accent:' + s[2] + '"><div class="num stat-text">' + esc(s[1]) + '</div><div class="label">' + esc(s[0]) + '</div></div>'; }).join("");
    renderPortalIntake();
    renderBookingCommand();
    renderStatusForm();
    renderCustomer();
    renderBookingQuotes();
    renderCorporateControls();
    renderWorkflow();
    renderPassengers();
    renderDocuments();
    renderCustomerPayments();
    renderSupplierPayments();
  }

  function renderPortalIntake() {
    const shell = document.getElementById("booking-portal-intake");
    if (!shell) return;
    const b = detail.booking;
    if (!isPortalBooking()) {
      shell.innerHTML = "";
      return;
    }
    const corp = detail.corporate;
    const contact = detail.corporate_contact;
    const requester = contact ? contact.full_name : (b.customer_name || "Company contact");
    const company = corp ? corp.company_name : (b.corporate_company_name || "Corporate company");
    const approval = b.approval_person || (contact ? contact.full_name : "");
    const required = [];
    if (!approval) required.push("Confirm approver");
    if (!b.route_or_destination) required.push("Clarify route");
    if (!b.selling_price) required.push("Prepare quote");
    if (!paymentIsCleared(b.payment_status)) required.push("Control payment/LPO");
    if (!required.length) required.push("Continue fulfilment");
    if (isDocumentHandoff()) {
      shell.innerHTML =
        '<div class="account-main portal-intake-card portal-document-intake">' +
          '<div class="portal-intake-head">' +
            '<div><span>Corporate document handoff</span><h2>' + esc(documentHandoffType()) + '</h2><p>Company requested a customer-safe file from the portal. Match it to the original booking, prepare the document, then mark it visible only when ready.</p></div>' +
            '<a class="btn btn-primary" href="#booking-document-panel">Prepare document</a>' +
          '</div>' +
          '<div class="portal-intake-grid">' +
            '<div><b>' + esc(company) + '</b><small>Company</small></div>' +
            '<div><b>' + esc(requester) + '</b><small>Requested by</small></div>' +
            '<div><b>' + esc(documentHandoffRef()) + '</b><small>Related booking</small></div>' +
            '<div><b>' + esc(label(b.document_status)) + '</b><small>Document status</small></div>' +
          '</div>' +
          '<div class="portal-intake-note"><b>Company note</b><p>' + esc(documentHandoffNote()) + '</p></div>' +
          '<div class="portal-intake-actions"><span>Upload received file</span><span>Hide supplier/internal data</span><span>Release to portal</span></div>' +
        '</div>';
      return;
    }
    shell.innerHTML =
      '<div class="account-main portal-intake-card">' +
        '<div class="portal-intake-head">' +
          '<div><span>Corporate portal intake</span><h2>' + esc(company) + '</h2><p>Request submitted by ' + esc(requester) + '. Treat this as a company-visible job: quote clearly, keep internal cost hidden, release only approved documents.</p></div>' +
          '<a class="btn btn-primary" href="#booking-task-panel">Create follow-up</a>' +
        '</div>' +
        '<div class="portal-intake-grid">' +
          '<div><b>' + esc(label(b.service_type)) + '</b><small>Service requested</small></div>' +
          '<div><b>' + esc(b.route_or_destination || "Not specified") + '</b><small>Route / destination</small></div>' +
          '<div><b>' + esc(dateText(b.travel_start)) + '</b><small>Start date</small></div>' +
          '<div><b>' + esc(label(b.status)) + '</b><small>Current status</small></div>' +
        '</div>' +
        '<div class="portal-intake-actions">' + required.map(function (item) {
          return '<span>' + esc(item) + '</span>';
        }).join("") + '</div>' +
      '</div>';
  }

  function renderBookingQuotes() {
    const panel = document.getElementById("booking-quote-panel");
    if (!panel) return;
    const b = detail.booking;
    const quotes = quoteContext.quotes || [];
    const canEdit = !!quoteContext.can_edit_quotes;
    const form = canEdit ? '<form id="booking-quote-form" class="form-grid booking-quote-form" onsubmit="return false">' +
      '<div class="field-row">' +
        '<div class="field col-5"><label>QUOTE TITLE</label><input name="title" required placeholder="Option 1 - Emirates morning flight"></div>' +
        '<div class="field col-3"><label>AMOUNT</label><input name="price_amount" type="number" min="1" step="0.01" required placeholder="0.00"></div>' +
        '<div class="field col-2"><label>CURRENCY</label><input name="currency" value="' + esc(b.currency || "AED") + '"></div>' +
        '<div class="field col-2"><label>VALID UNTIL</label><input name="valid_until" type="datetime-local"></div>' +
        '<div class="field col-12"><label>CUSTOMER DESCRIPTION</label><textarea name="description" placeholder="Customer-safe details: airline/hotel/service option, route, inclusions, baggage, deadline, and approval note."></textarea></div>' +
        '<div class="field col-12"><label>TERMS SHOWN TO COMPANY</label><textarea name="terms">Final booking is completed after company approval, payment/LPO clearance, and supplier availability check. Fares, seats, rooms, visa rules, refunds, and cancellation terms may change until confirmed.</textarea></div>' +
      '</div>' +
      '<button class="btn btn-primary" type="submit">Release quote to portal</button>' +
    '</form>' : '<p class="form-note">Booking edit permission required to create quotes.</p>';
    panel.innerHTML = '<div class="quote-control-note"><b>Portal-safe quote rule</b><p>Only selling price, customer description, validity, and terms are visible to the company. Supplier cost and internal notes stay hidden.</p></div>' + form + renderBookingQuoteRows(quotes);
    const f = document.getElementById("booking-quote-form");
    if (f) f.addEventListener("submit", createBookingQuote);
  }

  function renderBookingQuoteRows(rows) {
    if (!rows.length) return '<p class="form-note">No quote options released yet.</p>';
    return '<div class="ops-list payment-history">' + rows.map(function (q) {
      const amount = money(q.price_amount, q.currency || "AED");
      const valid = q.valid_until ? dateTimeText(q.valid_until) : "Not set";
      return '<div class="ops-row quote-release-row"><div class="ops-row-main"><b>' + esc(q.title || "Quote option") + '</b><p>' + esc(q.description || "No customer description") + '</p><div class="ops-kv"><span class="ops-chip">Status: ' + esc(label(q.status || "sent")) + '</span><span class="ops-chip">Valid: ' + esc(valid) + '</span>' + (q.responded_at ? '<span class="ops-chip">Responded: ' + esc(dateTimeText(q.responded_at)) + '</span>' : '') + '</div></div><div class="ops-row-actions"><span class="finance-value">' + esc(amount) + '</span></div></div>';
    }).join("") + '</div>';
  }

  async function createBookingQuote() {
    const form = document.getElementById("booking-quote-form");
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const validUntil = form.valid_until.value ? new Date(form.valid_until.value).toISOString() : null;
    const result = await sb.rpc("create_booking_quote_option", {
      p_booking_id: bookingId,
      p_title: form.title.value,
      p_description: form.description.value || null,
      p_price_amount: Number(form.price_amount.value || 0),
      p_currency: form.currency.value || "AED",
      p_valid_until: validUntil,
      p_terms: form.terms.value || null,
      p_option_data: {
        service: detail.booking.service_type,
        route_or_destination: detail.booking.route_or_destination,
        travel_start: detail.booking.travel_start,
        travel_end: detail.booking.travel_end
      }
    });
    button.disabled = false;
    if (result.error) { toast("Could not release quote: " + result.error.message); return; }
    toast("Quote released to corporate portal.");
    await loadDetail();
  }

  function renderBookingCommand() {
    const panel = document.getElementById("booking-command-panel");
    if (!panel) return;
    const steps = bookingWorkflowSteps();
    const done = steps.filter(function (s) { return s.done; }).length;
    const percent = steps.length ? Math.round((done / steps.length) * 100) : 0;
    const risks = bookingRisks();
    const next = nextBookingAction();
    panel.innerHTML =
      '<div class="booking-command-summary"><div><b>' + esc(percent) + '%</b><span>Workflow complete</span><p>' + esc(done) + ' of ' + esc(steps.length) + ' controls are clear</p></div><a class="btn btn-primary" href="' + esc(next.href) + '">' + esc(next.title) + '</a></div>' +
      '<div class="booking-next-action"><b>Next action</b><span>' + esc(next.text) + '</span></div>' +
      '<div class="booking-step-grid">' + steps.map(function (s) {
        const state = s.done ? "done" : (s.tone || "todo");
        return '<div class="booking-step ' + esc(state) + '"><span>' + (s.done ? "OK" : "!") + '</span><div><b>' + esc(s.title) + '</b><p>' + esc(s.note) + '</p></div></div>';
      }).join("") + '</div>' +
      '<div class="booking-risk-strip">' + (risks.length ? risks.map(function (r) {
        return '<div class="booking-risk"><b>' + esc(r[0]) + '</b><span>' + esc(r[1]) + '</span></div>';
      }).join("") : '<div class="booking-risk ok"><b>No major risk flagged</b><span>Continue normal booking review.</span></div>') + '</div>';
  }

  function renderStatusForm() {
    const b = detail.booking;
    const canEdit = detail.can_edit_bookings;
    document.getElementById("booking-status-form").innerHTML = '<div class="field-row">' +
      '<div class="field col-4"><label>BOOKING STATUS</label><select name="status" ' + (canEdit ? '' : 'disabled') + '>' + optionList(BOOKING_STATUS, b.status) + '</select></div>' +
      '<div class="field col-4"><label>PAYMENT STATUS</label><select name="payment_status" ' + (canEdit ? '' : 'disabled') + '>' + optionList(PAYMENT_STATUS, b.payment_status) + '</select></div>' +
      '<div class="field col-4"><label>DOCUMENT STATUS</label><select name="document_status" ' + (canEdit ? '' : 'disabled') + '>' + optionList(DOC_STATUS, b.document_status) + '</select></div>' +
      '<div class="field col-6"><label>SUPPLIER REFERENCE</label><input name="supplier_reference" value="' + esc(b.supplier_reference || "") + '" ' + (canEdit ? '' : 'disabled') + '></div>' +
      '<div class="field col-12"><label>INTERNAL NOTES</label><textarea name="staff_notes" ' + (canEdit ? '' : 'disabled') + '>' + esc(b.staff_notes || "") + '</textarea></div>' +
      '</div>' + (canEdit ? '<button type="submit" class="btn btn-primary">Save booking status</button>' : '<p class="form-note">You do not have permission to edit booking status.</p>');
    if (canEdit) document.getElementById("booking-status-form").onsubmit = saveStatus;
  }

  async function saveStatus() {
    const form = document.getElementById("booking-status-form");
    const result = await sb.rpc("update_operations_booking_status", {
      p_booking_id: bookingId,
      p_status: form.status.value,
      p_payment_status: form.payment_status.value,
      p_document_status: form.document_status.value,
      p_supplier_reference: form.supplier_reference.value || null,
      p_staff_notes: form.staff_notes.value || null
    });
    if (result.error) { toast("Could not save booking: " + result.error.message); return; }
    toast("Booking updated.");
    await loadDetail();
  }

  function renderCustomer() {
    const c = detail.customer;
    const corp = detail.corporate;
    const contact = detail.corporate_contact;
    if (c) {
      document.getElementById("booking-customer-box").innerHTML = '<div class="ops-list"><div class="ops-row"><div class="ops-row-main"><b>' + esc(c.full_name) + '</b><p>' + esc(c.email || "No email") + ' / ' + esc(c.phone || c.whatsapp || "No phone") + '</p><div class="ops-kv"><span class="ops-chip">Source: ' + esc(label(c.source)) + '</span>' + (corp ? '<span class="ops-chip">Corporate: ' + esc(corp.company_name) + '</span>' : '') + '</div></div></div></div>';
      return;
    }
    if (contact) {
      document.getElementById("booking-customer-box").innerHTML =
        '<div class="ops-list"><div class="ops-row"><div class="ops-row-main"><b>' + esc(contact.full_name || "Corporate contact") + '</b>' +
        '<p>' + esc(contact.email || "No email") + ' / ' + esc(contact.phone || contact.whatsapp || "No phone") + '</p>' +
        '<div class="ops-kv"><span class="ops-chip">Corporate contact</span>' + (corp ? '<span class="ops-chip">Company: ' + esc(corp.company_name) + '</span>' : '') +
        (contact.is_authorized_contact ? '<span class="ops-chip">Authorized</span>' : '') + (contact.is_accounts_contact ? '<span class="ops-chip">Accounts</span>' : '') + '</div></div></div></div>';
      return;
    }
    document.getElementById("booking-customer-box").innerHTML = '<p class="form-note">No customer or corporate contact linked yet.</p>';
  }


  function renderCorporateControls() {
    const card = document.getElementById("booking-corporate-card");
    const panel = document.getElementById("booking-corporate-panel");
    const b = detail.booking;
    const corp = detail.corporate;
    const contact = detail.corporate_contact;
    if (!corp && b.booking_kind !== "corporate") {
      card.hidden = true;
      panel.innerHTML = "";
      return;
    }
    card.hidden = false;
    const canEdit = detail.can_edit_corporates;
    const contactLine = contact ? esc(contact.full_name) + (contact.job_title ? ' / ' + esc(contact.job_title) : '') + (contact.email ? ' / ' + esc(contact.email) : '') : 'No corporate contact linked';
    const companyInfo = corp ? '<div class="ops-kv corporate-control-chips"><span class="ops-chip">Company: ' + esc(corp.company_name) + '</span><span class="ops-chip">Terms: ' + esc(label(corp.payment_terms)) + '</span><span class="ops-chip">LPO required: ' + esc(corp.lpo_required ? "Yes" : "No") + '</span><span class="ops-chip">Credit: ' + esc(corp.credit_allowed ? "Yes" : "No") + '</span><span class="ops-chip">Monthly billing: ' + esc(corp.monthly_billing ? "Yes" : "No") + '</span></div><p class="form-note">Billing: ' + esc(corp.billing_email || "No billing email") + ' / Accounts: ' + esc(corp.accounts_email || "No accounts email") + '</p><p class="form-note">Contact: ' + contactLine + '</p>' : '<p class="blocked-note">This is marked corporate, but no company is linked yet.</p>';
    const form = canEdit ? '<form id="corporate-control-form" class="form-grid payment-mini-form" onsubmit="return false"><div class="field-row"><div class="field col-6"><label>LPO NUMBER</label><input name="lpo_number" value="' + esc(b.lpo_number || "") + '" placeholder="Required if company asks for LPO"></div><div class="field col-6"><label>APPROVAL PERSON</label><input name="approval_person" value="' + esc(b.approval_person || "") + '" placeholder="Who approved this booking?"></div></div><button class="btn btn-primary" type="submit">Save corporate controls</button></form>' : '<p class="form-note">You do not have permission to edit corporate controls.</p>';
    panel.innerHTML = companyInfo + form;
    const f = document.getElementById("corporate-control-form");
    if (f) f.addEventListener("submit", saveCorporateControls);
  }

  async function saveCorporateControls() {
    const form = document.getElementById("corporate-control-form");
    const result = await sb.rpc("update_booking_corporate_controls", {
      p_booking_id: bookingId,
      p_lpo_number: form.lpo_number.value || null,
      p_approval_person: form.approval_person.value || null
    });
    if (result.error) { toast("Could not save corporate controls: " + result.error.message); return; }
    toast("Corporate controls saved.");
    await loadDetail();
  }
  async function loadWorkflow() {
    const result = await sb.rpc("get_booking_workflow", { p_booking_id: bookingId });
    if (result.error || !result.data) {
      workflow = { tasks: [], timeline: [], can_edit_tasks: false, can_view_activity: false };
      return;
    }
    workflow = result.data;
  }

  function renderWorkflow() {
    renderTaskPanel();
    renderTimelinePanel();
  }

  function renderTaskPanel() {
    const panel = document.getElementById("booking-task-panel");
    const rows = workflow.tasks || [];
    const canEdit = workflow.can_edit_tasks;
    const openTasks = rows.filter(taskOpen);
    const doneTasks = rows.filter(function (t) { return !taskOpen(t); });
    const form = canEdit ? '<form id="booking-task-form" class="form-grid payment-mini-form" onsubmit="return false"><div class="field-row"><div class="field col-6"><label>TASK</label><input name="title" required placeholder="Call customer, check supplier, collect LPO"></div><div class="field col-3"><label>TYPE</label><select name="task_type">' + optionList(TASK_TYPES, "follow_up") + '</select></div><div class="field col-3"><label>PRIORITY</label><select name="priority">' + optionList(TASK_PRIORITIES, "normal") + '</select></div><div class="field col-6"><label>DUE DATE / TIME</label><input name="due_at" type="datetime-local"></div><div class="field col-6"><label>NOTES</label><input name="notes" placeholder="Short internal instruction"></div></div><button class="btn btn-primary" type="submit">Add task</button></form>' : '<p class="form-note">Booking permission required to add tasks.</p>';
    panel.innerHTML = form + '<div class="ops-kv"><span class="ops-chip">Open: ' + esc(openTasks.length) + '</span><span class="ops-chip">Done: ' + esc(doneTasks.length) + '</span></div>' + renderTaskRows(rows, canEdit);
    const f = document.getElementById("booking-task-form");
    if (f) f.addEventListener("submit", createBookingTask);
  }

  function renderTaskRows(rows, canEdit) {
    if (!rows.length) return '<p class="form-note">No tasks yet.</p>';
    return '<div class="ops-list payment-history">' + rows.map(function (t) {
      const done = !taskOpen(t);
      const meta = label(t.task_type) + ' / ' + label(t.priority) + ' / Due: ' + dateTimeText(t.due_at);
      return '<div class="ops-row ' + (done ? 'is-muted' : '') + '"><div class="ops-row-main"><b>' + esc(t.title) + '</b><p>' + esc(meta) + (t.assigned_to_name ? ' / ' + esc(t.assigned_to_name) : '') + '</p><div class="ops-kv"><span class="ops-chip">' + esc(label(t.status)) + '</span>' + (t.notes ? '<span class="ops-chip">' + esc(t.notes) + '</span>' : '') + '</div></div><div class="ops-row-actions">' + (!done && canEdit ? '<button class="btn btn-outline js-complete-task" data-id="' + esc(t.id) + '" type="button">Done</button>' : '') + '</div></div>';
    }).join("") + '</div>';
  }

  function renderTimelinePanel() {
    const panel = document.getElementById("booking-timeline-panel");
    if (!workflow.can_view_activity) {
      panel.innerHTML = '<p class="form-note">Report or booking edit permission required to view activity.</p>';
      return;
    }
    const rows = workflow.timeline || [];
    if (!rows.length) {
      panel.innerHTML = '<p class="form-note">No activity recorded yet.</p>';
      return;
    }
    panel.innerHTML = '<div class="ops-list payment-history">' + rows.map(function (e) {
      const meta = e.metadata || {};
      const summary = meta.title || meta.reference || meta.document_number || meta.task_id || meta.payment_reference || "";
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(label(e.event_type)) + '</b><p>' + esc(dateTimeText(e.created_at)) + (e.actor_name ? ' / ' + esc(e.actor_name) : '') + '</p>' + (summary ? '<div class="ops-kv"><span class="ops-chip">' + esc(summary) + '</span></div>' : '') + '</div></div>';
    }).join("") + '</div>';
  }

  async function createBookingTask() {
    const form = document.getElementById("booking-task-form");
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const result = await sb.rpc("create_booking_task", {
      p_booking_id: bookingId,
      p_title: form.title.value,
      p_task_type: form.task_type.value,
      p_due_at: form.due_at.value ? new Date(form.due_at.value).toISOString() : null,
      p_priority: form.priority.value,
      p_notes: form.notes.value || null
    });
    button.disabled = false;
    if (result.error) { toast("Could not add task: " + result.error.message); return; }
    toast("Task added.");
    form.reset();
    await loadDetail();
  }

  async function completeBookingTask(id) {
    const result = await sb.rpc("complete_booking_task", { p_task_id: id });
    if (result.error) { toast("Could not complete task: " + result.error.message); return; }
    toast("Task completed.");
    await loadDetail();
  }
  function renderPassengers() {
    const rows = detail.passengers || [];
    const canEdit = detail.can_edit_bookings;
    const form = canEdit ? '<form id="booking-passenger-form" class="form-grid payment-mini-form" onsubmit="return false"><div class="field-row"><div class="field col-6"><label>PASSENGER NAME</label><input name="passenger_name" required placeholder="As per passport"></div><div class="field col-6"><label>TYPE</label><select name="passenger_type">' + optionList(PASSENGER_TYPES, "adult") + '</select></div><div class="field col-4"><label>NATIONALITY</label><input name="nationality" data-preset="nationality" placeholder="Indian, UAE, etc."></div><div class="field col-4"><label>DATE OF BIRTH</label><input name="date_of_birth" type="date"></div><div class="field col-4"><label>PASSPORT EXPIRY</label><input name="passport_expiry" type="date"></div><div class="field col-6"><label>PASSPORT NUMBER</label><input name="passport_number"></div><div class="field col-6"><label>NOTES</label><input name="notes" placeholder="Seat, meal, visa note"></div></div><button class="btn btn-primary" type="submit">Add passenger</button></form>' : '<p class="form-note">Booking edit permission required to add passengers.</p>';
    document.getElementById("booking-passenger-panel").innerHTML = form + renderPassengerRows(rows, canEdit);
    if (typeof initPresetAC === "function") initPresetAC(document.getElementById("booking-passenger-panel"));
    const f = document.getElementById("booking-passenger-form");
    if (f) f.addEventListener("submit", recordPassenger);
  }

  function renderPassengerRows(rows, canEdit) {
    if (!rows.length) return '<p class="form-note">No passengers added yet.</p>';
    return '<div class="ops-list payment-history">' + rows.map(function (r) {
      const passport = r.passport_number ? 'Passport: ' + r.passport_number + ' / Exp: ' + dateText(r.passport_expiry) : 'Passport not added';
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(r.passenger_name) + '</b><p>' + esc(label(r.passenger_type)) + ' / ' + esc(r.nationality || "Nationality not set") + ' / DOB: ' + esc(dateText(r.date_of_birth)) + '</p><div class="ops-kv"><span class="ops-chip">' + esc(passport) + '</span>' + (r.notes ? '<span class="ops-chip">' + esc(r.notes) + '</span>' : '') + '</div></div>' + (canEdit ? '<div class="ops-row-actions"><button class="btn btn-outline js-delete-passenger" data-id="' + esc(r.id) + '" type="button">Remove</button></div>' : '') + '</div>';
    }).join("") + '</div>';
  }

  function renderDocuments() {
    const rows = detail.booking_documents || [];
    const canEdit = detail.can_edit_documents;
    let required = (REQUIRED_DOCUMENTS[detail.booking.service_type] || REQUIRED_DOCUMENTS.other).slice();
    if (detail.booking.booking_kind === "corporate") {
      required = required.concat(["trade_license"]);
      if (detail.corporate && detail.corporate.trn) required = required.concat(["trn_certificate"]);
      if (detail.corporate && detail.corporate.lpo_required) required = required.concat(["lpo"]);
      required = required.concat(["approval_email"]);
      required = required.filter(function (type, index, arr) { return arr.indexOf(type) === index; });
    }
    const receivedTypes = rows.reduce(function (set, row) { set[row.document_type] = true; return set; }, {});
    const checklist = '<div class="doc-checklist">' + required.map(function (type) {
      return '<span class="doc-check ' + (receivedTypes[type] ? 'is-done' : '') + '">' + esc(receivedTypes[type] ? "Received: " : "Pending: ") + esc(label(type)) + '</span>';
    }).join("") + '</div>';
    const requestedKey = isDocumentHandoff() ? documentHandoffTypeKey() : required[0];
    const handoffPanel = isDocumentHandoff() ? '<div class="notice-card notice-warn"><b>Corporate document handoff</b><p>Requested: ' + esc(documentHandoffType()) + ' for ' + esc(documentHandoffRef()) + '. Company note: ' + esc(documentHandoffNote()) + '</p><p>Upload or record the customer-safe file, then release it to the corporate portal. Supplier cost and internal notes stay hidden.</p></div>' : '';
    const releaseCheck = isDocumentHandoff() ? ' checked' : '';
    const form = canEdit ? handoffPanel + '<form id="booking-document-form" class="form-grid payment-mini-form" onsubmit="return false"><div class="field-row"><div class="field col-6"><label>DOCUMENT TYPE</label><select name="document_type">' + optionList(DOCUMENT_TYPES, requestedKey) + '</select></div><div class="field col-6"><label>DOCUMENT NAME</label><input name="file_name" value="' + esc(isDocumentHandoff() ? documentHandoffType() + ' - ' + documentHandoffRef() : '') + '" placeholder="Passport copy received"></div><div class="field col-8"><label>REFERENCE / NOTE</label><input name="external_reference" value="' + esc(isDocumentHandoff() ? 'Corporate portal request - ' + documentHandoffRef() : '') + '" placeholder="WhatsApp, email, portal ref, file location"></div><div class="field col-4"><label>UPLOAD FILE</label><input name="document_file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"></div></div><label class="checkline document-release-check"><input name="visible_to_customer" type="checkbox"' + releaseCheck + '> Release to corporate portal after saving</label><button class="btn btn-primary" type="submit">Save document record</button></form>' : '<p class="form-note">Document permission required to record documents.</p>';
    const generatedActions = canEdit ? '<div class="ops-row"><div class="ops-row-main"><b>Customer booking document</b><p>Create a customer-safe booking confirmation or itinerary from the current booking and passenger details.</p></div><div class="ops-row-actions"><button class="btn btn-outline js-print-booking-confirmation" type="button">Booking confirmation</button></div></div>' : '';
    document.getElementById("booking-document-panel").innerHTML = checklist + generatedActions + form + renderDocumentRows(rows, canEdit);
    const f = document.getElementById("booking-document-form");
    if (f) f.addEventListener("submit", recordDocument);
  }

  function renderDocumentRows(rows, canEdit) {
    if (!rows.length) return '<p class="form-note">No document records yet.</p>';
    return '<div class="ops-list payment-history">' + rows.map(function (r) {
      const releaseButton = canEdit && r.storage_path
        ? '<button class="btn btn-outline js-toggle-document-release" data-id="' + esc(r.id) + '" data-visible="' + esc(r.visible_to_customer ? "false" : "true") + '" type="button">' + esc(r.visible_to_customer ? "Hide from customer" : "Release to customer") + '</button>'
        : '';
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(label(r.document_type)) + '</b><p>' + esc(r.file_name) + (r.external_reference ? ' - ' + esc(r.external_reference) : '') + '</p><div class="ops-kv"><span class="ops-chip">' + (r.visible_to_customer ? 'Customer visible' : 'Internal only') + '</span>' + (r.storage_path ? '<span class="ops-chip">File saved</span>' : '<span class="ops-chip">No file attached</span>') + '</div></div><div class="ops-row-actions">' + (r.storage_path ? '<button class="btn btn-outline js-view-booking-document" data-id="' + esc(r.id) + '" data-path="' + esc(r.storage_path) + '" data-name="' + esc(r.file_name) + '" type="button">View</button>' : '') + releaseButton + (canEdit ? '<button class="btn btn-outline js-delete-document" data-id="' + esc(r.id) + '" data-path="' + esc(r.storage_path || "") + '" type="button">Remove</button>' : '') + '</div></div>';
    }).join("") + '</div>';
  }

  async function recordPassenger() {
    const form = document.getElementById("booking-passenger-form");
    const result = await sb.rpc("record_booking_passenger", {
      p_booking_id: bookingId,
      p_passenger_name: form.passenger_name.value,
      p_passenger_type: form.passenger_type.value,
      p_nationality: form.nationality.value || null,
      p_date_of_birth: form.date_of_birth.value || null,
      p_passport_number: form.passport_number.value || null,
      p_passport_expiry: form.passport_expiry.value || null,
      p_notes: form.notes.value || null
    });
    if (result.error) { toast("Could not add passenger: " + result.error.message); return; }
    toast("Passenger added.");
    form.reset();
    await loadDetail();
  }

  async function recordDocument() {
    const form = document.getElementById("booking-document-form");
    const button = form.querySelector('button[type="submit"]');
    const file = form.document_file && form.document_file.files.length ? form.document_file.files[0] : null;
    button.disabled = true;
    button.textContent = file ? "Uploading..." : "Saving...";
    if (file) {
      const uploadForm = new FormData();
      uploadForm.append("action", "upload_booking_document");
      uploadForm.append("booking_id", bookingId);
      uploadForm.append("document_type", form.document_type.value);
      uploadForm.append("external_reference", form.external_reference.value || "");
      uploadForm.append("visible_to_customer", form.visible_to_customer && form.visible_to_customer.checked ? "true" : "false");
      uploadForm.append("file", file, file.name);
      try {
        await invokeMicrosoftUpload(uploadForm);
      } catch (error) {
        button.disabled = false;
        button.textContent = "Save document record";
        toast("Could not upload file: " + (error.message || "Microsoft storage failed"));
        return;
      }
    }
    const result = file ? { error: null } : await sb.rpc("record_booking_document", {
        p_booking_id: bookingId,
        p_document_type: form.document_type.value,
        p_file_name: form.file_name.value || "Document received",
        p_external_reference: form.external_reference.value || null,
        p_storage_path: null,
        p_visible_to_customer: !!(form.visible_to_customer && form.visible_to_customer.checked)
      });
    button.disabled = false;
    button.textContent = "Save document record";
    if (result.error) {
      toast("Could not record document: " + result.error.message);
      return;
    }
    const released = !!(form.visible_to_customer && form.visible_to_customer.checked);
    toast(released ? "Document saved and released to corporate portal." : (file ? "Document uploaded and recorded internally." : "Document recorded internally."));
    form.reset();
    await loadDetail();
  }

  async function deletePassenger(id) {
    const result = await sb.rpc("delete_booking_passenger", { p_passenger_id: id });
    if (result.error) { toast("Could not remove passenger: " + result.error.message); return; }
    toast("Passenger removed.");
    await loadDetail();
  }

  async function viewBookingDocument(id, path, fileName) {
    if (isMicrosoftPath(path)) {
      try { await downloadMicrosoft({ action: "download_booking_document", document_id: id }, fileName); }
      catch (error) { toast("Could not open document: " + (error.message || "Microsoft storage failed")); }
      return;
    }
    const result = await sb.storage.from("booking-documents").createSignedUrl(path, 180);
    if (result.error || !result.data) {
      toast("Could not open document: " + (result.error ? result.error.message : "unknown error"));
      return;
    }
    window.open(result.data.signedUrl, "_blank", "noopener");
  }

  async function toggleDocumentRelease(id, visible) {
    const result = await sb
      .from("booking_documents")
      .update({ visible_to_customer: visible })
      .eq("id", id)
      .select("id")
      .single();
    if (result.error) {
      toast("Could not update document visibility: " + result.error.message);
      return;
    }
    toast(visible ? "Document released to customer." : "Document hidden from customer.");
    await loadDetail();
  }

  async function uploadPaymentProof(paymentId, file) {
    if (!file) return;
    const form = new FormData();
    form.append("action", "upload_payment_proof");
    form.append("payment_id", paymentId);
    form.append("file", file, file.name);
    try { await invokeMicrosoftUpload(form); }
    catch (error) { toast("Could not upload proof: " + (error.message || "Microsoft storage failed")); return; }
    toast("Payment proof uploaded.");
    await loadDetail();
  }

  async function viewPaymentProof(id, path) {
    if (isMicrosoftPath(path)) {
      try { await downloadMicrosoft({ action: "download_staff_file", kind: "payment_proof", record_id: id }); }
      catch (error) { toast("Could not open proof: " + (error.message || "Microsoft storage failed")); }
      return;
    }
    const result = await sb.storage.from("booking-payment-proofs").createSignedUrl(path, 180);
    if (result.error || !result.data) {
      toast("Could not open proof: " + (result.error ? result.error.message : "unknown error"));
      return;
    }
    window.open(result.data.signedUrl, "_blank", "noopener");
  }

  async function uploadSupplierInvoice(supplierPaymentId, file) {
    if (!file) return;
    const form = new FormData();
    form.append("action", "upload_supplier_invoice");
    form.append("supplier_payment_id", supplierPaymentId);
    form.append("file", file, file.name);
    try { await invokeMicrosoftUpload(form); }
    catch (error) { toast("Could not upload supplier invoice: " + (error.message || "Microsoft storage failed")); return; }
    toast("Supplier invoice uploaded.");
    await loadDetail();
  }

  async function viewSupplierInvoice(id, path) {
    if (isMicrosoftPath(path)) {
      try { await downloadMicrosoft({ action: "download_staff_file", kind: "supplier_invoice", record_id: id }); }
      catch (error) { toast("Could not open supplier invoice: " + (error.message || "Microsoft storage failed")); }
      return;
    }
    const result = await sb.storage.from("supplier-invoices").createSignedUrl(path, 180);
    if (result.error || !result.data) {
      toast("Could not open supplier invoice: " + (result.error ? result.error.message : "unknown error"));
      return;
    }
    window.open(result.data.signedUrl, "_blank", "noopener");
  }

  async function deleteDocument(id, path) {
    if (isMicrosoftPath(path)) {
      const removal = await sb.functions.invoke("microsoft-documents", { body: { action: "delete_booking_document", document_id: id } });
      if (removal.error) { toast("Could not remove document: " + removal.error.message); return; }
      toast("Document removed.");
      await loadDetail();
      return;
    }
    const result = await sb.rpc("delete_booking_document", { p_document_id: id });
    if (result.error) { toast("Could not remove document: " + result.error.message); return; }
    if (path) await sb.storage.from("booking-documents").remove([path]);
    toast("Document removed.");
    await loadDetail();
  }

  function renderCustomerPayments() {
    const rows = detail.payments || [];
    const b = detail.booking;
    const received = paymentReceivedTotal();
    const balance = bookingBalance();
    const control = paymentControlNote();
    const controlHtml = '<div class="payment-control ' + esc(control.tone) + '"><div><b>' + esc(control.text) + '</b><p>Sale: ' + esc(money(b.selling_price, b.currency)) + ' / Received: ' + esc(money(received, b.currency)) + ' / Balance: ' + esc(money(balance, b.currency)) + '</p></div></div>';
    const controlActions = detail.can_edit_bookings ? '<div class="payment-control-actions"><button class="btn btn-outline" type="button" data-payment-control="request_sent">Mark payment request sent</button><button class="btn btn-outline" type="button" data-payment-control="proof_received">Mark LPO/proof received</button><button class="btn btn-primary" type="button" data-payment-control="paid">Mark payment received</button></div>' : '';
    const request = detail.can_edit_payments ? '<form id="payment-request-form" class="form-grid payment-mini-form payment-request-form" onsubmit="return false"><div class="field-row"><div class="field col-4"><label>REQUEST AMOUNT</label><input name="amount_requested" type="number" min="0" step="0.01" value="' + esc(balance || b.selling_price || "") + '"></div><div class="field col-8"><label>PAYMENT REQUEST NOTE</label><input name="request_notes" placeholder="Bank transfer, payment link, due date, approval note"></div></div><button class="btn btn-outline" type="submit">Generate payment request</button></form>' : '';
    const form = detail.can_edit_payments ? '<form id="customer-payment-form" class="form-grid payment-mini-form" onsubmit="return false"><div class="field-row"><div class="field col-4"><label>AMOUNT</label><input name="amount" type="number" min="0" step="0.01" required></div><div class="field col-4"><label>METHOD</label><select name="method"><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="payment_link">Payment link</option><option value="stripe">Stripe</option><option value="tabby">Tabby</option><option value="tamara">Tamara</option><option value="paypal">PayPal</option><option value="other">Other</option></select></div><div class="field col-4"><label>STATUS</label><select name="status"><option value="received">Received</option><option value="proof_received">Proof received</option><option value="pending">Pending</option></select></div><div class="field col-6"><label>PAYMENT LINK / REF</label><input name="payment_link" placeholder="Stripe link, bank ref, receipt ref"></div><div class="field col-6"><label>NOTES</label><input name="notes" placeholder="Receipt note, transfer note, approval note"></div></div><button class="btn btn-primary" type="submit">Record customer payment</button></form>' : '<p class="form-note">Finance permission required to record payments.</p>';
    document.getElementById("customer-payment-panel").innerHTML = controlHtml + controlActions + request + form + renderPaymentRows(rows, true);
    document.querySelectorAll("[data-payment-control]").forEach(function (btn) {
      btn.addEventListener("click", function () { updatePaymentControlStatus(btn.dataset.paymentControl); });
    });
    const f = document.getElementById("customer-payment-form");
    if (f) f.addEventListener("submit", recordCustomerPayment);
    const requestForm = document.getElementById("payment-request-form");
    if (requestForm) requestForm.addEventListener("submit", generatePaymentRequest);
  }

  async function updatePaymentControlStatus(paymentStatus) {
    const b = detail.booking;
    const nextBookingStatus = paymentStatus === "paid" && ["enquiry", "quote_sent", "payment_pending"].indexOf(String(b.status || "")) !== -1
      ? "confirmed"
      : (String(b.status || "") === "enquiry" || String(b.status || "") === "quote_sent" ? "payment_pending" : b.status);
    const result = await sb.rpc("update_operations_booking_status", {
      p_booking_id: bookingId,
      p_status: nextBookingStatus,
      p_payment_status: paymentStatus,
      p_document_status: b.document_status,
      p_supplier_reference: b.supplier_reference || null,
      p_staff_notes: b.staff_notes || null
    });
    if (result.error) { toast("Could not update payment control: " + result.error.message); return; }
    toast("Payment control updated.");
    await loadDetail();
  }
  function renderSupplierPayments() {
    const rows = detail.supplier_payments || [];
    const b = detail.booking;
    const form = detail.can_edit_payments ? '<form id="supplier-payment-form" class="form-grid payment-mini-form" onsubmit="return false"><div class="field-row"><div class="field col-6"><label>SUPPLIER</label><input name="supplier_name" required value="' + esc(b.supplier_name || "") + '"></div><div class="field col-6"><label>SUPPLIER REF</label><input name="supplier_reference" value="' + esc(b.supplier_reference || "") + '"></div><div class="field col-4"><label>PAYABLE</label><input name="amount_payable" type="number" min="0" step="0.01" required value="' + esc(b.supplier_cost || "") + '"></div><div class="field col-4"><label>PAID</label><input name="amount_paid" type="number" min="0" step="0.01" value="0"></div><div class="field col-4"><label>STATUS</label><select name="status"><option value="pending">Pending</option><option value="partial">Partial</option><option value="paid">Paid</option><option value="disputed">Disputed</option></select></div><div class="field col-12"><label>NOTES</label><input name="notes" placeholder="Supplier invoice or portal note"></div></div><button class="btn btn-primary" type="submit">Record supplier payment</button></form>' : '<p class="form-note">Finance permission required to record supplier payments.</p>';
    document.getElementById("supplier-payment-panel").innerHTML = renderSupplierControl() + form + renderPaymentRows(rows, false);
    const f = document.getElementById("supplier-payment-form");
    if (f) f.addEventListener("submit", recordSupplierPayment);
  }

  function renderPaymentRows(rows, customer) {
    if (!rows.length) return '<p class="form-note">No records yet.</p>';
    return '<div class="ops-list payment-history">' + rows.map(function (r) {
      const title = customer ? (r.payment_reference || "Payment") : r.supplier_name;
      const amount = customer ? money(r.amount, r.currency) : money(r.amount_paid, r.currency) + ' / ' + money(r.amount_payable, r.currency);
      const receiptBtn = customer && r.status === "received"
        ? '<button class="btn btn-outline js-print-receipt" data-id="' + esc(r.id) + '" type="button">Receipt</button>'
        : '';
      const refundBtn = customer && (amountNum(r.refund_amount) > 0 || ["refund_pending", "refunded"].indexOf(String(r.status || "")) !== -1)
        ? '<button class="btn btn-outline js-print-refund-note" data-id="' + esc(r.id) + '" type="button">Refund note</button>'
        : '';
      const supplierNoteBtn = !customer
        ? '<button class="btn btn-outline js-print-supplier-note" data-id="' + esc(r.id) + '" type="button">Payment note</button>'
        : '';
      const ref = customer && r.payment_link ? '<span class="ops-chip">Ref/link saved</span>' : '';
      const proofChip = customer && r.proof_storage_path ? '<span class="ops-chip">Proof attached</span>' : '';
      const proofActions = customer
        ? (r.proof_storage_path ? '<button class="btn btn-outline js-view-proof" data-id="' + esc(r.id) + '" data-path="' + esc(r.proof_storage_path) + '" type="button">View proof</button>' : '')
          + (detail.can_edit_payments ? '<label class="btn btn-outline proof-upload-label">' + (r.proof_storage_path ? 'Replace proof' : 'Upload proof') + '<input type="file" class="js-proof-file" data-id="' + esc(r.id) + '" accept="image/*,application/pdf" hidden></label>' : '')
        : '';
      const invoiceChip = !customer && r.supplier_invoice_path ? '<span class="ops-chip">Invoice attached</span>' : '';
      const sharepointChip = !customer && r.sharepoint_invoice_url ? '<span class="ops-chip">SharePoint copy noted</span>' : '';
      const supplierBalance = !customer ? Math.max(0, amountNum(r.amount_payable) - amountNum(r.amount_paid)) : 0;
      const supplierBalanceChip = !customer && supplierBalance > 0 ? '<span class="ops-chip">Balance: ' + esc(money(supplierBalance, r.currency)) + '</span>' : '';
      const supplierDisputeChip = !customer && r.status === "disputed" ? '<span class="ops-chip">Disputed</span>' : '';
      const invoiceActions = !customer
        ? (r.supplier_invoice_path ? '<button class="btn btn-outline js-view-supplier-invoice" data-id="' + esc(r.id) + '" data-path="' + esc(r.supplier_invoice_path) + '" type="button">View invoice</button>' : '')
          + (r.sharepoint_invoice_url ? '<a class="btn btn-outline" target="_blank" rel="noopener" href="' + esc(r.sharepoint_invoice_url) + '">SharePoint</a>' : '')
          + (detail.can_edit_payments ? '<label class="btn btn-outline proof-upload-label">' + (r.supplier_invoice_path ? 'Replace invoice' : 'Upload invoice') + '<input type="file" class="js-supplier-invoice-file" data-id="' + esc(r.id) + '" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" hidden></label>' : '')
        : '';
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(title) + '</b><p>' + esc(label(r.status)) + (r.notes ? ' - ' + esc(r.notes) : '') + '</p><div class="ops-kv">' + ref + proofChip + invoiceChip + sharepointChip + supplierBalanceChip + supplierDisputeChip + (customer && r.status === "proof_received" ? '<span class="ops-chip">Proof only - no receipt yet</span>' : '') + '</div></div><div class="ops-row-actions"><span class="finance-value">' + esc(amount) + '</span>' + receiptBtn + refundBtn + supplierNoteBtn + proofActions + invoiceActions + '</div></div>';
    }).join("") + '</div>';
  }

  async function loadBusinessSettings() {
    const result = await sb.from("business_settings").select("*").eq("id", true).maybeSingle();
    businessSettings = result.data || { legal_name: "KRIDIYA Travel and Tourism FZ-LLC" };
  }

  function fmtDateTime(v) {
    if (!v) return new Date().toLocaleString("en-GB");
    return new Date(v).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  }

  function generatedDocumentShell(title, number, body, footer) {
    const settings = businessSettings || {};
    const legalName = settings.legal_name || "KRIDIYA Travel and Tourism FZ-LLC";
    return "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>" + esc(title) + " " + esc(number || "") + "</title><style>" +
      "@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1a1a1a;margin:0;background:#fff;font-size:13px;line-height:1.45}.head{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #c9601c;padding-bottom:16px;margin-bottom:20px}.brand{display:flex;gap:13px}.brand img{width:54px;height:54px;object-fit:contain}.brand b{color:#a3480f;font-size:17px}.brand p{margin:4px 0 0;color:#555;font-size:11px;line-height:1.45}.meta{text-align:right}.label{font-size:11px;font-weight:800;letter-spacing:.08em;color:#a3480f;text-transform:uppercase}.num{font-size:20px;font-weight:800;margin-top:4px}.box{border:1px solid #eed6bd;background:#fff8f0;border-radius:9px;padding:14px;margin:12px 0;break-inside:avoid}.kv{display:grid;grid-template-columns:150px 1fr;gap:6px 16px}.k{color:#777}.v{font-weight:700}.amount{font-size:25px;color:#a3480f;font-weight:800}.people{margin:5px 0 0;padding-left:20px}.foot{margin-top:22px;border-top:1px solid #eee;padding-top:12px;color:#666;font-size:11px}.internal{color:#8b2f14;font-weight:800}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}" +
      "</style></head><body><div class='head'><div class='brand'><img src='https://kridiyatravel.com/assets/logo.png' alt=''><div><b>" + esc(legalName) + "</b><p>FDRK7105, Compass Building, Al Shohada Road, Al Hamra Industrial Zone-FZ, Ras Al Khaimah, UAE<br>Trade licence: 5033347<br>info@kridiyatravel.com &middot; kridiyatravel.com</p></div></div><div class='meta'><div class='label'>" + esc(title) + "</div><div class='num'>" + esc(number || "") + "</div><p>" + esc(fmtDateTime(new Date().toISOString())) + "</p></div></div>" + body + "<div class='foot'>" + footer + "</div><script>setTimeout(function(){window.print()},300)</script></body></html>";
  }

  function openGeneratedDocument(html, labelText) {
    const win = window.open("", "_blank");
    if (!win) { toast("Please allow pop-ups to print the " + labelText + "."); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
  }

  function bookingConfirmationHTML(doc) {
    const payload = doc.payload || {};
    const b = payload.booking || payload;
    const people = payload.passengers || [];
    const passengerList = people.length ? "<div class='box'><div class='label'>Travellers</div><ul class='people'>" + people.map(function (p) { return "<li>" + esc(p.passenger_name || "Traveller") + " — " + esc(label(p.passenger_type || "passenger")) + "</li>"; }).join("") + "</ul></div>" : "";
    const body = "<div class='box'><div class='kv'><span class='k'>Customer</span><span class='v'>" + esc(doc.customer_name || "Customer") + "</span><span class='k'>Booking reference</span><span class='v'>" + esc(b.booking_reference || "—") + "</span><span class='k'>Service</span><span class='v'>" + esc(label(b.service_type || "travel")) + "</span><span class='k'>Route / destination</span><span class='v'>" + esc(b.route_or_destination || "—") + "</span><span class='k'>Travel dates</span><span class='v'>" + esc(dateText(b.travel_start)) + (b.travel_end ? " to " + esc(dateText(b.travel_end)) : "") + "</span><span class='k'>Status</span><span class='v'>" + esc(label(b.status || "confirmed")) + "</span>" + (b.supplier_reference ? "<span class='k'>Confirmation / PNR</span><span class='v'>" + esc(b.supplier_reference) + "</span>" : "") + "</div></div>" + passengerList + "<div class='box'><div class='label'>Booking value</div><div class='amount'>" + esc(money(doc.amount_total, doc.currency)) + "</div></div>";
    return generatedDocumentShell(b.service_type === "flight" ? "Travel Itinerary" : "Booking Confirmation", doc.document_number, body, "Please verify names and travel details immediately. Supplier, airline, hotel, visa, refund and cancellation rules remain applicable. This document is not a boarding pass or visa approval.");
  }

  async function generateBookingConfirmation() {
    const rpc = detail.booking.service_type === "flight" ? "generate_eticket_document" : "generate_corporate_confirmation_document";
    const result = await sb.rpc(rpc, { p_booking_id: bookingId });
    if (result.error) { toast("Could not generate booking confirmation: " + result.error.message); return; }
    openGeneratedDocument(bookingConfirmationHTML(result.data), "booking confirmation");
  }

  function supplierPaymentNoteHTML(row) {
    const b = detail.booking;
    const balance = Math.max(0, amountNum(row.amount_payable) - amountNum(row.amount_paid));
    const body = "<p class='internal'>INTERNAL SUPPLIER PAYMENT RECORD — NOT FOR CUSTOMERS</p><div class='box'><div class='kv'><span class='k'>Supplier</span><span class='v'>" + esc(row.supplier_name || b.supplier_name || "—") + "</span><span class='k'>Supplier reference</span><span class='v'>" + esc(row.supplier_reference || b.supplier_reference || "—") + "</span><span class='k'>Booking reference</span><span class='v'>" + esc(b.booking_reference || "—") + "</span><span class='k'>Service</span><span class='v'>" + esc(label(b.service_type)) + " / " + esc(b.route_or_destination || "—") + "</span><span class='k'>Status</span><span class='v'>" + esc(label(row.status)) + "</span></div></div><div class='box'><div class='kv'><span class='k'>Payable</span><span class='v'>" + esc(money(row.amount_payable, row.currency)) + "</span><span class='k'>Paid</span><span class='v'>" + esc(money(row.amount_paid, row.currency)) + "</span><span class='k'>Balance</span><span class='v'>" + esc(money(balance, row.currency)) + "</span></div></div>" + (row.notes ? "<div class='box'><div class='label'>Internal notes</div><p>" + esc(row.notes) + "</p></div>" : "");
    return generatedDocumentShell("Supplier Payment Note", b.booking_reference, body, "Internal finance control document. Verify supplier bank details and invoice authenticity through an approved channel before payment.");
  }

  function printSupplierPaymentNote(id) {
    const row = (detail.supplier_payments || []).find(function (item) { return item.id === id; });
    if (!row) { toast("Supplier payment record not found."); return; }
    openGeneratedDocument(supplierPaymentNoteHTML(row), "supplier payment note");
  }

  function refundNoteHTML(doc) {
    const payload = doc.payload || {};
    const p = payload.payment || {};
    const booking = (payload.extras && payload.extras.booking) || {};
    const body = "<div class='box'><div class='kv'><span class='k'>Customer</span><span class='v'>" + esc(doc.customer_name || "Customer") + "</span><span class='k'>Booking reference</span><span class='v'>" + esc(booking.booking_reference || "—") + "</span><span class='k'>Service</span><span class='v'>" + esc(label(booking.service_type || "travel")) + (booking.route_or_destination ? " / " + esc(booking.route_or_destination) : "") + "</span><span class='k'>Original payment reference</span><span class='v'>" + esc(p.payment_reference || "—") + "</span><span class='k'>Refund status</span><span class='v'>" + esc(label(p.status || "refund pending")) + "</span></div></div><div class='box'><div class='label'>Refund amount</div><div class='amount'>" + esc(money(p.refund_amount || doc.amount_total, doc.currency)) + "</div></div>" + (p.refund_reason ? "<div class='box'><div class='label'>Reason</div><p>" + esc(p.refund_reason) + "</p></div>" : "") + "<div class='box'><div class='kv'><span class='k'>Requested</span><span class='v'>" + esc(fmtDateTime(p.refund_requested_at)) + "</span>" + (p.refund_approved_at ? "<span class='k'>Approved</span><span class='v'>" + esc(fmtDateTime(p.refund_approved_at)) + "</span>" : "") + (p.refund_completed_at ? "<span class='k'>Completed</span><span class='v'>" + esc(fmtDateTime(p.refund_completed_at)) + "</span>" : "") + "</div></div>";
    return generatedDocumentShell("Refund / Cancellation Note", doc.document_number, body, "Refund timing depends on the original payment method, bank, card network, airline, hotel, visa authority or supplier. This note records the refund status shown above.");
  }

  async function generateRefundNote(paymentId) {
    const result = await sb.rpc("generate_refund_note_document", { p_payment_id: paymentId });
    if (result.error) { toast("Could not generate refund note: " + result.error.message); return; }
    openGeneratedDocument(refundNoteHTML(result.data), "refund note");
  }

  function paymentRequestHTML(doc) {
    const payload = doc.payload || {};
    const settings = businessSettings || {};
    const legalName = settings.legal_name || "KRIDIYA Travel and Tourism FZ-LLC";
    const bank = settings.bank_iban || settings.bank_name ? "<div class='box'><div class='label'>Bank transfer details</div><div class='kv'>" +
      (settings.bank_account_name ? "<span class='k'>Account name</span><span class='v'>" + esc(settings.bank_account_name) + "</span>" : "") +
      (settings.bank_name ? "<span class='k'>Bank</span><span class='v'>" + esc(settings.bank_name) + "</span>" : "") +
      (settings.bank_iban ? "<span class='k'>IBAN</span><span class='v'>" + esc(settings.bank_iban) + "</span>" : "") +
      (settings.bank_swift ? "<span class='k'>SWIFT/BIC</span><span class='v'>" + esc(settings.bank_swift) + "</span>" : "") +
      "</div></div>" : "";
    return "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Payment Request " + esc(doc.document_number) + "</title><style>" +
      "body{font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:42px;background:#fff}.head{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #c9601c;padding-bottom:18px;margin-bottom:28px}.brand{display:flex;gap:14px}.brand img{width:56px;height:56px;object-fit:contain}.brand b{color:#a3480f;font-size:18px}.brand p{margin:5px 0 0;color:#555;font-size:12px;line-height:1.5}.meta{text-align:right}.label{font-size:12px;font-weight:800;letter-spacing:.08em;color:#a3480f;text-transform:uppercase}.num{font-size:22px;font-weight:800;margin-top:5px}.box{border:1px solid #eed6bd;background:#fff8f0;border-radius:10px;padding:18px;margin:18px 0}.kv{display:grid;grid-template-columns:180px 1fr;gap:8px 18px;font-size:14px}.k{color:#777}.v{font-weight:700}.amount{font-size:30px;color:#a3480f;font-weight:800}.foot{margin-top:36px;border-top:1px solid #eee;padding-top:16px;color:#777;font-size:12px;line-height:1.6}@media print{body{padding:.45in}}" +
      "</style></head><body><div class='head'><div class='brand'><img src='https://kridiyatravel.com/assets/logo.png' alt=''><div><b>" + esc(legalName) + "</b><p>FDRK7105, Compass Building, Al Shohada Road, Al Hamra Industrial Zone-FZ, Ras Al Khaimah, UAE<br>Trade licence: 5033347<br>info@kridiyatravel.com &middot; kridiyatravel.com</p></div></div><div class='meta'><div class='label'>Payment Request</div><div class='num'>" + esc(doc.document_number) + "</div><p>" + esc(fmtDateTime(doc.created_at)) + "</p></div></div>" +
      "<div class='box'><div class='kv'><span class='k'>Customer</span><span class='v'>" + esc(doc.customer_name || payload.customer_name || "Customer") + "</span><span class='k'>Booking reference</span><span class='v'>" + esc(payload.booking_reference || "") + "</span><span class='k'>Booking</span><span class='v'>" + esc(payload.booking_title || "") + "</span><span class='k'>Service</span><span class='v'>" + esc(label(payload.service_type)) + (payload.route_or_destination ? " / " + esc(payload.route_or_destination) : "") + "</span></div></div>" +
      "<div class='box'><div class='label'>Amount due now</div><div class='amount'>" + esc(money(doc.amount_total, doc.currency)) + "</div></div>" +
      "<div class='box'><div class='kv'><span class='k'>Total booking value</span><span class='v'>" + esc(money(payload.total_amount, doc.currency)) + "</span><span class='k'>Received so far</span><span class='v'>" + esc(money(payload.received_amount, doc.currency)) + "</span><span class='k'>Balance due</span><span class='v'>" + esc(money(payload.amount_due, doc.currency)) + "</span></div></div>" +
      bank +
      (payload.notes ? "<div class='box'><div class='label'>Notes</div><p>" + esc(payload.notes) + "</p></div>" : "") +
      "<div class='foot'>Please confirm payment before ticketing/visa processing. Supplier, airline, hotel, visa authority, refund, cancellation, and fare-change rules may apply until payment and booking confirmation are completed.</div></body></html>";
  }

  function openPaymentRequest(doc) {
    const win = window.open("", "_blank");
    if (!win) { toast("Please allow pop-ups to print the payment request."); return; }
    win.document.open();
    win.document.write(paymentRequestHTML(doc));
    win.document.close();
    win.focus();
  }

  async function generatePaymentRequest() {
    const form = document.getElementById("payment-request-form");
    const requested = form && form.amount_requested.value ? Number(form.amount_requested.value) : null;
    const notes = form && form.request_notes.value ? form.request_notes.value : null;
    if (requested != null && requested <= 0) { toast("Request amount must be more than zero."); return; }
    const result = await sb.rpc("generate_booking_payment_request_document", { p_booking_id: bookingId, p_amount_requested: requested, p_notes: notes });
    if (result.error) { toast("Could not generate payment request: " + result.error.message); return; }
    toast("Payment request ready: " + result.data.document_number);
    openPaymentRequest(result.data);
    await loadDetail();
  }
  function receiptHTML(doc) {
    const payload = doc.payload || {};
    const settings = businessSettings || {};
    const legalName = settings.legal_name || "KRIDIYA Travel and Tourism FZ-LLC";
    const contact = "FDRK7105, Compass Building, Al Shohada Road, Al Hamra Industrial Zone-FZ, Ras Al Khaimah, UAE<br>Trade licence: 5033347<br>info@kridiyatravel.com &middot; kridiyatravel.com";
    const trn = settings.vat_registered && settings.trn ? "<br>TRN: " + esc(settings.trn) : "";
    const vatNote = settings.vat_registered ? "" : "<div class='box'><div class='label'>VAT</div><p class='note' style='margin:.4rem 0 0'>VAT is not applied. KRIDIYA Travel and Tourism FZ-LLC is not VAT registered at this time.</p></div>";
    return "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Receipt " + esc(doc.document_number) + "</title><style>" +
      "body{font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:42px;background:#fff}.head{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #c9601c;padding-bottom:18px;margin-bottom:28px}.brand{display:flex;gap:14px}.brand img{width:56px;height:56px;object-fit:contain}.brand b{color:#a3480f;font-size:18px}.brand p{margin:5px 0 0;color:#555;font-size:12px;line-height:1.5}.meta{text-align:right}.label{font-size:12px;font-weight:800;letter-spacing:.08em;color:#a3480f}.num{font-size:22px;font-weight:800;margin-top:5px}.box{border:1px solid #eed6bd;background:#fff8f0;border-radius:10px;padding:18px;margin:18px 0}.kv{display:grid;grid-template-columns:180px 1fr;gap:8px 18px;font-size:14px}.k{color:#777}.v{font-weight:700}.amount{font-size:28px;color:#a3480f;font-weight:800}.foot{margin-top:36px;border-top:1px solid #eee;padding-top:16px;color:#777;font-size:12px;line-height:1.6}@media print{body{padding:.45in}}" +
      "</style></head><body><div class='head'><div class='brand'><img src='https://kridiyatravel.com/assets/logo.png' alt=''><div><b>" + esc(legalName) + "</b><p>" + contact + trn + "</p></div></div><div class='meta'><div class='label'>Payment Receipt</div><div class='num'>" + esc(doc.document_number) + "</div><p>" + esc(fmtDateTime(doc.created_at)) + "</p></div></div>" +
      "<div class='box'><div class='kv'><span class='k'>Received from</span><span class='v'>" + esc(doc.customer_name || payload.customer_name || "Customer") + "</span><span class='k'>Booking reference</span><span class='v'>" + esc(payload.booking_reference || "") + "</span><span class='k'>Service</span><span class='v'>" + esc(label(payload.service_type)) + (payload.route_or_destination ? " / " + esc(payload.route_or_destination) : "") + "</span><span class='k'>Payment reference</span><span class='v'>" + esc(payload.payment_reference || "") + "</span><span class='k'>Payment method</span><span class='v'>" + esc(label(payload.payment_method)) + "</span><span class='k'>Received date</span><span class='v'>" + esc(fmtDateTime(payload.received_at)) + "</span></div></div>" +
      "<div class='box'><div class='label'>Amount received</div><div class='amount'>" + esc(money(doc.amount_total, doc.currency)) + "</div></div>" +
      vatNote +
      (payload.payment_notes ? "<div class='box'><div class='label'>Notes</div><p>" + esc(payload.payment_notes) + "</p></div>" : "") +
      "<div class='foot'>This receipt confirms payment recorded by KRIDIYA Travel and Tourism. It does not replace airline, hotel, visa authority, or supplier terms. Please keep this document for your records.</div></body></html>";
  }

  function openReceipt(doc) {
    const win = window.open("", "_blank");
    if (!win) { toast("Please allow pop-ups to print the receipt."); return; }
    win.document.open();
    win.document.write(receiptHTML(doc));
    win.document.close();
    win.focus();
  }

  async function generateReceipt(paymentId) {
    const result = await sb.rpc("generate_booking_receipt_document", { p_booking_id: bookingId, p_payment_id: paymentId });
    if (result.error) { toast("Could not generate receipt: " + result.error.message); return; }
    toast("Receipt ready: " + result.data.document_number);
    openReceipt(result.data);
    await loadDetail();
  }
  async function recordCustomerPayment() {
    const form = document.getElementById("customer-payment-form");
    const result = await sb.rpc("record_customer_payment", {
      p_booking_id: bookingId,
      p_amount: Number(form.amount.value),
      p_method: form.method.value,
      p_status: form.status.value,
      p_currency: "AED",
      p_payment_link: form.payment_link.value || null,
      p_notes: form.notes.value || null
    });
    if (result.error) { toast("Could not record payment: " + result.error.message); return; }
    toast("Customer payment recorded.");
    form.reset();
    await loadDetail();
  }

  async function recordSupplierPayment() {
    const form = document.getElementById("supplier-payment-form");
    const result = await sb.rpc("record_supplier_payment", {
      p_booking_id: bookingId,
      p_supplier_name: form.supplier_name.value,
      p_amount_payable: Number(form.amount_payable.value),
      p_amount_paid: form.amount_paid.value ? Number(form.amount_paid.value) : 0,
      p_status: form.status.value,
      p_currency: "AED",
      p_supplier_reference: form.supplier_reference.value || null,
      p_notes: form.notes.value || null
    });
    if (result.error) { toast("Could not record supplier payment: " + result.error.message); return; }
    toast("Supplier payment recorded.");
    await loadDetail();
  }

  document.addEventListener("click", function (event) {
    const taskButton = event.target.closest(".js-complete-task");
    const passengerButton = event.target.closest(".js-delete-passenger");
    const documentButton = event.target.closest(".js-delete-document");
    const releaseDocumentButton = event.target.closest(".js-toggle-document-release");
    const receiptButton = event.target.closest(".js-print-receipt");
    const confirmationButton = event.target.closest(".js-print-booking-confirmation");
    const supplierNoteButton = event.target.closest(".js-print-supplier-note");
    const refundNoteButton = event.target.closest(".js-print-refund-note");
    const viewDocumentButton = event.target.closest(".js-view-booking-document");
    const requestButton = event.target.closest(".js-payment-request");
    const viewProofButton = event.target.closest(".js-view-proof");
    const viewSupplierInvoiceButton = event.target.closest(".js-view-supplier-invoice");
    if (taskButton) completeBookingTask(taskButton.dataset.id);
    if (passengerButton) deletePassenger(passengerButton.dataset.id);
    if (documentButton) deleteDocument(documentButton.dataset.id, documentButton.dataset.path);
    if (releaseDocumentButton) toggleDocumentRelease(releaseDocumentButton.dataset.id, releaseDocumentButton.dataset.visible === "true");
    if (receiptButton) generateReceipt(receiptButton.dataset.id);
    if (confirmationButton) generateBookingConfirmation();
    if (supplierNoteButton) printSupplierPaymentNote(supplierNoteButton.dataset.id);
    if (refundNoteButton) generateRefundNote(refundNoteButton.dataset.id);
    if (viewDocumentButton) viewBookingDocument(viewDocumentButton.dataset.id, viewDocumentButton.dataset.path, viewDocumentButton.dataset.name);
    if (requestButton) generatePaymentRequest();
    if (viewProofButton) viewPaymentProof(viewProofButton.dataset.id, viewProofButton.dataset.path);
    if (viewSupplierInvoiceButton) viewSupplierInvoice(viewSupplierInvoiceButton.dataset.id, viewSupplierInvoiceButton.dataset.path);
  });
  document.addEventListener("change", function (event) {
    const proofInput = event.target.closest(".js-proof-file");
    if (proofInput && proofInput.files && proofInput.files.length) {
      uploadPaymentProof(proofInput.dataset.id, proofInput.files[0]);
      proofInput.value = "";
    }
    const supplierInvoiceInput = event.target.closest(".js-supplier-invoice-file");
    if (supplierInvoiceInput && supplierInvoiceInput.files && supplierInvoiceInput.files.length) {
      uploadSupplierInvoice(supplierInvoiceInput.dataset.id, supplierInvoiceInput.files[0]);
      supplierInvoiceInput.value = "";
    }
  });
  document.addEventListener("DOMContentLoaded", boot);
})();
