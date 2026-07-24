"use strict";
(function () {
  if (document.body.dataset.page !== "staff") return;
  let sb = null;
  const PERMS = [
    "view_enquiries", "edit_enquiries", "view_customers", "edit_customers", "view_corporates", "edit_corporates",
    "create_bookings", "edit_bookings", "view_payments", "edit_payments", "view_supplier_cost", "view_profit",
    "generate_documents", "manage_portals", "manage_templates", "view_reports", "export_reports", "approve_refunds",
    "approve_discounts", "manage_staff", "view_activity", "manage_settings"
  ];
  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }
  function label(v) { return String(v || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function whenText(v) { return v ? new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "No activity"; }

  async function boot() {
    const gate = document.getElementById("staff-gate");
    const app = document.getElementById("staff-app");
    const user = await KridiyaAuth.currentUser();
    if (!user) { renderLoginForm(gate, boot); return; }
    sb = await KridiyaAuth.client();
    const admin = await sb.rpc("is_admin");
    if (admin.error || admin.data !== true) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>Owner/admin access required.</b><br>Only admin can manage staff permissions.</p><a class="btn btn-primary" href="dashboard.html">Back to dashboard</a></div>';
      return;
    }
    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    await loadStaff();
    await loadMonitoring();
  }

  async function loadStaff() {
    const staffResult = await sb.rpc("list_staff");
    const permResult = await sb.from("staff_permissions").select("*");
    if (staffResult.error || permResult.error) { toast("Could not load staff permissions."); return; }
    const perms = {};
    (permResult.data || []).forEach(function (p) { perms[p.user_id] = p; });
    const rows = staffResult.data || [];
    document.getElementById("staff-control-list").innerHTML = rows.map(function (s) {
      const p = perms[s.user_id] || {};
      return '<div class="ops-row" data-user-id="' + esc(s.user_id) + '"><div class="ops-row-main"><b>' + esc(s.full_name || s.email) + '</b><p>' + esc(s.email) + ' - ' + esc(label(s.role)) + ' - ' + (s.active ? 'Active' : 'Inactive') + '</p><div class="permission-grid">' + PERMS.map(function (name) {
        return '<label><input type="checkbox" data-perm="' + esc(name) + '" ' + (p[name] ? 'checked' : '') + '> ' + esc(label(name)) + '</label>';
      }).join("") + '</div></div><div class="ops-row-actions"><button type="button" class="btn btn-primary save-perms">Save</button><button type="button" class="btn btn-outline reset-pin">Reset PIN</button></div></div>';
    }).join("") || '<p class="form-note">No staff found.</p>';
  }

  async function loadMonitoring() {
    const box = document.getElementById("staff-monitoring-list");
    const result = await sb.rpc("staff_monitoring_summary", { days_back: 30 });
    if (result.error) {
      box.innerHTML = '<p class="form-note">Could not load monitoring: ' + esc(result.error.message) + '</p>';
      return;
    }
    const rows = result.data || [];
    if (!rows.length) {
      box.innerHTML = '<p class="form-note">No staff activity found yet.</p>';
      return;
    }
    box.innerHTML = '<div class="ops-list">' + rows.map(function (r) {
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(r.full_name || r.email) + '</b><p>' + esc(r.email || "No email") + ' - ' + esc(label(r.role)) + ' - Last: ' + esc(whenText(r.last_activity_at)) + '</p><div class="ops-kv"><span class="ops-chip">Bookings: ' + esc(r.bookings_created) + '</span><span class="ops-chip">Open tasks: ' + esc(r.tasks_open) + '</span><span class="ops-chip">Done tasks: ' + esc(r.tasks_completed) + '</span><span class="ops-chip">Payments: ' + esc(r.payments_recorded) + '</span><span class="ops-chip">Documents: ' + esc(r.documents_recorded) + '</span><span class="ops-chip">Activity: ' + esc(r.activity_events) + '</span></div></div><div class="ops-row-actions"><span class="ops-chip">' + esc(r.active ? "Active" : "Inactive") + '</span></div></div>';
    }).join("") + '</div>';
  }
  document.addEventListener("click", async function (e) {
    const row = e.target.closest(".ops-row[data-user-id]");
    if (!row) return;
    const userId = row.dataset.userId;
    if (e.target.closest(".save-perms")) {
      const update = {};
      row.querySelectorAll("input[data-perm]").forEach(function (box) { update[box.dataset.perm] = box.checked; });
      const result = await sb.from("staff_permissions").update(update).eq("user_id", userId);
      if (result.error) { toast("Could not save permissions: " + result.error.message); return; }
      await logActivity(sb, (await KridiyaAuth.currentUser()).id, "staff.permissions_updated", "user", userId, {});
      toast("Permissions saved.");
      await loadMonitoring();
    }
    if (e.target.closest(".reset-pin")) {
      try {
        const session = await sb.auth.getSession();
        const token = session.data.session && session.data.session.access_token;
        const resp = await fetch(SUPABASE_URL + "/functions/v1/reset-staff-pin", { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token }, body: JSON.stringify({ user_id: userId }) });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || "Could not reset PIN.");
        toast("New PIN: " + data.pin);
      } catch (err) { toast(err.message); }
    }
  });

  document.addEventListener("DOMContentLoaded", boot);
})();
