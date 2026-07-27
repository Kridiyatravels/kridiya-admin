/* ============================================================
   Shared preset autocomplete for Kridiya staff tools.
   Usage: add data-preset="airline" / "nationality" / etc. to
   an input, then call initPresetAC(container).
   ============================================================ */
"use strict";

const KRIDIYA_PRESETS = {
  airline: [
    "Air Arabia", "Air Arabia Abu Dhabi", "Air India", "Air India Express", "Akasa Air",
    "British Airways", "Cathay Pacific", "Emirates", "Etihad Airways", "Ethiopian Airlines",
    "FlyDubai", "Gulf Air", "IndiGo", "Kuwait Airways", "Lufthansa", "Malaysia Airlines",
    "Oman Air", "Qatar Airways", "Saudia", "Singapore Airlines", "SriLankan Airlines",
    "Turkish Airlines", "Wizz Air Abu Dhabi"
  ],
  nationality: [
    "Indian", "Pakistani", "Filipino", "Sri Lankan", "Bangladeshi", "Nepali",
    "Egyptian", "Jordanian", "Syrian", "Lebanese", "Sudanese", "Kenyan",
    "Nigerian", "British", "American", "Canadian", "UAE national", "UAE resident"
  ],
  payment_method: [
    "Cash", "Bank transfer", "Card", "Stripe link", "Payment link", "Tabby", "Tamara", "PayPal", "Other"
  ],
  booking_status: [
    "Available", "On request", "Confirmed", "Ticketed", "Waitlisted", "Cancelled"
  ],
  cabin: [
    "Economy", "Premium Economy", "Business", "First"
  ],
  room_type: [
    "Standard Room", "Deluxe Room", "Superior Room", "Executive Room", "Family Room",
    "Studio", "Suite", "Double", "Triple", "Quad"
  ],
  meal_plan: [
    "Room only", "Breakfast included", "Half board", "Full board", "All inclusive"
  ],
  cruise_cabin: [
    "Interior", "Ocean view", "Balcony", "Suite"
  ]
};

function searchPreset(kind, q, limit) {
  const list = KRIDIYA_PRESETS[kind] || [];
  const term = String(q || "").trim().toLowerCase();
  if (!term) return list.slice(0, limit || 12);
  const starts = [], contains = [];
  list.forEach(function (item) {
    const value = item.toLowerCase();
    if (value.indexOf(term) === 0) starts.push(item);
    else if (value.indexOf(term) > 0) contains.push(item);
  });
  return starts.concat(contains).slice(0, limit || 12);
}

function presetEsc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
  });
}

function attachPresetAC(input) {
  if (input.dataset.presetInit) return;
  input.dataset.presetInit = "1";
  const kind = input.dataset.preset;
  let wrap = input.closest(".ac-wrap");
  if (!wrap) {
    wrap = document.createElement("span");
    wrap.className = "ac-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
  }
  const list = document.createElement("ul");
  list.className = "ac-list preset-ac-list";
  list.hidden = true;
  list.setAttribute("role", "listbox");
  wrap.appendChild(list);
  input.setAttribute("autocomplete", "off");

  let items = [], active = -1;
  function close() { list.hidden = true; active = -1; }
  function choose(value) {
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    close();
  }
  function render() {
    if (!items.length) { close(); return; }
    list.innerHTML = items.map(function (value, index) {
      return '<li class="ac-item' + (index === active ? " active" : "") + '" role="option" data-i="' + index + '">' +
        '<span class="ac-main"><span class="ac-city">' + presetEsc(value) + "</span></span></li>";
    }).join("");
    list.hidden = false;
  }

  input.addEventListener("focus", function () {
    items = searchPreset(kind, input.value, 14);
    active = -1;
    render();
  });
  input.addEventListener("input", function () {
    items = searchPreset(kind, input.value, 14);
    active = -1;
    render();
  });
  input.addEventListener("keydown", function (event) {
    if (list.hidden) return;
    if (event.key === "ArrowDown") { event.preventDefault(); active = (active + 1) % items.length; render(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); active = (active - 1 + items.length) % items.length; render(); }
    else if (event.key === "Enter" && active >= 0) { event.preventDefault(); choose(items[active]); }
    else if (event.key === "Escape") close();
  });
  list.addEventListener("pointerdown", function (event) {
    const item = event.target.closest(".ac-item");
    if (item) { event.preventDefault(); choose(items[+item.dataset.i]); }
  });
  input.addEventListener("blur", function () { setTimeout(close, 150); });
}

function initPresetAC(root) {
  (root || document).querySelectorAll("input[data-preset]").forEach(attachPresetAC);
}
