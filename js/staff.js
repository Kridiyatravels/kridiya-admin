"use strict";
(function () {
  if (document.body.dataset.page !== "staff") return;
  let sb = null;
  let myId = null;
  let advancedStaffBackendReady = true;

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
  function roleValue(v) {
    const role = String(v || "staff").toLowerCase();
    return ["owner", "admin", "staff", "support"].indexOf(role) >= 0 ? role : "staff";
  }
  function bool(v) { return v === true || v === "true"; }
  function val(row, selector) {
    const el = row.querySelector(selector);
    return el ? el.value.trim() : "";
  }
  function permissionCount(p) { return PERMS.filter(function (name) { return !!p[name]; }).length; }
  function daysSince(v) {
    const d = v ? new Date(v) : null;
    if (!d || isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / 864e5);
  }
  function sensitivePermissions(p) {
    return [
      ["manage_staff", "Manage staff"],
      ["manage_settings", "Settings"],
      ["edit_payments", "Edit payments"],
      ["approve_refunds", "Approve refunds"],
      ["view_profit", "Profit"],
      ["export_reports", "Export reports"]
    ].filter(function (x) { return !!p[x[0]]; });
  }
  function riskLevel(staff, monitor, perms) {
    if (!staff.active) return { label: "Inactive", tone: "muted" };
    if (perms.manage_staff || perms.manage_settings || perms.export_reports) return { label: "High access", tone: "risk" };
    if (perms.view_profit || perms.edit_payments || perms.approve_refunds) return { label: "Finance access", tone: "warn" };
    if (monitor && !monitor.last_activity_at) return { label: "No activity", tone: "warn" };
    if (monitor && daysSince(monitor.last_activity_at) >= 14) return { label: "Stale login", tone: "warn" };
    return { label: "Standard", tone: "ok" };
  }
  function securityIssues(staffRows, monitoringRows, perms) {
    const monitorByUser = {};
    (monitoringRows || []).forEach(function (r) { monitorByUser[r.user_id] = r; });
    const activeRows = staffRows.filter(function (s) { return s.active; });
    const highAccess = activeRows.filter(function (s) {
      const p = perms[s.user_id] || {};
      return sensitivePermissions(p).length > 0 || String(s.role) === "admin" || String(s.role) === "owner";
    });
    const stale = activeRows.filter(function (s) {
      const m = monitorByUser[s.user_id];
      return !m || !m.last_activity_at || daysSince(m.last_activity_at) >= 14;
    });
    const broad = activeRows.filter(function (s) { return permissionCount(perms[s.user_id] || {}) >= 12; });
    const inactive = staffRows.filter(function (s) { return !s.active; });
    const adminCount = staffRows.filter(function (s) { return s.active && (String(s.role) === "admin" || String(s.role) === "owner"); }).length;
    return { activeRows: activeRows, highAccess: highAccess, stale: stale, broad: broad, inactive: inactive, adminCount: adminCount };
  }
  function staffName(s) { return s.full_name || s.email || "Staff member"; }
  function normalizePerms(row) {
    const p = {};
    PERMS.forEach(function (name) { p[name] = !!(row && row[name]); });
    return p;
  }
  function profileValue(v, fallback) { return v == null || v === "" ? (fallback || "") : v; }
  async function loadStaffProfiles() {
    const rich = await sb.rpc("get_staff_management_profiles");
    if (!rich.error) {
      advancedStaffBackendReady = true;
      return rich.data || [];
    }
    advancedStaffBackendReady = false;
    const staffResult = await sb.rpc("list_staff");
    if (staffResult.error) throw new Error("Could not load staff list.");
    const permResult = await sb.from("staff_permissions").select("*");
    const perms = {};
    if (!permResult.error) {
      (permResult.data || []).forEach(function (p) { perms[p.user_id] = normalizePerms(p); });
    }
    return (staffResult.data || []).map(function (s) {
      return Object.assign({}, s, {
        job_title: "",
        phone: "",
        notes: "",
        hold_until: null,
        hold_reason: "",
        permissions: perms[s.user_id] || {}
      });
    });
  }
  function renderPeople(list, emptyText) {
    if (!list.length) return '<p class="form-note">' + esc(emptyText) + '</p>';
    return list.slice(0, 5).map(function (s) {
      return '<span class="security-person">' + esc(staffName(s)) + '</span>';
    }).join("");
  }
  function renderSecurityPanel(staffRows, monitoringRows, perms) {
    const panel = document.getElementById("staff-security-panel");
    if (!panel) return;
    const issues = securityIssues(staffRows || [], monitoringRows || [], perms || {});
    const openFindings = issues.highAccess.length + issues.stale.length + issues.broad.length;
    const tone = openFindings ? (issues.highAccess.length || issues.broad.length ? "risk" : "warn") : "ok";
    const next = issues.highAccess.length
      ? "Review high-access staff and confirm they still need sensitive permissions."
      : issues.stale.length
        ? "Reset PINs or remove access for stale active accounts."
        : issues.broad.length
          ? "Reduce broad permission sets to the minimum needed for each role."
          : "Security posture looks clean. Keep monthly owner review.";
    panel.innerHTML =
      '<div class="security-summary security-' + esc(tone) + '"><div><b>' + esc(openFindings ? openFindings + " finding(s)" : "Clean") + '</b><span>' + esc(next) + '</span></div><a class="btn btn-primary" href="activity.html">Review audit log</a></div>' +
      '<div class="security-grid">' +
        '<div><b>' + esc(issues.adminCount) + '</b><span>Owner/admin accounts</span></div>' +
        '<div><b>' + esc(issues.highAccess.length) + '</b><span>Sensitive access</span></div>' +
        '<div><b>' + esc(issues.stale.length) + '</b><span>Stale active accounts</span></div>' +
        '<div><b>' + esc(issues.broad.length) + '</b><span>Broad permissions</span></div>' +
      '</div>' +
      '<div class="security-review-list">' +
        '<section><h3>Sensitive access</h3>' + renderPeople(issues.highAccess, "No active high-access staff found.") + '</section>' +
        '<section><h3>Stale accounts</h3>' + renderPeople(issues.stale, "No stale active accounts found.") + '</section>' +
        '<section><h3>Owner checklist</h3><p class="form-note">Monthly: confirm active staff, reset PIN after role changes, remove departed staff, review finance permissions, and scan the activity log for unusual payment, refund, settings, or staff changes.</p></section>' +
      '</div>';
  }
  function renderPermissionGroups(p) {
    p = normalizePerms(p);
    return PERM_GROUPS.map(function (group) {
      return '<details class="perm-control-group"><summary><b>' + esc(group.title) + '</b><span>' + esc(group.names.filter(function (name) { return p[name]; }).length) + '/' + esc(group.names.length) + '</span></summary><div class="permission-grid">' + group.names.map(function (name) {
        return '<label><input type="checkbox" data-perm="' + esc(name) + '" ' + (p[name] ? 'checked' : '') + '> ' + esc(label(name)) + '</label>';
      }).join("") + '</div></details>';
    }).join("");
  }
  function renderRoleOptions(current) {
    return ["owner", "admin", "staff", "support"].map(function (role) {
      return '<option value="' + esc(role) + '" ' + (roleValue(current) === role ? "selected" : "") + ">" + esc(label(role)) + "</option>";
    }).join("");
  }
  function renderStaffControlRow(s) {
    const p = normalizePerms(s.permissions || s);
    const risk = riskLevel(s, null, p);
    const holdUntil = s.hold_until ? new Date(s.hold_until).toISOString().slice(0, 16) : "";
    const isHeld = s.hold_until && new Date(s.hold_until).getTime() > Date.now();
    const state = !s.active ? "Inactive" : (isHeld ? "On hold" : "Active");
    return '<details class="staff-profile-card ops-row staff-control-row" data-user-id="' + esc(s.user_id) + '">' +
      '<summary class="staff-profile-summary">' +
        '<div class="staff-profile-id"><span class="staff-initial">' + esc(staffName(s).slice(0, 2).toUpperCase()) + '</span><div><b>' + esc(staffName(s)) + '</b><p>' + esc(s.email || "No email") + ' - ' + esc(label(s.role)) + ' - ' + esc(profileValue(s.department, "No department")) + '</p></div></div>' +
        '<div class="staff-profile-status"><span class="staff-risk ' + esc(risk.tone) + '">' + esc(risk.label) + '</span><span class="ops-chip">' + esc(state) + '</span></div>' +
      '</summary>' +
      '<div class="staff-profile-body">' +
        '<div class="staff-profile-grid">' +
          '<label class="field"><span>FULL NAME</span><input class="profile-full-name" value="' + esc(profileValue(s.full_name, s.email)) + '"></label>' +
          '<label class="field"><span>JOB TITLE</span><input class="profile-job-title" value="' + esc(profileValue(s.job_title, "")) + '" placeholder="e.g. Visa consultant"></label>' +
          '<label class="field"><span>DEPARTMENT</span><input class="profile-department" value="' + esc(profileValue(s.department, "")) + '" placeholder="e.g. Flights, Visa"></label>' +
          '<label class="field"><span>PHONE / WHATSAPP</span><input class="profile-phone" value="' + esc(profileValue(s.phone, "")) + '" placeholder="+971 ..."></label>' +
          '<label class="field"><span>ROLE</span><select class="profile-role">' + renderRoleOptions(s.role) + '</select></label>' +
          '<label class="field"><span>STATUS</span><select class="profile-active"><option value="true" ' + (s.active ? "selected" : "") + '>Active</option><option value="false" ' + (!s.active ? "selected" : "") + '>Inactive</option></select></label>' +
          '<label class="field"><span>HOLD UNTIL</span><input class="profile-hold-until" type="datetime-local" value="' + esc(holdUntil) + '"></label>' +
          '<label class="field staff-profile-wide"><span>HOLD / ADMIN NOTES</span><textarea class="profile-notes" rows="3" placeholder="Reason for hold, handover note, access review note">' + esc(profileValue(s.hold_reason || s.notes, "")) + '</textarea></label>' +
        '</div>' +
        '<div class="ops-kv staff-profile-meta"><span class="ops-chip">' + esc(permissionCount(p)) + ' permission(s)</span><span class="ops-chip">Created ' + esc(whenText(s.created_at)) + '</span><span class="ops-chip">PIN reset only - no stored visible PIN</span></div>' +
        '<div class="perm-control-stack">' + renderPermissionGroups(p) + '</div>' +
        '<div class="ops-row-actions staff-profile-actions">' +
          '<button type="button" class="btn btn-primary save-profile">Save profile</button>' +
          '<button type="button" class="btn btn-primary save-perms">Save permissions</button>' +
          '<button type="button" class="btn btn-outline reset-pin">Reset PIN</button>' +
          (s.user_id === myId ? '' : '<button type="button" class="btn btn-outline hold-staff">Hold</button><button type="button" class="btn btn-outline reactivate-staff">Reactivate</button><button type="button" class="btn btn-outline revoke-staff">Remove access</button><button type="button" class="btn btn-outline delete-staff">Delete profile</button>') +
        '</div>' +
      '</div>' +
    '</details>';
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
    let rows = [];
    try {
      rows = await loadStaffProfiles();
    } catch (err) {
      toast(err.message || "Could not load staff permissions.");
      return;
    }
    const perms = {};
    rows.forEach(function (s) { perms[s.user_id] = normalizePerms(s.permissions || s); });
    renderStaffStats(rows, [], perms);
    renderSecurityPanel(rows, [], perms);
    const backendNote = advancedStaffBackendReady ? "" : '<div class="form-banner warn staff-backend-note" role="status"><b>Advanced staff backend pending.</b> Run <code>db-staff-profile-management.sql</code> in Supabase to enable profile save, hold, reactivate, delete profile, and audited permission updates. Existing staff are still shown below.</div>';
    document.getElementById("staff-control-list").innerHTML = backendNote + (rows.map(renderStaffControlRow).join("") || '<p class="form-note">No staff found.</p>');
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
    if (!staffResult.error && !permResult.error) {
      renderStaffStats(staffResult.data || [], rows, perms);
      renderSecurityPanel(staffResult.data || [], rows, perms);
    }
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
      const result = await sb.rpc("update_staff_permissions", { target_user_id: userId, permissions: update });
      if (result.error) {
        const fallback = await sb.from("staff_permissions").upsert(Object.assign({ user_id: userId }, update), { onConflict: "user_id" });
        if (fallback.error) { toast("Could not save permissions: " + result.error.message); return; }
        await logActivity(sb, (await KridiyaAuth.currentUser()).id, "staff.permissions_updated", "user", userId, {});
      }
      toast("Permissions saved.");
      await loadStaff();
      await loadMonitoring();
    }
    if (e.target.closest(".save-profile")) {
      const body = {
        target_user_id: userId,
        full_name: val(row, ".profile-full-name"),
        department: val(row, ".profile-department"),
        job_title: val(row, ".profile-job-title"),
        phone: val(row, ".profile-phone"),
        role: roleValue(val(row, ".profile-role")),
        active: bool(val(row, ".profile-active")),
        notes: val(row, ".profile-notes"),
        hold_until: val(row, ".profile-hold-until") || null
      };
      if (!body.full_name) { toast("Enter the staff member's full name."); return; }
      const result = await sb.rpc("update_staff_profile", body);
      if (result.error) { toast("Could not save profile: " + result.error.message); return; }
      toast("Staff profile saved.");
      await loadStaff();
      await loadMonitoring();
    }
    if (e.target.closest(".reset-pin")) {
      try {
        const data = await callAdminEdge("reset-staff-pin", { user_id: userId });
        toast("New PIN: " + data.pin + " — give it to them now, it won't be shown again.");
      } catch (err) { toast(err.message); }
    }
    if (e.target.closest(".hold-staff")) {
      const holdUntil = val(row, ".profile-hold-until");
      const reason = val(row, ".profile-notes") || "Temporary staff hold";
      if (!holdUntil) { toast("Choose a hold-until date and time first."); return; }
      const result = await sb.rpc("hold_staff", { target_user_id: userId, hold_until: holdUntil, reason: reason });
      if (result.error) { toast("Could not hold staff: " + result.error.message); return; }
      toast("Staff access is on hold until the selected time.");
      await loadStaff();
      await loadMonitoring();
    }
    if (e.target.closest(".reactivate-staff")) {
      const result = await sb.rpc("reactivate_staff", { target_user_id: userId });
      if (result.error) { toast("Could not reactivate staff: " + result.error.message); return; }
      toast("Staff access reactivated.");
      await loadStaff();
      await loadMonitoring();
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
        await loadMonitoring();
      } catch (err) {
        toast("Could not remove access: " + err.message);
        revokeBtn.disabled = false;
      }
    }
    if (e.target.closest(".delete-staff")) {
      const name = row.querySelector(".staff-profile-id b") ? row.querySelector(".staff-profile-id b").textContent : "this staff profile";
      if (!confirm("Delete " + name + "'s staff profile and permission record? This keeps business audit history but removes staff-management records.")) return;
      const result = await sb.rpc("delete_staff_profile", { target_user_id: userId });
      if (result.error) { toast("Could not delete staff profile: " + result.error.message); return; }
      toast("Staff profile deleted.");
      await loadStaff();
      await loadMonitoring();
    }
  });

  document.addEventListener("DOMContentLoaded", boot);
})();
