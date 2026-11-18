"use strict";
const { it, describe } = require("node:test");
const assert = require("node:assert/strict");
const { validateDiagram } = require("../../src/resources/builder/validation");
const { renderDiagramSvgForTest } = require("../../src/resources/diagramGenerator");
const { buildDiagramSchema } = require("../../src/resources/diagramSchema");
const { buildDiagramFillPrompt, buildDiagramRepairPrompt } = require("../../src/resources/promptBuilder");
const { getDiagramDefinition } = require("../../src/resources/diagramRegistry");

const lines = { line1: "l", line2: "m", transversal: "t" };
const POSITIONS = ["above-left", "above-right", "below-left", "below-right"];

describe("parallel-lines angle positions (RES-115)", () => {
  it("accepts any of the 8 angles, each once", () => {
    const marked = ["line1", "line2"].flatMap((line) => POSITIONS.map((position, i) => ({ line, position, label: `${40 + i} degrees` })));
    assert.doesNotThrow(() => validateDiagram({ type: "parallel-lines", marked, labels: lines }, "d"));
    assert.throws(() => validateDiagram({ type: "parallel-lines", marked: [marked[0], marked[0]], labels: lines }, "d"), /same angle twice/);
    assert.throws(() => validateDiagram({ type: "parallel-lines", marked: [{ line: "line1", position: "middle", label: "x" }], labels: lines }, "d"), /position/);
  });

  it("draws each angle in its own corner", () => {
    // The arc starts on the ray that opens its corner: right (0°), lower
    // transversal arm, left (180°), upper transversal arm.
    const arcFor = (position) => {
      const svg = renderDiagramSvgForTest({ type: "parallel-lines", marked: [{ line: "line1", position, label: "x" }], labels: lines });
      const m = String(svg.svg || svg).match(/<path d="M ([\d.-]+) ([\d.-]+) A [\d.]+ [\d.]+ 0 \d 1 ([\d.-]+) ([\d.-]+)"/);
      return m.slice(1).map(Number);
    };
    const [brx1, bry1] = arcFor("below-right");
    const [alx1, aly1] = arcFor("above-left");
    assert.ok(bry1 <= aly1 + 1e-6 && brx1 > alx1, "below-right starts on the right-hand ray, above-left on the left");
    const ends = POSITIONS.map((p) => arcFor(p).join(","));
    assert.equal(new Set(ends).size, 4, "four different arcs");
  });

  it("still draws a saved resource's old top/bottom pair", () => {
    const svg = renderDiagramSvgForTest({ type: "parallel-lines", angles: { top: "x degrees", bottom: "55 degrees" }, labels: lines });
    assert.equal((String(svg.svg || svg).match(/<path d="M/g) || []).length, 2);
    assert.doesNotThrow(() => validateDiagram({ type: "parallel-lines", angles: { top: "x degrees", bottom: "55 degrees" }, labels: lines }, "d"));
  });

  it("offers the model positions, not top/bottom", () => {
    const schema = JSON.stringify(buildDiagramSchema ? buildDiagramSchema("parallel-lines") : {});
    if (buildDiagramSchema) {
      assert.match(schema, /above-left/);
      assert.doesNotMatch(schema, /"top"/);
    }
    const definition = getDiagramDefinition("parallel-lines");
    const job = { year: 7, subject: "maths" };
    for (const build of [buildDiagramFillPrompt, buildDiagramRepairPrompt]) {
      const prompt = build({ job, type: "parallel-lines", definition, constrained: true });
      assert.match(prompt, /corner the angle sits in/);
      assert.match(prompt, /Never write where something is/);
    }
  });
});

describe("diagram labels are values, not descriptions (RES-115)", () => {
  it("rejects the labels seen in the RES-113 baseline", () => {
    const d = (label) => ({ type: "parallel-lines", marked: [{ line: "line1", position: "below-right", label }], labels: lines });
    assert.throws(() => validateDiagram(d("48° above l and to the right of t"), "d"), /value or name only/);
    assert.throws(() => validateDiagram(d("x above m and to the right of t"), "d"), /value or name only/);
    assert.doesNotThrow(() => validateDiagram(d("2x + 10 degrees"), "d"), "a long-ish expression in degrees is fine");
  });

  it("rejects an over-long side label but keeps trig side names", () => {
    const rect = (width) => ({ type: "rectangle", dimensions: { width: 12, height: 7 }, dimensionLabels: { width, height: "7 cm" } });
    assert.throws(() => validateDiagram(rect("the width of the garden bed"), "d"), /too long/);
    assert.doesNotThrow(() => validateDiagram(rect("x cm"), "d"));
    assert.doesNotThrow(() => validateDiagram({ type: "right-triangle", dimensions: { base: 8, height: 6, hypotenuse: 10 }, unit: "cm", dimensionLabels: { base: "adjacent", height: "opposite", hypotenuse: "hypotenuse" } }, "d"));
  });

  it("doesn't treat non-label fields as labels", () => {
    assert.doesNotThrow(() => validateDiagram(getDiagramDefinition("net").fixture, "d"), "net's solid: rectangular-prism is not a label");
  });
});
