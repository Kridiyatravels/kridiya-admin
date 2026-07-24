/* ============================================================
   Kridiya Travel — staff enquiry admin (admin.kridiyatravel.com)
   Read/write access is enforced server-side by RLS (public.is_staff());
   this page just renders what Supabase allows the signed-in user to see.
   ============================================================ */
"use strict";

(function () {
  if (document.body.dataset.page !== "admin") return;

  const STATUS_OPTIONS = [
    "received", "checking_availability", "quote_sent", "confirmed",
    "payment_pending", "booked", "documents_sent", "closed"
  ];
  const SERVICE_OPTIONS = ["flight", "hotel", "holiday", "visa", "umrah", "cruise", "other"];

  let sb = null;
  let currentStaffId = null;
  let allEnquiries = [];
  let notesByEnquiry = {};
  let requestsByEnquiry = {};
  let quotesByEnquiry = {};
  let bookingByEnquiry = {};
  let canCreateBookings = false;
  let canEditCorporates = false;

  function fmtMoney(amount, currency) {
    return currency + " " + Number(amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtWhen(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function waReplyLink(enq) {
    const phone = String(enq.phone || "").replace(/[^0-9]/g, "");
    if (!phone) return "";
    const firstName = enq.full_name ? enq.full_name.split(" ")[0] : "there";
    const text = "Hello " + firstName + ", this is Kridiya Travel. Following up on your enquiry " +
      enq.reference + " (" + enq.summary + ").";
    return "https://wa.me/" + phone + "?text=" + encodeURIComponent(text);
  }

  function mailReplyLink(enq) {
    const firstName = enq.full_name ? enq.full_name.split(" ")[0] : "";
    const subject = "Re: " + enq.reference + " — your Kridiya Travel enquiry";
    const body = "Hi " + firstName + ",\n\nThanks for your enquiry (" + enq.summary + ").\n\n";
    return "mailto:" + encodeURIComponent(enq.email) + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  function detail(enq, key) {
    return enq && enq.details && enq.details[key] ? String(enq.details[key]).trim() : "";
  }

  function isCorporateEnquiry(enq) {
    const requestType = detail(enq, "Request_type");
    return Boolean(
      detail(enq, "Company_name") ||
      /corporate|b2b/i.test(requestType) ||
      /corporate/i.test(enq.summary || "")
    );
  }

  function corporatePreview(enq) {
    if (!isCorporateEnquiry(enq)) return "";
    const items = [
      ["Company", detail(enq, "Company_name")],
      ["Service", detail(enq, "Service_needed")],
      ["Route", detail(enq, "Route_or_destination")],
      ["Travellers", detail(enq, "Travellers_count")],
      ["LPO", detail(enq, "LPO_required")],
      ["Billing", detail(enq, "Billing_email")]
    ].filter(function (x) { return x[1]; });
    return items.length ? '<div class="ops-kv corporate-enquiry-preview">' + items.map(function (x) {
      return '<span class="ops-chip">' + KridiyaAuth.escapeHTML(x[0]) + ': ' + KridiyaAuth.escapeHTML(x[1]) + '</span>';
    }).join("") + '</div>' : "";
  }

  function convertPanel(enq) {
    if (!isCorporateEnquiry(enq)) return "";
    if (!canCreateBookings || !canEditCorporates) {
      return '<div class="admin-notes" data-convert-for="' + enq.id + '" hidden><p class="form-note">You need create booking and edit corporate permissions to convert this enquiry.</p></div>';
    }
    return '<div class="admin-notes corporate-convert-panel" data-convert-for="' + enq.id + '" hidden>' +
      '<p class="form-note">This will create or reuse the corporate company, create the contact, create a linked corporate booking, and mark this enquiry as confirmed.</p>' +
      '<button type="button" class="btn btn-primary convert-corporate-btn" data-id="' + enq.id + '">Convert to corporate booking</button>' +
    '</div>';
  }

  const DEFAULT_QUOTE_TERMS =
    "- Fares are subject to availability and may change until the ticket is issued.\n" +
    "- Full payment is required before booking confirmation.\n" +
    "- Date changes, cancellations and no-shows are subject to airline penalties plus service fees.\n" +
    "- Passport must be valid for at least 6 months from the travel date.\n" +
    "- Visa (if required) is the traveller's responsibility unless arranged by Kridiya Travel.";

  /* "Extra 10kg = 120" lines -> [{name:'Extra 10kg', price:120}] */
  function parseAddons(text) {
    return String(text || "").split("\n").map(function (line) {
      const t = line.trim();
      if (!t) return null;
      const parts = t.split("=");
      const name = parts[0].trim();
      if (!name) return null;
      const price = parts.length > 1 ? parseFloat(parts[1].replace(/[^0-9.]/g, "")) : NaN;
      return { name: name, price: (price >= 0 ? price : null) };
    }).filter(Boolean);
  }

  /* Builds the professional customer message from every option added to
     this enquiry, ready to paste into WhatsApp. */
  function buildQuoteMessage(enq) {
    const list = (quotesByEnquiry[enq.id] || []).slice().reverse();
    if (!list.length) return "";
    const name = enq.full_name ? enq.full_name.split(" ")[0] : "there";
    const out = [];
    out.push("Hello " + name + ", thank you for choosing Kridiya Travel and Tourism. ✈️");
    out.push("");
    out.push("Here " + (list.length > 1 ? "are your options" : "is your quote") + ":");
    list.forEach(function (q, i) {
      out.push("");
      out.push("*" + (q.title || ("Option " + (i + 1))) + "*");
      if (q.airline) out.push("Airline: " + q.airline + (q.stops ? " (" + q.stops + ")" : ""));
      else if (q.stops) out.push("Type: " + q.stops);
      if (q.outbound) out.push("Onward: " + q.outbound);
      if (q.inbound) out.push("Return: " + q.inbound);
      if (q.baggage) out.push("Baggage: " + q.baggage);
      out.push("Fare: " + fmtMoney(q.price_amount, q.currency) + " per person");
      const adds = Array.isArray(q.addons) ? q.addons : [];
      if (adds.length) {
        out.push("Optional add-ons:");
        adds.forEach(function (a) { out.push("  + " + a.name + (a.price != null ? " (" + fmtMoney(a.price, q.currency) + ")" : "")); });
      }
    });
    out.push("");
    out.push("*Terms & Conditions:*");
    ((list[0] && list[0].terms) ? list[0].terms : DEFAULT_QUOTE_TERMS).split("\n").forEach(function (t) {
      if (t.trim()) out.push(t.trim());
    });
    if (list[0] && list[0].valid_until) { out.push(""); out.push("Prices valid until " + fmtWhen(list[0].valid_until) + "."); }
    out.push("");
    out.push("To confirm, please reply and complete payment. Payment is required before booking. 🙏");
    return out.join("\n");
  }

  function matchesFilters(enq) {
    const statusF = document.getElementById("flt-status").value;
    const serviceF = document.getElementById("flt-service").value;
    const todayOnly = document.getElementById("flt-today").checked;
    if (statusF && enq.status !== statusF) return false;
    if (serviceF && enq.service_type !== serviceF) return false;
    if (todayOnly && new Date(enq.created_at).toDateString() !== new Date().toDateString()) return false;
    return true;
  }

  function renderStatTiles() {
    const row = document.getElementById("stat-row");
    if (!row) return;
    const today = new Date().toDateString();
    const newToday = allEnquiries.filter(function (e) { return new Date(e.created_at).toDateString() === today; }).length;
    const awaitingQuote = allEnquiries.filter(function (e) { return e.status === "received" || e.status === "checking_availability"; }).length;
    const quotesOut = allEnquiries.filter(function (e) { return e.status === "quote_sent" || e.status === "payment_pending"; }).length;
    const confirmed = allEnquiries.filter(function (e) { return e.status === "confirmed" || e.status === "booked"; }).length;
    const tiles = [
      { num: newToday, label: "New today", accent: "var(--status-checking)" },
      { num: awaitingQuote, label: "Awaiting a quote", accent: "var(--status-received)" },
      { num: quotesOut, label: "Quote sent, waiting", accent: "var(--status-quoted)" },
      { num: confirmed, label: "Confirmed", accent: "var(--status-confirmed)" }
    ];
    row.innerHTML = tiles.map(function (t) {
      return '<div class="stat-tile" style="--tile-accent:' + t.accent + '"><div class="num">' + t.num + '</div><div class="label">' + t.label + "</div></div>";
    }).join("");
  }

  function renderList() {
    renderStatTiles();
    const listEl = document.getElementById("admin-list");
    const visible = allEnquiries.filter(matchesFilters);
    document.getElementById("admin-count").textContent = visible.length + " of " + allEnquiries.length + " enquiries";

    if (!visible.length) {
      listEl.innerHTML = '<div class="account-main empty-state"><p>No enquiries match these filters.</p></div>';
      return;
    }

    listEl.innerHTML = visible.map(function (enq) {
      const created = new Date(enq.created_at);
      const notes = notesByEnquiry[enq.id] || [];
      const requests = requestsByEnquiry[enq.id] || [];
      const quotes = quotesByEnquiry[enq.id] || [];
      const wa = waReplyLink(enq);
      const initial = (enq.full_name || "?").trim().charAt(0).toUpperCase();
      const corporate = isCorporateEnquiry(enq);
      const booking = bookingByEnquiry[enq.id];
      return (
        '<div class="account-main admin-enq" data-id="' + enq.id + '">' +
          '<div class="enq-row-head">' +
            '<div class="enq-avatar">' + initial + "</div>" +
            '<div class="enq-row-main">' +
              '<div class="top-line"><b>' + KridiyaAuth.escapeHTML(enq.full_name) + "</b>" +
                '<span class="status-badge" style="' + statusStyle(enq.status) + '">' + KridiyaAuth.statusLabel(enq.status) + "</span>" +
                '<span class="admin-badge">' + KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(enq.service_type)) + "</span>" +
                (booking ? '<span class="admin-badge admin-badge-converted" title="' + KridiyaAuth.escapeHTML(booking.booking_reference || "") + '">' + icon("check") + ' Converted</span>' : "") +
              "</div>" +
              '<div class="sub-line">' + KridiyaAuth.escapeHTML(enq.reference) + " · " + KridiyaAuth.escapeHTML(enq.summary) + "</div>" +
            "</div>" +
            '<time class="enq-row-time">' + created.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + "</time>" +
            icon("chevron", "enq-chevron") +
          "</div>" +
          '<div class="enq-row-body">' +
          '<p style="margin:0 0 0.2rem"><b>Contact</b> · ' +
            (enq.phone ? '<a href="tel:' + KridiyaAuth.escapeHTML(enq.phone) + '">' + KridiyaAuth.escapeHTML(enq.phone) + "</a> · " : "") +
            '<a href="mailto:' + KridiyaAuth.escapeHTML(enq.email) + '">' + KridiyaAuth.escapeHTML(enq.email) + "</a></p>" +
          corporatePreview(enq) +
          '<div class="admin-enq-actions">' +
            '<select class="status-select status-pill-select" data-id="' + enq.id + '" style="' + statusStyle(enq.status) + '">' +
              STATUS_OPTIONS.map(function (s) {
                return '<option value="' + s + '"' + (s === enq.status ? " selected" : "") + ">" + KridiyaAuth.statusLabel(s) + "</option>";
              }).join("") +
            "</select>" +
            (wa ? '<a class="btn btn-wa" target="_blank" rel="noopener" href="' + wa + '">' + icon("whatsapp") + " WhatsApp</a>" : "") +
            '<a class="btn btn-outline" href="' + mailReplyLink(enq) + '">' + icon("mail") + " Email</a>" +
            '<button type="button" class="btn btn-outline notes-toggle" data-id="' + enq.id + '">Notes (' + notes.length + ")</button>" +
            '<button type="button" class="btn btn-outline requests-toggle" data-id="' + enq.id + '">Requests (' + requests.length + ")</button>" +
            '<button type="button" class="btn btn-outline quotes-toggle" data-id="' + enq.id + '">Quote (' + quotes.length + ")</button>" +
            (booking
              ? '<a class="btn btn-primary" href="booking-detail.html?id=' + KridiyaAuth.escapeHTML(booking.id) + '">Open booking</a>'
              : (corporate ? '<button type="button" class="btn btn-outline convert-toggle" data-id="' + enq.id + '">Convert</button>' : "")) +
            '<a class="btn btn-outline" href="documents.html?enquiry=' + enq.id + '">Document</a>' +
          "</div>" +
          '<div class="admin-notes" data-notes-for="' + enq.id + '" hidden>' +
            '<div class="admin-notes-list">' +
              (notes.length
                ? notes.map(function (n) {
                    return '<div class="admin-note"><p>' + KridiyaAuth.escapeHTML(n.note) + "</p><time>" +
                      new Date(n.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) +
                      "</time></div>";
                  }).join("")
                : '<p class="form-note">No internal notes yet.</p>') +
            "</div>" +
            '<form class="admin-note-form" data-id="' + enq.id + '">' +
              '<textarea placeholder="Add an internal note (staff only, customer never sees this)…" required></textarea>' +
              '<button class="btn btn-primary" type="submit">Add note</button>' +
            "</form>" +
          "</div>" +
          '<div class="admin-notes" data-requests-for="' + enq.id + '" hidden>' +
            '<div class="admin-notes-list">' +
              (requests.length
                ? requests.map(function (r) {
                    const answered = r.responded_at
                      ? (r.kind === "file"
                          ? (r.response_file_path
                              ? '<button type="button" class="btn btn-outline view-file-btn" data-path="' + KridiyaAuth.escapeHTML(r.response_file_path) + '">View file: ' + KridiyaAuth.escapeHTML(r.response_file_name || "uploaded file") + "</button>"
                              : '<span class="form-note">No file uploaded.</span>')
                          : '<p style="margin:0.3rem 0 0">' + KridiyaAuth.escapeHTML(r.response_text || "") + "</p>")
                      : '<span class="form-note">Waiting on customer.</span>';
                    return '<div class="admin-note"><p><b>' + KridiyaAuth.escapeHTML(r.label) + '</b> <span class="admin-badge">' + (r.kind === "file" ? "File" : "Text") + "</span></p>" + answered + "</div>";
                  }).join("")
                : '<p class="form-note">No requests sent yet.</p>') +
            "</div>" +
            '<form class="admin-request-form" data-id="' + enq.id + '">' +
              '<select name="kind"><option value="text">Text answer</option><option value="file">File upload</option></select>' +
              '<input name="label" type="text" placeholder="e.g. Passport number and expiry date" required style="flex:1 1 260px;min-height:44px;border:1px solid var(--line);border-radius:var(--r-sm);padding:0 0.7rem">' +
              '<button class="btn btn-primary" type="submit">Ask</button>' +
            "</form>" +
          "</div>" +
          '<div class="admin-notes" data-quotes-for="' + enq.id + '" hidden>' +
            (quotes.length ? '<div class="quote-actions-bar"><button type="button" class="btn btn-primary js-copy-quotes" data-id="' + enq.id + '">' + icon("mail") + ' Copy for WhatsApp</button><span class="form-note">' + quotes.length + ' option(s) in this quote</span></div>' : '') +
            '<div class="admin-notes-list">' +
              (quotes.length
                ? quotes.slice().reverse().map(function (q, i) {
                    const adds = Array.isArray(q.addons) ? q.addons : [];
                    return '<div class="admin-note quote-option">' +
                      '<p><b>' + KridiyaAuth.escapeHTML(q.title || ("Option " + (i + 1))) + "</b> — " + fmtMoney(q.price_amount, q.currency) + '/person <span class="admin-badge">' + KridiyaAuth.statusLabel(q.status) + "</span></p>" +
                      ((q.airline || q.stops) ? '<p class="quote-line">' + KridiyaAuth.escapeHTML([q.airline, q.stops].filter(Boolean).join(" · ")) + "</p>" : "") +
                      (q.outbound ? '<p class="quote-line">Onward: ' + KridiyaAuth.escapeHTML(q.outbound) + "</p>" : "") +
                      (q.inbound ? '<p class="quote-line">Return: ' + KridiyaAuth.escapeHTML(q.inbound) + "</p>" : "") +
                      (q.baggage ? '<p class="quote-line">Baggage: ' + KridiyaAuth.escapeHTML(q.baggage) + "</p>" : "") +
                      (adds.length ? '<div class="ops-kv">' + adds.map(function (a) { return '<span class="ops-chip">+ ' + KridiyaAuth.escapeHTML(a.name) + (a.price != null ? " " + fmtMoney(a.price, q.currency) : "") + "</span>"; }).join("") + "</div>" : "") +
                      (q.valid_until ? '<p class="form-note" style="margin:0.2rem 0 0">Valid until ' + fmtWhen(q.valid_until) + "</p>" : "") +
                      "</div>";
                  }).join("")
                : '<p class="form-note">No options added yet. Build the quote below — add one option at a time.</p>') +
            "</div>" +
            '<form class="admin-quote-form pro-quote-form" data-id="' + enq.id + '">' +
              '<div class="qf-grid">' +
                '<input class="qf qf-wide" name="title" type="text" placeholder="Option label — e.g. Option 1: Air Arabia" required>' +
                '<input class="qf" name="airline" type="text" placeholder="Airline — e.g. Air Arabia">' +
                '<select class="qf" name="stops"><option value="">Stops…</option><option value="Direct">Direct</option><option value="1 stop">1 stop</option><option value="2 stops">2 stops</option></select>' +
                '<input class="qf qf-wide" name="outbound" type="text" placeholder="Onward — e.g. 15 Aug 09:15 DXB → 15:20 CMB">' +
                '<input class="qf qf-wide" name="inbound" type="text" placeholder="Return — e.g. 05 Sep 03:10 CMB → 06:00 DXB">' +
                '<input class="qf" name="baggage" type="text" placeholder="Baggage — e.g. 30kg + 7kg">' +
                '<input class="qf" name="price_amount" type="number" min="0" step="0.01" placeholder="Fare / person" required>' +
                '<input class="qf" name="currency" type="text" value="AED" maxlength="3">' +
                '<input class="qf" name="valid_until" type="datetime-local">' +
              "</div>" +
              '<textarea class="qf qf-area" name="addons" placeholder="Add-ons (optional) — one per line, e.g.  Extra 10kg = 120"></textarea>' +
              '<textarea class="qf qf-area" name="terms">' + KridiyaAuth.escapeHTML(DEFAULT_QUOTE_TERMS) + "</textarea>" +
              '<button class="btn btn-primary" type="submit">Add this option</button>' +
            "</form>" +
          "</div>" +
          (booking ? "" : convertPanel(enq)) +
          "</div>" +
        "</div>"
      );
    }).join("");
  }

  async function loadEnquiries() {
    const result = await sb.from("enquiries").select("*").order("created_at", { ascending: false });
    if (result.error) throw result.error;
    allEnquiries = result.data || [];
  }

  async function loadNotes() {
    const result = await sb.from("enquiry_notes").select("id, enquiry_id, note, created_at").order("created_at", { ascending: false });
    if (result.error) throw result.error;
    notesByEnquiry = {};
    (result.data || []).forEach(function (n) {
      if (!notesByEnquiry[n.enquiry_id]) notesByEnquiry[n.enquiry_id] = [];
      notesByEnquiry[n.enquiry_id].push(n);
    });
  }

  async function loadRequests() {
    const result = await sb.from("enquiry_requests").select("*").order("created_at", { ascending: false });
    if (result.error) throw result.error;
    requestsByEnquiry = {};
    (result.data || []).forEach(function (r) {
      if (!requestsByEnquiry[r.enquiry_id]) requestsByEnquiry[r.enquiry_id] = [];
      requestsByEnquiry[r.enquiry_id].push(r);
    });
  }

  async function loadQuotes() {
    const result = await sb.from("quotes").select("*").order("created_at", { ascending: false });
    if (result.error) throw result.error;
    quotesByEnquiry = {};
    (result.data || []).forEach(function (q) {
      if (!quotesByEnquiry[q.enquiry_id]) quotesByEnquiry[q.enquiry_id] = [];
      quotesByEnquiry[q.enquiry_id].push(q);
    });
  }

  /* Which enquiries already have a booking? Lets us show a "Converted"
     badge + "Open booking" button up front, and hide the Convert action
     so the same enquiry is never converted twice by mistake. */
  async function loadBookingLinks() {
    const result = await sb.from("bookings").select("id, booking_reference, enquiry_id").not("enquiry_id", "is", null);
    if (result.error) throw result.error;
    bookingByEnquiry = {};
    (result.data || []).forEach(function (b) {
      if (!bookingByEnquiry[b.enquiry_id]) bookingByEnquiry[b.enquiry_id] = b;
    });
  }

  async function loadStaffList() {
    const result = await sb.rpc("list_staff");
    if (result.error) throw result.error;
    return result.data || [];
  }

  function renderStaffList(rows) {
    const el = document.getElementById("staff-list");
    if (!rows.length) {
      el.innerHTML = '<p class="form-note">No staff yet.</p>';
      return;
    }
    el.innerHTML = rows.map(function (r) {
      const isSelf = r.user_id === currentStaffId;
      const displayName = r.full_name || r.email;
      const initial = displayName.trim().charAt(0).toUpperCase();
      return '<div class="staff-row">' +
        '<div class="enq-avatar">' + initial + "</div>" +
        '<div class="staff-row-main">' +
          '<div class="top-line" style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">' +
            "<b>" + KridiyaAuth.escapeHTML(displayName) + "</b>" +
            '<span class="admin-badge">' + KridiyaAuth.statusLabel(r.role) + "</span>" +
            (r.active === false ? '<span class="admin-badge" style="color:var(--status-closed);background:var(--status-closed-bg)">Inactive</span>' : "") +
            (isSelf ? '<span class="form-note">(you)</span>' : "") +
          "</div>" +
          '<div class="sub-line" style="font-size:0.82rem;color:var(--text-muted)">' + KridiyaAuth.escapeHTML(r.email) +
            (r.department ? " · " + KridiyaAuth.escapeHTML(r.department) : "") + " · Added " + fmtWhen(r.created_at) + "</div>" +
        "</div>" +
        (isSelf ? "" :
          '<div class="staff-row-actions">' +
            '<button type="button" class="btn btn-outline reset-pin-btn" data-id="' + r.user_id + '" data-name="' + KridiyaAuth.escapeHTML(displayName) + '">Reset PIN</button>' +
            '<button type="button" class="btn btn-outline revoke-staff-btn" data-id="' + r.user_id + '">Remove</button>' +
          "</div>") +
        "</div>";
    }).join("");
  }

  async function callAdminEdgeFunction(name, body) {
    const sessionResult = await sb.auth.getSession();
    const token = sessionResult.data && sessionResult.data.session ? sessionResult.data.session.access_token : null;
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

  async function refreshStaffList() {
    try {
      const rows = await loadStaffList();
      renderStaffList(rows);
    } catch (err) {
      document.getElementById("staff-list").innerHTML = '<p class="form-note">Could not load staff list: ' + KridiyaAuth.escapeHTML(err.message) + "</p>";
    }
  }

  function wireStaffPanel() {
    document.getElementById("staff-toggle").addEventListener("click", function () {
      const panel = document.getElementById("staff-panel");
      const opening = panel.hidden;
      panel.hidden = !opening;
      this.textContent = opening ? "Hide" : "Manage";
      if (opening) refreshStaffList();
    });

    document.getElementById("create-staff-form").addEventListener("submit", async function () {
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
        const data = await callAdminEdgeFunction("create-staff-account", { full_name: name, department: department, email: email, role: role });
        resultBox.hidden = false;
        resultBox.innerHTML = "Account created for <b>" + KridiyaAuth.escapeHTML(name) + "</b>. Their PIN is <b style=\"font-size:1.2rem;letter-spacing:0.1em\">" + KridiyaAuth.escapeHTML(data.pin) + "</b> — give it to them now, it won't be shown again.";
        document.getElementById("new-staff-name").value = "";
        document.getElementById("new-staff-dept").value = "";
        document.getElementById("new-staff-email").value = "";
        refreshStaffList();
      } catch (err) {
        toast("Could not create account: " + err.message);
      }
      btn.disabled = false;
      btn.textContent = "Create account";
    });

    document.getElementById("staff-list").addEventListener("click", async function (e) {
      const resetBtn = e.target.closest(".reset-pin-btn");
      if (!resetBtn) return;
      resetBtn.disabled = true;
      try {
        const data = await callAdminEdgeFunction("reset-staff-pin", { user_id: resetBtn.dataset.id });
        toast("New PIN for " + resetBtn.dataset.name + ": " + data.pin + " — give it to them now, it won't be shown again.");
      } catch (err) {
        toast("Could not reset PIN: " + err.message);
      }
      resetBtn.disabled = false;
    });

    document.getElementById("grant-staff-form").addEventListener("submit", async function () {
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
          logActivity(sb, currentStaffId, "staff.granted", "user", null, { email: email, role: role });
          toast(email + " now has " + role + " access.");
          document.getElementById("grant-email").value = "";
          refreshStaffList();
        }
      } catch (err) {
        toast("Could not grant access: " + err.message);
      }
      btn.disabled = false;
    });

    document.getElementById("staff-list").addEventListener("click", async function (e) {
      const btn = e.target.closest(".revoke-staff-btn");
      if (!btn) return;
      btn.disabled = true;
      try {
        const result = await sb.rpc("revoke_staff", { target_user_id: btn.dataset.id });
        if (result.error) throw result.error;
        logActivity(sb, currentStaffId, "staff.revoked", "user", btn.dataset.id, {});
        toast("Access removed.");
        refreshStaffList();
      } catch (err) {
        toast("Could not remove access: " + err.message);
        btn.disabled = false;
      }
    });
  }

  function populateFilterOptions() {
    const statusSel = document.getElementById("flt-status");
    STATUS_OPTIONS.forEach(function (s) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = KridiyaAuth.statusLabel(s);
      statusSel.appendChild(opt);
    });
    const serviceSel = document.getElementById("flt-service");
    SERVICE_OPTIONS.forEach(function (s) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = KridiyaAuth.statusLabel(s);
      serviceSel.appendChild(opt);
    });
  }

  function wireEvents() {
    ["flt-status", "flt-service", "flt-today"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", renderList);
    });

    const listEl = document.getElementById("admin-list");

    listEl.addEventListener("change", async function (e) {
      if (!e.target.classList.contains("status-select")) return;
      const select = e.target;
      const id = select.dataset.id;
      const newStatus = select.value;
      select.disabled = true;
      const result = await sb.from("enquiries").update({ status: newStatus }).eq("id", id);
      select.disabled = false;
      if (result.error) {
        toast("Could not update status: " + result.error.message);
        return;
      }
      const row = allEnquiries.find(function (r) { return r.id === id; });
      const prevStatus = row ? row.status : null;
      if (row) row.status = newStatus;
      select.setAttribute("style", statusStyle(newStatus));
      const badge = select.closest(".admin-enq").querySelector(".enq-row-head .status-badge");
      if (badge) {
        badge.setAttribute("style", statusStyle(newStatus));
        badge.textContent = KridiyaAuth.statusLabel(newStatus);
      }
      logActivity(sb, currentStaffId, "enquiry.status_changed", "enquiry", id, { reference: row ? row.reference : null, from: prevStatus, to: newStatus });
      toast("Status updated.");
    });

    listEl.addEventListener("click", async function (e) {
      const rowHead = e.target.closest(".enq-row-head");
      if (rowHead) {
        rowHead.closest(".admin-enq").classList.toggle("expanded");
        return;
      }
      const notesBtn = e.target.closest(".notes-toggle");
      if (notesBtn) {
        const panel = listEl.querySelector('.admin-notes[data-notes-for="' + notesBtn.dataset.id + '"]');
        if (panel) panel.hidden = !panel.hidden;
        return;
      }
      const reqBtn = e.target.closest(".requests-toggle");
      if (reqBtn) {
        const panel = listEl.querySelector('.admin-notes[data-requests-for="' + reqBtn.dataset.id + '"]');
        if (panel) panel.hidden = !panel.hidden;
        return;
      }
      const quoteBtn = e.target.closest(".quotes-toggle");
      if (quoteBtn) {
        const panel = listEl.querySelector('.admin-notes[data-quotes-for="' + quoteBtn.dataset.id + '"]');
        if (panel) panel.hidden = !panel.hidden;
        return;
      }
      const copyQuoteBtn = e.target.closest(".js-copy-quotes");
      if (copyQuoteBtn) {
        const cqEnq = allEnquiries.find(function (r) { return r.id === copyQuoteBtn.dataset.id; });
        if (cqEnq) {
          const text = buildQuoteMessage(cqEnq);
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
              function () { toast("Quote copied — paste into WhatsApp."); },
              function () { toast("Could not copy automatically — select the text manually."); }
            );
          } else {
            toast("Copy not supported on this browser.");
          }
        }
        return;
      }
      const convertBtn = e.target.closest(".convert-toggle");
      if (convertBtn) {
        const panel = listEl.querySelector('.admin-notes[data-convert-for="' + convertBtn.dataset.id + '"]');
        if (panel) panel.hidden = !panel.hidden;
        return;
      }
      const doConvertBtn = e.target.closest(".convert-corporate-btn");
      if (doConvertBtn) {
        await convertCorporateEnquiry(doConvertBtn);
        return;
      }
      const viewBtn = e.target.closest(".view-file-btn");
      if (viewBtn) {
        viewBtn.disabled = true;
        const result = await sb.storage.from("enquiry-uploads").createSignedUrl(viewBtn.dataset.path, 120);
        viewBtn.disabled = false;
        if (result.error || !result.data) {
          toast("Could not open file: " + (result.error ? result.error.message : "unknown error"));
          return;
        }
        window.open(result.data.signedUrl, "_blank", "noopener");
      }
    });

    listEl.addEventListener("submit", async function (e) {
      const form = e.target.closest(".admin-note-form");
      if (!form) return;
      e.preventDefault();
      const textarea = form.querySelector("textarea");
      const note = textarea.value.trim();
      if (!note) return;
      const id = form.dataset.id;
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      const result = await sb
        .from("enquiry_notes")
        .insert({ enquiry_id: id, note: note, created_by: currentStaffId })
        .select("id, enquiry_id, note, created_at")
        .single();
      btn.disabled = false;
      if (result.error) {
        toast("Could not save note: " + result.error.message);
        return;
      }
      if (!notesByEnquiry[id]) notesByEnquiry[id] = [];
      notesByEnquiry[id].unshift(result.data);
      renderList();
      const panel = listEl.querySelector('.admin-notes[data-notes-for="' + id + '"]');
      if (panel) panel.hidden = false;
      const noteRow = allEnquiries.find(function (r) { return r.id === id; });
      logActivity(sb, currentStaffId, "enquiry.note_added", "enquiry", id, { reference: noteRow ? noteRow.reference : null });
    });

    listEl.addEventListener("submit", async function (e) {
      const form = e.target.closest(".admin-request-form");
      if (!form) return;
      e.preventDefault();
      const id = form.dataset.id;
      const label = form.label.value.trim();
      if (!label) return;
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      const result = await sb
        .from("enquiry_requests")
        .insert({ enquiry_id: id, kind: form.kind.value, label: label, created_by: currentStaffId })
        .select("*")
        .single();
      btn.disabled = false;
      if (result.error) {
        toast("Could not send request: " + result.error.message);
        return;
      }
      if (!requestsByEnquiry[id]) requestsByEnquiry[id] = [];
      requestsByEnquiry[id].unshift(result.data);
      renderList();
      const panel = listEl.querySelector('.admin-notes[data-requests-for="' + id + '"]');
      if (panel) panel.hidden = false;
      const reqEnq = allEnquiries.find(function (r) { return r.id === id; });
      logActivity(sb, currentStaffId, "enquiry.request_sent", "enquiry", id, { reference: reqEnq ? reqEnq.reference : null, kind: form.kind.value, label: label });
      toast("Request sent to customer.");
    });

    listEl.addEventListener("submit", async function (e) {
      const form = e.target.closest(".admin-quote-form");
      if (!form) return;
      e.preventDefault();
      const id = form.dataset.id;
      const title = form.title.value.trim();
      const price = parseFloat(form.price_amount.value);
      if (!title || !(price >= 0)) return;
      const currency = (form.currency.value || "AED").trim().toUpperCase();
      const validUntil = form.valid_until.value ? new Date(form.valid_until.value).toISOString() : null;
      const terms = form.terms.value.trim();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      const result = await sb
        .from("quotes")
        .insert({
          enquiry_id: id,
          title: title,
          airline: form.airline.value.trim() || null,
          stops: form.stops.value || null,
          outbound: form.outbound.value.trim() || null,
          inbound: form.inbound.value.trim() || null,
          baggage: form.baggage.value.trim() || null,
          addons: parseAddons(form.addons ? form.addons.value : ""),
          price_amount: price,
          currency: currency,
          valid_until: validUntil,
          terms: terms || null,
          created_by: currentStaffId
        })
        .select("*")
        .single();
      btn.disabled = false;
      if (result.error) {
        toast("Could not send quote: " + result.error.message);
        return;
      }
      if (!quotesByEnquiry[id]) quotesByEnquiry[id] = [];
      quotesByEnquiry[id].unshift(result.data);
      renderList();
      const panel = listEl.querySelector('.admin-notes[data-quotes-for="' + id + '"]');
      if (panel) panel.hidden = false;
      const quoteEnq = allEnquiries.find(function (r) { return r.id === id; });
      logActivity(sb, currentStaffId, "enquiry.quote_sent", "enquiry", id, { reference: quoteEnq ? quoteEnq.reference : null, title: title, amount: price, currency: currency });
      toast("Quote sent to customer.");
    });
  }

  async function convertCorporateEnquiry(btn) {
    const id = btn.dataset.id;
    const enq = allEnquiries.find(function (r) { return r.id === id; });
    if (!enq) return;
    if (!detail(enq, "Company_name")) {
      toast("Company name is missing on this enquiry.");
      return;
    }
    if (!confirm("Convert " + detail(enq, "Company_name") + " into a corporate booking?")) return;
    btn.disabled = true;
    btn.textContent = "Converting...";
    try {
      const result = await sb.rpc("convert_corporate_enquiry_to_booking", {
        p_enquiry_id: id
      });
      if (result.error) throw result.error;
      const data = result.data || {};
      logActivity(sb, currentStaffId, "enquiry.converted_to_corporate_booking", "booking", data.booking_id || null, {
        reference: enq.reference,
        company_name: detail(enq, "Company_name"),
        existing_booking: data.existing_booking === true
      });
      toast(data.existing_booking ? "Booking already exists. Opening it now." : "Corporate booking created.");
      setTimeout(function () {
        location.href = "booking-detail.html?id=" + encodeURIComponent(data.booking_id);
      }, 450);
    } catch (err) {
      toast("Could not convert enquiry: " + err.message);
      btn.disabled = false;
      btn.textContent = "Convert to corporate booking";
    }
  }

  async function boot() {
    const gate = document.getElementById("admin-gate");
    const app = document.getElementById("admin-app");

    const user = await KridiyaAuth.currentUser();
    if (!user) {
      renderLoginForm(gate, boot);
      return;
    }
    currentStaffId = user.id;

    sb = await KridiyaAuth.client();
    let staff = false;
    try {
      const check = await sb.rpc("is_staff");
      staff = !check.error && check.data === true;
    } catch (e) {
      staff = false;
    }

    if (!staff) {
      gate.innerHTML =
        '<div class="account-main empty-state">' +
          "<p><b>You do not have admin access.</b><br>This site is for Kridiya Travel staff only.</p>" +
          '<button type="button" class="btn btn-primary" id="staff-gate-logout">Log out</button>' +
        "</div>";
      document.getElementById("staff-gate-logout").addEventListener("click", async function () {
        await KridiyaAuth.logout();
        location.reload();
      });
      return;
    }

    try {
      await Promise.all([loadEnquiries(), loadNotes(), loadRequests(), loadQuotes(), loadBookingLinks()]);
      const perms = await Promise.all([
        sb.rpc("has_staff_permission", { permission_name: "create_bookings" }),
        sb.rpc("has_staff_permission", { permission_name: "edit_corporates" })
      ]);
      canCreateBookings = !perms[0].error && perms[0].data === true;
      canEditCorporates = !perms[1].error && perms[1].data === true;
    } catch (err) {
      gate.innerHTML = '<div class="account-main empty-state"><p>Could not load enquiries: ' + KridiyaAuth.escapeHTML(err.message) + "</p></div>";
      return;
    }

    populateFilterOptions();
    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    renderList();
    wireEvents();
    wireStaffPanel();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
