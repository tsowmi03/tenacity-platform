"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  arcBounds,
  arcIntersectsBox,
  box,
  boxesOverlap,
  boxFromCenter,
  distancePointToSegment,
  distanceSegmentToBox,
  estimateTextBox,
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
});
