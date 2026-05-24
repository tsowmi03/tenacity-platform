"use strict";

const GLOBAL_RULES = `You are generating educational resources for Tenacity Tutoring, a Sydney-based tutoring centre.
All content must follow the NSW curriculum for the specified year level.
Write in Australian English (programme, practise (verb), colour, organise, maths).
Return ONLY valid JSON. No preamble, no explanation, no markdown code fences.
All question stems and explanations must be clear and unambiguous.
Do not include answers inline with questions - place all answers in the designated answers section.`;

const DIAGRAM_INSTRUCTIONS = `For geometry, trigonometry, measurement, graphing, statistics, probability, and applied questions that need a visual, include an optional "diagram" object on the question. If only one sub-part needs a visual, put "diagram" on that part instead. Use null when no diagram is needed.

Supported diagram types and examples:
- right-triangle: { "type": "right-triangle", "vertices": ["A","B","C"], "rightAngle": "B", "sides": { "AB": "5 cm", "BC": "12 cm", "AC": "13 cm" }, "angleLabel": { "A": "theta" } }
- triangle: { "type": "triangle", "vertices": ["P","Q","R"], "sides": { "PQ": "8 cm", "QR": "10 cm" }, "angles": { "Q": "65 degrees" } }
- rectangle: { "type": "rectangle", "dimWidth": "12 cm", "dimHeight": "7 cm", "labels": { "vertices": ["A","B","C","D"] } }
- parallelogram: { "type": "parallelogram", "base": "10 cm", "height_label": "6 cm", "side": "8 cm" }
- trapezium: { "type": "trapezium", "topBase": "6 cm", "bottomBase": "12 cm", "dimHeight": "5 cm" }
- circle: { "type": "circle", "radius": "7 cm" }
- circle-sector: { "type": "circle-sector", "radius": "8 cm", "sectorAngle": "120" }
- elevation: { "type": "elevation", "height": "45 m", "distance": "60 m", "angle": "37 degrees", "objectLabel": "Tower", "observerLabel": "Observer" }
- depression: { "type": "depression", "height": "30 m", "distance": "50 m", "angle": "25 degrees", "objectLabel": "Boat", "observerLabel": "Cliff" }
- prism-rect: { "type": "prism-rect", "dimLength": "10 cm", "dimWidth": "6 cm", "dimHeight": "4 cm" }
- prism-tri: { "type": "prism-tri", "base": "8 cm", "dimHeight": "6 cm", "length": "12 cm" }
- cylinder: { "type": "cylinder", "radius": "5 cm", "dimHeight": "12 cm" }
- parallel-lines: { "type": "parallel-lines", "angles": { "top": "x degrees", "bottom": "55 degrees" }, "labels": { "line1": "l", "line2": "m", "transversal": "t" } }
- number-line: { "type": "number-line", "min": -3, "max": 5, "step": 1, "marks": [{ "value": 2, "label": "x", "open": false }] }
- coordinate-plane: { "type": "coordinate-plane", "minX": -5, "maxX": 5, "minY": -5, "maxY": 5, "points": [{ "x": 2, "y": 3, "label": "A(2,3)" }] }
- L-shape: { "type": "L-shape", "dimensions": { "totalW": 10, "totalH": 8, "cutW": 5, "cutH": 4 }, "dimLabels": { "totalW": "10 cm", "totalH": "8 cm", "cutW": "5 cm", "cutH": "4 cm" } }
- T-shape: { "type": "T-shape", "dimensions": { "topW": 12, "topH": 3, "stemW": 4, "stemH": 7 }, "dimLabels": { "topW": "12 cm", "topH": "3 cm", "stemW": "4 cm", "stemH": "7 cm" } }
- rect-triangle: { "type": "rect-triangle", "dimLabels": { "width": "12 cm", "height": "8 cm", "diagonal": "x" } }
- rect-semicircle: { "type": "rect-semicircle", "dimLabels": { "width": "12 cm", "height": "8 cm" } }
- annulus: { "type": "annulus", "outerRadius": "10 cm", "innerRadius": "5 cm" }
- cone: { "type": "cone", "radius": "5 cm", "height": "12 cm", "slant": "13 cm" }
- pyramid: { "type": "pyramid", "base": "8 cm", "height": "10 cm", "slant": "12 cm" }
- sphere: { "type": "sphere", "radius": "7 cm" }
- net: { "type": "net", "shape": "cube", "side": "4 cm" }
- function-plot: { "type": "function-plot", "minX": -5, "maxX": 5, "minY": -5, "maxY": 5, "functions": [{ "type": "linear", "m": 1, "b": 2, "label": "y = x + 2" }, { "type": "quadratic", "a": 1, "b": 0, "c": -4, "label": "y = x^2 - 4" }], "points": [{ "x": 2, "y": 0, "label": "(2, 0)" }] }
- fraction-bar: { "type": "fraction-bar", "parts": 5, "shaded": 3, "label": "3/5" }
- pie-chart: { "type": "pie-chart", "slices": [{ "value": 30, "label": "A" }, { "value": 70, "label": "B" }] }
- array: { "type": "array", "rows": 3, "cols": 4, "rowsLabel": "3 rows", "colsLabel": "4 columns", "label": "3 x 4" }
- pictograph: { "type": "pictograph", "title": "Books read", "iconValue": 2, "key": "Each symbol = 2 books", "rows": [{ "label": "Mia", "count": 6 }, { "label": "Noah", "count": 4 }] }
- clock: { "type": "clock", "hour": 3, "minute": 30 }
- spinner: { "type": "spinner", "sectors": [{ "label": "Red", "proportion": 1 }, { "label": "Blue", "proportion": 1 }] }
- bar-graph: { "type": "bar-graph", "title": "Favourite sport", "xLabel": "Sport", "yLabel": "Number of students", "data": [{ "label": "Cricket", "value": 12 }, { "label": "AFL", "value": 18 }] }
- histogram: { "type": "histogram", "title": "Test scores", "xLabel": "Score", "yLabel": "Frequency", "classes": [{ "label": "0-19", "frequency": 2 }, { "label": "20-39", "frequency": 5 }] }
- dot-plot: { "type": "dot-plot", "title": "Number of siblings", "data": [0, 0, 1, 1, 2, 3], "xLabel": "Siblings", "min": 0, "max": 5 }
- scatter-plot: { "type": "scatter-plot", "xLabel": "Hours studied", "yLabel": "Score", "points": [{ "x": 1, "y": 55 }, { "x": 3, "y": 70 }], "lineOfBestFit": true }
- box-plot: { "type": "box-plot", "min": 4, "q1": 8, "median": 12, "q3": 15, "max": 20, "xLabel": "Scores" }
- stem-and-leaf: { "type": "stem-and-leaf", "title": "Scores", "stems": [{ "stem": "6", "leaves": [2, 5, 8] }, { "stem": "7", "leaves": [1, 4] }], "key": "6|2 = 62" }
- tree-diagram: { "type": "tree-diagram", "branches": [{ "label": "H", "prob": "1/2", "children": [{ "label": "H", "prob": "1/2", "outcome": "HH" }, { "label": "T", "prob": "1/2", "outcome": "HT" }] }] }
- venn-diagram: { "type": "venn-diagram", "style": "2-set", "sets": [{ "label": "A" }, { "label": "B" }], "counts": { "A": 7, "B": 5, "AB": 3, "none": 2 } }
- angles: { "type": "angles", "subtype": "on-line", "angles": [50, 70, 60], "labels": ["50 degrees", "x", "60 degrees"] }
- two-way-table: { "type": "two-way-table", "colHeader": "Preferred sport", "rowHeader": "Year group", "cols": ["Soccer", "Tennis", "Cricket"], "rows": ["Year 9", "Year 10"], "data": [[12, 8, 5], [10, 15, 7]], "totals": true }

Use diagrams only where they improve the question. Pure algebra and pure number questions usually do not need diagrams. For function plots, always plot the function referenced by the question and use coordinate-pair labels only for marked points.`;

const SYSTEM_PROMPT_BUILDERS = {
  worksheet: ({ year, subject }) => `${GLOBAL_RULES}

You are generating a worksheet for a Year ${year} ${subject} student.
Focus on a single topic or skill. Generate 8-12 questions increasing in difficulty.
Do not include lengthy explanations - this is practice, not instruction.

${DIAGRAM_INSTRUCTIONS}

Return JSON matching this schema exactly:
{
  "title": string,
  "subject": string,
  "year": number,
  "topic": string,
  "totalMarks": number,
  "questions": [
    {
      "number": number,
      "stem": string,
      "marks": number,
      "workingLines": number,
      "diagram": null | object,
      "parts": null | [{ "label": string, "stem": string, "marks": number, "workingLines": number, "diagram": null | object }]
    }
  ],
  "answers": [
    { "questionNumber": number, "partLabel": null | string, "answer": string }
  ]
}`,
};

function buildSystemPrompt(resourceType, { year, subject } = {}) {
  const builder = SYSTEM_PROMPT_BUILDERS[resourceType];
  if (!builder) {
    throw new Error(`Unsupported system prompt resource type: ${resourceType}`);
  }
  if (!year) throw new TypeError("buildSystemPrompt requires year");
  if (!subject) throw new TypeError("buildSystemPrompt requires subject");
  return builder({ year, subject });
}

function buildUserMessage(job, uploadedContent) {
  const parts = [];

  if (uploadedContent) {
    parts.push(`REFERENCE DOCUMENT (${job.uploadedFileName || "uploaded file"}):\n\n${uploadedContent}`);
  }

  if (job.customPrompt) {
    parts.push(`TUTOR INSTRUCTIONS:\n\n${job.customPrompt}`);
  }

  parts.push(
    `Generate a ${String(job.resourceType || "resource").replace(/-/g, " ")} for a Year ${job.year} ${job.subject} student.`
  );

  return parts.join("\n\n---\n\n");
}

module.exports = {
  GLOBAL_RULES,
  SYSTEM_PROMPT_BUILDERS,
  buildSystemPrompt,
  buildUserMessage,
};
