"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  renderDiagramSvgForTest,
} = require("../../src/resources/diagramGenerator");
const {
  boxFromCenter,
  boxesOverlap,
  estimateTextBox,
  scoreLabelCandidate,
  segment,
} = require("../../src/resources/diagramLayout");

const ANGLE_COLOUR = "#C0392B";
const DIMENSION_COLOUR = "#1C71AF";
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
const RECTANGLE_FAMILY_STRESS_SPECS = [
  {
    name: "rectangle with repeated dimensions",
    spec: {
      type: "rectangle",
      dimensions: { width: 12, height: 12 },
      unit: "cm",
    },
  },
  {
    name: "L-shape with standard dimensions",
    spec: {
      type: "L-shape",
      dimensions: {
        totalWidth: 10,
        totalHeight: 8,
        cutoutWidth: 5,
        cutoutHeight: 4,
      },
      unit: "cm",
    },
  },
  {
    name: "L-shape with small dimensions",
    spec: {
      type: "L-shape",
      dimensions: {
        totalWidth: 3,
        totalHeight: 3,
        cutoutWidth: 1,
        cutoutHeight: 1,
      },
      unit: "cm",
    },
  },
  {
    name: "T-shape with standard dimensions",
    spec: {
      type: "T-shape",
      dimensions: {
        topWidth: 12,
        topHeight: 3,
        stemWidth: 4,
        stemHeight: 7,
      },
      unit: "cm",
    },
  },
  {
    name: "T-shape with repeated dimensions",
    spec: {
      type: "T-shape",
      dimensions: {
        topWidth: 8,
        topHeight: 2,
        stemWidth: 2,
        stemHeight: 8,
      },
      unit: "cm",
    },
  },
];
const MIXED_SHAPE_STRESS_SPECS = [
  {
    name: "rectangle-triangle with standard dimensions",
    spec: {
      type: "rect-triangle",
      dimensions: {
        width: 10,
        rectangleHeight: 4,
        triangleHeight: 3,
      },
      unit: "cm",
    },
  },
  {
    name: "rectangle-triangle with repeated dimensions",
    spec: {
      type: "rect-triangle",
      dimensions: {
        width: 6,
        rectangleHeight: 6,
        triangleHeight: 6,
      },
      unit: "cm",
    },
  },
  {
    name: "rectangle-triangle with small dimensions",
    spec: {
      type: "rect-triangle",
      dimensions: {
        width: 3,
        rectangleHeight: 1,
        triangleHeight: 1,
      },
      unit: "cm",
    },
  },
  {
    name: "rectangle-semicircle with standard dimensions",
    spec: {
      type: "rect-semicircle",
      dimensions: {
        rectangleWidth: 8,
        diameter: 6,
      },
      unit: "cm",
    },
  },
  {
    name: "rectangle-semicircle with repeated dimensions",
    spec: {
      type: "rect-semicircle",
      dimensions: {
        rectangleWidth: 6,
        diameter: 6,
      },
      unit: "cm",
    },
  },
  {
    name: "rectangle-semicircle with small dimensions",
    spec: {
      type: "rect-semicircle",
      dimensions: {
        rectangleWidth: 3,
        diameter: 1,
      },
      unit: "cm",
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

function extractPolygonObstacles(svg) {
  return [...svg.matchAll(/<polygon\b([^>]*)\/>/g)].flatMap((match) => {
    const attrs = parseAttrs(match[1]);
    if (attrs.fill !== "none") return [];
    const points = String(attrs.points || "")
      .trim()
      .split(/\s+/)
      .map((item) => item.split(",").map(Number));
    return points.map((point, index) => {
      const next = points[(index + 1) % points.length];
      return {
        type: "segment",
        segment: segment(point[0], point[1], next[0], next[1]),
      };
    });
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

function extractShapeArcObstacles(svg) {
  return [...svg.matchAll(/<path\b([^>]*)\/>/g)]
    .map((match) => parseAttrs(match[1]))
    .filter((attrs) => attrs.stroke === "#1B3F71")
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

function extractDimensionLabelBoxes(svg) {
  return [...svg.matchAll(/<text\b([^>]*)>(.*?)<\/text>/g)]
    .map((match) => {
      const attrs = parseAttrs(match[1]);
      return { attrs, label: match[2] };
    })
    .filter((item) => item.attrs.fill === DIMENSION_COLOUR)
    .map((item) => {
      const fontSize = numericAttr(item.attrs, "font-size");
      const x = numericAttr(item.attrs, "x");
      const y = numericAttr(item.attrs, "y");
      const base = estimateTextBox(item.label, {
        x,
        y,
        fontSize,
        anchor: item.attrs["text-anchor"] || "middle",
        padding: 3,
      });
      const rotateMatch = String(item.attrs.transform || "").match(/rotate\((-?\d+(?:\.\d+)?)/);
      const rotate = rotateMatch ? Number(rotateMatch[1]) : 0;
      return {
        label: item.label,
        x,
        y,
        rotate,
        box: Math.abs(rotate) % 180 === 90
          ? boxFromCenter(x, y, base.bottom - base.top, base.right - base.left)
          : base,
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

function assertDimensionLabelsClearRenderedObstacles(spec) {
  const svg = renderDiagramSvgForTest(spec);
  assert.ok(svg, `${spec.type} should render SVG`);
  const attrs = parseAttrs(svg.match(/^<svg\b([^>]*)>/)?.[1] || "");
  const width = numericAttr(attrs, "width");
  const height = numericAttr(attrs, "height");
  const lineObstacles = [
    ...extractLineObstacles(svg),
    ...extractPolygonObstacles(svg),
    ...extractShapeArcObstacles(svg),
  ];
  const labels = extractDimensionLabelBoxes(svg);
  assert.ok(lineObstacles.length > 0, `${spec.type} should render outline and dimension lines`);
  assert.ok(labels.length > 0, `${spec.type} should render dimension labels`);

  labels.forEach((label) => {
    const score = scoreLabelCandidate(label.box, lineObstacles, { minClearance: 5 });
    assert.equal(
      score.valid,
      true,
      `${spec.type} label "${label.label}" overlaps a rendered line: ${JSON.stringify(score.collisions)}`
    );
    assert.ok(label.box.left >= 20, `${spec.type} label "${label.label}" leaves the left safe area`);
    assert.ok(label.box.right <= width - 20, `${spec.type} label "${label.label}" leaves the right safe area`);
    assert.ok(label.box.top >= 20, `${spec.type} label "${label.label}" leaves the top safe area`);
    assert.ok(label.box.bottom <= height - 20, `${spec.type} label "${label.label}" leaves the bottom safe area`);
  });

  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      assert.equal(
        boxesOverlap(labels[i].box, labels[j].box, 2),
        false,
        `${spec.type} labels "${labels[i].label}" and "${labels[j].label}" overlap`
      );
    }
  }
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

  it("keeps rectangle-family labels clear of outlines, dimension lines, and other labels", () => {
    for (const item of RECTANGLE_FAMILY_STRESS_SPECS) {
      assert.doesNotThrow(
        () => assertDimensionLabelsClearRenderedObstacles(item.spec),
        item.name
      );
    }
  });

  it("keeps mixed-shape labels clear of outlines, curves, construction lines, and other labels", () => {
    for (const item of MIXED_SHAPE_STRESS_SPECS) {
      assert.doesNotThrow(
        () => assertDimensionLabelsClearRenderedObstacles(item.spec),
        item.name
      );
    }
  });

  it("keeps small L-shape cutout labels tight to the inner notch sides", () => {
    const svg = renderDiagramSvgForTest({
      type: "L-shape",
      dimensions: {
        totalWidth: 3,
        totalHeight: 3,
        cutoutWidth: 1,
        cutoutHeight: 1,
      },
      unit: "cm",
    });
    const polygonAttrs = parseAttrs(svg.match(/<polygon\b([^>]*)\/>/)?.[1] || "");
    const points = String(polygonAttrs.points || "")
      .trim()
      .split(/\s+/)
      .map((item) => item.split(",").map(Number));
    const notchRight = points[2];
    const notchCorner = points[3];
    const notchBottom = points[4];
    const dimensionLines = [...svg.matchAll(/<line\b([^>]*)\/>/g)]
      .map((match) => parseAttrs(match[1]))
      .map((attrs) => ({
        x1: Number(attrs.x1),
        y1: Number(attrs.y1),
        x2: Number(attrs.x2),
        y2: Number(attrs.y2),
      }));
    const cutoutHeightLine = dimensionLines.find(
      (line) =>
        line.x1 === line.x2 &&
        line.x1 > notchCorner[0] &&
        line.y1 === notchCorner[1] &&
        line.y2 === notchBottom[1]
    );
    const cutoutWidthLine = dimensionLines.find(
      (line) =>
        line.y1 === line.y2 &&
        line.y1 > notchCorner[1] &&
        line.x1 === notchCorner[0] &&
        line.x2 === notchRight[0]
    );
    const cutoutHeightLabel = extractDimensionLabelBoxes(svg)
      .find((item) => item.label === "1 cm" && Math.abs(item.rotate) === 90);
    const cutoutWidthLabel = extractDimensionLabelBoxes(svg)
      .find((item) => item.label === "1 cm" && item.rotate === 0);

    assert.ok(cutoutHeightLine, "expected the vertical cutout construction line");
    assert.ok(cutoutWidthLine, "expected the horizontal cutout construction line");
    assert.ok(cutoutHeightLabel, "expected the vertical 1 cm cutout-height label");
    assert.ok(cutoutWidthLabel, "expected the horizontal 1 cm cutout-width label");
    assert.ok(
      cutoutHeightLabel.x > notchCorner[0],
      "cutout-height label should sit beside the vertical notch side"
    );
    assert.ok(
      cutoutHeightLabel.y > notchCorner[1] && cutoutHeightLabel.y < notchBottom[1],
      "cutout-height label should remain within the vertical notch span"
    );
    assert.ok(
      cutoutHeightLine.x1 - notchCorner[0] <= 12 &&
        cutoutHeightLabel.x - cutoutHeightLine.x1 <= 30,
      "cutout-height bracket and label should remain tight to the vertical notch side"
    );
    assert.ok(
      cutoutWidthLabel.y > notchCorner[1],
      "cutout-width label should sit below the horizontal notch side"
    );
    assert.ok(
      cutoutWidthLabel.x > notchCorner[0] && cutoutWidthLabel.x < notchRight[0],
      "cutout-width label should remain within the horizontal notch span"
    );
    assert.ok(
      cutoutWidthLine.y1 - notchCorner[1] <= 12 &&
        cutoutWidthLabel.y - cutoutWidthLine.y1 <= 30,
      "cutout-width bracket and label should remain tight to the horizontal notch side"
    );
  });

  it("keeps the repeated T-shape top-height label centred beside its bracket", () => {
    const svg = renderDiagramSvgForTest({
      type: "T-shape",
      dimensions: {
        topWidth: 8,
        topHeight: 2,
        stemWidth: 2,
        stemHeight: 8,
      },
      unit: "cm",
    });
    const polygonAttrs = parseAttrs(svg.match(/<polygon\b([^>]*)\/>/)?.[1] || "");
    const points = String(polygonAttrs.points || "")
      .trim()
      .split(/\s+/)
      .map((item) => item.split(",").map(Number));
    const topLeft = points[0];
    const topBarBottomLeft = points[7];
    const topHeightLabel = extractDimensionLabelBoxes(svg)
      .find((item) => item.label === "2 cm" && Math.abs(item.rotate) === 90);

    assert.ok(topHeightLabel, "expected the vertical 2 cm top-height label");
    assert.ok(topHeightLabel.x < topLeft[0], "top-height label should sit left of its bracket");
    assertAlmostEqual(
      topHeightLabel.y,
      (topLeft[1] + topBarBottomLeft[1]) / 2,
      1,
      "top-height label should be vertically centred beside its bracket"
    );
    assert.ok(
      topLeft[0] - topHeightLabel.x <= 70,
      "top-height label should remain close to its bracket"
    );
  });

  it("fails closed when a rectangle-family label cannot fit inside the canvas", () => {
    assert.throws(
      () => renderDiagramSvgForTest({
        type: "rectangle",
        dimensions: { width: 12, height: 7 },
        dimensionLabels: {
          width: "This dimension label is intentionally too long to fit safely ".repeat(8),
          height: "7 cm",
        },
      }),
      /rectangle diagram layout failed for width label/
    );
  });
});
