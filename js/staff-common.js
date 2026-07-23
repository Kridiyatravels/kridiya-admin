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
        "</nav>" +
        '<div class="staff-actions">' +
          '<a class="btn btn-outline" href="https://kridiyatravel.com" target="_blank" rel="noopener">Main site ↗</a>' +
          '<button type="button" class="btn btn-outline" id="staff-logout">' + icon("logout") + " Log out</button>" +
        "</div>" +
      "</div></div>";
    const logoutBtn = document.getElementById("staff-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async function () {
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

/* Renders a self-contained email/password sign-in form into `gateEl`
   and calls `onSuccess()` once KridiyaAuth.login() resolves. Used by
   admin.html and documents.html instead of redirecting to the main
   site's login page, since this site keeps its own session. */
function renderLoginForm(gateEl, onSuccess) {
  gateEl.innerHTML =
    '<div class="account-main" style="max-width:420px;margin:2rem auto">' +
      "<h2 style=\"margin-top:0\">Staff sign in</h2>" +
      '<p class="form-note">A separate login from the customer site — use your Kridiya staff account.</p>' +
      '<form id="staff-login-form" class="form-grid" novalidate>' +
        '<div class="form-banner error" hidden role="alert"></div>' +
        '<div class="field"><label>EMAIL</label><input name="email" type="email" required autocomplete="username"></div>' +
        '<div class="field"><label>PASSWORD</label>' +
          '<div class="pw-wrap"><input name="password" type="password" required autocomplete="current-password">' +
          '<button type="button" class="pw-toggle" aria-label="Show password">SHOW</button></div>' +
        "</div>" +
        '<button class="btn btn-primary btn-block" type="submit">Log in</button>' +
      "</form>" +
      '<p class="form-note" style="margin-top:0.8rem"><a href="https://kridiyatravel.com/forgot-password.html" target="_blank" rel="noopener">Forgot password?</a></p>' +
    "</div>";

  const form = document.getElementById("staff-login-form");
  const banner = form.querySelector(".form-banner");
  const pwInput = form.querySelector('input[name="password"]');
  const pwToggle = form.querySelector(".pw-toggle");
  pwToggle.addEventListener("click", function () {
    const show = pwInput.type === "password";
    pwInput.type = show ? "text" : "password";
    pwToggle.textContent = show ? "HIDE" : "SHOW";
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    banner.hidden = true;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Signing in…";
    try {
      await KridiyaAuth.login(form.email.value, form.password.value);
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
