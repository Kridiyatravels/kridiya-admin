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
      dataset("Bookings", "kridiya-bookings-" + stamp() + ".csv", bookings, "All operation bookings and status fields."),
      dataset("Payments", "kridiya-payments-" + stamp() + ".csv", payments, "Customer payment records."),
      dataset("Corporate accounts", "kridiya-corporate-accounts-" + stamp() + ".csv", corporate, "Company accounts, billing settings, and contacts summary."),
      dataset("Documents", "kridiya-documents-" + stamp() + ".csv", documents, "Generated document register."),
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
