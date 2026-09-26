"use strict";

const { displayTextLength } = require("./mathNotation");

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
  // Measured as displayed: typeset scripts are narrower than their notation.
  const width = Math.max(...lines.map((line) => displayTextLength(line)), 1) * fontSize * 0.58;
  const height = lines.length * fontSize * lineHeight;
  const x = assertFiniteNumber(opts.x, "text.x");
  const y = assertFiniteNumber(opts.y, "text.y");

  let left;
  if (anchor === "start") left = x;
  else if (anchor === "end") left = x - width;
  else left = x - width / 2;

  return box(left - padding, y - height / 2 - padding, left + width + padding, y + height / 2 + padding);
}

function niceStepAtLeast(value) {
  assertFiniteNumber(value, "step.value");
  if (value <= 0) throw new TypeError("step.value must be greater than zero");

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const multiplier = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return multiplier * magnitude;
}

function nextNiceStep(value) {
  const step = niceStepAtLeast(value);
  const magnitude = 10 ** Math.floor(Math.log10(step));
  const normalised = step / magnitude;
  if (normalised < 1.5) return 2 * magnitude;
  if (normalised < 3.5) return 5 * magnitude;
  if (normalised < 7.5) return 10 * magnitude;
  return 20 * magnitude;
}

function formatTickValue(value, step) {
  assertFiniteNumber(value, "tick.value");
  assertFiniteNumber(step, "tick.step");
  if (step <= 0) throw new TypeError("tick.step must be greater than zero");

  const rounded = Math.abs(value) <= step * 1e-9 ? 0 : value;
  const abs = Math.abs(rounded);
  if (abs >= 1e7 || (abs > 0 && abs < 1e-5)) {
    return rounded.toExponential(2).replace(/\.00e/, "e").replace(/(\.\d)0e/, "$1e");
  }

  const decimals = Math.min(8, Math.max(0, -Math.floor(Math.log10(step))));
  const fixed = rounded.toFixed(decimals);
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

function buildNumericAxisTicks({
  min,
  max,
  pixelSpan,
  orientation = "horizontal",
  fontSize = 16,
  minGap = 8,
  minPixelSpacing,
}) {
  assertFiniteNumber(min, "axis.min");
  assertFiniteNumber(max, "axis.max");
  assertFiniteNumber(pixelSpan, "axis.pixelSpan");
  if (max <= min) throw new TypeError("axis.max must be greater than axis.min");
  if (pixelSpan <= 0) throw new TypeError("axis.pixelSpan must be greater than zero");
  if (!["horizontal", "vertical"].includes(orientation)) {
    throw new TypeError("axis.orientation must be horizontal or vertical");
  }

  const range = max - min;
  const targetSpacing = minPixelSpacing || (orientation === "horizontal" ? 38 : 28);
  const targetCount = Math.max(2, Math.floor(pixelSpan / targetSpacing));
  let step = niceStepAtLeast(range / targetCount);

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const start = Math.ceil((min - step * 1e-9) / step) * step;
    const ticks = [];
    for (let value = start; value <= max + step * 1e-9 && ticks.length < 200; value += step) {
      const normalised = Math.round(value / step) * step;
      ticks.push({
        value: Math.abs(normalised) <= step * 1e-9 ? 0 : normalised,
        label: formatTickValue(normalised, step),
      });
    }

    const positioned = ticks.map((tick) => ({
      ...tick,
      position: (tick.value - min) / range * pixelSpan,
    }));
    const clear = positioned.every((tick, index) => {
      if (index === 0) return true;
      const previous = positioned[index - 1];
      const spacing = tick.position - previous.position;
      if (orientation === "vertical") {
        return spacing >= fontSize * 1.2 + minGap;
      }
      const previousWidth = estimateTextBox(previous.label, {
        x: 0,
        y: 0,
        fontSize,
      }).right;
      const width = estimateTextBox(tick.label, {
        x: 0,
        y: 0,
        fontSize,
      }).right;
      return spacing >= previousWidth + width + minGap;
    });

    if (clear || positioned.length <= 1) return { step, ticks: positioned };
    step = nextNiceStep(step);
  }

  throw new Error("Unable to choose readable numeric axis ticks");
}

function createCartesianViewport({
  minX,
  maxX,
  minY,
  maxY,
  left,
  right,
  top,
  bottom,
  equalUnits = true,
}) {
  [minX, maxX, minY, maxY, left, right, top, bottom].forEach((value, index) =>
    assertFiniteNumber(value, `viewport.value[${index}]`)
  );
  if (maxX <= minX) throw new TypeError("viewport.maxX must be greater than viewport.minX");
  if (maxY <= minY) throw new TypeError("viewport.maxY must be greater than viewport.minY");
  if (right <= left) throw new TypeError("viewport.right must be greater than viewport.left");
  if (bottom <= top) throw new TypeError("viewport.bottom must be greater than viewport.top");

  const rangeX = maxX - minX;
  const rangeY = maxY - minY;
  const availableWidth = right - left;
  const availableHeight = bottom - top;
  let plotLeft = left;
  let plotRight = right;
  let plotTop = top;
  let plotBottom = bottom;
  let scaleX = availableWidth / rangeX;
  let scaleY = availableHeight / rangeY;

  if (equalUnits) {
    const scale = Math.min(scaleX, scaleY);
    const width = rangeX * scale;
    const height = rangeY * scale;
    plotLeft = left + (availableWidth - width) / 2;
    plotRight = plotLeft + width;
    plotTop = top + (availableHeight - height) / 2;
    plotBottom = plotTop + height;
    scaleX = scale;
    scaleY = scale;
  }

  return {
    left: plotLeft,
    right: plotRight,
    top: plotTop,
    bottom: plotBottom,
    width: plotRight - plotLeft,
    height: plotBottom - plotTop,
    rangeX,
    rangeY,
    scaleX,
    scaleY,
    equalUnits,
    toX: (value) => plotLeft + (value - minX) * scaleX,
    toY: (value) => plotBottom - (value - minY) * scaleY,
  };
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

function diagnosticNumber(value) {
  if (value === null || value === Infinity || value === -Infinity) return value;
  return Math.round(value * 1000) / 1000;
}

function labelPlacementDiagnostics(label, scored, selected, opts = {}) {
  return {
    type: "label-placement",
    label: String(label ?? ""),
    candidateCount: scored.length,
    minClearance: opts.minClearance || 0,
    selectedIndex: selected?.index ?? null,
    selectedValid: Boolean(selected?.score?.valid),
    candidates: scored.map((candidate) => ({
      index: candidate.index,
      x: diagnosticNumber(candidate.x),
      y: diagnosticNumber(candidate.y),
      anchor: candidate.anchor,
      valid: candidate.score.valid,
      clearance: diagnosticNumber(candidate.score.clearance),
      collisions: candidate.score.collisions.map((collision) => ({
        index: collision.index,
        type: collision.type,
        distance: diagnosticNumber(collision.distance),
      })),
    })),
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

  const selected = [...scored].sort((a, b) => {
    if (a.score.collisions.length !== b.score.collisions.length) {
      return a.score.collisions.length - b.score.collisions.length;
    }
    const aClearance = a.score.clearance === null ? Infinity : a.score.clearance;
    const bClearance = b.score.clearance === null ? Infinity : b.score.clearance;
    if (aClearance !== bClearance) return bClearance - aClearance;
    return a.index - b.index;
  })[0] || candidates[0];

  if (!selected) return selected;

  return {
    ...selected,
    layoutDiagnostics: labelPlacementDiagnostics(label, scored, selected, { minClearance }),
  };
}

module.exports = {
  arcBounds,
  arcIntersectsBox,
  arcToSegments,
  box,
  boxesOverlap,
  boxFromCenter,
  buildNumericAxisTicks,
  chooseTextCandidate,
  createCartesianViewport,
  distanceArcToBox,
  distancePointToBox,
  distancePointToSegment,
  distanceSegmentToBox,
  estimateTextBox,
  expandBox,
  point,
  pointInBox,
  formatTickValue,
  scoreLabelCandidate,
  segment,
  segmentIntersectsBox,
};
