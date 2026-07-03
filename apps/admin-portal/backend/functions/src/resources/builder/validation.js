"use strict";

const { cleanText } = require("./shared");
const { attachDiagramContext } = require("./diagrams");
const {
  DIAGRAM_STATUS,
  getDiagramDefinition,
} = require("../diagramRegistry");

class ResourceValidationError extends TypeError {
  constructor(message) {
    super(`Invalid resource JSON: ${message}`);
    this.name = "ResourceValidationError";
  }
}

function fail(message) {
  throw new ResourceValidationError(message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertObject(value, path) {
  if (!isPlainObject(value)) fail(`${path} must be an object`);
  return value;
}

function assertArray(value, path, opts = {}) {
  if (!Array.isArray(value)) fail(`${path} must be an array`);
  if (opts.min !== undefined && value.length < opts.min) {
    fail(`${path} must contain at least ${opts.min} item${opts.min === 1 ? "" : "s"}`);
  }
  return value;
}

function optionalArray(value, path) {
  if (value === null || value === undefined) return [];
  return assertArray(value, path);
}

function assertText(value, path, opts = {}) {
  if (typeof value !== "string") fail(`${path} must be a string`);
  const text = cleanText(value);
  if (opts.required !== false && !text) fail(`${path} must not be empty`);
  return text;
}

function optionalText(value, path) {
  if (value === null || value === undefined) return "";
  return assertText(value, path, { required: false });
}

function assertNumber(value, path, opts = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${path} must be a finite number`);
  if (opts.integer && !Number.isInteger(value)) fail(`${path} must be an integer`);
  if (opts.min !== undefined && value < opts.min) fail(`${path} must be at least ${opts.min}`);
  return value;
}

function optionalNumber(value, path, opts = {}) {
  if (value === null || value === undefined) return null;
  return assertNumber(value, path, opts);
}

function assertStringArray(value, path, opts = {}) {
  const rows = assertArray(value, path, opts);
  rows.forEach((item, index) => assertText(item, `${path}[${index}]`));
  return rows;
}

function optionalStringArray(value, path) {
  if (value === null || value === undefined) return [];
  return assertStringArray(value, path);
}

/**
 * Tolerant validator for the suggestion-system "topics" array. This field is
 * search metadata, not rendered content, so it must NEVER fail a (costly)
 * generation: malformed input is silently coerced to a clean string array.
 */
function optionalTopics(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.trim());
}

function validateBaseResource(resource, label) {
  assertObject(resource, label);
  assertText(resource.title, `${label}.title`);
  assertText(resource.subject, `${label}.subject`);
  assertNumber(resource.year, `${label}.year`, { integer: true, min: 1 });
}

// An optional reading-stimulus booklet shared by the English resource types.
// Each text needs a title and body; other fields are presentational and
// tolerated when absent, so a sourcing/generation edge case never fails the job.
function optionalStimulus(value, path) {
  if (value === undefined || value === null) return;
  assertArray(value, path).forEach((text, index) => {
    assertObject(text, `${path}[${index}]`);
    assertText(text.title, `${path}[${index}].title`);
    assertText(text.body, `${path}[${index}].body`);
  });
}

function assertBoolean(value, path) {
  if (typeof value !== "boolean") fail(`${path} must be a boolean`);
  return value;
}

function optionalBoolean(value, path) {
  if (value === null || value === undefined) return null;
  return assertBoolean(value, path);
}

function optionalTextField(value, path) {
  if (value === null || value === undefined) return "";
  return assertText(value, path, { required: false });
}

function optionalNumberField(value, path, opts = {}) {
  if (value === null || value === undefined) return null;
  return assertNumber(value, path, opts);
}

function assertEnum(value, path, allowed) {
  const text = assertText(value, path);
  if (!allowed.includes(text)) fail(`${path} must be one of: ${allowed.join(", ")}`);
  return text;
}

function optionalEnum(value, path, allowed) {
  if (value === null || value === undefined) return null;
  return assertEnum(value, path, allowed);
}

function assertAllowedFields(value, path, allowed, opts = {}) {
  const allowedSet = new Set(allowed);
  const layoutControlFields = new Set([
    "_cw",
    "_ch",
    "canvasWidth",
    "canvasHeight",
    "height",
    "layout",
    "path",
    "paths",
    "position",
    "positions",
    "scale",
    "svg",
    "transform",
    "viewBox",
    "width",
    "x",
    "y",
  ]);

  Object.keys(value).forEach((key) => {
    if (opts.forbidLayoutFields && layoutControlFields.has(key)) {
      fail(`${path}.${key} is not allowed; diagram layout is controlled by the renderer`);
    }
    if (!allowedSet.has(key)) {
      fail(`${path}.${key} is not supported for ${value.type || "this"} diagrams`);
    }
  });
}

function assertNumberPair(value, path) {
  const pair = assertArray(value, path);
  if (pair.length !== 2) fail(`${path} must contain exactly 2 numbers`);
  assertNumber(pair[0], `${path}[0]`);
  assertNumber(pair[1], `${path}[1]`);
}

function assertNumberArray(value, path, opts = {}) {
  assertArray(value, path, opts).forEach((item, index) => {
    assertNumber(item, `${path}[${index}]`, opts.item || {});
  });
}

function assertTextOrNumberArray(value, path, opts = {}) {
  assertArray(value, path, opts).forEach((item, index) => {
    if (typeof item !== "string" && typeof item !== "number") {
      fail(`${path}[${index}] must be a string or number`);
    }
  });
}

function validateTextRecord(value, path, allowedFields) {
  const record = assertObject(value, path);
  assertAllowedFields(record, path, allowedFields);
  allowedFields.forEach((field) => optionalTextField(record[field], `${path}.${field}`));
}

function validatePointObject(value, path) {
  const point = assertObject(value, path);
  assertAllowedFields(point, path, ["x", "y", "label"]);
  assertNumber(point.x, `${path}.x`);
  assertNumber(point.y, `${path}.y`);
  optionalTextField(point.label, `${path}.label`);
}

function validatePointOrPair(value, path) {
  if (Array.isArray(value)) {
    assertNumberPair(value, path);
    return;
  }
  validatePointObject(value, path);
}

function validateNumberLineDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "min", "max", "step", "marks"], { forbidLayoutFields: true });
  optionalNumberField(value.min, `${path}.min`);
  optionalNumberField(value.max, `${path}.max`);
  optionalNumberField(value.step, `${path}.step`, { min: 0.000001 });
  if (value.min !== undefined && value.max !== undefined && value.max <= value.min) {
    fail(`${path}.max must be greater than ${path}.min`);
  }
  optionalArray(value.marks, `${path}.marks`).forEach((mark, index) => {
    const markPath = `${path}.marks[${index}]`;
    assertObject(mark, markPath);
    assertAllowedFields(mark, markPath, ["value", "label", "open"]);
    assertNumber(mark.value, `${markPath}.value`);
    optionalTextField(mark.label, `${markPath}.label`);
    optionalBoolean(mark.open, `${markPath}.open`);
  });
}

function validateCoordinatePlaneDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "minX", "maxX", "minY", "maxY", "points"], { forbidLayoutFields: true });
  ["minX", "maxX", "minY", "maxY"].forEach((field) => optionalNumberField(value[field], `${path}.${field}`));
  if (value.minX !== undefined && value.maxX !== undefined && value.maxX <= value.minX) fail(`${path}.maxX must be greater than ${path}.minX`);
  if (value.minY !== undefined && value.maxY !== undefined && value.maxY <= value.minY) fail(`${path}.maxY must be greater than ${path}.minY`);
  optionalArray(value.points, `${path}.points`).forEach((point, index) => validatePointObject(point, `${path}.points[${index}]`));
}

function validateFunctionPlotDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "minX", "maxX", "minY", "maxY", "functions", "points", "asymptotes", "showGrid"], { forbidLayoutFields: true });
  ["minX", "maxX", "minY", "maxY"].forEach((field) => optionalNumberField(value[field], `${path}.${field}`));
  if (value.minX !== undefined && value.maxX !== undefined && value.maxX <= value.minX) fail(`${path}.maxX must be greater than ${path}.minX`);
  if (value.minY !== undefined && value.maxY !== undefined && value.maxY <= value.minY) fail(`${path}.maxY must be greater than ${path}.minY`);
  optionalBoolean(value.showGrid, `${path}.showGrid`);

  assertArray(value.functions, `${path}.functions`, { min: 1 }).forEach((fn, index) => {
    const fnPath = `${path}.functions[${index}]`;
    assertObject(fn, fnPath);
    assertAllowedFields(fn, fnPath, ["type", "m", "b", "a", "c", "d", "h", "k", "r", "coefficients", "expr", "label", "color", "style", "domain", "samples"]);
    assertEnum(fn.type, `${fnPath}.type`, ["linear", "quadratic", "cubic", "polynomial", "hyperbola", "exponential", "logarithmic", "sqrt", "abs", "expression", "circle"]);
    ["m", "b", "a", "c", "d", "h", "k", "r"].forEach((field) => optionalNumberField(fn[field], `${fnPath}.${field}`));
    optionalTextField(fn.expr, `${fnPath}.expr`);
    optionalTextField(fn.label, `${fnPath}.label`);
    optionalTextField(fn.color, `${fnPath}.color`);
    optionalEnum(fn.style, `${fnPath}.style`, ["dashed"]);
    if (fn.coefficients !== undefined && fn.coefficients !== null) assertNumberArray(fn.coefficients, `${fnPath}.coefficients`, { min: 1 });
    if (fn.domain !== undefined && fn.domain !== null) {
      assertNumberPair(fn.domain, `${fnPath}.domain`);
      if (fn.domain[1] <= fn.domain[0]) fail(`${fnPath}.domain[1] must be greater than ${fnPath}.domain[0]`);
    }
    optionalNumberField(fn.samples, `${fnPath}.samples`, { integer: true, min: 2 });
  });

  optionalArray(value.points, `${path}.points`).forEach((point, index) => validatePointObject(point, `${path}.points[${index}]`));
  optionalArray(value.asymptotes, `${path}.asymptotes`).forEach((asymptote, index) => {
    const asymptotePath = `${path}.asymptotes[${index}]`;
    assertObject(asymptote, asymptotePath);
    assertAllowedFields(asymptote, asymptotePath, ["type", "value", "label"]);
    assertEnum(asymptote.type, `${asymptotePath}.type`, ["vertical", "horizontal"]);
    assertNumber(asymptote.value, `${asymptotePath}.value`);
    if (asymptote.label !== false) optionalTextField(asymptote.label, `${asymptotePath}.label`);
  });
}

function validateFractionBarDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "parts", "shaded", "label", "bars"], { forbidLayoutFields: true });
  const bars = value.bars === undefined || value.bars === null
    ? [{ parts: value.parts, shaded: value.shaded, label: value.label }]
    : assertArray(value.bars, `${path}.bars`, { min: 1 });

  bars.forEach((bar, index) => {
    const barPath = value.bars ? `${path}.bars[${index}]` : path;
    assertObject(bar, barPath);
    assertAllowedFields(bar, barPath, ["parts", "shaded", "label"]);
    assertNumber(bar.parts, `${barPath}.parts`, { integer: true, min: 1 });
    optionalNumberField(bar.shaded, `${barPath}.shaded`, { min: 0 });
    optionalTextField(bar.label, `${barPath}.label`);
    if (bar.shaded !== undefined && bar.shaded > bar.parts) fail(`${barPath}.shaded must be less than or equal to ${barPath}.parts`);
  });
}

function validatePieChartDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "slices"], { forbidLayoutFields: true });
  let total = 0;
  assertArray(value.slices, `${path}.slices`, { min: 1 }).forEach((slice, index) => {
    const slicePath = `${path}.slices[${index}]`;
    assertObject(slice, slicePath);
    assertAllowedFields(slice, slicePath, ["value", "label", "color"]);
    total += assertNumber(slice.value, `${slicePath}.value`, { min: 0 });
    optionalTextField(slice.label, `${slicePath}.label`);
    optionalTextField(slice.color, `${slicePath}.color`);
  });
  if (total <= 0) fail(`${path}.slices must contain at least one positive value`);
}

function validateArrayDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "rows", "cols", "rowsLabel", "colsLabel", "label"], { forbidLayoutFields: true });
  assertNumber(value.rows, `${path}.rows`, { integer: true, min: 1 });
  assertNumber(value.cols, `${path}.cols`, { integer: true, min: 1 });
  optionalTextField(value.rowsLabel, `${path}.rowsLabel`);
  optionalTextField(value.colsLabel, `${path}.colsLabel`);
  optionalTextField(value.label, `${path}.label`);
}

function validatePictographDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "title", "iconValue", "key", "rows"], { forbidLayoutFields: true });
  optionalTextField(value.title, `${path}.title`);
  assertNumber(value.iconValue, `${path}.iconValue`, { min: 0.000001 });
  optionalTextField(value.key, `${path}.key`);
  assertArray(value.rows, `${path}.rows`, { min: 1 }).forEach((row, index) => {
    const rowPath = `${path}.rows[${index}]`;
    assertObject(row, rowPath);
    assertAllowedFields(row, rowPath, ["label", "count"]);
    assertText(row.label, `${rowPath}.label`);
    assertNumber(row.count, `${rowPath}.count`, { min: 0 });
  });
}

function validateClockDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "hour", "minute"], { forbidLayoutFields: true });
  assertNumber(value.hour, `${path}.hour`, { integer: true, min: 0 });
  assertNumber(value.minute, `${path}.minute`, { integer: true, min: 0 });
  if (value.minute > 59) fail(`${path}.minute must be at most 59`);
}

function validateSpinnerDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "sectors"], { forbidLayoutFields: true });
  assertArray(value.sectors, `${path}.sectors`, { min: 1 }).forEach((sector, index) => {
    const sectorPath = `${path}.sectors[${index}]`;
    assertObject(sector, sectorPath);
    assertAllowedFields(sector, sectorPath, ["label", "proportion", "color"]);
    optionalTextField(sector.label, `${sectorPath}.label`);
    optionalNumberField(sector.proportion, `${sectorPath}.proportion`, { min: 0.000001 });
    optionalTextField(sector.color, `${sectorPath}.color`);
  });
}

function validateBarGraphDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "title", "xLabel", "yLabel", "data", "showValues", "yMax", "yTicks"], { forbidLayoutFields: true });
  optionalTextField(value.title, `${path}.title`);
  optionalTextField(value.xLabel, `${path}.xLabel`);
  optionalTextField(value.yLabel, `${path}.yLabel`);
  optionalBoolean(value.showValues, `${path}.showValues`);
  optionalNumberField(value.yMax, `${path}.yMax`, { min: 0.000001 });
  optionalNumberField(value.yTicks, `${path}.yTicks`, { integer: true, min: 1 });
  assertArray(value.data, `${path}.data`, { min: 1 }).forEach((item, index) => {
    const itemPath = `${path}.data[${index}]`;
    assertObject(item, itemPath);
    assertAllowedFields(item, itemPath, ["label", "value", "color"]);
    assertText(item.label, `${itemPath}.label`);
    assertNumber(item.value, `${itemPath}.value`, { min: 0 });
    optionalTextField(item.color, `${itemPath}.color`);
  });
}

function validateHistogramDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "title", "xLabel", "yLabel", "classes", "bins", "showValues", "yMax", "yTicks"], { forbidLayoutFields: true });
  optionalTextField(value.title, `${path}.title`);
  optionalTextField(value.xLabel, `${path}.xLabel`);
  optionalTextField(value.yLabel, `${path}.yLabel`);
  optionalBoolean(value.showValues, `${path}.showValues`);
  optionalNumberField(value.yMax, `${path}.yMax`, { min: 0.000001 });
  optionalNumberField(value.yTicks, `${path}.yTicks`, { integer: true, min: 1 });

  if (value.classes !== undefined && value.classes !== null) {
    assertArray(value.classes, `${path}.classes`, { min: 1 }).forEach((item, index) => {
      const itemPath = `${path}.classes[${index}]`;
      assertObject(item, itemPath);
      assertAllowedFields(item, itemPath, ["label", "frequency"]);
      assertText(item.label, `${itemPath}.label`);
      assertNumber(item.frequency, `${itemPath}.frequency`, { min: 0 });
    });
    return;
  }

  assertArray(value.bins, `${path}.bins`, { min: 1 }).forEach((item, index) => {
    const itemPath = `${path}.bins[${index}]`;
    assertObject(item, itemPath);
    assertAllowedFields(item, itemPath, ["label", "min", "max", "count"]);
    optionalTextField(item.label, `${itemPath}.label`);
    optionalNumberField(item.min, `${itemPath}.min`);
    optionalNumberField(item.max, `${itemPath}.max`);
    assertNumber(item.count, `${itemPath}.count`, { min: 0 });
    if (item.min !== undefined && item.max !== undefined && item.max <= item.min) {
      fail(`${itemPath}.max must be greater than ${itemPath}.min`);
    }
  });
}

function validateDotPlotDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "title", "data", "counts", "xLabel", "min", "max", "step"], { forbidLayoutFields: true });
  optionalTextField(value.title, `${path}.title`);
  optionalTextField(value.xLabel, `${path}.xLabel`);
  optionalNumberField(value.min, `${path}.min`);
  optionalNumberField(value.max, `${path}.max`);
  optionalNumberField(value.step, `${path}.step`, { min: 0.000001 });
  if (value.min !== undefined && value.max !== undefined && value.max <= value.min) fail(`${path}.max must be greater than ${path}.min`);
  if (value.data === undefined && value.counts === undefined) fail(`${path}.data or ${path}.counts is required`);
  if (value.data !== undefined && value.data !== null) assertNumberArray(value.data, `${path}.data`, { min: 1 });
  if (value.counts !== undefined && value.counts !== null) {
    const counts = assertObject(value.counts, `${path}.counts`);
    Object.entries(counts).forEach(([key, count]) => {
      if (!Number.isFinite(Number(key))) fail(`${path}.counts keys must be numeric`);
      assertNumber(count, `${path}.counts.${key}`, { integer: true, min: 0 });
    });
  }
}

function validateBoxPlotDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "min", "q1", "median", "q3", "max", "label", "plots", "xLabel", "xMin", "xMax"], { forbidLayoutFields: true });
  optionalTextField(value.xLabel, `${path}.xLabel`);
  optionalNumberField(value.xMin, `${path}.xMin`);
  optionalNumberField(value.xMax, `${path}.xMax`);
  if (value.xMin !== undefined && value.xMax !== undefined && value.xMax <= value.xMin) fail(`${path}.xMax must be greater than ${path}.xMin`);
  const plots = value.plots === undefined || value.plots === null
    ? [{ min: value.min, q1: value.q1, median: value.median, q3: value.q3, max: value.max, label: value.label }]
    : assertArray(value.plots, `${path}.plots`, { min: 1 });
  plots.forEach((plot, index) => {
    const plotPath = value.plots ? `${path}.plots[${index}]` : path;
    assertObject(plot, plotPath);
    assertAllowedFields(plot, plotPath, ["min", "q1", "median", "q3", "max", "label"]);
    const min = assertNumber(plot.min, `${plotPath}.min`);
    const q1 = assertNumber(plot.q1, `${plotPath}.q1`);
    const median = assertNumber(plot.median, `${plotPath}.median`);
    const q3 = assertNumber(plot.q3, `${plotPath}.q3`);
    const max = assertNumber(plot.max, `${plotPath}.max`);
    optionalTextField(plot.label, `${plotPath}.label`);
    if (!(min <= q1 && q1 <= median && median <= q3 && q3 <= max)) {
      fail(`${plotPath} values must be ordered min <= q1 <= median <= q3 <= max`);
    }
  });
}

function validateScatterPlotDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "xLabel", "yLabel", "points", "lineOfBestFit", "xMin", "xMax", "yMin", "yMax"], { forbidLayoutFields: true });
  optionalTextField(value.xLabel, `${path}.xLabel`);
  optionalTextField(value.yLabel, `${path}.yLabel`);
  ["xMin", "xMax", "yMin", "yMax"].forEach((field) => optionalNumberField(value[field], `${path}.${field}`));
  if (value.xMin !== undefined && value.xMax !== undefined && value.xMax <= value.xMin) fail(`${path}.xMax must be greater than ${path}.xMin`);
  if (value.yMin !== undefined && value.yMax !== undefined && value.yMax <= value.yMin) fail(`${path}.yMax must be greater than ${path}.yMin`);
  assertArray(value.points, `${path}.points`, { min: 2 }).forEach((point, index) => validatePointOrPair(point, `${path}.points[${index}]`));
  if (value.lineOfBestFit !== undefined && value.lineOfBestFit !== null) {
    if (typeof value.lineOfBestFit === "boolean") return;
    const line = assertObject(value.lineOfBestFit, `${path}.lineOfBestFit`);
    assertAllowedFields(line, `${path}.lineOfBestFit`, ["m", "c"]);
    assertNumber(line.m, `${path}.lineOfBestFit.m`);
    optionalNumberField(line.c, `${path}.lineOfBestFit.c`);
  }
}

function validateStemAndLeafDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "title", "stems", "key"], { forbidLayoutFields: true });
  optionalTextField(value.title, `${path}.title`);
  optionalTextField(value.key, `${path}.key`);
  assertArray(value.stems, `${path}.stems`, { min: 1 }).forEach((row, index) => {
    const rowPath = `${path}.stems[${index}]`;
    assertObject(row, rowPath);
    assertAllowedFields(row, rowPath, ["stem", "leaves"]);
    if (typeof row.stem !== "string" && typeof row.stem !== "number") fail(`${rowPath}.stem must be a string or number`);
    assertNumberArray(row.leaves, `${rowPath}.leaves`, { min: 1, item: { integer: true } });
  });
}

function validateTreeNode(node, path) {
  assertObject(node, path);
  assertAllowedFields(node, path, ["label", "prob", "outcome", "children"]);
  optionalTextField(node.label, `${path}.label`);
  optionalTextField(node.prob, `${path}.prob`);
  optionalTextField(node.outcome, `${path}.outcome`);
  optionalArray(node.children, `${path}.children`).forEach((child, index) => validateTreeNode(child, `${path}.children[${index}]`));
}

function validateTreeDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "branches", "rootLabel"], { forbidLayoutFields: true });
  optionalTextField(value.rootLabel, `${path}.rootLabel`);
  assertArray(value.branches, `${path}.branches`, { min: 1 }).forEach((branch, index) => validateTreeNode(branch, `${path}.branches[${index}]`));
}

function validateVennDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "style", "sets", "counts", "universal", "universalLabel"], { forbidLayoutFields: true });
  const sets = assertArray(value.sets, `${path}.sets`, { min: 2 });
  const inferredStyle = sets.length === 3 ? "3-set" : "2-set";
  const style = optionalEnum(value.style, `${path}.style`, ["2-set", "3-set"]) || inferredStyle;
  const expectedSets = style === "3-set" ? 3 : 2;
  if (sets.length !== expectedSets) fail(`${path}.sets must contain exactly ${expectedSets} sets for ${style}`);
  sets.forEach((set, index) => {
    const setPath = `${path}.sets[${index}]`;
    assertObject(set, setPath);
    assertAllowedFields(set, setPath, ["label"]);
    assertText(set.label, `${setPath}.label`);
  });
  const counts = assertObject(value.counts, `${path}.counts`);
  Object.entries(counts).forEach(([key, count]) => {
    if (typeof count !== "string" && typeof count !== "number") fail(`${path}.counts.${key} must be a string or number`);
  });
  optionalBoolean(value.universal, `${path}.universal`);
  optionalTextField(value.universalLabel, `${path}.universalLabel`);
}

function validateParallelLinesDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "angles", "labels"], { forbidLayoutFields: true });
  validateTextRecord(value.angles || {}, `${path}.angles`, ["top", "bottom"]);
  validateTextRecord(value.labels || {}, `${path}.labels`, ["line1", "line2", "transversal"]);
}

function validateAnglesDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "subtype", "angle", "angles", "labels", "label", "vertexLabel", "armLabels"], { forbidLayoutFields: true });
  const subtype = optionalEnum(value.subtype, `${path}.subtype`, ["single", "on-line", "at-point", "vertically-opposite"]) || "single";
  if (subtype === "single") {
    optionalNumberField(value.angle, `${path}.angle`, { min: 0.000001 });
    if (value.angle !== undefined && value.angle >= 180) fail(`${path}.angle must be less than 180`);
    optionalTextField(value.label, `${path}.label`);
    optionalTextField(value.vertexLabel, `${path}.vertexLabel`);
    if (value.armLabels !== undefined && value.armLabels !== null) assertStringArray(value.armLabels, `${path}.armLabels`);
    return;
  }
  if (subtype === "vertically-opposite") {
    optionalNumberField(value.angle, `${path}.angle`, { min: 0.000001 });
    if (value.angle !== undefined && value.angle >= 180) fail(`${path}.angle must be less than 180`);
    if (value.labels !== undefined && value.labels !== null) assertTextOrNumberArray(value.labels, `${path}.labels`);
    return;
  }
  const angles = assertArray(value.angles, `${path}.angles`, { min: 2 });
  let sum = 0;
  angles.forEach((angle, index) => {
    sum += assertNumber(angle, `${path}.angles[${index}]`, { min: 0.000001 });
  });
  const expectedSum = subtype === "at-point" ? 360 : 180;
  if (Math.abs(sum - expectedSum) > 0.001) fail(`${path}.angles must sum to ${expectedSum}`);
  if (value.labels !== undefined && value.labels !== null) {
    const labels = assertArray(value.labels, `${path}.labels`);
    if (labels.length !== angles.length) fail(`${path}.labels must have the same length as ${path}.angles`);
    labels.forEach((label, index) => {
      if (typeof label !== "string" && typeof label !== "number") fail(`${path}.labels[${index}] must be a string or number`);
    });
  }
}

function validateTwoWayTableDiagram(value, path) {
  assertAllowedFields(value, path, ["type", "colHeader", "rowHeader", "cols", "rows", "data", "totals"], { forbidLayoutFields: true });
  optionalTextField(value.colHeader, `${path}.colHeader`);
  optionalTextField(value.rowHeader, `${path}.rowHeader`);
  const cols = assertStringArray(value.cols, `${path}.cols`, { min: 1 });
  const rows = assertStringArray(value.rows, `${path}.rows`, { min: 1 });
  const data = assertArray(value.data, `${path}.data`, { min: rows.length });
  if (data.length !== rows.length) fail(`${path}.data must have one row per ${path}.rows item`);
  data.forEach((row, rowIndex) => {
    const rowPath = `${path}.data[${rowIndex}]`;
    assertArray(row, rowPath);
    if (row.length !== cols.length) fail(`${rowPath} must have one value per ${path}.cols item`);
    row.forEach((cell, colIndex) => {
      if (typeof cell !== "string" && typeof cell !== "number") fail(`${rowPath}[${colIndex}] must be a string or number`);
    });
  });
  optionalBoolean(value.totals, `${path}.totals`);
}

function validateDimensionLabels(value, path, allowedFields) {
  if (value === null || value === undefined) return;
  const labels = assertObject(value, path);
  assertAllowedFields(labels, path, allowedFields);
  allowedFields.forEach((field) => optionalTextField(labels[field], `${path}.${field}`));
}

function validateRectangleDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  assertAllowedFields(dimensions, `${path}.dimensions`, ["width", "height"]);
  assertNumber(dimensions.width, `${path}.dimensions.width`, { min: 0.000001 });
  assertNumber(dimensions.height, `${path}.dimensions.height`, { min: 0.000001 });
  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, ["width", "height"]);
}

function validateParallelogramDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = ["base", "side", "height"];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);
  assertNumber(dimensions.base, `${path}.dimensions.base`, { min: 0.000001 });

  const hasSide = dimensions.side !== null && dimensions.side !== undefined;
  const hasHeight = dimensions.height !== null && dimensions.height !== undefined;
  if (!hasSide && !hasHeight) {
    fail(`${path}.dimensions must supply side, perpendicular height, or both`);
  }
  if (hasSide) {
    assertNumber(dimensions.side, `${path}.dimensions.side`, { min: 0.000001 });
  }
  if (hasHeight) {
    assertNumber(dimensions.height, `${path}.dimensions.height`, { min: 0.000001 });
  }
  if (hasSide && hasHeight && dimensions.height >= dimensions.side) {
    fail(`${path}.dimensions.height must be less than ${path}.dimensions.side for a slanted parallelogram`);
  }

  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

function validateTrapeziumDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = ["topBase", "bottomBase", "height"];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);
  fields.forEach((field) => {
    assertNumber(dimensions[field], `${path}.dimensions.${field}`, { min: 0.000001 });
  });
  if (dimensions.topBase === dimensions.bottomBase) {
    fail(`${path}.dimensions.topBase and ${path}.dimensions.bottomBase must be different`);
  }

  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

function validateRightTriangleDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = ["base", "height", "hypotenuse"];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);
  assertNumber(dimensions.base, `${path}.dimensions.base`, { min: 0.000001 });
  assertNumber(dimensions.height, `${path}.dimensions.height`, { min: 0.000001 });
  if (dimensions.hypotenuse !== null && dimensions.hypotenuse !== undefined) {
    assertNumber(dimensions.hypotenuse, `${path}.dimensions.hypotenuse`, { min: 0.000001 });
    const expected = Math.hypot(dimensions.base, dimensions.height);
    const tolerance = Math.max(0.001, expected * 0.005);
    if (Math.abs(dimensions.hypotenuse - expected) > tolerance) {
      fail(`${path}.dimensions.hypotenuse must satisfy Pythagoras for the supplied base and height`);
    }
  }
  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

function validateTriangleDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = ["base", "leftSide", "rightSide", "height"];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);
  assertNumber(dimensions.base, `${path}.dimensions.base`, { min: 0.000001 });

  const hasLeftSide = dimensions.leftSide !== null && dimensions.leftSide !== undefined;
  const hasRightSide = dimensions.rightSide !== null && dimensions.rightSide !== undefined;
  const hasHeight = dimensions.height !== null && dimensions.height !== undefined;
  if (hasLeftSide !== hasRightSide) {
    fail(`${path}.dimensions.leftSide and ${path}.dimensions.rightSide must be supplied together`);
  }
  if (!hasLeftSide && !hasHeight) {
    fail(`${path}.dimensions must supply both side lengths or a perpendicular height`);
  }

  if (hasLeftSide) {
    assertNumber(dimensions.leftSide, `${path}.dimensions.leftSide`, { min: 0.000001 });
    assertNumber(dimensions.rightSide, `${path}.dimensions.rightSide`, { min: 0.000001 });
    const sides = [dimensions.base, dimensions.leftSide, dimensions.rightSide]
      .sort((a, b) => a - b);
    if (sides[0] + sides[1] <= sides[2]) {
      fail(`${path}.dimensions must satisfy the triangle inequality`);
    }
  }

  if (hasHeight) {
    assertNumber(dimensions.height, `${path}.dimensions.height`, { min: 0.000001 });
    if (hasLeftSide) {
      const apexX = (
        dimensions.leftSide ** 2 +
        dimensions.base ** 2 -
        dimensions.rightSide ** 2
      ) / (2 * dimensions.base);
      const expectedHeight = Math.sqrt(
        Math.max(0, dimensions.leftSide ** 2 - apexX ** 2)
      );
      const tolerance = Math.max(0.001, expectedHeight * 0.005);
      if (Math.abs(dimensions.height - expectedHeight) > tolerance) {
        fail(`${path}.dimensions.height must match the perpendicular height implied by the supplied side lengths`);
      }
    }
  }

  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

function validateCircleDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = ["radius", "diameter"];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);
  const hasRadius = dimensions.radius !== null && dimensions.radius !== undefined;
  const hasDiameter = dimensions.diameter !== null && dimensions.diameter !== undefined;
  if (hasRadius === hasDiameter) {
    fail(`${path}.dimensions must supply exactly one of radius or diameter`);
  }
  if (hasRadius) {
    assertNumber(dimensions.radius, `${path}.dimensions.radius`, { min: 0.000001 });
  }
  if (hasDiameter) {
    assertNumber(dimensions.diameter, `${path}.dimensions.diameter`, { min: 0.000001 });
  }
  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

function validateCircleSectorDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = ["radius", "angle"];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);
  assertNumber(dimensions.radius, `${path}.dimensions.radius`, { min: 0.000001 });
  assertNumber(dimensions.angle, `${path}.dimensions.angle`, { min: 0.000001 });
  if (dimensions.angle >= 360) {
    fail(`${path}.dimensions.angle must be less than 360`);
  }
  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

function validateAnnulusDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = [
    "outerRadius",
    "outerDiameter",
    "innerRadius",
    "innerDiameter",
  ];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);

  const hasOuterRadius =
    dimensions.outerRadius !== null && dimensions.outerRadius !== undefined;
  const hasOuterDiameter =
    dimensions.outerDiameter !== null && dimensions.outerDiameter !== undefined;
  const hasInnerRadius =
    dimensions.innerRadius !== null && dimensions.innerRadius !== undefined;
  const hasInnerDiameter =
    dimensions.innerDiameter !== null && dimensions.innerDiameter !== undefined;

  if (hasOuterRadius === hasOuterDiameter) {
    fail(`${path}.dimensions must supply exactly one of outerRadius or outerDiameter`);
  }
  if (hasInnerRadius === hasInnerDiameter) {
    fail(`${path}.dimensions must supply exactly one of innerRadius or innerDiameter`);
  }

  if (hasOuterRadius) {
    assertNumber(dimensions.outerRadius, `${path}.dimensions.outerRadius`, {
      min: 0.000001,
    });
  }
  if (hasOuterDiameter) {
    assertNumber(dimensions.outerDiameter, `${path}.dimensions.outerDiameter`, {
      min: 0.000001,
    });
  }
  if (hasInnerRadius) {
    assertNumber(dimensions.innerRadius, `${path}.dimensions.innerRadius`, {
      min: 0.000001,
    });
  }
  if (hasInnerDiameter) {
    assertNumber(dimensions.innerDiameter, `${path}.dimensions.innerDiameter`, {
      min: 0.000001,
    });
  }

  const outerRadius = hasOuterRadius
    ? dimensions.outerRadius
    : dimensions.outerDiameter / 2;
  const innerRadius = hasInnerRadius
    ? dimensions.innerRadius
    : dimensions.innerDiameter / 2;
  if (innerRadius >= outerRadius) {
    fail(`${path}.dimensions inner radius must be less than the outer radius`);
  }

  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

function validateAngleOfInclinationDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = ["angle", "distance", "height"];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);
  assertNumber(dimensions.angle, `${path}.dimensions.angle`, { min: 0.000001 });
  if (dimensions.angle >= 90) {
    fail(`${path}.dimensions.angle must be less than 90`);
  }

  const hasDistance =
    dimensions.distance !== null && dimensions.distance !== undefined;
  const hasHeight =
    dimensions.height !== null && dimensions.height !== undefined;
  if (!hasDistance && !hasHeight) {
    fail(`${path}.dimensions must supply at least one of distance or height`);
  }
  if (hasDistance) {
    assertNumber(dimensions.distance, `${path}.dimensions.distance`, { min: 0.000001 });
  }
  if (hasHeight) {
    assertNumber(dimensions.height, `${path}.dimensions.height`, { min: 0.000001 });
  }

  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

function validateRectangularPrismDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = ["length", "width", "height"];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);
  fields.forEach((field) => {
    assertNumber(dimensions[field], `${path}.dimensions.${field}`, { min: 0.000001 });
  });
  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

function validateTriangularPrismDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = ["triangleBase", "triangleHeight", "length"];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);
  fields.forEach((field) => {
    assertNumber(dimensions[field], `${path}.dimensions.${field}`, { min: 0.000001 });
  });
  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

function validateCylinderDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = ["radius", "diameter", "height"];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);
  const hasRadius = dimensions.radius !== null && dimensions.radius !== undefined;
  const hasDiameter = dimensions.diameter !== null && dimensions.diameter !== undefined;
  if (hasRadius === hasDiameter) {
    fail(`${path}.dimensions must supply exactly one of radius or diameter`);
  }
  if (hasRadius) {
    assertNumber(dimensions.radius, `${path}.dimensions.radius`, { min: 0.000001 });
  }
  if (hasDiameter) {
    assertNumber(dimensions.diameter, `${path}.dimensions.diameter`, { min: 0.000001 });
  }
  assertNumber(dimensions.height, `${path}.dimensions.height`, { min: 0.000001 });
  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

function validateConeDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = ["radius", "diameter", "height"];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);
  const hasRadius = dimensions.radius !== null && dimensions.radius !== undefined;
  const hasDiameter = dimensions.diameter !== null && dimensions.diameter !== undefined;
  if (hasRadius === hasDiameter) {
    fail(`${path}.dimensions must supply exactly one of radius or diameter`);
  }
  if (hasRadius) {
    assertNumber(dimensions.radius, `${path}.dimensions.radius`, { min: 0.000001 });
  }
  if (hasDiameter) {
    assertNumber(dimensions.diameter, `${path}.dimensions.diameter`, { min: 0.000001 });
  }
  assertNumber(dimensions.height, `${path}.dimensions.height`, { min: 0.000001 });
  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

function validatePyramidDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = ["baseLength", "baseWidth", "height"];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);
  fields.forEach((field) => {
    assertNumber(dimensions[field], `${path}.dimensions.${field}`, { min: 0.000001 });
  });
  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

function validateSphereDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = ["radius", "diameter"];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);
  const hasRadius = dimensions.radius !== null && dimensions.radius !== undefined;
  const hasDiameter = dimensions.diameter !== null && dimensions.diameter !== undefined;
  if (hasRadius === hasDiameter) {
    fail(`${path}.dimensions must supply exactly one of radius or diameter`);
  }
  if (hasRadius) {
    assertNumber(dimensions.radius, `${path}.dimensions.radius`, { min: 0.000001 });
  }
  if (hasDiameter) {
    assertNumber(dimensions.diameter, `${path}.dimensions.diameter`, { min: 0.000001 });
  }
  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

function validateNetDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "solid", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  assertEnum(value.solid, `${path}.solid`, ["rectangular-prism"]);
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = ["length", "width", "height"];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);
  fields.forEach((field) => {
    assertNumber(dimensions[field], `${path}.dimensions.${field}`, { min: 0.000001 });
  });
  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

function validateLShapeDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = ["totalWidth", "totalHeight", "cutoutWidth", "cutoutHeight"];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);
  fields.forEach((field) => {
    assertNumber(dimensions[field], `${path}.dimensions.${field}`, { min: 0.000001 });
  });
  if (dimensions.cutoutWidth >= dimensions.totalWidth) {
    fail(`${path}.dimensions.cutoutWidth must be less than ${path}.dimensions.totalWidth`);
  }
  if (dimensions.cutoutHeight >= dimensions.totalHeight) {
    fail(`${path}.dimensions.cutoutHeight must be less than ${path}.dimensions.totalHeight`);
  }
  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

function validateTShapeDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = ["topWidth", "topHeight", "stemWidth", "stemHeight"];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);
  fields.forEach((field) => {
    assertNumber(dimensions[field], `${path}.dimensions.${field}`, { min: 0.000001 });
  });
  if (dimensions.stemWidth >= dimensions.topWidth) {
    fail(`${path}.dimensions.stemWidth must be less than ${path}.dimensions.topWidth`);
  }
  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

function validateRectTriangleDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = ["width", "rectangleHeight", "triangleHeight"];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);
  fields.forEach((field) => {
    assertNumber(dimensions[field], `${path}.dimensions.${field}`, { min: 0.000001 });
  });
  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

function validateRectSemicircleDiagram(value, path) {
  assertAllowedFields(
    value,
    path,
    ["type", "dimensions", "unit", "dimensionLabels"],
    { forbidLayoutFields: true }
  );
  const dimensions = assertObject(value.dimensions, `${path}.dimensions`);
  const fields = ["rectangleWidth", "diameter"];
  assertAllowedFields(dimensions, `${path}.dimensions`, fields);
  fields.forEach((field) => {
    assertNumber(dimensions[field], `${path}.dimensions.${field}`, { min: 0.000001 });
  });
  optionalTextField(value.unit, `${path}.unit`);
  validateDimensionLabels(value.dimensionLabels, `${path}.dimensionLabels`, fields);
}

const DIAGRAM_SPEC_VALIDATORS = Object.freeze({
  "number-line": validateNumberLineDiagram,
  "coordinate-plane": validateCoordinatePlaneDiagram,
  "function-plot": validateFunctionPlotDiagram,
  "fraction-bar": validateFractionBarDiagram,
  "pie-chart": validatePieChartDiagram,
  array: validateArrayDiagram,
  pictograph: validatePictographDiagram,
  clock: validateClockDiagram,
  spinner: validateSpinnerDiagram,
  "bar-graph": validateBarGraphDiagram,
  histogram: validateHistogramDiagram,
  "dot-plot": validateDotPlotDiagram,
  "scatter-plot": validateScatterPlotDiagram,
  "box-plot": validateBoxPlotDiagram,
  "stem-and-leaf": validateStemAndLeafDiagram,
  "tree-diagram": validateTreeDiagram,
  "venn-diagram": validateVennDiagram,
  "parallel-lines": validateParallelLinesDiagram,
  angles: validateAnglesDiagram,
  "two-way-table": validateTwoWayTableDiagram,
  "right-triangle": validateRightTriangleDiagram,
  triangle: validateTriangleDiagram,
  circle: validateCircleDiagram,
  "circle-sector": validateCircleSectorDiagram,
  annulus: validateAnnulusDiagram,
  elevation: validateAngleOfInclinationDiagram,
  depression: validateAngleOfInclinationDiagram,
  "prism-rect": validateRectangularPrismDiagram,
  "prism-tri": validateTriangularPrismDiagram,
  cylinder: validateCylinderDiagram,
  cone: validateConeDiagram,
  pyramid: validatePyramidDiagram,
  sphere: validateSphereDiagram,
  net: validateNetDiagram,
  rectangle: validateRectangleDiagram,
  parallelogram: validateParallelogramDiagram,
  trapezium: validateTrapeziumDiagram,
  "L-shape": validateLShapeDiagram,
  "T-shape": validateTShapeDiagram,
  "rect-triangle": validateRectTriangleDiagram,
  "rect-semicircle": validateRectSemicircleDiagram,
});

function validateDiagram(value, path) {
  if (value === null || value === undefined) return;
  assertObject(value, path);
  const type = assertText(value.type, `${path}.type`);
  const definition = getDiagramDefinition(type);
  if (!definition) {
    fail(`${path}.type ${type} is not supported; use null or a supported diagram type`);
  }
  if (definition.status === DIAGRAM_STATUS.DISABLED) {
    fail(`${path}.type ${type} is temporarily disabled; use null or a non-shape diagram type`);
  }
  const validator = DIAGRAM_SPEC_VALIDATORS[type];
  if (!validator) fail(`${path}.type ${type} does not have a schema validator`);
  validator(value, path);
}

function validateDiagramRequirement(value, path) {
  if (value.diagramRequired !== null && value.diagramRequired !== undefined) {
    assertBoolean(value.diagramRequired, `${path}.diagramRequired`);
  }
  if (!value.diagram && value.diagramRequired === true) {
    fail(`${path}.diagramRequired cannot be true when ${path}.diagram is null`);
  }
}

// A diagram spec that fails schema validation is thrown with the same contract
// as a diagram that fails to render (attachDiagramContext / DIAGRAM_RENDER_ERROR),
// so buildDocxWithDiagramReliability drops an invalid OPTIONAL diagram with a
// warning instead of failing the whole resource, and a required one fails with
// diagram (not schema) repair context. Without this, one malformed optional
// diagram from the model (e.g. an algebraic dimensions.width) sinks an
// otherwise valid document. Only the diagram subtree is tagged: errors about
// the owner's other fields (including diagramRequired itself) stay plain
// validation errors, because omitting the diagram would not fix them.
function validateOwnedDiagram(owner, path, label) {
  try {
    validateDiagram(owner.diagram, `${path}.diagram`);
  } catch (err) {
    if (err instanceof ResourceValidationError && owner.diagram && typeof owner.diagram === "object") {
      throw attachDiagramContext(err, owner.diagram, {
        required: owner.diagramRequired !== false,
        label,
      });
    }
    throw err;
  }
  validateDiagramRequirement(owner, path);
}

function validateQuestionPart(part, path, questionLabel) {
  assertObject(part, path);
  assertText(part.label, `${path}.label`);
  assertText(part.stem, `${path}.stem`);
  assertNumber(part.marks, `${path}.marks`, { min: 0 });
  assertNumber(part.workingLines, `${path}.workingLines`, { integer: true, min: 0 });
  validateOwnedDiagram(part, path, `${questionLabel || "a question"} part ${part.label}`);
}

function validateQuestion(question, path, opts = {}) {
  assertObject(question, path);
  assertNumber(question.number, `${path}.number`, { integer: true, min: 1 });
  assertText(question.stem || question.text || question.instruction, `${path}.stem`);
  assertNumber(question.marks, `${path}.marks`, { min: 0 });
  if (opts.requireSubTopic) assertText(question.subTopic, `${path}.subTopic`);
  if (opts.requireType) assertText(question.type, `${path}.type`);
  if (question.options !== null && question.options !== undefined) {
    assertStringArray(question.options, `${path}.options`, { min: 2 });
  }
  validateOwnedDiagram(question, path, `Question ${question.number}`);

  if (question.parts === null || question.parts === undefined) {
    assertNumber(question.workingLines, `${path}.workingLines`, { integer: true, min: 0 });
    return;
  }

  const parts = assertArray(question.parts, `${path}.parts`, { min: 1 });
  parts.forEach((part, index) =>
    validateQuestionPart(part, `${path}.parts[${index}]`, `Question ${question.number}`)
  );
}

function validateQuestionArray(questions, path, opts = {}) {
  assertArray(questions, path, { min: 1 }).forEach((question, index) => {
    validateQuestion(question, `${path}[${index}]`, opts);
  });
}

function validateAnswerRow(answer, path, opts = {}) {
  assertObject(answer, path);
  assertNumber(answer.questionNumber, `${path}.questionNumber`, { integer: true, min: 1 });
  optionalText(answer.partLabel, `${path}.partLabel`);
  assertText(answer.answer, `${path}.answer`);
  if (opts.requireSubTopic) assertText(answer.subTopic, `${path}.subTopic`);
  if (opts.requireMarks) assertNumber(answer.marks, `${path}.marks`, { min: 0 });
  if (answer.workingOut !== null && answer.workingOut !== undefined) {
    assertText(answer.workingOut, `${path}.workingOut`, { required: false });
  }
  if (answer.note !== null && answer.note !== undefined) {
    assertText(answer.note, `${path}.note`, { required: false });
  }
}

function validateAnswerArray(answers, path, opts = {}) {
  assertArray(answers, path, { min: 1 }).forEach((answer, index) => {
    validateAnswerRow(answer, `${path}[${index}]`, opts);
  });
}

function validateMarkingGuideRow(row, path, opts = {}) {
  assertObject(row, path);
  if (opts.taskNumber) assertNumber(row.taskNumber, `${path}.taskNumber`, { integer: true, min: 1 });
  else assertNumber(row.questionNumber, `${path}.questionNumber`, { integer: true, min: 1 });
  optionalText(row.partLabel, `${path}.partLabel`);
  optionalText(row.subTopic, `${path}.subTopic`);
  optionalText(row.topic, `${path}.topic`);
  optionalText(row.section, `${path}.section`);
  assertText(row.suggestedResponse || row.sampleResponse || row.response || row.answer, `${path}.suggestedResponse`);
  assertStringArray(row.markingCriteria || row.criteria || row.successCriteria, `${path}.markingCriteria`, { min: 1 });
}

function validateMarkingGuideArray(rows, path, opts = {}) {
  assertArray(rows, path, { min: 1 }).forEach((row, index) => {
    validateMarkingGuideRow(row, `${path}[${index}]`, opts);
  });
}

function isEnglishSubject(subject) {
  return cleanText(subject).toLowerCase() === "english";
}

function validateTutorCopy(resource, path, opts = {}) {
  if (isEnglishSubject(resource.subject)) {
    validateMarkingGuideArray(resource.markingGuide || resource.answers, `${path}.markingGuide`, opts);
    return;
  }
  validateAnswerArray(resource.answers || resource.markScheme, `${path}.answers`, opts);
}

module.exports = {
  ResourceValidationError,
  assertArray,
  assertNumber,
  assertObject,
  assertStringArray,
  assertText,
  fail,
  isEnglishSubject,
  optionalArray,
  optionalNumber,
  optionalStimulus,
  optionalStringArray,
  optionalText,
  optionalTopics,
  validateAnswerArray,
  validateBaseResource,
  validateDiagram,
  validateMarkingGuideArray,
  validateQuestion,
  validateQuestionArray,
  validateTutorCopy,
};
