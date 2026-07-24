"use strict";
(function () {
  if (document.body.dataset.page !== "corporate") return;
  let sb = null;
  let rows = [];
  let canEdit = false;

  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }
  function label(v) { return String(v || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function money(v, c) { return (c || "AED") + " " + Number(v || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function bool(v) { return v ? "Yes" : "No"; }

  async function boot() {
    const gate = document.getElementById("corporate-gate");
    const app = document.getElementById("corporate-app");
    const user = await KridiyaAuth.currentUser();
    if (!user) { renderLoginForm(gate, boot); return; }
    sb = await KridiyaAuth.client();
    const staffCheck = await sb.rpc("is_staff");
    if (staffCheck.error || staffCheck.data !== true) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>You do not have access.</b><br>Corporate accounts are for staff only.</p></div>';
      return;
    }
    const view = await sb.rpc("has_staff_permission", { permission_name: "view_corporates" });
    const edit = await sb.rpc("has_staff_permission", { permission_name: "edit_corporates" });
    canEdit = !edit.error && edit.data === true;
    if ((view.error || view.data !== true) && !canEdit) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>No corporate permission.</b><br>Ask admin to enable corporate access for this staff account.</p></div>';
      return;
    }
    document.getElementById("corporate-new-toggle").hidden = !canEdit;
    document.getElementById("corporate-new-toggle").addEventListener("click", function () {
      const card = document.getElementById("corporate-form-card");
      card.hidden = !card.hidden;
    });
    document.getElementById("corporate-form").addEventListener("submit", saveCompany);
    document.getElementById("corporate-list").addEventListener("submit", saveContact);
    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    await loadCompanies();
  }

  async function saveCompany() {
    const form = document.getElementById("corporate-form");
    const result = await sb.rpc("create_corporate_account", {
      p_company_name: form.company_name.value,
      p_billing_email: form.billing_email.value || null,
      p_accounts_email: form.accounts_email.value || null,
      p_phone: form.phone.value || null,
      p_address: form.address.value || null,
      p_trade_license_no: form.trade_license_no.value || null,
      p_trn: form.trn.value || null,
      p_payment_terms: form.payment_terms.value,
      p_credit_allowed: form.credit_allowed.value === "true",
      p_monthly_billing: form.monthly_billing.value === "true",
      p_lpo_required: form.lpo_required.value === "true",
      p_status: form.status.value,
      p_notes: form.notes.value || null
    });
    if (result.error) { toast("Could not save company: " + result.error.message); return; }
    toast("Company saved.");
    form.reset();
    document.getElementById("corporate-form-card").hidden = true;
    await loadCompanies();
  }

  async function saveContact(event) {
    const form = event.target.closest(".corporate-contact-form");
    if (!form) return;
    event.preventDefault();
    const result = await sb.rpc("create_corporate_contact", {
      p_corporate_account_id: form.dataset.accountId,
      p_full_name: form.full_name.value,
      p_job_title: form.job_title.value || null,
      p_email: form.email.value || null,
      p_phone: form.phone.value || null,
      p_whatsapp: form.whatsapp.value || null,
      p_is_authorized_contact: form.is_authorized_contact.value === "true",
      p_is_accounts_contact: form.is_accounts_contact.value === "true",
      p_notes: form.notes.value || null
    });
    if (result.error) { toast("Could not save contact: " + result.error.message); return; }
    toast("Contact saved.");
    form.reset();
    await loadCompanies();
  }

  async function loadCompanies() {
    const result = await sb.rpc("list_corporate_accounts");
    if (result.error) { toast("Could not load companies: " + result.error.message); return; }
    rows = result.data || [];
    renderStats();
    renderRows();
  }

  function renderStats() {
    const total = rows.length;
    const active = rows.filter(function (r) { return r.status === "active"; }).length;
    const lpo = rows.filter(function (r) { return r.lpo_required; }).length;
    const value = rows.reduce(function (sum, r) { return sum + Number(r.booking_value || 0); }, 0);
    document.getElementById("corporate-stats").innerHTML = [
      ["Companies", total, "var(--status-quoted)"],
      ["Active", active, "var(--status-confirmed)"],
      ["LPO Required", lpo, "var(--status-payment)"],
      ["Booking Value", money(value, "AED"), "var(--status-docs)"]
    ].map(function (s) { return '<div class="stat-tile" style="--tile-accent:' + s[2] + '"><div class="num stat-text">' + esc(s[1]) + '</div><div class="label">' + esc(s[0]) + '</div></div>'; }).join("");
  }

  function renderRows() {
    document.getElementById("corporate-count").textContent = rows.length + " compan" + (rows.length === 1 ? "y" : "ies");
    document.getElementById("corporate-list").innerHTML = rows.length ? '<div class="ops-list">' + rows.map(renderCompany).join("") + '</div>' : '<p class="form-note">No corporate accounts yet.</p>';
  }

  function renderCompany(c) {
    const contacts = c.contacts || [];
    const contactRows = contacts.length ? contacts.map(function (x) {
      return '<div class="ops-row compact-row"><div class="ops-row-main"><b>' + esc(x.full_name) + '</b><p>' + esc(x.job_title || "Contact") + ' / ' + esc(x.email || "No email") + ' / ' + esc(x.phone || x.whatsapp || "No phone") + '</p><div class="ops-kv">' + (x.is_authorized_contact ? '<span class="ops-chip">Authorized</span>' : '') + (x.is_accounts_contact ? '<span class="ops-chip">Accounts</span>' : '') + '</div></div></div>';
    }).join("") : '<p class="form-note">No contacts saved yet.</p>';
    const form = canEdit ? '<form class="form-grid payment-mini-form corporate-contact-form" data-account-id="' + esc(c.id) + '" onsubmit="return false"><div class="field-row"><div class="field col-4"><label>CONTACT NAME</label><input name="full_name" required></div><div class="field col-4"><label>JOB TITLE</label><input name="job_title"></div><div class="field col-4"><label>EMAIL</label><input name="email" type="email"></div><div class="field col-4"><label>PHONE</label><input name="phone"></div><div class="field col-4"><label>WHATSAPP</label><input name="whatsapp"></div><div class="field col-2"><label>AUTHORIZED?</label><select name="is_authorized_contact"><option value="false">No</option><option value="true">Yes</option></select></div><div class="field col-2"><label>ACCOUNTS?</label><select name="is_accounts_contact"><option value="false">No</option><option value="true">Yes</option></select></div><div class="field col-12"><label>NOTES</label><input name="notes"></div></div><button class="btn btn-primary" type="submit">Add contact</button></form>' : '';
    return '<details class="corporate-card"><summary><div class="ops-row-main"><b>' + esc(c.company_name) + '</b><p>' + esc(c.billing_email || c.accounts_email || "No billing email") + ' / ' + esc(c.phone || "No phone") + '</p><div class="ops-kv"><span class="ops-chip">' + esc(label(c.status)) + '</span><span class="ops-chip">Terms: ' + esc(label(c.payment_terms)) + '</span><span class="ops-chip">LPO: ' + esc(bool(c.lpo_required)) + '</span><span class="ops-chip">Bookings: ' + esc(c.booking_count || 0) + '</span></div></div><span class="finance-value">' + esc(money(c.booking_value, "AED")) + '</span></summary><div class="corporate-card-body"><div class="ops-grid ops-grid-2"><div><h3>Account controls</h3><div class="ops-kv"><span class="ops-chip">Credit: ' + esc(bool(c.credit_allowed)) + '</span><span class="ops-chip">Monthly billing: ' + esc(bool(c.monthly_billing)) + '</span>' + (c.trade_license_no ? '<span class="ops-chip">TL: ' + esc(c.trade_license_no) + '</span>' : '') + (c.trn ? '<span class="ops-chip">TRN: ' + esc(c.trn) + '</span>' : '') + '</div><p class="form-note">' + esc(c.notes || "No account notes.") + '</p></div><div><h3>Contacts</h3>' + contactRows + '</div></div>' + form + '</div></details>';
  }

  document.addEventListener("DOMContentLoaded", boot);
})();