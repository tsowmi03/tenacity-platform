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
const SVG_NUMBER = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi;
const ANGLE_LAYOUT_STRESS_SPECS = [
  {
    name: "parallel lines with long angle labels",
    spec: {
      type: "parallel-lines",
      angles: { top: "x + 15 degrees", bottom: "125 degrees" },
      labels: { line1: "l", line2: "m", transversal: "t" },
    },
  },
  {
    name: "single small angle",
    spec: { type: "angles", subtype: "single", angle: 18, label: "18 degrees" },
  },
  {
    name: "single obtuse angle with vertex and arm labels",
    spec: {
      type: "angles",
      subtype: "single",
      angle: 128,
      label: "128 degrees",
      vertexLabel: "O",
      armLabels: ["OA", "OB"],
    },
  },
  {
    name: "on-line crowded adjacent angles",
    spec: {
      type: "angles",
      subtype: "on-line",
      angles: [22, 38, 50, 70],
      labels: ["22 degrees", "38 degrees", "x degrees", "70 degrees"],
    },
  },
  {
    name: "at-point crowded mixed angles",
    spec: {
      type: "angles",
      subtype: "at-point",
      angles: [35, 55, 80, 95, 95],
      labels: ["35 degrees", "55 degrees", "80 degrees", "95 degrees", "x degrees"],
    },
  },
  {
    name: "vertically opposite with long repeated labels",
    spec: {
      type: "angles",
      subtype: "vertically-opposite",
      angle: 35,
      labels: ["145 degrees", "35 degrees", "145 degrees", "35 degrees"],
    },
  },
];

function assertAlmostEqual(actual, expected, tolerance = 0.001, message = "") {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message || `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function parseAttrs(source) {
  const attrs = {};
  for (const match of source.matchAll(/([a-zA-Z0-9:-]+)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function numericValues(source) {
  return [...String(source).matchAll(SVG_NUMBER)].map((match) => Number(match[0]));
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

function normaliseDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function degreesBetween(startDeg, endDeg) {
  return normaliseDegrees(endDeg - startDeg);
}

function arcFromSvgPath(d, strokeWidth) {
  const values = numericValues(d);
  assert.equal(values.length, 9, `expected single SVG arc path, got ${d}`);

  const [x1, y1, rx, ry, rotation, largeArcFlag, sweepFlag, x2, y2] = values;
  assertAlmostEqual(rx, ry, 0.001, "angle arc should use a circular radius");
  assertAlmostEqual(rotation, 0, 0.001, "angle arc should not rotate its x-axis");

  const r = rx;
  const chordX = x2 - x1;
  const chordY = y2 - y1;
  const chord = Math.hypot(chordX, chordY);
  assert.ok(chord > 0, "angle arc endpoints must differ");
  assert.ok(chord <= 2 * r + 0.001, "angle arc chord cannot exceed diameter");

  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const centerOffset = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2));
  const perpX = -chordY / chord;
  const perpY = chordX / chord;
  const centers = [
    { cx: mx + perpX * centerOffset, cy: my + perpY * centerOffset },
    { cx: mx - perpX * centerOffset, cy: my - perpY * centerOffset },
  ];

  const large = Boolean(largeArcFlag);
  const sweep = Boolean(sweepFlag);
  const candidates = centers.map((center) => {
    const startDeg = Math.atan2(y1 - center.cy, x1 - center.cx) * 180 / Math.PI;
    const endPointDeg = Math.atan2(y2 - center.cy, x2 - center.cx) * 180 / Math.PI;
    const clockwiseSweep = degreesBetween(startDeg, endPointDeg);
    const sweepDeg = sweep ? clockwiseSweep : degreesBetween(endPointDeg, startDeg);
    const arcStartDeg = sweep ? startDeg : endPointDeg;
    return {
      ...center,
      sweepDeg,
      startDeg: arcStartDeg,
      endDeg: arcStartDeg + sweepDeg,
    };
  });

  const selected = candidates.find((candidate) => {
    if (large) return candidate.sweepDeg > 180 - 0.001;
    return candidate.sweepDeg <= 180 + 0.001;
  });
  assert.ok(selected, `could not reconstruct SVG arc center for ${d}`);

  return {
    cx: selected.cx,
    cy: selected.cy,
    r,
    startDeg: selected.startDeg,
    endDeg: selected.endDeg,
    strokeWidth,
  };
}

function extractAngleArcObstacles(svg) {
  return [...svg.matchAll(/<path\b([^>]*)\/>/g)]
    .map((match) => parseAttrs(match[1]))
    .filter((attrs) => attrs.stroke === ANGLE_COLOUR)
    .map((attrs) => ({
      type: "arc",
      arc: arcFromSvgPath(attrs.d, numericAttr(attrs, "stroke-width")),
    }));
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

function assertAngleLabelsClearRenderedObstacles(spec) {
  const svg = renderDiagramSvgForTest(spec);
  assert.ok(svg, `${spec.type} should render SVG`);

  const lineObstacles = extractLineObstacles(svg);
  const arcObstacles = extractAngleArcObstacles(svg);
  const labels = extractAngleLabelBoxes(svg);
  assert.ok(lineObstacles.length > 0, `${spec.type} should render line obstacles`);
  assert.ok(arcObstacles.length > 0, `${spec.type} should render angle arc obstacles`);
  assert.ok(labels.length > 0, `${spec.type} should render angle labels`);

  labels.forEach((label) => {
    let score = scoreLabelCandidate(label.box, lineObstacles, { minClearance: 6 });
    assert.equal(
      score.valid,
      true,
      `${spec.type}/${spec.subtype || "default"} label "${label.label}" overlaps a line: ${JSON.stringify(score.collisions)}`
    );

    score = scoreLabelCandidate(label.box, arcObstacles, { minClearance: 6 });
    assert.equal(
      score.valid,
      true,
      `${spec.type}/${spec.subtype || "default"} label "${label.label}" overlaps an angle arc: ${JSON.stringify(score.collisions)}`
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

function assertAngleLabelsNearRenderedArcs(spec, maxClearance) {
  const svg = renderDiagramSvgForTest(spec);
  const arcObstacles = extractAngleArcObstacles(svg);
  const labels = extractAngleLabelBoxes(svg);

  labels.forEach((label) => {
    const score = scoreLabelCandidate(label.box, arcObstacles);
    assert.ok(
      score.clearance <= maxClearance,
      `${spec.type}/${spec.subtype || "default"} label "${label.label}" is ${score.clearance}px from the nearest angle arc`
    );
  });
}

describe("diagram renderer layout", () => {
  it("formats angle labels with degree symbols", () => {
    const parallelSvg = renderDiagramSvgForTest({
      type: "parallel-lines",
      angles: { top: "x + 15 degrees", bottom: "125 degrees" },
      labels: { line1: "l", line2: "m", transversal: "t" },
    });
    assert.match(parallelSvg, />\(x \+ 15\)°<\/text>/);
    assert.match(parallelSvg, />125°<\/text>/);
    assert.doesNotMatch(parallelSvg, /degrees/i);

    const anglesSvg = renderDiagramSvgForTest({
      type: "angles",
      subtype: "on-line",
      angles: [50, 70, 60],
      labels: ["50 degrees", "x degrees", "60 degrees"],
    });
    assert.match(anglesSvg, />50°<\/text>/);
    assert.match(anglesSvg, />x°<\/text>/);
    assert.match(anglesSvg, />60°<\/text>/);
    assert.doesNotMatch(anglesSvg, /degrees/i);
  });

  it("keeps parallel-line angle labels clear of rendered lines and arcs", () => {
    assertAngleLabelsClearRenderedObstacles({
      type: "parallel-lines",
      angles: { top: "x degrees", bottom: "55 degrees" },
      labels: { line1: "l", line2: "m", transversal: "t" },
    });
  });

  it("keeps representative angle labels visually close to their arcs", () => {
    assertAngleLabelsNearRenderedArcs({
      type: "parallel-lines",
      angles: { top: "x degrees", bottom: "55 degrees" },
      labels: { line1: "l", line2: "m", transversal: "t" },
    }, 32);
    assertAngleLabelsNearRenderedArcs({
      type: "angles",
      subtype: "single",
      angle: 50,
      label: "50 degrees",
    }, 32);
  });

  it("keeps angle labels clear of rendered rays, lines, and arcs", () => {
    [
      { type: "angles", subtype: "single", angle: 50, label: "50 degrees" },
      { type: "angles", subtype: "on-line", angles: [50, 70, 60], labels: ["50 degrees", "x", "60 degrees"] },
      { type: "angles", subtype: "at-point", angles: [70, 110, 80, 100], labels: ["70 degrees", "110 degrees", "80 degrees", "100 degrees"] },
      { type: "angles", subtype: "vertically-opposite", angle: 50, labels: ["130 degrees", "50 degrees", "130 degrees", "50 degrees"] },
    ].forEach(assertAngleLabelsClearRenderedObstacles);
  });

  it("keeps stress-case angle labels clear of rendered obstacles", () => {
    for (const item of ANGLE_LAYOUT_STRESS_SPECS) {
      assert.doesNotThrow(
        () => assertAngleLabelsClearRenderedObstacles(item.spec),
        item.name
      );
    }
  });
});
