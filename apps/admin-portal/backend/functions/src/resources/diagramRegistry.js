"use strict";

const DIAGRAM_STATUS = Object.freeze({
  STABLE: "stable",
  NEEDS_LAYOUT_CHECKS: "needs-layout-checks",
  DISABLED: "disabled",
});

const RENDERER_BACKEND = Object.freeze({
  CUSTOM_SVG: "custom-svg",
  CUSTOM_SVG_WITH_LAYOUT_ENGINE: "custom-svg-with-layout-engine",
  D3_CHART_CANDIDATE: "d3-chart-candidate",
  JSXGRAPH_CANDIDATE: "jsxgraph-candidate",
  ASYMPTOTE_CANDIDATE: "asymptote-candidate",
  NATIVE_DOCX: "native-docx",
});

const stable = DIAGRAM_STATUS.STABLE;

const customSvg = RENDERER_BACKEND.CUSTOM_SVG;
const customSvgWithLayout = RENDERER_BACKEND.CUSTOM_SVG_WITH_LAYOUT_ENGINE;
const d3ChartCandidate = RENDERER_BACKEND.D3_CHART_CANDIDATE;
const jsxGraphCandidate = RENDERER_BACKEND.JSXGRAPH_CANDIDATE;
const nativeDocx = RENDERER_BACKEND.NATIVE_DOCX;

const DIAGRAM_REGISTRY = Object.freeze({
  "number-line": {
    type: "number-line",
    family: "number",
    status: stable,
    promptVisible: true,
    rendererBackend: customSvg,
    promptExample: `{ "type": "number-line", "min": -3, "max": 5, "step": 1, "marks": [{ "value": 2, "label": "x", "open": false }] }`,
    fixture: {
      type: "number-line",
      min: -3,
      max: 5,
      step: 1,
      marks: [{ value: 2, label: "x", open: false }],
    },
  },
  "coordinate-plane": {
    type: "coordinate-plane",
    family: "coordinate",
    status: stable,
    promptVisible: true,
    rendererBackend: jsxGraphCandidate,
    promptExample: `{ "type": "coordinate-plane", "minX": -5, "maxX": 5, "minY": -5, "maxY": 5, "points": [{ "x": 2, "y": 3, "label": "A(2,3)" }] }`,
    fixture: {
      type: "coordinate-plane",
      minX: -5,
      maxX: 5,
      minY: -5,
      maxY: 5,
      points: [{ x: 2, y: 3, label: "A(2,3)" }],
    },
  },
  "function-plot": {
    type: "function-plot",
    family: "coordinate",
    status: stable,
    promptVisible: true,
    rendererBackend: jsxGraphCandidate,
    promptExample: `{ "type": "function-plot", "minX": -5, "maxX": 5, "minY": -5, "maxY": 5, "functions": [{ "type": "linear", "m": 1, "b": 2, "label": "y = x + 2" }, { "type": "quadratic", "a": 1, "b": 0, "c": -4, "label": "y = x^2 - 4" }], "points": [{ "x": 2, "y": 0, "label": "(2, 0)" }] }`,
    fixture: {
      type: "function-plot",
      minX: -5,
      maxX: 5,
      minY: -5,
      maxY: 5,
      functions: [
        { type: "linear", m: 1, b: 2, label: "y = x + 2" },
        { type: "quadratic", a: 1, b: 0, c: -4, label: "y = x^2 - 4" },
      ],
      points: [{ x: 2, y: 0, label: "(2, 0)" }],
    },
  },
  "fraction-bar": {
    type: "fraction-bar",
    family: "primary",
    status: stable,
    promptVisible: true,
    rendererBackend: customSvg,
    promptExample: `{ "type": "fraction-bar", "parts": 5, "shaded": 3, "label": "3/5" }`,
    fixture: { type: "fraction-bar", parts: 5, shaded: 3, label: "3/5" },
  },
  "pie-chart": {
    type: "pie-chart",
    family: "statistics",
    status: stable,
    promptVisible: true,
    rendererBackend: d3ChartCandidate,
    promptExample: `{ "type": "pie-chart", "slices": [{ "value": 30, "label": "A" }, { "value": 70, "label": "B" }] }`,
    fixture: {
      type: "pie-chart",
      slices: [{ value: 30, label: "A" }, { value: 70, label: "B" }],
    },
  },
  array: {
    type: "array",
    family: "primary",
    status: stable,
    promptVisible: true,
    rendererBackend: customSvg,
    promptExample: `{ "type": "array", "rows": 3, "cols": 4, "rowsLabel": "3 rows", "colsLabel": "4 columns", "label": "3 x 4" }`,
    fixture: {
      type: "array",
      rows: 3,
      cols: 4,
      rowsLabel: "3 rows",
      colsLabel: "4 columns",
      label: "3 x 4",
    },
  },
  pictograph: {
    type: "pictograph",
    family: "statistics",
    status: stable,
    promptVisible: true,
    rendererBackend: d3ChartCandidate,
    promptExample: `{ "type": "pictograph", "title": "Books read", "iconValue": 2, "key": "Each symbol = 2 books", "rows": [{ "label": "Mia", "count": 6 }, { "label": "Noah", "count": 4 }] }`,
    fixture: {
      type: "pictograph",
      title: "Books read",
      iconValue: 2,
      key: "Each symbol = 2 books",
      rows: [{ label: "Mia", count: 6 }, { label: "Noah", count: 4 }],
    },
  },
  clock: {
    type: "clock",
    family: "primary",
    status: stable,
    promptVisible: true,
    rendererBackend: customSvg,
    promptExample: `{ "type": "clock", "hour": 3, "minute": 30 }`,
    fixture: { type: "clock", hour: 3, minute: 30 },
  },
  spinner: {
    type: "spinner",
    family: "probability",
    status: stable,
    promptVisible: true,
    rendererBackend: customSvg,
    promptExample: `{ "type": "spinner", "sectors": [{ "label": "Red", "proportion": 1 }, { "label": "Blue", "proportion": 1 }] }`,
    fixture: {
      type: "spinner",
      sectors: [{ label: "Red", proportion: 1 }, { label: "Blue", proportion: 1 }],
    },
  },
  "bar-graph": {
    type: "bar-graph",
    family: "statistics",
    status: stable,
    promptVisible: true,
    rendererBackend: d3ChartCandidate,
    promptExample: `{ "type": "bar-graph", "title": "Favourite sport", "xLabel": "Sport", "yLabel": "Number of students", "data": [{ "label": "Cricket", "value": 12 }, { "label": "AFL", "value": 18 }] }`,
    fixture: {
      type: "bar-graph",
      title: "Favourite sport",
      xLabel: "Sport",
      yLabel: "Number of students",
      data: [{ label: "Cricket", value: 12 }, { label: "AFL", value: 18 }],
    },
  },
  histogram: {
    type: "histogram",
    family: "statistics",
    status: stable,
    promptVisible: true,
    rendererBackend: d3ChartCandidate,
    promptExample: `{ "type": "histogram", "title": "Test scores", "xLabel": "Score", "yLabel": "Frequency", "classes": [{ "label": "0-19", "frequency": 2 }, { "label": "20-39", "frequency": 5 }] }`,
    fixture: {
      type: "histogram",
      title: "Test scores",
      xLabel: "Score",
      yLabel: "Frequency",
      classes: [{ label: "0-19", frequency: 2 }, { label: "20-39", frequency: 5 }],
    },
  },
  "dot-plot": {
    type: "dot-plot",
    family: "statistics",
    status: stable,
    promptVisible: true,
    rendererBackend: d3ChartCandidate,
    promptExample: `{ "type": "dot-plot", "title": "Number of siblings", "data": [0, 0, 1, 1, 2, 3], "xLabel": "Siblings", "min": 0, "max": 5 }`,
    fixture: {
      type: "dot-plot",
      title: "Number of siblings",
      data: [0, 0, 1, 1, 2, 3],
      xLabel: "Siblings",
      min: 0,
      max: 5,
    },
  },
  "scatter-plot": {
    type: "scatter-plot",
    family: "statistics",
    status: stable,
    promptVisible: true,
    rendererBackend: d3ChartCandidate,
    promptExample: `{ "type": "scatter-plot", "xLabel": "Hours studied", "yLabel": "Score", "points": [{ "x": 1, "y": 55 }, { "x": 3, "y": 70 }], "lineOfBestFit": true }`,
    fixture: {
      type: "scatter-plot",
      xLabel: "Hours studied",
      yLabel: "Score",
      points: [{ x: 1, y: 55 }, { x: 3, y: 70 }, { x: 4, y: 78 }],
      lineOfBestFit: true,
    },
  },
  "box-plot": {
    type: "box-plot",
    family: "statistics",
    status: stable,
    promptVisible: true,
    rendererBackend: d3ChartCandidate,
    promptExample: `{ "type": "box-plot", "min": 4, "q1": 8, "median": 12, "q3": 15, "max": 20, "xLabel": "Scores" }`,
    fixture: { type: "box-plot", min: 4, q1: 8, median: 12, q3: 15, max: 20, xLabel: "Scores" },
  },
  "stem-and-leaf": {
    type: "stem-and-leaf",
    family: "statistics",
    status: stable,
    promptVisible: true,
    rendererBackend: customSvgWithLayout,
    promptExample: `{ "type": "stem-and-leaf", "title": "Scores", "stems": [{ "stem": "6", "leaves": [2, 5, 8] }, { "stem": "7", "leaves": [1, 4] }], "key": "6|2 = 62" }`,
    fixture: {
      type: "stem-and-leaf",
      title: "Scores",
      stems: [{ stem: "6", leaves: [2, 5, 8] }, { stem: "7", leaves: [1, 4] }],
      key: "6|2 = 62",
    },
  },
  "tree-diagram": {
    type: "tree-diagram",
    family: "probability",
    status: stable,
    promptVisible: true,
    rendererBackend: customSvgWithLayout,
    promptExample: `{ "type": "tree-diagram", "branches": [{ "label": "H", "prob": "1/2", "children": [{ "label": "H", "prob": "1/2", "outcome": "HH" }, { "label": "T", "prob": "1/2", "outcome": "HT" }] }] }`,
    fixture: {
      type: "tree-diagram",
      branches: [
        {
          label: "H",
          prob: "1/2",
          children: [
            { label: "H", prob: "1/2", outcome: "HH" },
            { label: "T", prob: "1/2", outcome: "HT" },
          ],
        },
        {
          label: "T",
          prob: "1/2",
          children: [
            { label: "H", prob: "1/2", outcome: "TH" },
            { label: "T", prob: "1/2", outcome: "TT" },
          ],
        },
      ],
    },
  },
  "venn-diagram": {
    type: "venn-diagram",
    family: "statistics",
    status: stable,
    promptVisible: true,
    rendererBackend: customSvgWithLayout,
    promptExample: `{ "type": "venn-diagram", "style": "2-set", "sets": [{ "label": "A" }, { "label": "B" }], "counts": { "A": 7, "B": 5, "AB": 3, "none": 2 } }`,
    fixture: {
      type: "venn-diagram",
      style: "2-set",
      sets: [{ label: "A" }, { label: "B" }],
      counts: { A: 7, B: 5, AB: 3, none: 2 },
    },
  },
  "parallel-lines": {
    type: "parallel-lines",
    family: "geometry",
    status: stable,
    promptVisible: true,
    rendererBackend: customSvgWithLayout,
    promptExample: `{ "type": "parallel-lines", "angles": { "top": "x degrees", "bottom": "55 degrees" }, "labels": { "line1": "l", "line2": "m", "transversal": "t" } }`,
    fixture: {
      type: "parallel-lines",
      angles: { top: "x degrees", bottom: "55 degrees" },
      labels: { line1: "l", line2: "m", transversal: "t" },
    },
  },
  angles: {
    type: "angles",
    family: "geometry",
    status: stable,
    promptVisible: true,
    rendererBackend: customSvgWithLayout,
    promptExample: `{ "type": "angles", "subtype": "on-line", "angles": [50, 70, 60], "labels": ["50 degrees", "x", "60 degrees"] }`,
    fixture: {
      type: "angles",
      subtype: "on-line",
      angles: [50, 70, 60],
      labels: ["50 degrees", "x", "60 degrees"],
    },
  },
  "two-way-table": {
    type: "two-way-table",
    family: "statistics",
    status: stable,
    promptVisible: true,
    rendererBackend: nativeDocx,
    promptExample: `{ "type": "two-way-table", "colHeader": "Preferred sport", "rowHeader": "Year group", "cols": ["Soccer", "Tennis", "Cricket"], "rows": ["Year 9", "Year 10"], "data": [[12, 8, 5], [10, 15, 7]], "totals": true }`,
    fixture: {
      type: "two-way-table",
      colHeader: "Preferred sport",
      rowHeader: "Year group",
      cols: ["Soccer", "Tennis", "Cricket"],
      rows: ["Year 9", "Year 10"],
      data: [[12, 8, 5], [10, 15, 7]],
      totals: true,
    },
  },

  "right-triangle": rightTriangleFamily({
    promptExample: `{ "type": "right-triangle", "dimensions": { "base": 8, "height": 6, "hypotenuse": 10 }, "unit": "cm" }`,
    fixture: {
      type: "right-triangle",
      dimensions: {
        base: 8,
        height: 6,
        hypotenuse: 10,
      },
      unit: "cm",
    },
  }),
  triangle: triangleFamily({
    promptExample: `{ "type": "triangle", "dimensions": { "base": 8, "leftSide": 6, "rightSide": 7 }, "unit": "cm" }`,
    fixture: {
      type: "triangle",
      dimensions: {
        base: 8,
        leftSide: 6,
        rightSide: 7,
      },
      unit: "cm",
    },
  }),
  rectangle: rectangleFamilyShape({
    type: "rectangle",
    familyDetail: "rectangle",
    promptExample: `{ "type": "rectangle", "dimensions": { "width": 12, "height": 7 }, "unit": "cm" }`,
    fixture: {
      type: "rectangle",
      dimensions: { width: 12, height: 7 },
      unit: "cm",
    },
  }),
  parallelogram: stableShape({
    type: "parallelogram",
    familyDetail: "quadrilateral",
    promptExample: `{ "type": "parallelogram", "dimensions": { "base": 10, "side": 6, "height": 4 }, "unit": "cm" }`,
    fixture: {
      type: "parallelogram",
      dimensions: { base: 10, side: 6, height: 4 },
      unit: "cm",
    },
  }),
  trapezium: stableShape({
    type: "trapezium",
    familyDetail: "quadrilateral",
    promptExample: `{ "type": "trapezium", "dimensions": { "topBase": 6, "bottomBase": 10, "height": 4 }, "unit": "cm" }`,
    fixture: {
      type: "trapezium",
      dimensions: { topBase: 6, bottomBase: 10, height: 4 },
      unit: "cm",
    },
  }),
  circle: circleFamily({
    type: "circle",
    promptExample: `{ "type": "circle", "dimensions": { "radius": 5 }, "unit": "cm" }`,
    fixture: {
      type: "circle",
      dimensions: { radius: 5 },
      unit: "cm",
    },
  }),
  "circle-sector": circleFamily({
    type: "circle-sector",
    promptExample: `{ "type": "circle-sector", "dimensions": { "radius": 6, "angle": 120 }, "unit": "cm" }`,
    fixture: {
      type: "circle-sector",
      dimensions: { radius: 6, angle: 120 },
      unit: "cm",
    },
  }),
  elevation: measurementFamily({
    type: "elevation",
    promptExample: `{ "type": "elevation", "dimensions": { "angle": 35, "distance": 50 }, "unit": "m" }`,
    fixture: {
      type: "elevation",
      dimensions: { angle: 35, distance: 50 },
      unit: "m",
    },
  }),
  depression: measurementFamily({
    type: "depression",
    promptExample: `{ "type": "depression", "dimensions": { "angle": 40, "height": 80 }, "unit": "m" }`,
    fixture: {
      type: "depression",
      dimensions: { angle: 40, height: 80 },
      unit: "m",
    },
  }),
  "prism-rect": solidFamily({
    type: "prism-rect",
    promptExample: `{ "type": "prism-rect", "dimensions": { "length": 10, "width": 5, "height": 4 }, "unit": "cm" }`,
    fixture: {
      type: "prism-rect",
      dimensions: { length: 10, width: 5, height: 4 },
      unit: "cm",
    },
  }),
  "prism-tri": solidFamily({
    type: "prism-tri",
    promptExample: `{ "type": "prism-tri", "dimensions": { "triangleBase": 8, "triangleHeight": 5, "length": 12 }, "unit": "cm" }`,
    fixture: {
      type: "prism-tri",
      dimensions: { triangleBase: 8, triangleHeight: 5, length: 12 },
      unit: "cm",
    },
  }),
  cylinder: solidFamily({
    type: "cylinder",
    promptExample: `{ "type": "cylinder", "dimensions": { "radius": 5, "height": 12 }, "unit": "cm" }`,
    fixture: {
      type: "cylinder",
      dimensions: { radius: 5, height: 12 },
      unit: "cm",
    },
  }),
  "L-shape": rectangleFamilyShape({
    type: "L-shape",
    familyDetail: "composite",
    promptExample: `{ "type": "L-shape", "dimensions": { "totalWidth": 10, "totalHeight": 8, "cutoutWidth": 5, "cutoutHeight": 4 }, "unit": "cm" }`,
    fixture: {
      type: "L-shape",
      dimensions: {
        totalWidth: 10,
        totalHeight: 8,
        cutoutWidth: 5,
        cutoutHeight: 4,
      },
      unit: "cm",
    },
  }),
  "T-shape": rectangleFamilyShape({
    type: "T-shape",
    familyDetail: "composite",
    promptExample: `{ "type": "T-shape", "dimensions": { "topWidth": 12, "topHeight": 3, "stemWidth": 4, "stemHeight": 7 }, "unit": "cm" }`,
    fixture: {
      type: "T-shape",
      dimensions: {
        topWidth: 12,
        topHeight: 3,
        stemWidth: 4,
        stemHeight: 7,
      },
      unit: "cm",
    },
  }),
  "rect-triangle": mixedShapeFamily({
    type: "rect-triangle",
    promptExample: `{ "type": "rect-triangle", "dimensions": { "width": 10, "rectangleHeight": 4, "triangleHeight": 3 }, "unit": "cm" }`,
    fixture: {
      type: "rect-triangle",
      dimensions: {
        width: 10,
        rectangleHeight: 4,
        triangleHeight: 3,
      },
      unit: "cm",
    },
  }),
  "rect-semicircle": mixedShapeFamily({
    type: "rect-semicircle",
    promptExample: `{ "type": "rect-semicircle", "dimensions": { "rectangleWidth": 8, "diameter": 6 }, "unit": "cm" }`,
    fixture: {
      type: "rect-semicircle",
      dimensions: {
        rectangleWidth: 8,
        diameter: 6,
      },
      unit: "cm",
    },
  }),
  annulus: circleFamily({
    type: "annulus",
    promptExample: `{ "type": "annulus", "dimensions": { "outerRadius": 10, "innerRadius": 6 }, "unit": "cm" }`,
    fixture: {
      type: "annulus",
      dimensions: { outerRadius: 10, innerRadius: 6 },
      unit: "cm",
    },
  }),
  cone: stableShape({
    type: "cone",
    familyDetail: "solid",
    promptExample: `{ "type": "cone", "dimensions": { "radius": 5, "height": 12 }, "unit": "cm" }`,
    fixture: {
      type: "cone",
      dimensions: { radius: 5, height: 12 },
      unit: "cm",
    },
  }),
  pyramid: stableShape({
    type: "pyramid",
    familyDetail: "solid",
    promptExample: `{ "type": "pyramid", "dimensions": { "baseLength": 8, "baseWidth": 5, "height": 10 }, "unit": "cm" }`,
    fixture: {
      type: "pyramid",
      dimensions: { baseLength: 8, baseWidth: 5, height: 10 },
      unit: "cm",
    },
  }),
  sphere: stableShape({
    type: "sphere",
    familyDetail: "solid",
    promptExample: `{ "type": "sphere", "dimensions": { "radius": 5 }, "unit": "cm" }`,
    fixture: {
      type: "sphere",
      dimensions: { radius: 5 },
      unit: "cm",
    },
  }),
  net: stableShape({
    type: "net",
    familyDetail: "net",
    promptExample: `{ "type": "net", "solid": "rectangular-prism", "dimensions": { "length": 8, "width": 5, "height": 3 }, "unit": "cm" }`,
    fixture: {
      type: "net",
      solid: "rectangular-prism",
      dimensions: { length: 8, width: 5, height: 3 },
      unit: "cm",
    },
  }),
});

function rectangleFamilyShape({ type, familyDetail, promptExample, fixture }) {
  return {
    type,
    family: "shape",
    familyDetail,
    status: stable,
    promptVisible: true,
    rendererBackend: customSvgWithLayout,
    promptExample,
    fixture,
  };
}

function mixedShapeFamily({ type, promptExample, fixture }) {
  return {
    type,
    family: "shape",
    familyDetail: "composite",
    status: stable,
    promptVisible: true,
    rendererBackend: customSvgWithLayout,
    promptExample,
    fixture,
  };
}

function rightTriangleFamily({ promptExample, fixture }) {
  return {
    type: "right-triangle",
    family: "shape",
    familyDetail: "triangle",
    status: stable,
    promptVisible: true,
    rendererBackend: customSvgWithLayout,
    promptExample,
    fixture,
  };
}

function triangleFamily({ promptExample, fixture }) {
  return {
    type: "triangle",
    family: "shape",
    familyDetail: "triangle",
    status: stable,
    promptVisible: true,
    rendererBackend: customSvgWithLayout,
    promptExample,
    fixture,
  };
}

function circleFamily({ type, promptExample, fixture }) {
  return {
    type,
    family: "shape",
    familyDetail: "circle",
    status: stable,
    promptVisible: true,
    rendererBackend: customSvgWithLayout,
    promptExample,
    fixture,
  };
}

function solidFamily({ type, promptExample, fixture }) {
  return {
    type,
    family: "shape",
    familyDetail: "solid",
    status: stable,
    promptVisible: true,
    rendererBackend: customSvgWithLayout,
    promptExample,
    fixture,
  };
}

function measurementFamily({ type, promptExample, fixture }) {
  return {
    type,
    family: "measurement",
    familyDetail: "trigonometry",
    status: stable,
    promptVisible: true,
    rendererBackend: customSvgWithLayout,
    promptExample,
    fixture,
  };
}

function stableShape({ type, familyDetail, promptExample, fixture }) {
  return {
    type,
    family: "shape",
    familyDetail,
    status: stable,
    promptVisible: true,
    rendererBackend: customSvgWithLayout,
    promptExample,
    fixture,
  };
}

function diagramEntries(opts = {}) {
  const entries = Object.values(DIAGRAM_REGISTRY);
  if (opts.includeDisabled) return entries;
  return entries.filter((entry) => entry.status !== DIAGRAM_STATUS.DISABLED);
}

function getDiagramDefinition(type) {
  return DIAGRAM_REGISTRY[String(type || "")] || null;
}

function promptVisibleDiagramEntries() {
  return diagramEntries().filter((entry) => entry.promptVisible);
}

function buildDiagramPromptExamples() {
  return promptVisibleDiagramEntries()
    .map((entry) => `- ${entry.type}: ${entry.promptExample}`)
    .join("\n");
}

function disabledDiagramTypes(opts = {}) {
  return diagramEntries({ includeDisabled: true })
    .filter((entry) => {
      if (entry.status !== DIAGRAM_STATUS.DISABLED) return false;
      if (opts.family && entry.family !== opts.family) return false;
      return true;
    })
    .map((entry) => entry.type);
}

function isDiagramTypeDisabled(type) {
  const entry = getDiagramDefinition(type);
  return Boolean(entry && entry.status === DIAGRAM_STATUS.DISABLED);
}

function isDiagramTypeSupported(type) {
  const entry = getDiagramDefinition(type);
  return Boolean(entry && entry.status !== DIAGRAM_STATUS.DISABLED);
}

function fixtureDiagramEntries(opts = {}) {
  return diagramEntries({ includeDisabled: opts.includeDisabled })
    .filter((entry) => {
      if (!entry.fixture) return false;
      if (opts.promptVisibleOnly && !entry.promptVisible) return false;
      if (opts.imageBackedOnly && entry.rendererBackend === RENDERER_BACKEND.NATIVE_DOCX) return false;
      return true;
    });
}

module.exports = {
  DIAGRAM_REGISTRY,
  DIAGRAM_STATUS,
  RENDERER_BACKEND,
  buildDiagramPromptExamples,
  diagramEntries,
  disabledDiagramTypes,
  fixtureDiagramEntries,
  getDiagramDefinition,
  isDiagramTypeDisabled,
  isDiagramTypeSupported,
  promptVisibleDiagramEntries,
};
