"use strict";

// RES-40. Draws diagrams whose labels carry set symbols, Greek letters and
// combining marks (x̄, a recurring decimal's dot), so a person can check they
// print correctly on a given machine. macOS draws labels with Core Text; the
// Cloud Functions image uses fontconfig and the fonts in
// src/resources/assets/fonts, so the check that matters is run on that image
// (see docs/operations/resource-diagram-fonts.md).
//
//   node scripts/checkDiagramLabelFonts.js [outputDir] [--base64]
//
// --base64 also prints each PNG as one `PNG:<name>:<base64>` line, for a build
// log when there is no disk to read back.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { generateDiagram } = require("../src/resources/diagramGenerator");

const CASES = [
  { name: "number-line-accents", diagram: { type: "number-line", min: 0, max: 4, step: 1, marks: [
    { value: 1, label: "x̄", open: false },
    { value: 2, label: "0.3̇", open: false },
    { value: 3, label: "θ", open: true },
    { value: 4, label: "ξ", open: false },
  ] } },
  { name: "venn-set-symbols", diagram: { type: "venn-diagram", style: "2-set",
    sets: [{ label: "A ∪ B" }, { label: "A ∩ B" }], counts: { A: 7, B: 5, AB: 3, none: 2 } } },
  { name: "dot-plot-mean", diagram: { type: "dot-plot", title: "Mean x̄ = 1.2", data: [0, 0, 1, 1, 2, 3], xLabel: "Siblings (x̄ marked)", min: 0, max: 5 } },
  { name: "triangle-plain", diagram: { type: "right-triangle", dimensions: { base: 8, height: 6, hypotenuse: 10 }, unit: "cm" } },
];

async function main(argv) {
  const base64 = argv.includes("--base64");
  const outputDir = argv.find((arg) => !arg.startsWith("--")) || fs.mkdtempSync(path.join(os.tmpdir(), "tenacity-label-fonts-"));
  fs.mkdirSync(outputDir, { recursive: true });
  for (const { name, diagram } of CASES) {
    const result = await generateDiagram(diagram);
    if (!result?.buffer) throw new Error(`${name} did not render`);
    fs.writeFileSync(path.join(outputDir, `${name}.png`), result.buffer);
    if (base64) console.log(`PNG:${name}:${result.buffer.toString("base64")}`);
  }
  console.log(`Rendered ${CASES.length} label checks to ${outputDir} (FONTCONFIG_FILE=${process.env.FONTCONFIG_FILE || "unset"})`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => { console.error(err.message || err); process.exitCode = 1; });
}

module.exports = { CASES };
