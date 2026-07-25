"use strict";
(function () {
  if (document.body.dataset.page !== "dashboard") return;
  let sb = null;
  let dashboardTasks = [];

  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }
  function label(v) { return String(v || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function whenText(v) { return v ? new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "No due date"; }
  function num(v) { return Number(v || 0); }
  function money(v) { return "AED " + num(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function healthScore(d) {
    let score = 100;
    score -= Math.min(30, num(d.bookings_confirmed_unpaid) * 10);
    score -= Math.min(20, num(d.refunds_pending) * 8);
    score -= Math.min(20, num(d.tasks_overdue) * 4);
    score -= Math.min(15, num(d.supplier_payments_pending) * 3);
    score -= Math.min(15, num(d.documents_pending) * 2);
    return Math.max(0, score);
  }
  function healthTone(score) {
    if (score >= 85) return "ok";
    if (score >= 65) return "warn";
    return "risk";
  }
  async function boot() {
    const gate = document.getElementById("dashboard-gate");
    const app = document.getElementById("dashboard-app");
    const user = await KridiyaAuth.currentUser();
    if (!user) { renderLoginForm(gate, boot); return; }
    sb = await KridiyaAuth.client();
    const staffCheck = await sb.rpc("is_staff");
    if (staffCheck.error || staffCheck.data !== true) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>You do not have access.</b><br>This dashboard is for Kridiya staff only.</p></div>';
      return;
    }
    const hubEl = document.getElementById("dashboard-hub");
    if (hubEl && typeof buildToolHubHTML === "function") hubEl.innerHTML = buildToolHubHTML("dashboard");
    await showStaffNav(); // resolves permissions, prunes nav + hub before counts fill
    gate.hidden = true;
    app.hidden = false;
    await loadDashboard();
    document.addEventListener("click", handleDashboardClick);
  }

  async function loadDashboard() {
    const result = await sb.rpc("staff_dashboard_summary");
    const taskResult = await sb.rpc("list_dashboard_booking_tasks", { limit_count: 80 });
    if (result.error) { toast("Could not load dashboard: " + result.error.message); return; }
    if (taskResult.error) { toast("Could not load reminders: " + taskResult.error.message); }
    dashboardTasks = taskResult.data || [];
    const d = result.data || {};
    renderCommandCenter(d);
    const stats = [
      ["New enquiries today", d.enquiries_today || 0, "var(--status-checking)"],
      ["Open bookings", d.bookings_open || 0, "var(--status-quoted)"],
      ["Pending payments", d.payments_pending || 0, "var(--status-payment)"],
      ["Refund queue", d.refunds_pending || 0, "var(--status-payment)"],
      ["Tasks due", d.tasks_due || 0, "var(--status-docs)"],
      ["Documents pending", d.documents_pending || 0, "var(--status-docs)"]
    ];
    document.getElementById("dashboard-stats").innerHTML = stats.map(function (s) {
      return '<div class="stat-tile" style="--tile-accent:' + s[2] + '"><div class="num">' + s[1] + '</div><div class="label">' + esc(s[0]) + '</div></div>';
    }).join("");

    updateHubCounts({
      "admin.html": { n: d.enquiries_open || 0, tag: "open" },
      "bookings.html": { n: d.bookings_open || 0, tag: "open" },
      "payments.html": { n: (d.payments_pending || 0) + (d.refunds_pending || 0), tag: "due" },
      "documents.html": { n: d.documents_generated || 0, tag: "" }
    });

    const priority = [
      ["Confirmed before payment", d.bookings_confirmed_unpaid || 0, "bookings.html", "High financial risk"],
      ["Refunds waiting", d.refunds_pending || 0, "payments.html", money(d.refund_value_pending || 0)],
      ["Pending supplier payments", d.supplier_payments_pending || 0, "payments.html", "Supplier follow-up"],
      ["Documents pending", d.documents_pending || 0, "documents.html", "Before handover"],
      ["Open enquiries", d.enquiries_open || 0, "admin.html", "Sales queue"]
    ];
    document.getElementById("dashboard-priority").innerHTML = '<div class="ops-list">' + priority.map(function (p) {
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(p[0]) + '</b><p>' + esc(p[1]) + ' item(s) - ' + esc(p[3]) + '</p></div><a class="btn btn-outline" href="' + p[2] + '">Open</a></div>';
    }).join("") + '</div>';
    renderReminders();

    const activity = d.recent_activity || [];
    document.getElementById("dashboard-activity").innerHTML = activity.length ? '<div class="ops-list">' + activity.map(function (a) {
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(label(a.event_type)) + '</b><p>' + esc(a.entity_type || "system") + ' - ' + new Date(a.created_at).toLocaleString("en-GB") + '</p></div></div>';
    }).join("") + '</div>' : '<p class="form-note">No recent activity yet.</p>';
  }

  function renderCommandCenter(d) {
    const score = healthScore(d);
    const tone = healthTone(score);
    const riskActions = [
      { title: "Collect or verify payment", text: (d.bookings_confirmed_unpaid || 0) + " confirmed booking(s) need payment control", href: "bookings.html" },
      { title: "Clear refund queue", text: money(d.refund_value_pending || 0) + " pending approval/completion", href: "payments.html" },
      { title: "Close overdue tasks", text: (d.tasks_overdue || 0) + " overdue task(s), " + (d.tasks_today || 0) + " due today", href: "bookings.html" },
      { title: "Prepare documents", text: (d.documents_pending || 0) + " booking(s) still need document progress", href: "documents.html" }
    ];
    const finance = [
      ["Open sales", money(d.sales_value_open), "Bookings not closed"],
      ["Open supplier cost", money(d.supplier_cost_open), "Cost exposure"],
      ["Open gross profit", money(d.gross_profit_open), "Expected margin"],
      ["Net collected 30d", money(d.net_collected_30d), "After refunds"]
    ];
    document.getElementById("dashboard-command").innerHTML =
      '<div class="command-health command-' + esc(tone) + '"><div><span>System health</span><b>' + esc(score) + '%</b><p>' + esc(tone === "ok" ? "Operations are controlled." : tone === "warn" ? "Some queues need attention today." : "High-priority risks need owner focus.") + '</p></div><a class="btn btn-primary" href="payments.html">Open finance</a></div>' +
      '<div class="command-finance">' + finance.map(function (f) {
        return '<div class="command-metric"><b>' + esc(f[1]) + '</b><span>' + esc(f[0]) + '</span><p>' + esc(f[2]) + '</p></div>';
      }).join("") + '</div>' +
      '<div class="command-actions">' + riskActions.map(function (a) {
        return '<a class="command-action" href="' + esc(a.href) + '"><b>' + esc(a.title) + '</b><span>' + esc(a.text) + '</span></a>';
      }).join("") + '</div>';
  }

  function updateHubCounts(map) {
    Object.keys(map).forEach(function (href) {
      const slot = document.querySelector('.hub-count[data-count-for="' + href + '"]');
      if (!slot) return; // card may have been pruned by permission
      const c = map[href];
      if (!c || c.n == null || c.n === 0) { slot.textContent = ""; slot.classList.remove("has"); return; }
      slot.textContent = c.tag ? (c.n + " " + c.tag) : String(c.n);
      slot.classList.add("has");
    });
  }

  function renderReminders() {
    const panel = document.getElementById("dashboard-reminders");
    const tasks = dashboardTasks || [];
    if (!tasks.length) {
      panel.innerHTML = '<p class="form-note">No open booking reminders.</p>';
      return;
    }
    const counts = tasks.reduce(function (acc, t) { acc[t.due_bucket] = (acc[t.due_bucket] || 0) + 1; return acc; }, {});
    const summary = '<div class="ops-kv"><span class="ops-chip">Overdue: ' + esc(counts.overdue || 0) + '</span><span class="ops-chip">Today: ' + esc(counts.today || 0) + '</span><span class="ops-chip">Next 7 days: ' + esc(counts.next_7_days || 0) + '</span></div>';
    panel.innerHTML = summary + '<div class="ops-list payment-history">' + tasks.map(function (t) {
      const bucket = label(t.due_bucket);
      const href = 'booking-detail.html?id=' + encodeURIComponent(t.entity_id);
      const meta = esc(t.booking_reference || "Booking") + ' / ' + esc(label(t.service_type)) + ' / ' + esc(label(t.priority));
      return '<div class="ops-row reminder-row reminder-' + esc(t.due_bucket) + '"><div class="ops-row-main"><b>' + esc(t.title) + '</b><p>' + meta + ' / Due: ' + esc(whenText(t.due_at)) + '</p><div class="ops-kv"><span class="ops-chip">' + esc(bucket) + '</span><span class="ops-chip">' + esc(t.booking_title || "Untitled booking") + '</span>' + (t.assigned_to_name ? '<span class="ops-chip">' + esc(t.assigned_to_name) + '</span>' : '') + '</div></div><div class="ops-row-actions"><a class="btn btn-outline" href="' + href + '">Open</a><button class="btn btn-outline js-dashboard-task-done" data-id="' + esc(t.id) + '" type="button">Done</button></div></div>';
    }).join("") + '</div>';
  }

  async function handleDashboardClick(event) {
    const doneButton = event.target.closest(".js-dashboard-task-done");
    if (!doneButton) return;
    doneButton.disabled = true;
    const result = await sb.rpc("complete_booking_task", { p_task_id: doneButton.dataset.id });
    if (result.error) {
      doneButton.disabled = false;
      toast("Could not complete task: " + result.error.message);
      return;
    }
    toast("Task completed.");
    await loadDashboard();
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
