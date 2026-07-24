"use strict";
(function () {
  if (document.body.dataset.page !== "accounting") return;

  let sb = null;
  let bookings = [];
  let payments = [];
  let reportRows = [];

  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }
  function label(v) { return String(v || "unknown").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function num(v) { return Number(v || 0); }
  function money(v) { return "AED " + num(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function dateOnly(v) { return v ? String(v).slice(0, 10) : ""; }
  function stamp() {
    const d = new Date();
    const pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "_" + pad(d.getHours()) + pad(d.getMinutes());
  }
  function flatten(value) {
    if (value == null) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }
  function csvEscape(value) {
    const s = flatten(value);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function downloadCsv(fileName, rows) {
    const headers = rows.length ? Object.keys(rows[0]) : ["No records"];
    const csv = headers.map(csvEscape).join(",") + "\n" + rows.map(function (row) {
      return headers.map(function (h) { return csvEscape(row[h]); }).join(",");
    }).join("\n") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
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
  function bookingDate(b) {
    return dateOnly(b.created_at || b.travel_start || b.updated_at);
  }
  function bookingMonth(b) {
    const d = bookingDate(b);
    return d ? d.slice(0, 7) : "No date";
  }
  function paymentCleared(status) {
    return ["received", "paid", "payment_received", "completed"].indexOf(String(status || "").toLowerCase()) !== -1;
  }
  function bookingConfirmed(status) {
    return ["confirmed", "booked", "documents_sent", "closed"].indexOf(String(status || "").toLowerCase()) !== -1;
  }
  function collectionRule(b) {
    if (paymentCleared(b.payment_status)) return "OK - payment received";
    if (b.booking_kind === "corporate" || b.corporate_company_name) return "Corporate - collect LPO/payment approval";
    if (bookingConfirmed(b.status)) return "Risk - booking confirmed before payment";
    if (num(b.selling_price) > 0) return "Collect payment before booking";
    return "Add selling price and payment status";
  }
  function filteredBookings() {
    const from = document.getElementById("flt-accounting-from").value;
    const to = document.getElementById("flt-accounting-to").value;
    const service = document.getElementById("flt-accounting-service").value;
    const kind = document.getElementById("flt-accounting-kind").value;
    return bookings.filter(function (b) {
      const d = bookingDate(b);
      if (from && d && d < from) return false;
      if (to && d && d > to) return false;
      if (service && b.service_type !== service) return false;
      if (kind && b.booking_kind !== kind) return false;
      return true;
    });
  }
  function summarize(rows) {
    const sales = rows.reduce(function (s, b) { return s + num(b.selling_price); }, 0);
    const cost = rows.reduce(function (s, b) { return s + num(b.supplier_cost); }, 0);
    const profit = rows.reduce(function (s, b) { return s + num(b.gross_profit != null ? b.gross_profit : num(b.selling_price) - num(b.supplier_cost)); }, 0);
    const received = payments.filter(function (p) { return p.status === "received"; }).reduce(function (s, p) { return s + num(p.amount); }, 0);
    const pending = rows.filter(function (b) { return !paymentCleared(b.payment_status); }).reduce(function (s, b) { return s + num(b.selling_price); }, 0);
    return { sales: sales, cost: cost, profit: profit, received: received, pending: pending };
  }
  function groupBy(rows, keyFn) {
    return rows.reduce(function (map, row) {
      const key = keyFn(row) || "unknown";
      if (!map[key]) map[key] = [];
      map[key].push(row);
      return map;
    }, {});
  }
  function renderMoneyRows(containerId, rows, emptyText) {
    document.getElementById(containerId).innerHTML = rows.length ? '<div class="ops-list">' + rows.map(function (r) {
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(r.title) + '</b><p>' + esc(r.subtitle || "") + '</p></div><div class="ops-row-actions"><span class="finance-value">' + esc(money(r.amount)) + '</span></div></div>';
    }).join("") + '</div>' : '<p class="form-note">' + esc(emptyText) + '</p>';
  }
  function renderRuleRows(containerId, rows, emptyText) {
    document.getElementById(containerId).innerHTML = rows.length ? '<div class="ops-list">' + rows.map(function (r) {
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(r.title) + '</b><p>' + esc(r.subtitle || "") + '</p></div><div class="ops-row-actions"><span class="ops-chip">' + esc(r.count) + '</span></div></div>';
    }).join("") + '</div>' : '<p class="form-note">' + esc(emptyText) + '</p>';
  }
  function render() {
    const rows = filteredBookings();
    const totals = summarize(rows);
    document.getElementById("accounting-stats").innerHTML =
      '<div class="stat-tile"><div class="num stat-text">' + esc(money(totals.sales)) + '</div><div class="label">Total sales</div></div>' +
      '<div class="stat-tile"><div class="num stat-text">' + esc(money(totals.cost)) + '</div><div class="label">Supplier cost</div></div>' +
      '<div class="stat-tile"><div class="num stat-text">' + esc(money(totals.profit)) + '</div><div class="label">Gross profit</div></div>' +
      '<div class="stat-tile"><div class="num stat-text">' + esc(money(totals.pending)) + '</div><div class="label">Pending by status</div></div>';

    const byMonth = groupBy(rows, bookingMonth);
    const monthlyRows = Object.keys(byMonth).sort().reverse().map(function (month) {
      const s = summarize(byMonth[month]);
      return { title: month, subtitle: byMonth[month].length + " booking(s) / " + money(s.sales) + " sales / " + money(s.cost) + " cost", amount: s.profit };
    });
    renderMoneyRows("monthly-total-list", monthlyRows, "No monthly totals yet.");

    const ruleGroups = groupBy(rows, collectionRule);
    const ruleOrder = ["Risk - booking confirmed before payment", "Collect payment before booking", "Corporate - collect LPO/payment approval", "Add selling price and payment status", "OK - payment received"];
    const ruleRows = ruleOrder.filter(function (rule) { return ruleGroups[rule]; }).map(function (rule) {
      const group = ruleGroups[rule];
      const value = group.reduce(function (s, b) { return s + num(b.selling_price); }, 0);
      return { title: rule, subtitle: money(value) + " booking value", count: group.length };
    });
    renderRuleRows("collection-rules-list", ruleRows, "No collection rules to show.");

    const byService = groupBy(rows, function (b) { return b.service_type; });
    const serviceRows = Object.keys(byService).sort().map(function (service) {
      const s = summarize(byService[service]);
      return { title: label(service), subtitle: money(s.sales) + " sales / " + money(s.cost) + " cost", amount: s.profit };
    });
    renderMoneyRows("service-profit-list", serviceRows, "No service profit yet.");

    const byMethod = groupBy(payments.filter(function (p) { return p.status === "received"; }), function (p) { return p.method; });
    const methodRows = Object.keys(byMethod).sort().map(function (method) {
      return { title: label(method), subtitle: byMethod[method].length + " payment(s)", amount: byMethod[method].reduce(function (s, p) { return s + num(p.amount); }, 0) };
    });
    renderMoneyRows("method-list", methodRows, "No received payments yet.");

    const pendingRows = rows.filter(function (b) {
      return !paymentCleared(b.payment_status) && num(b.selling_price) > 0;
    }).slice(0, 12).map(function (b) {
      return { title: (b.booking_reference || "Booking") + " - " + (b.title || b.customer_name || "Untitled"), subtitle: collectionRule(b) + " / " + label(b.service_type), amount: num(b.selling_price) };
    });
    renderMoneyRows("pending-list", pendingRows, "No pending customer money in this view.");

    const corporateGroups = groupBy(rows.filter(function (b) { return b.booking_kind === "corporate" || b.corporate_company_name; }), function (b) { return b.corporate_company_name || "Corporate"; });
    const corporateRows = Object.keys(corporateGroups).sort().map(function (company) {
      const s = summarize(corporateGroups[company]);
      return { title: company, subtitle: corporateGroups[company].length + " booking(s) / " + money(s.profit) + " profit", amount: s.sales };
    });
    renderMoneyRows("corporate-accounting-list", corporateRows, "No corporate booking value yet.");

    reportRows = rows.map(function (b) {
      return {
        date: bookingDate(b),
        month: bookingMonth(b),
        reference: b.booking_reference,
        title: b.title,
        service: b.service_type,
        kind: b.booking_kind,
        customer: b.customer_name || b.corporate_company_name,
        payment_status: b.payment_status,
        collection_rule: collectionRule(b),
        booking_status: b.status,
        selling_price: num(b.selling_price),
        supplier_cost: num(b.supplier_cost),
        gross_profit: num(b.gross_profit != null ? b.gross_profit : num(b.selling_price) - num(b.supplier_cost)),
        supplier: b.supplier_name,
        supplier_reference: b.supplier_reference
      };
    });
  }
  function fillServiceFilter() {
    const select = document.getElementById("flt-accounting-service");
    const services = Array.from(new Set(bookings.map(function (b) { return b.service_type; }).filter(Boolean))).sort();
    select.innerHTML = '<option value="">All services</option>' + services.map(function (s) { return '<option value="' + esc(s) + '">' + esc(label(s)) + '</option>'; }).join("");
  }
  async function boot() {
    const gate = document.getElementById("accounting-gate");
    const app = document.getElementById("accounting-app");
    const user = await KridiyaAuth.currentUser();
    if (!user) { renderLoginForm(gate, boot); return; }
    sb = await KridiyaAuth.client();
    const allowed = await sb.rpc("has_staff_permission", { permission_name: "view_payments" });
    if (allowed.error || allowed.data !== true) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>Finance access required.</b><br>Accounting reports are private business records.</p><a class="btn btn-primary" href="dashboard.html">Back to dashboard</a></div>';
      return;
    }
    try {
      bookings = await rpc("list_operations_bookings", { limit_count: 1000 });
      payments = await rpc("list_operations_payments", { limit_count: 1000 });
    } catch (err) {
      gate.innerHTML = '<div class="account-main empty-state"><p>Could not load accounting report: ' + esc(err.message) + '</p></div>';
      return;
    }
    fillServiceFilter();
    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    render();
    ["flt-accounting-from", "flt-accounting-to", "flt-accounting-service", "flt-accounting-kind"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", render);
    });
    document.getElementById("accounting-export").addEventListener("click", function () {
      downloadCsv("kridiya-accounting-report-" + stamp() + ".csv", reportRows);
      toast("Accounting report downloaded.");
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();