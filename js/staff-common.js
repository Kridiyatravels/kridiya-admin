/* ============================================================
   Kridiya Travel - staff site shared chrome
   admin.kridiyatravel.com only. Auth *logic* (js/auth.js - the
   Supabase client, KridiyaAuth.login/currentUser/etc.) is loaded from
   the main site so there is one source of truth for password handling
   and account data. The *session* is NOT shared with kridiyatravel.com
   though - this site has its own independent sign-in, deliberately, so
   being logged into one never implies being logged into the other.
   ============================================================ */
"use strict";

/* Public values (not secrets) - same ones baked into the main site's
   js/auth.js. Needed here only to call the staff-pin-login Edge
   Function directly by URL, which isn't reachable through the
   supabase-js client the way a normal RPC call is. */
const SUPABASE_URL = "https://jmvqqpughlzeqrcyavwz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_wiA9tSt74X-UQhW4yOXgIQ_lEUG1Q1Q";

const ICONS_STAFF = {
  whatsapp: "M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.4-3c-.3-.4 0-.5.2-.7l.4-.5c.1-.2.2-.3.3-.5v-.5c0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s1 2.5 1.1 2.7c.1.2 1.9 3 4.7 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.3z",
  mail: "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z",
  logout: "M10 17v-2H3v-6h7V7l5 5-5 5zM10 3h9v2h-9V3zm0 16h9v2h-9v-2zm0-8h9v2h-9v-2z",
  check: "M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.2 14.2L11 13.3V7h1.5v5.4l4.5 2.7-.8 1.1z",
  quote: "M7 7h5v5c0 2.2-1.8 4-4 4H7v-2h1c1.1 0 2-.9 2-2H7V7zm9 0h5v5c0 2.2-1.8 4-4 4h-1v-2h1c1.1 0 2-.9 2-2h-3V7z",
  note: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 5h10v2H7V8zm0 4h10v2H7v-2zm0 4h6v2H7v-2z",
  doc: "M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V9h5.5L13 3.5z",
  user: "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.2-8 5v3h16v-3c0-2.8-3.6-5-8-5z",
  chevron: "M7 10l5 5 5-5z",
  settings: "M19.14 12.94a7.14 7.14 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.14.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.14 7.14 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.32.6.22l2.39-.96c.49.38 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.14-.56 1.63-.94l2.39.96c.24.1.5 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z",
  grid: "M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z",
  inbox: "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 12h-4a3 3 0 0 1-6 0H5V5h14v10z",
  ticket: "M20 12a2 2 0 0 1 2-2V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v3a2 2 0 0 1 0 4v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a2 2 0 0 1-2-2z",
  building: "M4 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18h-4v-4h-4v4H4zm4-14h2v2H8V8zm4 0h2v2h-2V8zm-4 4h2v2H8v-2zm4 0h2v2h-2v-2zm6-4h4a2 2 0 0 1 2 2v10h-6V8z",
  card: "M20 4H4c-1.11 0-2 .89-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z",
  chart: "M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z",
  link: "M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7h-4a5 5 0 0 0 0 10h4v-1.9h-4A3.1 3.1 0 0 1 3.9 12zm5.1 1h6v-2H9v2zm4-6h4a5 5 0 0 1 0 10h-4v-1.9h4a3.1 3.1 0 0 0 0-6.2h-4V7z",
  users: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  download: "M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z",
  search: "M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"
  ,bell: "M12 22a2.25 2.25 0 0 0 2.12-1.5H9.88A2.25 2.25 0 0 0 12 22zm7-5v-5a7 7 0 0 0-5.5-6.84V4a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 12v5l-2 2h18l-2-2z"
};

function icon(name, cls) {
  return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + (ICONS_STAFF[name] || "") + '"/></svg>';
}

/* ============================================================
   Single source of truth for navigation. The slim top bar, the
   "All tools" menu, the Dashboard hub and the "Jump to" palette
   are all built from this — add a page here once and it appears
   everywhere, permission-gated. `primary` items also sit in the
   always-visible top bar. `access` mirrors what each page enforces.
   ============================================================ */
const STAFF_NAV_MODEL = [
  { group: "Daily work", items: [
    { href: "dashboard.html", page: "dashboard", label: "Dashboard", icon: "grid", desc: "Overview & shortcuts", primary: true },
    { href: "tasks.html", page: "tasks", label: "Work queue", icon: "check", desc: "Unified tasks & deadlines", primary: true },
    { href: "disruptions.html", page: "disruptions", label: "Disruptions", icon: "bell", desc: "Affected trips & recovery updates", primary: true },
    { href: "admin.html", page: "admin", label: "Enquiries", icon: "inbox", desc: "Website enquiries", primary: true },
    { href: "customers.html", page: "customers", label: "Customers", icon: "user", desc: "Customer profiles", primary: true },
    { href: "bookings.html", page: "bookings", label: "Bookings", icon: "ticket", desc: "Confirmed bookings", primary: true },
    { href: "corporate.html", page: "corporate", label: "Corporate", icon: "building", desc: "Corporate accounts", primary: true, access: { perm: "view_corporates" } }
  ] },
  { group: "Money", items: [
    { href: "payments.html", page: "payments", label: "Payments", icon: "card", desc: "Customer & supplier payments", access: { perm: "view_payments" } },
    { href: "accounting.html", page: "accounting", label: "Accounting", icon: "chart", desc: "Profit & exports", access: { perm: "view_payments" } }
  ] },
  { group: "Paperwork", items: [
    { href: "documents.html", page: "documents", label: "Documents", icon: "doc", desc: "Invoices & e-tickets" },
    { href: "templates.html", page: "templates", label: "Templates", icon: "note", desc: "Reusable message templates" }
  ] },
  { group: "Suppliers", items: [
    { href: "portals.html", page: "portals", label: "Portals", icon: "link", desc: "B2B supplier portals" }
  ] },
  { group: "Admin", items: [
    { href: "incidents.html", page: "incidents", label: "Incident control", icon: "bell", desc: "Restricted incident procedures", access: { adminOnly: true } },
    { href: "improvements.html", page: "improvements", label: "Corrective actions", icon: "check", desc: "Root cause & prevention", access: { adminOnly: true } },
    { href: "handover.html", page: "handover", label: "SOP", icon: "note", desc: "Operating handover", access: { adminOnly: true } },
    { href: "staff.html", page: "staff", label: "Staff", icon: "users", desc: "Team & permissions", access: { adminOnly: true } },
    { href: "activity.html", page: "activity", label: "Activity", icon: "clock", desc: "Audit log", access: { adminOnly: true } },
    { href: "reports.html", page: "reports", label: "Management reports", icon: "chart", desc: "Scheduled canonical snapshots" },
    { href: "backups.html", page: "backups", label: "Backups", icon: "download", desc: "Data exports", access: { adminOnly: true } }
  ] }
];

const STAFF_COMMAND_SHORTCUTS = [
  { keys: "N", label: "New booking", action: "new-booking", desc: "Create an operations booking", page: "bookings" },
  { keys: "S", label: "Focus search", action: "focus-search", desc: "Focus the current page search field" },
  { keys: "F", label: "Open filters", action: "focus-filter", desc: "Focus the current page filter or sort control" },
  { keys: "G D", label: "Dashboard", href: "dashboard.html", desc: "Go to operations overview" },
  { keys: "G T", label: "Work queue", href: "tasks.html", desc: "Go to unified operations tasks" },
  { keys: "G E", label: "Enquiries", href: "admin.html", desc: "Go to website enquiries" },
  { keys: "G B", label: "Bookings", href: "bookings.html", desc: "Go to confirmed bookings" },
  { keys: "G C", label: "Customers", href: "customers.html", desc: "Go to customer profiles" },
  { keys: "?", label: "Shortcuts", action: "show-shortcuts", desc: "Open this command palette" }
];
let staffNavChord = "";
let staffNavChordTimer = null;

/* Permission attributes so a single pruning pass can hide/remove any
   gated element (nav link, menu item, hub card) it finds document-wide. */
function navAccessAttr(item) {
  if (!item || !item.access) return "";
  if (item.access.adminOnly) return ' data-admin="1"';
  if (item.access.perm) return ' data-perm="' + item.access.perm + '"';
  return "";
}
function navCurrent(item, page) { return item.page === page ? ' aria-current="page"' : ""; }

function buildToolsMenuHTML(page) {
  return STAFF_NAV_MODEL.map(function (grp) {
    const items = grp.items.map(function (it) {
      return '<a class="tools-item" href="' + it.href + '"' + navAccessAttr(it) + navCurrent(it, page) + '>' +
        '<span class="tools-item-ico">' + icon(it.icon) + "</span>" +
        '<span class="tools-item-text"><b>' + it.label + "</b><small>" + it.desc + "</small></span></a>";
    }).join("");
    return '<div class="tools-group"><span class="tools-group-title">' + grp.group + "</span>" + items + "</div>";
  }).join("");
}

/* Grouped hub for the Dashboard. Each card carries an empty count slot
   the dashboard fills once its summary RPC returns. */
function buildToolHubHTML(page) {
  return STAFF_NAV_MODEL.map(function (grp) {
    const cards = grp.items.map(function (it) {
      return '<a class="hub-card" href="' + it.href + '"' + navAccessAttr(it) + navCurrent(it, page) + '>' +
        '<span class="hub-ico">' + icon(it.icon) + "</span>" +
        '<span class="hub-text"><b>' + it.label + "</b><small>" + it.desc + "</small></span>" +
        '<span class="hub-count" data-count-for="' + it.href + '"></span></a>';
    }).join("");
    return '<div class="hub-group"><h3 class="hub-group-title">' + grp.group + '</h3><div class="hub-cards">' + cards + "</div></div>";
  }).join("");
}

function pageCommandEntries() {
  return Array.prototype.slice.call(document.querySelectorAll("[data-command-label]")).map(function (el) {
    return {
      label: el.getAttribute("data-command-label") || "",
      desc: el.getAttribute("data-command-desc") || "",
      keys: el.getAttribute("data-command-keys") || "",
      action: el.getAttribute("data-command-action") || "click",
      element: el
    };
  }).filter(function (entry) { return entry.label; });
}

function searchText(parts) {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function commandDataEntry(kind, label, desc, href) {
  return { kind: kind, label: label, desc: desc, href: href, keys: "" };
}

function entryMatches(entry, q) {
  return !q || searchText([entry.label, entry.desc, entry.keys, entry.kind]).indexOf(q) >= 0;
}

function compactDataResults(rows, q, fields, mapFn, limit) {
  const hits = [];
  (rows || []).some(function (row) {
    const hay = searchText(fields.map(function (field) { return row[field]; }));
    if (hay.indexOf(q) === -1) return false;
    hits.push(mapFn(row));
    return hits.length >= (limit || 5);
  });
  return hits;
}

async function searchAdminData(q) {
  if (!q || q.length < 2 || !window.KridiyaAuth) return [];
  let sb = null;
  try { sb = await KridiyaAuth.client(); } catch (e) { return []; }
  const safe = async function (promise) {
    try {
      const res = await promise;
      if (res && res.error) return [];
      return (res && res.data) || [];
    } catch (e) {
      return [];
    }
  };
  const results = await Promise.all([
    safe(sb.from("enquiries").select("id, reference, full_name, email, phone, service_type, status, summary, created_at").order("created_at", { ascending: false }).limit(120)),
    safe(sb.rpc("list_operations_bookings", { limit_count: 200 })),
    safe(sb.from("customers").select("id, full_name, email, phone, whatsapp, source, created_at").order("created_at", { ascending: false }).limit(120)),
    safe(sb.rpc("list_operations_payments", { limit_count: 200 })),
    safe(sb.from("documents").select("id, document_number, document_type, customer_name, customer_email, amount_total, currency, created_at").order("created_at", { ascending: false }).limit(80))
  ]);
  return []
    .concat(compactDataResults(results[0], q, ["reference", "full_name", "email", "phone", "service_type", "status", "summary"], function (row) {
      return commandDataEntry("Enquiry", row.reference || "Enquiry", [row.full_name, row.email, row.service_type, row.status].filter(Boolean).join(" - "), "admin.html?focus=" + encodeURIComponent(row.id));
    }, 5))
    .concat(compactDataResults(results[1], q, ["booking_reference", "title", "customer_name", "customer_email", "customer_phone", "corporate_company_name", "service_type", "status", "payment_status", "route_or_destination"], function (row) {
      return commandDataEntry("Booking", row.booking_reference || "Booking", [row.title, row.customer_name || row.corporate_company_name, row.status, row.payment_status].filter(Boolean).join(" - "), "booking-detail.html?id=" + encodeURIComponent(row.id));
    }, 5))
    .concat(compactDataResults(results[2], q, ["full_name", "email", "phone", "whatsapp", "source"], function (row) {
      return commandDataEntry("Customer", row.full_name || row.email || "Customer", [row.email, row.phone || row.whatsapp, row.source].filter(Boolean).join(" - "), "customers.html?email=" + encodeURIComponent(row.email || ""));
    }, 5))
    .concat(compactDataResults(results[3], q, ["payment_reference", "booking_reference", "booking_title", "customer_name", "corporate_company_name", "service_type", "method", "status"], function (row) {
      return commandDataEntry("Payment", row.payment_reference || row.booking_reference || "Payment", [row.customer_name || row.corporate_company_name, row.method, row.status].filter(Boolean).join(" - "), row.booking_id ? "booking-detail.html?id=" + encodeURIComponent(row.booking_id) : "payments.html");
    }, 4))
    .concat(compactDataResults(results[4], q, ["document_number", "document_type", "customer_name", "customer_email"], function (row) {
      return commandDataEntry("Document", row.document_number || "Document", [row.document_type, row.customer_name, row.customer_email].filter(Boolean).join(" - "), "documents.html");
    }, 4));
}

function runCommand(entry) {
  if (!entry) return;
  if (entry.href) {
    location.href = entry.href;
    return;
  }
  if (entry.action === "focus-search") {
    const target = document.querySelector("#bookings-search, #cust-search, #flt-search, #payments-search, #template-search, .admin-search, input[type='search']");
    if (target) { target.focus(); if (target.select) target.select(); }
    else toast("No search field on this page.");
    return;
  }
  if (entry.action === "focus-filter") {
    const target = document.querySelector("#booking-sort-btn, #admin-sort-btn, #cust-sort-btn, #payments-sort-btn, #activity-sort-btn, #cust-filter, #flt-status, #flt-service, select");
    if (target) target.focus();
    else toast("No filter control on this page.");
    return;
  }
  if (entry.action === "new-booking") {
    if (document.body.dataset.page === "bookings") {
      const btn = document.getElementById("booking-new-toggle");
      const card = document.getElementById("booking-form-card");
      if (card && card.hidden && btn) btn.click();
      const title = document.querySelector('#booking-form input[name="title"]');
      if (title) title.focus();
    } else {
      location.href = "bookings.html#new";
    }
    return;
  }
  if (entry.action === "show-shortcuts") {
    openJumpPalette("?");
    return;
  }
  if (entry.element && typeof entry.element.click === "function") entry.element.click();
}

/* ---------- "Jump to" command palette (works on every page) ---------- */
function openJumpPalette(seed) {
  let overlay = document.getElementById("jump-overlay");
  if (overlay) { overlay.hidden = false; }
  else {
    overlay = document.createElement("div");
    overlay.id = "jump-overlay";
    overlay.className = "jump-overlay";
    overlay.innerHTML =
      '<div class="jump-box" role="dialog" aria-label="Jump to">' +
        '<div class="jump-input-wrap">' + icon("search") +
          '<input id="jump-input" class="jump-input" type="text" placeholder="Search pages, actions, shortcuts..." autocomplete="off" aria-label="Search pages, actions, shortcuts">' +
        "</div>" +
        '<ul id="jump-list" class="jump-list" role="listbox"></ul>' +
        '<div class="jump-help"><span>Enter to open</span><span>Up/Down move</span><span>Esc close</span></div>' +
      "</div>";
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeJumpPalette(); });
  }
  const input = document.getElementById("jump-input");
  // Source of truth = the rendered, already permission-pruned nav links.
  const anchors = Array.prototype.slice.call(document.querySelectorAll(".staff-nav a[href]"));
  const seen = {};
  const entries = [];
  let dataEntries = [];
  let dataLoading = false;
  let dataTimer = null;
  let dataToken = 0;
  anchors.forEach(function (a) {
    const href = a.getAttribute("href");
    if (!href || seen[href]) return;
    seen[href] = true;
    const b = a.querySelector("b");
    const small = a.querySelector("small");
    entries.push({ href: href, label: (b ? b.textContent : a.textContent).trim(), desc: small ? small.textContent : "", kind: "Page" });
  });
  STAFF_COMMAND_SHORTCUTS.forEach(function (entry) {
    entries.push({
      href: entry.href,
      label: entry.label,
      desc: entry.desc,
      keys: entry.keys,
      action: entry.action,
      kind: "Shortcut"
    });
  });
  pageCommandEntries().forEach(function (entry) {
    entry.kind = "This page";
    entries.push(entry);
  });
  let active = 0;
  function render() {
    const q = input.value.trim().toLowerCase();
    const list = document.getElementById("jump-list");
    const hits = entries.concat(dataEntries).filter(function (e) { return entryMatches(e, q); });
    active = Math.max(0, Math.min(active, hits.length - 1));
    list.innerHTML = hits.length
      ? hits.map(function (e, i) {
          return '<li class="jump-item' + (i === active ? " active" : "") + '" role="option" data-href="' + e.href + '">' +
            '<span><b>' + KridiyaAuth.escapeHTML(e.label) + "</b>" +
              (e.desc ? '<small>' + KridiyaAuth.escapeHTML(e.desc) + "</small>" : "") + "</span>" +
            '<span class="jump-meta">' + (e.keys ? '<kbd>' + KridiyaAuth.escapeHTML(e.keys) + "</kbd>" : "") +
              (e.kind ? "<em>" + KridiyaAuth.escapeHTML(e.kind) + "</em>" : "") + "</span></li>";
        }).join("")
      : '<li class="jump-empty">' + (dataLoading ? "Searching records..." : "No matches") + "</li>";
    list._hits = hits;
  }
  function scheduleDataSearch() {
    const q = input.value.trim().toLowerCase();
    clearTimeout(dataTimer);
    if (q.length < 2) {
      dataEntries = [];
      dataLoading = false;
      render();
      return;
    }
    dataLoading = true;
    render();
    const token = ++dataToken;
    dataTimer = setTimeout(async function () {
      const found = await searchAdminData(q);
      if (token !== dataToken) return;
      dataEntries = found;
      dataLoading = false;
      active = 0;
      render();
    }, 180);
  }
  input.value = "";
  render();
  input.focus();
  input.onkeydown = function (e) {
    const hits = (document.getElementById("jump-list")._hits) || [];
    if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % Math.max(1, hits.length); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + hits.length) % Math.max(1, hits.length); render(); }
    else if (e.key === "Enter") { e.preventDefault(); runCommand(hits[active]); }
    else if (e.key === "Escape") { closeJumpPalette(); }
  };
  input.oninput = function () { active = 0; scheduleDataSearch(); };
  const list = document.getElementById("jump-list");
  list.onclick = function (e) {
    const li = e.target.closest(".jump-item");
    if (li) runCommand((list._hits || [])[Array.prototype.indexOf.call(list.children, li)]);
  };
  input.value = seed || "";
  scheduleDataSearch();
}
function closeJumpPalette() {
  const overlay = document.getElementById("jump-overlay");
  if (overlay) overlay.hidden = true;
}

let toastTimer = null;
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(function () { el.classList.add("show"); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove("show"); }, 4200);
}

function renderStaffChrome() {
  document.querySelectorAll('[id$="-gate"] .empty-state').forEach(function (state) {
    if (/^\s*Checking access/i.test(state.textContent || "")) {
      state.classList.add("loading-state");
      state.setAttribute("aria-busy", "true");
      state.setAttribute("aria-live", "polite");
    }
  });
  const page = document.body.dataset.page;
  const header = document.getElementById("site-header");
  if (header) {
    header.innerHTML =
      '<div class="staff-topbar"><div class="container staff-topbar-inner">' +
        '<a class="staff-logo" href="dashboard.html">' +
          '<img src="https://kridiyatravel.com/assets/logo.png" alt="Kridiya Travel" width="36" height="36">' +
          "<span>Kridiya <b>Staff Tools</b></span>" +
        "</a>" +
        '<nav class="staff-nav" hidden>' +
          '<div class="staff-nav-primary">' +
            STAFF_NAV_MODEL.reduce(function (acc, g) {
              g.items.forEach(function (it) {
                if (it.primary) acc.push('<a class="staff-nav-link" href="' + it.href + '"' + navAccessAttr(it) + navCurrent(it, page) + ">" + it.label + "</a>");
              });
              return acc;
            }, []).join("") +
          "</div>" +
          '<div class="staff-tools">' +
            '<button type="button" class="staff-tools-btn" id="staff-tools-btn" aria-haspopup="true" aria-expanded="false">All tools ' + icon("chevron", "staff-tools-caret") + "</button>" +
            '<div class="staff-tools-menu" id="staff-tools-menu" hidden>' + buildToolsMenuHTML(page) + "</div>" +
          "</div>" +
          '<button type="button" class="staff-jump-btn" id="staff-jump-btn" aria-label="Jump to (Ctrl+K)">' + icon("search") + "<span>Jump to…</span></button>" +
        "</nav>" +
        '<div class="staff-actions">' +
          '<button type="button" class="staff-notification-btn" id="staff-notification-btn" aria-label="Notifications" aria-haspopup="true" aria-expanded="false">' +
            icon("bell") + '<span class="staff-notification-count" id="staff-notification-count" hidden>0</span>' +
          '</button>' +
          '<section class="staff-notification-panel" id="staff-notification-panel" hidden aria-label="Notifications">' +
            '<div class="staff-notification-head"><div><b>Notifications</b><span id="staff-notification-summary">Your operational inbox</span></div><button type="button" id="staff-notification-read-all">Mark all read</button></div>' +
            '<div class="staff-notification-list" id="staff-notification-list"><p class="staff-notification-empty">Loading…</p></div>' +
          '</section>' +
          '<button type="button" class="staff-profile-btn" id="staff-profile-btn" aria-haspopup="true" aria-expanded="false">' +
            '<span class="staff-profile-av" id="staff-profile-av">' + icon("user") + "</span>" +
            '<span class="staff-profile-name" id="staff-profile-name">Account</span>' +
            icon("chevron", "staff-profile-caret") +
          "</button>" +
          '<div class="staff-profile-menu" id="staff-profile-menu" hidden role="menu">' +
            '<div class="staff-profile-head"><b id="staff-profile-fullname">Loading…</b><span id="staff-profile-role"></span></div>' +
            '<a class="staff-profile-item" role="menuitem" href="profile.html">' + icon("user") + " My profile</a>" +
            '<a class="staff-profile-item" role="menuitem" href="https://kridiyatravel.com" target="_blank" rel="noopener">' + icon("settings") + " Main site</a>" +
            '<button type="button" class="staff-profile-item danger" role="menuitem" id="staff-logout">' + icon("logout") + " Log out</button>" +
          "</div>" +
        "</div>" +
      "</div></div>";

    const profBtn = document.getElementById("staff-profile-btn");
    const profMenu = document.getElementById("staff-profile-menu");
    if (profBtn && profMenu) {
      profBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const willOpen = profMenu.hidden;
        profMenu.hidden = !willOpen;
        profBtn.setAttribute("aria-expanded", String(willOpen));
      });
      document.addEventListener("click", function (e) {
        if (!profMenu.hidden && !profMenu.contains(e.target) && !profBtn.contains(e.target)) {
          profMenu.hidden = true;
          profBtn.setAttribute("aria-expanded", "false");
        }
      });
    }
    const notificationBtn = document.getElementById("staff-notification-btn");
    const notificationPanel = document.getElementById("staff-notification-panel");
    if (notificationBtn && notificationPanel) {
      notificationBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const willOpen = notificationPanel.hidden;
        notificationPanel.hidden = !willOpen;
        notificationBtn.setAttribute("aria-expanded", String(willOpen));
        if (willOpen) loadStaffNotifications();
      });
      document.addEventListener("click", function (e) {
        if (!notificationPanel.hidden && !notificationPanel.contains(e.target) && !notificationBtn.contains(e.target)) {
          notificationPanel.hidden = true;
          notificationBtn.setAttribute("aria-expanded", "false");
        }
      });
    }
    const logoutBtn = document.getElementById("staff-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async function () {
        try {
          const user = await KridiyaAuth.currentUser();
          if (user) {
            const sb = await KridiyaAuth.client();
            await logActivity(sb, user.id, "auth.logout", "user", user.id, {});
          }
        } catch (e) { /* best-effort */ }
        await KridiyaAuth.logout();
        location.reload();
      });
    }

    // "All tools" grouped dropdown
    const toolsBtn = document.getElementById("staff-tools-btn");
    const toolsMenu = document.getElementById("staff-tools-menu");
    if (toolsBtn && toolsMenu) {
      toolsBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const open = toolsMenu.hidden;
        toolsMenu.hidden = !open;
        toolsBtn.setAttribute("aria-expanded", String(open));
      });
      document.addEventListener("click", function (e) {
        if (!toolsMenu.hidden && !toolsMenu.contains(e.target) && !toolsBtn.contains(e.target)) {
          toolsMenu.hidden = true;
          toolsBtn.setAttribute("aria-expanded", "false");
        }
      });
    }

    // "Jump to" command palette: button + Ctrl/Cmd+K or "/" shortcut
    const jumpBtn = document.getElementById("staff-jump-btn");
    if (jumpBtn) jumpBtn.addEventListener("click", openJumpPalette);
    document.addEventListener("keydown", function (e) {
      const tag = (e.target && e.target.tagName) || "";
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openJumpPalette(); }
      else if (e.key === "/" && !typing) { e.preventDefault(); openJumpPalette(); }
      else if (e.key === "?" && !typing) { e.preventDefault(); openJumpPalette("?"); }
      else if ((e.key === "s" || e.key === "S") && !typing) { e.preventDefault(); runCommand({ action: "focus-search" }); }
      else if ((e.key === "f" || e.key === "F") && !typing) { e.preventDefault(); runCommand({ action: "focus-filter" }); }
      else if ((e.key === "n" || e.key === "N") && !typing) { e.preventDefault(); runCommand({ action: "new-booking" }); }
      else if ((e.key === "g" || e.key === "G") && !typing) {
        e.preventDefault();
        staffNavChord = "g";
        clearTimeout(staffNavChordTimer);
        staffNavChordTimer = setTimeout(function () { staffNavChord = ""; }, 900);
      } else if (staffNavChord === "g" && !typing) {
        const key = String(e.key || "").toLowerCase();
        const routes = { d: "dashboard.html", e: "admin.html", b: "bookings.html", c: "customers.html" };
        if (routes[key]) {
          e.preventDefault();
          staffNavChord = "";
          location.href = routes[key];
        }
      }
    });
  }
  const footer = document.getElementById("site-footer");
  if (footer) {
    footer.innerHTML = '<div class="container staff-footer-inner">Kridiya Travel and Tourism FZ-LLC - internal staff tools, not for public access.</div>';
  }
}

const STATUS_META = {
  received: { color: "var(--status-received)", bg: "var(--status-received-bg)" },
  checking_availability: { color: "var(--status-checking)", bg: "var(--status-checking-bg)" },
  quote_sent: { color: "var(--status-quoted)", bg: "var(--status-quoted-bg)" },
  confirmed: { color: "var(--status-confirmed)", bg: "var(--status-confirmed-bg)" },
  payment_pending: { color: "var(--status-payment)", bg: "var(--status-payment-bg)" },
  booked: { color: "var(--status-booked)", bg: "var(--status-booked-bg)" },
  documents_sent: { color: "var(--status-docs)", bg: "var(--status-docs-bg)" },
  closed: { color: "var(--status-closed)", bg: "var(--status-closed-bg)" }
};
function statusStyle(status) {
  const m = STATUS_META[status] || STATUS_META.received;
  return "color:" + m.color + ";background:" + m.bg;
}

/* Best-effort activity log write - never blocks the real action if it
   fails (e.g. RLS denies it for a non-staff caller mid-session). */
async function logActivity(sb, actorId, eventType, entityType, entityId, metadata) {
  try {
    await sb.from("audit_events").insert({
      actor_user_id: actorId,
      event_type: eventType,
      entity_type: entityType || null,
      entity_id: entityId || null,
      metadata: metadata || {}
    });
  } catch (e) { /* logging is best-effort */ }
}

/* Renders a tabbed sign-in form into `gateEl` and calls `onSuccess()`
   once a session is established. Two independent paths, both landing
   in the same KridiyaAuth session either way:
   - Staff: pick your name, enter your PIN - goes through the
     staff-pin-login Edge Function, which resolves the real email
     server-side (the browser never sees it) and returns session
     tokens to adopt.
   - Admin: normal email + password via KridiyaAuth.login(), for
     owners/admins only. */
function renderLoginForm(gateEl, onSuccess) {
  gateEl.innerHTML =
    '<div class="login-shell">' +
      '<div class="login-shell-header">' +
        "<h1>Staff Tools</h1>" +
        "<p>Sign in to Kridiya Travel and Tourism</p>" +
      "</div>" +
      '<div class="login-tabs" role="tablist">' +
        '<button type="button" class="login-tab active" data-tab="staff" role="tab" aria-selected="true">Staff (PIN)</button>' +
        '<button type="button" class="login-tab" data-tab="admin" role="tab" aria-selected="false">Admin</button>' +
      "</div>" +
      '<div id="login-tab-staff" class="login-tab-panel">' +
        '<p class="form-note">Enter your 6-digit staff PIN.</p>' +
        '<form id="pin-login-form" class="form-grid" novalidate>' +
          '<div class="form-banner error" hidden role="alert"></div>' +
          '<div class="field">' +
            '<label>PIN</label>' +
            '<div class="pin-group">' +
              '<div class="pin-boxes" role="group" aria-label="6-digit PIN">' +
                new Array(6).fill(0).map(function (_, i) {
                  return (i === 3 ? '<span class="pin-sep" aria-hidden="true">&ndash;</span>' : "") +
                    '<input class="pin-box" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off" aria-label="PIN digit">';
                }).join("") +
              "</div>" +
              '<button type="button" class="pin-toggle" aria-pressed="false">Show</button>' +
            "</div>" +
          "</div>" +
          '<div class="login-actions"><button class="btn btn-primary" type="submit">Log in</button></div>' +
        "</form>" +
      "</div>" +
      '<div id="login-tab-admin" class="login-tab-panel" hidden>' +
        '<p class="form-note">Email and password - owners/admins only.</p>' +
        '<form id="admin-login-form" class="form-grid" novalidate>' +
          '<div class="form-banner error" hidden role="alert"></div>' +
          '<div class="field"><label>EMAIL</label><input name="email" type="email" required autocomplete="username"></div>' +
          '<div class="field"><label>PASSWORD</label>' +
            '<div class="pw-wrap"><input name="password" type="password" required autocomplete="current-password">' +
            '<button type="button" class="pw-toggle" aria-label="Show password">SHOW</button></div>' +
          "</div>" +
          '<div class="login-actions"><button class="btn btn-primary" type="submit">Log in</button></div>' +
        "</form>" +
        '<p class="form-note" style="margin-top:0.8rem"><a href="https://kridiyatravel.com/forgot-password.html" target="_blank" rel="noopener">Forgot password?</a></p>' +
      "</div>" +
    "</div>";

  const pinBoxes = Array.prototype.slice.call(gateEl.querySelectorAll(".pin-box"));

  gateEl.querySelectorAll(".login-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      gateEl.querySelectorAll(".login-tab").forEach(function (t) {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", String(t === tab));
      });
      gateEl.querySelectorAll(".login-tab-panel").forEach(function (p) {
        p.hidden = p.id !== "login-tab-" + tab.dataset.tab;
      });
      if (tab.dataset.tab === "staff" && pinBoxes[0]) pinBoxes[0].focus();
    });
  });

  pinBoxes.forEach(function (box, idx) {
    box.addEventListener("input", function () {
      box.value = box.value.replace(/[^0-9]/g, "").slice(0, 1);
      if (box.value && idx < pinBoxes.length - 1) pinBoxes[idx + 1].focus();
    });
    box.addEventListener("keydown", function (e) {
      if (e.key === "Backspace" && !box.value && idx > 0) {
        pinBoxes[idx - 1].focus();
      }
    });
  });

  const pinToggle = gateEl.querySelector(".pin-toggle");
  if (pinToggle) {
    pinToggle.addEventListener("click", function () {
      const showing = pinBoxes[0] && pinBoxes[0].type === "text";
      pinBoxes.forEach(function (b) { b.type = showing ? "password" : "text"; });
      pinToggle.textContent = showing ? "Show" : "Hide";
      pinToggle.setAttribute("aria-pressed", String(!showing));
    });
  }

  const pinForm = gateEl.querySelector("#pin-login-form");
  pinForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const banner = pinForm.querySelector(".form-banner");
    banner.hidden = true;
    const pin = pinBoxes.map(function (b) { return b.value; }).join("");
    if (!/^\d{6}$/.test(pin)) {
      banner.hidden = false;
      banner.textContent = "Enter all 6 digits of your PIN.";
      return;
    }
    const btn = pinForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Signing in...";
    try {
      const resp = await fetch(SUPABASE_URL + "/functions/v1/staff-pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ pin: pin })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Could not sign in.");
      const sb = await KridiyaAuth.client();
      const setResult = await sb.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
      if (setResult.error) throw setResult.error;
      onSuccess();
    } catch (err) {
      banner.hidden = false;
      banner.textContent = err.message;
      pinBoxes.forEach(function (b) { b.value = ""; });
      if (pinBoxes[0]) pinBoxes[0].focus();
      btn.disabled = false;
      btn.textContent = "Log in";
    }
  });

  const adminForm = gateEl.querySelector("#admin-login-form");
  const pwInput = adminForm.querySelector('input[name="password"]');
  const pwToggle = adminForm.querySelector(".pw-toggle");
  pwToggle.addEventListener("click", function () {
    const show = pwInput.type === "password";
    pwInput.type = show ? "text" : "password";
    pwToggle.textContent = show ? "HIDE" : "SHOW";
  });
  adminForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const banner = adminForm.querySelector(".form-banner");
    banner.hidden = true;
    const btn = adminForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Signing in...";
    try {
      const user = await KridiyaAuth.login(adminForm.email.value, adminForm.password.value);
      const sb = await KridiyaAuth.client();
      // Extra lock: the Admin tab is for owners/admins only. Anyone else
      // (regular staff, or a website customer whose email+password happen
      // to be valid) is signed straight back out — no admin session is
      // ever created for a non-admin account.
      const adminCheck = await sb.rpc("is_admin");
      if (adminCheck.error || adminCheck.data !== true) {
        await KridiyaAuth.logout();
        throw new Error("This account is not an admin. Staff: use the PIN tab instead.");
      }
      logActivity(sb, user.id, "auth.login", "user", user.id, { method: "password" });
      onSuccess();
    } catch (err) {
      banner.hidden = false;
      banner.textContent = err.message;
      btn.disabled = false;
      btn.textContent = "Log in";
    }
  });
}

/* Which nav links require a permission (or admin) to be shown. A link
   is hidden ONLY when its page would actually reject the person, so the
   menu never hides a page they can still open. Pages gated by is_staff
   alone (dashboard, enquiries, bookings, documents, templates, portals)
   are not listed here and always show for staff. Mirrors the gate each
   page enforces in its own boot(). */
const NAV_ACCESS = {
  "corporate.html": { perm: "view_corporates" },
  "payments.html": { perm: "view_payments" },
  "accounting.html": { perm: "view_payments" },
  "staff.html": { adminOnly: true },
  "activity.html": { adminOnly: true },
  "backups.html": { adminOnly: true },
  "handover.html": { adminOnly: true }
};

/* Reveals the nav, first removing links the signed-in person isn't
   allowed to use. Admins see everything. If anything fails, we fall
   back to showing the full nav (the pages still enforce access on
   their own, so this is convenience, not the security boundary). */
/* Fills the header profile button/menu with the signed-in person's own
   name, initials and role. Reads only their own row (self-read RLS). */
async function fillStaffProfileMenu(sb, user, isAdmin) {
  if (!user) return;
  let prof = {};
  try {
    const res = await sb.from("staff_profiles").select("full_name, department").eq("user_id", user.id).maybeSingle();
    prof = res.data || {};
  } catch (e) { /* best-effort */ }
  const name = prof.full_name || user.email || "Account";
  const roleText = isAdmin ? "Owner / Admin" : (prof.department ? "Staff · " + prof.department : "Staff");
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const initials = (parts.length >= 2 ? parts[0][0] + parts[1][0] : String(name).slice(0, 2)).toUpperCase();
  const av = document.getElementById("staff-profile-av");
  const shortName = document.getElementById("staff-profile-name");
  const fullName = document.getElementById("staff-profile-fullname");
  const roleEl = document.getElementById("staff-profile-role");
  if (av) av.textContent = initials;
  if (shortName) shortName.textContent = parts[0] || name;
  if (fullName) fullName.textContent = name;
  if (roleEl) roleEl.textContent = roleText + (user.email ? " · " + user.email : "");
  const btn = document.getElementById("staff-profile-btn");
  if (btn && isAdmin) btn.classList.add("is-admin");
}

let __staffAccess = null; // { isAdmin, perms } cached after first resolve

/* Removes any gated element (nav link, menu item, hub card) the signed-in
   person may not use, then drops now-empty groups. Safe to call repeatedly
   and on any subtree (e.g. a hub injected after the first pass). */
function pruneStaffAccess(root) {
  if (!__staffAccess) return;
  const scope = root || document;
  scope.querySelectorAll("[data-admin],[data-perm]").forEach(function (el) {
    let allowed = true;
    if (el.hasAttribute("data-admin")) allowed = __staffAccess.isAdmin;
    else if (el.hasAttribute("data-perm")) allowed = __staffAccess.isAdmin || Boolean(__staffAccess.perms[el.getAttribute("data-perm")]);
    if (!allowed) el.remove();
  });
  scope.querySelectorAll(".tools-group, .hub-group").forEach(function (g) {
    if (!g.querySelector(".tools-item, .hub-card")) g.remove();
  });
}

async function showStaffNav() {
  const nav = document.querySelector(".staff-nav");
  try {
    const sb = await KridiyaAuth.client();
    const adminRes = await sb.rpc("is_admin");
    const isAdmin = adminRes.data === true;
    const navUser = await KridiyaAuth.currentUser();
    fillStaffProfileMenu(sb, navUser, isAdmin);
    let perms = {};
    if (!isAdmin && navUser) {
      const permRes = await sb.from("staff_permissions").select("*").eq("user_id", navUser.id).maybeSingle();
      perms = permRes.data || {};
    }
    __staffAccess = { isAdmin: isAdmin, perms: perms };
    pruneStaffAccess(document);
    loadStaffNotifications();
  } catch (e) { /* best-effort: show everything on error */ }
  if (nav) nav.hidden = false;
}

let __staffNotifications = [];

function staffNotificationWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
  if (seconds < 86400) return Math.floor(seconds / 3600) + "h ago";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function renderStaffNotifications() {
  const list = document.getElementById("staff-notification-list");
  const badge = document.getElementById("staff-notification-count");
  const summary = document.getElementById("staff-notification-summary");
  if (!list || !badge) return;
  const unread = __staffNotifications.filter(function (item) { return item.status === "unread"; }).length;
  badge.textContent = unread > 99 ? "99+" : String(unread);
  badge.hidden = unread === 0;
  if (summary) summary.textContent = unread ? unread + " unread" : "You are all caught up";
  list.innerHTML = __staffNotifications.length ? __staffNotifications.map(function (item) {
    return '<article class="staff-notification-item priority-' + KridiyaAuth.escapeHTML(item.priority || "normal") + (item.status === "unread" ? " is-unread" : "") + '" data-notification-id="' + KridiyaAuth.escapeHTML(item.id) + '">' +
      '<button type="button" class="staff-notification-open" data-notification-open="' + KridiyaAuth.escapeHTML(item.id) + '"><span class="staff-notification-dot"></span><span><b>' + KridiyaAuth.escapeHTML(item.title) + '</b><small>' + KridiyaAuth.escapeHTML(item.body || "") + '</small><em>' + KridiyaAuth.escapeHTML(staffNotificationWhen(item.created_at)) + '</em></span></button>' +
      '<button type="button" class="staff-notification-done" data-notification-done="' + KridiyaAuth.escapeHTML(item.id) + '" aria-label="Complete notification">✓</button>' +
    '</article>';
  }).join("") : '<p class="staff-notification-empty">No notifications need your attention.</p>';
}

async function updateStaffNotification(id, changes) {
  try {
    const sb = await KridiyaAuth.client();
    const result = await sb.from("staff_notifications").update(changes).eq("id", id);
    if (result.error) throw result.error;
    __staffNotifications = __staffNotifications.map(function (item) { return item.id === id ? Object.assign({}, item, changes) : item; }).filter(function (item) { return item.status !== "done"; });
    renderStaffNotifications();
  } catch (e) { toast("Could not update notification."); }
}

async function loadStaffNotifications() {
  const list = document.getElementById("staff-notification-list");
  if (!list || !window.KridiyaAuth) return;
  try {
    const sb = await KridiyaAuth.client();
    const result = await sb.from("staff_notifications")
      .select("id, category, priority, title, body, action_url, status, created_at")
      .in("status", ["unread", "read"])
      .order("created_at", { ascending: false })
      .limit(40);
    if (result.error) throw result.error;
    __staffNotifications = result.data || [];
    renderStaffNotifications();
  } catch (e) {
    list.innerHTML = '<p class="staff-notification-empty">Notifications are temporarily unavailable.</p>';
  }
}

document.addEventListener("click", async function (event) {
  const open = event.target.closest("[data-notification-open]");
  if (open) {
    const id = open.getAttribute("data-notification-open");
    const item = __staffNotifications.find(function (row) { return row.id === id; });
    if (item && item.status === "unread") await updateStaffNotification(id, { status: "read", read_at: new Date().toISOString() });
    if (item && item.action_url) location.href = item.action_url;
  }
  const done = event.target.closest("[data-notification-done]");
  if (done) await updateStaffNotification(done.getAttribute("data-notification-done"), { status: "done" });
  const readAll = event.target.closest("#staff-notification-read-all");
  if (readAll) {
    const unread = __staffNotifications.filter(function (item) { return item.status === "unread"; });
    await Promise.all(unread.map(function (item) { return updateStaffNotification(item.id, { status: "read", read_at: new Date().toISOString() }); }));
  }
});

document.addEventListener("DOMContentLoaded", renderStaffChrome);



