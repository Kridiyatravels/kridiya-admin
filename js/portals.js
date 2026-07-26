"use strict";
(function () {
  if (document.body.dataset.page !== "portals") return;
  let sb = null;
  let canManage = false;
  let portalRows = [];
  let editingPortalId = null;
  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }
  function portalById(id) {
    return portalRows.find(function (p) { return p.id === id; });
  }
  function resetForm() {
    const form = document.getElementById("portal-form");
    editingPortalId = null;
    form.reset();
    form.service_scope.value = "all";
    form.password_location.value = "Password manager";
    if (form.status) form.status.value = "active";
    document.getElementById("portal-submit").textContent = "Save portal";
  }
  function fillForm(p) {
    const form = document.getElementById("portal-form");
    editingPortalId = p.id;
    form.portal_name.value = p.portal_name || "";
    form.website_url.value = p.website_url || "";
    form.service_scope.value = p.service_scope || "all";
    form.username_hint.value = p.username_hint || "";
    form.password_location.value = p.password_location || "Password manager";
    form.owner_notes.value = p.owner_notes || "";
    if (form.status) form.status.value = p.status === "inactive" ? "inactive" : "active";
    document.getElementById("portal-submit").textContent = "Update portal";
    document.getElementById("portal-form-card").hidden = false;
    form.portal_name.focus();
  }

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
      if (card.hidden) resetForm();
      card.hidden = !card.hidden;
    });
    document.getElementById("portal-form").addEventListener("submit", savePortal);
    document.getElementById("portal-cancel").addEventListener("click", function () {
      resetForm();
      document.getElementById("portal-form-card").hidden = true;
    });
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
      owner_notes: form.owner_notes.value.trim() || null,
      status: form.status ? form.status.value : "active"
    };
    const result = editingPortalId
      ? await sb.rpc("update_b2b_portal", {
          p_portal_id: editingPortalId,
          p_portal_name: row.portal_name,
          p_website_url: row.website_url,
          p_service_scope: row.service_scope,
          p_username_hint: row.username_hint,
          p_password_location: row.password_location,
          p_owner_notes: row.owner_notes,
          p_status: row.status
        })
      : await sb.rpc("create_b2b_portal", {
          p_portal_name: row.portal_name,
          p_website_url: row.website_url,
          p_service_scope: row.service_scope,
          p_username_hint: row.username_hint,
          p_password_location: row.password_location,
          p_owner_notes: row.owner_notes
        });
    if (result.error) { toast("Could not save portal: " + result.error.message); return; }
    toast(editingPortalId ? "Portal updated." : "Portal saved.");
    resetForm();
    document.getElementById("portal-form-card").hidden = true;
    await loadPortals();
  }

  async function loadPortals() {
    const result = await sb.rpc("list_b2b_portals");
    if (result.error) { toast("Could not load portals: " + result.error.message); return; }
    const rows = result.data || [];
    portalRows = rows;
    document.getElementById("portals-count").textContent = rows.length + " portal(s)";
    document.getElementById("portals-list").innerHTML = rows.length ? '<div class="ops-list">' + rows.map(function (p) {
      const inactive = p.status === "inactive";
      return '<div class="ops-row ' + (inactive ? 'portal-inactive' : '') + '" data-id="' + esc(p.id) + '"><div class="ops-row-main"><b>' + esc(p.portal_name) + '</b><p>' + esc(p.service_scope) + '</p><div class="ops-kv">' +
        (p.username_hint ? '<span class="ops-chip">' + esc(p.username_hint) + '</span>' : '') +
        '<span class="ops-chip">Password: ' + esc(p.password_location || "Password manager") + '</span><span class="ops-chip">' + esc(p.status) + '</span>' +
        (p.owner_notes ? '<span class="ops-chip">' + esc(p.owner_notes) + '</span>' : '') +
        '</div></div><div class="ops-row-actions"><a class="btn btn-outline" target="_blank" rel="noopener" href="' + esc(p.website_url) + '">Open</a>' +
        (canManage ? '<button class="btn btn-outline js-edit-portal" type="button">Edit</button><button class="btn btn-outline js-toggle-portal" type="button">' + (inactive ? "Reactivate" : "Inactive") + '</button><button class="btn btn-outline js-delete-portal" type="button">Delete</button>' : '') +
        '</div></div>';
    }).join("") + '</div>' : '<p class="form-note">No portals saved yet.</p>';
  }
  async function setPortalStatus(id, status) {
    const result = await sb.rpc("set_b2b_portal_status", { p_portal_id: id, p_status: status });
    if (result.error) { toast("Could not update portal: " + result.error.message); return; }
    toast(status === "inactive" ? "Portal marked inactive." : "Portal reactivated.");
    await loadPortals();
  }
  async function deletePortal(id) {
    const p = portalById(id);
    if (!confirm("Permanently delete " + ((p && p.portal_name) || "this portal") + "?")) return;
    const result = await sb.rpc("delete_b2b_portal", { p_portal_id: id });
    if (result.error) { toast("Could not delete portal: " + result.error.message); return; }
    toast("Portal deleted.");
    if (editingPortalId === id) resetForm();
    await loadPortals();
  }
  document.addEventListener("click", function (e) {
    const row = e.target.closest(".ops-row[data-id]");
    if (!row || !canManage) return;
    const id = row.dataset.id;
    if (e.target.closest(".js-edit-portal")) {
      const p = portalById(id);
      if (p) fillForm(p);
    } else if (e.target.closest(".js-toggle-portal")) {
      const p = portalById(id);
      if (p) setPortalStatus(id, p.status === "inactive" ? "active" : "inactive");
    } else if (e.target.closest(".js-delete-portal")) {
      deletePortal(id);
    }
  });
  document.addEventListener("DOMContentLoaded", boot);
})();
