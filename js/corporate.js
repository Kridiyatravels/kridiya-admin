"use strict";
(function () {
  if (document.body.dataset.page !== "corporate") return;
  let sb = null;
  let rows = [];
  let deskBookings = [];
  let deskCases = [];
  let financeEvidence = [];
  let canEdit = false;
  let activeSearch = "";
  let activeStatus = "";
  let activeHealth = "";
  const CORPORATE_PORTAL_LOGIN_URL = "https://corporate.kridiyatravel.com/login.html?next=corporate-account.html";

  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }
  function label(v) { return String(v || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function money(v, c) { return (c || "AED") + " " + Number(v || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function bool(v) { return v ? "Yes" : "No"; }
  function num(v) { return Number(v || 0); }
  function cleanNote(v) {
    return String(v || "")
      .replace(/([A-Z0-9])Approved/g, "$1\nApproved")
      .replace(/\s*\n\s*/g, "\n")
      .trim();
  }
  function hasBillingEmail(c) { return !!(c.billing_email || c.accounts_email); }
  function phoneDigits(v) { return String(v || "").replace(/\D/g, ""); }
  function portalAccessMessage(member) {
    const name = member.contact_name || "there";
    const username = member.contact_email || "the email registered with Kridiya";
    return "Hello " + name + ", your Kridiya Corporate Portal access is active. Login here: " + CORPORATE_PORTAL_LOGIN_URL + " Username: " + username + ". Please use the password issued separately by Kridiya. Do not share this login with unauthorized users.";
  }
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
    document.getElementById("corporate-list").addEventListener("submit", function (event) {
      if (event.target.closest(".corporate-contact-form")) return saveContact(event);
      if (event.target.closest(".corporate-portal-form")) return savePortalMember(event);
    });
    document.getElementById("corporate-list").addEventListener("click", handleCorporateListClick);
    document.getElementById("corporate-case-list").addEventListener("click", handleCaseAction);
    document.getElementById("corporate-finance-evidence-list").addEventListener("click", handleFinanceEvidenceAction);
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
    await loadPortalMembers();
    await loadCorporateDesk();
    await loadCorporateCases();
    await loadFinanceEvidence();
    renderStats();
    renderCorporateDesk();
    renderCorporateCases();
    renderFinanceEvidence();
    renderCorporateControl();
    renderRows();
  }

  async function loadCorporateCases() {
    const result = await sb.rpc("list_corporate_desk_cases", { p_status: null, p_limit: 200 });
    deskCases = result.error ? [] : (result.data || []);
    if (result.error) toast("Could not load Corporate Desk cases: " + result.error.message, "error");
  }

  async function loadFinanceEvidence(){const r=await sb.rpc("list_corporate_finance_evidence",{p_status:null});financeEvidence=r.error?[]:(r.data||[]);if(r.error)toast("Could not load finance evidence: "+r.error.message,"error");}
  function renderFinanceEvidence(){const target=document.getElementById("corporate-finance-evidence-list");target.innerHTML=financeEvidence.length?'<div class="ops-list">'+financeEvidence.map(function(x){return '<article class="ops-row"><div class="ops-row-main"><b>'+esc(x.company_name+" - "+label(x.evidence_type))+'</b><p>'+esc([x.booking_reference,x.file_name,x.reference,x.review_note].filter(Boolean).join(" / "))+'</p><div class="ops-kv"><span class="ops-chip">'+esc(label(x.status))+'</span></div></div><div class="ops-row-actions"><button class="btn btn-outline btn-sm js-open-evidence" data-path="'+esc(x.storage_path)+'" type="button">Open file</button>'+(x.status==='pending'?'<button class="btn btn-primary btn-sm js-review-evidence" data-id="'+esc(x.id)+'" data-status="verified" type="button">Verify</button><button class="btn btn-outline btn-sm js-review-evidence" data-id="'+esc(x.id)+'" data-status="rejected" type="button">Reject</button>':'')+'</div></article>';}).join('')+'</div>':'<p class="form-note">No corporate finance evidence yet.</p>';}
  async function handleFinanceEvidenceAction(event){const open=event.target.closest(".js-open-evidence"),review=event.target.closest(".js-review-evidence");if(open){open.disabled=true;const r=await sb.storage.from("corporate-finance-evidence").createSignedUrl(open.dataset.path,300,{download:false});open.disabled=false;if(r.error){toast(r.error.message,"error");return;}window.open(r.data.signedUrl,"_blank","noopener");return;}if(!review)return;const note=prompt("Review note (minimum 3 characters):","");if(note===null)return;review.disabled=true;const r=await sb.rpc("review_corporate_finance_evidence",{p_evidence_id:review.dataset.id,p_status:review.dataset.status,p_note:note});if(r.error){toast(r.error.message,"error");review.disabled=false;return;}toast("Finance evidence "+review.dataset.status+".");await loadFinanceEvidence();renderFinanceEvidence();}

  function renderCorporateCases() {
    const target = document.getElementById("corporate-case-list");
    target.innerHTML = deskCases.length ? '<div class="ops-list">' + deskCases.map(function (c) {
      const controls = canEdit && !/resolved|closed/.test(c.status) ? '<div class="ops-row-actions"><button class="btn btn-outline btn-sm js-case-action" data-id="' + esc(c.id) + '" data-status="in_progress">Take case</button><button class="btn btn-primary btn-sm js-case-action" data-id="' + esc(c.id) + '" data-status="waiting_company">Reply</button><button class="btn btn-outline btn-sm js-case-action" data-id="' + esc(c.id) + '" data-status="resolved">Resolve</button></div>' : '';
      return '<article class="ops-row"><div class="ops-row-main"><b>' + esc(c.company_name + " - " + c.subject) + '</b><p>' + esc(c.description) + '</p>' + (c.staff_response ? '<p><b>Response:</b> ' + esc(c.staff_response) + '</p>' : '') + '<div class="ops-kv"><span class="ops-chip">' + esc(label(c.category)) + '</span><span class="ops-chip">' + esc(label(c.urgency)) + '</span><span class="ops-chip">' + esc(label(c.status)) + '</span></div></div>' + controls + '</article>';
    }).join('') + '</div>' : '<p class="form-note">No Corporate Desk cases yet.</p>';
  }

  async function handleCaseAction(event) {
    const btn = event.target.closest(".js-case-action"); if (!btn) return;
    let response = null;
    if (btn.dataset.status === "waiting_company" || btn.dataset.status === "resolved") { response = prompt("Company-safe response (minimum 3 characters):", ""); if (response === null) return; }
    btn.disabled = true;
    const result = await sb.rpc("update_corporate_desk_case", { p_case_id: btn.dataset.id, p_status: btn.dataset.status, p_staff_response: response });
    if (result.error) { toast(result.error.message, "error"); btn.disabled = false; return; }
    toast("Corporate Desk case updated."); await loadCorporateCases(); renderCorporateCases();
  }


  async function loadCorporateDesk() {
    const result = await sb.rpc("list_operations_bookings", { limit_count: 250 });
    if (result.error) {
      deskBookings = [];
      const panel = document.getElementById("corporate-desk-panel");
      if (panel) panel.innerHTML = '<p class="blocked-note">Could not load corporate desk: ' + esc(result.error.message) + '</p>';
      return;
    }
    deskBookings = (result.data || []).filter(isCorporateBooking).sort(function (a, b) {
      return deskRank(a) - deskRank(b) || bookingTime(b) - bookingTime(a);
    });
  }

  function isCorporateBooking(b) {
    const source = String(b.source || "").toLowerCase();
    return b.booking_kind === "corporate" || !!b.corporate_company_name || !!b.corporate_account_id || source === "portal" || source === "corporate_portal";
  }

  function isClosedBooking(b) {
    return /cancel|complete|closed|archived/.test(String(b.status || "").toLowerCase());
  }

  function paymentPending(b) {
    return !/paid|received|verified|completed/.test(String(b.payment_status || "").toLowerCase());
  }

  function docsPending(b) {
    return !/ready|released|sent|generated|archived|completed/.test(String(b.document_status || "").toLowerCase());
  }

  function isPortalRequest(b) {
    const source = String(b.source || "").toLowerCase();
    return source === "portal" || source === "corporate_portal";
  }

  function bookingTime(b) {
    const t = new Date(b.created_at || b.travel_start || 0).getTime();
    return isNaN(t) ? 0 : t;
  }

  function deskRank(b) {
    if (isClosedBooking(b)) return 9;
    if (!num(b.selling_price)) return 0;
    if (paymentPending(b)) return 1;
    if (!b.supplier_name && !b.supplier_reference) return 2;
    if (docsPending(b)) return 3;
    return 4;
  }

  function deskAction(b) {
    if (!num(b.selling_price)) return { label: "Prepare quote", tone: "warn" };
    if (paymentPending(b)) return { label: "Collect payment/LPO", tone: "risk" };
    if (!b.supplier_name && !b.supplier_reference) return { label: "Add supplier control", tone: "risk" };
    if (docsPending(b)) return { label: "Prepare documents", tone: "warn" };
    return { label: "Monitor", tone: "ok" };
  }

  function renderCorporateDesk() {
    const panel = document.getElementById("corporate-desk-panel");
    if (!panel) return;
    const active = deskBookings.filter(function (b) { return !isClosedBooking(b); });
    const portal = active.filter(isPortalRequest);
    const quoted = active.filter(function (b) { return num(b.selling_price) > 0; });
    const payments = active.filter(paymentPending);
    const docs = active.filter(docsPending);
    const value = active.reduce(function (sum, b) { return sum + num(b.selling_price); }, 0);
    const queue = active.slice(0, 5);
    panel.innerHTML =
      '<div class="corporate-desk-metrics">' +
        renderDeskMetric("Active jobs", active.length, "Live corporate work") +
        renderDeskMetric("Portal requests", portal.length, "Company submitted") +
        renderDeskMetric("Quotes released", quoted.length, "Visible to clients") +
        renderDeskMetric("Payment handoff", payments.length, "Needs LPO or receipt") +
        renderDeskMetric("Document risk", docs.length, "Not ready for handover") +
        renderDeskMetric("Pipeline value", money(value, "AED"), "Customer-visible sales") +
      '</div>' +
      '<div class="corporate-desk-queue"><div class="corporate-desk-queue-head"><div><h3>Priority queue</h3><p>Work from the first row down: quote, collect payment, control supplier, then release documents.</p></div><span>' + esc(queue.length) + ' shown</span></div>' +
      (queue.length ? queue.map(renderDeskBooking).join("") : '<div class="corporate-portal-empty"><b>No active corporate queue.</b><p>New portal requests and corporate bookings will appear here automatically.</p></div>') +
      '</div>';
  }

  function renderDeskMetric(title, value, note) {
    return '<div class="corporate-desk-metric"><b>' + esc(value) + '</b><span>' + esc(title) + '</span><small>' + esc(note) + '</small></div>';
  }

  function renderDeskBooking(b) {
    const action = deskAction(b);
    const company = b.corporate_company_name || b.customer_name || "Corporate client";
    const travel = [b.travel_start, b.travel_end].filter(Boolean).join(" - ") || "Date not set";
    return '<article class="corporate-desk-job corporate-desk-' + esc(action.tone) + '"><div><div class="corporate-desk-ref"><span>' + esc(b.booking_reference || "No reference") + '</span><em>' + esc(action.label) + '</em></div><h3>' + esc(b.title || "Corporate booking") + '</h3><p>' + esc(company) + ' / ' + esc(b.route_or_destination || "No route") + '</p><div class="ops-kv"><span class="ops-chip">' + esc(label(b.service_type)) + '</span><span class="ops-chip">Travel: ' + esc(travel) + '</span><span class="ops-chip">Payment: ' + esc(label(b.payment_status)) + '</span><span class="ops-chip">Docs: ' + esc(label(b.document_status)) + '</span><span class="ops-chip">Value: ' + esc(money(b.selling_price, b.currency)) + '</span></div></div><a class="btn btn-primary" href="booking-detail.html?id=' + esc(b.id) + '">Open job</a></article>';
  }

  async function loadPortalMembers() {
    if (!rows.length) return;
    const ids = rows.map(function (r) { return r.id; });
    const result = await sb
      .from("corporate_portal_members")
      .select("id, corporate_account_id, corporate_contact_id, user_id, role, status, can_request, can_approve_quotes, can_view_finance, can_view_documents, notes, last_seen_at, invited_at, updated_at")
      .in("corporate_account_id", ids)
      .order("invited_at", { ascending: true });
    if (result.error) {
      rows.forEach(function (row) { row.portal_members = []; });
      toast("Could not load portal access: " + result.error.message);
      return;
    }
    const grouped = {};
    (result.data || []).forEach(function (member) {
      if (!grouped[member.corporate_account_id]) grouped[member.corporate_account_id] = [];
      grouped[member.corporate_account_id].push(member);
    });
    rows.forEach(function (row) {
      row.portal_members = (grouped[row.id] || []).map(function (member) {
        const contact = (row.contacts || []).find(function (x) { return x.id === member.corporate_contact_id; }) || {};
        return Object.assign({}, member, {
          contact_name: contact.full_name || "",
          contact_email: contact.email || "",
          contact_phone: contact.phone || contact.whatsapp || ""
        });
      });
    });
  }

  async function handleCorporateListClick(event) {
    const copyBtn = event.target.closest("[data-copy-portal-login]");
    const statementCopyBtn = event.target.closest("[data-copy-company-statement]");
    const statementPrintBtn = event.target.closest("[data-print-company-statement]");
    if (copyBtn) {
      event.preventDefault();
      copyText(copyBtn.dataset.copyPortalLogin || CORPORATE_PORTAL_LOGIN_URL, "Corporate portal login link copied.");
      return;
    }
    if (statementCopyBtn) {
      event.preventDefault();
      const company = findCompany(statementCopyBtn.dataset.copyCompanyStatement);
      if (!company) { toast("Company not found for statement."); return; }
      copyText(companyStatementText(company), "Corporate statement summary copied.");
      return;
    }
    if (statementPrintBtn) {
      event.preventDefault();
      const company = findCompany(statementPrintBtn.dataset.printCompanyStatement);
      if (!company) { toast("Company not found for statement."); return; }
      printCompanyStatement(company);
    }
  }

  function copyText(text, successMessage) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast(successMessage); },
        function () { toast("Could not copy automatically."); }
      );
    } else {
      toast("Copy not supported on this browser.");
    }
  }

  function findCompany(id) {
    return rows.find(function (row) { return String(row.id) === String(id); });
  }

  function companyBookings(c) {
    const name = String(c.company_name || "").toLowerCase();
    return deskBookings.filter(function (b) {
      return String(b.corporate_account_id || "") === String(c.id) ||
        (!!name && String(b.corporate_company_name || "").toLowerCase() === name);
    }).sort(function (a, b) { return bookingTime(b) - bookingTime(a); });
  }

  function visibleBookingValue(bookings) {
    return bookings.reduce(function (sum, b) { return sum + num(b.selling_price); }, 0);
  }

  function statementBookingLine(b) {
    const travel = [b.travel_start, b.travel_end].filter(Boolean).join(" to ") || "Date not set";
    return [
      b.booking_reference || "No reference",
      b.title || "Corporate booking",
      label(b.service_type),
      b.route_or_destination || "Route not set",
      travel,
      label(b.payment_status),
      label(b.document_status),
      money(b.selling_price, b.currency)
    ].join(" | ");
  }

  function companyStatementText(c) {
    const now = new Date();
    const month = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    const bookings = companyBookings(c);
    return [
      "Kridiya Corporate Monthly Statement - " + month,
      "Company: " + (c.company_name || "Corporate account"),
      "Billing email: " + (c.billing_email || c.accounts_email || "Not set"),
      "Account status: " + label(c.status),
      "Payment terms: " + label(c.payment_terms),
      "LPO required: " + bool(c.lpo_required),
      "Visible bookings: " + bookings.length,
      "Customer-visible value: " + money(visibleBookingValue(bookings) || c.booking_value, "AED"),
      "Portal users: " + ((c.portal_members || []).length),
      "Contacts: " + ((c.contacts || []).map(function (x) { return [x.full_name, x.email, x.phone || x.whatsapp].filter(Boolean).join(" / "); }).join("; ") || "Not set"),
      "",
      "Booking rows:",
      bookings.length ? bookings.map(statementBookingLine).join("\n") : "No customer-visible booking rows found yet.",
      "",
      "Note: Supplier cost, margin, and internal staff notes remain inside Kridiya admin."
    ].join("\n");
  }

  function printCompanyStatement(c) {
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) { toast("Popup blocked. Use copy statement summary instead."); return; }
    const bookings = companyBookings(c);
    const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    const rowsHtml = bookings.length ? bookings.map(function (b) {
      const travel = [b.travel_start, b.travel_end].filter(Boolean).join(" to ") || "Date not set";
      return '<tr><td>' + esc(b.booking_reference || "-") + '</td><td>' + esc(b.title || "Corporate booking") + '</td><td>' + esc(label(b.service_type)) + '</td><td>' + esc(b.route_or_destination || "-") + '</td><td>' + esc(travel) + '</td><td>' + esc(label(b.payment_status)) + '</td><td>' + esc(label(b.document_status)) + '</td><td>' + esc(money(b.selling_price, b.currency)) + '</td></tr>';
    }).join("") : '<tr><td colspan="8">No customer-visible booking rows found yet.</td></tr>';
    w.document.write('<!doctype html><html><head><title>Corporate Statement - ' + esc(c.company_name) + '</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#241b13}h1{font-size:24px;margin:0}.sub{color:#6f6254;margin:6px 0 22px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}.summary div{border:1px solid #ead8bd;border-radius:10px;padding:12px;background:#fffaf2}.summary span{display:block;color:#6f6254;font-size:11px;text-transform:uppercase;font-weight:700}.summary b{display:block;margin-top:5px;font-size:15px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #ead8bd;text-align:left;padding:9px;vertical-align:top}th{background:#fffaf2;font-size:11px;text-transform:uppercase}.note{margin-top:18px;color:#6f6254;font-size:12px}</style></head><body><h1>Kridiya Corporate Monthly Statement</h1><p class="sub">' + esc(month) + ' / ' + esc(c.company_name || "Corporate account") + '</p><div class="summary"><div><span>Customer value</span><b>' + esc(money(visibleBookingValue(bookings) || c.booking_value, "AED")) + '</b></div><div><span>Bookings</span><b>' + esc(bookings.length) + '</b></div><div><span>Payment terms</span><b>' + esc(label(c.payment_terms)) + '</b></div><div><span>LPO required</span><b>' + esc(bool(c.lpo_required)) + '</b></div></div><table><thead><tr><th>Reference</th><th>Booking</th><th>Service</th><th>Route</th><th>Travel window</th><th>Payment</th><th>Documents</th><th>Amount</th></tr></thead><tbody>' + rowsHtml + '</tbody></table><p class="note">Supplier cost, margin, and internal staff notes remain inside Kridiya admin.</p></body></html>');
    w.document.close();
    w.focus();
    w.print();
  }

  async function savePortalMember(event) {
    const form = event.target.closest(".corporate-portal-form");
    if (!form) return;
    event.preventDefault();
    const result = await sb
      .from("corporate_portal_members")
      .update({
        role: form.role.value,
        status: form.status.value,
        can_request: form.can_request.checked,
        can_approve_quotes: form.can_approve_quotes.checked,
        can_view_finance: form.can_view_finance.checked,
        can_view_documents: form.can_view_documents.checked,
        notes: cleanNote(form.notes.value) || null
      })
      .eq("id", form.dataset.memberId);
    if (result.error) { toast("Could not update portal access: " + result.error.message); return; }
    toast("Portal access updated.");
    await loadCompanies();
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
    const portalMembers = c.portal_members || [];
    const health = accountHealth(c);
    const issueChips = health.issues.length ? health.issues.slice(0, 4).map(function (x) { return '<span class="ops-chip">' + esc(x) + '</span>'; }).join("") : '<span class="ops-chip">Controls complete</span>';
    const contactRows = contacts.length ? contacts.map(function (x) {
      return '<div class="ops-row compact-row"><div class="ops-row-main"><b>' + esc(x.full_name) + '</b><p>' + esc(x.job_title || "Contact") + ' / ' + esc(x.email || "No email") + ' / ' + esc(x.phone || x.whatsapp || "No phone") + '</p><div class="ops-kv">' + (x.is_authorized_contact ? '<span class="ops-chip">Authorized</span>' : '') + (x.is_accounts_contact ? '<span class="ops-chip">Accounts</span>' : '') + '</div></div></div>';
    }).join("") : '<p class="form-note">No contacts saved yet.</p>';
    const portalAccess = renderPortalAccess(c, portalMembers);
    const statementPanel = renderStatementPanel(c, portalMembers);
    const form = canEdit ? '<details class="corporate-add-contact"><summary>Add contact</summary><form class="form-grid payment-mini-form corporate-contact-form" data-account-id="' + esc(c.id) + '" onsubmit="return false"><div class="field-row"><div class="field col-4"><label>CONTACT NAME</label><input name="full_name" required></div><div class="field col-4"><label>JOB TITLE</label><input name="job_title"></div><div class="field col-4"><label>EMAIL</label><input name="email" type="email"></div><div class="field col-4"><label>PHONE</label><input name="phone"></div><div class="field col-4"><label>WHATSAPP</label><input name="whatsapp"></div><div class="field col-2"><label>AUTHORIZED?</label><select name="is_authorized_contact"><option value="false">No</option><option value="true">Yes</option></select></div><div class="field col-2"><label>ACCOUNTS?</label><select name="is_accounts_contact"><option value="false">No</option><option value="true">Yes</option></select></div><div class="field col-12"><label>NOTES</label><input name="notes"></div></div><button class="btn btn-primary" type="submit">Save contact</button></form></details>' : '';
    const tone = health.tone === "info" ? "ok" : health.tone;
    return '<details class="corporate-card corporate-' + esc(tone) + '"><summary><div class="ops-row-main"><div class="corporate-company-line"><b>' + esc(c.company_name) + '</b><span>' + esc(label(c.status)) + '</span></div><p>' + esc(c.billing_email || c.accounts_email || "No billing email") + ' / ' + esc(c.phone || "No phone") + '</p><div class="ops-kv"><span class="staff-risk ' + esc(tone === "ok" ? "warn" : tone) + '">' + esc(health.label) + '</span><span class="ops-chip">Terms: ' + esc(label(c.payment_terms)) + '</span><span class="ops-chip">LPO: ' + esc(bool(c.lpo_required)) + '</span><span class="ops-chip">Contacts: ' + esc(contacts.length) + '</span><span class="ops-chip">Portal: ' + esc(portalMembers.length) + '</span><span class="ops-chip">Bookings: ' + esc(c.booking_count || 0) + '</span></div></div><div class="corporate-row-value"><span>Account value</span><b>' + esc(money(c.booking_value, "AED")) + '</b></div></summary><div class="corporate-card-body"><div class="corporate-health-strip corporate-health-' + esc(tone) + '"><div><b>' + esc(health.label) + '</b><p>' + esc(health.action) + '</p></div><div class="ops-kv">' + issueChips + '</div></div><div class="ops-grid ops-grid-2"><div><h3>Account controls</h3><div class="ops-kv"><span class="ops-chip">Credit: ' + esc(bool(c.credit_allowed)) + '</span><span class="ops-chip">Monthly billing: ' + esc(bool(c.monthly_billing)) + '</span><span class="ops-chip">Billing email: ' + esc(bool(hasBillingEmail(c))) + '</span><span class="ops-chip">Authorized contact: ' + esc(bool(hasAuthorizedContact(c))) + '</span><span class="ops-chip">Accounts contact: ' + esc(bool(hasAccountsContact(c))) + '</span>' + (c.trade_license_no ? '<span class="ops-chip">TL: ' + esc(c.trade_license_no) + '</span>' : '') + (c.trn ? '<span class="ops-chip">TRN: ' + esc(c.trn) + '</span>' : '') + '</div><p class="form-note">' + esc(c.notes || "No account notes.") + '</p></div><div><h3>Contacts</h3>' + contactRows + '</div></div>' + portalAccess + statementPanel + form + '</div></details>';
  }

  function renderStatementPanel(c, portalMembers) {
    const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    const bookings = companyBookings(c);
    const value = visibleBookingValue(bookings) || c.booking_value;
    const bookingRows = bookings.length ? bookings.slice(0, 4).map(function (b) {
      const travel = [b.travel_start, b.travel_end].filter(Boolean).join(" to ") || "Date not set";
      return '<div class="corporate-statement-row"><b>' + esc(b.booking_reference || "No ref") + '</b><span>' + esc(b.title || "Corporate booking") + '</span><em>' + esc(label(b.payment_status)) + ' / ' + esc(label(b.document_status)) + '</em><strong>' + esc(money(b.selling_price, b.currency)) + '</strong><small>' + esc((b.route_or_destination || "Route not set") + " / " + travel) + '</small></div>';
    }).join("") : '<div class="corporate-statement-empty">No booking rows found for this company yet.</div>';
    return '<section class="corporate-statement-panel"><div class="account-section-head"><div><h3>Monthly statement handoff</h3><p>Prepare a customer-safe account summary for ' + esc(month) + '. Supplier cost, profit, and internal notes stay hidden.</p></div><div class="corporate-statement-actions"><button class="btn btn-outline btn-sm" type="button" data-copy-company-statement="' + esc(c.id) + '">Copy summary</button><button class="btn btn-outline btn-sm" type="button" data-print-company-statement="' + esc(c.id) + '">Print statement</button><a class="btn btn-outline btn-sm" href="bookings.html">Open bookings</a></div></div><div class="corporate-statement-grid"><div><span>Customer value</span><b>' + esc(money(value, "AED")) + '</b></div><div><span>Statement rows</span><b>' + esc(bookings.length) + '</b></div><div><span>Payment terms</span><b>' + esc(label(c.payment_terms)) + '</b></div><div><span>LPO required</span><b>' + esc(bool(c.lpo_required)) + '</b></div><div><span>Billing email</span><b>' + esc(c.billing_email || c.accounts_email || "Not set") + '</b></div><div><span>Portal users</span><b>' + esc(portalMembers.length) + '</b></div></div><div class="corporate-statement-rows">' + bookingRows + '</div></section>';
  }

  function renderPortalAccess(c, portalMembers) {
    const memberRows = portalMembers.length ? portalMembers.map(renderPortalMember).join("") : '<div class="corporate-portal-empty"><b>No portal login linked yet.</b><p>Create a Supabase Auth user, approve/link the application, then this panel will control that login.</p></div>';
    return '<section class="corporate-portal-panel"><div class="account-section-head"><div><h3>Portal access</h3><p>Controls what the company sees inside corporate.kridiyatravel.com after sign in.</p></div><span class="ops-chip">' + esc(portalMembers.length) + ' login' + (portalMembers.length === 1 ? "" : "s") + '</span></div>' + memberRows + '</section>';
  }

  function renderPortalMember(member) {
    const title = member.contact_name || member.contact_email || member.user_id;
    const subtitle = [member.contact_email, member.contact_phone].filter(Boolean).join(" / ") || "Auth user " + member.user_id;
    if (!canEdit) {
      return '<article class="corporate-portal-member"><div><b>' + esc(title) + '</b><p>' + esc(subtitle) + '</p><div class="ops-kv">' + renderPermissionChips(member) + '</div></div></article>';
    }
    const message = portalAccessMessage(member);
    const phone = phoneDigits(member.contact_phone);
    const email = member.contact_email || "";
    const whatsappHref = phone ? "https://wa.me/" + phone + "?text=" + encodeURIComponent(message) : "";
    const mailHref = email ? "mailto:" + encodeURIComponent(email) + "?subject=" + encodeURIComponent("Kridiya Corporate Portal Access") + "&body=" + encodeURIComponent(message) : "";
    const handoff = '<div class="corporate-portal-actions"><a class="btn btn-outline btn-sm" href="' + esc(CORPORATE_PORTAL_LOGIN_URL) + '" target="_blank" rel="noopener">Open portal</a><button class="btn btn-outline btn-sm" type="button" data-copy-portal-login="' + esc(CORPORATE_PORTAL_LOGIN_URL) + '">Copy login link</button>' + (whatsappHref ? '<a class="btn btn-outline btn-sm" href="' + esc(whatsappHref) + '" target="_blank" rel="noopener">WhatsApp access</a>' : '<button class="btn btn-outline btn-sm" type="button" disabled>No WhatsApp</button>') + (mailHref ? '<a class="btn btn-outline btn-sm" href="' + esc(mailHref) + '">Email access</a>' : '<button class="btn btn-outline btn-sm" type="button" disabled>No email</button>') + '</div><p class="corporate-portal-hint">Send the login link and username here. Share or reset the password separately from Supabase Auth.</p>';
    return '<form class="corporate-portal-member corporate-portal-form" data-member-id="' + esc(member.id) + '" onsubmit="return false"><div class="corporate-portal-identity"><b>' + esc(title) + '</b><p>' + esc(subtitle) + '</p><small>' + esc(member.user_id) + '</small>' + handoff + '</div><div class="corporate-portal-controls"><label>ROLE<select name="role">' + roleOptions(member.role) + '</select></label><label>STATUS<select name="status">' + statusOptions(member.status) + '</select></label><label class="checkline"><input type="checkbox" name="can_request"' + (member.can_request ? " checked" : "") + '><span>Requests</span></label><label class="checkline"><input type="checkbox" name="can_approve_quotes"' + (member.can_approve_quotes ? " checked" : "") + '><span>Quote approval</span></label><label class="checkline"><input type="checkbox" name="can_view_finance"' + (member.can_view_finance ? " checked" : "") + '><span>Finance</span></label><label class="checkline"><input type="checkbox" name="can_view_documents"' + (member.can_view_documents ? " checked" : "") + '><span>Documents</span></label><label class="corporate-portal-notes">NOTES<textarea name="notes" rows="2" placeholder="Internal access note">' + esc(cleanNote(member.notes)) + '</textarea></label><button class="btn btn-primary" type="submit">Save access</button></div></form>';
  }

  function renderPermissionChips(member) {
    return [
      '<span class="ops-chip">' + esc(label(member.role)) + '</span>',
      '<span class="ops-chip">' + esc(label(member.status)) + '</span>',
      '<span class="ops-chip">Requests: ' + esc(bool(member.can_request)) + '</span>',
      '<span class="ops-chip">Quotes: ' + esc(bool(member.can_approve_quotes)) + '</span>',
      '<span class="ops-chip">Finance: ' + esc(bool(member.can_view_finance)) + '</span>',
      '<span class="ops-chip">Docs: ' + esc(bool(member.can_view_documents)) + '</span>'
    ].join("");
  }

  function roleOptions(value) {
    return ["owner", "travel_coordinator", "finance", "requester", "viewer"].map(function (option) {
      return '<option value="' + esc(option) + '"' + (String(value) === option ? " selected" : "") + '>' + esc(label(option)) + '</option>';
    }).join("");
  }

  function statusOptions(value) {
    return ["invited", "active", "suspended", "revoked"].map(function (option) {
      return '<option value="' + esc(option) + '"' + (String(value) === option ? " selected" : "") + '>' + esc(label(option)) + '</option>';
    }).join("");
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
