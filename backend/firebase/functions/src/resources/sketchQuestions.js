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
// What makes it a graph rather than a geometric construction ("Draw the
// perpendicular bisector of line AB" is not one): graph words, an equation,
// or coordinates. Codex review on #374.
const GRAPH_WORDS = /\b(?:graph|number plane|cartesian plane|axes|grid|parabola|hyperbola|exponential)\b/i;
const EQUATION = /\b[xy]\s*=|=\s*0\b|\by\s*-\s*\d|\b\d*x\s*[+-]\s*\d*y\b/i;
const COORDINATES = /\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)/;
// The question works from what the diagram already shows: keep it.
const USES_DIAGRAM = /\b(?:shown|given|marked|labelled|in the diagram|on the diagram|from the (?:graph|diagram)|of the graph|reflect\w*|translat\w*|transform\w*|shift\w*|dilat\w*|rotat\w*|enlarg\w*)\b/i;
const GRAPH_DIAGRAMS = new Set(["function-plot", "coordinate-plane", "source-image"]);
const DEFAULT_RANGE = Object.freeze({ minX: -6, maxX: 6, minY: -6, maxY: 6 });

/** Whether a question's text asks the student to produce a graph themselves. */
function asksForSketch(text) {
  const t = String(text || "");
  return SKETCH_VERBS.test(t) && (GRAPH_WORDS.test(t) || EQUATION.test(t) || COORDINATES.test(t));
}

/**
 * Whether the question needs what the diagram already shows: it says so
 * ("shown", "given", a transformation of a graph), or it names a labelled
 * point or graph the diagram carries ("through the points A and B").
 */
function usesDiagramContent(text, diagram) {
  const t = String(text || "");
  if (USES_DIAGRAM.test(t)) return true;
  const labels = [...(diagram.points || []), ...(diagram.functions || [])]
    .map((item) => String(item?.label || "").trim())
    .filter(Boolean);
  return labels.some((label) => {
    const name = label.match(/^[A-Z]\b/)?.[0] || label; // "A(2, 3)" names A
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // "Plot A(1, 2)" gives the point in words: the diagram showing it is the
    // answer, not a given.
    if (new RegExp(`(^|[^A-Za-z])${escaped}\\s*\\(\\s*-?\\d`).test(t)) return false;
    return new RegExp(`(^|[^A-Za-z])${escaped}([^A-Za-z]|$)`).test(t);
  });
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
    if (diagram && typeof diagram === "object" && GRAPH_DIAGRAMS.has(diagram.type) && hasContent(diagram) && asksForSketch(text) && !usesDiagramContent(text, diagram)) {
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

module.exports = { asksForSketch, blankSketchDiagrams, usesDiagramContent };
