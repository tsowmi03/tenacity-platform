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
const QUADRILATERAL_FAMILY_STRESS_SPECS = [
  {
    name: "parallelogram with side and perpendicular height",
    spec: {
      type: "parallelogram",
      dimensions: { base: 10, side: 6, height: 4 },
      unit: "cm",
    },
    constructionLines: 1,
  },
  {
    name: "parallelogram with repeated dimensions",
    spec: {
      type: "parallelogram",
      dimensions: { base: 8, side: 8, height: 6 },
      unit: "cm",
    },
    constructionLines: 1,
  },
  {
    name: "parallelogram with side only",
    spec: {
      type: "parallelogram",
      dimensions: { base: 10, side: 6 },
      unit: "cm",
    },
    constructionLines: 0,
  },
  {
    name: "parallelogram with perpendicular height only",
    spec: {
      type: "parallelogram",
      dimensions: { base: 10, height: 4 },
      unit: "cm",
    },
    constructionLines: 1,
  },
  {
    name: "parallelogram with a shallow perpendicular height",
    spec: {
      type: "parallelogram",
      dimensions: { base: 8, side: 5, height: 1 },
      unit: "cm",
    },
    constructionLines: 1,
  },
  {
    name: "trapezium with shorter top base",
    spec: {
      type: "trapezium",
      dimensions: { topBase: 6, bottomBase: 10, height: 4 },
      unit: "cm",
    },
    constructionLines: 1,
  },
  {
    name: "trapezium with longer top base",
    spec: {
      type: "trapezium",
      dimensions: { topBase: 12, bottomBase: 8, height: 5 },
      unit: "cm",
    },
    constructionLines: 2,
  },
  {
    name: "trapezium with repeated base and height values",
    spec: {
      type: "trapezium",
      dimensions: { topBase: 5, bottomBase: 9, height: 5 },
      unit: "cm",
    },
    constructionLines: 1,
  },
  {
    name: "trapezium with extreme base ratio and shallow height",
    spec: {
      type: "trapezium",
      dimensions: { topBase: 2, bottomBase: 16, height: 1 },
      unit: "cm",
    },
    constructionLines: 1,
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
const RIGHT_TRIANGLE_STRESS_SPECS = [
  {
    name: "right triangle with standard dimensions",
    spec: {
      type: "right-triangle",
      dimensions: { base: 8, height: 6, hypotenuse: 10 },
      unit: "cm",
    },
  },
  {
    name: "right triangle with repeated perpendicular dimensions",
    spec: {
      type: "right-triangle",
      dimensions: { base: 5, height: 5, hypotenuse: 7.07 },
      unit: "cm",
    },
  },
  {
    name: "right triangle with small dimensions",
    spec: {
      type: "right-triangle",
      dimensions: { base: 3, height: 4, hypotenuse: 5 },
      unit: "cm",
    },
  },
  {
    name: "right triangle without a supplied hypotenuse",
    spec: {
      type: "right-triangle",
      dimensions: { base: 8, height: 6 },
      unit: "cm",
    },
  },
];
const GENERAL_TRIANGLE_STRESS_SPECS = [
  {
    name: "scalene triangle with three side lengths",
    spec: {
      type: "triangle",
      dimensions: { base: 8, leftSide: 6, rightSide: 7 },
      unit: "cm",
    },
    constructionLines: 0,
  },
  {
    name: "isosceles triangle with repeated side lengths",
    spec: {
      type: "triangle",
      dimensions: { base: 6, leftSide: 5, rightSide: 5 },
      unit: "cm",
    },
    constructionLines: 0,
  },
  {
    name: "obtuse triangle with three side lengths",
    spec: {
      type: "triangle",
      dimensions: { base: 8, leftSide: 4, rightSide: 10 },
      unit: "cm",
    },
    constructionLines: 0,
  },
  {
    name: "triangle with base and perpendicular height",
    spec: {
      type: "triangle",
      dimensions: { base: 10, height: 6 },
      unit: "cm",
    },
    constructionLines: 1,
  },
];
const CIRCLE_FAMILY_STRESS_SPECS = [
  {
    name: "circle with radius",
    spec: {
      type: "circle",
      dimensions: { radius: 5 },
      unit: "cm",
    },
    constructionLines: 1,
  },
  {
    name: "circle with diameter",
    spec: {
      type: "circle",
      dimensions: { diameter: 10 },
      unit: "cm",
    },
    constructionLines: 1,
  },
  {
    name: "sector with acute central angle",
    spec: {
      type: "circle-sector",
      dimensions: { radius: 6, angle: 45 },
      unit: "cm",
    },
    constructionLines: 0,
  },
  {
    name: "sector with standard central angle",
    spec: {
      type: "circle-sector",
      dimensions: { radius: 6, angle: 120 },
      unit: "cm",
    },
    constructionLines: 0,
  },
  {
    name: "sector with reflex central angle",
    spec: {
      type: "circle-sector",
      dimensions: { radius: 6, angle: 240 },
      unit: "cm",
    },
    constructionLines: 0,
  },
];
const SOLID_FAMILY_STRESS_SPECS = [
  {
    name: "rectangular prism with standard dimensions",
    spec: {
      type: "prism-rect",
      dimensions: { length: 10, width: 5, height: 4 },
      unit: "cm",
    },
    dimensionLines: 0,
  },
  {
    name: "rectangular prism with repeated dimensions",
    spec: {
      type: "prism-rect",
      dimensions: { length: 6, width: 6, height: 6 },
      unit: "cm",
    },
    dimensionLines: 0,
  },
  {
    name: "triangular prism with perpendicular face height",
    spec: {
      type: "prism-tri",
      dimensions: { triangleBase: 8, triangleHeight: 5, length: 12 },
      unit: "cm",
    },
    dimensionLines: 1,
  },
  {
    name: "cylinder with radius and height",
    spec: {
      type: "cylinder",
      dimensions: { radius: 5, height: 12 },
      unit: "cm",
    },
    dimensionLines: 4,
  },
  {
    name: "cylinder with diameter and repeated height",
    spec: {
      type: "cylinder",
      dimensions: { diameter: 10, height: 10 },
      unit: "cm",
    },
    dimensionLines: 4,
  },
];
const ADVANCED_SOLID_FAMILY_STRESS_SPECS = [
  {
    name: "cone with radius and height",
    spec: {
      type: "cone",
      dimensions: { radius: 5, height: 12 },
      unit: "cm",
    },
    dimensionLines: 2,
    constructionLines: 1,
  },
  {
    name: "cone with diameter and repeated height",
    spec: {
      type: "cone",
      dimensions: { diameter: 10, height: 10 },
      unit: "cm",
    },
    dimensionLines: 2,
    constructionLines: 1,
  },
  {
    name: "rectangular pyramid with standard dimensions",
    spec: {
      type: "pyramid",
      dimensions: { baseLength: 8, baseWidth: 5, height: 10 },
      unit: "cm",
    },
    dimensionLines: 1,
    constructionLines: 1,
  },
  {
    name: "rectangular pyramid with repeated dimensions",
    spec: {
      type: "pyramid",
      dimensions: { baseLength: 6, baseWidth: 6, height: 6 },
      unit: "cm",
    },
    dimensionLines: 1,
    constructionLines: 1,
  },
  {
    name: "sphere with radius",
    spec: {
      type: "sphere",
      dimensions: { radius: 5 },
      unit: "cm",
    },
    dimensionLines: 1,
    constructionLines: 0,
  },
  {
    name: "sphere with diameter",
    spec: {
      type: "sphere",
      dimensions: { diameter: 10 },
      unit: "cm",
    },
    dimensionLines: 1,
    constructionLines: 0,
  },
  {
    name: "rectangular-prism net with standard dimensions",
    spec: {
      type: "net",
      solid: "rectangular-prism",
      dimensions: { length: 8, width: 5, height: 3 },
      unit: "cm",
    },
    dimensionLines: 0,
    constructionLines: 0,
  },
  {
    name: "rectangular-prism net with repeated dimensions",
    spec: {
      type: "net",
      solid: "rectangular-prism",
      dimensions: { length: 4, width: 4, height: 4 },
      unit: "cm",
    },
    dimensionLines: 0,
    constructionLines: 0,
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

function extractCircleObstacles(svg) {
  return [...svg.matchAll(/<circle\b([^>]*)\/>/g)]
    .map((match) => parseAttrs(match[1]))
    .filter((attrs) => attrs.fill === "none" && attrs.stroke === "#1B3F71")
    .map((attrs) => ({
      type: "arc",
      arc: {
        cx: numericAttr(attrs, "cx"),
        cy: numericAttr(attrs, "cy"),
        r: numericAttr(attrs, "r"),
        startDeg: 0,
        endDeg: 360,
        strokeWidth: numericAttr(attrs, "stroke-width"),
      },
    }));
}

function extractEllipseObstacles(svg) {
  return [...svg.matchAll(/<ellipse\b([^>]*)\/>/g)]
    .map((match) => parseAttrs(match[1]))
    .filter((attrs) => attrs.fill === "none" && attrs.stroke === "#1B3F71")
    .flatMap((attrs) => {
      const cx = numericAttr(attrs, "cx");
      const cy = numericAttr(attrs, "cy");
      const rx = numericAttr(attrs, "rx");
      const ry = numericAttr(attrs, "ry");
      const points = Array.from({ length: 49 }, (_, index) => {
        const radians = 2 * Math.PI * index / 48;
        return [cx + rx * Math.cos(radians), cy + ry * Math.sin(radians)];
      });
      return points.slice(0, -1).map((point, index) => ({
        type: "segment",
        segment: segment(
          point[0],
          point[1],
          points[index + 1][0],
          points[index + 1][1]
        ),
      }));
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
    .flatMap((attrs) => {
      const values = numericValues(attrs.d);
      const [x1, y1, rx, ry, rotation, largeArcFlag, sweepFlag, x2, y2] = values;
      if (Math.abs(rx - ry) <= 0.001) {
        return [{
          type: "arc",
          arc: arcFromSvgPath(attrs.d, numericAttr(attrs, "stroke-width")),
        }];
      }

      assert.equal(values.length, 9, `expected single SVG ellipse arc path, got ${attrs.d}`);
      assertAlmostEqual(rotation, 0, 0.001, "ellipse arc should not rotate its x-axis");
      assertAlmostEqual(y1, y2, 0.001, "ellipse arc should use horizontal diameter endpoints");
      assertAlmostEqual(Math.abs(x2 - x1), 2 * rx, 0.001, "ellipse arc should span a half ellipse");
      assert.equal(Boolean(largeArcFlag), false, "half ellipse should not use the large-arc flag");

      const cx = (x1 + x2) / 2;
      const cy = y1;
      const startsLeft = x1 < x2;
      const sweep = Boolean(sweepFlag);
      const startDeg = startsLeft
        ? (sweep ? 180 : 0)
        : (sweep ? 0 : 180);
      const endDeg = startDeg + (sweep ? 180 : -180);
      const points = Array.from({ length: 25 }, (_, index) => {
        const degrees = startDeg + (endDeg - startDeg) * index / 24;
        const radians = degrees * Math.PI / 180;
        return [
          cx + rx * Math.cos(radians),
          cy + ry * Math.sin(radians),
        ];
      });
      return points.slice(0, -1).map((point, index) => ({
        type: "segment",
        segment: segment(
          point[0],
          point[1],
          points[index + 1][0],
          points[index + 1][1]
        ),
      }));
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

function boxCorners(value) {
  return [
    [value.left, value.top],
    [value.right, value.top],
    [value.right, value.bottom],
    [value.left, value.bottom],
  ];
}

function assertCircularMeasurementLabelInside(spec) {
  const svg = renderDiagramSvgForTest(spec);
  const label = extractDimensionLabelBoxes(svg)
    .find((item) => item.rotate === 0);
  assert.ok(label, `${spec.type} should render a horizontal radius or diameter label`);

  if (spec.type === "circle" || spec.type === "sphere") {
    const outline = [...svg.matchAll(/<circle\b([^>]*)\/>/g)]
      .map((match) => parseAttrs(match[1]))
      .find((attrs) => attrs.fill === "none" && attrs.stroke === "#1B3F71");
    assert.ok(outline, `${spec.type} should render a circular outline`);
    const cx = numericAttr(outline, "cx");
    const cy = numericAttr(outline, "cy");
    const radius = numericAttr(outline, "r");
    boxCorners(label.box).forEach(([x, y]) => {
      assert.ok(
        Math.hypot(x - cx, y - cy) < radius,
        `${spec.type} label "${label.label}" should remain fully inside the circle`
      );
    });
    return;
  }

  let circularFace = [...svg.matchAll(/<ellipse\b([^>]*)\/>/g)]
    .map((match) => parseAttrs(match[1]))
    .find((attrs) => attrs.fill === "none" && attrs.stroke === "#1B3F71");
  if (!circularFace && spec.type === "cone") {
    const pathAttrs = [...svg.matchAll(/<path\b([^>]*)\/>/g)]
      .map((match) => parseAttrs(match[1]))
      .find((attrs) => {
        const values = numericValues(attrs.d);
        return values.length === 9 && Math.abs(values[2] - values[3]) > 0.001;
      });
    assert.ok(pathAttrs, "cone should render an elliptical base");
    const values = numericValues(pathAttrs.d);
    circularFace = {
      cx: String((values[0] + values[7]) / 2),
      cy: String(values[1]),
      rx: String(values[2]),
      ry: String(values[3]),
    };
  }
  assert.ok(circularFace, `${spec.type} should render an elliptical circular face`);
  const cx = numericAttr(circularFace, "cx");
  const cy = numericAttr(circularFace, "cy");
  const rx = numericAttr(circularFace, "rx");
  const ry = numericAttr(circularFace, "ry");
  boxCorners(label.box).forEach(([x, y]) => {
    const ellipseValue = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    assert.ok(
      ellipseValue < 1,
      `${spec.type} label "${label.label}" should remain fully inside the circular face`
    );
  });
}

function assertAngleLabelsClearRenderedObstacles(spec) {
  const svg = renderDiagramSvgForTest(spec);
  assert.ok(svg, `${spec.type} should render SVG`);

  const lineObstacles = extractLineObstacles(svg);
  const shapeArcObstacles = [
    ...extractShapeArcObstacles(svg),
    ...extractCircleObstacles(svg),
    ...extractEllipseObstacles(svg),
  ];
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

    score = scoreLabelCandidate(label.box, shapeArcObstacles, { minClearance: 6 });
    assert.equal(
      score.valid,
      true,
      `${spec.type}/${spec.subtype || "default"} label "${label.label}" overlaps a shape arc: ${JSON.stringify(score.collisions)}`
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
    ...extractCircleObstacles(svg),
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

  it("uses construction lines only for quadrilateral perpendicular heights", () => {
    for (const item of QUADRILATERAL_FAMILY_STRESS_SPECS) {
      assert.doesNotThrow(
        () => assertDimensionLabelsClearRenderedObstacles(item.spec),
        item.name
      );
      const svg = renderDiagramSvgForTest(item.spec);
      const constructionLines = [...svg.matchAll(/<line\b([^>]*)\/>/g)]
        .map((match) => parseAttrs(match[1]))
        .filter((attrs) =>
          attrs.stroke === DIMENSION_COLOUR &&
          attrs["stroke-dasharray"]
        );
      assert.equal(
        constructionLines.length,
        item.constructionLines,
        `${item.name} should render only semantically necessary construction lines`
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

  it("keeps direct right-triangle side labels clear without dimension brackets", () => {
    for (const item of RIGHT_TRIANGLE_STRESS_SPECS) {
      assert.doesNotThrow(
        () => assertDimensionLabelsClearRenderedObstacles(item.spec),
        item.name
      );
      const svg = renderDiagramSvgForTest(item.spec);
      const dimensionLines = [...svg.matchAll(/<line\b([^>]*)\/>/g)]
        .map((match) => parseAttrs(match[1]))
        .filter((attrs) => attrs.stroke === DIMENSION_COLOUR);
      assert.equal(
        dimensionLines.length,
        0,
        `${item.name} should label exposed sides directly without dimension brackets`
      );
    }
  });

  it("uses construction lines only for general-triangle perpendicular heights", () => {
    for (const item of GENERAL_TRIANGLE_STRESS_SPECS) {
      assert.doesNotThrow(
        () => assertDimensionLabelsClearRenderedObstacles(item.spec),
        item.name
      );
      const svg = renderDiagramSvgForTest(item.spec);
      const constructionLines = [...svg.matchAll(/<line\b([^>]*)\/>/g)]
        .map((match) => parseAttrs(match[1]))
        .filter((attrs) =>
          attrs.stroke === DIMENSION_COLOUR &&
          attrs["stroke-dasharray"]
        );
      assert.equal(
        constructionLines.length,
        item.constructionLines,
        `${item.name} should render only semantically necessary construction lines`
      );
    }
  });

  it("uses construction lines only for circle measurements, not visible sector radii", () => {
    for (const item of CIRCLE_FAMILY_STRESS_SPECS) {
      assert.doesNotThrow(
        () => assertDimensionLabelsClearRenderedObstacles(item.spec),
        item.name
      );
      if (item.spec.type === "circle-sector") {
        assert.doesNotThrow(
          () => assertAngleLabelsClearRenderedObstacles(item.spec),
          `${item.name} central angle`
        );
      }
      const svg = renderDiagramSvgForTest(item.spec);
      const constructionLines = [...svg.matchAll(/<line\b([^>]*)\/>/g)]
        .map((match) => parseAttrs(match[1]))
        .filter((attrs) => attrs.stroke === DIMENSION_COLOUR);
      assert.equal(
        constructionLines.length,
        item.constructionLines,
        `${item.name} should render only semantically necessary measurement lines`
      );
      if (item.spec.type === "circle") {
        assertCircularMeasurementLabelInside(item.spec);
      }
    }
  });

  it("uses only the required measurement lines for prisms and cylinders", () => {
    for (const item of SOLID_FAMILY_STRESS_SPECS) {
      assert.doesNotThrow(
        () => assertDimensionLabelsClearRenderedObstacles(item.spec),
        item.name
      );
      const svg = renderDiagramSvgForTest(item.spec);
      const dimensionLines = [...svg.matchAll(/<line\b([^>]*)\/>/g)]
        .map((match) => parseAttrs(match[1]))
        .filter((attrs) => attrs.stroke === DIMENSION_COLOUR);
      assert.equal(
        dimensionLines.length,
        item.dimensionLines,
        `${item.name} should render only semantically required measurement lines`
      );
      if (item.spec.type === "cylinder") {
        assertCircularMeasurementLabelInside(item.spec);
      }
    }
  });

  it("uses only semantically required lines for cones, pyramids, spheres, and nets", () => {
    for (const item of ADVANCED_SOLID_FAMILY_STRESS_SPECS) {
      assert.doesNotThrow(
        () => assertDimensionLabelsClearRenderedObstacles(item.spec),
        item.name
      );
      const svg = renderDiagramSvgForTest(item.spec);
      const dimensionLines = [...svg.matchAll(/<line\b([^>]*)\/>/g)]
        .map((match) => parseAttrs(match[1]))
        .filter((attrs) => attrs.stroke === DIMENSION_COLOUR);
      const constructionLines = dimensionLines
        .filter((attrs) => attrs["stroke-dasharray"]);
      assert.equal(
        dimensionLines.length,
        item.dimensionLines,
        `${item.name} should render only semantically required measurement lines`
      );
      assert.equal(
        constructionLines.length,
        item.constructionLines,
        `${item.name} should render only semantically required construction lines`
      );
      if (item.spec.type === "cone" || item.spec.type === "sphere") {
        assertCircularMeasurementLabelInside(item.spec);
      }
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

  it("fails closed when a quadrilateral label cannot fit inside the canvas", () => {
    assert.throws(
      () => renderDiagramSvgForTest({
        type: "trapezium",
        dimensions: { topBase: 6, bottomBase: 10, height: 4 },
        dimensionLabels: {
          topBase: "This dimension label is intentionally too long to fit safely ".repeat(8),
          bottomBase: "10 cm",
          height: "4 cm",
        },
      }),
      /trapezium diagram layout failed for topBase label/
    );
  });
});
