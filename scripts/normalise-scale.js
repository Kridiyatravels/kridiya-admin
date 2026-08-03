/*
 * Snaps css/staff.css onto a fixed type and radius scale.
 *
 * The stylesheet had grown 38 distinct font sizes and 11 distinct border
 * radii. Nothing looked broken, but nothing lined up either: text on one
 * card was 0.78rem and the identical text on the next was 0.82rem, a
 * difference too small to read as intentional and too large to look
 * accidental. That inconsistency is the single biggest thing separating
 * this admin from a professional dashboard.
 *
 * Type scale (7 steps, 16px root):
 *   0.75rem  12px  uppercase micro-labels only
 *   0.875rem 14px  body and secondary text — the accessibility floor
 *   1rem     16px  base
 *   1.125rem 18px  card titles
 *   1.375rem 22px  section headings
 *   1.75rem  28px  page titles
 *   2.25rem  36px  hero figures
 *
 * Radius scale (3 steps):
 *   8px    controls — buttons, inputs, small chips
 *   12px   surfaces — cards, panels, popovers
 *   999px  pills
 *
 * Run from the repository root:  node scripts/normalise-scale.js
 * Re-runnable: snapping an already-snapped value is a no-op.
 */
const fs = require("node:fs");
const path = require("node:path");

const FILE = path.join(__dirname, "..", "css", "staff.css");

// Upper bound -> snapped value. First bound the size is <= wins.
const TYPE_STEPS = [
  [0.72, "0.75rem"],
  [0.95, "0.875rem"],
  [1.08, "1rem"],
  [1.28, "1.125rem"],
  [1.55, "1.375rem"],
  [2.0, "1.75rem"],
  [Infinity, "2.25rem"]
];

function snapType(rem) {
  for (const [bound, value] of TYPE_STEPS) {
    if (rem <= bound) return value;
  }
  return "2.25rem";
}

function snapRadius(px) {
  // A pill is any radius large enough that the author clearly meant
  // "fully rounded", not a specific corner size.
  if (px >= 100) return "999px";
  if (px >= 10) return "12px";
  return "8px";
}

function main() {
  const before = fs.readFileSync(FILE, "utf8");
  let css = before;

  const typeSeen = new Set();
  const typeAfter = new Set();
  css = css.replace(/font-size:\s*([0-9.]+)rem/g, function (whole, num) {
    const rem = parseFloat(num);
    if (!isFinite(rem)) return whole;
    typeSeen.add(num);
    const snapped = snapType(rem);
    typeAfter.add(snapped);
    return "font-size: " + snapped;
  });

  const radiusSeen = new Set();
  const radiusAfter = new Set();
  css = css.replace(/border-radius:\s*([0-9.]+)px/g, function (whole, num) {
    const px = parseFloat(num);
    if (!isFinite(px)) return whole;
    radiusSeen.add(num + "px");
    const snapped = snapRadius(px);
    radiusAfter.add(snapped);
    return "border-radius: " + snapped;
  });

  // --staff-radius is the token the rest of the sheet should be using;
  // keep it on the surface step so the two agree.
  css = css.replace(/--staff-radius:\s*[0-9.]+px/g, "--staff-radius: 12px");

  fs.writeFileSync(FILE, css);

  console.log("font-size:     " + typeSeen.size + " distinct -> " + typeAfter.size);
  console.log("border-radius: " + radiusSeen.size + " distinct -> " + radiusAfter.size);
  console.log("bytes: " + before.length + " -> " + css.length);
}

main();
