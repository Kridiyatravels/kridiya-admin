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

  // Thirteen properties, not thirty-six.
  //
  // The full list cost roughly 33,000 computed-style reads per capture (456
  // elements x 36 properties x 2 readings) and capture() ran past 30 seconds
  // without returning, which made the harness useless on the biggest page.
  //
  // These thirteen are the ones a cascade-order mistake actually shows up in.
  // width and height are the catch-all: almost any spacing, border or font
  // change moves one of them, so a regression that dodges every other property
  // still gets caught. The dropped properties — letterSpacing, textAlign,
  // opacity, zIndex, the individual margin and padding sides — either follow
  // from these or are not things a block merge can silently alter.
  const PROPS = [
    "display", "position", "gap",
    "width", "height", "minHeight",
    "padding", "margin",
    "backgroundColor", "color",
    "fontSize", "fontWeight", "lineHeight"
  ];

  const KEY = "ui-baseline";

  // A stable identity for each element: its structural path from <body>, as
  // child indexes — "body>3>1>0>2".
  //
  // Identity used to be tag + class list + index among identical elements.
  // That looked reasonable and was not: the admin's JavaScript adds .is-active
  // to a nav link after load, which changes that element's class string, which
  // renumbers every element sharing the old string. A revert that genuinely
  // restored the CSS still reported 31 differences on .staff-nav-link for this
  // reason alone.
  //
  // Structural position cannot be changed by styling or by a class being
  // added, so a difference now means the CSS really did move something.
  function pathOf(node) {
    const parts = [];
    let n = node;
    while (n && n !== document.body) {
      const parent = n.parentNode;
      if (!parent) break;
      parts.push([].indexOf.call(parent.children, n));
      n = parent;
    }
    return "body>" + parts.reverse().join(">");
  }

  // Built in a single pass. The first version re-queried the whole DOM per
  // element — 456 elements meant 456 full scans and capture() timed out.
  function buildIdentities(nodes) {
    const ids = new Map();
    nodes.forEach(function (node) { ids.set(node, pathOf(node)); });
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
    // No getBoundingClientRect here. Calling it per element forced a layout
    // each time — 456 elements read twice meant 912 forced reflows and
    // capture() ran past 30 seconds. Computed width and height already carry
    // the resolved size, so the rect added nothing but cost.
    nodes.forEach(function (node) {
      const cs = getComputedStyle(node);
      const rec = {};
      PROPS.forEach(function (p) { rec[p] = cs[p]; });
      out[ids.get(node)] = rec;
    });
    return out;
  }

  async function settle() {
    // Fonts first: a web font arriving after the snapshot is what poisoned the
    // baseline originally. Then two animation frames, then a beat for any
    // layout the page's own scripts trigger on load.
    //
    // document.fonts.ready is raced against a timeout because on this admin it
    // does not always resolve — the page loads Google Fonts across three
    // families, and if one request never settles the promise waits forever.
    // That single await was the whole "capture is too slow" problem: measured
    // directly, the actual work is 36ms for 456 elements (24ms to filter, 3ms
    // for paths, 9ms to read styles). Nothing was slow; one promise hung.
    if (document.fonts && document.fonts.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise(function (r) { setTimeout(r, 3000); })
      ]);
    }
    // Two animation frames, but raced against a timer. requestAnimationFrame
    // does not fire at all while the tab or preview pane is hidden, so an
    // unguarded await here waits forever in the background — which is the
    // actual reason capture() appeared to be "too slow to finish". It was not
    // slow: the real work measures 36ms for 456 elements. It was suspended.
    await Promise.race([
      new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); }),
      new Promise(function (r) { setTimeout(r, 1000); })
    ]);
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
