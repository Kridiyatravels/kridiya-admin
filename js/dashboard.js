"use strict";
(function () {
  if (document.body.dataset.page !== "dashboard") return;
  let sb = null;
  let dashboardTasks = [];
  let dashboardUser = null;
  let dashboardIsAdmin = false;
  const WORKFLOW_TEST_KEY = "kridiya_dashboard_workflow_test_v1";
  const WORKFLOW_NOTES_KEY = "kridiya_dashboard_workflow_notes_v1";
  const WORKFLOW_TEST_STEPS = [
    { id: "enquiry", title: "Create or open enquiry", text: "Confirm name, email, phone, service, quote status, and internal notes.", href: "admin.html" },
    { id: "quote", title: "Send quote", text: "Add service-aware option, pricing, inclusions, validity, and customer-facing terms.", href: "admin.html" },
    { id: "booking", title: "Convert to booking", text: "Check booking reference, customer link, travel details, passenger data, and tasks.", href: "bookings.html" },
    { id: "payment", title: "Record customer payment", text: "Request, proof, received amount, balance, refund edge case, and receipt trail.", href: "payments.html" },
    { id: "supplier", title: "Control supplier cost", text: "Supplier name, supplier reference, payable amount, paid amount, and exposure.", href: "payments.html" },
    { id: "documents", title: "Generate documents", text: "Invoice, itinerary, voucher, visa note, cancellation/refund letter if required.", href: "documents.html" },
    { id: "accounting", title: "Review accounting", text: "Sales, cost, gross profit, net collected, refunds, and export readiness.", href: "accounting.html" },
    { id: "backup", title: "Download backup pack", text: "Export finance, bookings, customers, payments, documents, and activity audit.", href: "backups.html" }
  ];

  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }
  function label(v) { return String(v || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function eventLabel(v) {
    const key = String(v || "").toLowerCase();
    const known = {
      "auth.login": "Staff login",
      "auth.logout": "Staff logout",
      "staff.login": "Staff login",
      "staff.logout": "Staff logout",
      "enquiry.quote_sent": "Quote sent",
      "enquiry.status_updated": "Enquiry status updated",
      "enquiry.note_added": "Enquiry note added",
      "enquiry.converted_to_booking": "Enquiry converted to booking",
      "enquiry.converted_to_corporate_booking": "Corporate enquiry converted",
      "booking.created": "Booking created",
      "booking.status_updated": "Booking status updated",
      "booking.task_created": "Booking task created",
      "booking.task_completed": "Booking task completed",
      "payment.recorded": "Payment recorded",
      "payment.proof_uploaded": "Payment proof uploaded",
      "payment.refund_requested": "Refund requested",
      "payment.refund_approved": "Refund approved",
      "payment.refund_completed": "Refund completed",
      "supplier.invoice_uploaded": "Supplier invoice uploaded",
      "document.generated": "Document generated",
      "backup.pack_exported": "Backup exported"
    };
    if (known[key]) return known[key];
    return key.split(".").map(label).join(" / ");
  }
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
    dashboardUser = user;
    sb = await KridiyaAuth.client();
    const staffCheck = await sb.rpc("is_staff");
    if (staffCheck.error || staffCheck.data !== true) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>You do not have access.</b><br>This dashboard is for Kridiya staff only.</p></div>';
      return;
    }
    const hubEl = document.getElementById("dashboard-hub");
    if (hubEl && typeof buildToolHubHTML === "function") hubEl.innerHTML = buildToolHubHTML("dashboard");
    await showStaffNav(); // resolves permissions, prunes nav + hub before counts fill
    const adminCheck = await sb.rpc("is_admin");
    dashboardIsAdmin = adminCheck.data === true;
    gate.hidden = true;
    app.hidden = false;
    await loadDashboard();
    document.addEventListener("click", handleDashboardClick);
    document.addEventListener("input", handleDashboardInput);
  }

  async function loadDashboard() {
    const result = await sb.rpc("staff_dashboard_summary");
    const taskResult = await sb.rpc("list_dashboard_booking_tasks", { limit_count: 80 });
    if (result.error) { toast("Could not load dashboard: " + result.error.message); return; }
    if (taskResult.error) { toast("Could not load reminders: " + taskResult.error.message); }
    dashboardTasks = taskResult.data || [];
    const d = result.data || {};
    renderDashboardChrome(d);
    renderCommandCenter(d);
    renderPipeline(d);
    const stats = dashboardStats(d);
    document.getElementById("dashboard-stats").innerHTML = stats.map(function (s) {
      return '<div class="stat-tile" style="--tile-accent:' + s[2] + '"><div class="num">' + s[1] + '</div><div class="label">' + esc(s[0]) + '</div></div>';
    }).join("");

    renderOperationsQa(d);
    renderLaunchReadiness(d);
    renderWorkflowTest();
    updateHubCounts({
      "admin.html": { n: d.enquiries_open || 0, tag: "open" },
      "bookings.html": { n: d.bookings_open || 0, tag: "open" },
      "payments.html": { n: (d.payments_pending || 0) + (d.refunds_pending || 0), tag: "due" },
      "documents.html": { n: d.documents_generated || 0, tag: "" }
    });

    const priority = priorityRows(d);
    document.getElementById("dashboard-priority").innerHTML = '<div class="ops-list">' + priority.map(function (p) {
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(p[0]) + '</b><p>' + esc(p[1]) + ' item(s) - ' + esc(p[3]) + '</p></div><a class="btn btn-outline" href="' + p[2] + '">Open</a></div>';
    }).join("") + '</div>';
    renderReminders();
    renderAdminSections(d);

    const activity = d.recent_activity || [];
    const shownActivity = dashboardIsAdmin ? activity : activity.filter(function (a) { return !a.actor_id || a.actor_id === dashboardUser.id; }).slice(0, 8);
    document.getElementById("dashboard-activity").innerHTML = shownActivity.length ? '<div class="ops-list">' + shownActivity.map(function (a) {
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(eventLabel(a.event_type)) + '</b><p>' + esc(label(a.entity_type || "system")) + ' - ' + new Date(a.created_at).toLocaleString("en-GB") + '</p></div></div>';
    }).join("") + '</div>' : '<p class="form-note">' + esc(dashboardIsAdmin ? "No recent activity yet." : "No personal activity found yet.") + '</p>';
  }

  function renderDashboardChrome(d) {
    const title = document.getElementById("dashboard-title");
    const subtitle = document.getElementById("dashboard-subtitle");
    const badge = document.getElementById("dashboard-role-badge");
    const priorityTitle = document.getElementById("dashboard-priority-title");
    const prioritySubtitle = document.getElementById("dashboard-priority-subtitle");
    const activityTitle = document.getElementById("dashboard-activity-title");
    const activitySubtitle = document.getElementById("dashboard-activity-subtitle");
    if (title) title.textContent = dashboardIsAdmin ? "Admin dashboard" : "Staff dashboard";
    if (subtitle) subtitle.textContent = dashboardIsAdmin
      ? "Owner control for finance, risk, staff activity, documents, and business safety."
      : "Your daily work queue for enquiries, bookings, documents, payments, and follow-ups.";
    if (badge) badge.innerHTML = '<span>' + esc(dashboardIsAdmin ? "Owner / Admin" : "Staff") + '</span><b>' + esc(new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })) + '</b>';
    if (priorityTitle) priorityTitle.textContent = dashboardIsAdmin ? "Owner priority work" : "My priority work";
    if (prioritySubtitle) prioritySubtitle.textContent = dashboardIsAdmin ? "Company risks ordered by operational impact." : "Work that needs your attention first.";
    if (activityTitle) activityTitle.textContent = dashboardIsAdmin ? "Recent activity" : "Visible activity";
    if (activitySubtitle) activitySubtitle.textContent = dashboardIsAdmin ? "Latest staff and system actions." : "Recent work visible to your account.";
    const qa = document.querySelector(".ops-qa-card");
    const readiness = document.querySelector(".launch-readiness-card");
    if (qa) qa.hidden = !dashboardIsAdmin;
    if (readiness) readiness.hidden = !dashboardIsAdmin;
    renderQuickActions(d);
  }

  function renderQuickActions(d) {
    const box = document.getElementById("dashboard-quick-actions");
    if (!box) return;
    const actions = dashboardIsAdmin
      ? [
          ["New enquiry", "admin.html"],
          ["Create booking", "bookings.html"],
          ["Record payment", "payments.html", "view_payments"],
          ["Create document", "documents.html"],
          ["Audit log", "activity.html", null, true]
        ]
      : [
          ["Open enquiries", "admin.html"],
          ["My bookings", "bookings.html"],
          ["Create document", "documents.html"],
          ["Booking tasks", "bookings.html"],
          ["Templates", "templates.html"]
        ];
    box.innerHTML = actions.map(function (a) {
      const perm = a[2] ? ' data-perm="' + esc(a[2]) + '"' : "";
      const admin = a[3] ? ' data-admin="1"' : "";
      return '<a class="btn btn-outline" href="' + esc(a[1]) + '"' + perm + admin + '>' + esc(a[0]) + '</a>';
    }).join("");
    if (typeof pruneStaffAccess === "function") pruneStaffAccess(box);
  }

  function dashboardStats(d) {
    if (dashboardIsAdmin) {
      return [
        ["New enquiries today", d.enquiries_today || 0, "var(--status-checking)"],
        ["Open bookings", d.bookings_open || 0, "var(--status-quoted)"],
        ["Pending payments", d.payments_pending || 0, "var(--status-payment)"],
        ["Refund queue", d.refunds_pending || 0, "var(--status-payment)"],
        ["Tasks due", d.tasks_due || 0, "var(--status-docs)"],
        ["Documents pending", d.documents_pending || 0, "var(--status-docs)"]
      ];
    }
    const myTasks = staffVisibleTasks();
    return [
      ["My open tasks", myTasks.length, "var(--status-docs)"],
      ["Due today", countTasks("today"), "var(--status-checking)"],
      ["Overdue", countTasks("overdue"), "var(--status-payment)"],
      ["Open enquiries", d.enquiries_open || 0, "var(--status-quoted)"],
      ["Open bookings", d.bookings_open || 0, "var(--status-quoted)"],
      ["Docs pending", d.documents_pending || 0, "var(--status-docs)"]
    ];
  }

  function staffVisibleTasks() {
    if (dashboardIsAdmin) return dashboardTasks || [];
    return (dashboardTasks || []).filter(function (t) { return !t.assigned_to || t.assigned_to === dashboardUser.id; });
  }

  function countTasks(bucket) {
    return staffVisibleTasks().filter(function (t) { return t.due_bucket === bucket; }).length;
  }

  function priorityRows(d) {
    if (dashboardIsAdmin) {
      return [
        ["Confirmed before payment", d.bookings_confirmed_unpaid || 0, "bookings.html", "High financial risk"],
        ["Refunds waiting", d.refunds_pending || 0, "payments.html", money(d.refund_value_pending || 0)],
        ["Pending supplier payments", d.supplier_payments_pending || 0, "payments.html", "Supplier follow-up"],
        ["Documents pending", d.documents_pending || 0, "documents.html", "Before handover"],
        ["Open enquiries", d.enquiries_open || 0, "admin.html", "Sales queue"]
      ];
    }
    return [
      ["Overdue booking tasks", countTasks("overdue"), "bookings.html", "Finish first"],
      ["Tasks due today", countTasks("today"), "bookings.html", "Customer follow-up"],
      ["Prepare documents", d.documents_pending || 0, "documents.html", "Before customer handover"],
      ["Open enquiries", d.enquiries_open || 0, "admin.html", "Quote and follow-up"],
      ["Open bookings", d.bookings_open || 0, "bookings.html", "Keep customer updated"]
    ];
  }

  function renderCommandCenter(d) {
    const score = healthScore(d);
    const tone = healthTone(score);
    const riskActions = dashboardIsAdmin ? [
      { title: "Collect or verify payment", text: (d.bookings_confirmed_unpaid || 0) + " confirmed booking(s) need payment control", href: "bookings.html" },
      { title: "Clear refund queue", text: money(d.refund_value_pending || 0) + " pending approval/completion", href: "payments.html" },
      { title: "Close overdue tasks", text: (d.tasks_overdue || 0) + " overdue task(s), " + (d.tasks_today || 0) + " due today", href: "bookings.html" },
      { title: "Prepare documents", text: (d.documents_pending || 0) + " booking(s) still need document progress", href: "documents.html" }
    ] : [
      { title: "Follow up enquiries", text: (d.enquiries_open || 0) + " open enquiry(s) in the sales queue", href: "admin.html" },
      { title: "Handle my tasks", text: staffVisibleTasks().length + " visible booking task(s)", href: "bookings.html" },
      { title: "Prepare documents", text: (d.documents_pending || 0) + " booking(s) need document progress", href: "documents.html" },
      { title: "Use templates", text: "Send consistent WhatsApp and email replies", href: "templates.html" }
    ];
    const finance = dashboardIsAdmin ? [
      ["Open sales", money(d.sales_value_open), "Bookings not closed"],
      ["Open supplier cost", money(d.supplier_cost_open), "Cost exposure"],
      ["Open gross profit", money(d.gross_profit_open), "Expected margin"],
      ["Net collected 30d", money(d.net_collected_30d), "After refunds"]
    ] : [
      ["Visible tasks", staffVisibleTasks().length, "Assigned or unassigned"],
      ["Due today", countTasks("today"), "Finish before end of day"],
      ["Overdue", countTasks("overdue"), "Needs immediate action"],
      ["Open bookings", d.bookings_open || 0, "Keep customer updated"]
    ];
    document.getElementById("dashboard-command").innerHTML =
      '<div class="command-health command-' + esc(tone) + '"><div><span>' + esc(dashboardIsAdmin ? "Business health" : "My work health") + '</span><b>' + esc(score) + '%</b><p>' + esc(tone === "ok" ? (dashboardIsAdmin ? "Operations are controlled." : "Your visible queue is controlled.") : tone === "warn" ? "Some queues need attention today." : "High-priority risks need owner focus.") + '</p></div><a class="btn btn-primary" href="' + esc(dashboardIsAdmin ? "payments.html" : "bookings.html") + '">' + esc(dashboardIsAdmin ? "Open finance" : "Open tasks") + '</a></div>' +
      '<div class="command-finance">' + finance.map(function (f) {
        return '<div class="command-metric"><b>' + esc(f[1]) + '</b><span>' + esc(f[0]) + '</span><p>' + esc(f[2]) + '</p></div>';
      }).join("") + '</div>' +
      '<div class="command-actions">' + riskActions.map(function (a) {
        return '<a class="command-action" href="' + esc(a.href) + '"><b>' + esc(a.title) + '</b><span>' + esc(a.text) + '</span></a>';
      }).join("") + '</div>';
  }

  function renderPipeline(d) {
    const panel = document.getElementById("dashboard-pipeline");
    if (!panel) return;
    const stages = dashboardIsAdmin
      ? [
          ["New enquiries", d.enquiries_today || 0, "admin.html"],
          ["Sales queue", d.enquiries_open || 0, "admin.html"],
          ["Open bookings", d.bookings_open || 0, "bookings.html"],
          ["Payment risk", d.payments_pending || 0, "payments.html"],
          ["Supplier control", d.supplier_payments_pending || 0, "payments.html"],
          ["Documents", d.documents_pending || 0, "documents.html"],
          ["Refunds", d.refunds_pending || 0, "payments.html"]
        ]
      : [
          ["Enquiries", d.enquiries_open || 0, "admin.html"],
          ["Quotes", d.quotes_sent_30d || 0, "admin.html"],
          ["Bookings", d.bookings_open || 0, "bookings.html"],
          ["Tasks", staffVisibleTasks().length, "bookings.html"],
          ["Docs", d.documents_pending || 0, "documents.html"]
        ];
    panel.innerHTML = '<div class="dashboard-pipeline-track">' + stages.map(function (s, index) {
      return '<a class="dashboard-stage" href="' + esc(s[2]) + '"><span>' + esc(index + 1) + '</span><b>' + esc(s[1]) + '</b><small>' + esc(s[0]) + '</small></a>';
    }).join("") + '</div>';
  }

  function renderAdminSections(d) {
    const grid = document.getElementById("dashboard-admin-grid");
    if (grid) grid.hidden = !dashboardIsAdmin;
    if (!dashboardIsAdmin) return;
    const finance = document.getElementById("dashboard-finance-detail");
    if (finance) {
      const rows = [
        ["Open sales value", money(d.sales_value_open), "bookings.html"],
        ["Customer payment pending", d.payments_pending || 0, "payments.html"],
        ["Supplier cost pending", money(d.supplier_cost_open), "payments.html"],
        ["Expected gross profit", money(d.gross_profit_open), "accounting.html"],
        ["Refund value pending", money(d.refund_value_pending || 0), "payments.html"]
      ];
      finance.innerHTML = '<div class="ops-list">' + rows.map(function (r) {
        return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(r[0]) + '</b><p>' + esc(r[1]) + '</p></div><a class="btn btn-outline" href="' + esc(r[2]) + '">Open</a></div>';
      }).join("") + '</div>';
    }
    const accountability = document.getElementById("dashboard-accountability");
    if (accountability) {
      const unassigned = (dashboardTasks || []).filter(function (t) { return !t.assigned_to; }).length;
      const overdue = (dashboardTasks || []).filter(function (t) { return t.due_bucket === "overdue"; }).length;
      const rows = [
        ["Unassigned booking tasks", unassigned, "Assign owner or complete"],
        ["Overdue tasks", overdue, "Staff follow-up required"],
        ["Open booking reminders", dashboardTasks.length, "Across all staff-visible work"],
        ["Activity audit", (d.recent_activity || []).length, "Latest logged actions"]
      ];
      accountability.innerHTML = '<div class="ops-list">' + rows.map(function (r) {
        return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(r[0]) + '</b><p>' + esc(r[1]) + ' - ' + esc(r[2]) + '</p></div></div>';
      }).join("") + '</div>';
    }
  }

  function renderOperationsQa(d) {
    const panel = document.getElementById("dashboard-qa");
    if (!panel) return;
    const modules = [
      { name: "Sales/CRM", href: "admin.html", state: num(d.enquiries_open) ? "active" : "ready", note: num(d.enquiries_open) + " open enquiry(s)" },
      { name: "Bookings", href: "bookings.html", state: num(d.bookings_confirmed_unpaid) ? "risk" : "ready", note: num(d.bookings_open) + " open booking(s)" },
      { name: "Payments/Refunds", href: "payments.html", state: (num(d.payments_pending) || num(d.refunds_pending)) ? "warn" : "ready", note: num(d.payments_pending) + " payment / " + num(d.refunds_pending) + " refund queue" },
      { name: "Supplier Control", href: "payments.html", state: num(d.supplier_payments_pending) ? "warn" : "ready", note: num(d.supplier_payments_pending) + " supplier payment(s) pending" },
      { name: "Documents", href: "documents.html", state: num(d.documents_pending) ? "warn" : "ready", note: num(d.documents_pending) + " booking(s) need document progress" },
      { name: "Staff/Security", href: "staff.html", state: "ready", note: "Permissions, activity, and access review" },
      { name: "Accounting", href: "accounting.html", state: "ready", note: "Owner review, export, backup checks" },
      { name: "Templates", href: "templates.html", state: "ready", note: "Email, WhatsApp, supplier, and handover copy" }
    ];
    const risk = modules.filter(function (m) { return m.state === "risk"; }).length;
    const warn = modules.filter(function (m) { return m.state === "warn"; }).length;
    const tone = risk ? "risk" : warn ? "warn" : "ok";
    const next = risk
      ? "Fix red operational risks before issuing documents or closing bookings."
      : warn
        ? "Clear warning queues today, then run the full enquiry-to-accounting QA path."
        : "Core modules are aligned. Run a final live workflow test.";
    panel.innerHTML =
      '<div class="ops-qa-summary qa-' + esc(tone) + '"><div><b>' + esc(risk ? risk + " risk" : warn ? warn + " warning" : "Aligned") + '</b><span>' + esc(next) + '</span></div><a class="btn btn-primary" href="admin.html">Start from enquiries</a></div>' +
      '<div class="ops-qa-grid">' + modules.map(function (m) {
        return '<a href="' + esc(m.href) + '" class="ops-qa-module qa-' + esc(m.state) + '"><b>' + esc(m.name) + '</b><span>' + esc(m.note) + '</span></a>';
      }).join("") + '</div>' +
      '<div class="ops-qa-flow"><b>Final workflow path</b><span>Enquiry -> quote -> booking -> customer payment -> supplier control -> documents -> accounting export -> backup review.</span></div>';
  }

  function readinessState(done, warningText, readyText) {
    return {
      done: !!done,
      tone: done ? "ok" : "warn",
      text: done ? readyText : warningText
    };
  }

  function renderLaunchReadiness(d) {
    const panel = document.getElementById("dashboard-launch-readiness");
    if (!panel) return;
    const checks = [
      {
        title: "Sales pipeline",
        href: "admin.html",
        status: readinessState(
          num(d.enquiries_open) === 0,
          num(d.enquiries_open) + " enquiry(s) still need sales follow-up.",
          "No open enquiry queue blocking launch."
        )
      },
      {
        title: "Booking control",
        href: "bookings.html",
        status: readinessState(
          num(d.bookings_confirmed_unpaid) === 0 && num(d.tasks_overdue) === 0,
          num(d.bookings_confirmed_unpaid) + " unpaid confirmed booking(s), " + num(d.tasks_overdue) + " overdue task(s).",
          "Confirmed bookings and overdue tasks are controlled."
        )
      },
      {
        title: "Finance and refunds",
        href: "payments.html",
        status: readinessState(
          num(d.payments_pending) === 0 && num(d.refunds_pending) === 0,
          money(d.refund_value_pending || 0) + " refund value pending; " + num(d.payments_pending) + " payment(s) pending.",
          "Payment and refund queues are clear."
        )
      },
      {
        title: "Supplier exposure",
        href: "payments.html",
        status: readinessState(
          num(d.supplier_payments_pending) === 0,
          num(d.supplier_payments_pending) + " supplier payment(s) need control.",
          "Supplier payment exposure is clear."
        )
      },
      {
        title: "Documents and templates",
        href: "documents.html",
        status: readinessState(
          num(d.documents_pending) === 0,
          num(d.documents_pending) + " booking(s) still need document progress.",
          "Document handover queue is clear."
        )
      },
      {
        title: "Audit and backup",
        href: "backups.html",
        status: {
          done: true,
          tone: "ok",
          text: "Backup exports and activity audit review are available."
        }
      }
    ];
    const complete = checks.filter(function (c) { return c.status.done; }).length;
    const percent = Math.round((complete / checks.length) * 100);
    const summaryTone = percent === 100 ? "ok" : percent >= 70 ? "warn" : "risk";
    const summaryText = percent === 100
      ? "Ready for final live workflow testing."
      : "Clear the warning items before treating the system as launch-ready.";
    panel.innerHTML =
      '<div class="launch-readiness-summary launch-' + esc(summaryTone) + '"><div><b>' + esc(percent) + '% ready</b><span>' + esc(summaryText) + '</span></div><a class="btn btn-primary" href="activity.html">Review audit</a></div>' +
      '<div class="launch-readiness-list">' + checks.map(function (c) {
        return '<a class="launch-check launch-' + esc(c.status.tone) + '" href="' + esc(c.href) + '"><b>' + esc(c.title) + '</b><span>' + esc(c.status.text) + '</span></a>';
      }).join("") + '</div>';
  }

  function readWorkflowProgress() {
    try {
      return JSON.parse(localStorage.getItem(WORKFLOW_TEST_KEY) || "{}") || {};
    } catch (err) {
      return {};
    }
  }

  function writeWorkflowProgress(progress) {
    localStorage.setItem(WORKFLOW_TEST_KEY, JSON.stringify(progress || {}));
  }

  function readWorkflowNotes() {
    return localStorage.getItem(WORKFLOW_NOTES_KEY) || "";
  }

  function writeWorkflowNotes(notes) {
    localStorage.setItem(WORKFLOW_NOTES_KEY, notes || "");
  }

  function renderWorkflowTest() {
    const panel = document.getElementById("dashboard-workflow-test");
    if (!panel) return;
    const progress = readWorkflowProgress();
    const notes = readWorkflowNotes();
    const complete = WORKFLOW_TEST_STEPS.filter(function (s) { return progress[s.id]; }).length;
    const percent = Math.round((complete / WORKFLOW_TEST_STEPS.length) * 100);
    panel.innerHTML =
      '<div class="workflow-test-summary"><div><b>' + esc(complete) + '/' + esc(WORKFLOW_TEST_STEPS.length) + '</b><span>' + esc(percent) + '% of launch test completed on this device</span></div><a class="btn btn-primary" href="admin.html">Begin test</a></div>' +
      '<label class="workflow-test-notes"><b>Test notes</b><textarea id="workflow-test-notes" rows="3" placeholder="Blockers, owner decisions, live-test result, invoice wording, refund issue, staff note...">' + esc(notes) + '</textarea></label>' +
      '<div class="workflow-test-list">' + WORKFLOW_TEST_STEPS.map(function (s, index) {
        const checked = progress[s.id] ? " checked" : "";
        return '<div class="workflow-step' + (progress[s.id] ? " is-done" : "") + '"><label><input type="checkbox" data-workflow-step="' + esc(s.id) + '"' + checked + '><span><b>' + esc(index + 1) + '. ' + esc(s.title) + '</b><small>' + esc(s.text) + '</small></span></label><a class="btn btn-outline btn-sm" href="' + esc(s.href) + '">Open</a></div>';
      }).join("") + '</div>';
  }

  function workflowReportText() {
    const progress = readWorkflowProgress();
    const complete = WORKFLOW_TEST_STEPS.filter(function (s) { return progress[s.id]; }).length;
    const percent = Math.round((complete / WORKFLOW_TEST_STEPS.length) * 100);
    const lines = [
      "KRIDIYA launch workflow test",
      "Date: " + new Date().toLocaleString("en-GB"),
      "Progress: " + complete + "/" + WORKFLOW_TEST_STEPS.length + " (" + percent + "%)",
      ""
    ];
    const notes = readWorkflowNotes().trim();
    WORKFLOW_TEST_STEPS.forEach(function (s, index) {
      lines.push((progress[s.id] ? "[x] " : "[ ] ") + (index + 1) + ". " + s.title + " - " + s.text);
    });
    if (notes) {
      lines.push("");
      lines.push("Notes:");
      lines.push(notes);
    }
    return lines.join("\n");
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
  function taskDue(hours) {
    const d = new Date();
    d.setHours(d.getHours() + hours);
    return d.toISOString();
  }
  function existingTaskKeys() {
    return (dashboardTasks || []).reduce(function (acc, t) {
      acc[String(t.entity_id || "") + "::" + String(t.task_type || "") + "::" + String(t.title || "").toLowerCase()] = true;
      return acc;
    }, {});
  }
  function taskExists(keys, bookingId, taskType, title) {
    return !!keys[String(bookingId || "") + "::" + String(taskType || "") + "::" + String(title || "").toLowerCase()];
  }
  function suggestedTasksForBooking(b, keys) {
    const out = [];
    function add(title, type, priority, hours, notes) {
      if (taskExists(keys, b.id, type, title)) return;
      out.push({ booking: b, title: title, task_type: type, priority: priority, due_at: taskDue(hours), notes: notes });
    }
    if (["confirmed", "booked", "ticketed"].indexOf(String(b.status || "")) !== -1 && ["paid", "supplier_paid", "refunded"].indexOf(String(b.payment_status || "")) === -1) {
      add("Collect or verify customer payment", "payment", "urgent", 4, "Automation: booking is active but payment is not fully controlled.");
    }
    if (["confirmed", "paid", "booked", "ticketed"].indexOf(String(b.status || "")) !== -1 && ["generated", "sent", "archived"].indexOf(String(b.document_status || "")) === -1) {
      add("Prepare and send customer documents", "documents", "high", 12, "Automation: booking needs invoice/ticket/voucher/document progress.");
    }
    if (String(b.payment_status || "") === "refund_pending") {
      add("Review and complete refund queue item", "payment", "urgent", 2, "Automation: refund is pending approval or completion.");
    }
    if (Number(b.supplier_cost || 0) > 0 && ["supplier_paid", "paid"].indexOf(String(b.payment_status || "")) === -1) {
      add("Check supplier payment/control", "supplier_check", "normal", 24, "Automation: supplier cost exists; confirm supplier deadline/reference/payment control.");
    }
    if (b.follow_up_at && new Date(b.follow_up_at) <= new Date(Date.now() + 7 * 86400000)) {
      add("Customer follow-up due", "follow_up", "normal", 6, "Automation: booking follow-up date is due or coming soon.");
    }
    return out;
  }
  async function createMissingWorkflowTasks(button) {
    button.disabled = true;
    button.textContent = "Scanning...";
    const list = await sb.rpc("list_operations_bookings", { limit_count: 200 });
    if (list.error) {
      button.disabled = false;
      button.textContent = "Create missing tasks";
      toast("Could not scan bookings: " + list.error.message);
      return;
    }
    const keys = existingTaskKeys();
    const candidates = (list.data || []).reduce(function (acc, b) {
      return acc.concat(suggestedTasksForBooking(b, keys));
    }, []).slice(0, 40);
    if (!candidates.length) {
      button.disabled = false;
      button.textContent = "Create missing tasks";
      toast("No missing workflow tasks found.");
      return;
    }
    button.textContent = "Creating...";
    let created = 0;
    for (const item of candidates) {
      const result = await sb.rpc("create_booking_task", {
        p_booking_id: item.booking.id,
        p_title: item.title,
        p_task_type: item.task_type,
        p_due_at: item.due_at,
        p_priority: item.priority,
        p_notes: item.notes
      });
      if (!result.error) created++;
    }
    button.disabled = false;
    button.textContent = "Create missing tasks";
    toast(created + " workflow task(s) created.");
    await loadDashboard();
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
    const workflowToggle = event.target.closest("[data-workflow-step]");
    if (workflowToggle) {
      const progress = readWorkflowProgress();
      progress[workflowToggle.dataset.workflowStep] = workflowToggle.checked;
      writeWorkflowProgress(progress);
      renderWorkflowTest();
      return;
    }
    const workflowReset = event.target.closest("#workflow-test-reset");
    if (workflowReset) {
      writeWorkflowProgress({});
      writeWorkflowNotes("");
      renderWorkflowTest();
      toast("Workflow test reset.");
      return;
    }
    const workflowCopy = event.target.closest("#workflow-test-copy");
    if (workflowCopy) {
      const text = workflowReportText();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        toast("Workflow test report copied.");
      } else {
        window.prompt("Copy workflow test report", text);
      }
      return;
    }
    const autoTasks = event.target.closest("#workflow-auto-tasks");
    if (autoTasks) {
      await createMissingWorkflowTasks(autoTasks);
      return;
    }
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

  function handleDashboardInput(event) {
    if (event.target && event.target.id === "workflow-test-notes") {
      writeWorkflowNotes(event.target.value);
    }
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
