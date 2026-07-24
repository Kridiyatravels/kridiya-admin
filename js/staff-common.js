/* ============================================================
   Kridiya Travel - staff site shared chrome
   admin.kridiyatravel.com only. Auth *logic* (js/auth.js - the
   Supabase client, KridiyaAuth.login/currentUser/etc.) is loaded from
   the main site so there is one source of truth for password handling
   and account data. The *session* is NOT shared with kridiyatravel.com
   though - this site has its own independent sign-in, deliberately, so
   being logged into one never implies being logged into the other.
   ============================================================ */
"use strict";

/* Public values (not secrets) - same ones baked into the main site's
   js/auth.js. Needed here only to call the staff-pin-login Edge
   Function directly by URL, which isn't reachable through the
   supabase-js client the way a normal RPC call is. */
const SUPABASE_URL = "https://jmvqqpughlzeqrcyavwz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_wiA9tSt74X-UQhW4yOXgIQ_lEUG1Q1Q";

const ICONS_STAFF = {
  whatsapp: "M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.4-3c-.3-.4 0-.5.2-.7l.4-.5c.1-.2.2-.3.3-.5v-.5c0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s1 2.5 1.1 2.7c.1.2 1.9 3 4.7 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.3z",
  mail: "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z",
  logout: "M10 17v-2H3v-6h7V7l5 5-5 5zM10 3h9v2h-9V3zm0 16h9v2h-9v-2zm0-8h9v2h-9v-2z",
  check: "M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.2 14.2L11 13.3V7h1.5v5.4l4.5 2.7-.8 1.1z",
  quote: "M7 7h5v5c0 2.2-1.8 4-4 4H7v-2h1c1.1 0 2-.9 2-2H7V7zm9 0h5v5c0 2.2-1.8 4-4 4h-1v-2h1c1.1 0 2-.9 2-2h-3V7z",
  note: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 5h10v2H7V8zm0 4h10v2H7v-2zm0 4h6v2H7v-2z",
  doc: "M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V9h5.5L13 3.5z",
  user: "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.2-8 5v3h16v-3c0-2.8-3.6-5-8-5z",
  chevron: "M7 10l5 5 5-5z",
  settings: "M19.14 12.94a7.14 7.14 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.14.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.14 7.14 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.32.6.22l2.39-.96c.49.38 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.14-.56 1.63-.94l2.39.96c.24.1.5 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
};

function icon(name, cls) {
  return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + (ICONS_STAFF[name] || "") + '"/></svg>';
}

let toastTimer = null;
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(function () { el.classList.add("show"); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove("show"); }, 4200);
}

function renderStaffChrome() {
  const page = document.body.dataset.page;
  const header = document.getElementById("site-header");
  if (header) {
    header.innerHTML =
      '<div class="staff-topbar"><div class="container staff-topbar-inner">' +
        '<a class="staff-logo" href="dashboard.html">' +
          '<img src="https://kridiyatravel.com/assets/logo.png" alt="Kridiya Travel" width="36" height="36">' +
          "<span>Kridiya <b>Staff Tools</b></span>" +
        "</a>" +
        '<nav class="staff-nav" hidden>' +
          '<a href="dashboard.html"' + (page === "dashboard" ? ' aria-current="page"' : "") + '>Dashboard</a>' +
          '<a href="admin.html"' + (page === "admin" ? ' aria-current="page"' : "") + '>Enquiries</a>' +
          '<a href="bookings.html"' + (page === "bookings" ? ' aria-current="page"' : "") + '>Bookings</a>' +
          '<a href="corporate.html"' + (page === "corporate" ? ' aria-current="page"' : "") + '>Corporate</a>' +
          '<a href="payments.html"' + (page === "payments" ? ' aria-current="page"' : "") + '>Payments</a>' +
          '<a href="documents.html"' + (page === "documents" ? ' aria-current="page"' : "") + '>Documents</a>' +
          '<a href="portals.html"' + (page === "portals" ? ' aria-current="page"' : "") + '>Portals</a>' +
          '<a href="staff.html"' + (page === "staff" ? ' aria-current="page"' : "") + '>Staff</a>' +
          '<a href="activity.html"' + (page === "activity" ? ' aria-current="page"' : "") + '>Activity</a>' +
          '<a href="backups.html"' + (page === "backups" ? ' aria-current="page"' : "") + '>Backups</a>' +
        '</nav>' +
        '<div class="staff-actions">' +
          '<a class="btn btn-outline" href="https://kridiyatravel.com" target="_blank" rel="noopener">Main site</a>' +
          '<button type="button" class="btn btn-outline" id="staff-logout">' + icon("logout") + " Log out</button>" +
        "</div>" +
      "</div></div>";
    const logoutBtn = document.getElementById("staff-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async function () {
        try {
          const user = await KridiyaAuth.currentUser();
          if (user) {
            const sb = await KridiyaAuth.client();
            await logActivity(sb, user.id, "auth.logout", "user", user.id, {});
          }
        } catch (e) { /* best-effort */ }
        await KridiyaAuth.logout();
        location.reload();
      });
    }
  }
  const footer = document.getElementById("site-footer");
  if (footer) {
    footer.innerHTML = '<div class="container staff-footer-inner">Kridiya Travel and Tourism FZ-LLC - internal staff tools, not for public access.</div>';
  }
}

const STATUS_META = {
  received: { color: "var(--status-received)", bg: "var(--status-received-bg)" },
  checking_availability: { color: "var(--status-checking)", bg: "var(--status-checking-bg)" },
  quote_sent: { color: "var(--status-quoted)", bg: "var(--status-quoted-bg)" },
  confirmed: { color: "var(--status-confirmed)", bg: "var(--status-confirmed-bg)" },
  payment_pending: { color: "var(--status-payment)", bg: "var(--status-payment-bg)" },
  booked: { color: "var(--status-booked)", bg: "var(--status-booked-bg)" },
  documents_sent: { color: "var(--status-docs)", bg: "var(--status-docs-bg)" },
  closed: { color: "var(--status-closed)", bg: "var(--status-closed-bg)" }
};
function statusStyle(status) {
  const m = STATUS_META[status] || STATUS_META.received;
  return "color:" + m.color + ";background:" + m.bg;
}

/* Best-effort activity log write - never blocks the real action if it
   fails (e.g. RLS denies it for a non-staff caller mid-session). */
async function logActivity(sb, actorId, eventType, entityType, entityId, metadata) {
  try {
    await sb.from("audit_events").insert({
      actor_user_id: actorId,
      event_type: eventType,
      entity_type: entityType || null,
      entity_id: entityId || null,
      metadata: metadata || {}
    });
  } catch (e) { /* logging is best-effort */ }
}

/* Renders a tabbed sign-in form into `gateEl` and calls `onSuccess()`
   once a session is established. Two independent paths, both landing
   in the same KridiyaAuth session either way:
   - Staff: pick your name, enter your PIN - goes through the
     staff-pin-login Edge Function, which resolves the real email
     server-side (the browser never sees it) and returns session
     tokens to adopt.
   - Admin: normal email + password via KridiyaAuth.login(), for
     owners/admins only. */
function renderLoginForm(gateEl, onSuccess) {
  gateEl.innerHTML =
    '<div class="login-shell">' +
      '<div class="login-shell-header">' +
        "<h1>Staff Tools</h1>" +
        "<p>Sign in to Kridiya Travel and Tourism</p>" +
      "</div>" +
      '<div class="login-tabs" role="tablist">' +
        '<button type="button" class="login-tab active" data-tab="staff" role="tab" aria-selected="true">Staff (PIN)</button>' +
        '<button type="button" class="login-tab" data-tab="admin" role="tab" aria-selected="false">Admin</button>' +
      "</div>" +
      '<div id="login-tab-staff" class="login-tab-panel">' +
        '<p class="form-note">Enter your 6-digit staff PIN.</p>' +
        '<form id="pin-login-form" class="form-grid" novalidate>' +
          '<div class="form-banner error" hidden role="alert"></div>' +
          '<div class="field">' +
            '<label>PIN</label>' +
            '<div class="pin-group">' +
              '<div class="pin-boxes" role="group" aria-label="6-digit PIN">' +
                new Array(6).fill(0).map(function (_, i) {
                  return (i === 3 ? '<span class="pin-sep" aria-hidden="true">&ndash;</span>' : "") +
                    '<input class="pin-box" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off" aria-label="PIN digit">';
                }).join("") +
              "</div>" +
              '<button type="button" class="pin-toggle" aria-pressed="false">Show</button>' +
            "</div>" +
          "</div>" +
          '<div class="login-actions"><button class="btn btn-primary" type="submit">Log in</button></div>' +
        "</form>" +
      "</div>" +
      '<div id="login-tab-admin" class="login-tab-panel" hidden>' +
        '<p class="form-note">Email and password - owners/admins only.</p>' +
        '<form id="admin-login-form" class="form-grid" novalidate>' +
          '<div class="form-banner error" hidden role="alert"></div>' +
          '<div class="field"><label>EMAIL</label><input name="email" type="email" required autocomplete="username"></div>' +
          '<div class="field"><label>PASSWORD</label>' +
            '<div class="pw-wrap"><input name="password" type="password" required autocomplete="current-password">' +
            '<button type="button" class="pw-toggle" aria-label="Show password">SHOW</button></div>' +
          "</div>" +
          '<div class="login-actions"><button class="btn btn-primary" type="submit">Log in</button></div>' +
        "</form>" +
        '<p class="form-note" style="margin-top:0.8rem"><a href="https://kridiyatravel.com/forgot-password.html" target="_blank" rel="noopener">Forgot password?</a></p>' +
      "</div>" +
    "</div>";

  const pinBoxes = Array.prototype.slice.call(gateEl.querySelectorAll(".pin-box"));

  gateEl.querySelectorAll(".login-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      gateEl.querySelectorAll(".login-tab").forEach(function (t) {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", String(t === tab));
      });
      gateEl.querySelectorAll(".login-tab-panel").forEach(function (p) {
        p.hidden = p.id !== "login-tab-" + tab.dataset.tab;
      });
      if (tab.dataset.tab === "staff" && pinBoxes[0]) pinBoxes[0].focus();
    });
  });

  pinBoxes.forEach(function (box, idx) {
    box.addEventListener("input", function () {
      box.value = box.value.replace(/[^0-9]/g, "").slice(0, 1);
      if (box.value && idx < pinBoxes.length - 1) pinBoxes[idx + 1].focus();
    });
    box.addEventListener("keydown", function (e) {
      if (e.key === "Backspace" && !box.value && idx > 0) {
        pinBoxes[idx - 1].focus();
      }
    });
  });

  const pinToggle = gateEl.querySelector(".pin-toggle");
  if (pinToggle) {
    pinToggle.addEventListener("click", function () {
      const showing = pinBoxes[0] && pinBoxes[0].type === "text";
      pinBoxes.forEach(function (b) { b.type = showing ? "password" : "text"; });
      pinToggle.textContent = showing ? "Show" : "Hide";
      pinToggle.setAttribute("aria-pressed", String(!showing));
    });
  }

  const pinForm = gateEl.querySelector("#pin-login-form");
  pinForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const banner = pinForm.querySelector(".form-banner");
    banner.hidden = true;
    const pin = pinBoxes.map(function (b) { return b.value; }).join("");
    if (!/^\d{6}$/.test(pin)) {
      banner.hidden = false;
      banner.textContent = "Enter all 6 digits of your PIN.";
      return;
    }
    const btn = pinForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Signing in...";
    try {
      const resp = await fetch(SUPABASE_URL + "/functions/v1/staff-pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ pin: pin })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Could not sign in.");
      const sb = await KridiyaAuth.client();
      const setResult = await sb.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
      if (setResult.error) throw setResult.error;
      onSuccess();
    } catch (err) {
      banner.hidden = false;
      banner.textContent = err.message;
      pinBoxes.forEach(function (b) { b.value = ""; });
      if (pinBoxes[0]) pinBoxes[0].focus();
      btn.disabled = false;
      btn.textContent = "Log in";
    }
  });

  const adminForm = gateEl.querySelector("#admin-login-form");
  const pwInput = adminForm.querySelector('input[name="password"]');
  const pwToggle = adminForm.querySelector(".pw-toggle");
  pwToggle.addEventListener("click", function () {
    const show = pwInput.type === "password";
    pwInput.type = show ? "text" : "password";
    pwToggle.textContent = show ? "HIDE" : "SHOW";
  });
  adminForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const banner = adminForm.querySelector(".form-banner");
    banner.hidden = true;
    const btn = adminForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Signing in...";
    try {
      const user = await KridiyaAuth.login(adminForm.email.value, adminForm.password.value);
      const sb = await KridiyaAuth.client();
      logActivity(sb, user.id, "auth.login", "user", user.id, { method: "password" });
      onSuccess();
    } catch (err) {
      banner.hidden = false;
      banner.textContent = err.message;
      btn.disabled = false;
      btn.textContent = "Log in";
    }
  });
}

function showStaffNav() {
  const nav = document.querySelector(".staff-nav");
  if (nav) nav.hidden = false;
}

document.addEventListener("DOMContentLoaded", renderStaffChrome);



