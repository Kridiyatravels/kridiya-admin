/* ============================================================
   Kridiya Travel — staff site shared chrome
   admin.kridiyatravel.com only. Auth *logic* (js/auth.js — the
   Supabase client, KridiyaAuth.login/currentUser/etc.) is loaded from
   the main site so there is one source of truth for password handling
   and account data. The *session* is NOT shared with kridiyatravel.com
   though — this site has its own independent sign-in, deliberately, so
   being logged into one never implies being logged into the other.
   ============================================================ */
"use strict";

/* Public values (not secrets) — same ones baked into the main site's
   js/auth.js. Needed here only to call the staff-pin-login Edge
   Function directly by URL, which isn't reachable through the
   supabase-js client the way a normal RPC call is. */
const SUPABASE_URL = "https://jmvqqpughlzeqrcyavwz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_wiA9tSt74X-UQhW4yOXgIQ_lEUG1Q1Q";

const ICONS_STAFF = {
  whatsapp: "M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.4-3c-.3-.4 0-.5.2-.7l.4-.5c.1-.2.2-.3.3-.5v-.5c0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s1 2.5 1.1 2.7c.1.2 1.9 3 4.7 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.3z",
  mail: "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z",
  logout: "M10 17v-2H3v-6h7V7l5 5-5 5zM10 3h9v2h-9V3zm0 16h9v2h-9v-2zm0-8h9v2h-9v-2z"
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
        '<a class="staff-logo" href="https://kridiyatravel.com">' +
          '<img src="https://kridiyatravel.com/assets/logo.png" alt="Kridiya Travel" width="36" height="36">' +
          "<span>Kridiya <b>Staff Tools</b></span>" +
        "</a>" +
        '<nav class="staff-nav">' +
          '<a href="admin.html"' + (page === "admin" ? ' aria-current="page"' : "") + ">Enquiries</a>" +
          '<a href="documents.html"' + (page === "documents" ? ' aria-current="page"' : "") + ">Documents</a>" +
          '<a href="activity.html"' + (page === "activity" ? ' aria-current="page"' : "") + ">Activity</a>" +
        "</nav>" +
        '<div class="staff-actions">' +
          '<a class="btn btn-outline" href="https://kridiyatravel.com" target="_blank" rel="noopener">Main site ↗</a>' +
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
    footer.innerHTML = '<div class="container staff-footer-inner">Kridiya Travel and Tourism FZ-LLC &mdash; internal staff tools, not for public access.</div>';
  }
}

/* Best-effort activity log write — never blocks the real action if it
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
   - Staff: pick your name, enter your PIN — goes through the
     staff-pin-login Edge Function, which resolves the real email
     server-side (the browser never sees it) and returns session
     tokens to adopt.
   - Admin: normal email + password via KridiyaAuth.login(), for
     owners/admins only. */
function renderLoginForm(gateEl, onSuccess) {
  gateEl.innerHTML =
    '<div class="account-main" style="max-width:460px;margin:2rem auto">' +
      '<div class="login-tabs" role="tablist">' +
        '<button type="button" class="login-tab active" data-tab="staff" role="tab" aria-selected="true">Staff (PIN)</button>' +
        '<button type="button" class="login-tab" data-tab="admin" role="tab" aria-selected="false">Admin</button>' +
      "</div>" +
      '<div id="login-tab-staff" class="login-tab-panel">' +
        '<p class="form-note">Pick your name and enter your PIN.</p>' +
        '<form id="pin-login-form" class="form-grid" novalidate>' +
          '<div class="form-banner error" hidden role="alert"></div>' +
          '<div class="field"><label>YOUR NAME</label><select name="staff_profile_id" required><option value="">Loading…</option></select></div>' +
          '<div class="field"><label>PIN</label><input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" required autocomplete="off"></div>' +
          '<button class="btn btn-primary btn-block" type="submit">Log in</button>' +
        "</form>" +
      "</div>" +
      '<div id="login-tab-admin" class="login-tab-panel" hidden>' +
        '<p class="form-note">Email and password — owners/admins only.</p>' +
        '<form id="admin-login-form" class="form-grid" novalidate>' +
          '<div class="form-banner error" hidden role="alert"></div>' +
          '<div class="field"><label>EMAIL</label><input name="email" type="email" required autocomplete="username"></div>' +
          '<div class="field"><label>PASSWORD</label>' +
            '<div class="pw-wrap"><input name="password" type="password" required autocomplete="current-password">' +
            '<button type="button" class="pw-toggle" aria-label="Show password">SHOW</button></div>' +
          "</div>" +
          '<button class="btn btn-primary btn-block" type="submit">Log in</button>' +
        "</form>" +
        '<p class="form-note" style="margin-top:0.8rem"><a href="https://kridiyatravel.com/forgot-password.html" target="_blank" rel="noopener">Forgot password?</a></p>' +
      "</div>" +
    "</div>";

  gateEl.querySelectorAll(".login-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      gateEl.querySelectorAll(".login-tab").forEach(function (t) {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", String(t === tab));
      });
      gateEl.querySelectorAll(".login-tab-panel").forEach(function (p) {
        p.hidden = p.id !== "login-tab-" + tab.dataset.tab;
      });
    });
  });

  const staffSelect = gateEl.querySelector('select[name="staff_profile_id"]');
  KridiyaAuth.client().then(function (sb) {
    return sb.rpc("list_staff_for_login");
  }).then(function (result) {
    const rows = (result && result.data) || [];
    if (!rows.length) {
      staffSelect.innerHTML = '<option value="">No staff set up yet — use the Admin tab</option>';
      return;
    }
    staffSelect.innerHTML = '<option value="">Choose your name…</option>' + rows.map(function (r) {
      const label = r.department ? r.full_name + " — " + r.department : r.full_name;
      return '<option value="' + r.id + '">' + label.replace(/</g, "&lt;") + "</option>";
    }).join("");
  }).catch(function () {
    staffSelect.innerHTML = '<option value="">Could not load staff list</option>';
  });

  const pinForm = gateEl.querySelector("#pin-login-form");
  pinForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const banner = pinForm.querySelector(".form-banner");
    banner.hidden = true;
    if (!pinForm.staff_profile_id.value) {
      banner.hidden = false;
      banner.textContent = "Choose your name first.";
      return;
    }
    const btn = pinForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Signing in…";
    try {
      const resp = await fetch(SUPABASE_URL + "/functions/v1/staff-pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ staff_profile_id: pinForm.staff_profile_id.value, pin: pinForm.pin.value })
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
    btn.textContent = "Signing in…";
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

document.addEventListener("DOMContentLoaded", renderStaffChrome);
