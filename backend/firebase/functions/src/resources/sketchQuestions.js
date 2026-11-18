"use strict";

// RES-115. A question that asks the student to sketch, draw or plot a graph
// must give them somewhere empty to do it. The RES-113 baseline printed
// "Sketch the graph of y = 2/5x − 3" beside a textbook crop of that exact
// graph, with its rise/run steps and a second point marked. Before a resource
// is built, the diagram on such a question becomes a blank number plane: the
// same axes for a drawn graph, a standard grid for a textbook crop.

// "Graph" only as an instruction at the start of a sentence ("Graph y = 2x"),
// so "The graph shows…" or "Use the graph to…" never counts.
const SKETCH_VERBS = /\b(?:sketch|draw|plot)\b|(?:^|[.!?]\s+)graph\b/i;
const SKETCH_OBJECTS = /\b(?:graph|line|parabola|curve|hyperbola|circle|points?|number plane|axes|grid)\b|\by\s*=/i;
const GRAPH_DIAGRAMS = new Set(["function-plot", "coordinate-plane", "source-image"]);
const DEFAULT_RANGE = Object.freeze({ minX: -6, maxX: 6, minY: -6, maxY: 6 });

/** Whether a question's text asks the student to produce a graph themselves. */
function asksForSketch(text) {
  const t = String(text || "");
  return SKETCH_VERBS.test(t) && SKETCH_OBJECTS.test(t);
}

function blankPlaneFor(diagram) {
  if (diagram.type === "source-image") return { type: "coordinate-plane", ...DEFAULT_RANGE, points: [] };
  const range = {};
  for (const key of ["minX", "maxX", "minY", "maxY"]) range[key] = Number.isFinite(diagram[key]) ? diagram[key] : DEFAULT_RANGE[key];
  return { type: "coordinate-plane", ...range, points: [] };
}

function hasContent(diagram) {
  if (diagram.type === "source-image") return true;
  return (diagram.functions?.length || 0) + (diagram.points?.length || 0) > 0;
}

/**
 * Blanks the graph on every question or part that asks for a sketch, in
 * place. A part's own text decides for that part; a question's text decides
 * for the question's diagram. Returns where it happened, as paths.
 */
function blankSketchDiagrams(resource) {
  const changed = [];
  const visit = (node, path, inherited) => {
    if (Array.isArray(node)) { node.forEach((item, i) => visit(item, `${path}[${i}]`, inherited)); return; }
    if (!node || typeof node !== "object") return;
    const own = node.stem ?? node.question ?? node.prompt ?? null;
    const text = typeof own === "string" ? own : inherited;
    const diagram = node.diagram;
    if (diagram && typeof diagram === "object" && GRAPH_DIAGRAMS.has(diagram.type) && hasContent(diagram) && asksForSketch(text)) {
      node.diagram = blankPlaneFor(diagram);
      changed.push({ path: path || "resource", from: diagram.type });
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "diagram" || key === "stimulus") continue;
      if (value && typeof value === "object") visit(value, path ? `${path}.${key}` : key, typeof own === "string" ? own : inherited);
    }
  };
  visit(resource, "", null);
  return changed;
}

module.exports = { asksForSketch, blankSketchDiagrams };
