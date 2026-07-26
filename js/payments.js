"use strict";
(function () {
  if (document.body.dataset.page !== "payments") return;
  let sb = null;
  let rows = [];
  let canEditPayments = false;
  let canApproveRefunds = false;
  let activeStatus = "all";
  let activeSearch = "";
  let activeSort = "created_desc";

  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }
  function label(v) { return String(v || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function num(v) { return Number(v || 0); }
  function money(v, c) { return (c || "AED") + " " + Number(v || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function dateText(v) { return v ? new Date(v).toLocaleString("en-GB") : "Not recorded"; }
  function statusIs(p, status) { return String(p.status || "").toLowerCase() === status; }
  function receivedRows() { return rows.filter(function (r) { return statusIs(r, "received"); }); }
  function refundedRows() { return rows.filter(function (r) { return statusIs(r, "refunded"); }); }
  function refundPendingRows() { return rows.filter(function (r) { return statusIs(r, "refund_pending") || statusIs(r, "refund_approved"); }); }
  function searchableText(p) {
    return [
      p.payment_reference, p.booking_reference, p.booking_title, p.customer_name,
      p.corporate_company_name, p.service_type, p.method, p.status, p.refund_reason
    ].join(" ").toLowerCase();
  }
  function filteredRows() {
    return rows.filter(function (p) {
      if (activeStatus !== "all") {
        if (activeStatus === "refund_queue" && !statusIs(p, "refund_pending") && !statusIs(p, "refund_approved")) return false;
        if (activeStatus !== "refund_queue" && !statusIs(p, activeStatus)) return false;
      }
      if (activeSearch && searchableText(p).indexOf(activeSearch) === -1) return false;
      return true;
    }).sort(function (a, b) {
      if (activeSort === "created_asc") return paymentTime(a) - paymentTime(b);
      if (activeSort === "amount_desc") return num(b.amount) - num(a.amount);
      if (activeSort === "refund_first") return refundRank(a) - refundRank(b) || paymentTime(b) - paymentTime(a);
      if (activeSort === "method_asc") return String(a.method || "").localeCompare(String(b.method || "")) || paymentTime(b) - paymentTime(a);
      return paymentTime(b) - paymentTime(a);
    });
  }

  function paymentTime(p) {
    const t = new Date(p.received_at || p.created_at || 0).getTime();
    return isNaN(t) ? 0 : t;
  }

  function refundRank(p) {
    if (statusIs(p, "refund_pending")) return 0;
    if (statusIs(p, "refund_approved")) return 1;
    if (p.refund_requested_at) return 2;
    return 3;
  }

  function sortLabel() {
    const labels = {
      created_desc: "Newest first",
      created_asc: "Oldest first",
      amount_desc: "Amount",
      refund_first: "Refund risk",
      method_asc: "Method"
    };
    return labels[activeSort] || labels.created_desc;
  }
  function chips(p) {
    const out = [];
    if (p.booking_reference) out.push('<span class="ops-chip">' + esc(p.booking_reference) + '</span>');
    if (p.service_type) out.push('<span class="ops-chip">' + esc(label(p.service_type)) + '</span>');
    if (p.has_proof) out.push('<span class="ops-chip">Proof attached</span>');
    if (p.receipt_document_id) out.push('<span class="ops-chip">Receipt generated</span>');
    if (p.refund_requested_at) out.push('<span class="ops-chip">Refund requested</span>');
    if (p.refund_approved_at) out.push('<span class="ops-chip">Refund approved</span>');
    if (p.refund_completed_at) out.push('<span class="ops-chip">Refund completed</span>');
    return out.length ? '<div class="ops-kv">' + out.join("") + '</div>' : "";
  }
  function actionButtons(p) {
    const buttons = [];
    if (p.booking_id) buttons.push('<a class="btn btn-outline" href="booking-detail.html?id=' + esc(p.booking_id) + '">Open booking</a>');
    if (canEditPayments && ["received", "proof_received", "paid"].indexOf(String(p.status || "").toLowerCase()) !== -1) {
      buttons.push('<button class="btn btn-outline js-refund-request" data-id="' + esc(p.id) + '" data-amount="' + esc(p.amount) + '" type="button">Request refund</button>');
    }
    if (canApproveRefunds && statusIs(p, "refund_pending")) {
      buttons.push('<button class="btn btn-primary js-refund-approve" data-id="' + esc(p.id) + '" type="button">Approve</button>');
    }
    if (canApproveRefunds && (statusIs(p, "refund_pending") || statusIs(p, "refund_approved"))) {
      buttons.push('<button class="btn btn-primary js-refund-complete" data-id="' + esc(p.id) + '" type="button">Complete refund</button>');
    }
    return buttons.join("");
  }
  function renderToolbar() {
    const filters = [
      ["all", "All"],
      ["received", "Received"],
      ["pending", "Pending"],
      ["proof_received", "Proof"],
      ["refund_queue", "Refund queue"],
      ["refunded", "Refunded"]
    ];
    return '<div class="account-main" style="margin-bottom:1rem"><div class="account-section-head"><div><h2>Finance control center</h2><p>Search, monitor, approve refunds, and open connected bookings.</p></div><input id="payments-search" class="admin-search" placeholder="Search reference, booking, company, method..." value="' + esc(activeSearch) + '" data-command-label="Search payments" data-command-desc="Find finance records by reference, booking, company or method" data-command-keys="S" data-command-action="focus-search"></div><div class="payment-command-row"><div class="ops-kv">' + filters.map(function (f) {
      return '<button class="btn ' + (activeStatus === f[0] ? 'btn-primary' : 'btn-outline') + ' js-payment-filter" data-status="' + esc(f[0]) + '" type="button">' + esc(f[1]) + '</button>';
    }).join("") + '</div><div class="booking-sort admin-list-sort" id="payments-sort"><button type="button" class="booking-sort-btn" id="payments-sort-btn" aria-haspopup="true" aria-expanded="false" data-command-label="Sort payments" data-command-desc="Open payment sort menu" data-command-keys="F" data-command-action="focus-filter">Sort: <b>' + esc(sortLabel()) + '</b></button><div class="booking-sort-menu" id="payments-sort-menu" role="menu" hidden>' +
      [
        ["created_desc", "Newest first", "Latest records"],
        ["created_asc", "Oldest first", "Earliest records"],
        ["amount_desc", "Amount", "High to low"],
        ["refund_first", "Refund risk", "Refund queue first"],
        ["method_asc", "Method", "Grouped by payment method"]
      ].map(function (s) {
        return '<button type="button" role="menuitemradio" aria-checked="' + String(activeSort === s[0]) + '" class="booking-sort-item' + (activeSort === s[0] ? " active" : "") + '" data-sort="' + esc(s[0]) + '"><span class="sort-dot"></span><span><b>' + esc(s[1]) + '</b><small>' + esc(s[2]) + "</small></span></button>";
      }).join("") + '</div></div></div></div>';
  }
  function renderPayments() {
    const list = filteredRows();
    document.getElementById("payments-count").textContent = list.length + " shown / " + rows.length + " total";
    document.getElementById("payments-list").innerHTML = renderToolbar() + (list.length ? '<div class="ops-list">' + list.map(function (p) {
      const title = p.payment_reference || p.booking_reference || "Payment";
      const customer = p.customer_name || p.corporate_company_name || p.booking_title || "No linked customer";
      const refundLine = p.refund_amount ? '<p class="form-note">Refund: ' + esc(money(p.refund_amount, p.currency)) + (p.refund_reason ? ' / ' + esc(p.refund_reason) : '') + (p.refund_reference ? ' / Ref: ' + esc(p.refund_reference) : '') + '</p>' : '';
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(title) + '</b><p>' + esc(customer) + ' - ' + esc(label(p.method)) + ' - ' + esc(label(p.status)) + ' - ' + esc(dateText(p.received_at || p.created_at)) + '</p>' + chips(p) + refundLine + '</div><div class="ops-row-actions"><span class="finance-value">' + esc(money(p.amount, p.currency)) + '</span>' + actionButtons(p) + '</div></div>';
    }).join("") + '</div>' : '<p class="form-note">No payment records match this view.</p>');
  }
  function renderStats() {
    const received = receivedRows().reduce(function (s, r) { return s + num(r.amount); }, 0);
    const refundPending = refundPendingRows().reduce(function (s, r) { return s + num(r.refund_amount || r.amount); }, 0);
    const refunded = refundedRows().reduce(function (s, r) { return s + num(r.refund_amount || r.amount); }, 0);
    const proofCount = rows.filter(function (r) { return r.has_proof; }).length;
    document.getElementById("payments-stats").innerHTML =
      '<div class="stat-tile"><div class="num">' + rows.length + '</div><div class="label">Payment records</div></div>' +
      '<div class="stat-tile"><div class="num stat-text">' + esc(money(received, "AED")) + '</div><div class="label">Received total</div></div>' +
      '<div class="stat-tile"><div class="num stat-text">' + esc(money(refundPending, "AED")) + '</div><div class="label">Refund queue</div></div>' +
      '<div class="stat-tile"><div class="num stat-text">' + esc(money(refunded, "AED")) + '</div><div class="label">Refunded</div></div>' +
      '<div class="stat-tile"><div class="num stat-text">' + esc(money(received - refunded, "AED")) + '</div><div class="label">Net collected</div></div>' +
      '<div class="stat-tile"><div class="num">' + proofCount + '</div><div class="label">Proof attached</div></div>';
  }
  async function callRpc(name, args, okText) {
    const result = await sb.rpc(name, args);
    if (result.error) { toast(result.error.message); return false; }
    toast(okText);
    await loadPayments();
    return true;
  }
  async function requestRefund(id, amount) {
    const refundAmount = window.prompt("Refund amount", String(amount || ""));
    if (refundAmount === null) return;
    const reason = window.prompt("Refund reason / supplier rule", "");
    if (reason === null) return;
    await callRpc("request_payment_refund", { p_payment_id: id, p_refund_amount: Number(refundAmount), p_reason: reason }, "Refund request recorded.");
  }
  async function approveRefund(id) {
    const note = window.prompt("Approval note", "Approved by owner/finance.");
    if (note === null) return;
    await callRpc("approve_payment_refund", { p_payment_id: id, p_note: note }, "Refund approved.");
  }
  async function completeRefund(id) {
    const method = window.prompt("Refund method", "Bank transfer");
    if (method === null) return;
    const reference = window.prompt("Refund reference / transaction ID", "");
    if (reference === null) return;
    const note = window.prompt("Completion note", "");
    if (note === null) return;
    await callRpc("complete_payment_refund", { p_payment_id: id, p_refund_method: method, p_refund_reference: reference, p_note: note }, "Refund completed.");
  }

  async function boot() {
    const gate = document.getElementById("payments-gate");
    const app = document.getElementById("payments-app");
    const user = await KridiyaAuth.currentUser();
    if (!user) { renderLoginForm(gate, boot); return; }
    sb = await KridiyaAuth.client();
    const allowed = await sb.rpc("has_staff_permission", { permission_name: "view_payments" });
    if (allowed.error || allowed.data !== true) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>Finance access required.</b><br>Only owner/admin/finance users can view payments.</p><a class="btn btn-primary" href="dashboard.html">Back to dashboard</a></div>';
      return;
    }
    const editCheck = await sb.rpc("has_staff_permission", { permission_name: "edit_payments" });
    const refundCheck = await sb.rpc("can_approve_refunds");
    canEditPayments = editCheck.data === true;
    canApproveRefunds = refundCheck.data === true;
    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    await loadPayments();
  }

  async function loadPayments() {
    const result = await sb.rpc("list_operations_payments", { limit_count: 500 });
    if (result.error) { toast("Could not load payments: " + result.error.message); return; }
    rows = result.data || [];
    renderStats();
    renderPayments();
  }
  document.addEventListener("click", function (event) {
    const filter = event.target.closest(".js-payment-filter");
    if (filter) {
      activeStatus = filter.dataset.status;
      renderPayments();
      return;
    }
    const sortBtn = event.target.closest("#payments-sort-btn");
    if (sortBtn) {
      event.stopPropagation();
      const menu = document.getElementById("payments-sort-menu");
      const open = menu && menu.hidden;
      if (menu) menu.hidden = !open;
      sortBtn.setAttribute("aria-expanded", String(open));
      return;
    }
    const sortItem = event.target.closest("#payments-sort-menu .booking-sort-item");
    if (sortItem) {
      activeSort = sortItem.dataset.sort || "created_desc";
      renderPayments();
      return;
    }
    const sortWrap = document.getElementById("payments-sort");
    const sortMenu = document.getElementById("payments-sort-menu");
    const paymentsSortBtn = document.getElementById("payments-sort-btn");
    if (sortWrap && sortMenu && paymentsSortBtn && !sortWrap.contains(event.target)) {
      sortMenu.hidden = true;
      paymentsSortBtn.setAttribute("aria-expanded", "false");
    }
    const req = event.target.closest(".js-refund-request");
    if (req) requestRefund(req.dataset.id, req.dataset.amount);
    const approve = event.target.closest(".js-refund-approve");
    if (approve) approveRefund(approve.dataset.id);
    const complete = event.target.closest(".js-refund-complete");
    if (complete) completeRefund(complete.dataset.id);
  });
  document.addEventListener("input", function (event) {
    if (event.target && event.target.id === "payments-search") {
      activeSearch = event.target.value.trim().toLowerCase();
      renderPayments();
      const input = document.getElementById("payments-search");
      if (input) input.focus();
    }
  });
  document.addEventListener("DOMContentLoaded", boot);
})();
