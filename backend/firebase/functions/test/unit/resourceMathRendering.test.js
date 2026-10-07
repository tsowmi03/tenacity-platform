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
    ["\\sum_{k=1}^{n} k", /«Σ₍k=1₎⁽n⁾ k» || «Σ₍k=1₎⁽n⁾» k/],
    ["Evaluate \\log_{2} 8.", /«log₍2₎ 8»/],
    ["Evaluate \\log_2 8.", /«log₍2₎ 8»/],
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

describe("accents", () => {
  for (const [input, expected] of [
    ["Write 0.\\dot{3} as a fraction.", "0.3̇"],
    ["Write 0.1\\dot{6} as a fraction.", "0.16̇"],
    ["Write 0.\\dot{1}\\dot{2} as a fraction.", "0.1̇2̇"],
    ["Write 0.\\overline{12} as a fraction.", "0.1̅2̅"],
    ["\\bar{x} = \\frac{\\sum x}{n}", "x̄"],
    ["P(\\bar{A}) = 1 - P(A)", "Ā"],
    ["Find \\hat{A}.", "Â"],
    ["\\vec{v} = 3\\vec{a}", "v⃗"],
    ["Find the length of arc \\overset{\\frown}{AB}.", "A͡B"],
    ["\\cancel{x}", "x̶"],
  ]) {
    it(`keeps the accent in ${input}`, async () => {
      const { shown, issues } = await body(input);
      assert.ok(shown.includes(expected), `${shown} should contain ${expected}`);
      assert.doesNotMatch(shown, /\\|overset|frown|cancel/);
      assert.deepEqual(issues, []);
    });
  }

  it("keeps the mark in the same equation as its letter", async () => {
    const { shown } = await body("\\bar{x} = 5");
    assert.equal(shown, "«x̄ = 5»");
  });

  it("keeps the mean bar in headings", async () => {
    assert.match((await heading("Finding \\bar{x} from a table")).shown, /x̄/);
  });

  it("keeps the label-free part of an underbrace", async () => {
    assert.equal((await body("\\underbrace{a + b}_{n}")).shown.replace(/[«»]/g, ""), "a + b");
  });
});

describe("set braces", () => {
  for (const [input, expected] of [
    ["\\xi = \\{1, 2, ..., 10\\}", "ξ = {1, 2, ..., 10}"],
    ["A = \\{2, 4, 6\\} and B = \\{1, 2, 3\\}", "A = {2, 4, 6} and B = {1, 2, 3}"],
    ["S = {1, 2, 3, 4, 5, 6}", "S = {1, 2, 3, 4, 5, 6}"],
    ["The sample space is {H, T}.", "The sample space is {H, T}."],
    ["The solution set is \\{x : x > 2\\}.", "The solution set is {x : x > 2}."],
    ["A \\cap B = \\{\\}", "A ∩ B = {}"],
    ["A \\cup B = \\lbrace 1, 2 \\rbrace", "A ∪ B = { 1, 2 }"],
  ]) {
    it(`keeps braces in ${input}`, async () => {
      const { shown, issues } = await body(input);
      assert.equal(shown.replace(/[«»]/g, ""), expected);
      assert.deepEqual(issues, []);
    });
  }

  it("still treats braces after ^ as grouping", async () => {
    assert.equal((await body("x^{2} + y_{1}")).shown, "«x⁽2⁾ + y₍1₎»");
  });

  it("keeps set braces in headings and diagram labels", async () => {
    const { svgTextContent } = require("../../src/resources/mathNotation");
    assert.equal((await heading("Sets like \\{1, 2, 3\\}")).shown, "Sets like {1, 2, 3}");
    assert.equal(svgTextContent("\\xi = \\{1, 2\\}", 14), "ξ = {1, 2}");
  });
});

describe("structures", () => {
  it("renders nCr from \\binom and from pre-scripts", async () => {
    for (const input of ["\\binom{5}{2}", "^{5}C_{2}", "{}^{5}C_{2}", "^{n}C_{r} = \\frac{n!}{r!(n-r)!}"]) {
      const { shown, issues } = await body(input);
      assert.doesNotMatch(shown, /\^|binom|\\/, input);
      assert.match(shown, /[⁵ⁿ]C/, input);
      assert.deepEqual(issues, [], input);
    }
  });

  it("writes nCr with a superscript character, and other pre-scripts in schema order", async () => {
    const xmlOf = async (text) => xmlFor(shared.runWithMathRendering(true, () => [new Paragraph({ children: shared.richTextRuns(text) })]));
    assert.match(await xmlOf("^{5}C_{2}"), /<m:t>⁵<\/m:t>.*<m:sSub>/);
    assert.match(await xmlOf("^{n}C_{r}"), /<m:t>ⁿ<\/m:t>/);
    assert.match(await xmlOf("^{q}C_{2}"), /<m:sPre><m:sub\/><m:sup>.*?q.*?<\/m:sup><m:e>.*?C.*?<\/m:e><\/m:sPre>/);
  });

  it("does not make a pre-script a power of the word before it", async () => {
    const { shown } = await body("Find \\binom{5}{2} and ^{n}C_{r}.");
    assert.match(shown, /» and «|» and ⁽/);
    assert.doesNotMatch(shown, /an d|and⁽/);
  });

  it("keeps the power on a negative number", async () => {
    const { shown } = await body("Evaluate (-2)^{3} and -2^{2}.");
    assert.doesNotMatch(shown, /\^/);
    assert.match(shown, /«−2⁽2⁾»/);
  });

  it("stacks simultaneous equations written with cases", async () => {
    const xml = await xmlFor(shared.runWithMathRendering(true, () => [
      new Paragraph({ children: shared.richTextRuns("Solve \\begin{cases} 2x + y = 7 \\\\ x - y = 2 \\end{cases}") }),
    ]));
    assert.match(xml, /<m:eqArr>/);
    assert.match(xml, /<m:begChr m:val="\{"\/>/);
    const shown = visible(xml);
    assert.doesNotMatch(shown, /begin|end|cases|\\/);
    assert.match(shown, /2x \+ y = 7/);
  });

  it("draws a column vector as a bracketed matrix", async () => {
    const xml = await xmlFor(shared.runWithMathRendering(true, () => [
      new Paragraph({ children: shared.richTextRuns("Translate by \\begin{pmatrix} 3 \\\\ -2 \\end{pmatrix}.") }),
    ]));
    assert.match(xml, /<m:m>/);
    assert.equal((xml.match(/<m:mr>/g) || []).length, 2);
    assert.doesNotMatch(visible(xml), /pmatrix|\\/);
  });

  it("lists cases rows on one line in a heading", async () => {
    const { shown } = await heading("Solve \\begin{cases} x + y = 3 \\\\ x - y = 1 \\end{cases}");
    assert.doesNotMatch(shown, /begin|\\/);
    assert.match(shown, /x \+ y = 3; x - y = 1|x \+ y = 3; x − y = 1/);
  });

  it("turns \\\\ outside an environment into a line break", async () => {
    const { shown } = await body("x = 2 \\\\ y = 3");
    assert.equal(shown, "«x = 2»⏎«y = 3»");
  });

  it("keeps the lines of stacked working", async () => {
    const { shown } = await body("2 \\times $12 = $24\n3 \\times $12 = $36");
    assert.match(shown, /\$24».*⏎/);
    assert.equal(shown.split("⏎").length, 2);
  });

  it("keeps fill-in blanks", async () => {
    for (const [input, expected] of [
      ["x^{2} + 6x + \\_\\_\\_ = (x + 3)^{2}", "___"],
      ["x^{2} + 6x + ___ = (x + ___)^{2}", "(x + ___)⁽2⁾"],
    ]) {
      const { shown, issues } = await body(input);
      assert.ok(shown.includes(expected), `${shown} should contain ${expected}`);
      assert.doesNotMatch(shown, /\\|\^/);
      assert.deepEqual(issues, []);
    }
  });
});

// One expression should be one equation: no body-font text between its parts.
describe("whole expressions", () => {
  for (const [input, expected] of [
    // Ratios
    ["If x:y = 2:5 and x = 8, find y.", "If «x:y = 2:5» and «x = 8», find y."],
    ["Show that 1:2 = 3:6.", "Show that «1:2 = 3:6»."],
    ["Divide $90 in the ratio a:b:c = 2:3:4.", "Divide $90 in the ratio «a:b:c = 2:3:4»."],
    ["AB:DE = 2:3", "«AB:DE = 2:3»"],
    // Greek letters, implicit products and function notation
    ["A = \\pi r^{2}", "«A = πr⁽2⁾» || «A = π r⁽2⁾»"],
    ["C = 2\\pi r", "«C = 2π r» || «C = 2πr»"],
    ["V = \\frac{4}{3}\\pi r^{3}", "«V = [4/3]π r⁽3⁾» || «V = [4/3]πr⁽3⁾»"],
    ["A = \\frac{1}{2}bh", "«A = [1/2]bh»"],
    ["0 \\leq P(E) \\leq 1", "«0 ≤ P(E) ≤ 1»"],
    ["P(A \\cup B) = P(A) + P(B) - P(A \\cap B)", "«P(A ∪ B) = P(A) + P(B) − P(A ∩ B)»"],
    ["P(A') = 1 - P(A)", "«P(A') = 1 − P(A)»"],
    ["P(x) = 2x^{3} - 3x^{2} + x - 5", "«P(x) = 2x⁽3⁾ − 3x⁽2⁾ + x − 5»"],
    ["If f(x) = 2x + 1, find f(3).", "If «f(x) = 2x + 1», find f(3)."],
    ["y - y_{1} = m(x - x_{1})", "«y − y₍1₎ = m(x − x₍1₎)»"],
    ["A = P(1 + r)^{n}", "«A = P(1 + r)⁽n⁾»"],
    ["\\Delta = b^{2} - 4ac", "«Δ = b⁽2⁾ − 4ac»"],
    // Signs after operators
    ["x^{2} = 49 \\Rightarrow x = \\pm 7", "«x⁽2⁾ = 49 ⇒ x = ± 7»"],
    ["The axis of symmetry is x = -\\frac{b}{2a}.", "The axis of symmetry is «x = −[b/2a]»."],
    ["Sketch y = -(x + 1)^{2} + 3.", "Sketch «y = −(x + 1)⁽2⁾ + 3»."],
    // Functions, angles, degrees
    ["x = 12 tan 35°", "«x = 12 tan 35°»"],
    ["a^{2} = b^{2} + c^{2} - 2bc cos A", "«a⁽2⁾ = b⁽2⁾ + c⁽2⁾ − 2bc cos A»"],
    ["\\angle A + \\angle B + \\angle C = 180°", "«∠A + ∠B + ∠C = 180°» || «∠ A + ∠ B + ∠ C = 180°»"],
    ["Solve x + 35° = 180°.", "Solve «x + 35° = 180°»."],
    ["\\angle AOB = 2\\angle ACB", "«∠ AOB = 2∠ ACB» || «∠AOB = 2∠ACB»"],
    ["log_{b} (x^{n}) = n log_{b} x", "«log₍b₎ (x⁽n⁾) = n log₍b₎ x»"],
    ["\\therefore x = 4", "«∴ x = 4» || «∴x = 4»"],
    // Absolute values and sets
    ["Solve |x - 3| = 5.", "Solve «|x − 3| = 5»."],
    ["A \\cup B = \\{1, 2, 3\\}", "«A ∪ B = {1, 2, 3}»"],
    // Spaced thousands stay one number
    ["Evaluate 12 000 + 3 500.", "Evaluate «12 000 + 3 500»."],
  ]) {
    it(`keeps ${input} together`, async () => {
      const { shown } = await body(input);
      assert.ok(expected.split(" || ").includes(shown), `got ${shown}`);
    });
  }

  for (const prose of [
    "x = 2 or x = -3",
    "Let a = 3 and b = 4.",
    "Diagnostic Test - for tutor use",
    "The bus leaves at 3:45 pm.",
    "Note: x = 2",
  ]) {
    it(`does not pull words into maths in "${prose}"`, async () => {
      const { shown } = await body(prose);
      const inMaths = (shown.match(/«[^»]*»/g) || []).join(" ");
      assert.doesNotMatch(inMaths, /\b(or|and|for|tutor|use|pm|bus|Note)\b/, shown);
    });
  }

  it("leaves 'is' out of a money amount", async () => {
    assert.doesNotMatch((await body("The balance is -$20.")).shown, /«is/);
  });
});

// Units are upright text next to the number, never maths and never fractions.
describe("units", () => {
  for (const [input, expected] of [
    ["A car travels at 60 km/h for 2.5 h.", "A car travels at 60 km/h for 2.5 h."],
    ["Apples cost $4.50/kg.", "Apples cost $4.50/kg."],
    ["The tap flows at 12 L/min.", "The tap flows at 12 L/min."],
    ["Acceleration is 9.8 m/s^{2}.", "Acceleration is 9.8 m/s²."],
    ["The fuel use is 7.5 L/100 km.", "The fuel use is 7.5 L/100 km."],
    ["The area is 25 cm^{2}.", "The area is 25 cm²."],
    ["The area is 3 m^2.", "The area is 3 m²."],
    ["The volume is 2 m³.", "The volume is 2 m³."],
    ["Add 5 cm + 3.2 cm.", "Add 5 cm + 3.2 cm."],
    ["1 ha = 10 000 m^{2}", "1 ha = 10 000 m²"],
    ["It takes 2 h 15 min.", "It takes 2 h 15 min."],
  ]) {
    it(`keeps the units in "${input}" upright`, async () => {
      assert.equal((await body(input)).shown.replace(/[«»]/g, ""), expected);
      assert.doesNotMatch((await body(input)).shown, /«[^»]*(km|kg|cm|min|ha|L\/|m\/s)[^»]*»|\[.*\/(h|kg|min|100)\]/);
    });
  }

  it("still stacks real fractions and keeps the equation before a unit", async () => {
    assert.equal((await body("x = 5 cm")).shown, "«x = 5» cm");
    assert.match((await body("Speed = \\frac{distance}{time}")).shown, /\[distance\/time\]/);
    assert.match((await body("Evaluate 3/4 + 1/6.")).shown, /«\[3\/4\] \+ \[1\/6\]»/);
    assert.match((await body("s = \\frac{d}{t}")).shown, /«s = \[d\/t\]»/);
  });
});
