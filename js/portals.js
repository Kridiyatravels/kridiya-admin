"use strict";
(function () {
  if (document.body.dataset.page !== "portals") return;
  let sb = null;
  let canManage = false;
  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }

  async function boot() {
    const gate = document.getElementById("portals-gate");
    const app = document.getElementById("portals-app");
    const user = await KridiyaAuth.currentUser();
    if (!user) { renderLoginForm(gate, boot); return; }
    sb = await KridiyaAuth.client();
    const staffCheck = await sb.rpc("is_staff");
    if (staffCheck.error || staffCheck.data !== true) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>You do not have access.</b><br>B2B portals are for staff only.</p></div>';
      return;
    }
    const manage = await sb.rpc("has_staff_permission", { permission_name: "manage_portals" });
    canManage = !manage.error && manage.data === true;
    document.getElementById("portal-new-toggle").hidden = !canManage;
    document.getElementById("portal-new-toggle").addEventListener("click", function () {
      const card = document.getElementById("portal-form-card");
      card.hidden = !card.hidden;
    });
    document.getElementById("portal-form").addEventListener("submit", savePortal);
    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    await loadPortals();
  }

  async function savePortal() {
    const form = document.getElementById("portal-form");
    const row = {
      portal_name: form.portal_name.value.trim(),
      website_url: form.website_url.value.trim(),
      service_scope: form.service_scope.value.trim() || "all",
      username_hint: form.username_hint.value.trim() || null,
      password_location: form.password_location.value.trim() || "Password manager",
      owner_notes: form.owner_notes.value.trim() || null
    };
    const result = await sb.rpc("create_b2b_portal", {
      p_portal_name: row.portal_name,
      p_website_url: row.website_url,
      p_service_scope: row.service_scope,
      p_username_hint: row.username_hint,
      p_password_location: row.password_location,
      p_owner_notes: row.owner_notes
    });
    if (result.error) { toast("Could not save portal: " + result.error.message); return; }
    toast("Portal saved.");
    form.reset();
    document.getElementById("portal-form-card").hidden = true;
    await loadPortals();
  }

  async function loadPortals() {
    const result = await sb.rpc("list_b2b_portals");
    if (result.error) { toast("Could not load portals: " + result.error.message); return; }
    const rows = result.data || [];
    document.getElementById("portals-count").textContent = rows.length + " portal(s)";
    document.getElementById("portals-list").innerHTML = rows.length ? '<div class="ops-list">' + rows.map(function (p) {
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(p.portal_name) + '</b><p>' + esc(p.service_scope) + '</p><div class="ops-kv"><span class="ops-chip">Password: ' + esc(p.password_location || "Password manager") + '</span><span class="ops-chip">' + esc(p.status) + '</span></div></div><div class="ops-row-actions"><a class="btn btn-outline" target="_blank" rel="noopener" href="' + esc(p.website_url) + '">Open</a></div></div>';
    }).join("") + '</div>' : '<p class="form-note">No portals saved yet.</p>';
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
