"use strict";

/**
 * Per-type JSON Schemas for maths diagrams (AWP-15 part 2).
 *
 * A maths question can carry a diagram of any of 41 types. Describing that union
 * in the resource's own schema is not possible — measured against the live API,
 * exactly one type fits alongside a worksheet, and the full union is ~21KB
 * against limits that reject it five different ways (too many optional
 * parameters, too many union-typed parameters, grammar too large, schema too
 * complex, compilation timed out).
 *
 * So diagrams are deferred: the resource is generated with `diagram: null` and a
 * `diagramType` naming what each question needs, then filled in by one call per
 * distinct type, each constrained by the single schema from this module.
 *
 * TWO AUTHORING RULES, both learned the hard way:
 *
 * 1. Prefer `required` over optional. The binding limit is 24 *optional*
 *    parameters, and a faithfully-modelled function-plot spent 25 on its own.
 *    Requiring the fields a diagram genuinely needs is cheaper and better
 *    modelling — a number-line without min/max is not a diagram. Only
 *    presentation extras stay optional.
 *
 * 2. Where validation.js accepts two shapes for the same thing, pick one. A
 *    schema cannot express "exactly one of radius or diameter", "hypotenuse must
 *    satisfy Pythagoras", or "leftSide and rightSide must be supplied together".
 *    Constraining to the canonical form removes those failure modes rather than
 *    risking them: the model can no longer emit the combination that fails.
 *    validation.js still accepts both, so existing documents are unaffected.
 */

const { DIAGRAM_REGISTRY } = require("./diagramRegistry");

// --- primitives ------------------------------------------------------------

const num = Object.freeze({ type: "number" });
const int = Object.freeze({ type: "integer" });
const str = Object.freeze({ type: "string" });
const bool = Object.freeze({ type: "boolean" });

const arr = (items) => ({ type: "array", items });
// validation.js accepts a string or a number in a few places where a pronumeral
// is legitimate (a Venn region labelled "x", a table cell of "12" or 12).
const countValue = Object.freeze({ type: ["string", "number"] });
const constType = (type) => ({ type: "string", enum: [type] });

/**
 * `required` defaults to every property. Pass `optional` for the few fields that
 * are genuinely presentational — each one spends part of the 24-parameter budget.
 */
function obj(properties, { optional = [] } = {}) {
  const skip = new Set(optional);
  return {
    type: "object",
    properties,
    required: Object.keys(properties).filter((key) => !skip.has(key)),
    additionalProperties: false,
  };
}

// --- the dimensioned-shape family ------------------------------------------
//
// Nineteen validators share one shape: { type, dimensions, unit, dimensionLabels }.
// `dimensionLabels` is the only optional part — the renderer falls back to the
// numeric values when it is absent, and requiring it would force a label onto
// every edge of every shape.

function shape(type, dimensionFields) {
  const dimensions = Object.fromEntries(dimensionFields.map((f) => [f, num]));
  const labels = Object.fromEntries(dimensionFields.map((f) => [f, str]));
  return obj(
    {
      type: constType(type),
      dimensions: obj(dimensions),
      unit: str,
      // Each label is individually optional — the exception to authoring rule 1,
      // and it earns it. Requiring them all made the model label every edge, and
      // a label is drawn instead of the measurement: it wrote "80 cm" onto a side
      // already 80 units long, which then overflowed and failed layout. A label
      // is for an unknown ("x", "h"), so most edges should not carry one.
      dimensionLabels: obj(labels, { optional: dimensionFields }),
    },
    { optional: ["dimensionLabels"] }
  );
}

// Canonical dimension sets. Where validation.js allows an alternative
// (diameter for radius, a hypotenuse checked against Pythagoras, two side
// lengths instead of a perpendicular height) the alternative is deliberately
// absent — see authoring rule 2.
const SHAPE_DIMENSIONS = Object.freeze({
  rectangle: ["width", "height"],
  parallelogram: ["base", "height"],
  trapezium: ["topBase", "bottomBase", "height"],
  "right-triangle": ["base", "height"],
  triangle: ["base", "height"],
  circle: ["radius"],
  "circle-sector": ["radius", "angle"],
  annulus: ["outerRadius", "innerRadius"],
  elevation: ["angle", "distance"],
  depression: ["angle", "height"],
  "prism-rect": ["length", "width", "height"],
  "prism-tri": ["triangleBase", "triangleHeight", "length"],
  cylinder: ["radius", "height"],
  cone: ["radius", "height"],
  pyramid: ["baseLength", "baseWidth", "height"],
  sphere: ["radius"],
  "L-shape": ["totalWidth", "totalHeight", "cutoutWidth", "cutoutHeight"],
  "T-shape": ["topWidth", "topHeight", "stemWidth", "stemHeight"],
  "rect-triangle": ["width", "rectangleHeight", "triangleHeight"],
  "rect-semicircle": ["rectangleWidth", "diameter"],
});

// A net is a shape plus the solid it folds into.
function netSchema() {
  const base = shape("net", ["length", "width", "height"]);
  return obj(
    {
      type: constType("net"),
      solid: { type: "string", enum: ["rectangular-prism"] },
      dimensions: base.properties.dimensions,
      unit: str,
      dimensionLabels: base.properties.dimensionLabels,
    },
    { optional: ["dimensionLabels"] }
  );
}

// --- the rest --------------------------------------------------------------

const BESPOKE = Object.freeze({
  "number-line": () =>
    obj({
      type: constType("number-line"),
      min: num,
      max: num,
      step: num,
      marks: arr(obj({ value: num, label: str, open: bool })),
    }),

  "coordinate-plane": () =>
    obj({
      type: constType("coordinate-plane"),
      minX: num,
      maxX: num,
      minY: num,
      maxY: num,
      points: arr(obj({ x: num, y: num, label: str })),
    }),

  // Only the multi-bar form; the single-bar shorthand is the same diagram with
  // one entry, so nothing is lost.
  "fraction-bar": () =>
    obj({
      type: constType("fraction-bar"),
      bars: arr(obj({ parts: int, shaded: int, label: str })),
    }),

  "pie-chart": () =>
    obj({
      type: constType("pie-chart"),
      slices: arr(obj({ value: num, label: str })),
    }),

  array: () =>
    obj({
      type: constType("array"),
      rows: int,
      cols: int,
      rowsLabel: str,
      colsLabel: str,
      label: str,
    }),

  pictograph: () =>
    obj({
      type: constType("pictograph"),
      title: str,
      iconValue: num,
      key: str,
      rows: arr(obj({ label: str, count: num })),
    }),

  clock: () => obj({ type: constType("clock"), hour: int, minute: int }),

  spinner: () =>
    obj({
      type: constType("spinner"),
      sectors: arr(obj({ label: str, proportion: num })),
    }),

  "bar-graph": () =>
    obj({
      type: constType("bar-graph"),
      title: str,
      xLabel: str,
      yLabel: str,
      data: arr(obj({ label: str, value: num })),
    }),

  // The `classes` form only — `bins` describes the same histogram with explicit
  // boundaries, and supporting both would need a union we cannot afford.
  histogram: () =>
    obj({
      type: constType("histogram"),
      title: str,
      xLabel: str,
      yLabel: str,
      classes: arr(obj({ label: str, frequency: num })),
    }),

  // The raw `data` form only; `counts` is a dynamic-key object, which
  // additionalProperties:false cannot express.
  "dot-plot": () =>
    obj({
      type: constType("dot-plot"),
      title: str,
      xLabel: str,
      data: arr(num),
      min: num,
      max: num,
    }),

  // Points as objects only — validation.js also accepts bare [x, y] pairs.
  "scatter-plot": () =>
    obj({
      type: constType("scatter-plot"),
      xLabel: str,
      yLabel: str,
      points: arr(obj({ x: num, y: num, label: str }, { optional: ["label"] })),
      lineOfBestFit: bool,
    }),

  // The `plots` form only.
  "box-plot": () =>
    obj({
      type: constType("box-plot"),
      xLabel: str,
      plots: arr(
        obj({ min: num, q1: num, median: num, q3: num, max: num, label: str })
      ),
    }),

  "stem-and-leaf": () =>
    obj({
      type: constType("stem-and-leaf"),
      title: str,
      key: str,
      stems: arr(obj({ stem: str, leaves: arr(int) })),
    }),

  // `counts` is keyed by region. The key set is finite for 2-set and 3-set
  // diagrams, so it can be enumerated — each region is optional because a 2-set
  // diagram uses only A, B, AB and none.
  "venn-diagram": () =>
    obj(
      {
        type: constType("venn-diagram"),
        style: { type: "string", enum: ["2-set", "3-set"] },
        sets: arr(obj({ label: str })),
        counts: obj(
          {
            A: countValue,
            B: countValue,
            C: countValue,
            AB: countValue,
            AC: countValue,
            BC: countValue,
            ABC: countValue,
            none: countValue,
          },
          { optional: ["A", "B", "C", "AB", "AC", "BC", "ABC", "none"] }
        ),
      },
      { optional: [] }
    ),

  "parallel-lines": () =>
    obj({
      type: constType("parallel-lines"),
      angles: obj({ top: str, bottom: str }),
      labels: obj({ line1: str, line2: str, transversal: str }),
    }),

  "two-way-table": () =>
    obj({
      type: constType("two-way-table"),
      colHeader: str,
      rowHeader: str,
      cols: arr(str),
      rows: arr(str),
      data: arr(arr({ type: ["string", "number"] })),
      totals: bool,
    }),
});

/**
 * Types generated without a schema, on the pre-AWP-15 path: prompt-only, then
 * validation.js and the existing `repairMode: "diagram"` recovery. Each is here
 * because the shape genuinely cannot be expressed, not because it was awkward.
 *
 * Populated from the live compile sweep — see scripts/sweepDiagramSchemas.js.
 */
const FALLBACK_DIAGRAM_TYPES = Object.freeze(
  new Set([
    // `children` recurses; structured outputs forbids recursive schemas.
    "tree-diagram",
    // Shape depends on `subtype` (single / on-line / at-point /
    // vertically-opposite), each with a different field set.
    "angles",
    // Three nested object arrays (functions, points, asymptotes) with large
    // per-function field sets: "Grammar compilation timed out" even after
    // promoting fields to required.
    "function-plot",
  ])
);

const DIAGRAM_SCHEMA_BUILDERS = Object.freeze({
  ...Object.fromEntries(
    Object.entries(SHAPE_DIMENSIONS).map(([type, fields]) => [
      type,
      () => shape(type, fields),
    ])
  ),
  net: netSchema,
  ...BESPOKE,
});

/** The schema for one diagram type, or null when that type has no schema. */
function buildDiagramSchema(type) {
  if (FALLBACK_DIAGRAM_TYPES.has(type)) return null;
  const builder = DIAGRAM_SCHEMA_BUILDERS[type];
  return builder ? builder() : null;
}

/**
 * The phase-B response: the diagrams for one type, addressed back by position in
 * the list the prompt showed. An ordinal is used rather than
 * (questionNumber, partLabel) because those repeat across the sections of a
 * paper or the sub-topics of a booklet, and a diagram landing on the wrong
 * question is worse than one that fails to land at all.
 */
function buildDiagramFillSchema(type) {
  const diagram = buildDiagramSchema(type);
  if (!diagram) return null;
  return obj({ diagrams: arr(obj({ index: int, diagram })) });
}

const CONSTRAINABLE_DIAGRAM_TYPES = Object.freeze(
  Object.keys(DIAGRAM_REGISTRY).filter((type) => !FALLBACK_DIAGRAM_TYPES.has(type))
);

/**
 * Types whose DIAGRAM_REGISTRY fixture does NOT match its schema, on purpose —
 * the fixture uses a form authoring rule 2 deliberately dropped. Every other
 * fixture must match, which is what the drift test asserts; this set is the
 * allowed exceptions, so a genuine mismatch cannot hide among them.
 *
 * Each entry is a capability the model can no longer choose (the renderer and
 * validation.js still accept them, so stored documents are unaffected):
 *   fraction-bar    — single-bar shorthand; use `bars` with one entry
 *   box-plot        — inline five-number summary; use `plots` with one entry
 *   right-triangle  — `hypotenuse` (was cross-checked against Pythagoras)
 *   triangle        — `leftSide`/`rightSide` pair; use base + perpendicular height
 *   parallelogram   — slant `side`; use base + perpendicular height
 */
const FIXTURE_DIVERGENCES = Object.freeze(
  new Set(["fraction-bar", "box-plot", "right-triangle", "triangle", "parallelogram"])
);

module.exports = {
  CONSTRAINABLE_DIAGRAM_TYPES,
  FIXTURE_DIVERGENCES,
  DIAGRAM_SCHEMA_BUILDERS,
  FALLBACK_DIAGRAM_TYPES,
  SHAPE_DIMENSIONS,
  buildDiagramFillSchema,
  buildDiagramSchema,
};
