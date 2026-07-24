"use strict";
(function () {
  if (document.body.dataset.page !== "bookings") return;
  let sb = null;

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
    showStaffNav();
    gate.hidden = true;
    app.hidden = false;
    document.getElementById("booking-new-toggle").addEventListener("click", function () {
      const card = document.getElementById("booking-form-card");
      card.hidden = !card.hidden;
    });
    document.getElementById("booking-form").addEventListener("submit", createBooking);
    await loadBookings();
  }

  async function createBooking() {
    const form = document.getElementById("booking-form");
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const payload = {
      p_title: form.title.value.trim(),
      p_service_type: form.service_type.value,
      p_booking_kind: form.booking_kind.value,
      p_customer_name: form.customer_name.value.trim(),
      p_customer_email: form.customer_email.value.trim() || null,
      p_customer_phone: form.customer_phone.value.trim() || null,
      p_route_or_destination: form.route_or_destination.value.trim() || null,
      p_travel_start: form.travel_start.value || null,
      p_travel_end: form.travel_end.value || null,
      p_selling_price: form.selling_price.value ? Number(form.selling_price.value) : null,
      p_supplier_cost: form.supplier_cost.value ? Number(form.supplier_cost.value) : null,
      p_supplier_name: form.supplier_name.value.trim() || null,
      p_notes: form.notes.value.trim() || null
    };
    try {
      const result = await sb.rpc("create_operations_booking", payload);
      if (result.error) throw result.error;
      toast("Booking created.");
      form.reset();
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
    const rows = result.data || [];
    document.getElementById("bookings-count").textContent = rows.length + " booking(s)";
    document.getElementById("bookings-list").innerHTML = rows.length ? '<div class="ops-list">' + rows.map(function (b) {
      return '<div class="ops-row"><div class="ops-row-main"><b>' + esc(b.booking_reference) + ' - ' + esc(b.title) + '</b><p>' + esc(label(b.service_type)) + ' - ' + esc(label(b.status)) + ' - ' + esc(b.route_or_destination || "No route/destination") + '</p><div class="ops-kv"><span class="ops-chip">Payment: ' + esc(label(b.payment_status)) + '</span><span class="ops-chip">Docs: ' + esc(label(b.document_status)) + '</span><span class="ops-chip">Sell: ' + esc(money(b.selling_price, b.currency)) + '</span><span class="ops-chip">Cost: ' + esc(money(b.supplier_cost, b.currency)) + '</span><span class="ops-chip">Profit: ' + esc(money(b.gross_profit, b.currency)) + '</span></div></div><div class="ops-row-actions"><a class="btn btn-primary" href="booking-detail.html?id=' + esc(b.id) + '">Open</a><a class="btn btn-outline" href="documents.html">Document</a></div></div>';
    }).join("") + '</div>' : '<p class="form-note">No bookings yet. Create the first one when a customer confirms interest.</p>';
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
