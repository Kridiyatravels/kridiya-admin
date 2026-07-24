"use strict";
(function () {
  if (location.pathname.indexOf("booking-detail.html") === -1) return;
  let sb = null;
  let bookingId = null;
  let detail = null;

  const BOOKING_STATUS = ["enquiry", "quote_sent", "payment_pending", "confirmed", "paid", "ticketed", "completed", "cancelled", "refunded"];
  const PAYMENT_STATUS = ["not_requested", "request_sent", "proof_received", "partially_paid", "paid", "supplier_payment_pending", "supplier_paid", "refund_pending", "refunded", "failed", "cancelled"];
  const DOC_STATUS = ["not_started", "draft", "generated", "sent", "archived"];
  const PASSENGER_TYPES = ["adult", "child", "infant"];
  const DOCUMENT_TYPES = ["passport_copy", "photo", "visa_form", "ticket_or_pnr", "emirates_id", "trade_license", "lpo", "insurance_policy", "voucher", "other"];
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
  function optionList(values, current) { return values.map(function (v) { return '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(label(v)) + '</option>'; }).join(""); }
  function dateText(v) { return v ? new Date(v + "T00:00:00").toLocaleDateString("en-GB") : "Not set"; }

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
    renderAll();
  }

  function renderAll() {
    const b = detail.booking;
    document.getElementById("booking-title").textContent = b.booking_reference + " - " + b.title;
    document.getElementById("booking-subtitle").textContent = label(b.service_type) + " / " + label(b.booking_kind) + (b.route_or_destination ? " / " + b.route_or_destination : "");
    document.getElementById("booking-detail-stats").innerHTML = [
      ["Selling price", money(b.selling_price, b.currency), "var(--status-quoted)"],
      ["Supplier cost", money(b.supplier_cost, b.currency), "var(--status-payment)"],
      ["Gross profit", money(b.gross_profit, b.currency), "var(--status-confirmed)"],
      ["Payment", label(b.payment_status), "var(--status-docs)"]
    ].map(function (s) { return '<div class="stat-tile" style="--tile-accent:' + s[2] + '"><div class="num stat-text">' + esc(s[1]) + '</div><div class="label">' + esc(s[0]) + '</div></div>'; }).join("");
    renderStatusForm();
    renderCustomer();
    renderPassengers();
    renderDocuments();
    renderCustomerPayments();
    renderSupplierPayments();
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

  function renderPassengers() {
    const rows = detail.passengers || [];
    const canEdit = detail.can_edit_bookings;
    const form = canEdit ? '<form id="booking-passenger-form" class="form-grid payment-mini-form" onsubmit="return false"><div class="field-row"><div class="field col-6"><label>PASSENGER NAME</label><input name="passenger_name" required placeholder="As per passport"></div><div class="field col-6"><label>TYPE</label><select name="passenger_type">' + optionList(PASSENGER_TYPES, "adult") + '</select></div><div class="field col-4"><label>NATIONALITY</label><input name="nationality" placeholder="Indian, UAE, etc."></div><div class="field col-4"><label>DATE OF BIRTH</label><input name="date_of_birth" type="date"></div><div class="field col-4"><label>PASSPORT EXPIRY</label><input name="passport_expiry" type="date"></div><div class="field col-6"><label>PASSPORT NUMBER</label><input name="passport_number"></div><div class="field col-6"><label>NOTES</label><input name="notes" placeholder="Seat, meal, visa note"></div></div><button class="btn btn-primary" type="submit">Add passenger</button></form>' : '<p class="form-note">Booking edit permission required to add passengers.</p>';
    document.getElementById("booking-passenger-panel").innerHTML = form + renderPassengerRows(rows, canEdit);
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
    const required = REQUIRED_DOCUMENTS[detail.booking.service_type] || REQUIRED_DOCUMENTS.other;
    const receivedTypes = rows.reduce(function (set, row) { set[row.document_type] = true; return set; }, {});
    const checklist = '<div class="doc-checklist">' + required.map(function (type) {
      return '<span class="doc-check ' + (receivedTypes[type] ? 'is-done' : '') + '">' + esc(receivedTypes[type] ? "Received: " : "Pending: ") + esc(label(type)) + '</span>';
    }).join("") + '</div>';
    const form = canEdit ? '<form id="booking-document-form" class="form-grid payment-mini-form" onsubmit="return false"><div class="field-row"><div class="field col-6"><label>DOCUMENT TYPE</label><select name="document_type">' + optionList(DOCUMENT_TYPES, required[0]) + '</select></div><div class="field col-6"><label>DOCUMENT NAME</label><input name="file_name" required placeholder="Passport copy received"></div><div class="field col-12"><label>REFERENCE / NOTE</label><input name="external_reference" placeholder="WhatsApp, email, portal ref, file location"></div></div><button class="btn btn-primary" type="submit">Mark document received</button></form>' : '<p class="form-note">Document permission required to record documents.</p>';
    document.getElementById("booking-document-panel").innerHTML = checklist + form + renderDocumentRows(rows, canEdit);
    const f = document.getElementById("booking-document-form");
    if (f) f.addEventListener("submit", recordDocument);
  }

  function renderDocumentRows(rows, canEdit) {
    if (!rows.length) return '<p class="form-note">No document records yet.</p>';
    return '<div class="ops-list payment-history">' + rows.map(function (r) {
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(label(r.document_type)) + '</b><p>' + esc(r.file_name) + (r.external_reference ? ' - ' + esc(r.external_reference) : '') + '</p><div class="ops-kv"><span class="ops-chip">' + (r.visible_to_customer ? 'Customer visible' : 'Internal only') + '</span></div></div>' + (canEdit ? '<div class="ops-row-actions"><button class="btn btn-outline js-delete-document" data-id="' + esc(r.id) + '" type="button">Remove</button></div>' : '') + '</div>';
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
    const result = await sb.rpc("record_booking_document", {
      p_booking_id: bookingId,
      p_document_type: form.document_type.value,
      p_file_name: form.file_name.value,
      p_external_reference: form.external_reference.value || null,
      p_storage_path: null,
      p_visible_to_customer: false
    });
    if (result.error) { toast("Could not record document: " + result.error.message); return; }
    toast("Document recorded.");
    form.reset();
    await loadDetail();
  }

  async function deletePassenger(id) {
    const result = await sb.rpc("delete_booking_passenger", { p_passenger_id: id });
    if (result.error) { toast("Could not remove passenger: " + result.error.message); return; }
    toast("Passenger removed.");
    await loadDetail();
  }

  async function deleteDocument(id) {
    const result = await sb.rpc("delete_booking_document", { p_document_id: id });
    if (result.error) { toast("Could not remove document: " + result.error.message); return; }
    toast("Document removed.");
    await loadDetail();
  }

  function renderCustomerPayments() {
    const rows = detail.payments || [];
    const form = detail.can_edit_payments ? '<form id="customer-payment-form" class="form-grid payment-mini-form" onsubmit="return false"><div class="field-row"><div class="field col-4"><label>AMOUNT</label><input name="amount" type="number" min="0" step="0.01" required></div><div class="field col-4"><label>METHOD</label><select name="method"><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="stripe">Stripe</option><option value="tabby">Tabby</option><option value="tamara">Tamara</option><option value="paypal">PayPal</option><option value="other">Other</option></select></div><div class="field col-4"><label>STATUS</label><select name="status"><option value="received">Received</option><option value="proof_received">Proof received</option><option value="pending">Pending</option></select></div><div class="field col-12"><label>NOTES</label><input name="notes" placeholder="Bank ref, payment link, receipt note"></div></div><button class="btn btn-primary" type="submit">Record customer payment</button></form>' : '<p class="form-note">Finance permission required to record payments.</p>';
    document.getElementById("customer-payment-panel").innerHTML = form + renderPaymentRows(rows, true);
    const f = document.getElementById("customer-payment-form");
    if (f) f.addEventListener("submit", recordCustomerPayment);
  }

  function renderSupplierPayments() {
    const rows = detail.supplier_payments || [];
    const b = detail.booking;
    const form = detail.can_edit_payments ? '<form id="supplier-payment-form" class="form-grid payment-mini-form" onsubmit="return false"><div class="field-row"><div class="field col-6"><label>SUPPLIER</label><input name="supplier_name" required value="' + esc(b.supplier_name || "") + '"></div><div class="field col-6"><label>SUPPLIER REF</label><input name="supplier_reference" value="' + esc(b.supplier_reference || "") + '"></div><div class="field col-4"><label>PAYABLE</label><input name="amount_payable" type="number" min="0" step="0.01" required value="' + esc(b.supplier_cost || "") + '"></div><div class="field col-4"><label>PAID</label><input name="amount_paid" type="number" min="0" step="0.01" value="0"></div><div class="field col-4"><label>STATUS</label><select name="status"><option value="pending">Pending</option><option value="partial">Partial</option><option value="paid">Paid</option><option value="disputed">Disputed</option></select></div><div class="field col-12"><label>NOTES</label><input name="notes" placeholder="Supplier invoice or portal note"></div></div><button class="btn btn-primary" type="submit">Record supplier payment</button></form>' : '<p class="form-note">Finance permission required to record supplier payments.</p>';
    document.getElementById("supplier-payment-panel").innerHTML = form + renderPaymentRows(rows, false);
    const f = document.getElementById("supplier-payment-form");
    if (f) f.addEventListener("submit", recordSupplierPayment);
  }

  function renderPaymentRows(rows, customer) {
    if (!rows.length) return '<p class="form-note">No records yet.</p>';
    return '<div class="ops-list payment-history">' + rows.map(function (r) {
      const title = customer ? (r.payment_reference || "Payment") : r.supplier_name;
      const amount = customer ? money(r.amount, r.currency) : money(r.amount_paid, r.currency) + ' / ' + money(r.amount_payable, r.currency);
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(title) + '</b><p>' + esc(label(r.status)) + (r.notes ? ' - ' + esc(r.notes) : '') + '</p></div><div class="ops-row-actions"><span class="finance-value">' + esc(amount) + '</span></div></div>';
    }).join("") + '</div>';
  }

  async function recordCustomerPayment() {
    const form = document.getElementById("customer-payment-form");
    const result = await sb.rpc("record_customer_payment", {
      p_booking_id: bookingId,
      p_amount: Number(form.amount.value),
      p_method: form.method.value,
      p_status: form.status.value,
      p_currency: "AED",
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
    const passengerButton = event.target.closest(".js-delete-passenger");
    const documentButton = event.target.closest(".js-delete-document");
    if (passengerButton) deletePassenger(passengerButton.dataset.id);
    if (documentButton) deleteDocument(documentButton.dataset.id);
  });
  document.addEventListener("DOMContentLoaded", boot);
})();