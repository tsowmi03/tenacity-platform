"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  renderDiagramSvgForTest,
} = require("../../src/resources/diagramGenerator");
const {
  boxesOverlap,
  estimateTextBox,
  scoreLabelCandidate,
  segment,
} = require("../../src/resources/diagramLayout");

const ANGLE_COLOUR = "#C0392B";

function parseAttrs(source) {
  const attrs = {};
  for (const match of source.matchAll(/([a-zA-Z0-9:-]+)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function numericAttr(attrs, name) {
  const value = Number(attrs[name]);
  assert.ok(Number.isFinite(value), `${name} must be numeric`);
  return value;
}

function extractLineObstacles(svg) {
  return [...svg.matchAll(/<line\b([^>]*)\/>/g)].map((match) => {
    const attrs = parseAttrs(match[1]);
    return {
      type: "segment",
      segment: segment(
        numericAttr(attrs, "x1"),
        numericAttr(attrs, "y1"),
        numericAttr(attrs, "x2"),
        numericAttr(attrs, "y2")
      ),
    };
  });
}

function extractAngleLabelBoxes(svg) {
  return [...svg.matchAll(/<text\b([^>]*)>(.*?)<\/text>/g)]
    .map((match) => {
      const attrs = parseAttrs(match[1]);
      return { attrs, label: match[2] };
    })
    .filter((item) => item.attrs.fill === ANGLE_COLOUR)
    .map((item) => {
      const fontSize = numericAttr(item.attrs, "font-size");
      return {
        label: item.label,
        box: estimateTextBox(item.label, {
          x: numericAttr(item.attrs, "x"),
          y: numericAttr(item.attrs, "y"),
          fontSize,
          anchor: item.attrs["text-anchor"] || "middle",
          padding: 3,
        }),
      };
    });
}

function assertAngleLabelsClearLines(spec) {
  const svg = renderDiagramSvgForTest(spec);
  assert.ok(svg, `${spec.type} should render SVG`);

  const lineObstacles = extractLineObstacles(svg);
  const labels = extractAngleLabelBoxes(svg);
  assert.ok(lineObstacles.length > 0, `${spec.type} should render line obstacles`);
  assert.ok(labels.length > 0, `${spec.type} should render angle labels`);

  labels.forEach((label) => {
    const score = scoreLabelCandidate(label.box, lineObstacles, { minClearance: 6 });
    assert.equal(
      score.valid,
      true,
      `${spec.type}/${spec.subtype || "default"} label "${label.label}" overlaps a line: ${JSON.stringify(score.collisions)}`
    );
  });

  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      assert.equal(
        boxesOverlap(labels[i].box, labels[j].box, 2),
        false,
        `${spec.type}/${spec.subtype || "default"} labels "${labels[i].label}" and "${labels[j].label}" overlap`
      );
    }
  }
}

describe("diagram renderer layout", () => {
  it("keeps parallel-line angle labels clear of rendered lines", () => {
    assertAngleLabelsClearLines({
      type: "parallel-lines",
      angles: { top: "x degrees", bottom: "55 degrees" },
      labels: { line1: "l", line2: "m", transversal: "t" },
    });
  });

  it("keeps angle labels clear of rendered rays and lines", () => {
    [
      { type: "angles", subtype: "single", angle: 50, label: "50 degrees" },
      { type: "angles", subtype: "on-line", angles: [50, 70, 60], labels: ["50 degrees", "x", "60 degrees"] },
      { type: "angles", subtype: "at-point", angles: [70, 110, 80, 100], labels: ["70 degrees", "110 degrees", "80 degrees", "100 degrees"] },
      { type: "angles", subtype: "vertically-opposite", angle: 50, labels: ["130 degrees", "50 degrees", "130 degrees", "50 degrees"] },
    ].forEach(assertAngleLabelsClearLines);
  });
});
