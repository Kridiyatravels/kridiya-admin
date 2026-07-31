"use strict";
(function () {
  if (document.body.dataset.page !== "corporate") return;
  let sb = null;
  let rows = [];
  let canEdit = false;
  let activeSearch = "";
  let activeStatus = "";
  let activeHealth = "";

  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }
  function label(v) { return String(v || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function money(v, c) { return (c || "AED") + " " + Number(v || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function bool(v) { return v ? "Yes" : "No"; }
  function num(v) { return Number(v || 0); }
  function hasBillingEmail(c) { return !!(c.billing_email || c.accounts_email); }
  function hasAuthorizedContact(c) {
    return (c.contacts || []).some(function (x) { return x.is_authorized_contact; });
  }
  function hasAccountsContact(c) {
    return (c.contacts || []).some(function (x) { return x.is_accounts_contact; });
  }
  function accountIssues(c) {
    const issues = [];
    if (!hasBillingEmail(c)) issues.push("Billing email missing");
    if (!hasAuthorizedContact(c)) issues.push("Authorized contact missing");
    if (!hasAccountsContact(c)) issues.push("Accounts contact missing");
    if (c.lpo_required && !hasAuthorizedContact(c)) issues.push("LPO approver not identified");
    if ((c.credit_allowed || c.monthly_billing) && !c.trn) issues.push("TRN missing for credit/monthly billing");
    if (String(c.status) === "on_hold" || String(c.status) === "inactive") issues.push("Account not active");
    return issues;
  }
  function accountHealth(c) {
    const issues = accountIssues(c);
    const value = num(c.booking_value);
    if (String(c.status) === "on_hold" || String(c.status) === "inactive") return { label: "On hold", tone: "risk", issues: issues, action: "Review before accepting new corporate bookings." };
    if (issues.length >= 3) return { label: "High risk", tone: "risk", issues: issues, action: "Complete billing and authorized contacts before more credit/LPO work." };
    if (issues.length) return { label: "Review", tone: "warn", issues: issues, action: "Clean missing controls before account handover." };
    if (value > 0) return { label: "Operational", tone: "ok", issues: issues, action: "Account is ready for repeat corporate handling." };
    return { label: "Account ready", tone: "ok", issues: issues, action: "Controls are ready. Wait for first booking or lead." };
  }
  function renderCorporateControl() {
    const panel = document.getElementById("corporate-control-panel");
    if (!panel) return;
    const active = rows.filter(function (r) { return r.status === "active"; }).length;
    const risk = rows.filter(function (r) { return accountHealth(r).tone === "risk"; }).length;
    const review = rows.filter(function (r) { return accountHealth(r).tone === "warn"; }).length;
    const credit = rows.filter(function (r) { return r.credit_allowed || r.monthly_billing; }).length;
    const missingContacts = rows.filter(function (r) { return !hasAuthorizedContact(r) || !hasAccountsContact(r); }).length;
    const value = rows.reduce(function (sum, r) { return sum + num(r.booking_value); }, 0);
    const next = risk
      ? "Resolve high-risk corporate accounts before new supplier/customer commitments."
      : review
        ? "Complete missing billing and contact controls."
        : "Corporate account controls look ready for repeat handling.";
    panel.innerHTML =
      '<div class="corporate-control-summary corporate-' + esc(risk ? "risk" : review ? "warn" : "ok") + '"><div><b>' + esc(risk ? risk + " high risk" : review ? review + " review" : "Account ready") + '</b><span>' + esc(next) + '</span></div><span class="finance-value">' + esc(money(value, "AED")) + '</span></div>' +
      '<div class="corporate-control-grid">' +
        '<div><b>' + esc(active) + '</b><span>Active accounts</span></div>' +
        '<div><b>' + esc(credit) + '</b><span>Credit/monthly billing</span></div>' +
        '<div><b>' + esc(missingContacts) + '</b><span>Missing contacts</span></div>' +
        '<div><b>' + esc(rows.filter(function (r) { return r.lpo_required; }).length) + '</b><span>LPO required</span></div>' +
      '</div>';
  }

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
    document.getElementById("corporate-search").addEventListener("input", function (event) {
      activeSearch = event.target.value.trim().toLowerCase();
      renderRows();
    });
    document.querySelectorAll(".corporate-filter-group").forEach(function (group) {
      group.addEventListener("click", function (event) {
        const btn = event.target.closest("button[data-value]");
        if (!btn) return;
        group.querySelectorAll("button").forEach(function (x) { x.classList.toggle("is-active", x === btn); });
        if (group.dataset.filterGroup === "status") activeStatus = btn.dataset.value || "";
        if (group.dataset.filterGroup === "health") activeHealth = btn.dataset.value || "";
        renderRows();
      });
    });
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
    renderCorporateControl();
    renderRows();
  }

  function renderStats() {
    const total = rows.length;
    const active = rows.filter(function (r) { return r.status === "active"; }).length;
    const lpo = rows.filter(function (r) { return r.lpo_required; }).length;
    const value = rows.reduce(function (sum, r) { return sum + Number(r.booking_value || 0); }, 0);
    document.getElementById("corporate-stats").innerHTML = [
      ["Companies", total, "var(--status-quoted)"],
      ["Active", active, "var(--gold-deep)"],
      ["LPO Required", lpo, "var(--status-payment)"],
      ["Booking Value", money(value, "AED"), "var(--status-docs)"]
    ].map(function (s) { return '<div class="stat-tile" style="--tile-accent:' + s[2] + '"><div class="num stat-text">' + esc(s[1]) + '</div><div class="label">' + esc(s[0]) + '</div></div>'; }).join("");
  }

  function renderRows() {
    const visible = rows.filter(matchesCorporateFilters);
    document.getElementById("corporate-count").textContent = visible.length + " shown / " + rows.length + " compan" + (rows.length === 1 ? "y" : "ies");
    document.getElementById("corporate-list").innerHTML = visible.length ? '<div class="ops-list corporate-workspace-list">' + visible.map(renderCompany).join("") + '</div>' : '<p class="form-note">No corporate accounts match these filters.</p>';
  }

  function matchesCorporateFilters(c) {
    if (activeStatus && String(c.status) !== activeStatus) return false;
    const health = accountHealth(c);
    const tone = health.tone === "info" ? "ok" : health.tone;
    if (activeHealth && tone !== activeHealth) return false;
    if (!activeSearch) return true;
    const contactText = (c.contacts || []).map(function (x) {
      return [x.full_name, x.job_title, x.email, x.phone, x.whatsapp].filter(Boolean).join(" ");
    }).join(" ");
    return [c.company_name, c.billing_email, c.accounts_email, c.phone, c.trade_license_no, c.trn, c.notes, contactText]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .indexOf(activeSearch) !== -1;
  }

  function renderCompany(c) {
    const contacts = c.contacts || [];
    const health = accountHealth(c);
    const issueChips = health.issues.length ? health.issues.slice(0, 4).map(function (x) { return '<span class="ops-chip">' + esc(x) + '</span>'; }).join("") : '<span class="ops-chip">Controls complete</span>';
    const contactRows = contacts.length ? contacts.map(function (x) {
      return '<div class="ops-row compact-row"><div class="ops-row-main"><b>' + esc(x.full_name) + '</b><p>' + esc(x.job_title || "Contact") + ' / ' + esc(x.email || "No email") + ' / ' + esc(x.phone || x.whatsapp || "No phone") + '</p><div class="ops-kv">' + (x.is_authorized_contact ? '<span class="ops-chip">Authorized</span>' : '') + (x.is_accounts_contact ? '<span class="ops-chip">Accounts</span>' : '') + '</div></div></div>';
    }).join("") : '<p class="form-note">No contacts saved yet.</p>';
    const form = canEdit ? '<details class="corporate-add-contact"><summary>Add contact</summary><form class="form-grid payment-mini-form corporate-contact-form" data-account-id="' + esc(c.id) + '" onsubmit="return false"><div class="field-row"><div class="field col-4"><label>CONTACT NAME</label><input name="full_name" required></div><div class="field col-4"><label>JOB TITLE</label><input name="job_title"></div><div class="field col-4"><label>EMAIL</label><input name="email" type="email"></div><div class="field col-4"><label>PHONE</label><input name="phone"></div><div class="field col-4"><label>WHATSAPP</label><input name="whatsapp"></div><div class="field col-2"><label>AUTHORIZED?</label><select name="is_authorized_contact"><option value="false">No</option><option value="true">Yes</option></select></div><div class="field col-2"><label>ACCOUNTS?</label><select name="is_accounts_contact"><option value="false">No</option><option value="true">Yes</option></select></div><div class="field col-12"><label>NOTES</label><input name="notes"></div></div><button class="btn btn-primary" type="submit">Save contact</button></form></details>' : '';
    const tone = health.tone === "info" ? "ok" : health.tone;
    return '<details class="corporate-card corporate-' + esc(tone) + '"><summary><div class="ops-row-main"><div class="corporate-company-line"><b>' + esc(c.company_name) + '</b><span>' + esc(label(c.status)) + '</span></div><p>' + esc(c.billing_email || c.accounts_email || "No billing email") + ' / ' + esc(c.phone || "No phone") + '</p><div class="ops-kv"><span class="staff-risk ' + esc(tone === "ok" ? "warn" : tone) + '">' + esc(health.label) + '</span><span class="ops-chip">Terms: ' + esc(label(c.payment_terms)) + '</span><span class="ops-chip">LPO: ' + esc(bool(c.lpo_required)) + '</span><span class="ops-chip">Contacts: ' + esc(contacts.length) + '</span><span class="ops-chip">Bookings: ' + esc(c.booking_count || 0) + '</span></div></div><div class="corporate-row-value"><span>Account value</span><b>' + esc(money(c.booking_value, "AED")) + '</b></div></summary><div class="corporate-card-body"><div class="corporate-health-strip corporate-health-' + esc(tone) + '"><div><b>' + esc(health.label) + '</b><p>' + esc(health.action) + '</p></div><div class="ops-kv">' + issueChips + '</div></div><div class="ops-grid ops-grid-2"><div><h3>Account controls</h3><div class="ops-kv"><span class="ops-chip">Credit: ' + esc(bool(c.credit_allowed)) + '</span><span class="ops-chip">Monthly billing: ' + esc(bool(c.monthly_billing)) + '</span><span class="ops-chip">Billing email: ' + esc(bool(hasBillingEmail(c))) + '</span><span class="ops-chip">Authorized contact: ' + esc(bool(hasAuthorizedContact(c))) + '</span><span class="ops-chip">Accounts contact: ' + esc(bool(hasAccountsContact(c))) + '</span>' + (c.trade_license_no ? '<span class="ops-chip">TL: ' + esc(c.trade_license_no) + '</span>' : '') + (c.trn ? '<span class="ops-chip">TRN: ' + esc(c.trn) + '</span>' : '') + '</div><p class="form-note">' + esc(c.notes || "No account notes.") + '</p></div><div><h3>Contacts</h3>' + contactRows + '</div></div>' + form + '</div></details>';
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
