"use strict";

function assertFiniteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}

function point(x, y) {
  return {
    x: assertFiniteNumber(x, "point.x"),
    y: assertFiniteNumber(y, "point.y"),
  };
}

function segment(x1, y1, x2, y2) {
  return {
    p1: point(x1, y1),
    p2: point(x2, y2),
  };
}

function box(left, top, right, bottom) {
  const normalised = {
    left: assertFiniteNumber(left, "box.left"),
    top: assertFiniteNumber(top, "box.top"),
    right: assertFiniteNumber(right, "box.right"),
    bottom: assertFiniteNumber(bottom, "box.bottom"),
  };
  if (normalised.right < normalised.left) {
    throw new TypeError("box.right must be greater than or equal to box.left");
  }
  if (normalised.bottom < normalised.top) {
    throw new TypeError("box.bottom must be greater than or equal to box.top");
  }
  return normalised;
}

function boxFromCenter(cx, cy, width, height) {
  assertFiniteNumber(cx, "box.cx");
  assertFiniteNumber(cy, "box.cy");
  assertFiniteNumber(width, "box.width");
  assertFiniteNumber(height, "box.height");
  if (width < 0) throw new TypeError("box.width must be non-negative");
  if (height < 0) throw new TypeError("box.height must be non-negative");
  return box(cx - width / 2, cy - height / 2, cx + width / 2, cy + height / 2);
}

function expandBox(value, amount = 0) {
  assertFiniteNumber(amount, "amount");
  return box(
    value.left - amount,
    value.top - amount,
    value.right + amount,
    value.bottom + amount
  );
}

function pointInBox(value, targetBox, clearance = 0) {
  const expanded = expandBox(targetBox, clearance);
  return value.x >= expanded.left &&
    value.x <= expanded.right &&
    value.y >= expanded.top &&
    value.y <= expanded.bottom;
}

function boxesOverlap(a, b, clearance = 0) {
  const expandedA = expandBox(a, clearance);
  return expandedA.left <= b.right &&
    expandedA.right >= b.left &&
    expandedA.top <= b.bottom &&
    expandedA.bottom >= b.top;
}

function distancePointToPoint(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distancePointToSegment(value, targetSegment) {
  const ax = targetSegment.p1.x;
  const ay = targetSegment.p1.y;
  const bx = targetSegment.p2.x;
  const by = targetSegment.p2.y;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distancePointToPoint(value, targetSegment.p1);

  const t = Math.max(0, Math.min(1, ((value.x - ax) * dx + (value.y - ay) * dy) / lenSq));
  return Math.hypot(value.x - (ax + t * dx), value.y - (ay + t * dy));
}

function distancePointToBox(value, targetBox) {
  const dx = Math.max(targetBox.left - value.x, 0, value.x - targetBox.right);
  const dy = Math.max(targetBox.top - value.y, 0, value.y - targetBox.bottom);
  return Math.hypot(dx, dy);
}

function segmentIntersectsBox(targetSegment, targetBox, clearance = 0) {
  const expanded = expandBox(targetBox, clearance);
  if (pointInBox(targetSegment.p1, expanded) || pointInBox(targetSegment.p2, expanded)) {
    return true;
  }

  const x0 = targetSegment.p1.x;
  const y0 = targetSegment.p1.y;
  const x1 = targetSegment.p2.x;
  const y1 = targetSegment.p2.y;
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [
    x0 - expanded.left,
    expanded.right - x0,
    y0 - expanded.top,
    expanded.bottom - y0,
  ];

  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 <= t1;
}

function distanceSegmentToBox(targetSegment, targetBox) {
  if (segmentIntersectsBox(targetSegment, targetBox)) return 0;

  const corners = [
    point(targetBox.left, targetBox.top),
    point(targetBox.right, targetBox.top),
    point(targetBox.right, targetBox.bottom),
    point(targetBox.left, targetBox.bottom),
  ];
  const edges = [
    segment(targetBox.left, targetBox.top, targetBox.right, targetBox.top),
    segment(targetBox.right, targetBox.top, targetBox.right, targetBox.bottom),
    segment(targetBox.right, targetBox.bottom, targetBox.left, targetBox.bottom),
    segment(targetBox.left, targetBox.bottom, targetBox.left, targetBox.top),
  ];

  const endpointDistances = [
    distancePointToBox(targetSegment.p1, targetBox),
    distancePointToBox(targetSegment.p2, targetBox),
  ];
  const cornerDistances = corners.map((corner) => distancePointToSegment(corner, targetSegment));
  const edgeEndpointDistances = edges.flatMap((edge) => [
    distancePointToSegment(targetSegment.p1, edge),
    distancePointToSegment(targetSegment.p2, edge),
  ]);

  return Math.min(...endpointDistances, ...cornerDistances, ...edgeEndpointDistances);
}

function normaliseArcAngles(startDeg, endDeg) {
  assertFiniteNumber(startDeg, "arc.startDeg");
  assertFiniteNumber(endDeg, "arc.endDeg");
  let start = startDeg;
  let end = endDeg;
  while (end < start) end += 360;
  return { start, end };
}

function arcToSegments(arc, opts = {}) {
  const cx = assertFiniteNumber(arc.cx, "arc.cx");
  const cy = assertFiniteNumber(arc.cy, "arc.cy");
  const r = assertFiniteNumber(arc.r, "arc.r");
  if (r < 0) throw new TypeError("arc.r must be non-negative");
  const { start, end } = normaliseArcAngles(arc.startDeg, arc.endDeg);
  const maxStepDegrees = opts.maxStepDegrees || 5;
  const steps = Math.max(1, Math.ceil(Math.abs(end - start) / maxStepDegrees));
  const points = [];

  for (let i = 0; i <= steps; i += 1) {
    const deg = start + (end - start) * (i / steps);
    const rad = deg * Math.PI / 180;
    points.push(point(cx + r * Math.cos(rad), cy + r * Math.sin(rad)));
  }

  const segments = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    segments.push({ p1: points[i], p2: points[i + 1] });
  }
  return segments;
}

function arcBounds(arc, opts = {}) {
  const strokeWidth = opts.strokeWidth || arc.strokeWidth || 0;
  const points = arcToSegments(arc, opts).flatMap((item) => [item.p1, item.p2]);
  const pad = strokeWidth / 2;
  return box(
    Math.min(...points.map((item) => item.x)) - pad,
    Math.min(...points.map((item) => item.y)) - pad,
    Math.max(...points.map((item) => item.x)) + pad,
    Math.max(...points.map((item) => item.y)) + pad
  );
}

function arcIntersectsBox(arc, targetBox, clearance = 0) {
  return arcToSegments(arc).some((item) => segmentIntersectsBox(item, targetBox, clearance));
}

function distanceArcToBox(arc, targetBox) {
  if (arcIntersectsBox(arc, targetBox)) return 0;
  return Math.min(...arcToSegments(arc).map((item) => distanceSegmentToBox(item, targetBox)));
}

function estimateTextBox(text, opts = {}) {
  const fontSize = opts.fontSize || 16;
  const lineHeight = opts.lineHeight || 1.2;
  const padding = opts.padding || 0;
  const anchor = opts.anchor || "middle";
  const lines = String(text ?? "").split(/\r?\n/);
  const width = Math.max(...lines.map((line) => line.length), 1) * fontSize * 0.58;
  const height = lines.length * fontSize * lineHeight;
  const x = assertFiniteNumber(opts.x, "text.x");
  const y = assertFiniteNumber(opts.y, "text.y");

  let left;
  if (anchor === "start") left = x;
  else if (anchor === "end") left = x - width;
  else left = x - width / 2;

  return box(left - padding, y - height / 2 - padding, left + width + padding, y + height / 2 + padding);
}

function distanceBoxToBox(a, b) {
  if (boxesOverlap(a, b)) return 0;
  const dx = Math.max(b.left - a.right, a.left - b.right, 0);
  const dy = Math.max(b.top - a.bottom, a.top - b.bottom, 0);
  return Math.hypot(dx, dy);
}

function obstacleDistance(labelBox, obstacle) {
  if (obstacle.type === "box") return distanceBoxToBox(labelBox, obstacle.box);
  if (obstacle.type === "point") return distancePointToBox(obstacle.point, labelBox);
  if (obstacle.type === "segment") return distanceSegmentToBox(obstacle.segment, labelBox);
  if (obstacle.type === "arc") return distanceArcToBox(obstacle.arc, labelBox);
  throw new TypeError(`Unsupported obstacle type: ${obstacle.type}`);
}

function scoreLabelCandidate(labelBox, obstacles, opts = {}) {
  const minClearance = opts.minClearance || 0;
  const collisions = [];
  let clearance = Infinity;

  obstacles.forEach((obstacle, index) => {
    const distance = obstacleDistance(labelBox, obstacle);
    clearance = Math.min(clearance, distance);
    if (distance <= minClearance) {
      collisions.push({ index, type: obstacle.type, distance });
    }
  });

  return {
    valid: collisions.length === 0,
    clearance: clearance === Infinity ? null : clearance,
    collisions,
  };
}

function chooseTextCandidate(label, candidates, obstacles, opts = {}) {
  const fontSize = opts.fontSize || 16;
  const lineHeight = opts.lineHeight || 1.2;
  const padding = opts.padding || 0;
  const minClearance = opts.minClearance || 0;
  const scored = candidates.map((candidate, index) => {
    const anchor = candidate.anchor || opts.anchor || "middle";
    const labelBox = estimateTextBox(label, {
      x: candidate.x,
      y: candidate.y,
      fontSize,
      lineHeight,
      padding,
      anchor,
    });
    const score = scoreLabelCandidate(labelBox, obstacles, { minClearance });

    return {
      ...candidate,
      anchor,
      box: labelBox,
      index,
      score,
    };
  });

  const valid = scored.find((candidate) => candidate.score.valid);
  if (valid) return valid;

  return scored.sort((a, b) => {
    if (a.score.collisions.length !== b.score.collisions.length) {
      return a.score.collisions.length - b.score.collisions.length;
    }
    const aClearance = a.score.clearance === null ? Infinity : a.score.clearance;
    const bClearance = b.score.clearance === null ? Infinity : b.score.clearance;
    if (aClearance !== bClearance) return bClearance - aClearance;
    return a.index - b.index;
  })[0] || candidates[0];
}

module.exports = {
  arcBounds,
  arcIntersectsBox,
  arcToSegments,
  box,
  boxesOverlap,
  boxFromCenter,
  chooseTextCandidate,
  distanceArcToBox,
  distancePointToBox,
  distancePointToSegment,
  distanceSegmentToBox,
  estimateTextBox,
  expandBox,
  point,
  pointInBox,
  scoreLabelCandidate,
  segment,
  segmentIntersectsBox,
};
