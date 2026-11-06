"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const JSZip = require("jszip");
const sharp = require("sharp");

const { buildResourceDocx } = require("../../src/resources/builder");

async function png(width, height) {
  return sharp({ create: { width, height, channels: 3, background: "#fff" } }).png().toBuffer();
}

async function crop(width, height) {
  return { type: "source-image", image: await png(width, height), width, height };
}

function paper(questions, sections) {
  return {
    title: "Area and volume",
    subject: "Maths",
    year: 7,
    totalMarks: 20,
    timeAllowed: "30 minutes",
    sections: sections || [{ title: "A, Core skills", questions }],
    answers: [{ questionNumber: 1, answer: "1" }],
  };
}

async function documentXml(resource) {
  const buffer = await buildResourceDocx("practice-paper", resource, { answerMode: "none" });
  const zip = await JSZip.loadAsync(buffer);
  return zip.file("word/document.xml").async("string");
}

const body = (xml) => xml.slice(xml.indexOf("<w:body>"));
const paragraphs = (xml) => xml.match(/<w:p>[\s\S]*?<\/w:p>/g) || [];
const isRule = (p) => /<w:pBdr><w:bottom w:val="dotted"/.test(p);
const keepsNext = (p) => /<w:keepNext\/>/.test(p);
const cells = (table) => table.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
const tables = (xml) => body(xml).match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];

describe("question layout with diagrams (RES-81)", () => {
  it("puts the diagram beside the question with answer lines starting under the text", async () => {
    const xml = await documentXml(paper([
      { number: 1, stem: "Find the area of this rectangle.", marks: 4, diagram: await crop(600, 400) },
    ]));
    const [table] = tables(xml);
    assert.ok(table, "question is laid out in a two-column table");
    const [left, right] = cells(table);
    assert.match(left, /Find the area of this rectangle/);
    assert.ok(paragraphs(left).filter(isRule).length >= 1, "answer lines start in the text column");
    assert.match(right, /<wp:inline/);
    assert.match(right, /<w:jc w:val="right"\/>/);

    // The marks tab stops at the end of the text column, not the page margin.
    const tab = Number(/<w:tab w:val="right" w:pos="(\d+)"/.exec(left)[1]);
    assert.ok(tab < 9026 - 2000, `marks tab ${tab} sits inside the text column`);

    // Lines that do not fit beside the diagram continue at full width.
    const after = body(xml).slice(body(xml).indexOf("</w:tbl>"));
    const leftRules = paragraphs(left).filter(isRule).length;
    const afterRules = paragraphs(after).filter(isRule).length;
    assert.equal(leftRules + afterRules, 12);
  });

  it("fits a crop to the 7 cm column and raises a small crop to 4.5 cm", async () => {
    const big = await documentXml(paper([{ number: 1, stem: "Big.", marks: 1, diagram: await crop(1400, 900) }]));
    const small = await documentXml(paper([{ number: 1, stem: "Small.", marks: 1, diagram: await crop(120, 100) }]));
    const widthCm = (xml) => Number(/<wp:extent cx="(\d+)"/.exec(xml)[1]) / 360000;
    assert.ok(Math.abs(widthCm(big) - 7) < 0.05, `big crop is ${widthCm(big)} cm`);
    assert.ok(Math.abs(widthCm(small) - 4.5) < 0.05, `small crop is ${widthCm(small)} cm`);
  });

  it("never lets the minimum width push a tall, narrow crop past the height limit", async () => {
    const xml = await documentXml(paper([{ number: 1, stem: "Tall.", marks: 1, diagram: await crop(100, 1000) }]));
    const [, cx, cy] = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(xml);
    assert.ok(Number(cy) / 360000 <= 5.01, `height is ${Number(cy) / 360000} cm`);
    assert.ok(Number(cx) / 360000 < 4.5);
  });

  it("centres a wide, flat diagram with the answer lines straight below", async () => {
    const xml = await documentXml(paper([
      { number: 1, stem: "Use the number line.", marks: 2, diagram: await crop(1000, 300) },
    ]));
    assert.equal(tables(xml).length, 0);
    const ps = paragraphs(body(xml));
    const image = ps.findIndex((p) => /<wp:inline/.test(p) && /<w:jc w:val="center"\/>/.test(p));
    assert.ok(image > 0, "diagram is a centred paragraph");
    assert.match(ps[image - 1], /Use the number line/);
    assert.ok(isRule(ps[image + 1]), "answer lines follow the diagram");
  });

  it("centres the diagram when the question text contains a table", async () => {
    const stem = "Use the table and the diagram.\n\n| Side | Length |\n| --- | --- |\n| a | 3 cm |";
    const xml = await documentXml(paper([{ number: 1, stem, marks: 2, diagram: await crop(600, 400) }]));
    const ps = paragraphs(body(xml));
    assert.ok(ps.some((p) => /<wp:inline/.test(p) && /<w:jc w:val="center"\/>/.test(p)));
  });

  it("continues parts beside the diagram but never ends the column on a part's text", async () => {
    const xml = await documentXml(paper([{
      number: 1,
      stem: "A garden is a rectangle.",
      marks: 4,
      diagram: await crop(500, 500),
      parts: [
        { label: "a", stem: "Find its perimeter.", marks: 1 },
        { label: "b", stem: "Find its area.", marks: 1 },
        { label: "c", stem: "Find the cost of turf at $12 per square metre.", marks: 2 },
      ],
    }]));
    const [left] = cells(tables(xml)[0]);
    const leftParagraphs = paragraphs(left);
    assert.match(left, /\(a\)|a\)/);
    assert.ok(isRule(leftParagraphs[leftParagraphs.length - 1]), "the column ends on an answer line");
  });

  it("keeps a later part whose text holds a table out of the narrow column", async () => {
    const xml = await documentXml(paper([{
      number: 1,
      stem: "A garden is a rectangle.",
      marks: 3,
      diagram: await crop(500, 500),
      parts: [
        { label: "a", stem: "Use the table.\n\n| Side | Length |\n| --- | --- |\n| a | 3 m |", marks: 1 },
        { label: "b", stem: "Find its area.", marks: 2 },
      ],
    }]));
    // The layout row runs until the first </w:tc> closing its text column;
    // neither the part's text nor its table may appear before that.
    const row = body(xml).slice(body(xml).indexOf("<w:tbl>"));
    const left = row.slice(0, row.indexOf("</w:tc>"));
    assert.doesNotMatch(left, /Use the table/);
  });

  it("keeps a question's text, diagram and first two answer lines together", async () => {
    const xml = await documentXml(paper([
      { number: 1, stem: "Find the area.", marks: 3, diagram: await crop(1000, 300) },
    ]));
    const ps = paragraphs(body(xml));
    const stem = ps.findIndex((p) => /Find the area/.test(p));
    const rules = ps.filter(isRule);
    assert.ok(keepsNext(ps[stem]));
    assert.ok(keepsNext(rules[0]) && keepsNext(rules[1]));
    assert.ok(!keepsNext(rules[2]));
  });

  it("keeps list lines in a stem with the diagram after them", async () => {
    const stem = "The tank is empty.\n- Find its volume.\n- Find how many jugs fill it.";
    const xml = await documentXml(paper([{ number: 1, stem, marks: 2, diagram: await crop(1000, 300) }]));
    const ps = paragraphs(body(xml));
    const list = ps.filter((p) => /Find its volume|Find how many jugs/.test(p));
    assert.equal(list.length, 2);
    assert.ok(list.every(keepsNext));
  });

  it("keeps a section heading with the question after it", async () => {
    const xml = await documentXml(paper(null, [
      { title: "A, Core skills", questions: [{ number: 1, stem: "One.", marks: 1 }] },
      { title: "B, Applications", questions: [{ number: 2, stem: "Two.", marks: 1 }] },
    ]));
    const heading = paragraphs(body(xml)).find((p) => /B, Applications/.test(p));
    assert.ok(heading, "heading is a paragraph, not a table");
    assert.ok(keepsNext(heading));
    assert.match(heading, /<w:shd w:fill="1B3A6B"/);
  });
});
