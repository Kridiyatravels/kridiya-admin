/* ============================================================
   Kridiya Staff Tools - My Profile
   Shows the signed-in person's own account, role and permissions.
   Reads only their own rows (staff_profiles / staff_permissions
   allow self-read), so this works for owners, admins and staff
   without any elevated access.
   ============================================================ */
"use strict";
(function () {
  if (document.body.dataset.page !== "profile") return;
  let sb = null;

  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }

  /* Friendly names, grouped the way staff think about the work. */
  const PERM_GROUPS = [
    ["Enquiries & customers", [
      ["view_enquiries", "See enquiries"], ["edit_enquiries", "Manage enquiries"],
      ["view_customers", "See customers"], ["edit_customers", "Manage customers"]
    ]],
    ["Bookings", [
      ["create_bookings", "Create bookings"], ["edit_bookings", "Edit bookings"],
      ["generate_documents", "Generate documents"]
    ]],
    ["Money", [
      ["view_payments", "See payments"], ["edit_payments", "Record payments"],
      ["view_supplier_cost", "See supplier cost"], ["view_profit", "See profit"],
      ["approve_refunds", "Approve refunds"], ["approve_discounts", "Approve discounts"]
    ]],
    ["Corporate & suppliers", [
      ["view_corporates", "See corporate accounts"], ["edit_corporates", "Manage corporate accounts"],
      ["manage_portals", "Manage B2B portals"]
    ]],
    ["Reports & admin", [
      ["view_reports", "See reports"], ["export_reports", "Export reports"],
      ["manage_templates", "Manage templates"], ["view_activity", "See activity log"],
      ["manage_staff", "Manage staff"], ["manage_settings", "Manage settings"]
    ]]
  ];

  function initials(name, email) {
    const src = String(name || email || "?").trim();
    const parts = src.split(/\s+/).filter(Boolean);
    return (parts.length >= 2 ? parts[0][0] + parts[1][0] : src.slice(0, 2)).toUpperCase();
  }

  function fmtDate(v) {
    return v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—";
  }

  async function boot() {
    const gate = document.getElementById("profile-gate");
    const app = document.getElementById("profile-app");
    const user = await KridiyaAuth.currentUser();
    if (!user) { renderLoginForm(gate, boot); return; }
    sb = await KridiyaAuth.client();

    const staffCheck = await sb.rpc("is_staff");
    if (staffCheck.error || staffCheck.data !== true) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>You do not have access.</b><br>This area is for Kridiya staff only.</p></div>';
      return;
    }
    showStaffNav();
    gate.hidden = true;
    app.hidden = false;

    const adminRes = await sb.rpc("is_admin");
    const isAdmin = adminRes.data === true;
    const profRes = await sb.from("staff_profiles").select("full_name, department, active, created_at").eq("user_id", user.id).maybeSingle();
    const [permRes, prefRes] = await Promise.all([
      sb.from("staff_permissions").select("*").eq("user_id", user.id).maybeSingle(),
      sb.from("staff_notification_preferences").select("*").eq("user_id", user.id).maybeSingle()
    ]);
    const prof = profRes.data || {};
    const perms = permRes.data || {};

    renderIdentity(user, prof, isAdmin);
    renderAccount(user, prof, isAdmin);
    renderSecurity();
    renderPermissions(perms, isAdmin);
    renderNotificationPreferences(user.id, prefRes.data || {});
  }

  function renderIdentity(user, prof, isAdmin) {
    const name = prof.full_name || user.email || "Staff member";
    const roleLabel = isAdmin ? "Owner / Admin" : "Staff";
    const meta = [roleLabel];
    if (prof.department) meta.push(prof.department);
    document.getElementById("profile-identity").innerHTML =
      '<div class="account-main profile-card">' +
        '<div class="profile-id">' +
          '<div class="profile-avatar" aria-hidden="true">' + esc(initials(prof.full_name, user.email)) + "</div>" +
          '<div class="profile-meta"><h2>' + esc(name) + "</h2><p>" + esc(meta.join(" · ")) + "</p></div>" +
          '<span class="profile-role-badge' + (isAdmin ? " is-admin" : "") + '">' + esc(roleLabel) + "</span>" +
        "</div>" +
      "</div>";
  }

  function renderAccount(user, prof, isAdmin) {
    const rows = [
      ["Full name", prof.full_name || "Not set"],
      ["Email", user.email || "—"],
      ["Role", isAdmin ? "Owner / Admin" : "Staff"],
      ["Department", prof.department || "—"],
      ["Account status", prof.active === false ? "Inactive" : "Active"],
      ["Staff since", fmtDate(prof.created_at)]
    ];
    document.getElementById("profile-account").innerHTML =
      '<div class="profile-rows">' + rows.map(function (r) {
        return '<div class="profile-row"><span class="profile-row-k">' + esc(r[0]) + '</span><span class="profile-row-v">' + esc(r[1]) + "</span></div>";
      }).join("") + "</div>" +
      '<p class="form-note" style="margin-top:0.8rem">Name, department and access are managed by an owner/admin on the Staff page.</p>';
  }

  function renderSecurity() {
    document.getElementById("profile-security").innerHTML =
      '<div class="profile-rows">' +
        '<div class="profile-row"><span class="profile-row-k">Password</span><span class="profile-row-v">Set on the main site</span></div>' +
        '<div class="profile-row"><span class="profile-row-k">Staff PIN</span><span class="profile-row-v">Reset by an admin</span></div>' +
      "</div>" +
      '<div class="quick-actions" style="margin-top:0.9rem">' +
        '<a class="btn btn-outline" target="_blank" rel="noopener" href="https://kridiyatravel.com/forgot-password.html">Change password</a>' +
        '<button type="button" class="btn btn-outline" id="profile-logout">Log out</button>' +
      "</div>" +
      '<p class="form-note" style="margin-top:0.8rem">Never share your PIN or password. Anyone with access to your email can reset your sign-in.</p>';
    const btn = document.getElementById("profile-logout");
    if (btn) {
      btn.addEventListener("click", async function () {
        try {
          const user = await KridiyaAuth.currentUser();
          if (user) await logActivity(sb, "auth.logout", "user", user.id, {});
        } catch (e) { /* best-effort */ }
        await KridiyaAuth.logout();
        location.href = "dashboard.html";
      });
    }
  }

  function renderPermissions(perms, isAdmin) {
    const box = document.getElementById("profile-permissions");
    if (isAdmin) {
      box.innerHTML = '<p class="profile-note"><b>Full access.</b> As owner/admin you can see and manage everything, including staff permissions, payments, profit and backups.</p>';
      return;
    }
    const allowedCount = PERM_GROUPS.reduce(function (n, g) {
      return n + g[1].filter(function (p) { return perms[p[0]]; }).length;
    }, 0);
    if (!allowedCount) {
      box.innerHTML = '<p class="profile-note">No features assigned yet. Ask your admin to set your access on the Staff page.</p>';
      return;
    }
    box.innerHTML = PERM_GROUPS.map(function (g) {
      const items = g[1].map(function (p) {
        const on = Boolean(perms[p[0]]);
        return '<div class="perm-item' + (on ? " on" : "") + '"><span class="perm-dot" aria-hidden="true"></span>' + esc(p[1]) + "</div>";
      }).join("");
      return '<div class="perm-group"><h3>' + esc(g[0]) + "</h3><div class=\"perm-list\">" + items + "</div></div>";
    }).join("");
  }

  function renderNotificationPreferences(userId, prefs) {
    const box = document.getElementById("profile-notifications");
    if (!box) return;
    const days = [{ n:1,l:"Mon" },{ n:2,l:"Tue" },{ n:3,l:"Wed" },{ n:4,l:"Thu" },{ n:5,l:"Fri" },{ n:6,l:"Sat" },{ n:0,l:"Sun" }];
    const activeDays = Array.isArray(prefs.working_days) ? prefs.working_days : [1,2,3,4,5,6];
    const timeValue = function (value, fallback) { return String(value || fallback).slice(0,5); };
    const checked = function (key, fallback) { return (prefs[key] == null ? fallback : prefs[key]) ? " checked" : ""; };
    box.innerHTML = '<form id="profile-notification-form" class="preference-form">' +
      '<div class="preference-grid">' +
        '<label class="preference-toggle"><input type="checkbox" name="in_app_enabled"' + checked("in_app_enabled", true) + '><span><b>In-app notifications</b><small>Show the notification centre and operational alerts.</small></span></label>' +
        '<label class="preference-toggle"><input type="checkbox" name="email_new_enquiry"' + checked("email_new_enquiry", true) + '><span><b>New enquiry emails</b><small>Email me when a new enquiry needs attention.</small></span></label>' +
        '<label class="preference-toggle"><input type="checkbox" name="email_assignment"' + checked("email_assignment", true) + '><span><b>Assignment emails</b><small>Email me when work is assigned to me.</small></span></label>' +
        '<label class="preference-toggle"><input type="checkbox" name="email_sla_escalation"' + checked("email_sla_escalation", true) + '><span><b>SLA escalation emails</b><small>Notify me about overdue operational commitments.</small></span></label>' +
        '<label class="preference-toggle"><input type="checkbox" name="email_daily_digest"' + checked("email_daily_digest", true) + '><span><b>Daily summary</b><small>Receive the daily work summary when enabled.</small></span></label>' +
        '<label class="preference-toggle"><input type="checkbox" name="email_overdue_digest"' + checked("email_overdue_digest", true) + '><span><b>Overdue summary</b><small>Receive a digest of overdue tasks.</small></span></label>' +
      '</div>' +
      '<div class="working-hours-grid"><label><span>Workday starts</span><input type="time" name="workday_start" value="' + esc(timeValue(prefs.workday_start,"09:00")) + '"></label><label><span>Workday ends</span><input type="time" name="workday_end" value="' + esc(timeValue(prefs.workday_end,"18:00")) + '"></label><label><span>Timezone</span><select name="timezone"><option value="Asia/Dubai">Asia/Dubai (UAE)</option></select></label></div>' +
      '<fieldset class="working-days"><legend>Working days</legend>' + days.map(function (day) { return '<label><input type="checkbox" name="working_day" value="' + day.n + '"' + (activeDays.indexOf(day.n) !== -1 ? " checked" : "") + '><span>' + day.l + '</span></label>'; }).join("") + '</fieldset>' +
      '<button type="submit" class="btn btn-primary">Save preferences</button>' +
    '</form>';
    const form = document.getElementById("profile-notification-form");
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      const workingDays = Array.from(form.querySelectorAll('input[name="working_day"]:checked')).map(function (input) { return Number(input.value); });
      if (!workingDays.length) { toast("Select at least one working day."); return; }
      if (form.workday_start.value >= form.workday_end.value) { toast("Workday end must be later than the start."); return; }
      const payload = {
        user_id: userId,
        in_app_enabled: form.in_app_enabled.checked,
        email_new_enquiry: form.email_new_enquiry.checked,
        email_assignment: form.email_assignment.checked,
        email_sla_escalation: form.email_sla_escalation.checked,
        email_daily_digest: form.email_daily_digest.checked,
        email_overdue_digest: form.email_overdue_digest.checked,
        workday_start: form.workday_start.value,
        workday_end: form.workday_end.value,
        working_days: workingDays,
        timezone: form.timezone.value,
        updated_at: new Date().toISOString()
      };
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      const result = await sb.from("staff_notification_preferences").upsert(payload, { onConflict: "user_id" });
      button.disabled = false;
      if (result.error) { toast("Could not save preferences: " + result.error.message); return; }
      toast("Notification preferences saved.");
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
