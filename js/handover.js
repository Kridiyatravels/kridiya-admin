"use strict";
(function () {
  if (document.body.dataset.page !== "handover") return;

  const SECTIONS = [
    {
      title: "Daily opening",
      owner: "Owner / senior staff",
      href: "dashboard.html",
      steps: [
        "Open Dashboard and check System health, Operations QA, Launch readiness, and Booking reminders.",
        "Clear red risks first: unpaid confirmed bookings, pending refunds, overdue tasks, and missing documents.",
        "Copy the Workflow Test report after major checks or before staff handover."
      ]
    },
    {
      title: "Enquiry to quote",
      owner: "Sales",
      href: "admin.html",
      steps: [
        "Open Enquiries and filter by awaiting quote, new, or follow-up needed.",
        "Confirm customer name, phone, email, service, travel dates, route/destination, and internal notes.",
        "Send a service-aware quote with price, inclusions, validity, cancellation/refund rules, and next action."
      ]
    },
    {
      title: "Booking control",
      owner: "Operations",
      href: "bookings.html",
      steps: [
        "Convert only clean enquiries into bookings with customer link, booking reference, service details, and passenger/company data.",
        "Add task deadlines for supplier follow-up, payment collection, document collection, and customer handover.",
        "Do not mark a booking fully complete until payment, supplier, documents, and audit trail are controlled."
      ]
    },
    {
      title: "Finance, refunds, suppliers",
      owner: "Finance / owner",
      href: "payments.html",
      steps: [
        "Record customer payment requests, proofs, received amounts, balances, and references.",
        "For refunds, request first, owner/admin approves, then complete with method, reference, amount, and reason.",
        "Record supplier payable, paid amount, supplier reference, disputed status, and exposure before final handover."
      ]
    },
    {
      title: "Documents and templates",
      owner: "Documents team",
      href: "documents.html",
      steps: [
        "Generate invoices, itineraries, tickets, vouchers, visa notes, cancellation/refund letters, and package documents from the booking/enquiry trail.",
        "Use Templates for consistent WhatsApp/email/supplier/customer wording.",
        "Use no-VAT wording for now. If VAT registration changes later, update TRN/VAT settings before issuing final invoices."
      ]
    },
    {
      title: "Corporate handling",
      owner: "Corporate desk",
      href: "corporate.html",
      steps: [
        "Check company contacts, accounts email, authorized person, LPO approver, credit/monthly billing status, and risk warnings.",
        "For every corporate booking, record requester, approval person, LPO number if required, and billing notes.",
        "Keep on-hold or incomplete corporate accounts out of priority handover until owner confirms."
      ]
    },
    {
      title: "Staff and security",
      owner: "Owner/admin",
      href: "staff.html",
      steps: [
        "Create staff with email and PIN access only when required.",
        "Give minimum permissions needed for the role; finance, refunds, reports, backups, and staff management stay owner-controlled.",
        "Review activity log monthly and after unusual payment, refund, settings, staff, or export activity."
      ]
    },
    {
      title: "Backup and emergency",
      owner: "Owner/admin",
      href: "backups.html",
      steps: [
        "Download the full backup pack at least monthly and before big system changes.",
        "Keep files in a dated folder: Kridiya Travel/Finance/YYYY/MM.",
        "If the system is unavailable, use exported bookings, payments, customers, documents, and activity files as the emergency operating record."
      ]
    }
  ];

  function esc(v) { return KridiyaAuth.escapeHTML(String(v == null ? "" : v)); }

  function sopText() {
    const lines = ["KRIDIYA Travel SOP & Handover", "Generated: " + new Date().toLocaleString("en-GB"), ""];
    SECTIONS.forEach(function (section) {
      lines.push(section.title + " (" + section.owner + ")");
      section.steps.forEach(function (step, index) { lines.push((index + 1) + ". " + step); });
      lines.push("");
    });
    return lines.join("\n");
  }

  function render() {
    document.getElementById("handover-summary").innerHTML =
      '<div class="handover-summary"><div><b>8 operating areas</b><span>Use this as the company method for staff training, launch QA, monthly review, and emergency operation.</span></div><a class="btn btn-outline" href="dashboard.html">Open dashboard</a></div>';
    document.getElementById("handover-sections").innerHTML = SECTIONS.map(function (section) {
      return '<article class="handover-card"><div class="handover-card-head"><div><h2>' + esc(section.title) + '</h2><p>' + esc(section.owner) + '</p></div><a class="btn btn-outline btn-sm" href="' + esc(section.href) + '">Open</a></div><ol>' + section.steps.map(function (step) {
        return '<li>' + esc(step) + '</li>';
      }).join("") + '</ol></article>';
    }).join("");
  }

  async function boot() {
    const gate = document.getElementById("handover-gate");
    const app = document.getElementById("handover-app");
    const user = await KridiyaAuth.currentUser();
    if (!user) { renderLoginForm(gate, boot); return; }
    const sb = await KridiyaAuth.client();
    const staffCheck = await sb.rpc("is_staff");
    if (staffCheck.error || staffCheck.data !== true) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>You do not have access.</b><br>This SOP is for Kridiya staff only.</p></div>';
      return;
    }
    await showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    render();
    document.getElementById("handover-copy").addEventListener("click", async function () {
      const text = sopText();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        toast("SOP copied.");
      } else {
        window.prompt("Copy SOP", text);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
