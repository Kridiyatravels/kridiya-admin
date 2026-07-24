"use strict";
(function () {
  if (document.body.dataset.page !== "dashboard") return;
  let sb = null;

  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }
  function label(v) { return String(v || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }

  async function boot() {
    const gate = document.getElementById("dashboard-gate");
    const app = document.getElementById("dashboard-app");
    const user = await KridiyaAuth.currentUser();
    if (!user) { renderLoginForm(gate, boot); return; }
    sb = await KridiyaAuth.client();
    const staffCheck = await sb.rpc("is_staff");
    if (staffCheck.error || staffCheck.data !== true) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>You do not have access.</b><br>This dashboard is for Kridiya staff only.</p></div>';
      return;
    }
    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    await loadDashboard();
  }

  async function loadDashboard() {
    const result = await sb.rpc("staff_dashboard_summary");
    if (result.error) { toast("Could not load dashboard: " + result.error.message); return; }
    const d = result.data || {};
    const stats = [
      ["New enquiries today", d.enquiries_today || 0, "var(--status-checking)"],
      ["Open bookings", d.bookings_open || 0, "var(--status-quoted)"],
      ["Pending payments", d.payments_pending || 0, "var(--status-payment)"],
      ["Tasks due", d.tasks_due || 0, "var(--status-docs)"]
    ];
    document.getElementById("dashboard-stats").innerHTML = stats.map(function (s) {
      return '<div class="stat-tile" style="--tile-accent:' + s[2] + '"><div class="num">' + s[1] + '</div><div class="label">' + esc(s[0]) + '</div></div>';
    }).join("");

    const priority = [
      ["Open enquiries", d.enquiries_open || 0, "admin.html"],
      ["Pending supplier payments", d.supplier_payments_pending || 0, "payments.html"],
      ["Pending refunds", d.refunds_pending || 0, "payments.html"],
      ["Documents generated", d.documents_generated || 0, "documents.html"]
    ];
    document.getElementById("dashboard-priority").innerHTML = '<div class="ops-list">' + priority.map(function (p) {
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(p[0]) + '</b><p>' + p[1] + ' item(s)</p></div><a class="btn btn-outline" href="' + p[2] + '">Open</a></div>';
    }).join("") + '</div>';

    const activity = d.recent_activity || [];
    document.getElementById("dashboard-activity").innerHTML = activity.length ? '<div class="ops-list">' + activity.map(function (a) {
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(label(a.event_type)) + '</b><p>' + esc(a.entity_type || "system") + ' - ' + new Date(a.created_at).toLocaleString("en-GB") + '</p></div></div>';
    }).join("") + '</div>' : '<p class="form-note">No recent activity yet.</p>';
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
