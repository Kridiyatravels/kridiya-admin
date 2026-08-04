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
  let activeSort = "created_desc";

  function fmtWhen(iso) {
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  const EVENT_META = {
    "enquiry.status_changed": { icon: "clock", color: "var(--status-quoted)", bg: "var(--status-quoted-bg)" },
    "enquiry.note_added": { icon: "note", color: "var(--ink-2)", bg: "var(--surface-tint)" },
    "enquiry.request_sent": { icon: "mail", color: "var(--status-checking)", bg: "var(--status-checking-bg)" },
    "enquiry.quote_sent": { icon: "quote", color: "var(--status-confirmed)", bg: "var(--status-confirmed-bg)" },
    "enquiry.converted_to_corporate_booking": { icon: "check", color: "var(--status-confirmed)", bg: "var(--status-confirmed-bg)" },
    "staff.created": { icon: "user", color: "var(--status-confirmed)", bg: "var(--status-confirmed-bg)" },
    "staff.granted": { icon: "user", color: "var(--status-confirmed)", bg: "var(--status-confirmed-bg)" },
    "staff.revoked": { icon: "user", color: "var(--status-closed)", bg: "var(--status-closed-bg)" },
    "staff.pin_reset": { icon: "settings", color: "var(--status-payment)", bg: "var(--status-payment-bg)" },
    "document.generated": { icon: "doc", color: "var(--status-docs)", bg: "var(--status-docs-bg)" },
    "settings.updated": { icon: "settings", color: "var(--text-muted)", bg: "var(--surface-tint)" },
    "auth.login": { icon: "check", color: "var(--status-confirmed)", bg: "var(--status-confirmed-bg)" },
    "auth.logout": { icon: "logout", color: "var(--text-muted)", bg: "var(--surface-tint)" },
    "enquiry.marketing_outcome_added": { icon: "note", color: "var(--status-quoted)", bg: "var(--status-quoted-bg)" },
    "task.bulk_done": { icon: "check", color: "var(--status-confirmed)", bg: "var(--status-confirmed-bg)" },
    "task.bulk_reopen": { icon: "clock", color: "var(--status-checking)", bg: "var(--status-checking-bg)" },
    "task.bulk_snooze": { icon: "clock", color: "var(--status-payment)", bg: "var(--status-payment-bg)" },
    "task.bulk_reassign": { icon: "user", color: "var(--status-confirmed)", bg: "var(--status-confirmed-bg)" },
    "task.bulk_escalate": { icon: "clock", color: "var(--status-closed)", bg: "var(--status-closed-bg)" },
    "operations.digest_daily": { icon: "mail", color: "var(--status-confirmed)", bg: "var(--status-confirmed-bg)" },
    "operations.digest_overdue": { icon: "mail", color: "var(--status-closed)", bg: "var(--status-closed-bg)" }
  };

  function eventMeta(type) {
    return EVENT_META[type] || { icon: "note", color: "var(--text-muted)", bg: "var(--surface-tint)" };
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
      case "enquiry.converted_to_corporate_booking":
        return who + " converted " + (m.reference || "an enquiry") + " into a corporate booking" + (m.company_name ? " for " + m.company_name : "");
      case "enquiry.marketing_outcome_added":
        return who + " recorded a marketing outcome on " + (m.reference || "an enquiry");
      case "staff.created":
        return who + " created a staff account for " + (m.full_name || m.email || "someone") + (m.role ? " (" + m.role + ")" : "");
      case "staff.granted":
        return who + " granted " + (m.role || "staff") + " access to " + (m.email || "someone");
      case "staff.revoked":
        return who + " removed a staff member's access";
      case "staff.pin_reset":
        return who + " reset a staff member's PIN";
      case "document.generated":
        return who + " generated " + (m.number || "a document") + (m.customer ? " for " + m.customer : "");
      case "settings.updated":
        return who + " updated business settings (license, bank details, or policy text)";
      case "auth.login":
        return who + " signed in" + (m.method === "pin" ? " with a PIN" : "");
      case "auth.logout":
        return who + " signed out";
      case "task.bulk_done":
        return who + " completed " + (m.count || 0) + " operational work item(s)";
      case "task.bulk_reopen":
        return who + " reopened " + (m.count || 0) + " operational work item(s)";
      case "task.bulk_snooze":
        return who + " snoozed " + (m.count || 0) + " operational work item(s)";
      case "task.bulk_reassign":
        return who + " reassigned " + (m.count || 0) + " operational work item(s)";
      case "task.bulk_escalate":
        return who + " escalated " + (m.count || 0) + " operational work item(s)";
      case "operations.digest_daily":
        return "The daily operations digest completed";
      case "operations.digest_overdue":
        return "The overdue-work digest completed";
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
    const securityOnly = document.getElementById("flt-security-only").checked;
    const search = (document.getElementById("flt-event-search").value || "").trim().toLowerCase();
    if (typeF && row.event_type !== typeF) return false;
    if (securityOnly && !isSecurityEvent(row)) return false;
    if (search && searchable(row).indexOf(search) === -1) return false;
    if (todayOnly && new Date(row.created_at).toDateString() !== new Date().toDateString()) return false;
    return true;
  }

  function searchable(row) {
    return [
      row.event_type,
      row.actor_email,
      describeEvent(row),
      JSON.stringify(row.metadata || {})
    ].join(" ").toLowerCase();
  }

  function isSecurityEvent(row) {
    return /^(auth|staff|settings)\./.test(row.event_type) ||
      /payment|refund|permission|pin|backup|export/i.test(row.event_type);
  }

  function eventTime(row) {
    const t = new Date(row.created_at || 0).getTime();
    return isNaN(t) ? 0 : t;
  }

  function sortedEvents(rows) {
    return rows.slice().sort(function (a, b) {
      if (activeSort === "created_asc") return eventTime(a) - eventTime(b);
      if (activeSort === "security_first") return Number(!isSecurityEvent(a)) - Number(!isSecurityEvent(b)) || eventTime(b) - eventTime(a);
      if (activeSort === "type_asc") return String(a.event_type || "").localeCompare(String(b.event_type || "")) || eventTime(b) - eventTime(a);
      return eventTime(b) - eventTime(a);
    });
  }

  function syncActivitySort() {
    const wrap = document.getElementById("activity-sort");
    if (!wrap) return;
    const active = wrap.querySelector('[data-sort="' + activeSort + '"]') || wrap.querySelector("[data-sort]");
    wrap.querySelectorAll(".booking-sort-item").forEach(function (btn) {
      const on = btn === active;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-checked", String(on));
    });
    const label = active && active.querySelector("b");
    const text = document.querySelector("#activity-sort-btn b");
    if (label && text) text.textContent = label.textContent;
  }

  function renderSecurityPanel() {
    const panel = document.getElementById("activity-security-panel");
    if (!panel) return;
    const securityEvents = allEvents.filter(isSecurityEvent);
    const today = securityEvents.filter(function (r) { return new Date(r.created_at).toDateString() === new Date().toDateString(); });
    const staffChanges = securityEvents.filter(function (r) { return /^staff\./.test(r.event_type); });
    const signIns = securityEvents.filter(function (r) { return r.event_type === "auth.login"; });
    const sensitive = securityEvents.filter(function (r) { return /payment|refund|settings|export|pin|permission/i.test(r.event_type); });
    const next = sensitive.length
      ? "Review sensitive changes first, then scan staff and sign-in events."
      : securityEvents.length
        ? "Scan staff and sign-in activity for anything unusual."
        : "No security-sensitive events are visible in the current audit window.";
    panel.innerHTML =
      '<div class="security-summary security-' + (sensitive.length ? "warn" : "ok") + '"><div><b>' + KridiyaAuth.escapeHTML(String(securityEvents.length)) + ' security event(s)</b><span>' + KridiyaAuth.escapeHTML(next) + '</span></div><button type="button" class="btn btn-primary" id="show-security-events">Show security only</button></div>' +
      '<div class="security-grid">' +
        '<div><b>' + KridiyaAuth.escapeHTML(String(today.length)) + '</b><span>Today</span></div>' +
        '<div><b>' + KridiyaAuth.escapeHTML(String(staffChanges.length)) + '</b><span>Staff changes</span></div>' +
        '<div><b>' + KridiyaAuth.escapeHTML(String(signIns.length)) + '</b><span>Sign-ins</span></div>' +
        '<div><b>' + KridiyaAuth.escapeHTML(String(sensitive.length)) + '</b><span>Sensitive actions</span></div>' +
      '</div>';
  }

  function dayLabel(iso) {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
  }

  function timeOnly(iso) {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  function renderList() {
    const listEl = document.getElementById("activity-list");
    const visible = sortedEvents(allEvents.filter(matchesFilters));
    syncActivitySort();
    document.getElementById("activity-count").textContent = visible.length + " of " + allEvents.length + " events";
    renderSecurityPanel();

    if (!visible.length) {
      listEl.innerHTML = '<div class="account-main empty-state"><p>No activity yet.</p></div>';
      return;
    }

    let lastDay = null;
    const parts = [];
    visible.forEach(function (row) {
      const day = dayLabel(row.created_at);
      if (day !== lastDay) {
        parts.push('<div class="activity-day-label">' + day + "</div>");
        lastDay = day;
      }
      const meta = eventMeta(row.event_type);
      parts.push(
        '<div class="activity-row">' +
          '<div class="activity-icon" style="color:' + meta.color + ';background:' + meta.bg + '">' + icon(meta.icon) + "</div>" +
          '<div class="desc">' + KridiyaAuth.escapeHTML(describeEvent(row)) + "</div>" +
          '<time datetime="' + KridiyaAuth.escapeHTML(row.created_at) + '">' + timeOnly(row.created_at) + "</time>" +
        "</div>"
      );
    });
    listEl.innerHTML = parts.join("");
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
    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    renderList();

    ["flt-event-type", "flt-event-today", "flt-security-only"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", renderList);
    });
    document.getElementById("flt-event-search").addEventListener("input", renderList);
    const sortBtn = document.getElementById("activity-sort-btn");
    const sortMenu = document.getElementById("activity-sort-menu");
    if (sortBtn && sortMenu) {
      sortBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const open = sortMenu.hidden;
        sortMenu.hidden = !open;
        sortBtn.setAttribute("aria-expanded", String(open));
      });
      sortMenu.addEventListener("click", function (e) {
        const btn = e.target.closest(".booking-sort-item");
        if (!btn) return;
        activeSort = btn.dataset.sort || "created_desc";
        sortMenu.hidden = true;
        sortBtn.setAttribute("aria-expanded", "false");
        renderList();
      });
      document.addEventListener("click", function (e) {
        if (!sortMenu.hidden && !document.getElementById("activity-sort").contains(e.target)) {
          sortMenu.hidden = true;
          sortBtn.setAttribute("aria-expanded", "false");
        }
      });
    }
    document.getElementById("activity-security-panel").addEventListener("click", function (e) {
      if (!e.target.closest("#show-security-events")) return;
      document.getElementById("flt-security-only").checked = true;
      renderList();
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
