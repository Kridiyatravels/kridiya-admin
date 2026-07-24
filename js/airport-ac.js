/* ============================================================
   Airport autocomplete for Kridiya staff tools.
   Ported from the main site (search.js) but self-contained:
   no dependency on main.js. Needs airports.js (global AIRPORTS).
   Usage: give an <input> the attribute data-airport, then call
   initAirportAC(container) after the input is in the DOM.
   ============================================================ */
"use strict";

function searchAirports(q, limit) {
  q = String(q || "").trim().toLowerCase();
  if (q.length < 2) return [];
  const starts = [], cityHits = [], other = [];
  for (let i = 0; i < AIRPORTS.length; i++) {
    const a = AIRPORTS[i]; // [IATA, city, country, name]
    const iata = a[0].toLowerCase(), city = a[1].toLowerCase(),
          country = a[2].toLowerCase(), name = a[3].toLowerCase();
    if (iata === q || iata.indexOf(q) === 0) starts.push(a);
    else if (city.indexOf(q) === 0) cityHits.push(a);
    else if (city.indexOf(q) > 0 || name.indexOf(q) >= 0 || country.indexOf(q) === 0) other.push(a);
    if (starts.length >= limit && cityHits.length >= limit) break;
  }
  return starts.concat(cityHits, other).slice(0, limit || 8);
}

function attachAirportAC(input) {
  if (input.dataset.acInit) return;
  input.dataset.acInit = "1";
  let wrap = input.closest(".ac-wrap");
  if (!wrap) {
    wrap = document.createElement("span");
    wrap.className = "ac-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
  }
  const list = document.createElement("ul");
  list.className = "ac-list";
  list.hidden = true;
  list.setAttribute("role", "listbox");
  wrap.appendChild(list);
  input.setAttribute("autocomplete", "off");
  let items = [], active = -1;

  function close() { list.hidden = true; active = -1; }
  function choose(a) {
    input.value = a[1] + " (" + a[0] + ")";
    input.dataset.iata = a[0];
    input.dataset.city = a[1];
    close();
  }
  function render() {
    if (!items.length) { close(); return; }
    list.innerHTML = items.map(function (a, i) {
      return '<li class="ac-item' + (i === active ? " active" : "") + '" role="option" data-i="' + i + '">' +
        '<span class="ac-code">' + a[0] + "</span>" +
        '<span class="ac-main"><span class="ac-city">' + a[1] + ", " + a[2] + "</span>" +
        '<span class="ac-name">' + a[3] + "</span></span></li>";
    }).join("");
    list.hidden = false;
  }

  input.addEventListener("input", function () {
    delete input.dataset.iata;
    items = searchAirports(input.value, 8);
    active = -1;
    render();
  });
  input.addEventListener("keydown", function (e) {
    if (list.hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % items.length; render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + items.length) % items.length; render(); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(items[active]); }
    else if (e.key === "Escape") close();
  });
  list.addEventListener("pointerdown", function (e) {
    const li = e.target.closest(".ac-item");
    if (li) { e.preventDefault(); choose(items[+li.dataset.i]); }
  });
  input.addEventListener("blur", function () { setTimeout(close, 150); });
}

/* Resolve a typed value to {iata, city} even without a dropdown pick */
function resolveAirport(input) {
  if (input.dataset.iata) return { iata: input.dataset.iata, city: input.dataset.city };
  const m = input.value.match(/\(([A-Za-z]{3})\)\s*$/);
  const q = m ? m[1] : input.value;
  const hit = searchAirports(q, 1)[0];
  return hit ? { iata: hit[0], city: hit[1] } : null;
}

function initAirportAC(root) {
  (root || document).querySelectorAll("input[data-airport]").forEach(attachAirportAC);
}
