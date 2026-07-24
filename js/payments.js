"use strict";
(function () {
  if (document.body.dataset.page !== "payments") return;
  let sb = null;
  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }
  function label(v) { return String(v || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function money(v, c) { return (c || "AED") + " " + Number(v || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

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
    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    await loadPayments();
  }

  async function loadPayments() {
    const result = await sb.rpc("list_operations_payments", { limit_count: 200 });
    if (result.error) { toast("Could not load payments: " + result.error.message); return; }
    const rows = result.data || [];
    const total = rows.filter(function (r) { return r.status === "received"; }).reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
    document.getElementById("payments-stats").innerHTML = '<div class="stat-tile"><div class="num">' + rows.length + '</div><div class="label">Payment records</div></div><div class="stat-tile"><div class="num">' + money(total, "AED") + '</div><div class="label">Received total</div></div><div class="stat-tile"><div class="num">' + rows.filter(function (r) { return r.status === "pending"; }).length + '</div><div class="label">Pending</div></div><div class="stat-tile"><div class="num">' + rows.filter(function (r) { return r.status === "proof_received"; }).length + '</div><div class="label">Proof received</div></div>';
    document.getElementById("payments-count").textContent = rows.length + " payment(s)";
    document.getElementById("payments-list").innerHTML = rows.length ? '<div class="ops-list">' + rows.map(function (p) {
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(p.payment_reference || "Payment") + '</b><p>' + esc(label(p.method)) + ' - ' + esc(label(p.status)) + '</p></div><div class="ops-row-actions"><span class="finance-value">' + esc(money(p.amount, p.currency)) + '</span></div></div>';
    }).join("") + '</div>' : '<p class="form-note">No payment records yet. Payments can be connected to bookings as bookings start.</p>';
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
