"use strict";

// End-to-end rendering checks for maths text (RES-31). Each case renders a
// string the way a resource field is rendered and reads back what a reader
// sees in word/document.xml. Equations are shown as «...», fractions as
// [num/den], superscripts as ⁽...⁾, subscripts as ₍...₎ and roots as √(...),
// so a test can tell typeset maths from plain text.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const JSZip = require("jszip");
const { Document, Packer, Paragraph } = require("docx");

const shared = require("../../src/resources/builder/shared");
const { collectMathIssues } = require("../../src/resources/mathNotation");

function visible(xml) {
  return xml
    .replace(/<m:num>/g, "[").replace(/<\/m:num>/g, "/").replace(/<\/m:den>/g, "]")
    .replace(/<m:sup>/g, "⁽").replace(/<\/m:sup>/g, "⁾")
    .replace(/<m:sub>/g, "₍").replace(/<\/m:sub>/g, "₎")
    .replace(/<m:rad>/g, "√(").replace(/<\/m:rad>/g, ")")
    .replace(/<m:oMath>/g, "«").replace(/<\/m:oMath>/g, "»")
    .replace(/<w:br\/>/g, "⏎")
    .replace(/<w:vertAlign w:val="superscript"\/>/g, "‹sup›")
    .replace(/<w:vertAlign w:val="subscript"\/>/g, "‹sub›")
    .replace(/<m:chr m:val="([^"]*)"\/>/g, "‹acc $1›")
    .replace(/<[^>]+>/g, "")
    .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

async function xmlFor(children) {
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children }] }));
  const xml = await (await JSZip.loadAsync(buffer)).file("word/document.xml").async("string");
  return xml.slice(xml.indexOf("<w:body>"), xml.indexOf("<w:sectPr"));
}

// Body text: what question stems, explanations, options and answers use.
async function body(text) {
  const { value, issues } = await collectMathIssues(() =>
    shared.runWithMathRendering(true, () => [new Paragraph({ children: shared.richTextRuns(text) })])
  );
  return { shown: visible(await xmlFor(value)), issues };
}

// Single-line headings (section titles, page header).
async function heading(text) {
  const { value, issues } = await collectMathIssues(() =>
    shared.runWithMathRendering(true, () => [new Paragraph({ children: shared.textRuns(text) })])
  );
  return { shown: visible(await xmlFor(value)), issues };
}

describe("money", () => {
  for (const [input, expected] of [
    ["Tom has $15 and Sam has $20. How much altogether?", "Tom has $15 and Sam has $20. How much altogether?"],
    ["Share $60 between Mia and Tom.", "Share $60 between Mia and Tom."],
    ["Price: $4.50 each, $12 for three", "Price: $4.50 each, $12 for three"],
    ["Mia saves \\frac{1}{4} of her $80 pocket money", "Mia saves «[1/4]» of her $80 pocket money"],
    ["Write \\$45 in cents.", "Write $45 in cents."],
  ]) {
    it(`keeps the dollar signs in "${input}"`, async () => {
      assert.equal((await body(input)).shown, expected);
    });
  }

  it("keeps every dollar sign in a money calculation", async () => {
    const { shown } = await body("Profit = $120 - $85 = $35");
    assert.equal(shown.match(/\$/g).length, 3);
  });

  it("keeps the dollar signs in a heading", async () => {
    assert.equal((await heading("Budgeting with $5 and $10 notes")).shown, "Budgeting with $5 and $10 notes");
  });

  it("still strips $...$ wrapped around maths", async () => {
    const { shown } = await body("A shirt costs $25. Solve $x + 3 = 7$.");
    assert.match(shown, /^A shirt costs \$25\. Solve\s+«x \+ 3 = 7»\s*\.$/);
  });

  it("still strips $$...$$ display maths", async () => {
    const { shown } = await body("$$\\frac{1}{2}$$");
    assert.match(shown, /«\[1\/2\]»/);
    assert.doesNotMatch(shown, /\$/);
  });
});

describe("LaTeX commands", () => {
  for (const [input, expected] of [
    ["\\sum_{k=1}^{n} k", /«Σ₍k=1₎⁽n⁾ k»|«Σ₍k=1₎⁽n⁾» k/],
    ["Evaluate \\log_{2} 8.", /«log₍2₎»/],
    ["Evaluate \\log_2 8.", /«log₍2₎»/],
    ["\\lim_{x \\to 0} f(x)", /lim₍x → 0₎/],
    ["\\int_{0}^{1} x \\, dx", /∫₍0₎⁽1⁾/],
    ["\\bigcup_{i} A_{i}", /⋃₍i₎/],
  ]) {
    it(`typesets ${input} without a stray backslash`, async () => {
      const { shown, issues } = await body(input);
      assert.match(shown, expected);
      assert.doesNotMatch(shown, /\\/);
      assert.deepEqual(issues, []);
    });
  }

  for (const [command, symbol] of [
    ["colon", ":"], ["leqslant", "⩽"], ["geqslant", "⩾"], ["mapsto", "↦"],
    ["complement", "∁"], ["subsetneq", "⊊"], ["nleq", "≰"], ["ell", "ℓ"],
    ["Vert", "‖"], ["measuredangle", "∡"], ["checkmark", "✓"], ["deg", "deg"],
  ]) {
    it(`renders \\${command} as ${symbol}`, async () => {
      const { shown, issues } = await body(`a \\${command} b`);
      assert.equal(shown.replace(/[«»]/g, ""), `a ${symbol} b`);
      assert.deepEqual(issues, []);
    });
  }

  it("renders \\frac12 as a fraction", async () => {
    assert.match((await body("\\frac12 + \\tfrac34")).shown, /\[1\/2\].*\[3\/4\]/);
  });

  it("puts sums and logs in headings without a backslash", async () => {
    const { shown } = await heading("Sigma notation: \\sum_{k=1}^{n} k and \\log_{2} x");
    assert.doesNotMatch(shown, /\\/);
    assert.match(shown, /Σ‹sub›k=1/);
    assert.match(shown, /log‹sub›2/);
  });
});
