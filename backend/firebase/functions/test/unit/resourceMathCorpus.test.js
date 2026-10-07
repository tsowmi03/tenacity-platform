"use strict";

// RES-31 regression sweep: every line of maths in the corpus (all NSW Stage
// 3–5 topics) must render without leaked LaTeX, raw scripts, lost dollar
// signs or a MATH_FALLBACK warning, in body text, headings and diagram labels.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const JSZip = require("jszip");
const { Document, Packer, Paragraph } = require("docx");

const shared = require("../../src/resources/builder/shared");
const { collectMathIssues, svgTextContent } = require("../../src/resources/mathNotation");
const corpus = require("../fixtures/mathRenderingCorpus");

// Text a reader sees, with the content of scripts and fractions kept but the
// markup dropped.
async function shownText(children) {
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children }] }));
  const xml = await (await JSZip.loadAsync(buffer)).file("word/document.xml").async("string");
  return xml
    .slice(xml.indexOf("<w:body>"), xml.indexOf("<w:sectPr"))
    .replace(/<[^>]+>/g, "")
    .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function problems(source, shown) {
  const found = [];
  if (/\\/.test(shown)) found.push("backslash");
  // A caret, or an underscore stuck to a letter, that is not a blank (___).
  if (/\^/.test(shown) || /[A-Za-z0-9)}](?<!_)_(?!_)/.test(shown.replace(/_{2,}/g, ""))) found.push("raw script");
  const dollars = (text) => (text.match(/\$/g) || []).length;
  if (dollars(source) !== dollars(shown)) found.push(`$ ${dollars(source)}→${dollars(shown)}`);
  for (const [, name] of source.matchAll(/\\([A-Za-z]+)/g)) {
    if (["frac", "sqrt", "text", "quad", "left", "right", "deg", "sin", "cos", "tan", "log", "ln"].includes(name)) continue;
    if (new RegExp(`(^|[^A-Za-z])${name}([^A-Za-z]|$)`).test(shown)) found.push(`\\${name} shown as a word`);
  }
  return found;
}

describe("maths corpus renders cleanly", () => {
  for (const [topic, source] of corpus) {
    it(`[${topic}] ${source}`, async () => {
      const bodyRun = await collectMathIssues(() =>
        shared.runWithMathRendering(true, () => [new Paragraph({ children: shared.richTextRuns(source) })])
      );
      const headingRun = await collectMathIssues(() =>
        shared.runWithMathRendering(true, () => [new Paragraph({ children: shared.textRuns(source) })])
      );
      const label = svgTextContent(source, 14).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

      const bodyText = await shownText(bodyRun.value);
      const headingText = await shownText(headingRun.value);
      assert.deepEqual(problems(source, bodyText), [], `body: ${bodyText}`);
      assert.deepEqual(problems(source, headingText), [], `heading: ${headingText}`);
      assert.deepEqual(problems(source, label), [], `label: ${label}`);
      assert.deepEqual(bodyRun.issues, [], "body raised a MATH_FALLBACK warning");
      assert.deepEqual(headingRun.issues, [], "heading raised a MATH_FALLBACK warning");
    });
  }
});
