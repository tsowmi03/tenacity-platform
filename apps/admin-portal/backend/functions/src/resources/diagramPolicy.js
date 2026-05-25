"use strict";

const DISABLED_SHAPE_DIAGRAM_TYPES = Object.freeze([
  "right-triangle",
  "triangle",
  "rectangle",
  "parallelogram",
  "trapezium",
  "circle",
  "circle-sector",
  "elevation",
  "depression",
  "prism-rect",
  "prism-tri",
  "cylinder",
  "L-shape",
  "T-shape",
  "rect-triangle",
  "rect-semicircle",
  "annulus",
  "cone",
  "pyramid",
  "sphere",
  "net",
]);

const DISABLED_SHAPE_DIAGRAM_TYPE_SET = new Set(DISABLED_SHAPE_DIAGRAM_TYPES);

function isShapeDiagramDisabled(type) {
  return DISABLED_SHAPE_DIAGRAM_TYPE_SET.has(String(type || ""));
}

module.exports = {
  DISABLED_SHAPE_DIAGRAM_TYPES,
  isShapeDiagramDisabled,
};
