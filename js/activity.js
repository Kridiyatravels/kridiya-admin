/* ============================================================
   Kridiya Travel — staff activity log (activity.html only)
   Read-only feed of public.audit_events via list_audit_events(),
   which itself refuses to return anything unless the caller is
   owner/admin. Regular staff never see this page's contents.
   ============================================================ */
"use strict";

(function () {
  if (document.body.dataset.page !== "activity") return;

  let sb = null;
  let allEvents = [];

  function fmtWhen(iso) {
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function describeEvent(row) {
    const m = row.metadata || {};
    const who = row.actor_email || "Someone";
    switch (row.event_type) {
      case "enquiry.status_changed":
        return who + " changed " + (m.reference || "an enquiry") + " from " + statusWord(m.from) + " to " + statusWord(m.to);
      case "enquiry.note_added":
        return who + " added an internal note to " + (m.reference || "an enquiry");
      case "enquiry.request_sent":
        return who + " asked for “" + (m.label || "information") + "” (" + (m.kind || "text") + ") on " + (m.reference || "an enquiry");
      case "enquiry.quote_sent":
        return who + " sent a quote of " + (m.currency || "AED") + " " + Number(m.amount || 0).toLocaleString("en-GB") + " for " + (m.reference || "an enquiry") + (m.title ? " (" + m.title + ")" : "");
      case "staff.granted":
        return who + " granted " + (m.role || "staff") + " access to " + (m.email || "someone");
      case "staff.revoked":
        return who + " removed a staff member's access";
      case "document.generated":
        return who + " generated " + (m.number || "a document") + (m.customer ? " for " + m.customer : "");
      case "settings.updated":
        return who + " updated business settings (license, bank details, or policy text)";
      default:
        return who + " — " + row.event_type;
    }
  }

  function statusWord(s) {
    if (!s) return "an unknown status";
    return String(s).replace(/_/g, " ");
  }

  function matchesFilters(row) {
    const typeF = document.getElementById("flt-event-type").value;
    const todayOnly = document.getElementById("flt-event-today").checked;
    if (typeF && row.event_type !== typeF) return false;
    if (todayOnly && new Date(row.created_at).toDateString() !== new Date().toDateString()) return false;
    return true;
  }

  function renderList() {
    const listEl = document.getElementById("activity-list");
    const visible = allEvents.filter(matchesFilters);
    document.getElementById("activity-count").textContent = visible.length + " of " + allEvents.length + " events";

    if (!visible.length) {
      listEl.innerHTML = '<div class="account-main empty-state"><p>No activity yet.</p></div>';
      return;
    }

    listEl.innerHTML = visible.map(function (row) {
      return '<div class="account-main admin-enq" style="padding:0.9rem 1.1rem">' +
        '<div class="enq-top">' +
          "<span>" + KridiyaAuth.escapeHTML(describeEvent(row)) + "</span>" +
          '<time datetime="' + KridiyaAuth.escapeHTML(row.created_at) + '">' + fmtWhen(row.created_at) + "</time>" +
        "</div>" +
      "</div>";
    }).join("");
  }

  function populateFilterOptions() {
    const types = Array.from(new Set(allEvents.map(function (r) { return r.event_type; }))).sort();
    const sel = document.getElementById("flt-event-type");
    types.forEach(function (t) {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t.replace(/[._]/g, " ");
      sel.appendChild(opt);
    });
  }

  async function boot() {
    const gate = document.getElementById("activity-gate");
    const app = document.getElementById("activity-app");

    const user = await KridiyaAuth.currentUser();
    if (!user) { renderLoginForm(gate, boot); return; }

    sb = await KridiyaAuth.client();
    let admin = false;
    try {
      const check = await sb.rpc("is_admin");
      admin = !check.error && check.data === true;
    } catch (e) { admin = false; }

    if (!admin) {
      gate.innerHTML =
        '<div class="account-main empty-state">' +
          "<p><b>This page is for owners and admins only.</b><br>Ask an admin if you need something checked here.</p>" +
          '<a class="btn btn-primary" href="admin.html">Back to enquiries</a>' +
        "</div>";
      return;
    }

    try {
      const result = await sb.rpc("list_audit_events", { limit_count: 300 });
      if (result.error) throw result.error;
      allEvents = result.data || [];
    } catch (err) {
      gate.innerHTML = '<div class="account-main empty-state"><p>Could not load activity: ' + KridiyaAuth.escapeHTML(err.message) + "</p></div>";
      return;
    }

    populateFilterOptions();
    gate.hidden = true;
    app.hidden = false;
    renderList();

    ["flt-event-type", "flt-event-today"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", renderList);
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
