/*
 * Merges a selector's repeated top-level rule blocks into one.
 *
 * css/staff.css defines 82 single-class selectors more than once, 121
 * redundant blocks in total. .chip-add is declared four times, and only the
 * last one decides the height — which is why setting it on the first block
 * changed nothing and the fix appeared to fail.
 *
 * The merge keeps the CASCADE RESULT identical:
 *   - declarations are collected in source order, later wins per property,
 *     exactly as the browser resolves them today
 *   - the single merged block is written at the position of the LAST original
 *     block, so its precedence against every other selector is unchanged
 *
 * Blocks inside @media are left alone: a selector repeated at a breakpoint is
 * doing real work, not duplicating.
 *
 * KNOWN TO BE UNSAFE ON THE HEADER — do not use without verifying.
 *
 * First real run merged .staff-jump-btn, .staff-topbar-inner, .staff-profile-btn
 * and .staff-tools-btn (14 blocks into 4). The baseline harness caught 64
 * differences: the header collapsed from 133px to 113px because
 * .staff-topbar-inner lost its 9.6px vertical padding.
 *
 * Cause: moving a block to the last position only preserves the result when no
 * OTHER selector of equal specificity sits between the originals. The topbar is
 * also matched by .container, which is 0-1-0 — the same weight — so between two
 * equal-specificity rules only source order decides, and moving one past the
 * other flips the winner. The header uses .container, which is why it broke
 * there and not on .chip-add.
 *
 * A correct merge has to check for interleaved equal-specificity rules on the
 * same elements and refuse, or merge in place rather than relocating. That is
 * not implemented here yet.
 *
 * Always verify with scripts/ui-baseline.js. Merging is mechanical; proving it
 * changed nothing is the part that matters.
 *
 *   node scripts/merge-duplicate-rules.js .staff-jump-btn .staff-topbar-inner
 */
const fs = require("node:fs");
const path = require("node:path");

const FILE = path.join(__dirname, "..", "css", "staff.css");

// Spans of the file that sit inside an @media block, so they can be skipped.
function mediaSpans(css) {
  const spans = [];
  const re = /@media[^{]*\{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") { depth--; if (depth === 0) break; }
    }
    spans.push([m.index, i]);
    re.lastIndex = i;
  }
  return spans;
}

function inSpans(pos, spans) {
  return spans.some(function (s) { return pos >= s[0] && pos <= s[1]; });
}

function mergeSelector(css, selector) {
  const spans = mediaSpans(css);
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("(^|\\n)([ \\t]*)" + escaped + "[ \\t]*\\{([^{}]*)\\}", "g");

  const hits = [];
  let m;
  while ((m = re.exec(css))) {
    const start = m.index + m[1].length;
    if (inSpans(start, spans)) continue;
    hits.push({ start: start, end: m.index + m[0].length, decls: m[3] });
  }

  if (hits.length < 2) return { css: css, blocks: hits.length, merged: false };

  // Later declarations win, which is what the cascade already does.
  const order = [];
  const value = Object.create(null);
  hits.forEach(function (h) {
    h.decls.split(";").forEach(function (d) {
      const t = d.trim();
      if (!t) return;
      const colon = t.indexOf(":");
      if (colon < 0) return;
      const prop = t.slice(0, colon).trim();
      if (!(prop in value)) order.push(prop);
      value[prop] = t;
    });
  });

  const block = selector + " {\n" + order.map(function (p) { return "  " + value[p] + ";"; }).join("\n") + "\n}";

  let out = css;
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    out = out.slice(0, h.start) + (i === hits.length - 1 ? block : "") + out.slice(h.end);
  }

  return { css: out, blocks: hits.length, properties: order.length, merged: true };
}

function main() {
  const selectors = process.argv.slice(2);
  if (!selectors.length) {
    console.error("usage: node scripts/merge-duplicate-rules.js .selector [.selector ...]");
    process.exit(1);
  }

  let css = fs.readFileSync(FILE, "utf8");
  const before = css.length;

  selectors.forEach(function (sel) {
    const res = mergeSelector(css, sel);
    css = res.css;
    console.log("  " + sel + ": " + res.blocks + " block(s)" +
      (res.merged ? " -> 1 (" + res.properties + " properties)" : " — nothing to merge"));
  });

  css = css.replace(/\n{3,}/g, "\n\n");

  let open = 0, close = 0;
  for (const ch of css) { if (ch === "{") open++; else if (ch === "}") close++; }
  if (open !== close) {
    console.error("ABORT: brace mismatch " + open + "/" + close + " — file not written");
    process.exit(1);
  }

  fs.writeFileSync(FILE, css);
  console.log("braces OK (" + open + ") | " + before + " -> " + css.length + " bytes");
  console.log("Now verify with uiBaseline.compare() before committing.");
}

main();
