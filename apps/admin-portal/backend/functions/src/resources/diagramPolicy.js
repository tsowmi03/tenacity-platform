"use strict";

const {
  disabledDiagramTypes,
  isDiagramTypeDisabled,
} = require("./diagramRegistry");

const DISABLED_SHAPE_DIAGRAM_TYPES = Object.freeze(disabledDiagramTypes({ family: "shape" }));

function isShapeDiagramDisabled(type) {
  return isDiagramTypeDisabled(type);
}

module.exports = {
  DISABLED_SHAPE_DIAGRAM_TYPES,
  isShapeDiagramDisabled,
};
