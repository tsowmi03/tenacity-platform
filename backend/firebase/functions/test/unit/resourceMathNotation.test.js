"use strict";

// RES-19: superscripts and subscripts rendered as raw text, or as different
// maths, in resource Word docs and graph labels. These tests pin every case
// found in the audit, plus the index-laws worksheet from the ticket, and the
// fallback warning for maths that still can't be typeset.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { Document, Packer, TextRun, Paragraph } = require("docx");

const { buildResourceDocx } = require("../../src/resources/builder");
const { findRawMathInDocx, zipEntries } = require("../../src/resources/builder/docxText");
const { makeSectionHeading } = require("../../src/resources/builder/shared");
const { renderDiagramSvgForTest } = require("../../src/resources/diagramGenerator");
const { buildDocxWithDiagramReliability } = require("../../src/resources");
const {
  MATH_FALLBACK,
  hasRawMath,
  inlineScriptSegments,
  parseMath,
  readableFallback,
  scriptSegments,
} = require("../../src/resources/mathNotation");

function documentXml(buffer) {
  return zipEntries(buffer).find((entry) => entry.name === "word/document.xml").read();
}

// Word XML reduced to a readable tree: sSup(e(x)sup(2)) for x², «text» for
// plain runs, bare text for equation runs.
function compact(xml) {
  return xml
    .slice(xml.indexOf("<w:body>"), xml.indexOf("<w:sectPr"))
    .replace(/<w:instrText[^>]*>[^<]*<\/w:instrText>/g, "")
    .replace(/<w:rPr>.*?<\/w:rPr>|<m:\w+Pr>.*?<\/m:\w+Pr>|<m:\w+Pr\/>|<m:ctrlPr>.*?<\/m:ctrlPr>|<w:pPr>.*?<\/w:pPr>/gs, "")
    .replace(/<m:t[^>]*>([^<]*)<\/m:t>/g, "$1")
    .replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, "«$1»")
    .replace(/<\/?(m:r|w:r|m:oMath|w:p|w:body)(\s[^>]*)?>/g, "")
    .replace(/<m:(\w+)>/g, "$1(")
    .replace(/<\/m:\w+>/g, ")");
}

// Plain-text runs only: anything left here was not typeset.
function plainText(xml) {
  return (xml.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, ""))
    .join(" ");
}

async function buildWorksheet(stems, answers = [], extra = {}) {
  const mathIssues = [];
  const buffer = await buildResourceDocx(
    "worksheet",
    {
      title: "Index Laws",
      subject: "maths",
      year: 8,
      topic: "Index laws",
      totalMarks: stems.length,
      questions: stems.map((stem, i) => ({
        number: i + 1,
        stem,
        marks: 1,
        workingLines: 1,
        parts: null,
        diagramRequired: false,
        ...(extra.questions?.[i] || {}),
      })),
      answers: (answers.length ? answers : ["See working"]).map((answer, i) => ({
        questionNumber: i + 1,
        partLabel: null,
        answer,
      })),
    },
    { studentName: "Test Student", subject: "maths", year: 8, answerMode: "included", mathIssues }
  );
  const xml = documentXml(buffer);
  return { buffer, xml, tree: compact(xml), mathIssues };
}

function segmentsFor(value) {
  return inlineScriptSegments(value).map((s) => (s.level.length ? `[${s.level.join(">")}:${s.text}]` : s.text)).join("");
}

describe("maths notation parser", () => {
  const cases = [
    ["m^3n^4", "m[sup:3]n[sup:4]"],
    ["x^2y^{-3}", "x[sup:2]y[sup:−3]"],
    ["x^2-4x+3", "x[sup:2]-4x+3"],
    ["2^x+1", "2[sup:x]+1"],
    ["x_1 + x_2", "x[sub:1] + x[sub:2]"],
    ["a_{n}", "a[sub:n]"],
    ["H_2O", "H[sub:2]O"],
    ["x^-1", "x[sup:−1]"],
    ["x^−1", "x[sup:−1]"],
    ["x^12", "x[sup:12]"],
    ["2^(x+1)", "2[sup:x+1]"],
    ["((x+1)^2)^3", "((x+1)[sup:2])[sup:3]"],
    ["(2(x+1))^2", "(2(x+1))[sup:2]"],
    ["x_1^2", "x[sub:1][sup:2]"],
    ["e^{2x}", "e[sup:2x]"],
    ["e^{x^2}", "e[sup:x][sup>sup:2]"],
  ];
  for (const [input, expected] of cases) {
    it(`binds scripts correctly in ${input}`, () => {
      const parsed = parseMath(input);
      assert.equal(parsed.ok, true, parsed.error);
      const flat = scriptSegments(parsed.nodes)
        .map((s) => (s.level.length ? `[${s.level.join(">")}:${s.text}]` : s.text))
        .join("");
      assert.equal(flat, expected);
    });
  }

  it("turns LaTeX degrees into the degree sign", () => {
    assert.equal(segmentsFor("Angle ABC = 90^\\circ"), "Angle ABC = 90°");
    assert.equal(segmentsFor("an angle of 40^{\\circ}"), "an angle of 40°");
  });

  it("rejects notation it cannot read instead of guessing", () => {
    for (const input of ["x^{2", "x^", "x^{}", "\\unknowncommand{x}", "}x"]) {
      assert.equal(parseMath(input).ok, false, input);
    }
  });

  it("gives a readable fallback that is not flagged again", () => {
    assert.equal(readableFallback("x^{n+1"), "x^(n+1");
    assert.equal(readableFallback("\\frac{a}{b} + y^{2}"), "(a)/(b) + y^(2)");
    assert.equal(hasRawMath(readableFallback("x^{n+1")), false);
  });

  it("does not treat blanks or identifiers as maths", () => {
    for (const text of ["Name: ________", "x = ____", "see file_name here", "Date: __/__/__"]) {
      assert.equal(hasRawMath(text), false, text);
      assert.equal(segmentsFor(text), text);
    }
  });
});

describe("Word output (RES-19 index-laws worksheet)", () => {
  // The expressions that broke in the worksheet attached to RES-19.
  const stems = [
    "Simplify \\frac{m^3n^4 \\times m^5n^2}{m^2n}.",
    "Simplify \\frac{18x^7y^5}{6x^3y^2}.",
    "Simplify \\frac{(2p^3q^2)^2}{4pq}.",
    "Simplify \\frac{x^2y^{-3}}{x^{-4}y^2}, writing the answer with positive indices.",
    "Simplify (a^2b^{-1})^3 \\times (a^{-1}b^4)^2.",
    "Simplify \\frac{(6x^3y^{-2})^2}{3x^{-1}y^{-5}}.",
    "Simplify \\frac{(2a^{-2}b^3)^3 \\times (4a^5b^{-1})}{8a^{-1}b^4}.",
  ];
  const answers = ["m^6n^5", "3x^4y^3", "p^5q^3", "x^6y^5", "a^4b^5", "12x^7y", "4b^4"];

  it("typesets every power on its own base and leaves no raw notation", async () => {
    const { xml, tree, mathIssues } = await buildWorksheet(stems, answers);

    assert.equal(hasRawMath(plainText(xml)), false);
    assert.doesNotMatch(tree, /\^|\\/);
    assert.deepEqual(mathIssues, []);

    // Q1 numerator: m³n⁴ × m⁵n², never m^(3n) followed by a literal ^4.
    assert.match(tree, /sSup\(e\(m\)sup\(3\)\)sSup\(e\(n\)sup\(4\)\) × sSup\(e\(m\)sup\(5\)\)sSup\(e\(n\)sup\(2\)\)/);
    // Q4: x²y⁻³, not x^(2y) then ^{−3}.
    assert.match(tree, /sSup\(e\(x\)sup\(2\)\)sSup\(e\(y\)sup\(−3\)\)/);
    // Answers: m⁶n⁵ and 3x⁴y³.
    assert.match(tree, /sSup\(e\(m\)sup\(6\)\)sSup\(e\(n\)sup\(5\)\)/);
    assert.match(tree, /3sSup\(e\(x\)sup\(4\)\)sSup\(e\(y\)sup\(3\)\)/);
  });
});

describe("Word output (audit cases)", () => {
  it("keeps unbraced powers to one token so the maths stays correct", async () => {
    const { tree } = await buildWorksheet(["Solve x^2-4x+3 = 0.", "Solve 2^x+1 = 9."]);
    assert.match(tree, /sSup\(e\(x\)sup\(2\)\)−4x\+3 = 0/);
    assert.match(tree, /sSup\(e\(2\)sup\(x\)\)\+1 = 9/);
  });

  it("renders subscripts", async () => {
    const { tree, xml } = await buildWorksheet([
      "Find x_1 + x_2.",
      "The sequence a_{n} = 3n.",
      "Balance H_2O and CO_2.",
      "Evaluate x_1^2.",
    ]);
    assert.match(tree, /sSub\(e\(x\)sub\(1\)\) \+ sSub\(e\(x\)sub\(2\)\)/);
    assert.match(tree, /sSub\(e\(a\)sub\(n\)\) = 3n/);
    assert.match(tree, /sSub\(e\(H\)sub\(2\)\)O/);
    assert.match(tree, /sSubSup\(e\(x\)sub\(1\)sup\(2\)\)/);
    assert.equal(hasRawMath(plainText(xml)), false);
  });

  it("renders degrees, Unicode minus and nested brackets", async () => {
    const { tree, xml } = await buildWorksheet([
      "Angle ABC = 90^\\circ.",
      "Evaluate x^−1.",
      "Simplify ((x+1)^2)^3.",
      "Simplify (2(x+1))^2.",
    ]);
    assert.match(plainText(xml), /90°/);
    assert.match(tree, /sSup\(e\(x\)sup\(−1\)\)/);
    assert.match(tree, /sSup\(e\(\(sSup\(e\(\(x\+1\)\)sup\(2\)\)\)\)sup\(3\)\)/);
    assert.match(tree, /sSup\(e\(\(2\(x\+1\)\)\)sup\(2\)\)/);
    assert.doesNotMatch(plainText(xml), /[\^\\]/);
  });

  it("still renders slash fractions as stacked fractions", async () => {
    const { tree } = await buildWorksheet(["Simplify (x+1)/(x-1) and 3x/4."]);
    assert.match(tree, /f\(num\(x\+1\)den\(x−1\)\)/);
    assert.match(tree, /f\(num\(3x\)den\(4\)\)/);
  });

  it("renders scripts in table diagram cells", async () => {
    const { tree, mathIssues } = await buildWorksheet(["Use the table."], [], {
      questions: [{
        diagram: {
          type: "two-way-table",
          colHeader: "Values of x^2",
          rowHeader: "Row",
          cols: ["x^2", "x_1"],
          rows: ["A"],
          data: [[1, 4]],
          totals: false,
        },
      }],
    });
    assert.match(tree, /sSup\(e\(x\)sup\(2\)\)/);
    assert.match(tree, /sSub\(e\(x\)sub\(1\)\)/);
    assert.deepEqual(mathIssues, []);
  });

  it("renders heading scripts as Word superscript formatting, keeping the heading style", async () => {
    const doc = new Document({ sections: [{ children: [makeSectionHeading("Index laws: a^m × a^n")] }] });
    const xml = documentXml(await Packer.toBuffer(doc));
    assert.match(xml, /<w:vertAlign w:val="superscript"\/>[\s\S]*?<w:t[^>]*>m<\/w:t>/);
    assert.match(xml, /<w:color w:val="FFFFFF"\/>[\s\S]*?<w:vertAlign w:val="superscript"\/>/);
    assert.doesNotMatch(plainText(xml), /\^/);
  });
});

describe("graph and diagram labels", () => {
  function plot(label) {
    return renderDiagramSvgForTest({
      type: "function-plot",
      minX: -3,
      maxX: 3,
      minY: -2,
      maxY: 10,
      showGrid: false,
      functions: [{ type: "exponential", a: 1, label }],
      points: [{ x: 0, y: 1, label: "P_1" }],
    });
  }

  it("raises e^{2x} as a real superscript", () => {
    const svg = plot("y = e^{2x}");
    assert.match(svg, /<tspan font-size="15">y = e<\/tspan><tspan dy="-6" font-size="10.5">2x<\/tspan><\/text>/);
    assert.doesNotMatch(svg, /\^|\{|\}/);
  });

  it("raises a bracketed exponent and lowers point subscripts", () => {
    const svg = plot("y = 2^{x-1}");
    assert.match(svg, /<tspan dy="-6" font-size="10.5">x−1<\/tspan>/);
    assert.match(svg, /P<\/tspan><tspan dy="[\d.]+" font-size="[\d.]+">1<\/tspan>/);
    assert.doesNotMatch(svg, /P_1|\^/);
  });

  it("leaves plain labels untouched", () => {
    const svg = plot("y = 2x + 1");
    assert.match(svg, />y = 2x \+ 1<\/text>/);
  });
});

describe("fallback warning", () => {
  it("shows unreadable maths as plain text and records where it was", async () => {
    const { xml, mathIssues } = await buildWorksheet(["Fine x^2.", "Broken x^{2 + 1 here."]);
    assert.match(plainText(xml), /Broken x\^\(/);
    assert.equal(hasRawMath(plainText(xml)), false);
    // The valid "2 + 1" is still typeset; only the broken token is reported.
    assert.deepEqual(mathIssues, [{ location: "Q2", source: "x^{", shownAs: "x^(" }]);
  });

  it("adds a MATH_FALLBACK job warning naming the question", async () => {
    const { warnings } = await buildDocxWithDiagramReliability({
      resourceType: "worksheet",
      parsed: {
        title: "Fallback",
        subject: "maths",
        year: 8,
        topic: "Index laws",
        totalMarks: 1,
        questions: [{ number: 3, stem: "Broken x^{2 + 1 here.", marks: 1, workingLines: 1, parts: null }],
        answers: [],
      },
      options: { studentName: "Test Student", subject: "maths", year: 8, answerMode: "none" },
      buildDocx: buildResourceDocx,
    });
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, MATH_FALLBACK);
    assert.match(warnings[0].message, /Check before printing: Q3 "x\^\("\./);
    assert.equal(warnings[0].items[0].location, "Q3");
  });

  it("adds no warning when all maths typesets", async () => {
    const { warnings } = await buildDocxWithDiagramReliability({
      resourceType: "worksheet",
      parsed: {
        title: "Clean",
        subject: "maths",
        year: 8,
        topic: "Index laws",
        totalMarks: 1,
        questions: [{ number: 1, stem: "Simplify m^3n^4 and x_1 + x_2.", marks: 1, workingLines: 1, parts: null }],
        answers: [],
      },
      options: { studentName: "Test Student", subject: "maths", year: 8, answerMode: "none" },
      buildDocx: buildResourceDocx,
    });
    assert.deepEqual(warnings, []);
  });

  it("post-build scan catches raw notation from a path that bypassed the helpers", async () => {
    const doc = new Document({
      sections: [{ children: [new Paragraph({ children: [new TextRun("Raw y^{2} here")] })] }],
    });
    const issues = findRawMathInDocx(await Packer.toBuffer(doc));
    assert.equal(issues.length, 1);
    assert.match(issues[0].source, /y\^\{2\}/);
  });

  it("does not scan English resources", async () => {
    const mathIssues = [];
    await buildResourceDocx(
      "worksheet",
      {
        title: "Poetry",
        subject: "english",
        year: 8,
        topic: "Poetry",
        totalMarks: 1,
        questions: [{ number: 1, stem: "Explain the line 'a^b' in context.", marks: 1, workingLines: 1, parts: null }],
        answers: [],
      },
      { studentName: "Test Student", subject: "english", year: 8, answerMode: "none", mathIssues }
    );
    assert.deepEqual(mathIssues, []);
  });
});
