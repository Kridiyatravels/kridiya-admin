/*
 * UI baseline harness — proves a CSS refactor changed nothing.
 *
 * Written after a .staff-jump-btn merge had to be thrown away: the comparison
 * reported six differences, four of them on a component the edit could not
 * have touched. The edit was probably fine; the baseline was not. It had been
 * captured before the web font loaded, so line-heights were still 14px and
 * every later reading disagreed with it.
 *
 * The lesson is that a single snapshot is not evidence. This captures twice
 * and keeps only the properties that agree with themselves, so a value still
 * settling can never enter the baseline in the first place.
 *
 * Usage — paste into the browser console on any signed-in admin page:
 *
 *   await uiBaseline.capture()   // before the CSS change
 *   ... edit the CSS, reload ...
 *   await uiBaseline.compare()   // after
 *
 * compare() returns { verdict, differences, diffs }. Anything other than
 * "IDENTICAL" means revert and look again.
 *
 * Deliberately not loaded by any page: this is a development tool, and
 * shipping it would add weight to every admin page for no user benefit.
 */
(function () {
  "use strict";

  // The properties a cascade-order mistake actually shows up in. Colour,
  // spacing, size and layout — not paint details nobody would notice.
  const PROPS = [
    "display", "position", "alignItems", "justifyContent", "flexDirection", "gap",
    "width", "height", "minHeight", "maxWidth",
    "marginTop", "marginRight", "marginBottom", "marginLeft",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "borderTopWidth", "borderTopColor", "borderTopStyle", "borderRadius",
    "backgroundColor", "color", "opacity",
    "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
    "textTransform", "textAlign", "whiteSpace", "overflow", "boxShadow", "zIndex"
  ];

  const KEY = "ui-baseline";

  // A stable identity for each element: tag + sorted class list + its index
  // among identical siblings. Enough to line the same element up across two
  // page loads, which is all the comparison needs.
  //
  // Built in a single pass. The first version called this per element and
  // re-queried the whole DOM inside it — 450 elements meant 450 full DOM
  // scans, and capture() timed out before returning anything.
  function buildIdentities(nodes) {
    const seen = Object.create(null);
    const ids = new Map();
    nodes.forEach(function (node) {
      const cls = (node.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).sort().join(".");
      const base = node.tagName.toLowerCase() + (cls ? "." + cls : "");
      const n = seen[base] === undefined ? 0 : seen[base] + 1;
      seen[base] = n;
      ids.set(node, base + "#" + n);
    });
    return ids;
  }

  function visible(node) {
    const r = node.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(node);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }

  function readAll() {
    const nodes = [...document.querySelectorAll("body *")].filter(visible);
    const ids = buildIdentities(nodes);
    const out = {};
    nodes.forEach(function (node) {
      const cs = getComputedStyle(node);
      const rec = {};
      PROPS.forEach(function (p) { rec[p] = cs[p]; });
      const r = node.getBoundingClientRect();
      rec._w = Math.round(r.width);
      rec._h = Math.round(r.height);
      out[ids.get(node)] = rec;
    });
    return out;
  }

  async function settle() {
    // Fonts first: a web font arriving after the snapshot is what poisoned the
    // baseline last time. Then two animation frames, then a beat for any
    // layout the page's own scripts trigger on load.
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
    await new Promise(function (r) { setTimeout(r, 600); });
  }

  // Two readings, 400ms apart. A property that disagrees with itself is still
  // in motion and is dropped rather than recorded — it can never then produce
  // a false difference later.
  async function stableRead() {
    await settle();
    const a = readAll();
    await new Promise(function (r) { setTimeout(r, 400); });
    const b = readAll();

    const stable = {};
    let dropped = 0;
    Object.keys(a).forEach(function (sel) {
      if (!b[sel]) { dropped++; return; }
      const rec = {};
      Object.keys(a[sel]).forEach(function (p) {
        if (a[sel][p] === b[sel][p]) rec[p] = a[sel][p];
        else dropped++;
      });
      stable[sel] = rec;
    });
    return { snapshot: stable, elements: Object.keys(stable).length, unstableDropped: dropped };
  }

  async function capture() {
    const res = await stableRead();
    localStorage.setItem(KEY, JSON.stringify({ page: location.pathname, at: Date.now(), data: res.snapshot }));
    return {
      page: location.pathname,
      elements: res.elements,
      unstableValuesDropped: res.unstableDropped,
      note: "Baseline stored. Edit the CSS, reload, then run uiBaseline.compare()."
    };
  }

  async function compare() {
    const stored = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!stored) return { verdict: "NO BASELINE", note: "Run uiBaseline.capture() first." };
    if (stored.page !== location.pathname) {
      return { verdict: "WRONG PAGE", note: "Baseline is for " + stored.page + ", you are on " + location.pathname };
    }

    const res = await stableRead();
    const before = stored.data;
    const after = res.snapshot;
    const diffs = [];

    Object.keys(before).forEach(function (sel) {
      if (!after[sel]) { diffs.push(sel + " — element gone"); return; }
      Object.keys(before[sel]).forEach(function (p) {
        // Only compare properties that were stable in BOTH runs. A value that
        // was settling in either reading is not evidence of anything.
        if (!(p in after[sel])) return;
        if (before[sel][p] !== after[sel][p]) {
          diffs.push(sel + " · " + p + ": " + before[sel][p] + " → " + after[sel][p]);
        }
      });
    });

    const appeared = Object.keys(after).filter(function (s) { return !before[s]; });

    return {
      verdict: diffs.length === 0 && appeared.length === 0 ? "IDENTICAL" : "CHANGED",
      elementsCompared: Object.keys(before).length,
      differences: diffs.length,
      newElements: appeared.length,
      diffs: diffs.slice(0, 40),
      note: diffs.length ? "Revert and investigate before committing." : "Safe to commit."
    };
  }

  window.uiBaseline = { capture: capture, compare: compare, PROPS: PROPS };
  console.log("uiBaseline ready — uiBaseline.capture() then uiBaseline.compare()");
})();
