"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  arcBounds,
  arcIntersectsBox,
  box,
  boxesOverlap,
  boxFromCenter,
  buildNumericAxisTicks,
  chooseTextCandidate,
  createCartesianViewport,
  distancePointToSegment,
  distanceSegmentToBox,
  estimateTextBox,
  formatTickValue,
  point,
  pointInBox,
  scoreLabelCandidate,
  segment,
  segmentIntersectsBox,
} = require("../../src/resources/diagramLayout");

function assertAlmostEqual(actual, expected, tolerance = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

describe("diagram layout primitives", () => {
  it("detects label-to-label box overlap with clearance", () => {
    const labelA = box(10, 10, 50, 30);
    const labelB = box(55, 10, 90, 30);

    assert.equal(boxesOverlap(labelA, labelB), false);
    assert.equal(boxesOverlap(labelA, labelB, 5), true);
  });

  it("detects label-to-line intersections", () => {
    const label = box(40, 40, 80, 70);
    const crossing = segment(0, 55, 120, 55);
    const clear = segment(0, 90, 120, 90);

    assert.equal(segmentIntersectsBox(crossing, label), true);
    assert.equal(segmentIntersectsBox(clear, label), false);
    assertAlmostEqual(distanceSegmentToBox(clear, label), 20);
  });

  it("computes point-to-segment distance for point label clearance checks", () => {
    const value = point(3, 4);
    const target = segment(0, 0, 10, 0);

    assertAlmostEqual(distancePointToSegment(value, target), 4);
  });

  it("detects label-to-point collisions with clearance", () => {
    const label = box(20, 20, 40, 40);

    assert.equal(pointInBox(point(30, 30), label), true);
    assert.equal(pointInBox(point(45, 30), label), false);
    assert.equal(pointInBox(point(45, 30), label, 5), true);
  });

  it("approximates arc bounds and label-to-arc intersections", () => {
    const arc = { cx: 0, cy: 0, r: 10, startDeg: 0, endDeg: 90 };
    const bounds = arcBounds(arc, { strokeWidth: 2 });

    assertAlmostEqual(bounds.left, -1, 0.001);
    assertAlmostEqual(bounds.top, -1, 0.001);
    assertAlmostEqual(bounds.right, 11, 0.001);
    assertAlmostEqual(bounds.bottom, 11, 0.001);
    assert.equal(arcIntersectsBox(arc, box(6, 6, 9, 9), 1), true);
    assert.equal(arcIntersectsBox(arc, box(20, 20, 30, 30)), false);
  });

  it("estimates text boxes using anchor and padding", () => {
    const centred = estimateTextBox("Angle", { x: 100, y: 50, fontSize: 20, padding: 2 });
    const start = estimateTextBox("Angle", { x: 100, y: 50, fontSize: 20, anchor: "start" });

    assert.ok(centred.left < 100);
    assert.ok(centred.right > 100);
    assert.equal(start.left, 100);
    assert.ok(start.right > start.left);
  });

  it("scores label candidates against mixed obstacles", () => {
    const label = boxFromCenter(50, 50, 30, 16);
    const result = scoreLabelCandidate(label, [
      { type: "box", box: box(45, 45, 70, 70) },
      { type: "point", point: point(100, 100) },
      { type: "segment", segment: segment(10, 10, 20, 20) },
      { type: "arc", arc: { cx: 100, cy: 50, r: 20, startDeg: 180, endDeg: 270 } },
    ], { minClearance: 2 });

    assert.equal(result.valid, false);
    assert.equal(result.collisions.length, 1);
    assert.equal(result.collisions[0].type, "box");
  });

  it("chooses the first clear text candidate instead of the farthest clear candidate", () => {
    const chosen = chooseTextCandidate("A", [
      { x: 20, y: 75 },
      { x: 20, y: 10 },
    ], [
      { type: "segment", segment: segment(0, 90, 200, 90) },
    ], { fontSize: 10, minClearance: 5 });

    assert.equal(chosen.index, 0);
    assert.equal(chosen.score.valid, true);
  });

  it("falls back to the candidate with the fewest collisions", () => {
    const chosen = chooseTextCandidate("A", [
      { x: 50, y: 50 },
      { x: 100, y: 50 },
    ], [
      { type: "point", point: point(50, 50) },
      { type: "segment", segment: segment(40, 50, 60, 50) },
      { type: "point", point: point(100, 50) },
    ], { fontSize: 10 });

    assert.equal(chosen.index, 1);
    assert.equal(chosen.score.valid, false);
    assert.equal(chosen.score.collisions.length, 1);
    assert.equal(chosen.layoutDiagnostics.type, "label-placement");
    assert.equal(chosen.layoutDiagnostics.label, "A");
    assert.equal(chosen.layoutDiagnostics.candidateCount, 2);
    assert.equal(chosen.layoutDiagnostics.selectedIndex, 1);
    assert.equal(chosen.layoutDiagnostics.selectedValid, false);
    assert.equal(chosen.layoutDiagnostics.candidates.length, 2);
    assert.deepEqual(
      chosen.layoutDiagnostics.candidates.map((candidate) => candidate.valid),
      [false, false]
    );
  });

  it("uses one unit scale for both axes when requested", () => {
    const viewport = createCartesianViewport({
      minX: -10,
      maxX: 10,
      minY: -5,
      maxY: 5,
      left: 20,
      right: 520,
      top: 20,
      bottom: 420,
    });

    assertAlmostEqual(viewport.scaleX, viewport.scaleY);
    assertAlmostEqual(viewport.toX(1) - viewport.toX(0), viewport.toY(0) - viewport.toY(1));
    assertAlmostEqual(viewport.width / viewport.height, 2);
  });

  it("allows intentionally independent statistical axes", () => {
    const viewport = createCartesianViewport({
      minX: 0,
      maxX: 100,
      minY: 0,
      maxY: 10,
      left: 0,
      right: 500,
      top: 0,
      bottom: 300,
      equalUnits: false,
    });

    assert.equal(viewport.width, 500);
    assert.equal(viewport.height, 300);
    assert.notEqual(viewport.scaleX, viewport.scaleY);
  });

  it("chooses sparse readable ticks for wide numeric ranges", () => {
    const axis = buildNumericAxisTicks({
      min: -500,
      max: 500,
      pixelSpan: 460,
      orientation: "horizontal",
      fontSize: 17,
    });

    assert.ok(axis.ticks.length <= 6);
    assert.ok(axis.step >= 100);
    assert.ok(axis.ticks.some((tick) => tick.label === "0"));
    assert.ok(axis.ticks.every((tick, index) =>
      index === 0 || tick.position - axis.ticks[index - 1].position >= 80
    ));
  });

  it("formats fractional ticks without floating-point noise", () => {
    const axis = buildNumericAxisTicks({
      min: -0.5,
      max: 0.5,
      pixelSpan: 340,
      orientation: "vertical",
      fontSize: 14,
    });

    assert.equal(formatTickValue(-0, axis.step), "0");
    assert.ok(axis.ticks.some((tick) => tick.label === "0.2"));
    assert.ok(axis.ticks.every((tick) => !tick.label.includes("000000")));
  });
});
