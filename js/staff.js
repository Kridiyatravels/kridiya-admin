"use strict";
(function () {
  if (document.body.dataset.page !== "staff") return;
  let sb = null;
  let myId = null;

  async function callAdminEdge(name, body) {
    const session = await sb.auth.getSession();
    const token = session.data.session && session.data.session.access_token;
    if (!token) throw new Error("Your session expired — please log in again.");
    const resp = await fetch(SUPABASE_URL + "/functions/v1/" + name, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Request failed");
    return data;
  }
  const PERMS = [
    "view_enquiries", "edit_enquiries", "view_customers", "edit_customers", "view_corporates", "edit_corporates",
    "create_bookings", "edit_bookings", "view_payments", "edit_payments", "view_supplier_cost", "view_profit",
    "generate_documents", "manage_portals", "manage_templates", "view_reports", "export_reports", "approve_refunds",
    "approve_discounts", "manage_staff", "view_activity", "manage_settings"
  ];
  const PERM_GROUPS = [
    { title: "Sales & CRM", names: ["view_enquiries", "edit_enquiries", "view_customers", "edit_customers", "view_corporates", "edit_corporates"] },
    { title: "Bookings & Documents", names: ["create_bookings", "edit_bookings", "generate_documents", "manage_templates"] },
    { title: "Finance", names: ["view_payments", "edit_payments", "view_supplier_cost", "view_profit", "approve_refunds", "approve_discounts"] },
    { title: "Admin & Security", names: ["manage_portals", "view_reports", "export_reports", "manage_staff", "view_activity", "manage_settings"] }
  ];
  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }
  function label(v) { return String(v || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function whenText(v) { return v ? new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "No activity"; }
  function num(v) { return Number(v || 0); }
  function permissionCount(p) { return PERMS.filter(function (name) { return !!p[name]; }).length; }
  function riskLevel(staff, monitor, perms) {
    if (!staff.active) return { label: "Inactive", tone: "muted" };
    if (perms.manage_staff || perms.manage_settings || perms.export_reports) return { label: "High access", tone: "risk" };
    if (perms.view_profit || perms.edit_payments || perms.approve_refunds) return { label: "Finance access", tone: "warn" };
    if (monitor && !monitor.last_activity_at) return { label: "No activity", tone: "warn" };
    return { label: "Standard", tone: "ok" };
  }
  function renderPermissionGroups(p) {
    return PERM_GROUPS.map(function (group) {
      return '<details class="perm-control-group"><summary><b>' + esc(group.title) + '</b><span>' + esc(group.names.filter(function (name) { return p[name]; }).length) + '/' + esc(group.names.length) + '</span></summary><div class="permission-grid">' + group.names.map(function (name) {
        return '<label><input type="checkbox" data-perm="' + esc(name) + '" ' + (p[name] ? 'checked' : '') + '> ' + esc(label(name)) + '</label>';
      }).join("") + '</div></details>';
    }).join("");
  }

  async function boot() {
    const gate = document.getElementById("staff-gate");
    const app = document.getElementById("staff-app");
    const user = await KridiyaAuth.currentUser();
    if (!user) { renderLoginForm(gate, boot); return; }
    myId = user.id;
    sb = await KridiyaAuth.client();
    const admin = await sb.rpc("is_admin");
    if (admin.error || admin.data !== true) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>Owner/admin access required.</b><br>Only admin can manage staff permissions.</p><a class="btn btn-primary" href="dashboard.html">Back to dashboard</a></div>';
      return;
    }
    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    wireStaffForms();
    await loadStaff();
    await loadMonitoring();
  }

  function wireStaffForms() {
    const createForm = document.getElementById("create-staff-form");
    createForm.addEventListener("submit", async function () {
      const name = document.getElementById("new-staff-name").value.trim();
      const department = document.getElementById("new-staff-dept").value.trim();
      const email = document.getElementById("new-staff-email").value.trim();
      const role = document.getElementById("new-staff-role").value;
      if (!name || !email) return;
      const btn = this.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = "Creating…";
      const resultBox = document.getElementById("new-staff-result");
      try {
        const data = await callAdminEdge("create-staff-account", { full_name: name, department: department, email: email, role: role });
        resultBox.hidden = false;
        resultBox.innerHTML = "Account created for <b>" + esc(name) + "</b>. Their PIN is <b style=\"font-size:1.2rem;letter-spacing:0.1em\">" + esc(data.pin) + "</b> — give it to them now, it won't be shown again.";
        document.getElementById("new-staff-name").value = "";
        document.getElementById("new-staff-dept").value = "";
        document.getElementById("new-staff-email").value = "";
        await loadStaff();
      } catch (err) {
        toast("Could not create account: " + err.message);
      }
      btn.disabled = false;
      btn.textContent = "Create account";
    });

    const grantForm = document.getElementById("grant-staff-form");
    grantForm.addEventListener("submit", async function () {
      const email = document.getElementById("grant-email").value.trim();
      const role = document.getElementById("grant-role").value;
      if (!email) return;
      const btn = this.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const result = await sb.rpc("grant_staff_by_email", { target_email: email, target_role: role });
        if (result.error) throw result.error;
        if (result.data === "not_found") {
          toast(email + " needs to register an account on kridiyatravel.com first, then try again.");
        } else {
          await logActivity(sb, myId, "staff.granted", "user", null, { email: email, role: role });
          toast(email + " now has " + role + " access.");
          document.getElementById("grant-email").value = "";
          await loadStaff();
        }
      } catch (err) {
        toast("Could not grant access: " + err.message);
      }
      btn.disabled = false;
    });
  }

  async function loadStaff() {
    const staffResult = await sb.rpc("list_staff");
    const permResult = await sb.from("staff_permissions").select("*");
    if (staffResult.error || permResult.error) { toast("Could not load staff permissions."); return; }
    const perms = {};
    (permResult.data || []).forEach(function (p) { perms[p.user_id] = p; });
    const rows = staffResult.data || [];
    renderStaffStats(rows, [], perms);
    document.getElementById("staff-control-list").innerHTML = rows.map(function (s) {
      const p = perms[s.user_id] || {};
      const risk = riskLevel(s, null, p);
      return '<div class="ops-row staff-control-row" data-user-id="' + esc(s.user_id) + '"><div class="ops-row-main"><div class="staff-person-head"><div><b>' + esc(s.full_name || s.email) + '</b><p>' + esc(s.email) + ' - ' + esc(label(s.role)) + ' - ' + esc(s.department || "No department") + '</p></div><span class="staff-risk ' + esc(risk.tone) + '">' + esc(risk.label) + '</span></div><div class="ops-kv"><span class="ops-chip">' + esc(s.active ? "Active" : "Inactive") + '</span><span class="ops-chip">' + esc(permissionCount(p)) + ' permission(s)</span><span class="ops-chip">PIN reset only - no stored visible PIN</span></div><div class="perm-control-stack">' + renderPermissionGroups(p) + '</div></div><div class="ops-row-actions"><button type="button" class="btn btn-primary save-perms">Save</button><button type="button" class="btn btn-outline reset-pin">Reset PIN</button>' + (s.user_id === myId ? '' : '<button type="button" class="btn btn-outline revoke-staff">Remove</button>') + '</div></div>';
    }).join("") || '<p class="form-note">No staff found.</p>';
  }

  function renderStaffStats(staffRows, monitoringRows, perms) {
    const active = staffRows.filter(function (s) { return s.active; }).length;
    const admins = staffRows.filter(function (s) { return String(s.role) === "admin" || String(s.role) === "owner"; }).length;
    const highAccess = staffRows.filter(function (s) {
      const p = perms[s.user_id] || {};
      return p.manage_staff || p.manage_settings || p.export_reports || p.view_profit;
    }).length;
    const openTasks = (monitoringRows || []).reduce(function (sum, r) { return sum + num(r.tasks_open); }, 0);
    document.getElementById("staff-stats").innerHTML =
      '<div class="stat-tile"><div class="num">' + esc(staffRows.length) + '</div><div class="label">Total staff</div></div>' +
      '<div class="stat-tile"><div class="num">' + esc(active) + '</div><div class="label">Active</div></div>' +
      '<div class="stat-tile"><div class="num">' + esc(admins) + '</div><div class="label">Admin/owner</div></div>' +
      '<div class="stat-tile"><div class="num">' + esc(highAccess) + '</div><div class="label">High access</div></div>' +
      '<div class="stat-tile"><div class="num">' + esc(openTasks) + '</div><div class="label">Open staff tasks</div></div>';
  }

  async function loadMonitoring() {
    const box = document.getElementById("staff-monitoring-list");
    const result = await sb.rpc("staff_monitoring_summary", { days_back: 30 });
    if (result.error) {
      box.innerHTML = '<p class="form-note">Could not load monitoring: ' + esc(result.error.message) + '</p>';
      return;
    }
    const rows = result.data || [];
    const staffResult = await sb.rpc("list_staff");
    const permResult = await sb.from("staff_permissions").select("*");
    const perms = {};
    (permResult.data || []).forEach(function (p) { perms[p.user_id] = p; });
    if (!staffResult.error && !permResult.error) renderStaffStats(staffResult.data || [], rows, perms);
    if (!rows.length) {
      box.innerHTML = '<p class="form-note">No staff activity found yet.</p>';
      return;
    }
    box.innerHTML = '<div class="ops-list">' + rows.map(function (r) {
      const p = perms[r.user_id] || {};
      const risk = riskLevel(r, r, p);
      return '<div class="ops-row staff-monitor-row"><div class="ops-row-main"><div class="staff-person-head"><div><b>' + esc(r.full_name || r.email) + '</b><p>' + esc(r.email || "No email") + ' - ' + esc(label(r.role)) + ' - Last: ' + esc(whenText(r.last_activity_at)) + '</p></div><span class="staff-risk ' + esc(risk.tone) + '">' + esc(risk.label) + '</span></div><div class="staff-work-grid"><span><b>' + esc(r.bookings_created) + '</b>Bookings</span><span><b>' + esc(r.tasks_open) + '</b>Open tasks</span><span><b>' + esc(r.tasks_completed) + '</b>Done tasks</span><span><b>' + esc(r.payments_recorded) + '</b>Payments</span><span><b>' + esc(r.documents_recorded) + '</b>Documents</span><span><b>' + esc(r.activity_events) + '</b>Activity</span></div></div><div class="ops-row-actions"><span class="ops-chip">' + esc(r.active ? "Active" : "Inactive") + '</span></div></div>';
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
        const data = await callAdminEdge("reset-staff-pin", { user_id: userId });
        toast("New PIN: " + data.pin + " — give it to them now, it won't be shown again.");
      } catch (err) { toast(err.message); }
    }
    if (e.target.closest(".revoke-staff")) {
      const revokeBtn = e.target.closest(".revoke-staff");
      const name = row.querySelector(".ops-row-main b") ? row.querySelector(".ops-row-main b").textContent : "this person";
      if (!confirm("Remove access for " + name + "? They will no longer be able to sign in to Staff Tools.")) return;
      revokeBtn.disabled = true;
      try {
        const result = await sb.rpc("revoke_staff", { target_user_id: userId });
        if (result.error) throw result.error;
        await logActivity(sb, myId, "staff.revoked", "user", userId, {});
        toast("Access removed.");
        await loadStaff();
      } catch (err) {
        toast("Could not remove access: " + err.message);
        revokeBtn.disabled = false;
      }
    }
  });

  document.addEventListener("DOMContentLoaded", boot);
})();
