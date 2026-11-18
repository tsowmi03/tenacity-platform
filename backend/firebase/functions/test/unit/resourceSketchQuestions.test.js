"use strict";
const { it, describe } = require("node:test");
const assert = require("node:assert/strict");
const { asksForSketch, blankSketchDiagrams } = require("../../src/resources/sketchQuestions");

describe("sketch questions get an empty number plane (RES-115)", () => {
  it("recognises an instruction to sketch, draw or plot, not a mention of a graph", () => {
    for (const t of ["Sketch the graph of y = 2/5x − 3 using the gradient-intercept method.", "Plot the points A(1, 2) and B(3, 4).", "Draw the line y = x + 1 on the axes.", "Graph y = −2x − 1."]) assert.equal(asksForSketch(t), true, t);
    for (const t of ["The graph shows the line y = 2x + 1. Find its gradient.", "Use the graph to estimate x when y = 3.", "Find the equation of the line."]) assert.equal(asksForSketch(t), false, t);
  });

  it("blanks the textbook crop seen in the RES-113 baseline (m07 Q6)", () => {
    const resource = { questions: [{ number: 6, stem: "Sketch the graph of y = 2/5x − 3 using the gradient-intercept method.", diagram: { type: "source-image", image: Buffer.from("png"), width: 300, height: 200 } }] };
    const changed = blankSketchDiagrams(resource);
    assert.deepEqual(resource.questions[0].diagram, { type: "coordinate-plane", minX: -6, maxX: 6, minY: -6, maxY: 6, points: [] });
    assert.equal(changed[0].from, "source-image");
  });

  it("keeps a drawn graph's axes but removes the lines and points", () => {
    const resource = { questions: [{ stem: "Plot y = x^2 − 4.", diagram: { type: "function-plot", minX: -3, maxX: 3, minY: -5, maxY: 6, functions: [{ type: "quadratic", a: 1, b: 0, c: -4 }], points: [] } }] };
    blankSketchDiagrams(resource);
    assert.deepEqual(resource.questions[0].diagram, { type: "coordinate-plane", minX: -3, maxX: 3, minY: -5, maxY: 6, points: [] });
  });

  it("decides per part and leaves reading questions and answers alone", () => {
    const graph = () => ({ type: "function-plot", minX: -5, maxX: 5, minY: -5, maxY: 5, functions: [{ type: "linear", m: 2, b: 1 }], points: [] });
    const resource = {
      questions: [{ stem: "The graph shows a line.", diagram: graph(), parts: [{ label: "a", stem: "Find its gradient.", diagram: graph() }, { label: "b", stem: "Sketch a parallel line through (0, 3).", diagram: graph() }] }],
      answers: [{ questionNumber: 1, answer: "Sketch shown", diagram: graph() }],
    };
    blankSketchDiagrams(resource);
    assert.equal(resource.questions[0].diagram.type, "function-plot");
    assert.equal(resource.questions[0].parts[0].diagram.type, "function-plot");
    assert.equal(resource.questions[0].parts[1].diagram.type, "coordinate-plane");
    assert.equal(resource.answers[0].diagram.type, "function-plot", "an answer may show the finished graph");
  });
});
