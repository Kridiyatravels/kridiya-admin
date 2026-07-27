"use strict";
(function () {
  if (location.pathname.indexOf("booking-detail.html") === -1) return;
  let sb = null;
  let bookingId = null;
  let detail = null;
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
  function amountNum(v) { return Number(v || 0); }
  function paymentReceivedTotal() { return (detail.payments || []).filter(function (p) { return p.status === "received"; }).reduce(function (sum, p) { return sum + amountNum(p.amount); }, 0); }
  function bookingBalance() { return Math.max(0, amountNum(detail.booking.selling_price) - paymentReceivedTotal()); }
  function paymentIsCleared(status) { return ["paid", "received", "payment_received", "completed"].indexOf(String(status || "").toLowerCase()) !== -1; }
  function bookingIsConfirmed(status) { return ["confirmed", "paid", "ticketed", "completed"].indexOf(String(status || "").toLowerCase()) !== -1; }
  function paymentControlNote() {
    const b = detail.booking;
    if (paymentIsCleared(b.payment_status)) return { text: "Payment control OK. Money is marked as received/paid.", tone: "ok" };
    if (b.booking_kind === "corporate" || detail.corporate) return { text: "Corporate control: collect payment approval/LPO before supplier confirmation.", tone: "warn" };
    if (bookingIsConfirmed(b.status)) return { text: "Risk: booking is confirmed before payment is fully received.", tone: "risk" };
    return { text: "Rule: collect payment before booking/supplier confirmation.", tone: "warn" };
  }
  function taskOpen(t) { return t.status !== "completed"; }
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
    if (!b.supplier_reference) return { title: "Add supplier reference", href: "#booking-status-form", text: "Connect the booking to supplier confirmation." };
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
    if (!businessSettings) await loadBusinessSettings();
    renderAll();
  }

  function renderAll() {
    const b = detail.booking;
    document.getElementById("booking-title").textContent = b.booking_reference + " - " + b.title;
    document.getElementById("booking-subtitle").textContent = label(b.service_type) + " / " + label(b.booking_kind) + (b.route_or_destination ? " / " + b.route_or_destination : "");
    document.getElementById("booking-detail-stats").innerHTML = [
      ["Selling price", moneyTile(b.selling_price, b.currency, detail.can_view_payments || detail.can_view_profit), "var(--status-quoted)"],
      ["Supplier cost", moneyTile(b.supplier_cost, b.currency, detail.can_view_profit || detail.can_view_payments), "var(--status-payment)"],
      ["Gross profit", moneyTile(b.gross_profit, b.currency, detail.can_view_profit), "var(--status-confirmed)"],
      ["Payment", label(b.payment_status), "var(--status-docs)"]
    ].map(function (s) { return '<div class="stat-tile" style="--tile-accent:' + s[2] + '"><div class="num stat-text">' + esc(s[1]) + '</div><div class="label">' + esc(s[0]) + '</div></div>'; }).join("");
    renderBookingCommand();
    renderStatusForm();
    renderCustomer();
    renderCorporateControls();
    renderWorkflow();
    renderPassengers();
    renderDocuments();
    renderCustomerPayments();
    renderSupplierPayments();
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
    document.getElementById("booking-customer-box").innerHTML = c ? '<div class="ops-list"><div class="ops-row"><div class="ops-row-main"><b>' + esc(c.full_name) + '</b><p>' + esc(c.email || "No email") + ' / ' + esc(c.phone || c.whatsapp || "No phone") + '</p><div class="ops-kv"><span class="ops-chip">Source: ' + esc(label(c.source)) + '</span>' + (corp ? '<span class="ops-chip">Corporate: ' + esc(corp.company_name) + '</span>' : '') + '</div></div></div></div>' : '<p class="form-note">No customer profile linked yet.</p>';
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
    const openTasks = rows.filter(function (t) { return t.status !== "completed"; });
    const doneTasks = rows.filter(function (t) { return t.status === "completed"; });
    const form = canEdit ? '<form id="booking-task-form" class="form-grid payment-mini-form" onsubmit="return false"><div class="field-row"><div class="field col-6"><label>TASK</label><input name="title" required placeholder="Call customer, check supplier, collect LPO"></div><div class="field col-3"><label>TYPE</label><select name="task_type">' + optionList(TASK_TYPES, "follow_up") + '</select></div><div class="field col-3"><label>PRIORITY</label><select name="priority">' + optionList(TASK_PRIORITIES, "normal") + '</select></div><div class="field col-6"><label>DUE DATE / TIME</label><input name="due_at" type="datetime-local"></div><div class="field col-6"><label>NOTES</label><input name="notes" placeholder="Short internal instruction"></div></div><button class="btn btn-primary" type="submit">Add task</button></form>' : '<p class="form-note">Booking permission required to add tasks.</p>';
    panel.innerHTML = form + '<div class="ops-kv"><span class="ops-chip">Open: ' + esc(openTasks.length) + '</span><span class="ops-chip">Done: ' + esc(doneTasks.length) + '</span></div>' + renderTaskRows(rows, canEdit);
    const f = document.getElementById("booking-task-form");
    if (f) f.addEventListener("submit", createBookingTask);
  }

  function renderTaskRows(rows, canEdit) {
    if (!rows.length) return '<p class="form-note">No tasks yet.</p>';
    return '<div class="ops-list payment-history">' + rows.map(function (t) {
      const done = t.status === "completed";
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
    const form = canEdit ? '<form id="booking-document-form" class="form-grid payment-mini-form" onsubmit="return false"><div class="field-row"><div class="field col-6"><label>DOCUMENT TYPE</label><select name="document_type">' + optionList(DOCUMENT_TYPES, required[0]) + '</select></div><div class="field col-6"><label>DOCUMENT NAME</label><input name="file_name" placeholder="Passport copy received"></div><div class="field col-8"><label>REFERENCE / NOTE</label><input name="external_reference" placeholder="WhatsApp, email, portal ref, file location"></div><div class="field col-4"><label>UPLOAD FILE</label><input name="document_file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"></div></div><button class="btn btn-primary" type="submit">Save document record</button></form>' : '<p class="form-note">Document permission required to record documents.</p>';
    document.getElementById("booking-document-panel").innerHTML = checklist + form + renderDocumentRows(rows, canEdit);
    const f = document.getElementById("booking-document-form");
    if (f) f.addEventListener("submit", recordDocument);
  }

  function renderDocumentRows(rows, canEdit) {
    if (!rows.length) return '<p class="form-note">No document records yet.</p>';
    return '<div class="ops-list payment-history">' + rows.map(function (r) {
      const releaseButton = canEdit && r.storage_path
        ? '<button class="btn btn-outline js-toggle-document-release" data-id="' + esc(r.id) + '" data-visible="' + esc(r.visible_to_customer ? "false" : "true") + '" type="button">' + esc(r.visible_to_customer ? "Hide from customer" : "Release to customer") + '</button>'
        : '';
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(label(r.document_type)) + '</b><p>' + esc(r.file_name) + (r.external_reference ? ' - ' + esc(r.external_reference) : '') + '</p><div class="ops-kv"><span class="ops-chip">' + (r.visible_to_customer ? 'Customer visible' : 'Internal only') + '</span>' + (r.storage_path ? '<span class="ops-chip">File saved</span>' : '<span class="ops-chip">No file attached</span>') + '</div></div><div class="ops-row-actions">' + (r.storage_path ? '<button class="btn btn-outline js-view-booking-document" data-path="' + esc(r.storage_path) + '" type="button">View</button>' : '') + releaseButton + (canEdit ? '<button class="btn btn-outline js-delete-document" data-id="' + esc(r.id) + '" data-path="' + esc(r.storage_path || "") + '" type="button">Remove</button>' : '') + '</div></div>';
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
    let storagePath = null;
    button.disabled = true;
    button.textContent = file ? "Uploading..." : "Saving...";
    if (file) {
      const path = bookingId + "/" + Date.now() + "-" + safeFileName(file.name);
      const upload = await sb.storage.from("booking-documents").upload(path, file, { upsert: false });
      if (upload.error) {
        button.disabled = false;
        button.textContent = "Save document record";
        toast("Could not upload file: " + upload.error.message);
        return;
      }
      storagePath = upload.data.path;
    }
    const result = await sb.rpc("record_booking_document", {
      p_booking_id: bookingId,
      p_document_type: form.document_type.value,
      p_file_name: form.file_name.value || (file ? file.name : "Document received"),
      p_external_reference: form.external_reference.value || null,
      p_storage_path: storagePath,
      p_visible_to_customer: false
    });
    button.disabled = false;
    button.textContent = "Save document record";
    if (result.error) {
      if (storagePath) await sb.storage.from("booking-documents").remove([storagePath]);
      toast("Could not record document: " + result.error.message);
      return;
    }
    toast(file ? "Document uploaded and recorded." : "Document recorded.");
    form.reset();
    await loadDetail();
  }

  async function deletePassenger(id) {
    const result = await sb.rpc("delete_booking_passenger", { p_passenger_id: id });
    if (result.error) { toast("Could not remove passenger: " + result.error.message); return; }
    toast("Passenger removed.");
    await loadDetail();
  }

  async function viewBookingDocument(path) {
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
    const path = bookingId + "/" + paymentId + "-" + Date.now() + "-" + safeFileName(file.name);
    const upload = await sb.storage.from("booking-payment-proofs").upload(path, file, { upsert: false });
    if (upload.error) { toast("Could not upload proof: " + upload.error.message); return; }
    const result = await sb.rpc("attach_payment_proof", { p_payment_id: paymentId, p_storage_path: upload.data.path });
    if (result.error) {
      await sb.storage.from("booking-payment-proofs").remove([upload.data.path]);
      toast("Could not attach proof: " + result.error.message);
      return;
    }
    toast("Payment proof uploaded.");
    await loadDetail();
  }

  async function viewPaymentProof(path) {
    const result = await sb.storage.from("booking-payment-proofs").createSignedUrl(path, 180);
    if (result.error || !result.data) {
      toast("Could not open proof: " + (result.error ? result.error.message : "unknown error"));
      return;
    }
    window.open(result.data.signedUrl, "_blank", "noopener");
  }

  async function uploadSupplierInvoice(supplierPaymentId, file) {
    if (!file) return;
    const sharepointUrl = window.prompt("Optional: paste the SharePoint invoice link if this file is already backed up there.", "") || "";
    const path = bookingId + "/" + supplierPaymentId + "-" + Date.now() + "-" + safeFileName(file.name);
    const upload = await sb.storage.from("supplier-invoices").upload(path, file, { upsert: false });
    if (upload.error) { toast("Could not upload supplier invoice: " + upload.error.message); return; }
    const result = await sb.rpc("attach_supplier_invoice", {
      p_supplier_payment_id: supplierPaymentId,
      p_storage_path: upload.data.path,
      p_sharepoint_invoice_url: sharepointUrl.trim() || null
    });
    if (result.error) {
      await sb.storage.from("supplier-invoices").remove([upload.data.path]);
      toast("Could not attach supplier invoice: " + result.error.message);
      return;
    }
    toast("Supplier invoice uploaded.");
    await loadDetail();
  }

  async function viewSupplierInvoice(path) {
    const result = await sb.storage.from("supplier-invoices").createSignedUrl(path, 180);
    if (result.error || !result.data) {
      toast("Could not open supplier invoice: " + (result.error ? result.error.message : "unknown error"));
      return;
    }
    window.open(result.data.signedUrl, "_blank", "noopener");
  }

  async function deleteDocument(id, path) {
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
    const request = detail.can_edit_payments ? '<form id="payment-request-form" class="form-grid payment-mini-form payment-request-form" onsubmit="return false"><div class="field-row"><div class="field col-4"><label>REQUEST AMOUNT</label><input name="amount_requested" type="number" min="0" step="0.01" value="' + esc(balance || b.selling_price || "") + '"></div><div class="field col-8"><label>PAYMENT REQUEST NOTE</label><input name="request_notes" placeholder="Bank transfer, payment link, due date, approval note"></div></div><button class="btn btn-outline" type="submit">Generate payment request</button></form>' : '';
    const form = detail.can_edit_payments ? '<form id="customer-payment-form" class="form-grid payment-mini-form" onsubmit="return false"><div class="field-row"><div class="field col-4"><label>AMOUNT</label><input name="amount" type="number" min="0" step="0.01" required></div><div class="field col-4"><label>METHOD</label><select name="method"><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="payment_link">Payment link</option><option value="stripe">Stripe</option><option value="tabby">Tabby</option><option value="tamara">Tamara</option><option value="paypal">PayPal</option><option value="other">Other</option></select></div><div class="field col-4"><label>STATUS</label><select name="status"><option value="received">Received</option><option value="proof_received">Proof received</option><option value="pending">Pending</option></select></div><div class="field col-6"><label>PAYMENT LINK / REF</label><input name="payment_link" placeholder="Stripe link, bank ref, receipt ref"></div><div class="field col-6"><label>NOTES</label><input name="notes" placeholder="Receipt note, transfer note, approval note"></div></div><button class="btn btn-primary" type="submit">Record customer payment</button></form>' : '<p class="form-note">Finance permission required to record payments.</p>';
    document.getElementById("customer-payment-panel").innerHTML = controlHtml + request + form + renderPaymentRows(rows, true);
    const f = document.getElementById("customer-payment-form");
    if (f) f.addEventListener("submit", recordCustomerPayment);
    const requestForm = document.getElementById("payment-request-form");
    if (requestForm) requestForm.addEventListener("submit", generatePaymentRequest);
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
      const ref = customer && r.payment_link ? '<span class="ops-chip">Ref/link saved</span>' : '';
      const proofChip = customer && r.proof_storage_path ? '<span class="ops-chip">Proof attached</span>' : '';
      const proofActions = customer
        ? (r.proof_storage_path ? '<button class="btn btn-outline js-view-proof" data-path="' + esc(r.proof_storage_path) + '" type="button">View proof</button>' : '')
          + (detail.can_edit_payments ? '<label class="btn btn-outline proof-upload-label">' + (r.proof_storage_path ? 'Replace proof' : 'Upload proof') + '<input type="file" class="js-proof-file" data-id="' + esc(r.id) + '" accept="image/*,application/pdf" hidden></label>' : '')
        : '';
      const invoiceChip = !customer && r.supplier_invoice_path ? '<span class="ops-chip">Invoice attached</span>' : '';
      const sharepointChip = !customer && r.sharepoint_invoice_url ? '<span class="ops-chip">SharePoint copy noted</span>' : '';
      const supplierBalance = !customer ? Math.max(0, amountNum(r.amount_payable) - amountNum(r.amount_paid)) : 0;
      const supplierBalanceChip = !customer && supplierBalance > 0 ? '<span class="ops-chip">Balance: ' + esc(money(supplierBalance, r.currency)) + '</span>' : '';
      const supplierDisputeChip = !customer && r.status === "disputed" ? '<span class="ops-chip">Disputed</span>' : '';
      const invoiceActions = !customer
        ? (r.supplier_invoice_path ? '<button class="btn btn-outline js-view-supplier-invoice" data-path="' + esc(r.supplier_invoice_path) + '" type="button">View invoice</button>' : '')
          + (r.sharepoint_invoice_url ? '<a class="btn btn-outline" target="_blank" rel="noopener" href="' + esc(r.sharepoint_invoice_url) + '">SharePoint</a>' : '')
          + (detail.can_edit_payments ? '<label class="btn btn-outline proof-upload-label">' + (r.supplier_invoice_path ? 'Replace invoice' : 'Upload invoice') + '<input type="file" class="js-supplier-invoice-file" data-id="' + esc(r.id) + '" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" hidden></label>' : '')
        : '';
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(title) + '</b><p>' + esc(label(r.status)) + (r.notes ? ' - ' + esc(r.notes) : '') + '</p><div class="ops-kv">' + ref + proofChip + invoiceChip + sharepointChip + supplierBalanceChip + supplierDisputeChip + (customer && r.status === "proof_received" ? '<span class="ops-chip">Proof only - no receipt yet</span>' : '') + '</div></div><div class="ops-row-actions"><span class="finance-value">' + esc(amount) + '</span>' + receiptBtn + proofActions + invoiceActions + '</div></div>';
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
    const viewDocumentButton = event.target.closest(".js-view-booking-document");
    const requestButton = event.target.closest(".js-payment-request");
    const viewProofButton = event.target.closest(".js-view-proof");
    const viewSupplierInvoiceButton = event.target.closest(".js-view-supplier-invoice");
    if (taskButton) completeBookingTask(taskButton.dataset.id);
    if (passengerButton) deletePassenger(passengerButton.dataset.id);
    if (documentButton) deleteDocument(documentButton.dataset.id, documentButton.dataset.path);
    if (releaseDocumentButton) toggleDocumentRelease(releaseDocumentButton.dataset.id, releaseDocumentButton.dataset.visible === "true");
    if (receiptButton) generateReceipt(receiptButton.dataset.id);
    if (viewDocumentButton) viewBookingDocument(viewDocumentButton.dataset.path);
    if (requestButton) generatePaymentRequest();
    if (viewProofButton) viewPaymentProof(viewProofButton.dataset.path);
    if (viewSupplierInvoiceButton) viewSupplierInvoice(viewSupplierInvoiceButton.dataset.path);
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
