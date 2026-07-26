"use strict";
(function () {
  if (document.body.dataset.page !== "backups") return;

  let sb = null;
  let exportsCache = [];

  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }
  function stamp() {
    const d = new Date();
    const pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "_" + pad(d.getHours()) + pad(d.getMinutes());
  }
  function niceName(v) { return String(v || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function flatten(value) {
    if (value == null) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }
  function csvEscape(value) {
    const s = flatten(value);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(rows) {
    rows = rows || [];
    if (!rows.length) return "No records\n";
    const headers = Array.from(rows.reduce(function (set, row) {
      Object.keys(row || {}).forEach(function (key) { set.add(key); });
      return set;
    }, new Set()));
    return headers.map(csvEscape).join(",") + "\n" + rows.map(function (row) {
      return headers.map(function (h) { return csvEscape(row[h]); }).join(",");
    }).join("\n") + "\n";
  }
  function downloadCsv(fileName, rows) {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  async function rpc(name, args) {
    const result = await sb.rpc(name, args || {});
    if (result.error) throw result.error;
    return result.data || [];
  }
  async function table(name, select, limit) {
    const result = await sb.from(name).select(select || "*").order("created_at", { ascending: false }).limit(limit || 500);
    if (result.error) throw result.error;
    return result.data || [];
  }
  function dataset(title, file, rows, note) {
    return { title: title, file: file, rows: rows || [], note: note || "" };
  }
  function num(v) { return Number(v || 0); }
  function statusIs(v, status) { return String(v || "").toLowerCase() === status; }
  function bookingMonth(b) {
    const d = String(b.created_at || b.travel_start || b.updated_at || "").slice(0, 10);
    return d ? d.slice(0, 7) : "no-date";
  }
  function moneyStatusSummary(bookings, payments) {
    const sales = bookings.reduce(function (sum, b) { return sum + num(b.selling_price); }, 0);
    const supplierCost = bookings.reduce(function (sum, b) { return sum + num(b.supplier_cost); }, 0);
    const received = payments.filter(function (p) { return statusIs(p.status, "received"); }).reduce(function (sum, p) { return sum + num(p.amount); }, 0);
    const refundPending = bookings.filter(function (b) { return statusIs(b.payment_status, "refund_pending"); }).reduce(function (sum, b) { return sum + num(b.selling_price); }, 0);
    const refunded = bookings.filter(function (b) { return statusIs(b.payment_status, "refunded") || statusIs(b.status, "refunded"); }).reduce(function (sum, b) { return sum + num(b.selling_price); }, 0);
    return [{
      generated_at: new Date().toISOString(),
      bookings: bookings.length,
      payment_records: payments.length,
      sales_aed: sales,
      supplier_cost_aed: supplierCost,
      gross_profit_aed: sales - supplierCost,
      received_aed: received,
      refund_pending_aed: refundPending,
      refunded_aed: refunded,
      net_collected_aed: received - refunded,
      sharepoint_finance_folder: "Kridiya Travel/Finance/" + stamp().slice(0, 7).replace("-", "/")
    }];
  }
  function sharepointMap(bookings) {
    return bookings.map(function (b) {
      const month = bookingMonth(b).replace("-", "/");
      return {
        booking_reference: b.booking_reference,
        title: b.title,
        customer: b.customer_name || b.corporate_company_name,
        status: b.status,
        payment_status: b.payment_status,
        supplier: b.supplier_name,
        supplier_reference: b.supplier_reference,
        booking_folder: "Kridiya Travel/Operations/Bookings/" + month + "/" + (b.booking_reference || "No Reference"),
        supplier_invoice_folder: "Kridiya Travel/Operations/Bookings/" + month + "/" + (b.booking_reference || "No Reference") + "/Supplier Invoices",
        customer_document_folder: "Kridiya Travel/Operations/Bookings/" + month + "/" + (b.booking_reference || "No Reference") + "/Customer Documents"
      };
    });
  }
  function renderReadiness() {
    const has = function (title) { return exportsCache.some(function (item) { return item.title === title && item.rows.length; }); };
    const rows = [
      ["Finance summary", has("Owner finance summary"), "Sales, cost, profit, refunds, and net collected"],
      ["Bookings", has("Bookings"), "Operational booking records and statuses"],
      ["Payments", has("Payments"), "Customer payment and refund trail"],
      ["Corporate", has("Corporate accounts"), "Company billing/account data"],
      ["Documents", has("Documents"), "Generated document register"],
      ["Activity", has("Activity"), "Admin/staff audit evidence"]
    ];
    const ready = rows.filter(function (r) { return r[1]; }).length;
    document.getElementById("backup-readiness-panel").innerHTML =
      '<div class="backup-ready-summary"><div><b>' + esc(ready) + '/' + esc(rows.length) + '</b><span>Backup areas ready</span><p>Monthly folder: Kridiya Travel/Finance/' + esc(stamp().slice(0, 7).replace("-", "/")) + '</p></div><a class="btn btn-outline" href="accounting.html">Accounting</a></div>' +
      '<div class="review-check-grid">' + rows.map(function (r) {
        return '<div class="review-check ' + (r[1] ? "done" : "todo") + '"><b>' + esc(r[0]) + '</b><p>' + esc(r[2]) + '</p></div>';
      }).join("") + '</div>' +
      '<div class="doc-control-next"><b>SharePoint filing path</b><span>Save monthly exports to Kridiya Travel/05 Staff and Security/Monthly Backups/' + esc(stamp().slice(0, 7)) + '. Save finance files to Kridiya Travel/02 Finance/' + esc(stamp().slice(0, 7).replace("-", "/")) + '/Accounting Export.</span></div>' +
      '<div class="doc-control-next"><b>Booking folder rule</b><span>For each booking use Operations/Bookings/YYYY/MM/BOOKING-REFERENCE - Customer Name, then split files into Customer Documents, Tickets and Vouchers, Invoices and Receipts, Payment Proofs, Supplier Invoices, Refunds and Cancellations, and Internal Notes.</span></div>';
  }

  async function loadExports() {
    const bookings = await rpc("list_operations_bookings", { limit_count: 1000 });
    const payments = await rpc("list_operations_payments", { limit_count: 1000 });
    const corporate = await rpc("list_corporate_accounts");
    const staff = await rpc("list_staff");
    const activity = await rpc("list_audit_events", { limit_count: 1000 });
    let documents = [];
    try {
      documents = await table("documents", "id, document_number, kind, customer_name, customer_email, amount, currency, related_enquiry_id, created_at", 1000);
    } catch (e) {
      documents = [{ warning: "Document table export was not available for this login.", detail: e.message }];
    }

    exportsCache = [
      dataset("Owner finance summary", "kridiya-owner-finance-summary-" + stamp() + ".csv", moneyStatusSummary(bookings, payments), "Sales, supplier cost, gross profit, refunds, and net collected."),
      dataset("Bookings", "kridiya-bookings-" + stamp() + ".csv", bookings, "All operation bookings and status fields."),
      dataset("Payments", "kridiya-payments-" + stamp() + ".csv", payments, "Customer payment records."),
      dataset("Corporate accounts", "kridiya-corporate-accounts-" + stamp() + ".csv", corporate, "Company accounts, billing settings, and contacts summary."),
      dataset("Documents", "kridiya-documents-" + stamp() + ".csv", documents, "Generated document register."),
      dataset("SharePoint folder map", "kridiya-sharepoint-folder-map-" + stamp() + ".csv", sharepointMap(bookings), "Recommended document folders for each booking."),
      dataset("Staff", "kridiya-staff-" + stamp() + ".csv", staff, "Staff accounts and permission summary."),
      dataset("Activity", "kridiya-activity-" + stamp() + ".csv", activity, "Owner/admin activity audit log.")
    ];
  }

  function render() {
    const totalRows = exportsCache.reduce(function (sum, item) { return sum + item.rows.length; }, 0);
    document.getElementById("backup-stats").innerHTML =
      '<div class="stat-tile"><div class="num">' + exportsCache.length + '</div><div class="label">Backup files</div></div>' +
      '<div class="stat-tile"><div class="num">' + totalRows + '</div><div class="label">Rows ready</div></div>' +
      '<div class="stat-tile"><div class="num">CSV</div><div class="label">Excel format</div></div>' +
      '<div class="stat-tile"><div class="num">Admin</div><div class="label">Access level</div></div>';
    document.getElementById("backup-last-run").textContent = "Loaded " + new Date().toLocaleString("en-GB");
    renderReadiness();
    document.getElementById("backup-list").innerHTML = exportsCache.map(function (item, index) {
      return '<div class="backup-card"><div><h3>' + esc(item.title) + '</h3><p>' + esc(item.note) + '</p><div class="ops-kv"><span class="ops-chip">' + esc(item.rows.length) + ' row(s)</span><span class="ops-chip">' + esc(niceName(item.file.replace(/^kridiya-|\.csv$/g, ""))) + '</span></div></div><button class="btn btn-outline" type="button" data-export-index="' + index + '">Download</button></div>';
    }).join("");
  }

  async function boot() {
    const gate = document.getElementById("backups-gate");
    const app = document.getElementById("backups-app");
    const user = await KridiyaAuth.currentUser();
    if (!user) { renderLoginForm(gate, boot); return; }
    sb = await KridiyaAuth.client();

    const adminCheck = await sb.rpc("is_admin");
    if (adminCheck.error || adminCheck.data !== true) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>Owner/admin access required.</b><br>Backups are private business records.</p><a class="btn btn-primary" href="dashboard.html">Back to dashboard</a></div>';
      return;
    }

    try {
      await loadExports();
    } catch (err) {
      gate.innerHTML = '<div class="account-main empty-state"><p>Could not prepare backups: ' + esc(err.message) + '</p></div>';
      return;
    }

    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    render();

    document.getElementById("backup-list").addEventListener("click", function (event) {
      const btn = event.target.closest("[data-export-index]");
      if (!btn) return;
      const item = exportsCache[Number(btn.dataset.exportIndex)];
      downloadCsv(item.file, item.rows);
      toast(item.title + " backup downloaded.");
    });
    document.getElementById("download-all-backups").addEventListener("click", function () {
      exportsCache.forEach(function (item, index) {
        setTimeout(function () { downloadCsv(item.file, item.rows); }, index * 250);
      });
      toast("All backups started downloading.");
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
