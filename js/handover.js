"use strict";
(function () {
  if (document.body.dataset.page !== "handover") return;
  let sb = null;
  let handovers = [];
  let currentUserId = null;

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
        "Keep monthly exports in: Kridiya Travel/05 Staff and Security/Monthly Backups/YYYY-MM.",
        "If the system is unavailable, use exported bookings, payments, customers, documents, and activity files as the emergency operating record."
      ]
    },
    {
      title: "SharePoint archive",
      owner: "Owner/admin",
      href: "backups.html",
      steps: [
        "Use root folder: Kridiya Travel, with Company Records, Operations, Finance, Corporate Clients, Suppliers, Staff and Security, and Emergency Backups.",
        "For every booking use: Operations/Bookings/YYYY/MM/BOOKING-REFERENCE - Customer Name.",
        "Inside each booking keep: Customer Documents, Tickets and Vouchers, Invoices and Receipts, Payment Proofs, Supplier Invoices, Refunds and Cancellations, and Internal Notes.",
        "Name files as: YYYY-MM-DD - BOOKING-REFERENCE - Customer Name - Document Type.ext.",
        "Never share internal folders directly with customers; release customer-ready files through admin first."
      ]
    },
    {
      title: "Launch checklist",
      owner: "Owner/admin",
      href: "dashboard.html",
      steps: [
        "Before launch, open Dashboard, Enquiries, Customers, Bookings, Payments, Documents, Staff, Activity, and Backups once.",
        "Confirm no confirmed booking is missing payment control, no refund is waiting without owner action, and no overdue task blocks handover.",
        "Download the backup pack and save it into the monthly archive folder.",
        "Confirm business settings are correct: legal name, trade licence, bank details, no-VAT status, and cancellation/refund wording.",
        "After launch, run the same checklist weekly and run the full backup/security review monthly."
      ]
    },
    {
      title: "Emergency fallback",
      owner: "Owner/admin",
      href: "backups.html",
      steps: [
        "If admin is unavailable, use the latest backup pack as the temporary operating record.",
        "Track manual changes in a spreadsheet: booking updates, payments, refunds, supplier notes, document releases, and customer messages.",
        "Do not share internal archive folders with customers during outage; send only final customer-ready files.",
        "When admin returns, enter every manual change back into the system and upload the supporting files."
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
      '<div class="handover-summary"><div><b>' + esc(SECTIONS.length) + ' operating areas</b><span>Use this as the company method for staff training, launch QA, monthly review, and emergency operation.</span></div><a class="btn btn-outline" href="dashboard.html">Open dashboard</a></div>';
    document.getElementById("handover-sections").innerHTML = SECTIONS.map(function (section) {
      return '<article class="handover-card"><div class="handover-card-head"><div><h2>' + esc(section.title) + '</h2><p>' + esc(section.owner) + '</p></div><a class="btn btn-outline btn-sm" href="' + esc(section.href) + '">Open</a></div><ol>' + section.steps.map(function (step) {
        return '<li>' + esc(step) + '</li>';
      }).join("") + '</ol></article>';
    }).join("");
    document.getElementById("shift-handover-list").innerHTML = handovers.length ? '<div class="ops-list">'+handovers.map(function(h){const action=h.status==='submitted'?(h.submitted_by===currentUserId?'<span class="ops-chip">Awaiting another staff member</span>':'<button class="btn btn-primary js-accept-handover" data-id="'+esc(h.id)+'" type="button">Accept handover</button>'):'<span class="ops-chip">Accepted</span>';return '<div class="ops-row"><div class="ops-row-main"><b>'+esc(h.summary)+'</b><p>'+esc(h.open_items)+' / Risks: '+esc(h.risks)+'</p><div class="ops-kv"><span class="ops-chip">'+esc(h.status)+'</span><span class="ops-chip">Submitted '+esc(new Date(h.submitted_at).toLocaleString("en-GB"))+'</span></div></div><div class="ops-row-actions">'+action+'</div></div>'}).join('')+'</div>' : '<p class="form-note">No signed handovers yet.</p>';
  }
  async function loadHandovers(){const r=await sb.rpc("list_shift_handovers",{p_limit:30});if(r.error)throw r.error;handovers=r.data||[];}

  async function boot() {
    const gate = document.getElementById("handover-gate");
    const app = document.getElementById("handover-app");
    const user = await KridiyaAuth.currentUser();
    if (!user) { renderLoginForm(gate, boot); return; }
    currentUserId = user.id;
    sb = await KridiyaAuth.client();
    const staffCheck = await sb.rpc("is_staff");
    if (staffCheck.error || staffCheck.data !== true) {
      gate.innerHTML = '<div class="account-main empty-state"><p><b>You do not have access.</b><br>This SOP is for Kridiya staff only.</p></div>';
      return;
    }
    await showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    await loadHandovers(); render();
    document.getElementById("shift-handover-form").addEventListener("submit",async function(){const f=this;if(!f.reportValidity())return;const started=new Date(f.started_at.value),ended=new Date(f.ended_at.value);if(Number.isNaN(started.getTime())||Number.isNaN(ended.getTime())){toast("Enter valid shift start and end times.","error");return;}const r=await sb.rpc("submit_shift_handover",{p_started_at:started.toISOString(),p_ended_at:ended.toISOString(),p_summary:f.summary.value,p_open_items:f.open_items.value,p_risks:f.risks.value});if(r.error){toast(r.error.message,"error");return;}f.reset();await loadHandovers();render();toast("Shift handover submitted.");});
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
  document.addEventListener("click",async function(e){const b=e.target.closest(".js-accept-handover");if(!b)return;const note=prompt("Acceptance note (minimum 10 characters):","");if(note===null)return;const r=await sb.rpc("accept_shift_handover",{p_handover_id:b.dataset.id,p_note:note});if(r.error){toast(r.error.message,"error");return;}await loadHandovers();render();toast("Shift handover accepted.");});

  document.addEventListener("DOMContentLoaded", boot);
})();
