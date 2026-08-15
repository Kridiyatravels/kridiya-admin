"use strict";
(function () {
  if (document.body.dataset.page !== "bookings") return;
  let sb = null;
  let corporateAccounts = [];
  let allBookings = [];
  let activeSearch = "";
  let activeFilter = "";
  let activeSort = "created_desc";
  let canApproveDiscounts = false;

  const SORT_OPTIONS = [
    { value: "created_desc", label: "Newest first", desc: "Recently created" },
    { value: "created_asc", label: "Oldest first", desc: "Oldest records" },
    { value: "travel_asc", label: "Travel date", desc: "Soonest departure" },
    { value: "name_asc", label: "Name", desc: "A to Z" },
    { value: "amount_desc", label: "Amount", desc: "High to low" },
    { value: "payment_first", label: "Payment risk", desc: "Unpaid first" }
  ];

  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }
  function label(v) { return String(v || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function money(v, c) { return v == null ? "Hidden" : (c || "AED") + " " + Number(v || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  async function boot() {
    const gate = document.getElementById("bookings-gate");
    const app = document.getElementById("bookings-app");
    const user = await KridiyaAuth.currentUser();
    if (!user) { renderLoginForm(gate, boot); return; }
    sb = await KridiyaAuth.client();
    const staffCheck = await sb.rpc("is_staff");
    if (staffCheck.error || staffCheck.data !== true) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>You do not have access.</b><br>Bookings are for staff only.</p></div>';
      return;
    }
    const discountCheck = await sb.rpc("has_staff_permission", { permission_name: "approve_discounts" });
    canApproveDiscounts = !discountCheck.error && discountCheck.data === true;
    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    document.getElementById("booking-new-toggle").addEventListener("click", function () {
      const card = document.getElementById("booking-form-card");
      card.hidden = !card.hidden;
      if (!card.hidden) {
        form.title.focus();
        history.replaceState(null, "", "bookings.html#new");
      }
    });
    const form = document.getElementById("booking-form");
    form.addEventListener("submit", createBooking);
    form.booking_kind.addEventListener("change", syncCorporateFields);
    form.corporate_account_id.addEventListener("change", syncCorporateContacts);
    form.corporate_contact_id.addEventListener("change", fillCorporateContact);
    // Stop the bad date being enterable at all, rather than only catching it
    // on submit: the picker itself refuses to offer a day before departure.
    form.travel_start.addEventListener("change", function () {
      form.travel_end.min = form.travel_start.value || "";
      if (travelDatesOutOfOrder(form)) form.travel_end.value = "";
    });
    await loadCorporateAccounts();
    syncCorporateFields();
    await loadBookings();
    if (location.hash === "#new") {
      document.getElementById("booking-form-card").hidden = false;
      form.title.focus();
    }
  }

  async function loadCorporateAccounts() {
    const result = await sb.rpc("list_corporate_accounts");
    corporateAccounts = result.error ? [] : (result.data || []);
    const form = document.getElementById("booking-form");
    form.corporate_account_id.innerHTML = '<option value="">Choose company</option>' + corporateAccounts.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.company_name) + '</option>';
    }).join("");
  }

  function selectedCompany() {
    const form = document.getElementById("booking-form");
    return corporateAccounts.find(function (c) { return c.id === form.corporate_account_id.value; }) || null;
  }

  function syncCorporateFields() {
    const form = document.getElementById("booking-form");
    const isCorporate = form.booking_kind.value === "corporate";
    document.querySelectorAll(".corporate-booking-field").forEach(function (el) { el.hidden = !isCorporate; });
    form.corporate_account_id.required = isCorporate;
    form.customer_name.required = !isCorporate || !form.corporate_contact_id.value;
    form.customer_name.placeholder = isCorporate ? "Requester name if no saved contact" : "Customer name";
    syncCorporateContacts();
  }

  function syncCorporateContacts() {
    const form = document.getElementById("booking-form");
    const company = selectedCompany();
    const contacts = company ? (company.contacts || []) : [];
    form.corporate_contact_id.innerHTML = '<option value="">Choose contact or type below</option>' + contacts.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.full_name) + (c.email ? ' - ' + esc(c.email) : '') + '</option>';
    }).join("");
    fillCorporateCompanyDefaults(company);
  }

  function fillCorporateCompanyDefaults(company) {
    const form = document.getElementById("booking-form");
    if (!company || form.corporate_contact_id.value) return;
    if (!form.customer_email.value) form.customer_email.value = company.billing_email || company.accounts_email || "";
    if (!form.customer_phone.value) form.customer_phone.value = company.phone || "";
    if (company.lpo_required && form.notes.value.indexOf("LPO required") === -1) {
      form.notes.value = (form.notes.value ? form.notes.value + "\n" : "") + "LPO required for this corporate account.";
    }
  }

  function fillCorporateContact() {
    const form = document.getElementById("booking-form");
    const company = selectedCompany();
    const contact = company && (company.contacts || []).find(function (c) { return c.id === form.corporate_contact_id.value; });
    form.customer_name.required = !form.corporate_contact_id.value;
    if (!contact) return;
    form.customer_name.value = contact.full_name || "";
    form.customer_email.value = contact.email || "";
    form.customer_phone.value = contact.phone || contact.whatsapp || "";
  }

  // Date inputs give YYYY-MM-DD, which sorts correctly as a plain string.
  // Comparing them as strings avoids Date()/toISOString(), which shifts a
  // local date across the day boundary depending on the timezone.
  function travelDatesOutOfOrder(form) {
    const start = form.travel_start.value;
    const end = form.travel_end.value;
    return Boolean(start && end && end < start);
  }

  async function createBooking() {
    const form = document.getElementById("booking-form");
    const btn = form.querySelector('button[type="submit"]');

    // Nothing was validating this, and a live booking already carries
    // "Travel: 2026-07-29 - 2026-07-14" — an end date two weeks before its
    // start. Every downstream document reads these dates.
    if (travelDatesOutOfOrder(form)) {
      toast("Return date is before the departure date. Check the travel dates.");
      form.travel_end.focus();
      return;
    }

    const sellingPrice = form.selling_price.value ? Number(form.selling_price.value) : null;
    const supplierCost = form.supplier_cost.value ? Number(form.supplier_cost.value) : null;
    if (sellingPrice != null && supplierCost != null && sellingPrice < supplierCost) {
      if (!canApproveDiscounts) {
        toast("Selling price is below supplier cost. An owner or authorized discount approver must create this exception.");
        form.selling_price.focus();
        return;
      }
      if (form.notes.value.trim().length < 10) {
        toast("Add a written reason of at least 10 characters for the negative-margin exception.");
        form.notes.focus();
        return;
      }
      if (!window.confirm("Approve this below-cost booking as a negative-margin exception? Your identity, time, values, and written reason will be retained.")) return;
    }

    btn.disabled = true;
    const isCorporate = form.booking_kind.value === "corporate";
    const payload = {
      p_title: form.title.value.trim(),
      p_service_type: form.service_type.value,
      p_booking_kind: form.booking_kind.value,
      p_customer_name: form.customer_name.value.trim() || null,
      p_customer_email: form.customer_email.value.trim() || null,
      p_customer_phone: form.customer_phone.value.trim() || null,
      p_corporate_account_id: isCorporate && form.corporate_account_id.value ? form.corporate_account_id.value : null,
      p_corporate_contact_id: isCorporate && form.corporate_contact_id.value ? form.corporate_contact_id.value : null,
      p_route_or_destination: form.route_or_destination.value.trim() || null,
      p_travel_start: form.travel_start.value || null,
      p_travel_end: form.travel_end.value || null,
      p_selling_price: sellingPrice,
      p_supplier_cost: supplierCost,
      p_supplier_name: form.supplier_name.value.trim() || null,
      p_notes: form.notes.value.trim() || null
    };
    try {
      const result = await sb.rpc("create_operations_booking", payload);
      if (result.error) throw result.error;
      toast("Booking created.");
      form.reset();
      syncCorporateFields();
      document.getElementById("booking-form-card").hidden = true;
      await loadBookings();
    } catch (err) {
      toast("Could not create booking: " + err.message);
    }
    btn.disabled = false;
  }

  async function loadBookings() {
    const result = await sb.rpc("list_operations_bookings", { limit_count: 200 });
    if (result.error) { document.getElementById("bookings-list").innerHTML = '<p class="blocked-note">' + esc(result.error.message) + '</p>'; return; }
    allBookings = result.data || [];
    renderBookings();
  }

  function sortMeta() {
    return SORT_OPTIONS.find(function (o) { return o.value === activeSort; }) || SORT_OPTIONS[0];
  }

  function searchableBooking(b) {
    return [
      b.booking_reference, b.title, b.customer_name, b.customer_email, b.customer_phone,
      b.corporate_company_name, b.corporate_contact_name, b.service_type, b.status, b.source,
      b.payment_status, b.document_status, b.route_or_destination, b.supplier_name, isDocumentHandoff(b) ? "document handoff portal request " + documentHandoffType(b) + " " + documentHandoffRef(b) : ""
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function bookingNotes(b) {
    return String(b.staff_notes || b.notes || b.internal_notes || b.description || "");
  }

  function isDocumentHandoff(b) {
    const title = String(b.title || "");
    return /^document request\s*-/i.test(title) || /document handoff request from corporate portal/i.test(bookingNotes(b));
  }

  function documentHandoffType(b) {
    const titleMatch = String(b.title || "").match(/^document request\s*-\s*(.+)$/i);
    if (titleMatch && titleMatch[1]) return titleMatch[1].trim();
    const noteMatch = bookingNotes(b).match(/Document needed:\s*([^\n]+)/i);
    return noteMatch && noteMatch[1] ? noteMatch[1].trim() : "Requested document";
  }

  function documentHandoffRef(b) {
    const match = bookingNotes(b).match(/Booking:\s*(KRI-\d{4}-\d+)/i);
    return match && match[1] ? match[1] : "Original booking";
  }
  function isPortalRequest(b) {
    const source = String(b.source || "").toLowerCase();
    return source === "portal" || source === "corporate_portal";
  }

  function riskRank(b) {
    const payment = String(b.payment_status || "").toLowerCase();
    const status = String(b.status || "").toLowerCase();
    if (status === "confirmed" && payment !== "paid" && payment !== "received") return 0;
    if (/pending|proof|partial|due/.test(payment)) return 1;
    if (/missing|pending/.test(String(b.document_status || "").toLowerCase())) return 2;
    return 3;
  }

  function bookingTime(b, key) {
    const value = key === "travel" ? (b.travel_start || b.travel_end || b.created_at) : b.created_at;
    const t = new Date(value || 0).getTime();
    return isNaN(t) ? 0 : t;
  }

  function filteredBookings() {
    return allBookings.filter(function (b) {
      if (activeSearch && searchableBooking(b).indexOf(activeSearch) === -1) return false;
      if (activeFilter === "portal" && !isPortalRequest(b)) return false;
      if (activeFilter === "payment_pending" && !/pending|proof|partial|due/.test(String(b.payment_status || "").toLowerCase())) return false;
      if (activeFilter === "docs_pending" && !/pending|missing|not/.test(String(b.document_status || "").toLowerCase())) return false;
      if (activeFilter === "corporate" && !(b.booking_kind === "corporate" || b.corporate_company_name)) return false;
      if (activeFilter === "confirmed_unpaid" && !(String(b.status || "").toLowerCase() === "confirmed" && !/paid|received/.test(String(b.payment_status || "").toLowerCase()))) return false;
      return true;
    }).sort(function (a, b) {
      if (activeSort === "created_asc") return bookingTime(a) - bookingTime(b);
      if (activeSort === "travel_asc") return bookingTime(a, "travel") - bookingTime(b, "travel");
      if (activeSort === "name_asc") return String(a.title || a.booking_reference || "").localeCompare(String(b.title || b.booking_reference || ""));
      if (activeSort === "amount_desc") return Number(b.selling_price || 0) - Number(a.selling_price || 0);
      if (activeSort === "payment_first") return riskRank(a) - riskRank(b) || bookingTime(b) - bookingTime(a);
      return bookingTime(b) - bookingTime(a);
    });
  }

  function toolbarHTML(rows) {
    const sort = sortMeta();
    const filters = [
      ["", "All"],
      ["portal", "Portal requests"],
      ["payment_pending", "Payment pending"],
      ["docs_pending", "Docs pending"],
      ["confirmed_unpaid", "Confirmed unpaid"],
      ["corporate", "Corporate"]
    ];
    return '<div class="booking-command-bar">' +
      '<div class="booking-search-wrap">' + icon("search") +
        '<input id="bookings-search" class="admin-search" type="search" placeholder="Search reference, customer, route, supplier..." value="' + esc(activeSearch) + '" autocomplete="off" data-command-label="Search bookings" data-command-desc="Find by reference, customer, route, payment or supplier" data-command-keys="S" data-command-action="focus-search">' +
      "</div>" +
      '<div class="booking-filter-strip">' + filters.map(function (f) {
        return '<button type="button" class="booking-filter-chip' + (activeFilter === f[0] ? " active" : "") + '" data-filter="' + esc(f[0]) + '">' + esc(f[1]) + "</button>";
      }).join("") + "</div>" +
      '<div class="booking-sort" id="booking-sort">' +
        '<button type="button" class="booking-sort-btn" id="booking-sort-btn" aria-haspopup="true" aria-expanded="false" data-command-label="Sort bookings" data-command-desc="Open booking sort menu" data-command-keys="F" data-command-action="focus-filter">Sort: <b>' + esc(sort.label) + '</b> ' + icon("chevron") + "</button>" +
        '<div class="booking-sort-menu" id="booking-sort-menu" role="menu" hidden>' +
          SORT_OPTIONS.map(function (o) {
            return '<button type="button" role="menuitemradio" aria-checked="' + String(activeSort === o.value) + '" class="booking-sort-item' + (activeSort === o.value ? " active" : "") + '" data-sort="' + esc(o.value) + '"><span class="sort-dot"></span><span><b>' + esc(o.label) + '</b><small>' + esc(o.desc) + "</small></span></button>";
          }).join("") +
          '<span class="booking-sort-more">More shortcuts in Ctrl+K</span>' +
        "</div>" +
      "</div>" +
      '<span class="booking-result-note">' + esc(rows.length) + " shown / " + esc(allBookings.length) + " total</span>" +
    "</div>";
  }

  function rowHTML(b) {
      const docHandoff = isDocumentHandoff(b);
      const portal = isPortalRequest(b) ? '<span class="ops-chip booking-chip-portal">Portal request</span>' : '';
      const handoff = docHandoff ? '<span class="ops-chip booking-chip-document">Document handoff</span><span class="ops-chip">Needed: ' + esc(documentHandoffType(b)) + '</span><span class="ops-chip">For: ' + esc(documentHandoffRef(b)) + '</span>' : '';
      const corporate = b.corporate_company_name ? '<span class="ops-chip">Corporate: ' + esc(b.corporate_company_name) + (b.corporate_contact_name ? ' / ' + esc(b.corporate_contact_name) : '') + '</span>' : '';
      const source = b.source && !isPortalRequest(b) ? '<span class="ops-chip">Source: ' + esc(label(b.source)) + '</span>' : '';
      const rowClass = (isPortalRequest(b) ? " ops-row-portal" : "") + (docHandoff ? " ops-row-document" : "");
      const subline = docHandoff ? ["Document handoff", documentHandoffType(b), documentHandoffRef(b)].filter(Boolean).join(" - ") : [label(b.service_type), isPortalRequest(b) ? "Portal submitted" : label(b.status), b.route_or_destination || "No route/destination"].filter(Boolean).join(" - ");
      const documentHref = 'booking-detail.html?id=' + esc(b.id) + '#booking-document-panel';

      // A chip reading "Sell: Hidden" tells the reader only that they are not
      // allowed to see it, which they already know. Rows were carrying up to
      // eight chips over two lines, most of them noise. Finance chips now
      // appear only when there is a real value behind them.
      const financeChip = function (name, value) {
        if (value === null || value === undefined) return '';
        return '<span class="ops-chip">' + name + ': ' + esc(money(value, b.currency)) + '</span>';
      };
      // Profit of exactly zero on an unpriced booking is not a fact worth a
      // chip; it only means nothing has been quoted yet.
      const profitChip = b.selling_price == null ? '' : financeChip('Profit', b.gross_profit);

      return '<div class="ops-row' + rowClass + '"><div class="ops-row-main"><b>' + esc(b.booking_reference) + ' - ' + esc(b.title) + '</b><p>' + esc(subline) + '</p><div class="ops-kv">' + portal + handoff + corporate + source + '<span class="ops-chip">Payment: ' + esc(label(b.payment_status)) + '</span><span class="ops-chip">Docs: ' + esc(label(b.document_status)) + '</span>' + financeChip('Sell', b.selling_price) + financeChip('Cost', b.supplier_cost) + profitChip + '</div></div><div class="ops-row-actions"><a class="btn btn-primary" href="booking-detail.html?id=' + esc(b.id) + '">Open</a><a class="btn btn-outline" href="' + documentHref + '">' + (docHandoff ? 'Prepare file' : 'Document') + '</a></div></div>';
  }
  function renderBookings() {
    const rows = filteredBookings();
    document.getElementById("bookings-count").textContent = rows.length + " shown / " + allBookings.length + " booking(s)";
    document.getElementById("bookings-list").innerHTML = toolbarHTML(rows) + (rows.length ? '<div class="ops-list">' + rows.map(rowHTML).join("") + '</div>' : '<div class="account-main empty-state"><p>No bookings match these filters.</p></div>');
    wireBookingToolbar();
  }

  function wireBookingToolbar() {
    const search = document.getElementById("bookings-search");
    const sortBtn = document.getElementById("booking-sort-btn");
    const sortMenu = document.getElementById("booking-sort-menu");
    let searchTimer = null;
    if (search) {
      search.addEventListener("input", function () {
        activeSearch = search.value.trim().toLowerCase();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(renderBookings, 150);
      });
    }
    document.querySelectorAll(".booking-filter-chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        activeFilter = btn.dataset.filter || "";
        renderBookings();
      });
    });
    if (sortBtn && sortMenu) {
      sortBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const open = sortMenu.hidden;
        sortMenu.hidden = !open;
        sortBtn.setAttribute("aria-expanded", String(open));
      });
      sortMenu.querySelectorAll(".booking-sort-item").forEach(function (btn) {
        btn.addEventListener("click", function () {
          activeSort = btn.dataset.sort || "created_desc";
          renderBookings();
        });
      });
      document.addEventListener("click", function (e) {
        const sort = document.getElementById("booking-sort");
        const menu = document.getElementById("booking-sort-menu");
        const button = document.getElementById("booking-sort-btn");
        if (sort && menu && button && !sort.contains(e.target)) {
          menu.hidden = true;
          button.setAttribute("aria-expanded", "false");
        }
      }, { once: true });
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
