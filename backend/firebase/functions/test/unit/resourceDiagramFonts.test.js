"use strict";

// RES-40. Fonts for diagram labels, and the diagram spacing fixes found in the
// same review.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  ACCENT_FONT,
  FONT_DIR,
  LABEL_FONT,
  fontConfigXml,
  labelFontFor,
  useBundledFonts,
} = require("../../src/resources/diagramFonts");
const { renderDiagramSvgForTest } = require("../../src/resources/diagramGenerator");

const svgOf = (diagram) => { const out = renderDiagramSvgForTest(diagram); return String(out.svg || out); };

describe("diagram label fonts (RES-40)", () => {
  it("ships the four DejaVu Sans faces with their licence", () => {
    for (const file of ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans-Oblique.ttf", "DejaVuSans-BoldOblique.ttf", "LICENSE"]) {
      assert.ok(fs.statSync(path.join(FONT_DIR, file)).size > 1000, file);
    }
  });

  it("draws a label with a combining mark in DejaVu Sans, and every other label as before", () => {
    // x with a bar, a recurring decimal's dot, a vector arrow.
    for (const label of ["x\u0304", "0.3\u0307", "v\u20d7"]) assert.equal(labelFontFor(label), ACCENT_FONT, label);
    // Set symbols and Greek letters print correctly in the usual font.
    for (const label of ["8 cm", "A \u222a B", "\u03b8", "36\u00b0", "", null]) assert.equal(labelFontFor(label), LABEL_FONT, String(label));
    assert.match(ACCENT_FONT, /^DejaVu Sans,/);
    // Arial first: Liberation Sans stands in for it on the Functions image,
    // and every diagram's spacing was tuned with it.
    assert.match(LABEL_FONT, /^Arial, Liberation Sans, DejaVu Sans/);
  });

  it("uses that font in the drawn diagram", () => {
    const svg = svgOf({ type: "number-line", min: 0, max: 2, step: 1, marks: [{ value: 1, label: "x\u0304" }, { value: 2, label: "y" }] });
    const fontOf = (label) => svg.match(new RegExp(`font-family="([^"]+)"[^>]*>${label}<`))?.[1];
    assert.equal(fontOf("x\u0304"), ACCENT_FONT);
    assert.equal(fontOf("y"), LABEL_FONT);
  });

  it("adds the bundled fonts to fontconfig without dropping the system's", () => {
    const xml = fontConfigXml("/srv/fonts & more", "/tmp/cache");
    assert.match(xml, /<include ignore_missing="yes">\/etc\/fonts\/fonts\.conf<\/include>/);
    assert.match(xml, /<dir>\/srv\/fonts &amp; more<\/dir>/);
    assert.match(xml, /<cachedir>\/tmp\/cache<\/cachedir>/);
  });

  it("points FONTCONFIG_FILE at a written config, unless one is already set", () => {
    // Loading the diagram generator already did this for the real environment.
    assert.ok(process.env.FONTCONFIG_FILE);
    assert.match(fs.readFileSync(process.env.FONTCONFIG_FILE, "utf8"), new RegExp(`<dir>${FONT_DIR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</dir>`));

    const preset = { FONTCONFIG_FILE: "/etc/custom-fonts.conf" };
    assert.equal(useBundledFonts({ env: preset, tmpDir: os.tmpdir() }), "/etc/custom-fonts.conf");
    assert.equal(preset.FONTCONFIG_FILE, "/etc/custom-fonts.conf");
  });
});

describe("diagram spacing found in the RES-40 review", () => {
  const yOf = (svg, label) => Number(svg.match(new RegExp(`<text x="[\\d.]+" y="([\\d.]+)"[^>]*>${label}<`))?.[1]);

  it("puts a dot plot's title just above its dots, not at the top of the canvas", () => {
    const svg = svgOf({ type: "dot-plot", title: "Siblings", data: [0, 0, 1, 2], min: 0, max: 5 });
    const dotTops = [...svg.matchAll(/<circle cx="[\d.]+" cy="([\d.]+)" r="7"/g)].map((m) => Number(m[1]) - 7);
    const gap = Math.min(...dotTops) - yOf(svg, "Siblings");
    assert.ok(gap > 20 && gap < 60, `title is ${gap}px above the tallest stack`);

    // A tall stack still leaves the title on the canvas.
    const tall = svgOf({ type: "dot-plot", title: "Scores", counts: { 3: 40 }, min: 0, max: 5 });
    assert.ok(yOf(tall, "Scores") >= 26);
  });

  it("puts a pictograph's key under its last row", () => {
    const svg = svgOf({ type: "pictograph", title: "Books read", key: "Each symbol = 2 books", iconValue: 2,
      rows: [{ label: "Mia", count: 6 }, { label: "Noah", count: 4 }] });
    const gap = yOf(svg, "Each symbol = 2 books") - yOf(svg, "Noah");
    assert.ok(gap > 20 && gap < 70, `key is ${gap}px under the last row`);
  });

  it("stops a clock's minute hand short of the numerals", () => {
    const svg = svgOf({ type: "clock", hour: 3, minute: 30 });
    const six = { x: Number(svg.match(/<text x="([\d.]+)" y="[\d.]+"[^>]*>6</)[1]), y: yOf(svg, "6") };
    // The minute hand points straight down at half past.
    const hand = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"[^>]*stroke-width="3"/g)]
      .map((m) => m.slice(1).map(Number)).find(([x1, , x2]) => Math.abs(x1 - x2) < 0.01 && Math.abs(x1 - six.x) < 1);
    assert.ok(hand, "minute hand found");
    assert.ok(six.y - hand[3] >= 20, `hand ends ${six.y - hand[3]}px above the centre of the 6`);
  });
});
