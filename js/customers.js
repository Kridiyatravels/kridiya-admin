/* ============================================================
   Kridiya Travel — Customers (admin.kridiyatravel.com)
   A single, expandable profile per person, merged by email across
   website accounts AND guests. Aggregates enquiries, bookings and
   contact details that are otherwise scattered. Read access is
   enforced server-side by RLS; every load is best-effort so the page
   still works for staff with limited permissions.
   ============================================================ */
"use strict";

(function () {
  if (document.body.dataset.page !== "customers") return;

  let sb = null;
  let currentStaffId = null;
  let allGroups = [];
  let unlinkedBookings = [];
  let moneyVisible = false; // true once bookings could be read
  let activeSort = "recent_desc";

  /* ---------- helpers ---------- */
  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }
  function normEmail(e) { return String(e || "").trim().toLowerCase(); }
  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function money(amount, currency) {
    const n = Number(amount || 0);
    return (currency || "AED") + " " + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function initialsOf(name, email) {
    const src = (name || email || "?").trim();
    const parts = src.split(/\s+/).filter(Boolean);
    return (parts.length >= 2 ? parts[0][0] + parts[1][0] : src.slice(0, 2)).toUpperCase();
  }
  function digits(s) { return String(s || "").replace(/[^\d]/g, ""); }
  function waLink(phone) {
    const d = digits(phone);
    return d ? "https://wa.me/" + d : "";
  }

  /* ---------- data loading (each independent + best-effort) ---------- */
  async function safe(promise, fallback) {
    try {
      const res = await promise;
      if (res && res.error) return fallback;
      return (res && res.data) || fallback;
    } catch (e) { return fallback; }
  }
  async function loadAll() {
    const [enquiries, profiles, customers, bookings, staffProfiles, staffRoles, staffList] = await Promise.all([
      safe(sb.from("enquiries").select("id, reference, full_name, email, phone, service_type, status, summary, user_id, created_at").order("created_at", { ascending: false }), []),
      safe(sb.from("profiles").select("id, full_name, preferred_email, phone, whatsapp, nationality, created_at"), []),
      safe(sb.from("customers").select("id, auth_user_id, full_name, email, phone, whatsapp, nationality, notes, source, active, created_at"), []),
      safe(sb.from("bookings").select("id, booking_reference, service_type, title, route_or_destination, travel_start, travel_end, amount, currency, status, enquiry_id, customer_id, user_id, created_at").order("created_at", { ascending: false }), null),
      safe(sb.from("staff_profiles").select("user_id"), []),
      safe(sb.from("staff_roles").select("user_id"), []),
      safe(sb.rpc("list_staff"), [])
    ]);
    moneyVisible = Array.isArray(bookings);
    return {
      enquiries: enquiries,
      profiles: profiles,
      customers: customers,
      bookings: bookings || [],
      staffProfiles: staffProfiles,
      staffRoles: staffRoles,
      staffList: staffList
    };
  }

  /* ---------- merge everything into one group per email ---------- */
  function touchDates(g, iso) {
    if (!iso) return;
    const t = new Date(iso).getTime();
    if (isNaN(t)) return;
    if (g.firstAt == null || t < g.firstAt) g.firstAt = t;
    if (g.lastAt == null || t > g.lastAt) g.lastAt = t;
  }
  function getGroup(map, email) {
    const key = normEmail(email);
    if (!key) return null;
    let g = map.get(key);
    if (!g) {
      g = {
        key: key, email: email || key, name: "", phone: "", whatsapp: "", nationality: "",
        userId: null, hasAccount: false, source: "", notes: "", customerId: null, active: true,
        firstAt: null, lastAt: null, enquiries: [], bookings: []
      };
      map.set(key, g);
    }
    return g;
  }

  function buildGroups(data) {
    const map = new Map();
    const staffUserIds = new Set();
    const staffEmails = new Set();

    (data.staffProfiles || []).forEach(function (s) { if (s.user_id) staffUserIds.add(s.user_id); });
    (data.staffRoles || []).forEach(function (s) { if (s.user_id) staffUserIds.add(s.user_id); });
    (data.staffList || []).forEach(function (s) {
      if (s.user_id) staffUserIds.add(s.user_id);
      if (s.email) staffEmails.add(normEmail(s.email));
    });
    data.profiles.forEach(function (p) {
      if (p.id && staffUserIds.has(p.id) && p.preferred_email) staffEmails.add(normEmail(p.preferred_email));
    });
    function isStaffPerson(email, userId) {
      return (userId && staffUserIds.has(userId)) || (email && staffEmails.has(normEmail(email)));
    }

    // enquiries drive the base (staff can always read them). Iterated newest
    // first, so the first non-empty value we keep is the most recent.
    data.enquiries.forEach(function (e) {
      if (isStaffPerson(e.email, e.user_id)) return;
      const g = getGroup(map, e.email);
      if (!g) return;
      if (e.full_name && !g.name) g.name = e.full_name;
      if (e.phone && !g.phone) g.phone = e.phone;
      if (e.user_id) { g.userId = e.user_id; g.hasAccount = true; }
      g.enquiries.push(e);
      touchDates(g, e.created_at);
    });

    // website account profiles — may add people who never enquired
    data.profiles.forEach(function (p) {
      if (isStaffPerson(p.preferred_email, p.id)) return;
      const g = getGroup(map, p.preferred_email);
      if (!g) return;
      g.hasAccount = true;
      if (p.id) g.userId = p.id;
      if (p.full_name && !g.name) g.name = p.full_name;
      if (p.phone && !g.phone) g.phone = p.phone;
      if (p.whatsapp && !g.whatsapp) g.whatsapp = p.whatsapp;
      if (p.nationality && !g.nationality) g.nationality = p.nationality;
      touchDates(g, p.created_at);
    });

    // CRM customer records — notes, source, account link
    data.customers.forEach(function (c) {
      if (isStaffPerson(c.email, c.auth_user_id)) return;
      const g = getGroup(map, c.email);
      if (!g) return;
      if (c.full_name && !g.name) g.name = c.full_name;
      if (c.phone && !g.phone) g.phone = c.phone;
      if (c.whatsapp && !g.whatsapp) g.whatsapp = c.whatsapp;
      if (c.nationality && !g.nationality) g.nationality = c.nationality;
      if (c.notes) g.notes = c.notes;
      if (c.source) g.source = c.source;
      g.customerId = c.id;
      if (c.auth_user_id) { g.userId = c.auth_user_id; g.hasAccount = true; }
      if (c.active === false) g.active = false;
      touchDates(g, c.created_at);
    });

    // bookings — resolve to an email via enquiry / customer / account
    const enqEmail = {}, custEmail = {}, userEmail = {};
    data.enquiries.forEach(function (e) {
      if (isStaffPerson(e.email, e.user_id)) return;
      enqEmail[e.id] = normEmail(e.email);
      if (e.user_id) userEmail[e.user_id] = normEmail(e.email);
    });
    data.profiles.forEach(function (p) {
      if (isStaffPerson(p.preferred_email, p.id)) return;
      if (p.id && p.preferred_email) userEmail[p.id] = normEmail(p.preferred_email);
    });
    data.customers.forEach(function (c) {
      if (isStaffPerson(c.email, c.auth_user_id)) return;
      if (c.email) custEmail[c.id] = normEmail(c.email);
      if (c.auth_user_id && c.email) userEmail[c.auth_user_id] = normEmail(c.email);
    });

    unlinkedBookings = [];
    data.bookings.forEach(function (b) {
      const key =
        (b.enquiry_id && enqEmail[b.enquiry_id]) ||
        (b.customer_id && custEmail[b.customer_id]) ||
        (b.user_id && userEmail[b.user_id]) || "";
      if (key) {
        const g = getGroup(map, key);
        if (g) { g.bookings.push(b); touchDates(g, b.created_at); return; }
      }
      unlinkedBookings.push(b); // walk-in / corporate booking with no customer email
    });

    const groups = Array.from(map.values());
    groups.forEach(function (g) { if (!g.name) g.name = g.email; });
    groups.sort(function (a, b) { return (b.lastAt || 0) - (a.lastAt || 0); });
    return groups;
  }

  /* ---------- rendering ---------- */
  function bookingValue(g) {
    return g.bookings.reduce(function (s, b) { return s + Number(b.amount || 0); }, 0);
  }
  function openEnquiries(g) {
    return g.enquiries.filter(function (e) {
      return ["confirmed", "booked", "documents_sent", "closed"].indexOf(String(e.status || "").toLowerCase()) === -1;
    }).length;
  }
  function needsCleanup(g) {
    return !g.name || g.name === g.email || !g.phone || (g.bookings.length && !g.customerId);
  }
  function needsPortalInvite(g) {
    return !g.hasAccount && (g.bookings.length > 0 || g.enquiries.length > 1);
  }
  function portalStage(g) {
    if (g.hasAccount && g.bookings.length) return { label: "Portal ready", tone: "success", action: "Customer can use their account for bookings and profile history." };
    if (g.hasAccount) return { label: "Account ready", tone: "info", action: "Account exists. Keep enquiries and future bookings linked by email." };
    if (needsPortalInvite(g)) return { label: "Invite needed", tone: "warn", action: "Ask customer to create/login so old guest enquiries attach by email." };
    if (needsCleanup(g)) return { label: "Clean profile", tone: "warn", action: "Complete name, phone, and customer link before handover." };
    return { label: "Guest lead", tone: "neutral", action: "Keep as guest until they book or enquire again." };
  }
  function portalReady(g) {
    return g.hasAccount && (!g.bookings.length || g.bookings.every(function (b) { return !!b.booking_reference; }));
  }
  function portalInviteText(g) {
    return "Hi " + (g.name && g.name !== g.email ? g.name.split(/\s+/)[0] : "there") + ", you can create your Kridiya Travel account using this email (" + g.email + ") so your enquiries and future bookings stay in one place: https://kridiyatravel.com/login.html";
  }
  function renderCustomerControl(visible) {
    const panel = document.getElementById("customer-control-panel");
    if (!panel) return;
    const total = allGroups.length || 1;
    const account = allGroups.filter(function (g) { return g.hasAccount; }).length;
    const invite = allGroups.filter(needsPortalInvite).length;
    const cleanup = allGroups.filter(needsCleanup).length;
    const bookedNoAccount = allGroups.filter(function (g) { return g.bookings.length && !g.hasAccount; }).length;
    const percent = Math.round((account / total) * 100);
    let filter = "portal_needed";
    let next = "Invite customers with bookings or repeat enquiries to create their portal account.";
    if (cleanup) { filter = "cleanup"; next = "Clean incomplete customer profiles before finance or document handover."; }
    else if (!invite && bookedNoAccount) { filter = "portal_needed"; next = "Link booked guest customers to online accounts." }
    else if (!invite && !cleanup) { filter = "portal_ready"; next = "Portal readiness looks good. Keep future bookings linked by email."; }
    panel.innerHTML =
      '<div class="customer-control-summary"><div><b>' + esc(percent) + '%</b><span>Account readiness</span><p>' + esc(account) + ' account customer(s) / ' + esc(allGroups.length) + ' total profiles</p></div><button class="btn btn-primary js-customer-filter" data-filter="' + esc(filter) + '" type="button">Show next queue</button></div>' +
      '<div class="customer-control-grid">' +
        '<div><b>' + esc(invite) + '</b><span>Needs portal invite</span></div>' +
        '<div><b>' + esc(bookedNoAccount) + '</b><span>Booked guests</span></div>' +
        '<div><b>' + esc(cleanup) + '</b><span>Needs cleanup</span></div>' +
        '<div><b>' + esc(visible.length) + '</b><span>Current view</span></div>' +
      '</div>' +
      '<div class="customer-control-next"><b>Next customer action</b><span>' + esc(next) + '</span></div>';
  }
  function accountBadge(g) {
    return g.hasAccount
      ? '<span class="cust-badge cust-badge-account">' + icon("user") + " Online account</span>"
      : '<span class="cust-badge cust-badge-guest">Guest — no account yet</span>';
  }

  function renderStats() {
    const row = document.getElementById("cust-stat-row");
    if (!row) return;
    const total = allGroups.length;
    const accounts = allGroups.filter(function (g) { return g.hasAccount; }).length;
    const withBooking = allGroups.filter(function (g) { return g.bookings.length; }).length;
    const tiles = [
      { num: total, label: "Total customers", accent: "var(--status-received)" },
      { num: accounts, label: "With online account", accent: "var(--status-confirmed)" },
      { num: total - accounts, label: "Guests (no account)", accent: "var(--status-checking)" },
      { num: withBooking, label: "With a booking", accent: "var(--status-booked)" }
    ];
    row.innerHTML = tiles.map(function (t) {
      return '<div class="stat-tile" style="--tile-accent:' + t.accent + '"><div class="num">' + t.num + '</div><div class="label">' + t.label + "</div></div>";
    }).join("");
  }

  function matchesQuery(g, q) {
    if (!q) return true;
    const hay = [g.name, g.email, g.phone, g.whatsapp].join(" ").toLowerCase() + " " +
      g.enquiries.map(function (e) { return e.reference; }).join(" ").toLowerCase() + " " +
      g.bookings.map(function (b) { return b.booking_reference; }).join(" ").toLowerCase();
    return hay.indexOf(q) >= 0;
  }
  function matchesFilter(g, f) {
    if (f === "account") return g.hasAccount;
    if (f === "guest") return !g.hasAccount;
    if (f === "booked") return g.bookings.length > 0;
    if (f === "portal_ready") return portalReady(g);
    if (f === "portal_needed") return needsPortalInvite(g);
    if (f === "cleanup") return needsCleanup(g);
    return true;
  }

  function sortRank(g) {
    if (needsPortalInvite(g)) return 0;
    if (needsCleanup(g)) return 1;
    if (!g.hasAccount) return 2;
    return 3;
  }

  function sortedGroups(rows) {
    return rows.slice().sort(function (a, b) {
      if (activeSort === "name_asc") return String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""));
      if (activeSort === "bookings_desc") return b.bookings.length - a.bookings.length || (b.lastAt || 0) - (a.lastAt || 0);
      if (activeSort === "portal_first") return sortRank(a) - sortRank(b) || (b.lastAt || 0) - (a.lastAt || 0);
      return (b.lastAt || 0) - (a.lastAt || 0);
    });
  }

  function syncCustomerSort() {
    const wrap = document.getElementById("cust-sort");
    if (!wrap) return;
    const active = wrap.querySelector('[data-sort="' + activeSort + '"]') || wrap.querySelector("[data-sort]");
    wrap.querySelectorAll(".booking-sort-item").forEach(function (btn) {
      const on = btn === active;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-checked", String(on));
    });
    const label = active && active.querySelector("b");
    const text = document.querySelector("#cust-sort-btn b");
    if (label && text) text.textContent = label.textContent;
  }

  function enquiryRowHTML(e) {
    return '<div class="cust-line">' +
      '<span class="status-badge" style="' + statusStyle(e.status) + '">' + esc(KridiyaAuth.statusLabel(e.status)) + "</span>" +
      '<span class="cust-line-main"><b>' + esc(KridiyaAuth.statusLabel(e.service_type)) + "</b> · " + esc(e.reference) +
        (e.summary ? '<span class="cust-line-sub">' + esc(e.summary) + "</span>" : "") +
      "</span>" +
      '<span class="cust-line-date">' + esc(fmtDate(e.created_at)) + "</span>" +
      '<a class="btn btn-outline btn-sm" href="admin.html?focus=' + esc(e.id) + '">Open</a>' +
      '<a class="btn btn-outline btn-sm" href="documents.html?enquiry=' + esc(e.id) + '">Document</a>' +
      "</div>";
  }
  function bookingRowHTML(b) {
    const when = b.travel_start ? fmtDate(b.travel_start) + (b.travel_end ? " – " + fmtDate(b.travel_end) : "") : fmtDate(b.created_at);
    return '<div class="cust-line">' +
      '<span class="status-badge" style="' + statusStyle(b.status) + '">' + esc(KridiyaAuth.statusLabel(b.status)) + "</span>" +
      '<span class="cust-line-main"><b>' + esc(b.title || KridiyaAuth.statusLabel(b.service_type)) + "</b> · " + esc(b.booking_reference) +
        (b.route_or_destination ? '<span class="cust-line-sub">' + esc(b.route_or_destination) + " · " + esc(when) + "</span>" : '<span class="cust-line-sub">' + esc(when) + "</span>") +
      "</span>" +
      (b.amount != null ? '<span class="cust-line-amount">' + esc(money(b.amount, b.currency)) + "</span>" : "") +
      '<a class="btn btn-outline btn-sm" href="booking-detail.html?id=' + esc(b.id) + '">Open</a>' +
      "</div>";
  }

  function cardHTML(g) {
    const wa = waLink(g.whatsapp || g.phone);
    const totalValue = bookingValue(g);
    const stage = portalStage(g);
    return (
      '<div class="account-main cust-card" data-key="' + esc(g.key) + '">' +
        '<div class="cust-head">' +
          '<div class="cust-avatar">' + esc(initialsOf(g.name, g.email)) + "</div>" +
          '<div class="cust-head-main">' +
            '<div class="cust-name-line"><b>' + esc(g.name) + "</b>" +
              '<span class="cust-account-state">' + accountBadge(g) +
                (g.active === false ? '<span class="cust-badge cust-badge-guest">Archived</span>' : "") +
              "</span>" +
            "</div>" +
            '<div class="cust-sub-line">' + esc(g.email) + (g.phone ? " · " + esc(g.phone) : "") + "</div>" +
          "</div>" +
          '<div class="cust-head-meta">' +
            '<span class="cust-chip">' + g.enquiries.length + " enquir" + (g.enquiries.length === 1 ? "y" : "ies") + "</span>" +
            (g.bookings.length ? '<span class="cust-chip cust-chip-strong">' + g.bookings.length + " booking" + (g.bookings.length === 1 ? "" : "s") + "</span>" : "") +
            (moneyVisible && totalValue > 0 ? '<span class="cust-chip">' + esc(money(totalValue, g.bookings[0] && g.bookings[0].currency)) + "</span>" : "") +
          "</div>" +
          icon("chevron", "cust-chevron") +
        "</div>" +
        '<div class="cust-body" hidden>' +
          '<div class="customer-portal-strip customer-portal-' + esc(stage.tone) + '">' +
            '<div><b>' + esc(stage.label) + '</b><p>' + esc(stage.action) + '</p></div>' +
            '<div class="customer-portal-metrics">' +
              '<span><b>' + esc(openEnquiries(g)) + '</b><small>Open enquiries</small></span>' +
              '<span><b>' + esc(g.bookings.length) + '</b><small>Bookings</small></span>' +
              '<span><b>' + esc(needsCleanup(g) ? "Yes" : "No") + '</b><small>Cleanup</small></span>' +
            '</div>' +
          '</div>' +
          '<div class="cust-actions">' +
            (wa ? '<a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="' + wa + '">' + icon("whatsapp") + " WhatsApp</a>" : "") +
            '<a class="btn btn-outline btn-sm" href="mailto:' + esc(g.email) + '">' + icon("mail") + " Email</a>" +
            (!g.hasAccount ? '<button type="button" class="btn btn-outline btn-sm js-copy-portal-invite" data-key="' + esc(g.key) + '">Copy portal invite</button>' : "") +
            (g.enquiries.length ? '<a class="btn btn-outline btn-sm" href="admin.html?email=' + encodeURIComponent(g.email) + '">View enquiries</a>' : "") +
          "</div>" +
          '<div class="cust-kv">' +
            '<span class="k">Email</span><span class="v">' + esc(g.email) + "</span>" +
            (g.phone ? '<span class="k">Phone</span><span class="v">' + esc(g.phone) + "</span>" : "") +
            (g.whatsapp ? '<span class="k">WhatsApp</span><span class="v">' + esc(g.whatsapp) + "</span>" : "") +
            (g.nationality ? '<span class="k">Nationality</span><span class="v">' + esc(g.nationality) + "</span>" : "") +
            '<span class="k">Account</span><span class="v">' + (g.hasAccount ? "Registered website account" : "Guest — enquired without an account") + "</span>" +
            (g.source ? '<span class="k">Source</span><span class="v">' + esc(g.source) + "</span>" : "") +
            (g.firstAt ? '<span class="k">First contact</span><span class="v">' + esc(fmtDate(new Date(g.firstAt).toISOString())) + "</span>" : "") +
            (g.lastAt ? '<span class="k">Last activity</span><span class="v">' + esc(fmtDate(new Date(g.lastAt).toISOString())) + "</span>" : "") +
          "</div>" +
          (g.notes ? '<div class="cust-notes"><b>Notes</b><p>' + esc(g.notes) + "</p></div>" : "") +
          '<h3 class="cust-section-title">Enquiries (' + g.enquiries.length + ")</h3>" +
          (g.enquiries.length ? g.enquiries.map(enquiryRowHTML).join("") : '<p class="form-note">No enquiries.</p>') +
          '<h3 class="cust-section-title">Bookings (' + g.bookings.length + ")</h3>" +
          (g.bookings.length ? g.bookings.map(bookingRowHTML).join("") : '<p class="form-note">No bookings yet.</p>') +
        "</div>" +
      "</div>"
    );
  }

  function renderList() {
    renderStats();
    const listEl = document.getElementById("cust-list");
    const q = (document.getElementById("cust-search").value || "").trim().toLowerCase();
    const f = document.getElementById("cust-filter").value;
    const visible = sortedGroups(allGroups.filter(function (g) { return matchesFilter(g, f) && matchesQuery(g, q); }));
    syncCustomerSort();
    renderCustomerControl(visible);
    document.getElementById("cust-count").textContent = visible.length + " of " + allGroups.length + " customers";

    let html = visible.length
      ? visible.map(cardHTML).join("")
      : '<div class="account-main empty-state"><p>No customers match.</p></div>';

    if (unlinkedBookings.length && !q && !f) {
      html += '<div class="account-main cust-card cust-unlinked"><div class="cust-head-main">' +
        '<div class="cust-name-line"><b>Unlinked bookings</b><span class="cust-badge cust-badge-guest">No customer email</span></div>' +
        '<div class="cust-sub-line">' + unlinkedBookings.length + ' booking(s) not tied to a customer email (e.g. walk-in or corporate).</div>' +
        "</div><div>" + unlinkedBookings.map(bookingRowHTML).join("") + "</div></div>";
    }
    listEl.innerHTML = html;
  }

  function wireEvents() {
    const listEl = document.getElementById("cust-list");
    listEl.addEventListener("click", function (e) {
      const inviteBtn = e.target.closest(".js-copy-portal-invite");
      if (inviteBtn) {
        const group = allGroups.find(function (g) { return g.key === inviteBtn.dataset.key; });
        if (!group) return;
        const text = portalInviteText(group);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () { toast("Portal invite copied."); },
            function () { toast("Could not copy automatically."); }
          );
        } else {
          toast("Copy not supported on this browser.");
        }
        return;
      }
      if (e.target.closest("a")) return; // let links work
      const head = e.target.closest(".cust-head");
      if (!head) return;
      const card = head.closest(".cust-card");
      const body = card.querySelector(".cust-body");
      if (!body) return;
      const open = body.hidden;
      body.hidden = !open;
      card.classList.toggle("open", open);
    });
    let searchTimer = null;
    document.getElementById("cust-search").addEventListener("input", function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderList, 150);
    });
    document.getElementById("cust-filter").addEventListener("change", renderList);
    const sortBtn = document.getElementById("cust-sort-btn");
    const sortMenu = document.getElementById("cust-sort-menu");
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
        activeSort = btn.dataset.sort || "recent_desc";
        sortMenu.hidden = true;
        sortBtn.setAttribute("aria-expanded", "false");
        renderList();
      });
      document.addEventListener("click", function (e) {
        if (!sortMenu.hidden && !document.getElementById("cust-sort").contains(e.target)) {
          sortMenu.hidden = true;
          sortBtn.setAttribute("aria-expanded", "false");
        }
      });
    }
    const control = document.getElementById("customer-control-panel");
    if (control) {
      control.addEventListener("click", function (e) {
        const btn = e.target.closest(".js-customer-filter");
        if (!btn) return;
        document.getElementById("cust-filter").value = btn.dataset.filter || "";
        renderList();
      });
    }
  }

  async function boot() {
    const gate = document.getElementById("cust-gate");
    const app = document.getElementById("cust-app");

    const user = await KridiyaAuth.currentUser();
    if (!user) { renderLoginForm(gate, boot); return; }
    currentStaffId = user.id;

    sb = await KridiyaAuth.client();
    let staff = false;
    try {
      const check = await sb.rpc("is_staff");
      staff = !check.error && check.data === true;
    } catch (e) { staff = false; }

    if (!staff) {
      gate.innerHTML =
        '<div class="account-main empty-state">' +
          "<p><b>You do not have staff access.</b><br>This page is for Kridiya Travel staff only.</p>" +
          '<button type="button" class="btn btn-primary" id="staff-gate-logout">Log out</button>' +
        "</div>";
      document.getElementById("staff-gate-logout").addEventListener("click", async function () {
        await KridiyaAuth.logout();
        location.reload();
      });
      return;
    }

    try {
      const data = await loadAll();
      allGroups = buildGroups(data);
    } catch (err) {
      gate.innerHTML = '<div class="account-main empty-state"><p>Could not load customers: ' + esc(err.message) + "</p></div>";
      return;
    }

    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    renderList();
    wireEvents();

    // Deep-link from Enquiries ("Customer" button): open that person's card.
    const wantEmail = normEmail(new URLSearchParams(location.search).get("email"));
    if (wantEmail) {
      const card = document.querySelector('.cust-card[data-key="' + (window.CSS && CSS.escape ? CSS.escape(wantEmail) : wantEmail) + '"]');
      if (card) {
        const body = card.querySelector(".cust-body");
        if (body) { body.hidden = false; card.classList.add("open"); }
        if (card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
