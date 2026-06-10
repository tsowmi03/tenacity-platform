// diagram-generator.js — Generates maths diagrams as trimmed PNG buffers
//
// Output style (updated):
//   • Line-only diagrams — no shape fills, no shaded faces, no tinted angle arcs.
//   • Dimension labels are pushed further from the shape so they never overlap lines.
//   • Rendered PNG is trimmed to the content bounding box, then padded by a small
//     margin so the final image is mostly the diagram with very little whitespace.
//   • generateDiagram() now returns { buffer, width, height } — width/height are
//     the ACTUAL pixel dimensions after trimming, so the caller can size the
//     embedded image correctly.
//
// Supported types: right-triangle, triangle, rectangle, parallelogram, trapezium,
// circle, circle-sector, elevation, depression, prism-rect, prism-tri, cylinder,
// parallel-lines, number-line, coordinate-plane, L-shape, T-shape, rect-triangle,
// rect-semicircle, annulus, function-plot, bar-graph, histogram, dot-plot,
// tree-diagram, venn-diagram, angles.

const sharp = require("sharp");
const {
  DIAGRAM_STATUS,
  diagramEntries,
  getDiagramDefinition,
} = require("./diagramRegistry");
const {
  boxFromCenter,
  chooseTextCandidate,
  estimateTextBox,
  scoreLabelCandidate,
  segment: layoutSegment,
} = require("./diagramLayout");

// ─── STYLE ──────────────────────────────────────────────────────────────────

const S = {
  line: "#1B3F71",   // Primary stroke (shape outlines)
  dim: "#1C71AF",    // Dimension labels and leader lines
  label: "#1B3F71",  // Vertex labels and text
  angle: "#C0392B",  // Angle markers and angle labels
  dash: "#1C71AF",   // Dashed construction lines
  bg: "#FFFFFF",     // Canvas background (needed for trim to work)
  lw: 2.5,           // Default stroke width
  font: "DejaVu Sans, Arial, sans-serif",
};

// Canvas is intentionally generous — the SVG is trimmed after rasterisation, so
// extra space here only gives labels room to sit clear of the shape and is then
// cropped away.
const W = 640;
const H = 520;
const PAD = 80;

// Dimension-label offset from shape edges (in SVG units). Bumped up from the
// previous values so that, once shape fills are removed, text cannot visually
// touch the outline.
const LBL = 30;           // Standard dimension label offset
const LBL_TIGHT = 24;     // Where space is constrained
const LBL_GENEROUS = 42;  // For labels that sit outside all geometry

// ─── SVG HELPERS ────────────────────────────────────────────────────────────

function svgOpen(w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${S.bg}"/>`;
}
const svgClose = "</svg>";

function line(x1, y1, x2, y2, opts = {}) {
  const stroke = opts.color || S.line;
  const sw = opts.width || S.lw;
  const dash = opts.dash ? ` stroke-dasharray="${opts.dash}"` : "";
  const linecap = opts.linecap || "round";
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"${dash} stroke-linecap="${linecap}"/>`;
}

function polyline(pts, opts = {}) {
  const stroke = opts.color || S.line;
  const sw = opts.width || S.lw;
  const d = pts.map(([x, y]) => `${x},${y}`).join(" ");
  return `<polygon points="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

function rect(x, y, w, h, opts = {}) {
  const stroke = opts.color || S.line;
  const sw = opts.width || S.lw;
  const dash = opts.dash ? ` stroke-dasharray="${opts.dash}"` : "";
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${stroke}" stroke-width="${sw}"${dash}/>`;
}

function circle(cx, cy, r, opts = {}) {
  const stroke = opts.color || S.line;
  const sw = opts.width || S.lw;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
}

function ellipseSvg(cx, cy, rx, ry, opts = {}) {
  const stroke = opts.color || S.line;
  const sw = opts.width || S.lw;
  const dash = opts.dash ? ` stroke-dasharray="${opts.dash}"` : "";
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${stroke}" stroke-width="${sw}"${dash}/>`;
}

function arcOpen(cx, cy, r, startAngle, endAngle, opts = {}) {
  // Draws JUST the arc (no radii, no close) — used for angle markers over an
  // existing shape so we don't overlay duplicate lines on top of triangle sides.
  const stroke = opts.color || S.line;
  const sw = opts.width || S.lw;
  const s = startAngle * Math.PI / 180;
  const e = endAngle * Math.PI / 180;
  const x1 = cx + r * Math.cos(s);
  const y1 = cy + r * Math.sin(s);
  const x2 = cx + r * Math.cos(e);
  const y2 = cy + r * Math.sin(e);
  const large = (endAngle - startAngle) > 180 ? 1 : 0;
  return `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
}

function text(x, y, str, opts = {}) {
  const fill = opts.color || S.label;
  const size = opts.size || 22;
  const anchor = opts.anchor || "middle";
  const weight = opts.bold ? "bold" : "normal";
  const style = opts.italic ? "italic" : "normal";
  const escaped = String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // White halo — masks gridlines, axis ticks, and curves that cross underneath the text.
  // The halo is rendered first (via paint-order), the fill on top, so glyph weight is preserved.
  // Disable with opts.halo === false if you ever need unmasked text.
  const halo = opts.halo !== false;
  let haloAttrs = "";
  if (halo) {
    const haloW = Math.max(2.5, Math.min(4, size * 0.18));
    haloAttrs = ` paint-order="stroke fill" stroke="#FFFFFF" stroke-width="${haloW}" stroke-linejoin="round"`;
  }

  const rotate = opts.rotate ? ` transform="rotate(${opts.rotate} ${x} ${y})"` : "";
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${S.font}" font-size="${size}" font-weight="${weight}" font-style="${style}" text-anchor="${anchor}" dominant-baseline="middle"${haloAttrs}${rotate}>${escaped}</text>`;
}

function formatAngleLabelForDisplay(label) {
  const raw = String(label ?? "").trim();
  if (!raw) return raw;

  const match = raw.match(/^(.*?)\s*(?:degrees?|deg\.?|°)$/i);
  if (!match) return raw;

  const expression = match[1].trim();
  if (!expression) return raw;

  const alreadyWrapped = expression.startsWith("(") && expression.endsWith(")");
  const expressionWithoutLeadingSign = expression.replace(/^\s*[+-]\s*/, "");
  const needsParentheses = !alreadyWrapped && /[+-]/.test(expressionWithoutLeadingSign);
  return `${needsParentheses ? `(${expression})` : expression}°`;
}

function formatMathLabelForDisplay(label) {
  const superscriptChars = {
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
    "+": "⁺",
    "-": "⁻",
  };

  return String(label ?? "").replace(
    /\^(?:\{([+-]?\d+)\}|([+-]?\d+))/g,
    (match, bracedExponent, plainExponent) => {
      const exponent = bracedExponent ?? plainExponent;
      const formatted = [...exponent]
        .map((char) => superscriptChars[char])
        .join("");
      return formatted || match;
    }
  );
}

function rightAngleMark(x, y, size, dir1, dir2) {
  const s = size || 18;
  const p1x = x + dir1[0] * s, p1y = y + dir1[1] * s;
  const p2x = x + dir2[0] * s, p2y = y + dir2[1] * s;
  const cx = p1x + dir2[0] * s, cy = p1y + dir2[1] * s;
  return `<polyline points="${p1x},${p1y} ${cx},${cy} ${p2x},${p2y}" fill="none" stroke="${S.line}" stroke-width="1.5"/>`;
}

// Draw an angle arc at a vertex given its two neighbouring points. The arc
// always sits on the interior side — i.e. the side containing `interiorPt`
// (typically the shape's centroid). Returns { svg, labelPos } so the caller
// can place the angle label along the arc's bisector.
function drawAngleArc(vx, vy, n1, n2, interiorPt, opts = {}) {
  const arcR = opts.radius || 30;
  const lblR = arcR + (opts.labelGap || 24);
  const color = opts.color || S.angle;
  const width = opts.width || 1.6;

  const norm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  // Angles (SVG convention: +x right, +y down) from vertex to each neighbour
  const a1 = norm(Math.atan2(n1[1] - vy, n1[0] - vx));
  const a2 = norm(Math.atan2(n2[1] - vy, n2[0] - vx));
  const aInt = norm(Math.atan2(interiorPt[1] - vy, interiorPt[0] - vx));

  // Going CCW (in math / SVG-positive sweep) from a1: does the interior
  // direction appear before a2, or after? Pick the sweep that contains it.
  const sweepTo = (from, to) => norm(to - from);
  let start, end;
  if (sweepTo(a1, aInt) < sweepTo(a1, a2)) {
    start = a1; end = a2;
  } else {
    start = a2; end = a1;
  }

  // Ensure end > start for the arcOpen angular convention
  if (end < start) end += 2 * Math.PI;
  const sweepRad = end - start;
  const large = sweepRad > Math.PI ? 1 : 0;

  const x1 = vx + arcR * Math.cos(start);
  const y1 = vy + arcR * Math.sin(start);
  const x2 = vx + arcR * Math.cos(end);
  const y2 = vy + arcR * Math.sin(end);

  const path = `<path d="M ${x1} ${y1} A ${arcR} ${arcR} 0 ${large} 1 ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}"/>`;

  const midAng = (start + end) / 2;
  const labelPos = [vx + lblR * Math.cos(midAng), vy + lblR * Math.sin(midAng)];

  return { svg: path, labelPos };
}

// Filled triangular arrowhead with tip at (x, y) pointing in direction (dx, dy).
// Used for axis endpoints and to indicate that a plotted function continues
// beyond the visible plot boundary.
function arrowTip(x, y, dx, dy, opts = {}) {
  const color = opts.color || S.line;
  const length = opts.length || 10;
  const halfW = opts.halfW || 4;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len;
  const perpX = -uy, perpY = ux;
  const baseX = x - length * ux;
  const baseY = y - length * uy;
  const p1x = baseX + halfW * perpX, p1y = baseY + halfW * perpY;
  const p2x = baseX - halfW * perpX, p2y = baseY - halfW * perpY;
  return `<polygon points="${x},${y} ${p1x},${p1y} ${p2x},${p2y}" fill="${color}" stroke="none"/>`;
}

function midpoint(x1, y1, x2, y2) {
  return [(x1 + x2) / 2, (y1 + y2) / 2];
}

function labelOffset(x1, y1, x2, y2, dist = LBL) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return [-dy / len * dist, dx / len * dist];
}

function angleLabelCandidates(cx, cy, midDeg, arcR, opts = {}) {
  const baseGap = opts.baseGap || 24;
  const rad = (opts.svgDegrees ? midDeg : -midDeg) * Math.PI / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const anchor = dx > 0.3 ? "start" : dx < -0.3 ? "end" : "middle";
  const radii = [
    arcR + baseGap,
    arcR + baseGap + 24,
    arcR + baseGap + 48,
    arcR + baseGap + 72,
    arcR + baseGap + 96,
    arcR + baseGap + 124,
  ];
  const candidates = [];

  radii.forEach((radius) => {
    const x = cx + radius * dx;
    const y = cy + radius * dy;
    candidates.push({ x, y, anchor: "middle" });
    if (anchor !== "middle") candidates.push({ x, y, anchor });
  });

  return candidates;
}

class DiagramLayoutError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DiagramLayoutError";
    this.code = "DIAGRAM_LAYOUT_ERROR";
    this.details = details;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function polygonObstacles(points) {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return {
      type: "segment",
      segment: layoutSegment(point[0], point[1], next[0], next[1]),
    };
  });
}

function outwardNormalForEdge(start, end, interiorPoint) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const midpoint = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
  ];
  let normal = [-dy, dx];
  const pointsTowardInterior =
    (interiorPoint[0] - midpoint[0]) * normal[0] +
    (interiorPoint[1] - midpoint[1]) * normal[1] > 0;
  if (pointsTowardInterior) normal = [-normal[0], -normal[1]];
  return normal;
}

function formatDimensionLabel(spec, key, value) {
  if (Object.prototype.hasOwnProperty.call(spec.dimensionLabels || {}, key)) {
    return String(spec.dimensionLabels[key] ?? "").trim();
  }
  const unit = String(spec.unit || "").trim();
  return `${value}${unit ? ` ${unit}` : ""}`;
}

function formatAngleDimensionLabel(spec, key, value) {
  if (Object.prototype.hasOwnProperty.call(spec.dimensionLabels || {}, key)) {
    return String(spec.dimensionLabels[key] ?? "").trim();
  }
  return `${value}°`;
}

function dimensionLineGeometry(descriptor) {
  const [x1, y1] = descriptor.start;
  const [x2, y2] = descriptor.end;
  const [rawOutX, rawOutY] = descriptor.outward;
  const outLength = Math.hypot(rawOutX, rawOutY) || 1;
  const outX = rawOutX / outLength;
  const outY = rawOutY / outLength;
  const lineOffset = descriptor.lineOffset ?? 26;
  const extensionStart = descriptor.extensionStart ?? 5;
  const extensionEnd = descriptor.extensionEnd ?? lineOffset + 6;
  const lineStart = [x1 + outX * lineOffset, y1 + outY * lineOffset];
  const lineEnd = [x2 + outX * lineOffset, y2 + outY * lineOffset];
  const lineDx = x2 - x1;
  const lineDy = y2 - y1;
  const lineLength = Math.hypot(lineDx, lineDy) || 1;
  const alongX = lineDx / lineLength;
  const alongY = lineDy / lineLength;
  const segments = descriptor.showLine === false
    ? []
    : [
        [[x1 + outX * extensionStart, y1 + outY * extensionStart], [x1 + outX * extensionEnd, y1 + outY * extensionEnd]],
        [[x2 + outX * extensionStart, y2 + outY * extensionStart], [x2 + outX * extensionEnd, y2 + outY * extensionEnd]],
        [lineStart, lineEnd],
      ];

  return {
    ...descriptor,
    outX,
    outY,
    alongX,
    alongY,
    lineLength,
    lineOffset,
    lineStart,
    lineEnd,
    segments,
  };
}

function rotatedTextBox(label, candidate, opts = {}) {
  const base = estimateTextBox(label, {
    x: candidate.x,
    y: candidate.y,
    fontSize: opts.fontSize,
    padding: opts.padding,
    anchor: "middle",
  });
  if (Math.abs(opts.rotate || 0) % 180 !== 90) return base;
  return boxFromCenter(
    candidate.x,
    candidate.y,
    base.bottom - base.top,
    base.right - base.left
  );
}

function boxInsideBounds(value, bounds) {
  return value.left >= bounds.left &&
    value.right <= bounds.right &&
    value.top >= bounds.top &&
    value.bottom <= bounds.bottom;
}

function placeDimensionLabel(label, geometry, obstacles, bounds, opts = {}) {
  const fontSize = opts.fontSize || 19;
  const padding = 3;
  const parallelShifts = geometry.parallelShifts || [
    0,
    -40,
    40,
    -80,
    80,
    -120,
    120,
  ];
  const gaps = geometry.labelGaps || [22, 30, 42, 56, 72, 94, 116];
  const candidates = [];

  parallelShifts.forEach((shift) => {
    gaps.forEach((gap) => {
      candidates.push({
        x: (geometry.lineStart[0] + geometry.lineEnd[0]) / 2 +
          geometry.outX * gap + geometry.alongX * shift,
        y: (geometry.lineStart[1] + geometry.lineEnd[1]) / 2 +
          geometry.outY * gap + geometry.alongY * shift,
      });
    });
  });

  const scored = candidates.map((candidate, index) => {
    const labelBox = rotatedTextBox(label, candidate, {
      fontSize,
      padding,
      rotate: geometry.rotate,
    });
    return {
      ...candidate,
      index,
      box: labelBox,
      inBounds: boxInsideBounds(labelBox, bounds),
      score: scoreLabelCandidate(labelBox, obstacles, { minClearance: 5 }),
    };
  });
  const selected = scored.find((candidate) => candidate.inBounds && candidate.score.valid);
  if (!selected) {
    throw new DiagramLayoutError(
      `${geometry.type} diagram layout failed for ${geometry.key} label "${label}"`,
      {
        diagramType: geometry.type,
        dimension: geometry.key,
        label,
        candidates: scored.map((candidate) => ({
          index: candidate.index,
          inBounds: candidate.inBounds,
          collisions: candidate.score.collisions,
        })),
      }
    );
  }
  return selected;
}

function renderDimensionedShape({
  type,
  width,
  height,
  outlineSvg,
  outlineObstacles,
  detailSvg = "",
  detailObstacles = [],
  dimensions,
}) {
  const geometries = dimensions
    .filter((dimension) => dimension.label)
    .map((dimension) => dimensionLineGeometry({ ...dimension, type }));
  const dimensionObstacles = geometries.flatMap((geometry) =>
    geometry.segments.map((item) => ({
      type: "segment",
      segment: layoutSegment(item[0][0], item[0][1], item[1][0], item[1][1]),
    }))
  );
  const staticObstacles = [
    ...outlineObstacles,
    ...detailObstacles,
    ...dimensionObstacles,
  ];
  const placedLabelObstacles = [];
  const bounds = { left: 20, top: 20, right: width - 20, bottom: height - 20 };

  let svg = svgOpen(width, height);
  svg += outlineSvg;
  svg += detailSvg;
  geometries.forEach((geometry) => {
    geometry.segments.forEach((item) => {
      svg += line(item[0][0], item[0][1], item[1][0], item[1][1], {
        color: S.dim,
        width: 1.4,
        linecap: "butt",
      });
    });
  });
  geometries.forEach((geometry) => {
    const placed = placeDimensionLabel(
      geometry.label,
      geometry,
      [...staticObstacles, ...placedLabelObstacles],
      bounds
    );
    svg += text(placed.x, placed.y, geometry.label, {
      color: S.dim,
      size: 19,
      rotate: geometry.rotate,
    });
    placedLabelObstacles.push({ type: "box", box: placed.box });
  });
  svg += svgClose;
  return svg;
}

function renderDimensionedPolygon({ type, width, height, points, dimensions }) {
  return renderDimensionedShape({
    type,
    width,
    height,
    outlineSvg: polyline(points),
    outlineObstacles: polygonObstacles(points),
    dimensions,
  });
}

// ─── DIAGRAM GENERATORS ─────────────────────────────────────────────────────

const GENERATORS = {};

// 1. RIGHT TRIANGLE
GENERATORS["right-triangle"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const dims = spec.dimensions || { base: 8, height: 6, hypotenuse: 10 };
  const maxBase = Math.min(310, w - 290);
  const maxHeight = Math.min(250, h - 260);
  const ratio = dims.base / dims.height;
  let shapeBase = maxBase;
  let shapeHeight = shapeBase / ratio;
  if (shapeHeight > maxHeight) {
    shapeHeight = maxHeight;
    shapeBase = shapeHeight * ratio;
  }
  const left = (w - shapeBase) / 2;
  const bottom = (h + shapeHeight) / 2;
  const bottomLeft = [left, bottom];
  const bottomRight = [left + shapeBase, bottom];
  const topRight = [left + shapeBase, bottom - shapeHeight];
  const points = [bottomLeft, bottomRight, topRight];
  const markerSize = 14;
  const markerCorner = [bottomRight[0] - markerSize, bottomRight[1] - markerSize];
  const markerSegments = [
    [[bottomRight[0] - markerSize, bottomRight[1]], markerCorner],
    [markerCorner, [bottomRight[0], bottomRight[1] - markerSize]],
  ];

  return renderDimensionedShape({
    type: spec.type,
    width: w,
    height: h,
    outlineSvg: polyline(points),
    outlineObstacles: polygonObstacles(points),
    detailSvg: markerSegments.map((item) =>
      line(item[0][0], item[0][1], item[1][0], item[1][1], {
        width: 1.5,
        linecap: "butt",
      })
    ).join(""),
    detailObstacles: markerSegments.map((item) => ({
      type: "segment",
      segment: layoutSegment(item[0][0], item[0][1], item[1][0], item[1][1]),
    })),
    dimensions: [
      {
        key: "base",
        label: formatDimensionLabel(spec, "base", dims.base),
        start: bottomLeft,
        end: bottomRight,
        outward: [0, 1],
        showLine: false,
        lineOffset: 0,
        labelGaps: [22, 28, 36, 46],
      },
      {
        key: "height",
        label: formatDimensionLabel(spec, "height", dims.height),
        start: topRight,
        end: bottomRight,
        outward: [1, 0],
        rotate: -90,
        showLine: false,
        lineOffset: 0,
        labelGaps: [22, 28, 36, 46],
      },
      {
        key: "hypotenuse",
        label: dims.hypotenuse === null || dims.hypotenuse === undefined
          ? ""
          : formatDimensionLabel(spec, "hypotenuse", dims.hypotenuse),
        start: topRight,
        end: bottomLeft,
        outward: [-shapeHeight, -shapeBase],
        showLine: false,
        lineOffset: 0,
        labelGaps: [24, 30, 38, 48, 60],
        parallelShifts: [0, -24, 24, -48, 48],
      },
    ],
  });
};

// 2. GENERAL TRIANGLE
GENERATORS["triangle"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const dims = spec.dimensions || {
    base: 8,
    leftSide: 6,
    rightSide: 7,
  };
  const hasSideLengths =
    dims.leftSide !== null && dims.leftSide !== undefined &&
    dims.rightSide !== null && dims.rightSide !== undefined;
  const semanticApexX = hasSideLengths
    ? (dims.leftSide ** 2 + dims.base ** 2 - dims.rightSide ** 2) / (2 * dims.base)
    : dims.base * 0.42;
  const semanticHeight = hasSideLengths
    ? Math.sqrt(Math.max(0, dims.leftSide ** 2 - semanticApexX ** 2))
    : dims.height;
  const minX = Math.min(0, dims.base, semanticApexX);
  const maxX = Math.max(0, dims.base, semanticApexX);
  const semanticWidth = maxX - minX;
  const maxShapeWidth = Math.min(330, w - 270);
  const maxShapeHeight = Math.min(235, h - 255);
  const scale = Math.min(
    maxShapeWidth / semanticWidth,
    maxShapeHeight / semanticHeight
  );
  const shapeWidth = semanticWidth * scale;
  const shapeHeight = semanticHeight * scale;
  const left = (w - shapeWidth) / 2;
  const bottom = (h + shapeHeight) / 2;
  const pointFor = (semanticX, semanticY) => [
    left + (semanticX - minX) * scale,
    bottom - semanticY * scale,
  ];
  const bottomLeft = pointFor(0, 0);
  const bottomRight = pointFor(dims.base, 0);
  const apex = pointFor(semanticApexX, semanticHeight);
  const foot = pointFor(semanticApexX, 0);
  const points = [bottomLeft, bottomRight, apex];
  const centroid = [
    (bottomLeft[0] + bottomRight[0] + apex[0]) / 3,
    (bottomLeft[1] + bottomRight[1] + apex[1]) / 3,
  ];
  const includesHeight = dims.height !== null && dims.height !== undefined;
  const heightIsLeftOfBase = foot[0] < bottomLeft[0];
  const heightIsRightOfBase = foot[0] > bottomRight[0];
  const heightLabelOutward = heightIsLeftOfBase
    ? [-1, 0]
    : heightIsRightOfBase
      ? [1, 0]
      : [1, 0];
  const markerHorizontal = heightIsLeftOfBase || (!heightIsRightOfBase)
    ? [1, 0]
    : [-1, 0];
  const markerSize = 13;
  const markerHorizontalPoint = [
    foot[0] + markerHorizontal[0] * markerSize,
    foot[1],
  ];
  const markerVerticalPoint = [foot[0], foot[1] - markerSize];
  const markerCorner = [
    markerHorizontalPoint[0],
    markerVerticalPoint[1],
  ];
  const markerSegments = includesHeight
    ? [
        [markerHorizontalPoint, markerCorner],
        [markerCorner, markerVerticalPoint],
      ]
    : [];
  const baseExtension = includesHeight && heightIsLeftOfBase
    ? [foot, bottomLeft]
    : includesHeight && heightIsRightOfBase
      ? [bottomRight, foot]
      : null;
  const detailSegments = includesHeight
    ? [[apex, foot], ...(baseExtension ? [baseExtension] : []), ...markerSegments]
    : [];
  const detailSvg = includesHeight
    ? [
        line(apex[0], apex[1], foot[0], foot[1], {
          color: S.dash,
          width: 1.5,
          dash: "7 6",
          linecap: "butt",
        }),
        baseExtension
          ? line(
              baseExtension[0][0],
              baseExtension[0][1],
              baseExtension[1][0],
              baseExtension[1][1],
              {
                color: S.dash,
                width: 1.5,
                dash: "7 6",
                linecap: "butt",
              }
            )
          : "",
        ...markerSegments.map((segment) =>
          line(
            segment[0][0],
            segment[0][1],
            segment[1][0],
            segment[1][1],
            { width: 1.5, linecap: "butt" }
          )
        ),
      ].join("")
    : "";

  return renderDimensionedShape({
    type: spec.type,
    width: w,
    height: h,
    outlineSvg: polyline(points),
    outlineObstacles: polygonObstacles(points),
    detailSvg,
    detailObstacles: detailSegments.map((segment) => ({
      type: "segment",
      segment: layoutSegment(
        segment[0][0],
        segment[0][1],
        segment[1][0],
        segment[1][1]
      ),
    })),
    dimensions: [
      {
        key: "base",
        label: formatDimensionLabel(spec, "base", dims.base),
        start: bottomLeft,
        end: bottomRight,
        outward: outwardNormalForEdge(bottomLeft, bottomRight, centroid),
        showLine: false,
        lineOffset: 0,
        labelGaps: [22, 28, 36, 46],
      },
      {
        key: "leftSide",
        label: hasSideLengths
          ? formatDimensionLabel(spec, "leftSide", dims.leftSide)
          : "",
        start: bottomLeft,
        end: apex,
        outward: outwardNormalForEdge(bottomLeft, apex, centroid),
        showLine: false,
        lineOffset: 0,
        labelGaps: [22, 28, 36, 46, 58],
        parallelShifts: [0, -18, 18, -36, 36],
      },
      {
        key: "rightSide",
        label: hasSideLengths
          ? formatDimensionLabel(spec, "rightSide", dims.rightSide)
          : "",
        start: apex,
        end: bottomRight,
        outward: outwardNormalForEdge(apex, bottomRight, centroid),
        showLine: false,
        lineOffset: 0,
        labelGaps: [22, 28, 36, 46, 58],
        parallelShifts: [0, -18, 18, -36, 36],
      },
      {
        key: "height",
        label: includesHeight
          ? formatDimensionLabel(spec, "height", dims.height)
          : "",
        start: apex,
        end: foot,
        outward: heightLabelOutward,
        rotate: -90,
        showLine: false,
        lineOffset: 0,
        labelGaps: [20, 26, 34, 44],
        parallelShifts: [0, -20, 20, -40, 40],
      },
    ],
  });
};

// 3. RECTANGLE
GENERATORS["rectangle"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const dimensions = spec.dimensions || { width: 12, height: 7 };
  const rw = Math.min(320, w - 300);
  const rh = Math.min(220, h - 260);
  const rx = (w - rw) / 2;
  const ry = (h - rh) / 2;
  const points = [
    [rx, ry],
    [rx + rw, ry],
    [rx + rw, ry + rh],
    [rx, ry + rh],
  ];

  return renderDimensionedPolygon({
    type: spec.type,
    spec,
    width: w,
    height: h,
    points,
    dimensions: [
      {
        key: "width",
        label: formatDimensionLabel(spec, "width", dimensions.width),
        start: points[3],
        end: points[2],
        outward: [0, 1],
      },
      {
        key: "height",
        label: formatDimensionLabel(spec, "height", dimensions.height),
        start: points[1],
        end: points[2],
        outward: [1, 0],
        rotate: -90,
      },
    ],
  });
};

// 4. PARALLELOGRAM
GENERATORS["parallelogram"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const offset = 70;
  const pw = (w - PAD * 2) * 0.68;
  const ph = (h - PAD * 2) * 0.48;
  const bx = PAD + 50, by = h - PAD - 30;

  const pts = [
    [bx + offset, by - ph],
    [bx + offset + pw, by - ph],
    [bx + pw, by],
    [bx, by],
  ];

  let svg = svgOpen(w, h);
  svg += polyline(pts);

  // Height dropped from the top-left corner straight down to the base line
  svg += line(pts[0][0], pts[0][1], pts[0][0], by, { dash: "6,4", color: S.dash });

  svg += text((pts[3][0] + pts[2][0]) / 2, by + LBL, spec.base || "", { color: S.dim, size: 20 });
  svg += text(pts[0][0] + 10, (pts[0][1] + by) / 2, spec.height_label || spec.dimHeight || "", { color: S.dim, size: 20, anchor: "start" });
  svg += text((pts[0][0] + pts[3][0]) / 2 - LBL, (pts[0][1] + by) / 2, spec.side || "", { color: S.dim, size: 20 });

  svg += svgClose;
  return svg;
};

// 5. TRAPEZIUM
GENERATORS["trapezium"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const topW = 180, botW = 360;
  const trapH = 220;
  const cx = w / 2, bot = h - PAD - 30;

  const pts = [
    [cx - topW / 2, bot - trapH],
    [cx + topW / 2, bot - trapH],
    [cx + botW / 2, bot],
    [cx - botW / 2, bot],
  ];

  let svg = svgOpen(w, h);
  svg += polyline(pts);

  svg += line(cx - topW / 2, pts[0][1], cx - topW / 2, bot, { dash: "6,4", color: S.dash });

  svg += text(cx, pts[0][1] - LBL_TIGHT, spec.topBase || "", { color: S.dim, size: 20 });
  svg += text(cx, bot + LBL, spec.bottomBase || "", { color: S.dim, size: 20 });
  svg += text(cx - topW / 2 + LBL_TIGHT + 4, (pts[0][1] + bot) / 2, spec.dimHeight || spec.height_label || "", { color: S.dim, size: 20 });

  svg += svgClose;
  return svg;
};

// 6. CIRCLE
GENERATORS["circle"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const dims = spec.dimensions || { radius: 5 };
  const cx = w / 2, cy = h / 2;
  const r = Math.min(170, Math.min(w - 220, h - 180) / 2);
  const usesRadius = dims.radius !== null && dims.radius !== undefined;
  const measurementStart = usesRadius ? [cx, cy] : [cx - r, cy];
  const measurementEnd = [cx + r, cy];
  const measurementKey = usesRadius ? "radius" : "diameter";
  const measurementValue = usesRadius ? dims.radius : dims.diameter;
  const measurementSegment = [measurementStart, measurementEnd];

  return renderDimensionedShape({
    type: spec.type,
    width: w,
    height: h,
    outlineSvg: circle(cx, cy, r),
    outlineObstacles: [{
      type: "arc",
      arc: { cx, cy, r, startDeg: 0, endDeg: 360, strokeWidth: S.lw },
    }],
    detailSvg:
      line(
        measurementStart[0],
        measurementStart[1],
        measurementEnd[0],
        measurementEnd[1],
        { color: S.dim, width: 1.5, linecap: "butt" }
      ) +
      `<circle cx="${cx}" cy="${cy}" r="3" fill="${S.line}"/>`,
    detailObstacles: [{
      type: "segment",
      segment: layoutSegment(
        measurementSegment[0][0],
        measurementSegment[0][1],
        measurementSegment[1][0],
        measurementSegment[1][1]
      ),
    }],
    dimensions: [{
      key: measurementKey,
      label: formatDimensionLabel(spec, measurementKey, measurementValue),
      start: measurementStart,
      end: measurementEnd,
      outward: [0, -1],
      showLine: false,
      lineOffset: 0,
      labelGaps: [20, 26, 34, 44],
      parallelShifts: [0, -24, 24, -48, 48],
    }],
  });
};

// 7. CIRCLE SECTOR
GENERATORS["circle-sector"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const dims = spec.dimensions || { radius: 6, angle: 120 };
  const cx = w / 2, cy = h / 2;
  const r = Math.min(170, Math.min(w - 220, h - 180) / 2);
  const angle = dims.angle;
  const startDeg = -angle / 2;
  const endDeg = angle / 2;
  const startRad = startDeg * Math.PI / 180;
  const endRad = endDeg * Math.PI / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const startPoint = [x1, y1];
  const endPoint = [x2, y2];
  const center = [cx, cy];
  const outlineObstacles = [
    { type: "segment", segment: layoutSegment(cx, cy, x1, y1) },
    { type: "segment", segment: layoutSegment(x2, y2, cx, cy) },
    {
      type: "arc",
      arc: { cx, cy, r, startDeg, endDeg, strokeWidth: S.lw },
    },
  ];
  const arcR = Math.min(48, r * 0.28);
  const angleArcObstacle = {
    type: "arc",
    arc: { cx, cy, r: arcR, startDeg, endDeg, strokeWidth: 1.6 },
  };
  const angleLabel = formatAngleDimensionLabel(spec, "angle", angle);
  const placedAngleLabel = chooseTextCandidate(
    angleLabel,
    angleLabelCandidates(cx, cy, 0, arcR, { svgDegrees: true, baseGap: 18 }),
    [...outlineObstacles, angleArcObstacle],
    { fontSize: 19, padding: 3, minClearance: 6 }
  );
  const angleLabelObstacle = {
    type: "box",
    box: estimateTextBox(angleLabel, {
      x: placedAngleLabel.x,
      y: placedAngleLabel.y,
      fontSize: 19,
      padding: 3,
      anchor: placedAngleLabel.anchor,
    }),
  };
  const interiorPoint = [cx + r * 0.45, cy];

  return renderDimensionedShape({
    type: spec.type,
    width: w,
    height: h,
    outlineSvg:
      line(cx, cy, x1, y1, { linecap: "butt" }) +
      arcOpen(cx, cy, r, startDeg, endDeg, { linecap: "butt" }) +
      line(x2, y2, cx, cy, { linecap: "butt" }),
    outlineObstacles,
    detailSvg:
      `<circle cx="${cx}" cy="${cy}" r="3" fill="${S.line}"/>` +
      arcOpen(cx, cy, arcR, startDeg, endDeg, { color: S.angle, width: 1.6 }) +
      text(placedAngleLabel.x, placedAngleLabel.y, angleLabel, {
        color: S.angle,
        size: 19,
        anchor: placedAngleLabel.anchor,
      }),
    detailObstacles: [angleArcObstacle, angleLabelObstacle],
    dimensions: [{
      key: "radius",
      label: formatDimensionLabel(spec, "radius", dims.radius),
      start: center,
      end: startPoint,
      outward: outwardNormalForEdge(center, startPoint, interiorPoint),
      showLine: false,
      lineOffset: 0,
      labelGaps: [20, 26, 34, 44, 56],
      parallelShifts: [0, -20, 20, -40, 40],
    }],
  });
};

// 8. ELEVATION (angle of elevation)
GENERATORS["elevation"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const ox = PAD + 60, oy = h - PAD - 50;
  const tx = w - PAD - 80, ty = PAD + 60;
  const bx = tx;

  let svg = svgOpen(w, h);

  // Ground line
  svg += line(ox - 35, oy, tx + 55, oy, { width: 2 });

  // Vertical object
  svg += line(bx, oy, bx, ty, { width: 3 });
  // Height dimension line (right of the object) with leader ticks at top & bottom
  const hDimX = bx + LBL_TIGHT;
  svg += line(hDimX, ty, hDimX, oy, { color: S.dim, width: 1.2 });
  svg += line(hDimX - 6, ty, hDimX + 6, ty, { color: S.dim, width: 1 });
  svg += line(hDimX - 6, oy, hDimX + 6, oy, { color: S.dim, width: 1 });
  svg += text(hDimX + 12, (oy + ty) / 2, spec.height || "", { color: S.dim, size: 20, anchor: "start" });

  // Line of sight
  svg += line(ox, oy - 35, bx, ty, { dash: "10,6", color: S.dash, width: 2 });

  // Horizontal from observer
  svg += line(ox, oy - 35, bx, oy - 35, { dash: "5,4", color: "#888", width: 1 });

  // Horizontal distance dimension line (below ground) with leader ticks
  const dDimY = oy + LBL - 4;
  svg += line(ox, dDimY, bx, dDimY, { color: S.dim, width: 1.2 });
  svg += line(ox, dDimY - 6, ox, dDimY + 6, { color: S.dim, width: 1 });
  svg += line(bx, dDimY - 6, bx, dDimY + 6, { color: S.dim, width: 1 });
  svg += text((ox + bx) / 2, dDimY + 18, spec.distance || "", { color: S.dim, size: 20 });

  // Angle marker — just the arc, no fill
  const arcR = 58;
  const elevAngle = Math.atan2((oy - 35) - ty, bx - ox) * 180 / Math.PI;
  svg += arcOpen(ox, oy - 35, arcR, -elevAngle, 0, { color: S.angle, width: 1.8 });
  svg += text(ox + arcR + 22, oy - 58, formatAngleLabelForDisplay(spec.angle || ""), { color: S.angle, size: 20 });

  // Labels
  svg += text(ox, oy + LBL + 10, spec.observerLabel || "Observer", { size: 18 });
  svg += text(bx, ty - LBL_TIGHT, spec.objectLabel || "", { size: 18 });

  // Simple stick observer
  svg += `<circle cx="${ox}" cy="${oy - 50}" r="9" fill="none" stroke="${S.line}" stroke-width="2"/>`;
  svg += line(ox, oy - 41, ox, oy - 8, { width: 2 });
  svg += line(ox, oy - 8, ox - 8, oy, { width: 1.5 });
  svg += line(ox, oy - 8, ox + 8, oy, { width: 1.5 });

  svg += svgClose;
  return svg;
};

// 9. DEPRESSION (angle of depression)
GENERATORS["depression"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const ox = PAD + 50, oy = PAD + 80;
  const tx = w - PAD - 70, ty = h - PAD - 50;

  let svg = svgOpen(w, h);

  // Cliff / elevated surface
  svg += line(ox - 30, oy, ox + 110, oy, { width: 2 });
  svg += line(ox, oy, ox, ty + 10, { width: 3 });

  // Ground
  svg += line(ox - 30, ty, tx + 55, ty, { width: 2 });

  // Line of sight
  svg += line(ox, oy, tx, ty, { dash: "10,6", color: S.dash, width: 2 });

  // Horizontal from observer
  svg += line(ox, oy, tx + 35, oy, { dash: "5,4", color: "#888", width: 1.2 });

  // Angle marker
  const arcR = 58;
  const ang = Math.atan2(ty - oy, tx - ox) * 180 / Math.PI;
  svg += arcOpen(ox, oy, arcR, 0, ang, { color: S.angle, width: 1.8 });
  svg += text(ox + arcR + 22, oy + 34, formatAngleLabelForDisplay(spec.angle || ""), { color: S.angle, size: 20 });

  svg += text(ox + 8, oy - LBL_TIGHT, spec.observerLabel || "Observer", { size: 18, anchor: "start" });
  svg += text(tx + 15, ty - LBL_TIGHT, spec.objectLabel || "Object", { size: 18, anchor: "start" });

  // Distance dimension line (below ground) with leader ticks at the observer and target
  const dDimY = ty + LBL - 4;
  svg += line(ox, dDimY, tx, dDimY, { color: S.dim, width: 1.2 });
  svg += line(ox, dDimY - 6, ox, dDimY + 6, { color: S.dim, width: 1 });
  svg += line(tx, dDimY - 6, tx, dDimY + 6, { color: S.dim, width: 1 });
  svg += text((ox + tx) / 2, dDimY + 18, spec.distance || "", { color: S.dim, size: 20 });

  // Height dimension line (left of the cliff) with leader ticks at top & bottom
  const hDimX = ox - LBL_GENEROUS + 6;
  svg += line(hDimX, oy, hDimX, ty, { color: S.dim, width: 1.2 });
  svg += line(hDimX - 6, oy, hDimX + 6, oy, { color: S.dim, width: 1 });
  svg += line(hDimX - 6, ty, hDimX + 6, ty, { color: S.dim, width: 1 });
  svg += text(hDimX - 8, (oy + ty) / 2, spec.height || "", { color: S.dim, size: 20, anchor: "end" });

  svg += svgClose;
  return svg;
};

// 10. RECTANGULAR PRISM
GENERATORS["prism-rect"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const pw = 260, ph = 160, pd = 100;
  const ox = PAD + 50, oy = h - PAD - 50;

  const f = [[ox, oy], [ox + pw, oy], [ox + pw, oy - ph], [ox, oy - ph]];
  const b = f.map(([x, y]) => [x + pd * 0.7, y - pd * 0.5]);

  let svg = svgOpen(w, h);

  // Hidden edges (dashed) — drawn first so solid edges sit on top if overlapping
  svg += line(b[0][0], b[0][1], b[1][0], b[1][1], { dash: "5,4", color: "#888", width: 1.2 });
  svg += line(b[0][0], b[0][1], b[3][0], b[3][1], { dash: "5,4", color: "#888", width: 1.2 });
  svg += line(b[0][0], b[0][1], f[0][0], f[0][1], { dash: "5,4", color: "#888", width: 1.2 });

  // Visible front face
  svg += polyline(f);
  // Top face — two back edges + vertical to front
  svg += line(f[3][0], f[3][1], b[3][0], b[3][1]);
  svg += line(b[3][0], b[3][1], b[2][0], b[2][1]);
  svg += line(b[2][0], b[2][1], f[2][0], f[2][1]);
  // Right face — back edges
  svg += line(f[1][0], f[1][1], b[1][0], b[1][1]);
  svg += line(b[1][0], b[1][1], b[2][0], b[2][1]);

  svg += text((f[0][0] + f[1][0]) / 2, f[0][1] + LBL, spec.length || spec.dimLength || "", { color: S.dim, size: 20 });
  svg += text(f[1][0] + LBL, (f[1][1] + f[2][1]) / 2, spec.dimHeight || spec.height_label || "", { color: S.dim, size: 20 });

  // Depth dimension — along the upper-left depth edge (f[3] → b[3]). Its
  // outward perpendicular is up-left, which is genuinely outside the prism
  // (the right depth edge's perpendiculars both go into faces, so a parallel
  // dim line over there isn't possible without crossing the top/right face).
  const ddx = b[3][0] - f[3][0], ddy = b[3][1] - f[3][1];
  const dLen = Math.sqrt(ddx * ddx + ddy * ddy);
  const opx = ddy / dLen, opy = -ddx / dLen;       // up-left perpendicular
  const dimOff = 22;
  const dimX1 = f[3][0] + opx * dimOff, dimY1 = f[3][1] + opy * dimOff;
  const dimX2 = b[3][0] + opx * dimOff, dimY2 = b[3][1] + opy * dimOff;
  // Parallel dim line + extension lines from the depth edge corners
  svg += line(dimX1, dimY1, dimX2, dimY2, { color: S.dim, width: 1.2 });
  svg += line(f[3][0], f[3][1], dimX1, dimY1, { color: S.dim, width: 1 });
  svg += line(b[3][0], b[3][1], dimX2, dimY2, { color: S.dim, width: 1 });
  // Tick marks at each end of the dim line, perpendicular to the dim line
  const tx = (ddx / dLen) * 5, ty_ = (ddy / dLen) * 5;
  svg += line(dimX1 - tx, dimY1 - ty_, dimX1 + tx, dimY1 + ty_, { color: S.dim, width: 1 });
  svg += line(dimX2 - tx, dimY2 - ty_, dimX2 + tx, dimY2 + ty_, { color: S.dim, width: 1 });
  // Depth label, sitting on the dim line midpoint with a small outward offset
  const lblOff = 14;
  svg += text((dimX1 + dimX2) / 2 + opx * lblOff, (dimY1 + dimY2) / 2 + opy * lblOff,
    spec.dimWidth || spec.width_label || "", { color: S.dim, size: 20 });

  svg += svgClose;
  return svg;
};

// 11. TRIANGULAR PRISM
GENERATORS["prism-tri"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const bw = 220, bh = 170, depth = 120;
  const cx = w / 2, bot = h - PAD - 40;

  const f = [[cx - bw / 2, bot], [cx + bw / 2, bot], [cx, bot - bh]];
  const b = f.map(([x, y]) => [x + depth * 0.65, y - depth * 0.35]);

  let svg = svgOpen(w, h);

  // Hidden edges
  svg += line(b[0][0], b[0][1], b[1][0], b[1][1], { dash: "5,4", color: "#888", width: 1.2 });
  svg += line(b[0][0], b[0][1], f[0][0], f[0][1], { dash: "5,4", color: "#888", width: 1.2 });
  svg += line(b[0][0], b[0][1], b[2][0], b[2][1], { dash: "5,4", color: "#888", width: 1.2 });

  // Visible front triangle
  svg += polyline(f);
  // Back triangle visible edges
  svg += line(b[1][0], b[1][1], b[2][0], b[2][1]);
  // Connecting edges
  svg += line(f[1][0], f[1][1], b[1][0], b[1][1]);
  svg += line(f[2][0], f[2][1], b[2][0], b[2][1]);

  svg += text(cx, bot + LBL, spec.base || "", { color: S.dim, size: 20 });
  svg += text(cx - bw / 2 - LBL, (bot + f[2][1]) / 2, spec.dimHeight || "", { color: S.dim, size: 20 });
  // Length label — outside the back-bottom edge (f[1] → b[1]). Place it BELOW
  // the edge, offset further right than before so it clears b[1] entirely.
  const lenMidX = (f[1][0] + b[1][0]) / 2;
  const lenMidY = (f[1][1] + b[1][1]) / 2;
  svg += text(lenMidX + 30, lenMidY + 28, spec.length || "", { color: S.dim, size: 20, anchor: "start" });

  svg += svgClose;
  return svg;
};

// 12. CYLINDER
GENERATORS["cylinder"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const cx = w / 2;
  const rx = 110, ry = 30;
  const cylH = 220;
  const topY = PAD + 90;
  const botY = topY + cylH;

  let svg = svgOpen(w, h);

  // Back half of top ellipse (dashed — hidden)
  svg += `<path d="M ${cx - rx} ${topY} A ${rx} ${ry} 0 0 0 ${cx + rx} ${topY}" fill="none" stroke="#888" stroke-width="1.2" stroke-dasharray="5,4"/>`;

  // Front half of top ellipse
  svg += `<path d="M ${cx - rx} ${topY} A ${rx} ${ry} 0 0 1 ${cx + rx} ${topY}" fill="none" stroke="${S.line}" stroke-width="${S.lw}"/>`;

  // Sides
  svg += line(cx - rx, topY, cx - rx, botY);
  svg += line(cx + rx, topY, cx + rx, botY);

  // Bottom ellipse — full outline
  svg += ellipseSvg(cx, botY, rx, ry);

  // Height dimension (right side, with leader ticks)
  svg += line(cx + rx + LBL, topY, cx + rx + LBL, botY, { color: S.dim, width: 1.2 });
  svg += line(cx + rx + LBL - 6, topY, cx + rx + LBL + 6, topY, { color: S.dim, width: 1 });
  svg += line(cx + rx + LBL - 6, botY, cx + rx + LBL + 6, botY, { color: S.dim, width: 1 });
  svg += text(cx + rx + LBL + 22, (topY + botY) / 2, spec.dimHeight || spec.height_label || "", { color: S.dim, size: 20, anchor: "start" });

  // Radius — dashed line from centre of top ellipse to its right edge
  svg += line(cx, topY, cx + rx, topY, { color: S.dim, width: 1.2, dash: "4,3" });
  svg += `<circle cx="${cx}" cy="${topY}" r="2.5" fill="${S.dim}"/>`;
  // Label sits well above the top ellipse apex (which is at topY - ry = topY - 30)
  svg += text(cx + rx / 2, topY - ry - 18, spec.radius || "", { color: S.dim, size: 20 });

  svg += svgClose;
  return svg;
};

// 13. PARALLEL LINES
GENERATORS["parallel-lines"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const labels = spec.labels || {};
  const angles = spec.angles || {};

  const y1 = h * 0.32, y2 = h * 0.68;
  const lx = PAD, rx = w - PAD;
  const t1x = w * 0.3, t1y = PAD - 10;
  const t2x = w * 0.7, t2y = h - PAD + 10;

  const slope = (t2y - t1y) / (t2x - t1x);
  const ix1 = t1x + (y1 - t1y) / slope;
  const ix2 = t1x + (y2 - t1y) / slope;

  let svg = svgOpen(w, h);

  svg += line(lx, y1, rx, y1, { width: 2 });
  svg += line(lx, y2, rx, y2, { width: 2 });

  // Parallel-arrow glyphs
  svg += text(rx - 30, y1 - 14, "▸", { size: 18 });
  svg += text(rx - 30, y2 - 14, "▸", { size: 18 });

  svg += line(t1x, t1y, t2x, t2y, { width: 2 });

  svg += text(lx - 22, y1, labels.line1 || "l", { italic: true, size: 22 });
  svg += text(lx - 22, y2, labels.line2 || "m", { italic: true, size: 22 });
  svg += text(t2x + 18, t2y - 5, labels.transversal || "t", { italic: true, size: 22 });

  // Transversal direction (from its upper end to its lower end) — both angles
  // are drawn in the lower-right sector at each intersection. Labels are
  // scored against the drawn lines so long labels do not sit on the transversal.
  const transAng = Math.atan2(t2y - t1y, t2x - t1x);
  const arcR = 26;
  const lineObstacles = [
    { type: "segment", segment: layoutSegment(lx, y1, rx, y1) },
    { type: "segment", segment: layoutSegment(lx, y2, rx, y2) },
    { type: "segment", segment: layoutSegment(t1x, t1y, t2x, t2y) },
  ];
  const placedLabelObstacles = [];

  const placeAngleLabel = (cx, cy, label) => {
    const displayLabel = formatAngleLabelForDisplay(label);
    const candidates = angleLabelCandidates(
      cx,
      cy,
      transAng * 90 / Math.PI,
      arcR,
      { svgDegrees: true }
    );
    const placed = chooseTextCandidate(displayLabel, candidates, [
      ...lineObstacles,
      ...placedLabelObstacles,
    ], { fontSize: 20, minClearance: 8 });

    placedLabelObstacles.push({ type: "box", box: placed.box });
    return text(placed.x, placed.y, displayLabel, { color: S.angle, size: 20, anchor: placed.anchor });
  };

  if (angles.top) {
    svg += arcOpen(ix1, y1, arcR, 0, transAng * 180 / Math.PI, { color: S.angle, width: 1.6 });
    svg += placeAngleLabel(ix1, y1, angles.top);
  }
  if (angles.bottom) {
    svg += arcOpen(ix2, y2, arcR, 0, transAng * 180 / Math.PI, { color: S.angle, width: 1.6 });
    svg += placeAngleLabel(ix2, y2, angles.bottom);
  }

  svg += svgClose;
  return svg;
};

// 14. NUMBER LINE
GENERATORS["number-line"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || 170;
  const min = spec.min || 0, max = spec.max || 10;
  const marks = spec.marks || [];

  const lx = PAD + 20, rx = w - PAD - 20;
  const cy = h / 2;
  const range = max - min;

  let svg = svgOpen(w, h);

  svg += line(lx - 18, cy, rx + 18, cy, { width: 2 });
  svg += `<polygon points="${rx + 18},${cy} ${rx + 6},${cy - 6} ${rx + 6},${cy + 6}" fill="${S.line}"/>`;
  svg += `<polygon points="${lx - 18},${cy} ${lx - 6},${cy - 6} ${lx - 6},${cy + 6}" fill="${S.line}"/>`;

  const step = spec.step || 1;
  for (let v = min; v <= max; v += step) {
    const x = lx + (v - min) / range * (rx - lx);
    svg += line(x, cy - 10, x, cy + 10, { width: 1.5 });
    svg += text(x, cy + 28, String(v), { size: 19 });
  }

  marks.forEach(m => {
    const x = lx + (m.value - min) / range * (rx - lx);
    svg += `<circle cx="${x}" cy="${cy}" r="6" fill="${m.open ? S.bg : S.angle}" stroke="${S.angle}" stroke-width="2"/>`;
    if (m.label) svg += text(x, cy - 22, m.label, { color: S.angle, size: 19 });
  });

  svg += svgClose;
  return svg;
};

// 15. COORDINATE PLANE
GENERATORS["coordinate-plane"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const minX = spec.minX || -5, maxX = spec.maxX || 5;
  const minY = spec.minY || -5, maxY = spec.maxY || 5;
  const points = spec.points || [];

  const lx = PAD + 10, rx = w - PAD - 10;
  const ty = PAD + 10, by = h - PAD - 10;
  const rangeX = maxX - minX, rangeY = maxY - minY;

  const toSvgX = v => lx + (v - minX) / rangeX * (rx - lx);
  const toSvgY = v => by - (v - minY) / rangeY * (by - ty);
  const originX = toSvgX(0), originY = toSvgY(0);

  let svg = svgOpen(w, h);

  // Grid
  for (let x = Math.ceil(minX); x <= maxX; x++) {
    const sx = toSvgX(x);
    svg += line(sx, ty, sx, by, { color: "#DDDDDD", width: 0.5 });
  }
  for (let y = Math.ceil(minY); y <= maxY; y++) {
    const sy = toSvgY(y);
    svg += line(lx, sy, rx, sy, { color: "#DDDDDD", width: 0.5 });
  }

  svg += line(lx, originY, rx, originY, { width: 2 });
  svg += line(originX, ty, originX, by, { width: 2 });

  for (let x = Math.ceil(minX); x <= maxX; x++) {
    if (x === 0) continue;
    svg += text(toSvgX(x), originY + 20, String(x), { size: 17 });
  }
  for (let y = Math.ceil(minY); y <= maxY; y++) {
    if (y === 0) continue;
    svg += text(originX - 20, toSvgY(y), String(y), { size: 17 });
  }
  svg += text(rx + 14, originY, "x", { italic: true, size: 20 });
  svg += text(originX + 14, ty - 8, "y", { italic: true, size: 20 });
  svg += text(originX - 14, originY + 20, "O", { size: 18 });

  points.forEach(p => {
    const px = toSvgX(p.x), py = toSvgY(p.y);
    svg += `<circle cx="${px}" cy="${py}" r="4.5" fill="${S.angle}"/>`;
    if (p.label) {
      // For points below the x-axis, place label BELOW the point so it doesn't
      // collide with the x-axis tick labels just above.
      const below = p.y < 0;
      const yOffset = below ? 20 : -14;
      svg += text(px + 12, py + yOffset, p.label, { size: 18, color: S.angle, anchor: "start" });
    }
  });

  svg += svgClose;
  return svg;
};

// 16. L-SHAPE
GENERATORS["L-shape"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const dims = spec.dimensions || {
    totalWidth: 10,
    totalHeight: 8,
    cutoutWidth: 5,
    cutoutHeight: 4,
  };
  const shapeWidth = Math.min(320, w - 280);
  const shapeHeight = Math.min(240, h - 260);
  const cutoutWidth = shapeWidth * clamp(dims.cutoutWidth / dims.totalWidth, 0.28, 0.62);
  const cutoutHeight = shapeHeight * clamp(dims.cutoutHeight / dims.totalHeight, 0.28, 0.62);
  const compactCutout = cutoutWidth < 130 && cutoutHeight < 100;
  const ox = (w - shapeWidth) / 2;
  const oy = (h - shapeHeight) / 2;

  const pts = [
    [ox, oy],
    [ox + shapeWidth, oy],
    [ox + shapeWidth, oy + shapeHeight - cutoutHeight],
    [ox + shapeWidth - cutoutWidth, oy + shapeHeight - cutoutHeight],
    [ox + shapeWidth - cutoutWidth, oy + shapeHeight],
    [ox, oy + shapeHeight],
  ];
  return renderDimensionedPolygon({
    type: spec.type,
    spec,
    width: w,
    height: h,
    points: pts,
    dimensions: [
      {
        key: "totalWidth",
        label: formatDimensionLabel(spec, "totalWidth", dims.totalWidth),
        start: pts[0],
        end: pts[1],
        outward: [0, -1],
      },
      {
        key: "totalHeight",
        label: formatDimensionLabel(spec, "totalHeight", dims.totalHeight),
        start: pts[0],
        end: pts[5],
        outward: [-1, 0],
        rotate: -90,
      },
      {
        key: "cutoutHeight",
        label: formatDimensionLabel(spec, "cutoutHeight", dims.cutoutHeight),
        start: pts[3],
        end: pts[4],
        outward: [1, 0],
        rotate: -90,
        lineOffset: compactCutout ? 10 : 16,
        extensionStart: 2,
        extensionEnd: compactCutout ? 13 : 19,
        labelGaps: [14, 18, 22, 26, 30, 36],
        parallelShifts: compactCutout
          ? [20, 28, 12, 36, 0, -20]
          : [0, 20, -20, 36, -36],
      },
      {
        key: "cutoutWidth",
        label: formatDimensionLabel(spec, "cutoutWidth", dims.cutoutWidth),
        start: pts[3],
        end: pts[2],
        outward: [0, 1],
        lineOffset: compactCutout ? 10 : 16,
        extensionStart: 2,
        extensionEnd: compactCutout ? 13 : 19,
        labelGaps: [14, 18, 22, 26, 30, 36],
        parallelShifts: compactCutout
          ? [28, 24, 32, 16, 8, 0]
          : [0, 20, -20, 36, -36],
      },
    ],
  });
};

// 17. T-SHAPE
GENERATORS["T-shape"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const dims = spec.dimensions || {
    topWidth: 12,
    topHeight: 3,
    stemWidth: 4,
    stemHeight: 7,
  };
  const shapeWidth = Math.min(340, w - 280);
  const shapeHeight = Math.min(250, h - 250);
  const topHeight = shapeHeight * clamp(
    dims.topHeight / (dims.topHeight + dims.stemHeight),
    0.22,
    0.42
  );
  const stemHeight = shapeHeight - topHeight;
  const stemWidth = shapeWidth * clamp(dims.stemWidth / dims.topWidth, 0.25, 0.55);
  const cx = w / 2;
  const oy = (h - shapeHeight) / 2;

  const pts = [
    [cx - shapeWidth / 2, oy],
    [cx + shapeWidth / 2, oy],
    [cx + shapeWidth / 2, oy + topHeight],
    [cx + stemWidth / 2, oy + topHeight],
    [cx + stemWidth / 2, oy + topHeight + stemHeight],
    [cx - stemWidth / 2, oy + topHeight + stemHeight],
    [cx - stemWidth / 2, oy + topHeight],
    [cx - shapeWidth / 2, oy + topHeight],
  ];

  return renderDimensionedPolygon({
    type: spec.type,
    spec,
    width: w,
    height: h,
    points: pts,
    dimensions: [
      {
        key: "topWidth",
        label: formatDimensionLabel(spec, "topWidth", dims.topWidth),
        start: pts[0],
        end: pts[1],
        outward: [0, -1],
      },
      {
        key: "topHeight",
        label: formatDimensionLabel(spec, "topHeight", dims.topHeight),
        start: pts[0],
        end: pts[7],
        outward: [-1, 0],
        rotate: -90,
      },
      {
        key: "stemWidth",
        label: formatDimensionLabel(spec, "stemWidth", dims.stemWidth),
        start: pts[5],
        end: pts[4],
        outward: [0, 1],
      },
      {
        key: "stemHeight",
        label: formatDimensionLabel(spec, "stemHeight", dims.stemHeight),
        start: pts[3],
        end: pts[4],
        outward: [1, 0],
        rotate: -90,
      },
    ],
  });
};

// 18. RECTANGLE + TRIANGLE COMPOSITE
GENERATORS["rect-triangle"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const dims = spec.dimensions || {
    width: 10,
    rectangleHeight: 4,
    triangleHeight: 3,
  };
  const shapeWidth = Math.min(300, w - 280);
  const shapeHeight = Math.min(280, h - 210);
  const triangleRatio = clamp(
    dims.triangleHeight / (dims.triangleHeight + dims.rectangleHeight),
    0.28,
    0.55
  );
  const triangleHeight = shapeHeight * triangleRatio;
  const rectangleHeight = shapeHeight - triangleHeight;
  const ox = (w - shapeWidth) / 2;
  const apexY = (h - shapeHeight) / 2;
  const baseY = apexY + triangleHeight;
  const bottomY = baseY + rectangleHeight;
  const apexX = w / 2;
  const points = [
    [ox, bottomY],
    [ox + shapeWidth, bottomY],
    [ox + shapeWidth, baseY],
    [apexX, apexY],
    [ox, baseY],
  ];
  const sharedBase = [[ox, baseY], [ox + shapeWidth, baseY]];
  const altitude = [[apexX, apexY], [apexX, baseY]];
  const markerSize = 12;
  const markerTop = [
    [apexX, baseY - markerSize],
    [apexX + markerSize, baseY - markerSize],
  ];
  const markerRight = [
    [apexX + markerSize, baseY - markerSize],
    [apexX + markerSize, baseY],
  ];

  return renderDimensionedShape({
    type: spec.type,
    width: w,
    height: h,
    outlineSvg: polyline(points),
    outlineObstacles: polygonObstacles(points),
    detailSvg:
      line(sharedBase[0][0], sharedBase[0][1], sharedBase[1][0], sharedBase[1][1], {
        linecap: "butt",
      }) +
      line(altitude[0][0], altitude[0][1], altitude[1][0], altitude[1][1], {
        color: S.dash,
        width: 1.2,
        dash: "5,4",
        linecap: "butt",
      }) +
      line(markerTop[0][0], markerTop[0][1], markerTop[1][0], markerTop[1][1], {
        color: S.dim,
        width: 1.2,
        linecap: "butt",
      }) +
      line(markerRight[0][0], markerRight[0][1], markerRight[1][0], markerRight[1][1], {
        color: S.dim,
        width: 1.2,
        linecap: "butt",
      }),
    detailObstacles: [sharedBase, altitude, markerTop, markerRight].map((item) => ({
      type: "segment",
      segment: layoutSegment(item[0][0], item[0][1], item[1][0], item[1][1]),
    })),
    dimensions: [
      {
        key: "width",
        label: formatDimensionLabel(spec, "width", dims.width),
        start: points[0],
        end: points[1],
        outward: [0, 1],
      },
      {
        key: "rectangleHeight",
        label: formatDimensionLabel(spec, "rectangleHeight", dims.rectangleHeight),
        start: points[4],
        end: points[0],
        outward: [-1, 0],
        rotate: -90,
      },
      {
        key: "triangleHeight",
        label: formatDimensionLabel(spec, "triangleHeight", dims.triangleHeight),
        start: altitude[0],
        end: altitude[1],
        outward: [1, 0],
        rotate: -90,
        showLine: false,
        lineOffset: 0,
        labelGaps: [20, 26, 32, 38, 46],
        parallelShifts: [0, 16, -16, 28, -28],
      },
    ],
  });
};

// 19. RECTANGLE + SEMICIRCLE COMPOSITE
GENERATORS["rect-semicircle"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const dims = spec.dimensions || { rectangleWidth: 8, diameter: 6 };
  const maxDiameter = Math.min(220, h - 260);
  const widthRatio = clamp(dims.rectangleWidth / dims.diameter, 0.75, 2);
  let diameter = maxDiameter;
  let rectangleWidth = diameter * widthRatio;
  const maxShapeWidth = w - 230;
  const totalWidth = rectangleWidth + diameter / 2;
  if (totalWidth > maxShapeWidth) {
    const scale = maxShapeWidth / totalWidth;
    diameter *= scale;
    rectangleWidth *= scale;
  }
  const radius = diameter / 2;
  const ox = (w - rectangleWidth - radius) / 2;
  const oy = (h - diameter) / 2;
  const topLeft = [ox, oy];
  const topRight = [ox + rectangleWidth, oy];
  const bottomRight = [ox + rectangleWidth, oy + diameter];
  const bottomLeft = [ox, oy + diameter];
  const arcCenter = [ox + rectangleWidth, oy + radius];
  const outlineSegments = [
    [topLeft, topRight],
    [bottomRight, bottomLeft],
    [bottomLeft, topLeft],
  ];
  const arcPath = `M ${topRight[0]} ${topRight[1]} A ${radius} ${radius} 0 0 1 ${bottomRight[0]} ${bottomRight[1]}`;

  return renderDimensionedShape({
    type: spec.type,
    width: w,
    height: h,
    outlineSvg:
      outlineSegments.map((item) =>
        line(item[0][0], item[0][1], item[1][0], item[1][1], { linecap: "butt" })
      ).join("") +
      `<path d="${arcPath}" fill="none" stroke="${S.line}" stroke-width="${S.lw}" stroke-linecap="butt"/>`,
    outlineObstacles: [
      ...outlineSegments.map((item) => ({
        type: "segment",
        segment: layoutSegment(item[0][0], item[0][1], item[1][0], item[1][1]),
      })),
      {
        type: "arc",
        arc: {
          cx: arcCenter[0],
          cy: arcCenter[1],
          r: radius,
          startDeg: -90,
          endDeg: 90,
          strokeWidth: S.lw,
        },
      },
    ],
    dimensions: [
      {
        key: "rectangleWidth",
        label: formatDimensionLabel(spec, "rectangleWidth", dims.rectangleWidth),
        start: bottomLeft,
        end: bottomRight,
        outward: [0, 1],
      },
      {
        key: "diameter",
        label: formatDimensionLabel(spec, "diameter", dims.diameter),
        start: topLeft,
        end: bottomLeft,
        outward: [-1, 0],
        rotate: -90,
      },
    ],
  });
};

// 20. ANNULUS (RING)
GENERATORS["annulus"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const cx = w / 2, cy = h / 2;
  const R = 140, r = 75;

  let svg = svgOpen(w, h);

  svg += circle(cx, cy, R);
  svg += circle(cx, cy, r);

  // Outer radius: line from centre at 30° below horizontal (down-right), to edge of outer circle
  // Label placed past the outer circle to the right, with a leader if needed
  const outerAngle = 30 * Math.PI / 180; // below horizontal
  const outerX = cx + R * Math.cos(outerAngle);
  const outerY = cy + R * Math.sin(outerAngle);
  svg += line(cx, cy, outerX, outerY, { color: S.dim, width: 1.2 });
  // Small perpendicular tick at outer end
  svg += line(outerX - 5 * Math.sin(outerAngle), outerY + 5 * Math.cos(outerAngle),
              outerX + 5 * Math.sin(outerAngle), outerY - 5 * Math.cos(outerAngle),
              { color: S.dim, width: 1 });
  // Label sits beyond the outer circle on the right, far enough that "10 cm" width
  // doesn't touch the circle outline.
  svg += text(outerX + 22, outerY + 10, spec.outerRadius || "R", { color: S.dim, size: 20, anchor: "start" });

  // Inner radius: dashed line from centre at 30° above horizontal (up-right), to edge of inner circle
  const innerAngle = -30 * Math.PI / 180; // above horizontal (negative y)
  const innerX = cx + r * Math.cos(innerAngle);
  const innerY = cy + r * Math.sin(innerAngle);
  svg += line(cx, cy, innerX, innerY, { color: S.dim, width: 1.2, dash: "4,3" });
  // Label sits past the inner circle edge in the ring gap
  const innerLblX = cx + (r + (R - r) * 0.35) * Math.cos(innerAngle);
  const innerLblY = cy + (r + (R - r) * 0.35) * Math.sin(innerAngle);
  svg += text(innerLblX, innerLblY, spec.innerRadius || "r", { color: S.dim, size: 20, anchor: "middle" });

  svg += `<circle cx="${cx}" cy="${cy}" r="3" fill="${S.line}"/>`;

  svg += svgClose;
  return svg;
};

// ─── HELPER: nice axis maximum ──────────────────────────────────────────────

function niceMax(v) {
  if (v <= 0) return 10;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const mantissa = v / base;
  let nice;
  if (mantissa <= 1) nice = 1;
  else if (mantissa <= 2) nice = 2;
  else if (mantissa <= 4) nice = 4;
  else if (mantissa <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

// ─── HELPER: evaluator builders for function-plot ───────────────────────────

// Whitelisted identifiers available inside expression strings
const ALLOWED_EXPR_IDENTS = new Set([
  "x", "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
  "sinh", "cosh", "tanh", "log", "ln", "log10", "log2",
  "exp", "sqrt", "cbrt", "abs", "min", "max", "pow", "floor", "ceil", "round",
  "pi", "e", "PI", "E",
]);

function buildEvaluator(fn) {
  if (fn.type === "linear") {
    const m = fn.m ?? 1, b = fn.b ?? 0;
    return (x) => m * x + b;
  }
  if (fn.type === "quadratic") {
    const a = fn.a ?? 1, b = fn.b ?? 0, c = fn.c ?? 0;
    return (x) => a * x * x + b * x + c;
  }
  if (fn.type === "cubic") {
    const a = fn.a ?? 1, b = fn.b ?? 0, c = fn.c ?? 0, d = fn.d ?? 0;
    return (x) => a * x * x * x + b * x * x + c * x + d;
  }
  if (fn.type === "polynomial") {
    const coeffs = fn.coefficients || [0];
    return (x) => {
      let total = 0;
      for (let i = 0; i < coeffs.length; i++) {
        total += coeffs[i] * Math.pow(x, coeffs.length - 1 - i);
      }
      return total;
    };
  }
  if (fn.type === "hyperbola") {
    // y = a / (x - h) + k
    const a = fn.a ?? 1, h = fn.h ?? 0, k = fn.k ?? 0;
    return (x) => a / (x - h) + k;
  }
  if (fn.type === "exponential") {
    // y = a * b^(x - h) + k (default base e)
    const a = fn.a ?? 1, b = fn.b ?? Math.E, h = fn.h ?? 0, k = fn.k ?? 0;
    return (x) => a * Math.pow(b, x - h) + k;
  }
  if (fn.type === "logarithmic") {
    // y = a * log_b(x - h) + k
    const a = fn.a ?? 1, b = fn.b ?? Math.E, h = fn.h ?? 0, k = fn.k ?? 0;
    const lnB = Math.log(b);
    return (x) => {
      if (x - h <= 0) return NaN;
      return a * Math.log(x - h) / lnB + k;
    };
  }
  if (fn.type === "sqrt") {
    // y = a * sqrt(x - h) + k
    const a = fn.a ?? 1, h = fn.h ?? 0, k = fn.k ?? 0;
    return (x) => {
      if (x - h < 0) return NaN;
      return a * Math.sqrt(x - h) + k;
    };
  }
  if (fn.type === "abs") {
    // y = a * |x - h| + k
    const a = fn.a ?? 1, h = fn.h ?? 0, k = fn.k ?? 0;
    return (x) => a * Math.abs(x - h) + k;
  }
  if (fn.type === "expression") {
    const expr = String(fn.expr || "0").replace(/\^/g, "**");
    const idents = expr.match(/[a-zA-Z_][a-zA-Z_0-9]*/g) || [];
    for (const id of idents) {
      if (!ALLOWED_EXPR_IDENTS.has(id)) return () => NaN;
    }
    if (!/^[0-9x+\-*/().,\s a-zA-Z_]+$/.test(expr)) return () => NaN;
    try {
      const body = `
        const sin = Math.sin, cos = Math.cos, tan = Math.tan;
        const asin = Math.asin, acos = Math.acos, atan = Math.atan, atan2 = Math.atan2;
        const sinh = Math.sinh, cosh = Math.cosh, tanh = Math.tanh;
        const log = Math.log, ln = Math.log, log10 = Math.log10, log2 = Math.log2;
        const exp = Math.exp, sqrt = Math.sqrt, cbrt = Math.cbrt, abs = Math.abs;
        const min = Math.min, max = Math.max, pow = Math.pow;
        const floor = Math.floor, ceil = Math.ceil, round = Math.round;
        const pi = Math.PI, PI = Math.PI, e = Math.E, E = Math.E;
        return ${expr};
      `;
      // eslint-disable-next-line no-new-func
      return new Function("x", body);
    } catch (e) {
      return () => NaN;
    }
  }
  return () => NaN;
}

// ─── 21. FUNCTION PLOT (lines, curves, multiple on one axis) ────────────────

GENERATORS["function-plot"] = (spec) => {
  const w = spec._cw || 700, h = spec._ch || 560;
  const minX = spec.minX ?? -5, maxX = spec.maxX ?? 5;
  const minY = spec.minY ?? -5, maxY = spec.maxY ?? 5;
  const functions = spec.functions || [];
  const asymptotes = spec.asymptotes || [];
  const extraPoints = spec.points || [];

  const lx = 60, rx = w - 40;
  const ty = 40, by = h - 50;
  const rangeX = maxX - minX, rangeY = maxY - minY;

  const toSvgX = (v) => lx + (v - minX) / rangeX * (rx - lx);
  const toSvgY = (v) => by - (v - minY) / rangeY * (by - ty);

  const palette = ["#1B3F71", "#C0392B", "#27AE60", "#8E44AD", "#E67E22"];

  let svg = svgOpen(w, h);

  // Grid
  if (spec.showGrid !== false) {
    for (let x = Math.ceil(minX); x <= maxX; x++) {
      svg += line(toSvgX(x), ty, toSvgX(x), by, { color: "#E8E8E8", width: 0.5 });
    }
    for (let y = Math.ceil(minY); y <= maxY; y++) {
      svg += line(lx, toSvgY(y), rx, toSvgY(y), { color: "#E8E8E8", width: 0.5 });
    }
  }

  // Axes — draw through origin if visible, else along the plot edge.
  // Compute first so we know whether asymptotes coincide with an axis.
  const originInX = (0 >= minX && 0 <= maxX);
  const originInY = (0 >= minY && 0 <= maxY);
  const xAxisY = originInY ? toSvgY(0) : by;
  const yAxisX = originInX ? toSvgX(0) : lx;

  // Asymptotes behind curves. If an asymptote coincides with an axis that is
  // on-screen, skip drawing the duplicate dashed line and its label — the axis
  // itself is the visual reference, and the label would collide with axis ticks.
  for (const asym of asymptotes) {
    if (asym.type === "vertical") {
      const sx = toSvgX(asym.value);
      const coincidesWithYAxis = originInX && Math.abs(asym.value) < 1e-9;
      if (sx >= lx && sx <= rx && !coincidesWithYAxis) {
        svg += line(sx, ty, sx, by, { color: "#888888", width: 1.2, dash: "5,4" });
        if (asym.label !== false) {
          const lbl = asym.label || `x = ${asym.value}`;
          svg += text(sx + 6, ty + 14, lbl, { color: "#666666", size: 14, anchor: "start" });
        }
      }
    } else if (asym.type === "horizontal") {
      const sy = toSvgY(asym.value);
      const coincidesWithXAxis = originInY && Math.abs(asym.value) < 1e-9;
      if (sy >= ty && sy <= by && !coincidesWithXAxis) {
        svg += line(lx, sy, rx, sy, { color: "#888888", width: 1.2, dash: "5,4" });
        if (asym.label !== false) {
          const lbl = asym.label || `y = ${asym.value}`;
          svg += text(rx - 6, sy - 8, lbl, { color: "#666666", size: 14, anchor: "end" });
        }
      }
    }
  }

  // (The axes declarations above are used below for axis drawing and tick labels.)

  svg += line(lx, xAxisY, rx, xAxisY, { width: 2, color: S.line, linecap: "butt" });
  svg += line(yAxisX, ty, yAxisX, by, { width: 2, color: S.line, linecap: "butt" });

  // Arrowheads at both ends of each axis — standard textbook convention
  // indicating the axes extend indefinitely.
  svg += arrowTip(rx, xAxisY, 1, 0);
  svg += arrowTip(lx, xAxisY, -1, 0);
  svg += arrowTip(yAxisX, ty, 0, -1);
  svg += arrowTip(yAxisX, by, 0, 1);

  // Ticks and labels
  for (let x = Math.ceil(minX); x <= maxX; x++) {
    if (x === 0 && originInX && originInY) continue;
    svg += line(toSvgX(x), xAxisY - 4, toSvgX(x), xAxisY + 4, { width: 1.3 });
    svg += text(toSvgX(x), xAxisY + 16, String(x), { size: 14 });
  }
  for (let y = Math.ceil(minY); y <= maxY; y++) {
    if (y === 0 && originInX && originInY) continue;
    svg += line(yAxisX - 4, toSvgY(y), yAxisX + 4, toSvgY(y), { width: 1.3 });
    svg += text(yAxisX - 10, toSvgY(y), String(y), { size: 14, anchor: "end" });
  }

  // Axis arrow labels
  svg += text(rx + 10, xAxisY, "x", { italic: true, size: 18, anchor: "start" });
  svg += text(yAxisX, ty - 8, "y", { italic: true, size: 18 });
  if (originInX && originInY) {
    svg += text(yAxisX - 10, xAxisY + 16, "O", { size: 15 });
  }

  // Plot each function
  // Collect every rendered curve segment (across all functions) so that
  // later code — extraPoints label placement especially — can keep its
  // labels clear of all drawn lines, not just the current function's.
  const allCurveSegments = [];

  functions.forEach((fn, idx) => {
    const color = fn.color || palette[idx % palette.length];
    const dashAttr = fn.style === "dashed" ? ` stroke-dasharray="6,4"` : "";
    const displayLabel = formatMathLabelForDisplay(fn.label);

    if (fn.type === "circle") {
      // Render (x - h)² + (y - k)² = r² as an SVG circle
      const ch = fn.h ?? 0, ck = fn.k ?? 0, r = fn.r ?? 1;
      const cxPx = toSvgX(ch), cyPx = toSvgY(ck);
      const rPx = Math.abs(toSvgX(ch + r) - cxPx);
      svg += `<circle cx="${cxPx}" cy="${cyPx}" r="${rPx}" fill="none" stroke="${color}" stroke-width="${S.lw}"${dashAttr}/>`;
      if (displayLabel) {
        svg += text(cxPx + rPx + 8, cyPx - rPx - 4, displayLabel, { color, size: 15, italic: true, anchor: "start" });
      }
      return;
    }

    const evaluator = buildEvaluator(fn);
    const domain = fn.domain || [minX, maxX];
    const [dMin, dMax] = domain;
    const samples = fn.samples || 400;

    // Collect point segments — break at NaN, infinity, or large jumps. Vertical
    // asymptotes are handled implicitly: a function that is genuinely
    // undefined or unbounded there yields NaN/Infinity (caught below) or a
    // jump above jumpThreshold. We must NOT break every curve at every
    // declared asymptote x — those declarations are reference lines for the
    // viewer, not necessarily asymptotes of every function in the plot, so
    // doing so leaves spurious gaps and arrow tips on continuous curves.
    const segments = [];
    let current = [];
    let prevY = null;
    const jumpThreshold = rangeY * 1.5;

    for (let i = 0; i <= samples; i++) {
      const x = dMin + (dMax - dMin) * (i / samples);

      let y;
      try { y = evaluator(x); } catch (e) { y = NaN; }
      if (!isFinite(y)) {
        if (current.length >= 2) segments.push(current);
        current = [];
        prevY = null;
        continue;
      }

      // Detect large jumps (implicit discontinuities)
      if (prevY !== null && Math.abs(y - prevY) > jumpThreshold) {
        if (current.length >= 2) segments.push(current);
        current = [];
      }

      // Clip to just outside the visible y-range so lines don't shoot wildly
      const yClipped = Math.max(minY - rangeY * 0.3, Math.min(maxY + rangeY * 0.3, y));
      current.push([toSvgX(x), toSvgY(yClipped)]);
      prevY = y;
    }
    if (current.length >= 2) segments.push(current);

    // Clip a line segment against the plot rectangle (Liang-Barsky). Returns
    // null if entirely outside, otherwise [[x0,y0],[x1,y1]] for the visible
    // portion.
    const clipLineToPlot = (p1, p2) => {
      const [x0, y0] = p1, [x1, y1] = p2;
      const dx = x1 - x0, dy = y1 - y0;
      let t0 = 0, t1 = 1;
      const pC = [-dx, dx, -dy, dy];
      const qC = [x0 - lx, rx - x0, y0 - ty, by - y0];
      for (let k = 0; k < 4; k++) {
        if (pC[k] === 0) { if (qC[k] < 0) return null; }
        else {
          const t = qC[k] / pC[k];
          if (pC[k] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
          else           { if (t < t0) return null; if (t < t1) t1 = t; }
        }
      }
      return [[x0 + dx * t0, y0 + dy * t0], [x0 + dx * t1, y0 + dy * t1]];
    };

    // Walk every pair of consecutive samples, clipping each to the plot rect
    // and stitching the clipped pieces back into continuous sub-segments.
    // The result is that the drawn path ends *exactly* at the plot boundary,
    // so arrow tips placed at sub-segment endpoints sit precisely where the
    // visible curve ends — with nothing extending past.
    const visibleSegments = [];
    for (const seg of segments) {
      let cur = [];
      for (let i = 0; i < seg.length - 1; i++) {
        const clipped = clipLineToPlot(seg[i], seg[i + 1]);
        if (!clipped) {
          if (cur.length >= 2) visibleSegments.push(cur);
          cur = [];
          continue;
        }
        const [a, b] = clipped;
        if (cur.length === 0) {
          cur.push(a, b);
        } else {
          const last = cur[cur.length - 1];
          // If the clipped pair starts where the last one ended, it's a continuation.
          if (Math.abs(last[0] - a[0]) + Math.abs(last[1] - a[1]) < 0.5) {
            cur.push(b);
          } else {
            if (cur.length >= 2) visibleSegments.push(cur);
            cur = [a, b];
          }
        }
      }
      if (cur.length >= 2) visibleSegments.push(cur);
    }

    // Draw the visible-only path
    for (const sub of visibleSegments) {
      const d = sub.map((pt, i) => (i === 0 ? "M" : "L") + ` ${pt[0].toFixed(2)} ${pt[1].toFixed(2)}`).join(" ");
      svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${S.lw}" stroke-linejoin="round" stroke-linecap="butt"${dashAttr}/>`;
    }

    // Collect visible sub-segments so later label-placement code checks
    // collisions against only the drawn curve, not the off-plot tail.
    for (const sub of visibleSegments) allCurveSegments.push(sub);

    // Arrows at each visible sub-segment end — the endpoints sit on the plot
    // boundary (or at a discontinuity), so tips land exactly where the drawn
    // curve stops. Skipped for dashed reference lines and for sub-segments
    // too short to have a meaningful tangent.
    if (fn.style !== "dashed") {
      for (const sub of visibleSegments) {
        if (sub.length < 4) continue;

        // Outgoing arrow at END (tangent from neighbours, pointing forward)
        {
          const i1 = sub.length - 1;
          const i0 = Math.max(0, i1 - 4);
          const [x0, y0] = sub[i0];
          const [x1, y1] = sub[i1];
          const dx = x1 - x0, dy = y1 - y0;
          if (dx !== 0 || dy !== 0) svg += arrowTip(x1, y1, dx, dy, { color });
        }
        // Outgoing arrow at START (tangent reversed so arrow points backwards)
        {
          const i0 = 0;
          const i1 = Math.min(sub.length - 1, 4);
          const [x0, y0] = sub[i0];
          const [x1, y1] = sub[i1];
          const dx = x0 - x1, dy = y0 - y1;
          if (dx !== 0 || dy !== 0) svg += arrowTip(x0, y0, dx, dy, { color });
        }
      }
    }

    // Function label. Previously labels were shifted straight up or down from
    // the curve by ~14 px — which sits on top of any curve whose local tangent
    // is not roughly horizontal (parabolas, cubics, |x|, hyperbolas, ...).
    //
    // Strategy:
    //   1. Pick a target x-fraction along the visible range. For single-function
    //      plots we try several candidate fractions so we can route around any
    //      explicitly labelled points like "(3, 0)" or "vertex".
    //   2. Find the curve point nearest each target x.
    //   3. Compute a local tangent from neighbours; the two perpendicular
    //      directions give two candidate label positions, offset by 26 px so
    //      the label clears the stroke + halo.
    //   4. Score every (fraction, side) combination by 2D clearance from
    //      obstacles (axes, labelled points); pick the best overall.
    if (displayLabel && segments.length > 0) {
      const nonCircleFns = functions.filter((f) => f.type !== "circle");
      const myOrder = nonCircleFns.indexOf(fn);
      const totalN = nonCircleFns.length;

      // Obstacle bounding boxes — extraPoints' labels sit at (px+16, py-18)
      // with anchor "start" and size 15, so the text extends RIGHTWARD from
      // that origin. We estimate text width from character count; the factor
      // is deliberately on the generous side (real glyph widths for italics,
      // superscripts, and spaces run wider than a flat character count
      // suggests) and we add a small padding to the box so the score also
      // rejects positions where the curve skims the edge of the label.
      const TEXT_H = 15;
      const CHAR_W = 9.5;            // generous per-character width
      const BOX_PAD = 6;             // visual clearance padding
      const estWidth = (s) => Math.max(24, String(s).length * CHAR_W);
      const obstacles = extraPoints
        .filter((p) => p.label)
        .map((p) => {
          const tx = toSvgX(p.x) + 16;
          const ty_ = toSvgY(p.y) - 18;
          const w = estWidth(p.label);
          return {
            left: tx - BOX_PAD,
            right: tx + w + BOX_PAD,
            top: ty_ - TEXT_H / 2 - BOX_PAD,
            bottom: ty_ + TEXT_H / 2 + BOX_PAD,
          };
        });
      const xAxisYpos = originInY ? toSvgY(0) : null;
      const yAxisXpos = originInX ? toSvgX(0) : null;
      const fnLabelW = estWidth(displayLabel);

      // Candidate label fractions. Single-function: try several spots and pick
      // the best-scoring. Multi-function: search a small window around each
      // function's designated slot so close-running curves can still nudge
      // out of each other's way. Linear functions get strongly end-biased
      // candidates so the equation reads as "this is the line going off in
      // that direction" rather than floating in the middle of the plot.
      let candidateFracs;
      if (fn.type === "linear") {
        if (totalN === 1) {
          candidateFracs = [0.92, 0.08, 0.86, 0.14];
        } else {
          const useRight = myOrder % 2 === 0;
          const base = useRight ? 0.92 - myOrder * 0.04 : 0.08 + myOrder * 0.04;
          candidateFracs = [base, base + (useRight ? -0.06 : 0.06)]
            .filter((f) => f >= 0.05 && f <= 0.95);
        }
      } else if (totalN === 1) {
        candidateFracs = [0.82, 0.68, 0.55, 0.42, 0.30, 0.16];
      } else {
        const base = 0.18 + (0.82 - 0.18) * (myOrder / (totalN - 1));
        candidateFracs = [base - 0.10, base - 0.05, base, base + 0.05, base + 0.10]
          .filter((f) => f >= 0.12 && f <= 0.88);
      }

      const findNearestOnCurve = (tgtX) => {
        let p = null, d0 = Infinity, seg0 = null, idx0 = -1;
        for (const seg of visibleSegments) {
          for (let i = 0; i < seg.length; i++) {
            const pt = seg[i];
            const inY = pt[1] >= ty - 2 && pt[1] <= by + 2;
            const d = Math.abs(pt[0] - tgtX) + (inY ? 0 : 1000);
            if (d < d0) { d0 = d; p = pt; seg0 = seg; idx0 = i; }
          }
        }
        return p ? { pt: p, seg: seg0, idx: idx0 } : null;
      };

      // Try multiple perpendicular offsets per candidate. With only off=26,
      // wide labels placed next to V-shaped curves like |x-2| will always
      // cross an arm — there simply isn't room. Larger offsets (40, 60 px)
      // push the label into the open region above or below the curve where
      // it can't cross anything.
      const OFFSETS = [26, 38, 54, 72];
      const makePos = (pt, nx, ny, dist) => {
        let lxp = pt[0] + nx * dist;
        let lyp = pt[1] + ny * dist;
        if (lyp < ty + 12) lyp = ty + 12;
        if (lyp > by - 12) lyp = by - 12;
        if (lxp < lx + 12) lxp = lx + 12;
        if (lxp > rx - 12) lxp = rx - 12;
        return [lxp, lyp];
      };

      // Clearance score: minimum box-to-box distance between the function
      // label's bounding box and every obstacle (axes, labelled points, AND
      // the curve itself across the label's x-range). A label whose centre
      // is 26 px off the curve can still have its wide extremities cross the
      // curve elsewhere — e.g. a label placed beside a parabola vertex — so
      // we sample the curve within the label's x-span and penalise any
      // sample that falls inside the label box.
      const allSegments = visibleSegments;
      const scorePos = ([px, py], anchor) => {
        // The label will render with text-anchor matching where in the plot
        // it sits: "start" near the left edge, "end" near the right, "middle"
        // otherwise. The bounding box used for collision checks MUST match
        // the actually-rendered text extent — otherwise a label rendered with
        // anchor="end" (text leftward of px) will be scored as if it were
        // centred, missing collisions with anything on the left.
        let lL, lR;
        if (anchor === "end") {
          lR = px + BOX_PAD;
          lL = px - fnLabelW - BOX_PAD;
        } else if (anchor === "start") {
          lL = px - BOX_PAD;
          lR = px + fnLabelW + BOX_PAD;
        } else {
          lL = px - fnLabelW / 2 - BOX_PAD;
          lR = px + fnLabelW / 2 + BOX_PAD;
        }
        const lT = py - TEXT_H / 2 - BOX_PAD;
        const lB = py + TEXT_H / 2 + BOX_PAD;
        let s = Infinity;
        if (xAxisYpos !== null) s = Math.min(s, Math.abs(py - xAxisYpos));
        if (yAxisXpos !== null) s = Math.min(s, Math.abs(px - yAxisXpos));
        for (const o of obstacles) {
          const dx = Math.max(0, Math.max(o.left - lR, lL - o.right));
          const dy = Math.max(0, Math.max(o.top - lB, lT - o.bottom));
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < s) s = d;
        }
        // Penalise curve crossings through the label box. Point-sampling
        // alone misses the case where a near-linear curve (like |x - 2|)
        // crosses the label without any discrete sample falling inside:
        // the sample step can easily be wider than the label is tall.
        // Liang-Barsky segment-vs-box clipping catches crossings between
        // any two consecutive curve points.
        let minBoxPenetration = 0;
        outer:
        for (const seg of allSegments) {
          for (let i = 0; i < seg.length - 1; i++) {
            const [x0, y0] = seg[i];
            const [x1, y1] = seg[i + 1];
            // Quick reject: segment bounding box fully outside label box
            if (Math.max(x0, x1) < lL - 2 || Math.min(x0, x1) > lR + 2 ||
                Math.max(y0, y1) < lT - 2 || Math.min(y0, y1) > lB + 2) continue;
            // Liang-Barsky
            const dx = x1 - x0, dy = y1 - y0;
            let t0 = 0, t1 = 1;
            const p = [-dx, dx, -dy, dy];
            const q = [x0 - lL, lR - x0, y0 - lT, lB - y0];
            let inside = true;
            for (let k = 0; k < 4; k++) {
              if (p[k] === 0) {
                if (q[k] < 0) { inside = false; break; }
              } else {
                const t = q[k] / p[k];
                if (p[k] < 0) { if (t > t1) { inside = false; break; } if (t > t0) t0 = t; }
                else          { if (t < t0) { inside = false; break; } if (t < t1) t1 = t; }
              }
            }
            if (inside && t0 <= t1) {
              minBoxPenetration = 1;
              break outer;
            }
          }
        }
        return s - minBoxPenetration * 1000;
      };

      // Anchor is chosen from the candidate position before scoring, so the
      // bounding box used for collision checks matches the rendered extent.
      const anchorFor = (lxp) => {
        if (lxp > rx - 60) return "end";
        if (lxp < lx + 60) return "start";
        return "middle";
      };

      let bestCombo = null;
      for (const frac of candidateFracs) {
        const hit = findNearestOnCurve(lx + (rx - lx) * frac);
        if (!hit) continue;

        // Local tangent
        const iPrev = Math.max(0, hit.idx - 4);
        const iNext = Math.min(hit.seg.length - 1, hit.idx + 4);
        let tdx = hit.seg[iNext][0] - hit.seg[iPrev][0];
        let tdy = hit.seg[iNext][1] - hit.seg[iPrev][1];
        const tlen = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
        tdx /= tlen; tdy /= tlen;

        for (const dist of OFFSETS) {
          const posA = makePos(hit.pt, -tdy, tdx, dist);
          const posB = makePos(hit.pt, tdy, -tdx, dist);
          const anchorA = anchorFor(posA[0]);
          const anchorB = anchorFor(posB[0]);
          const sA = scorePos(posA, anchorA);
          const sB = scorePos(posB, anchorB);
          // Prefer closer offsets when the score is equally good — a label
          // 26 px off the curve reads as "attached" to that curve, whereas
          // one 72 px away can feel detached. We bias toward closer offsets
          // by adding a small negative weight proportional to distance.
          const biasA = sA - dist * 0.05;
          const biasB = sB - dist * 0.05;
          const chosen = biasB > biasA
            ? { pos: posB, score: biasB, anchor: anchorB }
            : { pos: posA, score: biasA, anchor: anchorA };
          if (!bestCombo || chosen.score > bestCombo.score) bestCombo = chosen;
        }
      }

      if (bestCombo) {
        const [lxp, lyp] = bestCombo.pos;
        svg += text(lxp, lyp, displayLabel, { color, size: 15, italic: true, anchor: bestCombo.anchor });
      }
    }
  });

  // Explicit labeled points on top of everything. Instead of a fixed offset
  // (which sat the label on top of any curve passing near the marker), try
  // eight candidate positions around the point and pick the one whose label
  // bounding box is furthest from every curve segment on the plot. Axes and
  // other labelled points are also considered obstacles.
  const EP_TEXT_H = 15;
  const EP_CHAR_W = 9.5;
  const EP_BOX_PAD = 4;
  const epEstW = (s) => Math.max(24, String(s).length * EP_CHAR_W);
  // Record boxes of points rendered so far so labels don't pile onto one another.
  const placedPointBoxes = [];

  // Static obstacles: the four axis-arrow regions (about 14 px around each
  // tip) and the "x"/"y" axis labels. Without these, a labelled point like
  // (3, 0) on the x-axis at the right edge puts its label through the arrow.
  // Also the tick-label strips: the band just below the x-axis where the
  // numeric tick labels sit, and the strip just left of the y-axis.
  const staticObstacleBoxes = [
    // x-axis right arrow + "x" label
    { left: rx - 12, right: rx + 26, top: xAxisY - 14, bottom: xAxisY + 14 },
    // x-axis left arrow
    { left: lx - 14, right: lx + 12, top: xAxisY - 14, bottom: xAxisY + 14 },
    // y-axis top arrow + "y" label
    { left: yAxisX - 14, right: yAxisX + 14, top: ty - 26, bottom: ty + 12 },
    // y-axis bottom arrow
    { left: yAxisX - 14, right: yAxisX + 14, top: by - 12, bottom: by + 14 },
    // x-axis numeric tick label strip (immediately below the x-axis)
    { left: lx, right: rx, top: xAxisY + 6, bottom: xAxisY + 22 },
    // y-axis numeric tick label strip (immediately left of the y-axis)
    { left: yAxisX - 22, right: yAxisX - 4, top: ty, bottom: by },
  ];

  extraPoints.forEach((p) => {
    const px = toSvgX(p.x), py = toSvgY(p.y);
    svg += `<circle cx="${px}" cy="${py}" r="4.5" fill="${S.angle}"/>`;
    if (!p.label) return;

    const labelW = epEstW(p.label);
    const candidates = [
      { dx:  16, dy: -18, anchor: "start"  }, // upper-right (default, keeps legacy look when nothing conflicts)
      { dx:  16, dy:  18, anchor: "start"  }, // lower-right
      { dx: -16, dy: -18, anchor: "end"    }, // upper-left
      { dx: -16, dy:  18, anchor: "end"    }, // lower-left
      { dx:   0, dy: -22, anchor: "middle" }, // above
      { dx:   0, dy:  22, anchor: "middle" }, // below
      { dx:  26, dy:   0, anchor: "start"  }, // right
      { dx: -26, dy:   0, anchor: "end"    }, // left
    ];

    let best = null;
    for (let ci = 0; ci < candidates.length; ci++) {
      const c = candidates[ci];
      const anchorX = px + c.dx, anchorY = py + c.dy;
      let lL, lR;
      if (c.anchor === "end")         { lR = anchorX + EP_BOX_PAD;  lL = anchorX - labelW - EP_BOX_PAD; }
      else if (c.anchor === "middle") { lL = anchorX - labelW/2 - EP_BOX_PAD; lR = anchorX + labelW/2 + EP_BOX_PAD; }
      else                            { lL = anchorX - EP_BOX_PAD;  lR = anchorX + labelW + EP_BOX_PAD; }
      const lT = anchorY - EP_TEXT_H/2 - EP_BOX_PAD;
      const lB = anchorY + EP_TEXT_H/2 + EP_BOX_PAD;

      // Disqualify anything that falls outside the plot area.
      if (lL < lx - 4 || lR > rx + 4 || lT < ty - 4 || lB > by + 4) continue;

    // Segment-vs-box intersection (Liang-Barsky) against every curve AND the
    // axis lines themselves — a label parked on an axis is just as unreadable
    // as one parked on a curve. The axes become two extra "segments" in the
    // collision check.
    const collisionSegments = allCurveSegments.concat([
      [[lx, xAxisY], [rx, xAxisY]],
      [[yAxisX, ty], [yAxisX, by]],
    ]);

    let crosses = false;
    outerEP:
    for (const seg of collisionSegments) {
      for (let i = 0; i < seg.length - 1; i++) {
        const [x0, y0] = seg[i];
        const [x1, y1] = seg[i + 1];
        if (Math.max(x0, x1) < lL || Math.min(x0, x1) > lR ||
            Math.max(y0, y1) < lT || Math.min(y0, y1) > lB) continue;
        const sx = x1 - x0, sy = y1 - y0;
        let t0 = 0, t1 = 1;
        const pC = [-sx, sx, -sy, sy];
        const qC = [x0 - lL, lR - x0, y0 - lT, lB - y0];
        let inside = true;
        for (let k = 0; k < 4; k++) {
          if (pC[k] === 0) { if (qC[k] < 0) { inside = false; break; } }
          else {
            const t = qC[k] / pC[k];
            if (pC[k] < 0) { if (t > t1) { inside = false; break; } if (t > t0) t0 = t; }
            else           { if (t < t0) { inside = false; break; } if (t < t1) t1 = t; }
          }
        }
        if (inside && t0 <= t1) { crosses = true; break outerEP; }
      }
    }

      // Distance to other already-placed point labels (soft — used as tiebreak).
      let minNeighbour = Infinity;
      for (const b of placedPointBoxes) {
        const ox = Math.max(0, Math.max(b.left - lR, lL - b.right));
        const oy = Math.max(0, Math.max(b.top - lB, lT - b.bottom));
        const d = Math.sqrt(ox * ox + oy * oy);
        if (d < minNeighbour) minNeighbour = d;
      }
      if (minNeighbour === Infinity) minNeighbour = 1000;

      // Overlap with static obstacles (axis arrows, tick-label strips, axis
      // text labels) — treat as severely as crossing a curve. This keeps
      // labelled points like "(-1, 0)" from landing on top of the "-2" tick
      // number below the x-axis.
      let overlapsStatic = false;
      for (const b of staticObstacleBoxes) {
        if (lL < b.right && lR > b.left && lT < b.bottom && lB > b.top) {
          overlapsStatic = true;
          break;
        }
      }

      // Prefer lower-indexed candidates (upper-right first) when scores tie,
      // by a tiny bias so the visual is stable across runs.
      const penalty = (crosses ? 1 : 0) + (overlapsStatic ? 1 : 0);
      const score = -penalty * 1000 + minNeighbour - ci * 0.1;
      if (!best || score > best.score) {
        best = { score, anchorX, anchorY, anchor: c.anchor, box: { left: lL, right: lR, top: lT, bottom: lB } };
      }
    }

    // Fallback: if no candidate was found (every position clipped the plot),
    // use the legacy upper-right offset. This should not happen in practice.
    if (!best) {
      best = {
        anchorX: px + 16,
        anchorY: py - 18,
        anchor: "start",
        box: { left: px + 16 - EP_BOX_PAD, right: px + 16 + labelW + EP_BOX_PAD,
               top: py - 18 - EP_TEXT_H/2 - EP_BOX_PAD, bottom: py - 18 + EP_TEXT_H/2 + EP_BOX_PAD },
      };
    }

    svg += text(best.anchorX, best.anchorY, p.label, { size: 15, color: S.angle, anchor: best.anchor });
    placedPointBoxes.push(best.box);
  });

  svg += svgClose;
  return svg;
};

// ─── 22. BAR GRAPH (column chart) ───────────────────────────────────────────

GENERATORS["bar-graph"] = (spec) => {
  const w = spec._cw || 700, h = spec._ch || 500;
  const data = spec.data || [];
  const title = spec.title || null;
  const xLabel = spec.xLabel || null;
  const yLabel = spec.yLabel || null;
  const showValues = spec.showValues !== false;

  const topPad = title ? 46 : 24;
  const bottomPad = xLabel ? 66 : 46;
  const leftPad = yLabel ? 66 : 52;
  const rightPad = 28;

  const chartTop = topPad;
  const chartBottom = h - bottomPad;
  const chartLeft = leftPad;
  const chartRight = w - rightPad;
  const chartW = chartRight - chartLeft;
  const chartH = chartBottom - chartTop;

  const maxValue = Math.max(...data.map((d) => Number(d.value) || 0), 1);
  const yMax = spec.yMax || niceMax(maxValue);
  const yTicks = spec.yTicks || 5;

  let svg = svgOpen(w, h);

  if (title) {
    svg += text(w / 2, 22, title, { bold: true, size: 19, color: S.label });
  }

  // Horizontal gridlines and y tick labels
  for (let i = 0; i <= yTicks; i++) {
    const v = Math.round((yMax * i / yTicks) * 100) / 100;
    const y = chartBottom - chartH * i / yTicks;
    svg += line(chartLeft, y, chartRight, y, { color: i === 0 ? S.line : "#DDDDDD", width: i === 0 ? 2 : 0.5 });
    svg += text(chartLeft - 8, y, String(v), { size: 13, anchor: "end" });
  }
  // Y-axis line
  svg += line(chartLeft, chartTop, chartLeft, chartBottom, { width: 2, color: S.line });

  // Bars
  const barCount = data.length || 1;
  const gap = Math.max(8, Math.min(20, chartW / (barCount * 6)));
  const barW = (chartW - gap * (barCount + 1)) / barCount;

  data.forEach((d, i) => {
    const value = Number(d.value) || 0;
    const x = chartLeft + gap + i * (barW + gap);
    const barH = chartH * (value / yMax);
    const y = chartBottom - barH;
    const color = d.color || S.dim;
    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" stroke="${S.line}" stroke-width="1"/>`;

    // Category label under bar
    svg += text(x + barW / 2, chartBottom + 16, String(d.label || ""), { size: 13 });

    if (showValues && value > 0) {
      svg += text(x + barW / 2, y - 6, String(value), { size: 12, color: S.label });
    }
  });

  if (xLabel) {
    svg += text((chartLeft + chartRight) / 2, h - 12, xLabel, { size: 15, bold: true });
  }
  if (yLabel) {
    const cx = 18, cy = (chartTop + chartBottom) / 2;
    svg += `<text x="${cx}" y="${cy}" fill="${S.label}" font-family="${S.font}" font-size="15" font-weight="bold" text-anchor="middle" transform="rotate(-90 ${cx} ${cy})">${yLabel.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`;
  }

  svg += svgClose;
  return svg;
};

// ─── 23. HISTOGRAM ──────────────────────────────────────────────────────────

GENERATORS["histogram"] = (spec) => {
  const w = spec._cw || 700, h = spec._ch || 500;
  // Accept `bins` (array of {min, max, count}) or `classes` (array of {label, frequency})
  const bins = spec.bins || (spec.classes || []).map((c) => ({ label: c.label, count: c.frequency }));
  const title = spec.title || null;
  const xLabel = spec.xLabel || null;
  const yLabel = spec.yLabel || "Frequency";
  const showValues = spec.showValues !== false;

  const topPad = title ? 46 : 24;
  const bottomPad = xLabel ? 70 : 48;
  const leftPad = yLabel ? 66 : 52;
  const rightPad = 28;

  const chartTop = topPad;
  const chartBottom = h - bottomPad;
  const chartLeft = leftPad;
  const chartRight = w - rightPad;
  const chartW = chartRight - chartLeft;
  const chartH = chartBottom - chartTop;

  const maxCount = Math.max(...bins.map((b) => Number(b.count) || 0), 1);
  const yMax = spec.yMax || niceMax(maxCount);
  const yTicks = spec.yTicks || 5;

  let svg = svgOpen(w, h);

  if (title) svg += text(w / 2, 22, title, { bold: true, size: 19, color: S.label });

  for (let i = 0; i <= yTicks; i++) {
    const v = Math.round((yMax * i / yTicks) * 100) / 100;
    const y = chartBottom - chartH * i / yTicks;
    svg += line(chartLeft, y, chartRight, y, { color: i === 0 ? S.line : "#DDDDDD", width: i === 0 ? 2 : 0.5 });
    svg += text(chartLeft - 8, y, String(v), { size: 13, anchor: "end" });
  }
  svg += line(chartLeft, chartTop, chartLeft, chartBottom, { width: 2, color: S.line });

  const n = bins.length || 1;
  const barW = chartW / n;

  bins.forEach((b, i) => {
    const count = Number(b.count) || 0;
    const x = chartLeft + i * barW;
    const barH = chartH * (count / yMax);
    const y = chartBottom - barH;
    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${S.dim}" stroke="${S.line}" stroke-width="1"/>`;

    // Class label — use `b.label` if provided, else range "min–max"
    const lbl = b.label || (b.min !== undefined && b.max !== undefined ? `${b.min}\u2013${b.max}` : "");
    svg += text(x + barW / 2, chartBottom + 16, lbl, { size: 12 });

    if (showValues && count > 0) {
      svg += text(x + barW / 2, y - 5, String(count), { size: 12, color: S.label });
    }
  });

  if (xLabel) svg += text((chartLeft + chartRight) / 2, h - 12, xLabel, { size: 15, bold: true });
  if (yLabel) {
    const cx = 18, cy = (chartTop + chartBottom) / 2;
    svg += `<text x="${cx}" y="${cy}" fill="${S.label}" font-family="${S.font}" font-size="15" font-weight="bold" text-anchor="middle" transform="rotate(-90 ${cx} ${cy})">${yLabel.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`;
  }

  svg += svgClose;
  return svg;
};

// ─── 24. DOT PLOT ───────────────────────────────────────────────────────────

GENERATORS["dot-plot"] = (spec) => {
  const w = spec._cw || 700, h = spec._ch || 400;
  // Input: either `data` array, or `counts` object {value: count}
  let counts = {};
  if (spec.counts) {
    counts = spec.counts;
  } else if (spec.data) {
    for (const v of spec.data) {
      const key = String(v);
      counts[key] = (counts[key] || 0) + 1;
    }
  }

  const numericValues = Object.keys(counts).map(Number).filter((v) => !isNaN(v));
  const defMin = numericValues.length ? Math.floor(Math.min(...numericValues)) : 0;
  const defMax = numericValues.length ? Math.ceil(Math.max(...numericValues)) : 10;
  const min = spec.min ?? defMin;
  const max = spec.max ?? defMax;
  const step = spec.step || 1;

  const lineLeft = 50;
  const lineRight = w - 40;
  const lineY = h - 60;

  const toX = (v) => lineLeft + (v - min) / (max - min || 1) * (lineRight - lineLeft);

  let svg = svgOpen(w, h);

  if (spec.title) svg += text(w / 2, 26, spec.title, { bold: true, size: 19, color: S.label });

  // Axis line
  svg += line(lineLeft - 10, lineY, lineRight + 10, lineY, { width: 2 });

  // Ticks and number labels
  for (let v = min; v <= max + 1e-9; v += step) {
    const x = toX(v);
    svg += line(x, lineY - 5, x, lineY + 5, { width: 1.4 });
    // Clean up floating-point display
    const disp = Math.abs(v) < 1e-9 ? "0" : String(Math.round(v * 100) / 100);
    svg += text(x, lineY + 20, disp, { size: 14 });
  }

  // Dots — stack vertically above each value
  const dotR = 7;
  const dotSpacing = 17;
  const maxStack = Math.floor((lineY - 40) / dotSpacing);

  for (const [valStr, count] of Object.entries(counts)) {
    const val = Number(valStr);
    if (isNaN(val)) continue;
    const x = toX(val);
    const drawCount = Math.min(count, maxStack);
    for (let i = 0; i < drawCount; i++) {
      const y = lineY - 14 - i * dotSpacing;
      svg += `<circle cx="${x}" cy="${y}" r="${dotR}" fill="${S.dim}" stroke="${S.line}" stroke-width="1"/>`;
    }
    // If clipped, show overflow note
    if (count > maxStack) {
      svg += text(x, lineY - 14 - maxStack * dotSpacing - 4, `(${count})`, { size: 12, color: S.label });
    }
  }

  // X-axis label
  if (spec.xLabel) svg += text((lineLeft + lineRight) / 2, lineY + 48, spec.xLabel, { size: 15, bold: true });

  svg += svgClose;
  return svg;
};

// ─── 25. TREE DIAGRAM (probability) ─────────────────────────────────────────

GENERATORS["tree-diagram"] = (spec) => {
  const w = spec._cw || 700, h = spec._ch || 520;
  const branches = spec.branches || [];

  function leafCount(nodes) {
    if (!nodes || nodes.length === 0) return 1;
    let total = 0;
    for (const n of nodes) {
      if (!n.children || n.children.length === 0) total += 1;
      else total += leafCount(n.children);
    }
    return total;
  }
  function maxDepth(nodes) {
    if (!nodes || nodes.length === 0) return 0;
    let d = 0;
    for (const n of nodes) {
      const sub = (!n.children || n.children.length === 0) ? 0 : maxDepth(n.children);
      d = Math.max(d, 1 + sub);
    }
    return d;
  }

  const totalLeaves = leafCount(branches);
  const depth = maxDepth(branches);

  const xStart = 40;
  const xEnd = w - 120; // leave room for outcome labels
  const yStart = 40;
  const yEnd = h - 30;

  const colSpacing = (xEnd - xStart) / Math.max(depth, 1);
  const rowSpacing = (yEnd - yStart) / Math.max(totalLeaves, 1);

  // Assign positions recursively — each leaf claims one row, each internal node sits at the centre of its descendants
  let leafCursor = 0;
  function assign(nodes, level) {
    const positions = [];
    for (const n of nodes) {
      if (!n.children || n.children.length === 0) {
        const y = yStart + (leafCursor + 0.5) * rowSpacing;
        leafCursor += 1;
        positions.push({ node: n, level, y, children: [] });
      } else {
        const childPositions = assign(n.children, level + 1);
        const childYs = childPositions.map((c) => c.y);
        const y = (Math.min(...childYs) + Math.max(...childYs)) / 2;
        positions.push({ node: n, level, y, children: childPositions });
      }
    }
    return positions;
  }
  const tree = assign(branches, 1);

  const rootX = xStart;
  const rootY = tree.length
    ? (Math.min(...tree.map((t) => t.y)) + Math.max(...tree.map((t) => t.y))) / 2
    : h / 2;

  let svg = svgOpen(w, h);

  // Root marker
  svg += `<circle cx="${rootX}" cy="${rootY}" r="4" fill="${S.line}"/>`;
  if (spec.rootLabel) {
    svg += text(rootX - 10, rootY, spec.rootLabel, { size: 15, anchor: "end", bold: true });
  }

  function draw(positions, parentX, parentY) {
    for (const pos of positions) {
      const x = xStart + pos.level * colSpacing;
      const y = pos.y;

      svg += line(parentX, parentY, x, y, { width: 1.5 });

      // Probability label on branch
      if (pos.node.prob) {
        const midX = (parentX + x) / 2;
        const midY = (parentY + y) / 2;
        svg += text(midX, midY - 8, String(pos.node.prob), { size: 14, color: S.dim });
      }

      svg += `<circle cx="${x}" cy="${y}" r="3.5" fill="${S.line}"/>`;

      // Label placement — above dot for internal nodes so outgoing branches stay clear,
      // to the right for leaves (where the next branch doesn't exist)
      if (pos.node.label) {
        if (pos.children.length > 0) {
          svg += text(x, y - 14, String(pos.node.label), { size: 16, anchor: "middle", bold: true });
        } else {
          svg += text(x + 10, y, String(pos.node.label), { size: 16, anchor: "start", bold: true });
        }
      }

      // Leaf outcome annotation — sits further right of the leaf letter
      if (pos.children.length === 0 && pos.node.outcome) {
        svg += text(x + 40, y, String(pos.node.outcome), { size: 13, anchor: "start", color: S.angle, italic: true });
      }

      draw(pos.children, x, y);
    }
  }
  draw(tree, rootX, rootY);

  svg += svgClose;
  return svg;
};

// ─── 26. VENN DIAGRAM ───────────────────────────────────────────────────────

GENERATORS["venn-diagram"] = (spec) => {
  const w = spec._cw || 640, h = spec._ch || 480;
  const sets = spec.sets || [{ label: "A" }, { label: "B" }];
  const counts = spec.counts || {};
  const style = spec.style || (sets.length === 3 ? "3-set" : "2-set");
  const universal = spec.universal !== false;

  const cx = w / 2, cy = h / 2 + 6;

  let svg = svgOpen(w, h);

  if (universal) {
    const margin = 20;
    svg += rect(margin, margin, w - 2 * margin, h - 2 * margin, { width: 1.4, color: S.line });
    svg += text(margin + 8, margin + 16, spec.universalLabel || "\u03BE", { size: 16, anchor: "start", italic: true });
  }

  if (style === "2-set") {
    const r = 110;
    const offset = 70;
    const c1x = cx - offset, c1y = cy;
    const c2x = cx + offset, c2y = cy;

    svg += circle(c1x, c1y, r, { width: 2 });
    svg += circle(c2x, c2y, r, { width: 2 });

    // Set labels sit ABOVE each circle, clear of the outline
    svg += text(c1x - r * 0.55, c1y - r - 14, sets[0].label || "A", { size: 20, bold: true });
    svg += text(c2x + r * 0.55, c2y - r - 14, sets[1].label || "B", { size: 20, bold: true });

    // Region counts — A only, B only, A∩B, outside (none)
    if (counts.A !== undefined) svg += text(c1x - 45, c1y, String(counts.A), { size: 19 });
    if (counts.B !== undefined) svg += text(c2x + 45, c2y, String(counts.B), { size: 19 });
    if (counts.AB !== undefined || counts["A∩B"] !== undefined)
      svg += text(cx, cy, String(counts.AB ?? counts["A∩B"]), { size: 19 });
    if (counts.none !== undefined && universal)
      svg += text(w - 50, h - 45, String(counts.none), { size: 17 });
  } else {
    // 3-set: three overlapping circles arranged in triangle
    const r = 100;
    const oY = 40, oX = 58;
    const c1x = cx - oX, c1y = cy - oY;
    const c2x = cx + oX, c2y = cy - oY;
    const c3x = cx, c3y = cy + oY + 16;

    svg += circle(c1x, c1y, r, { width: 2 });
    svg += circle(c2x, c2y, r, { width: 2 });
    svg += circle(c3x, c3y, r, { width: 2 });

    // Set labels sit OUTSIDE each circle — top-left, top-right, bottom
    svg += text(c1x - r * 0.45, c1y - r - 12, sets[0].label || "A", { size: 19, bold: true });
    svg += text(c2x + r * 0.45, c2y - r - 12, sets[1].label || "B", { size: 19, bold: true });
    svg += text(c3x, c3y + r + 18, sets[2].label || "C", { size: 19, bold: true });

    // Region centroids for a 3-set Venn with this geometry (r = 100, circle
    // centres in a near-equilateral triangle). Each position is chosen so the
    // count sits well clear of every circle outline — minimum ~20 px clearance
    // from the nearest non-region boundary, which keeps text from touching the
    // line at any reasonable font size.
    const triCy = (c1y + c2y + c3y) / 3;
    const abY  = c1y - 38;                        // top lens, well above the C circle's apex
    const lensY = (c1y + c3y) / 2 + 14;           // lower lenses, pushed down toward C
    const regionPositions = {
      A:    [c1x - 45, c1y - 22],
      B:    [c2x + 45, c2y - 22],
      C:    [c3x, c3y + 48],
      AB:   [cx, abY],
      "A∩B": [cx, abY],
      AC:   [c1x + 6, lensY],                     // pushed further left, away from B
      "A∩C": [c1x + 6, lensY],
      BC:   [c2x - 6, lensY],                     // pushed further right, away from A
      "B∩C": [c2x - 6, lensY],
      ABC:  [cx, triCy],
      "A∩B∩C": [cx, triCy],
      none: [w - 50, h - 45],
    };
    for (const [k, count] of Object.entries(counts)) {
      const pos = regionPositions[k];
      if (pos) svg += text(pos[0], pos[1], String(count), { size: 17 });
    }
  }

  svg += svgClose;
  return svg;
};

// ─── 27. ANGLES (single, on-line, at-point, vertically-opposite) ────────────

GENERATORS["angles"] = (spec) => {
  const w = spec._cw || 640, h = spec._ch || 460;
  const subtype = spec.subtype || "single";

  let svg = svgOpen(w, h);

  if (subtype === "single") {
    // Two rays from a vertex, one horizontal to the right, one above at `angle` degrees.
    const cx = w / 2 - 80, cy = h / 2 + 60;
    const rayLen = 220;
    const angleDeg = spec.angle ?? 50;
    const rad = angleDeg * Math.PI / 180;
    const label = formatAngleLabelForDisplay(spec.label || `${angleDeg}°`);

    const x1 = cx + rayLen, y1 = cy;
    const x2 = cx + rayLen * Math.cos(rad), y2 = cy - rayLen * Math.sin(rad);

    svg += line(cx, cy, x1, y1, { width: 2.5 });
    svg += line(cx, cy, x2, y2, { width: 2.5 });
    const lineObstacles = [
      { type: "segment", segment: layoutSegment(cx, cy, x1, y1) },
      { type: "segment", segment: layoutSegment(cx, cy, x2, y2) },
    ];

    // Arc marking the angle — from -angleDeg (upper ray) to 0 (lower ray)
    const arcR = 44;
    svg += arcOpen(cx, cy, arcR, -angleDeg, 0, { color: S.angle, width: 1.8 });

    const placed = chooseTextCandidate(label, angleLabelCandidates(cx, cy, angleDeg / 2, arcR), [
      ...lineObstacles,
      { type: "arc", arc: { cx, cy, r: arcR, startDeg: -angleDeg, endDeg: 0, strokeWidth: 1.8 } },
    ], { fontSize: 20, padding: 3, minClearance: 8 });
    svg += text(placed.x, placed.y, label, { color: S.angle, size: 20, italic: true, anchor: placed.anchor });

    if (spec.vertexLabel) svg += text(cx - 14, cy + 20, spec.vertexLabel, { bold: true, size: 18 });
    if (spec.armLabels) {
      if (spec.armLabels[0]) svg += text(x1 + 12, y1, spec.armLabels[0], { bold: true, size: 18, anchor: "start" });
      if (spec.armLabels[1]) svg += text(x2 - 8 * Math.cos(rad), y2 - 16 * Math.sin(rad) - 6, spec.armLabels[1], { bold: true, size: 18 });
    }
  } else if (subtype === "on-line") {
    // Horizontal straight line with rays rising from a point on it.
    // `angles` is the sequence of sub-angles summing to 180°.
    const angles = spec.angles || [60, 120];
    const labels = spec.labels || angles.map((a) => `${a}°`);

    const cx = w / 2, cy = h / 2 + 60;
    const halfLine = 260;
    const rayLen = 190;

    // Full horizontal line
    svg += line(cx - halfLine, cy, cx + halfLine, cy, { width: 2.5 });
    const lineObstacles = [
      { type: "segment", segment: layoutSegment(cx - halfLine, cy, cx + halfLine, cy) },
    ];
    const placedLabelObstacles = [];

    // Draw internal rays (not the endpoints of the line)
    let cum = 0;
    for (let i = 0; i < angles.length - 1; i++) {
      cum += angles[i];
      const rad = cum * Math.PI / 180;
      const rx = cx + rayLen * Math.cos(rad);
      const ry = cy - rayLen * Math.sin(rad);
      svg += line(cx, cy, rx, ry, { width: 2.5 });
      lineObstacles.push({ type: "segment", segment: layoutSegment(cx, cy, rx, ry) });
    }

    // Arc + label for each sub-angle
    cum = 0;
    for (let i = 0; i < angles.length; i++) {
      const start = cum, end = cum + angles[i];
      const arcR = 38 + (i % 2) * 6; // stagger arc radii slightly
      svg += arcOpen(cx, cy, arcR, -end, -start, { color: S.angle, width: 1.6 });

      const label = formatAngleLabelForDisplay(labels[i]);
      const midDeg = (start + end) / 2;
      const placed = chooseTextCandidate(label, angleLabelCandidates(cx, cy, midDeg, arcR), [
        ...lineObstacles,
        { type: "arc", arc: { cx, cy, r: arcR, startDeg: -end, endDeg: -start, strokeWidth: 1.6 } },
        ...placedLabelObstacles,
      ], { fontSize: 17, padding: 3, minClearance: 8 });
      placedLabelObstacles.push({ type: "box", box: placed.box });
      svg += text(placed.x, placed.y, label, { color: S.angle, size: 17, italic: true, anchor: placed.anchor });
      cum = end;
    }

    svg += `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${S.line}"/>`;
  } else if (subtype === "at-point") {
    // Rays radiating from a point, angles summing to 360°.
    const angles = spec.angles || [90, 90, 90, 90];
    const labels = spec.labels || angles.map((a) => `${a}°`);

    const cx = w / 2, cy = h / 2 + 10;
    const rayLen = 180;
    const lineObstacles = [];
    const placedLabelObstacles = [];

    // Rays start at 0° and step counterclockwise
    let cum = 0;
    const rayDegs = [0];
    for (const a of angles) {
      cum += a;
      if (cum < 360 - 0.01) rayDegs.push(cum);
    }
    for (const deg of rayDegs) {
      const rad = deg * Math.PI / 180;
      const rx = cx + rayLen * Math.cos(rad);
      const ry = cy - rayLen * Math.sin(rad);
      svg += line(cx, cy, rx, ry, { width: 2.5 });
      lineObstacles.push({ type: "segment", segment: layoutSegment(cx, cy, rx, ry) });
    }

    // Arc + label for each sub-angle
    cum = 0;
    for (let i = 0; i < angles.length; i++) {
      const start = cum, end = cum + angles[i];
      const arcR = 34 + (i % 2) * 5;
      svg += arcOpen(cx, cy, arcR, -end, -start, { color: S.angle, width: 1.5 });

      const label = formatAngleLabelForDisplay(labels[i]);
      const midDeg = (start + end) / 2;
      const placed = chooseTextCandidate(label, angleLabelCandidates(cx, cy, midDeg, arcR), [
        ...lineObstacles,
        { type: "arc", arc: { cx, cy, r: arcR, startDeg: -end, endDeg: -start, strokeWidth: 1.5 } },
        ...placedLabelObstacles,
      ], { fontSize: 16, padding: 3, minClearance: 8 });
      placedLabelObstacles.push({ type: "box", box: placed.box });
      svg += text(placed.x, placed.y, label, { color: S.angle, size: 16, italic: true, anchor: placed.anchor });
      cum = end;
    }

    svg += `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${S.line}"/>`;
  } else if (subtype === "vertically-opposite") {
    // Two straight lines crossing at a point. Acute angle = theta.
    const cx = w / 2, cy = h / 2 + 10;
    const lineLen = 220;
    const theta = spec.angle ?? 50;
    const thetaRad = theta * Math.PI / 180;
    const labels = spec.labels || [];
    const lineObstacles = [
      { type: "segment", segment: layoutSegment(cx - lineLen, cy, cx + lineLen, cy) },
      {
        type: "segment",
        segment: layoutSegment(
          cx + lineLen * Math.cos(thetaRad),
          cy - lineLen * Math.sin(thetaRad),
          cx - lineLen * Math.cos(thetaRad),
          cy + lineLen * Math.sin(thetaRad)
        ),
      },
    ];
    const placedLabelObstacles = [];

    svg += line(cx - lineLen, cy, cx + lineLen, cy, { width: 2.5 });
    svg += line(
      cx + lineLen * Math.cos(thetaRad), cy - lineLen * Math.sin(thetaRad),
      cx - lineLen * Math.cos(thetaRad), cy + lineLen * Math.sin(thetaRad),
      { width: 2.5 }
    );

    const arcRadii = [30, 42, 30, 42]; // alternate so adjacent arcs don't merge into one ring

    // Four sectors (SVG angle convention: clockwise from east)
    const secs = [
      { start: 0,           end: 180 - theta,  angleVal: 180 - theta, midDeg: (180 - theta) / 2 },
      { start: 180 - theta, end: 180,          angleVal: theta,       midDeg: 180 - theta / 2 },
      { start: 180,         end: 360 - theta,  angleVal: 180 - theta, midDeg: 270 - theta / 2 },
      { start: 360 - theta, end: 360,          angleVal: theta,       midDeg: 360 - theta / 2 },
    ];

    secs.forEach((s, i) => {
      const arcR = arcRadii[i];
      svg += arcOpen(cx, cy, arcR, s.start, s.end, { color: S.angle, width: 1.5 });
      const lbl = formatAngleLabelForDisplay(labels[i] || `${s.angleVal}°`);
      const placed = chooseTextCandidate(lbl, angleLabelCandidates(cx, cy, s.midDeg, arcR, { svgDegrees: true }), [
        ...lineObstacles,
        { type: "arc", arc: { cx, cy, r: arcR, startDeg: s.start, endDeg: s.end, strokeWidth: 1.5 } },
        ...placedLabelObstacles,
      ], { fontSize: 16, padding: 3, minClearance: 8 });
      placedLabelObstacles.push({ type: "box", box: placed.box });
      svg += text(placed.x, placed.y, lbl, { color: S.angle, size: 16, italic: true, anchor: placed.anchor });
    });

    svg += `<circle cx="${cx}" cy="${cy}" r="3" fill="${S.line}"/>`;
  }

  svg += svgClose;
  return svg;
};

// ─── TIER 1 PRIMARY DIAGRAMS ────────────────────────────────────────────────

// Helper: pull the first numeric value out of a label like "5 cm" → 5.
function parseLen(s, fallback = 1) {
  if (typeof s === "number") return s;
  const m = String(s || "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : fallback;
}

// Soft tints used for filled regions where line-only would be unclear (pie
// slices, spinner sectors, fraction bar shading). Kept light so any text on
// top remains readable.
const TINT = ["#D5E8F0", "#FDE8E8", "#E8F4D5", "#F4E8D5", "#E8D5F0", "#D5F0E8", "#F0E8D5"];

// 28. FRACTION BAR — one or more horizontal bars divided into equal parts,
// with the first `shaded` cells lightly tinted. Supports either a single bar
// (top-level `parts`/`shaded`/`label`) or a list of bars for comparison.
GENERATORS["fraction-bar"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const bars = spec.bars || [{ parts: spec.parts, shaded: spec.shaded, label: spec.label }];
  const n = bars.length;

  const barW = (w - PAD * 2) * 0.85;
  const gap = 36;
  const maxBarH = 70;
  const barH = Math.min(maxBarH, ((h - PAD * 2) - (n - 1) * gap) / n);
  const totalH = n * barH + (n - 1) * gap;
  const startY = (h - totalH) / 2;
  const startX = (w - barW) / 2;

  let svg = svgOpen(w, h);

  bars.forEach((bar, idx) => {
    const y = startY + idx * (barH + gap);
    const parts = bar.parts || 1;
    const shaded = Math.max(0, Math.min(parts, bar.shaded || 0));
    const cellW = barW / parts;

    for (let i = 0; i < shaded; i++) {
      svg += `<rect x="${startX + i * cellW}" y="${y}" width="${cellW}" height="${barH}" fill="${TINT[0]}" stroke="none"/>`;
    }
    svg += rect(startX, y, barW, barH);
    for (let i = 1; i < parts; i++) {
      svg += line(startX + i * cellW, y, startX + i * cellW, y + barH);
    }
    if (bar.label) {
      svg += text(startX + barW / 2, y + barH + LBL, bar.label, { color: S.dim, size: 22 });
    }
  });

  svg += svgClose;
  return svg;
};

// 29. PIE CHART — proportional sectors of a circle with labels just outside.
// Slice values do not need to sum to anything specific; they're normalised.
GENERATORS["pie-chart"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const cx = w / 2, cy = h / 2;
  const r = Math.min(w, h) / 2 - PAD - 30;
  const slices = spec.slices || [];
  const total = slices.reduce((s, sl) => s + (sl.value || 0), 0) || 1;

  let svg = svgOpen(w, h);

  let cumAngle = -90; // start at 12 o'clock
  slices.forEach((sl, i) => {
    const sweep = (sl.value / total) * 360;
    const startA = cumAngle;
    const endA = cumAngle + sweep;
    const startRad = startA * Math.PI / 180;
    const endRad = endA * Math.PI / 180;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const large = sweep > 180 ? 1 : 0;
    const fill = sl.color || TINT[i % TINT.length];

    svg += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${fill}" stroke="${S.line}" stroke-width="${S.lw}" stroke-linejoin="round"/>`;

    if (sl.label) {
      const midRad = (startA + sweep / 2) * Math.PI / 180;
      const lblR = r + 26;
      const lx = cx + lblR * Math.cos(midRad);
      const ly = cy + lblR * Math.sin(midRad);
      const cosM = Math.cos(midRad);
      const anchor = cosM > 0.2 ? "start" : cosM < -0.2 ? "end" : "middle";
      svg += text(lx, ly, sl.label, { color: S.label, size: 18, anchor });
    }

    cumAngle = endA;
  });

  svg += svgClose;
  return svg;
};

// 30. ARRAY / AREA MODEL — rectangular grid of rows × cols cells. Used to
// visualise multiplication, division, and the area model for products of
// two-digit numbers. Optional row/column factor labels and an equation label.
GENERATORS["array"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const rows = Math.max(1, spec.rows || 1);
  const cols = Math.max(1, spec.cols || 1);

  const usableW = (w - PAD * 2) * 0.82;
  const usableH = (h - PAD * 2) * 0.7;
  const cellSize = Math.min(usableW / cols, usableH / rows);
  const gridW = cellSize * cols;
  const gridH = cellSize * rows;
  const startX = (w - gridW) / 2;
  const startY = (h - gridH) / 2 + 8;

  let svg = svgOpen(w, h);

  svg += rect(startX, startY, gridW, gridH);
  for (let i = 1; i < cols; i++) {
    svg += line(startX + i * cellSize, startY, startX + i * cellSize, startY + gridH, { width: 1.5 });
  }
  for (let j = 1; j < rows; j++) {
    svg += line(startX, startY + j * cellSize, startX + gridW, startY + j * cellSize, { width: 1.5 });
  }

  if (spec.colsLabel) {
    svg += text(startX + gridW / 2, startY - LBL, spec.colsLabel, { color: S.dim, size: 22 });
  }
  if (spec.rowsLabel) {
    svg += text(startX - LBL, startY + gridH / 2, spec.rowsLabel, { color: S.dim, size: 22, anchor: "end" });
  }
  if (spec.label) {
    svg += text(w / 2, startY + gridH + LBL_GENEROUS, spec.label, { color: S.label, size: 22, bold: true });
  }

  svg += svgClose;
  return svg;
};

// 31. PICTOGRAPH — rows of repeated icons, each icon representing iconValue
// units. Optional title above and key below.
GENERATORS["pictograph"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const rows = spec.rows || [];
  const iconValue = spec.iconValue || 1;
  const iconR = 11;
  const iconSpacing = 28;
  const labelW = 130;

  const titleH = spec.title ? 36 : 0;
  const keyH = spec.key ? 30 : 0;
  const startY = PAD + titleH + 16;
  const usableH = h - startY - PAD - keyH - 16;
  const rowH = Math.min(44, Math.max(28, usableH / Math.max(rows.length, 1)));

  let svg = svgOpen(w, h);

  if (spec.title) {
    svg += text(w / 2, PAD - 8, spec.title, { color: S.label, size: 22, bold: true });
  }

  rows.forEach((row, i) => {
    const y = startY + i * rowH + rowH / 2;
    svg += text(PAD + labelW - 12, y, row.label, { color: S.label, size: 18, anchor: "end" });
    const numIcons = Math.round((row.count || 0) / iconValue);
    for (let j = 0; j < numIcons; j++) {
      const cx = PAD + labelW + 14 + j * iconSpacing + iconR;
      svg += `<circle cx="${cx}" cy="${y}" r="${iconR}" fill="${S.dim}" stroke="${S.line}" stroke-width="1.4"/>`;
    }
  });

  if (spec.key) {
    svg += text(w / 2, h - PAD + 6, spec.key, { color: S.label, size: 16, italic: true });
  }

  svg += svgClose;
  return svg;
};

// 32. NET — unfolded surface of a 3D solid. Supports cube, rect-prism,
// tri-prism, cylinder, square-pyramid.
GENERATORS["net"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const shape = spec.shape || "cube";

  let svg = svgOpen(w, h);

  if (shape === "cube") {
    const s = Math.min((w - PAD * 2) / 4, (h - PAD * 2) / 3);
    const startX = (w - 4 * s) / 2;
    const startY = (h - 3 * s) / 2;
    for (let i = 0; i < 4; i++) svg += rect(startX + i * s, startY + s, s, s);
    svg += rect(startX + s, startY, s, s);
    svg += rect(startX + s, startY + 2 * s, s, s);
    if (spec.side) {
      svg += text(startX + 4 * s + 12, startY + s + s / 2, spec.side, { color: S.dim, size: 20, anchor: "start" });
    }
  } else if (shape === "rect-prism") {
    const wn = parseLen(spec.width, 4);
    const hn = parseLen(spec.height, 3);
    const dn = parseLen(spec.depth, 2);
    const totalW = 2 * dn + 2 * wn;
    const totalH = hn + 2 * dn;
    const scale = Math.min((w - PAD * 2) / totalW, (h - PAD * 2) / totalH);
    const W_ = wn * scale, H_ = hn * scale, D_ = dn * scale;
    const startX = (w - (2 * D_ + 2 * W_)) / 2;
    const startY = (h - (H_ + 2 * D_)) / 2;
    const my = startY + D_;
    let x = startX;
    svg += rect(x, my, D_, H_); x += D_;
    const frontX = x;
    svg += rect(x, my, W_, H_); x += W_;
    svg += rect(x, my, D_, H_); x += D_;
    svg += rect(x, my, W_, H_);
    svg += rect(frontX, startY, W_, D_);
    svg += rect(frontX, my + H_, W_, D_);
    // width labels the front face (and the bottom flap) horizontally
    if (spec.width)  svg += text(frontX + W_ / 2, my + H_ + D_ + LBL, spec.width, { color: S.dim, size: 18 });
    // height labels the front face vertically — placed inside the left flap
    // so it sits right next to the front face's left edge
    if (spec.height) svg += text(frontX - 14, my + H_ / 2, spec.height, { color: S.dim, size: 18, anchor: "end" });
    // depth labels the vertical extent of the top flap — placed beside the
    // top flap's right edge so it cannot be misread as the flap's width
    if (spec.depth)  svg += text(frontX + W_ + 14, startY + D_ / 2, spec.depth, { color: S.dim, size: 18, anchor: "start" });
  } else if (shape === "cylinder") {
    const rn = parseLen(spec.radius, 2);
    const hn = parseLen(spec.height, 4);
    const circ = 2 * Math.PI * rn;
    // Reserve gap before scaling math units, big enough for a label in between.
    const gapPx = 56;
    const usableW = (w - PAD * 2) - 2 * gapPx;
    const usableH = (h - PAD * 2);
    const scaleW = usableW / (4 * rn + circ);
    const scaleH = usableH / Math.max(2 * rn, hn);
    const scale = Math.min(scaleW, scaleH);
    const R_ = rn * scale, H_ = hn * scale, C_ = circ * scale;
    const cy = h / 2;
    const totalPx = 4 * R_ + 2 * gapPx + C_;
    let x = (w - totalPx) / 2;
    const leftCx = x + R_;
    svg += circle(leftCx, cy, R_);
    x += 2 * R_ + gapPx;
    const rectX = x;
    svg += rect(x, cy - H_ / 2, C_, H_);
    x += C_ + gapPx;
    svg += circle(x + R_, cy, R_);
    // Radius marker: vertical dashed line from centre to top of left circle so
    // it doesn't visually collide with the height label sitting beside the
    // rectangle. Label inside the upper half of the circle.
    svg += line(leftCx, cy, leftCx, cy - R_, { color: S.dim, width: 1.4, dash: "4,3" });
    if (spec.radius) svg += text(leftCx + 8, cy - R_ / 2, spec.radius, { color: S.dim, size: 16, anchor: "start" });
    // Height label: between the circle and the rectangle, vertically centred.
    if (spec.height) svg += text(rectX - gapPx / 2, cy, spec.height, { color: S.dim, size: 18 });
    svg += text(rectX + C_ / 2, cy + H_ / 2 + LBL, "2πr", { color: S.dim, size: 18, italic: true });
  } else if (shape === "square-pyramid") {
    const bn = parseLen(spec.base, 4);
    const sn = parseLen(spec.slant, 4);
    const totalDim = bn + 2 * sn;
    const scale = Math.min((w - PAD * 2) / totalDim, (h - PAD * 2) / totalDim);
    const B_ = bn * scale;
    const S_ = sn * scale;
    const triApexH = Math.sqrt(Math.max(0, S_ * S_ - (B_ / 2) * (B_ / 2))) || S_ * 0.7;
    const cx = w / 2, cy = h / 2;
    const sx = cx - B_ / 2, sy = cy - B_ / 2;
    svg += rect(sx, sy, B_, B_);
    svg += polyline([[sx, sy], [sx + B_, sy], [cx, sy - triApexH]]);
    svg += polyline([[sx, sy + B_], [sx + B_, sy + B_], [cx, sy + B_ + triApexH]]);
    svg += polyline([[sx, sy], [sx, sy + B_], [sx - triApexH, cy]]);
    svg += polyline([[sx + B_, sy], [sx + B_, sy + B_], [sx + B_ + triApexH, cy]]);
    if (spec.base)  svg += text(cx, sy + B_ / 2, spec.base, { color: S.dim, size: 16 });
    if (spec.slant) svg += text(sx + B_ + triApexH / 2 + 4, cy - triApexH / 4, spec.slant, { color: S.dim, size: 16, anchor: "start" });
  } else if (shape === "tri-prism") {
    const bn = parseLen(spec.base, 4);
    const tHeight = parseLen(spec.triHeight, 3.5);
    const ln = parseLen(spec.length, 5);
    const totalW = 3 * bn;
    const totalH = ln + 2 * tHeight;
    const scale = Math.min((w - PAD * 2) / totalW, (h - PAD * 2) / totalH);
    const B_ = bn * scale, L_ = ln * scale, T_ = tHeight * scale;
    const startX = (w - 3 * B_) / 2;
    const startY = (h - (L_ + 2 * T_)) / 2;
    const my = startY + T_;
    svg += rect(startX, my, B_, L_);
    svg += rect(startX + B_, my, B_, L_);
    svg += rect(startX + 2 * B_, my, B_, L_);
    svg += polyline([[startX + B_, my], [startX + 2 * B_, my], [startX + 1.5 * B_, my - T_]]);
    svg += polyline([[startX + B_, my + L_], [startX + 2 * B_, my + L_], [startX + 1.5 * B_, my + L_ + T_]]);
    if (spec.base)      svg += text(startX + 1.5 * B_, my + L_ + T_ + LBL, spec.base, { color: S.dim, size: 18 });
    if (spec.length)    svg += text(startX - 12, my + L_ / 2, spec.length, { color: S.dim, size: 18, anchor: "end" });
    if (spec.triHeight) svg += text(startX + 2 * B_ + 12, my + L_ + T_ / 2, spec.triHeight, { color: S.dim, size: 18, anchor: "start" });
  }

  svg += svgClose;
  return svg;
};

// 33. CLOCK — analogue clock face showing a given hour:minute.
GENERATORS["clock"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const cx = w / 2, cy = h / 2;
  const r = Math.min(w, h) / 2 - PAD - 20;

  let svg = svgOpen(w, h);
  svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#FFFFFF" stroke="${S.line}" stroke-width="${S.lw}"/>`;

  for (let i = 1; i <= 12; i++) {
    const angle = (i * 30 - 90) * Math.PI / 180;
    const tx1 = cx + r * Math.cos(angle), ty1 = cy + r * Math.sin(angle);
    const tx2 = cx + (r - 14) * Math.cos(angle), ty2 = cy + (r - 14) * Math.sin(angle);
    svg += line(tx1, ty1, tx2, ty2, { width: 2.5 });
    const nx = cx + (r - 36) * Math.cos(angle), ny = cy + (r - 36) * Math.sin(angle);
    svg += text(nx, ny, String(i), { color: S.label, size: 22, bold: true });
  }
  for (let i = 0; i < 60; i++) {
    if (i % 5 === 0) continue;
    const angle = (i * 6 - 90) * Math.PI / 180;
    const tx1 = cx + r * Math.cos(angle), ty1 = cy + r * Math.sin(angle);
    const tx2 = cx + (r - 7) * Math.cos(angle), ty2 = cy + (r - 7) * Math.sin(angle);
    svg += line(tx1, ty1, tx2, ty2, { width: 1 });
  }

  const hour = ((spec.hour || 0) % 12 + 12) % 12;
  const minute = spec.minute || 0;
  const hourAngle = ((hour + minute / 60) * 30 - 90) * Math.PI / 180;
  const minAngle = (minute * 6 - 90) * Math.PI / 180;
  const hourLen = r * 0.55, minLen = r * 0.78;
  svg += line(cx, cy, cx + hourLen * Math.cos(hourAngle), cy + hourLen * Math.sin(hourAngle), { width: 5 });
  svg += line(cx, cy, cx + minLen * Math.cos(minAngle), cy + minLen * Math.sin(minAngle), { width: 3 });
  svg += `<circle cx="${cx}" cy="${cy}" r="6" fill="${S.line}"/>`;

  svg += svgClose;
  return svg;
};

// 34. SPINNER — circle divided into proportional sectors with a fixed pointer
// at 12 o'clock. Sectors have optional colour, label, and proportion (default 1).
GENERATORS["spinner"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const cx = w / 2, cy = h / 2;
  const r = Math.min(w, h) / 2 - PAD - 30;
  const sectors = spec.sectors || [];
  if (sectors.length === 0) return svgOpen(w, h) + svgClose;

  const total = sectors.reduce((s, sec) => s + (sec.proportion || 1), 0) || 1;

  let svg = svgOpen(w, h);

  let cumAngle = -90;
  sectors.forEach((sec, i) => {
    const sweep = (sec.proportion || 1) / total * 360;
    const startA = cumAngle;
    const endA = cumAngle + sweep;
    const startRad = startA * Math.PI / 180;
    const endRad = endA * Math.PI / 180;
    const x1 = cx + r * Math.cos(startRad), y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad), y2 = cy + r * Math.sin(endRad);
    const large = sweep > 180 ? 1 : 0;
    const fill = sec.color || TINT[i % TINT.length];

    svg += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${fill}" stroke="${S.line}" stroke-width="${S.lw}" stroke-linejoin="round"/>`;

    if (sec.label) {
      const midRad = (startA + sweep / 2) * Math.PI / 180;
      const lx = cx + r * 0.62 * Math.cos(midRad);
      const ly = cy + r * 0.62 * Math.sin(midRad);
      svg += text(lx, ly, sec.label, { color: S.label, size: 18, bold: true });
    }
    cumAngle = endA;
  });

  // Fixed pointer at 12 o'clock
  const pointerLen = r * 0.85;
  svg += `<path d="M ${cx - 9} ${cy} L ${cx} ${cy - pointerLen} L ${cx + 9} ${cy} Z" fill="${S.angle}" stroke="${S.line}" stroke-width="1.5" stroke-linejoin="round"/>`;
  svg += `<circle cx="${cx}" cy="${cy}" r="7" fill="${S.line}"/>`;

  svg += svgClose;
  return svg;
};

// ─── TIER 2 SECONDARY DIAGRAMS ──────────────────────────────────────────────

// 35. BOX-AND-WHISKER PLOT — single or multiple horizontal box plots above a
// shared numerical axis.
GENERATORS["box-plot"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const plots = spec.plots || [{
    min: spec.min, q1: spec.q1, median: spec.median, q3: spec.q3, max: spec.max, label: spec.label,
  }];

  const lx = PAD + 70, rx = w - PAD - 30;
  const axisY = h - PAD - 20;

  // Auto-range if not supplied
  let xMin = spec.xMin, xMax = spec.xMax;
  if (xMin === undefined || xMax === undefined) {
    const vals = plots.flatMap(p => [p.min, p.max].filter(v => v !== undefined));
    const dataMin = Math.min(...vals), dataMax = Math.max(...vals);
    const span = dataMax - dataMin || 1;
    xMin = xMin === undefined ? dataMin - span * 0.08 : xMin;
    xMax = xMax === undefined ? dataMax + span * 0.08 : xMax;
  }
  const range = xMax - xMin;
  const toX = v => lx + (v - xMin) / range * (rx - lx);

  // Pack boxes close to the axis rather than stretching across the whole
  // canvas — leaves the diagram visually compact even when there's spare
  // vertical space.
  const slot = 80;
  const boxH = 56;
  const gapAboveAxis = 22;
  const stackHeight = slot * plots.length;
  const stackTop = axisY - gapAboveAxis - stackHeight;

  let svg = svgOpen(w, h);

  plots.forEach((p, i) => {
    const cy = stackTop + slot * i + slot / 2;
    const top = cy - boxH / 2, bot = cy + boxH / 2;
    const xMin_ = toX(p.min), xQ1 = toX(p.q1), xMed = toX(p.median), xQ3 = toX(p.q3), xMax_ = toX(p.max);

    // Whiskers
    svg += line(xMin_, cy, xQ1, cy, { width: 1.8 });
    svg += line(xQ3, cy, xMax_, cy, { width: 1.8 });
    // End-caps
    svg += line(xMin_, top + boxH * 0.18, xMin_, bot - boxH * 0.18, { width: 1.8 });
    svg += line(xMax_, top + boxH * 0.18, xMax_, bot - boxH * 0.18, { width: 1.8 });
    // Box
    svg += rect(xQ1, top, xMed - xQ1, boxH);
    svg += rect(xMed, top, xQ3 - xMed, boxH);
    // Median emphasis
    svg += line(xMed, top, xMed, bot, { width: 2.6 });

    if (p.label) svg += text(lx - 14, cy, p.label, { color: S.label, size: 18, anchor: "end" });
  });

  // Numerical axis
  svg += line(lx, axisY, rx, axisY, { width: 2 });
  // Tick spacing: target ~8 ticks
  const targetTicks = 8;
  const rawStep = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const startTick = Math.ceil(xMin / step) * step;
  for (let v = startTick; v <= xMax + 1e-9; v += step) {
    const tx = toX(v);
    svg += line(tx, axisY, tx, axisY + 6, { width: 1.4 });
    const lbl = Number.isInteger(step) ? String(Math.round(v)) : v.toFixed(1);
    svg += text(tx, axisY + 22, lbl, { color: S.label, size: 16 });
  }
  if (spec.xLabel) svg += text((lx + rx) / 2, axisY + 48, spec.xLabel, { color: S.dim, size: 18, italic: true });

  svg += svgClose;
  return svg;
};

// 36. SCATTER PLOT — bivariate data on a coordinate plane, with optional
// least-squares line of best fit.
GENERATORS["scatter-plot"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const points = spec.points || [];
  const pointX = (p) => Array.isArray(p) ? p[0] : p.x;
  const pointY = (p) => Array.isArray(p) ? p[1] : p.y;

  // Auto-range with small padding if not supplied
  let xMin = spec.xMin, xMax = spec.xMax, yMin = spec.yMin, yMax = spec.yMax;
  if ([xMin, xMax, yMin, yMax].some(v => v === undefined)) {
    const xs = points.map(pointX), ys = points.map(pointY);
    const xLo = Math.min(...xs), xHi = Math.max(...xs);
    const yLo = Math.min(...ys), yHi = Math.max(...ys);
    const xPad = (xHi - xLo || 1) * 0.1, yPad = (yHi - yLo || 1) * 0.1;
    if (xMin === undefined) xMin = Math.floor(xLo - xPad);
    if (xMax === undefined) xMax = Math.ceil(xHi + xPad);
    if (yMin === undefined) yMin = Math.floor(yLo - yPad);
    if (yMax === undefined) yMax = Math.ceil(yHi + yPad);
  }

  const lx = PAD + 40, rx = w - PAD - 20;
  const ty = PAD + 20, by = h - PAD - 50;
  const rangeX = xMax - xMin, rangeY = yMax - yMin;
  const toSvgX = v => lx + (v - xMin) / rangeX * (rx - lx);
  const toSvgY = v => by - (v - yMin) / rangeY * (by - ty);

  let svg = svgOpen(w, h);

  // Choose a "nice" tick step targeting ~8 ticks per axis
  const niceStep = (range, target = 8) => {
    const raw = range / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  };
  const stepX = niceStep(rangeX);
  const stepY = niceStep(rangeY);
  const startX = Math.ceil(xMin / stepX) * stepX;
  const startYTick = Math.ceil(yMin / stepY) * stepY;
  const fmt = (v, step) => Number.isInteger(step) ? String(Math.round(v)) : (Math.abs(v) < 1e-9 ? "0" : v.toFixed(1));

  // Grid
  for (let x = startX; x <= xMax + 1e-9; x += stepX) svg += line(toSvgX(x), ty, toSvgX(x), by, { color: "#DDDDDD", width: 0.5 });
  for (let y = startYTick; y <= yMax + 1e-9; y += stepY) svg += line(lx, toSvgY(y), rx, toSvgY(y), { color: "#DDDDDD", width: 0.5 });

  // Axes (left/bottom border style for scatter)
  svg += line(lx, by, rx, by, { width: 2 });
  svg += line(lx, ty, lx, by, { width: 2 });

  // Tick labels
  for (let x = startX; x <= xMax + 1e-9; x += stepX) {
    const tx = toSvgX(x);
    svg += line(tx, by, tx, by + 5, { width: 1.2 });
    svg += text(tx, by + 18, fmt(x, stepX), { size: 15 });
  }
  for (let y = startYTick; y <= yMax + 1e-9; y += stepY) {
    const sy = toSvgY(y);
    svg += line(lx - 5, sy, lx, sy, { width: 1.2 });
    svg += text(lx - 14, sy, fmt(y, stepY), { size: 15, anchor: "end" });
  }

  // Optional line of best fit
  if (spec.lineOfBestFit && points.length >= 2) {
    let m, c;
    if (typeof spec.lineOfBestFit === "object" && spec.lineOfBestFit.m !== undefined) {
      m = spec.lineOfBestFit.m;
      c = spec.lineOfBestFit.c || 0;
    } else {
      const n = points.length;
      const sX = points.reduce((s, p) => s + pointX(p), 0);
      const sY = points.reduce((s, p) => s + pointY(p), 0);
      const sXY = points.reduce((s, p) => s + pointX(p) * pointY(p), 0);
      const sX2 = points.reduce((s, p) => s + pointX(p) * pointX(p), 0);
      const denom = n * sX2 - sX * sX;
      m = denom === 0 ? 0 : (n * sXY - sX * sY) / denom;
      c = (sY - m * sX) / n;
    }
    // Clip line to plot rect
    const fx = (x) => m * x + c;
    let xa = xMin, xb = xMax, ya = fx(xa), yb = fx(xb);
    // Liang-Barsky-lite for y-clipping
    if (ya < yMin) { xa = (yMin - c) / m; ya = yMin; }
    if (ya > yMax) { xa = (yMax - c) / m; ya = yMax; }
    if (yb < yMin) { xb = (yMin - c) / m; yb = yMin; }
    if (yb > yMax) { xb = (yMax - c) / m; yb = yMax; }
    svg += line(toSvgX(xa), toSvgY(ya), toSvgX(xb), toSvgY(yb), { color: S.angle, width: 2, dash: "6,4" });
  }

  // Points
  points.forEach(p => {
    svg += `<circle cx="${toSvgX(pointX(p))}" cy="${toSvgY(pointY(p))}" r="5" fill="${S.dim}" stroke="${S.line}" stroke-width="1.4"/>`;
  });

  // Axis labels (y rotated 90° so it sits cleanly beside the axis without
  // overlapping tick labels or the axis line itself)
  if (spec.xLabel) svg += text((lx + rx) / 2, by + 38, spec.xLabel, { color: S.dim, size: 17, italic: true });
  if (spec.yLabel) svg += text(lx - 42, (ty + by) / 2, spec.yLabel, { color: S.dim, size: 17, italic: true, anchor: "middle", rotate: -90 });

  svg += svgClose;
  return svg;
};

// 37. STEM-AND-LEAF PLOT — two-column display with stems and sorted leaves.
GENERATORS["stem-and-leaf"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const stems = spec.stems || [];

  const titleH = spec.title ? 36 : 0;
  const headerH = 32;

  const startY = PAD + titleH + headerH;
  const keyReserve = spec.key ? 28 : 0;
  const usableH = h - startY - PAD - 16 - keyReserve;
  const rowH = Math.min(34, Math.max(22, usableH / Math.max(stems.length, 1)));
  const totalH = rowH * stems.length;

  const dividerX = w / 2 - 70;
  const stemLabelX = dividerX - 24;

  let svg = svgOpen(w, h);

  if (spec.title) svg += text(w / 2, PAD - 8, spec.title, { color: S.label, size: 22, bold: true });

  // Headers
  svg += text(stemLabelX, startY - headerH / 2, "Stem", { color: S.label, size: 18, bold: true, anchor: "end" });
  svg += text(dividerX + 24, startY - headerH / 2, "Leaves", { color: S.label, size: 18, bold: true, anchor: "start" });

  // Vertical divider running full table height
  svg += line(dividerX, startY - headerH + 6, dividerX, startY + totalH, { width: 1.8 });
  // Horizontal under headers
  svg += line(dividerX - 100, startY - 4, dividerX + 320, startY - 4, { width: 1.4 });

  stems.forEach((row, i) => {
    const y = startY + rowH * i + rowH / 2;
    svg += text(stemLabelX, y, String(row.stem), { color: S.label, size: 18, bold: true, anchor: "end" });
    const leaves = (row.leaves || []).slice().sort((a, b) => a - b).join("  ");
    svg += text(dividerX + 24, y, leaves, { color: S.label, size: 18, anchor: "start" });
  });

  if (spec.key) {
    svg += text(PAD, startY + totalH + 20, `Key: ${spec.key}`, { color: S.label, size: 15, italic: true, anchor: "start" });
  }

  svg += svgClose;
  return svg;
};

// 38. CONE — apex at top, elliptical base, with radius/height/slant labels.
GENERATORS["cone"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const cx = w / 2;
  const rx = 130, ry = 32;
  const apexY = PAD + 30;
  const baseY = h - PAD - 50;

  let svg = svgOpen(w, h);

  // Back half of base ellipse (dashed — hidden)
  svg += `<path d="M ${cx - rx} ${baseY} A ${rx} ${ry} 0 0 1 ${cx + rx} ${baseY}" fill="none" stroke="#888" stroke-width="1.2" stroke-dasharray="5,4"/>`;
  // Front half of base (solid)
  svg += `<path d="M ${cx - rx} ${baseY} A ${rx} ${ry} 0 0 0 ${cx + rx} ${baseY}" fill="none" stroke="${S.line}" stroke-width="${S.lw}"/>`;

  // Slant lines (apex to base edge)
  svg += line(cx, apexY, cx - rx, baseY);
  svg += line(cx, apexY, cx + rx, baseY);

  // Dashed centre axis (height)
  svg += line(cx, apexY, cx, baseY, { color: S.dim, width: 1.2, dash: "4,3" });
  // Right-angle mark at base where height meets the base diameter
  svg += rightAngleMark(cx, baseY, 12, [-1, 0], [0, -1]);

  // Dashed radius from centre to right edge of front base
  svg += line(cx, baseY, cx + rx, baseY, { color: S.dim, width: 1.2, dash: "4,3" });

  // Labels — placed close to what they label, with the white text halo
  // masking the dashed reference lines where they cross underneath:
  //   • radius sits on the dashed radius line, inside the upper half of the
  //     base ellipse
  //   • height sits on the dashed central axis at midheight (well clear of
  //     the slants — they're at cx ± rx/2 here, ~65 px from the axis)
  //   • slant sits just outside the right slant at its midpoint
  if (spec.radius) svg += text(cx + rx / 2, baseY, spec.radius, { color: S.dim, size: 20 });
  if (spec.height) svg += text(cx, (apexY + baseY) / 2, spec.height, { color: S.dim, size: 20 });
  if (spec.slant) svg += text(cx + rx / 2 + 14, (apexY + baseY) / 2, spec.slant, { color: S.dim, size: 20, anchor: "start" });

  svg += svgClose;
  return svg;
};

// 39. PYRAMID — square-based pyramid in 3D perspective.
GENERATORS["pyramid"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const cx = w / 2;
  const baseW = 280;          // visual width of square base in perspective
  const baseDepth = 80;       // perspective depth
  const apexH = 240;          // visual apex height above base centre
  const baseY = h - PAD - 40;
  const apexY = baseY - apexH;

  // Square base corners in perspective: front-left, front-right, back-right, back-left
  const fl = [cx - baseW / 2, baseY];
  const fr = [cx + baseW / 2, baseY];
  const br_ = [cx + baseW / 2 + baseDepth * 0.7, baseY - baseDepth * 0.5];
  const bl = [cx - baseW / 2 + baseDepth * 0.7, baseY - baseDepth * 0.5];
  const apex = [cx + baseDepth * 0.35, apexY];
  const baseCenter = [(fl[0] + br_[0]) / 2, (fl[1] + br_[1]) / 2];

  let svg = svgOpen(w, h);

  // Hidden edges (dashed): back-left to back-right (back edge), back-left to apex, back-left to fl
  svg += line(bl[0], bl[1], br_[0], br_[1], { dash: "5,4", color: "#888", width: 1.2 });
  svg += line(bl[0], bl[1], fl[0], fl[1], { dash: "5,4", color: "#888", width: 1.2 });
  svg += line(bl[0], bl[1], apex[0], apex[1], { dash: "5,4", color: "#888", width: 1.2 });

  // Visible base edges
  svg += line(fl[0], fl[1], fr[0], fr[1]);
  svg += line(fr[0], fr[1], br_[0], br_[1]);

  // Visible apex edges
  svg += line(fl[0], fl[1], apex[0], apex[1]);
  svg += line(fr[0], fr[1], apex[0], apex[1]);
  svg += line(br_[0], br_[1], apex[0], apex[1]);

  // Dashed altitude (centre of base to apex)
  svg += line(baseCenter[0], baseCenter[1], apex[0], apex[1], { color: S.dim, width: 1.2, dash: "4,3" });

  // Labels — placed close to the features they describe, halo masking any
  // dashed reference lines they cross:
  //   • base below the front-bottom edge
  //   • height inside the pyramid, just left of the dashed altitude
  //   • slant just outside the back-right slant at its midpoint
  if (spec.base) svg += text((fl[0] + fr[0]) / 2, fr[1] + LBL, spec.base, { color: S.dim, size: 20 });
  if (spec.height) svg += text(baseCenter[0] - 10, (baseCenter[1] + apex[1]) / 2, spec.height, { color: S.dim, size: 20, anchor: "end" });
  if (spec.slant) svg += text((apex[0] + br_[0]) / 2 + 14, (apex[1] + br_[1]) / 2, spec.slant, { color: S.dim, size: 20, anchor: "start" });

  svg += svgClose;
  return svg;
};

// 40. SPHERE — circle silhouette with an equator ellipse (back half dashed).
GENERATORS["sphere"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const cx = w / 2, cy = h / 2;
  const r = Math.min(w, h) / 2 - PAD - 30;
  const ery = r * 0.28;

  let svg = svgOpen(w, h);
  svg += circle(cx, cy, r);
  // Back half of equator (dashed)
  svg += `<path d="M ${cx - r} ${cy} A ${r} ${ery} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="#888" stroke-width="1.2" stroke-dasharray="5,4"/>`;
  // Front half of equator (solid)
  svg += `<path d="M ${cx - r} ${cy} A ${r} ${ery} 0 0 0 ${cx + r} ${cy}" fill="none" stroke="${S.line}" stroke-width="1.6"/>`;

  // Radius marker — centre to upper-right surface, with a small leader
  // continuing past the outline to a label that sits clear of the sphere.
  const ang = -Math.PI / 4; // 45° above horizontal
  const ex = cx + r * Math.cos(ang), ey = cy + r * Math.sin(ang);
  svg += line(cx, cy, ex, ey, { color: S.dim, width: 1.4, dash: "4,3" });
  svg += `<circle cx="${cx}" cy="${cy}" r="3" fill="${S.dim}"/>`;
  if (spec.radius) {
    // Bend the leader horizontally from the surface point so it doesn't sit
    // collinear with the dashed radius line — clearly delineates the radius
    // measurement from its label callout.
    const lx_ = ex + 28, ly_ = ey;
    svg += line(ex, ey, lx_, ly_, { color: S.dim, width: 1 });
    svg += text(lx_ + 6, ly_, spec.radius, { color: S.dim, size: 20, anchor: "start" });
  }

  svg += svgClose;
  return svg;
};

// ─── TIER 2 STATISTICS — TWO-WAY TABLE ──────────────────────────────────────

// 41. TWO-WAY TABLE — frequency table with row and column headers, optional
// totals row and column. Spec fields: colHeader, rowHeader, cols, rows, data
// (2D array, rows × cols), totals (bool).
GENERATORS["two-way-table"] = (spec) => {
  const w = spec._cw || W, h = spec._ch || H;
  const cols = spec.cols || [];
  const rows = spec.rows || [];
  const data = spec.data || [];
  const showTotals = spec.totals === true;

  const nDataCols = cols.length;
  const nDataRows = rows.length;
  const nCols = nDataCols + (showTotals ? 1 : 0); // data cols + optional Total col
  const nRows = nDataRows + (showTotals ? 1 : 0); // data rows + optional Total row

  // Reserve 30px above the table for the colHeader label
  const colHeaderH = spec.colHeader ? 30 : 8;
  const rowLabelW = 120;    // width of the row-label column
  const headerRowH = 44;    // height of the column-header row
  const availW = w - PAD * 2 - rowLabelW;
  const availH = h - PAD * 2 - colHeaderH - headerRowH;
  const cellW = availW / nCols;
  const dataRowH = Math.min(44, Math.max(28, availH / nRows));

  const tableLeft = PAD + rowLabelW;
  const tableTop = PAD + colHeaderH + headerRowH;

  // Pre-compute totals
  const rowTotals = data.map(r => (r || []).reduce((s, v) => s + (Number(v) || 0), 0));
  const colTotals = cols.map((_, ci) => data.reduce((s, r) => s + (Number((r || [])[ci]) || 0), 0));
  const grandTotal = rowTotals.reduce((s, v) => s + v, 0);

  let svg = svgOpen(w, h);

  // colHeader label — centered above the data columns
  if (spec.colHeader) {
    const labelCx = tableLeft + availW / 2;
    svg += text(labelCx, PAD + colHeaderH / 2, spec.colHeader, { color: S.label, size: 16, italic: true });
  }

  // ── Column header row ────────────────────────────────────────────────────
  // Top-left corner cell (shows rowHeader)
  svg += rect(PAD, PAD + colHeaderH, rowLabelW, headerRowH, { width: 1.8 });
  if (spec.rowHeader) {
    svg += text(PAD + rowLabelW - 8, PAD + colHeaderH + headerRowH - 10, spec.rowHeader, {
      color: S.label, size: 13, italic: true, anchor: "end",
    });
  }
  // Column header cells
  cols.forEach((label, ci) => {
    const x = tableLeft + ci * cellW;
    const y = PAD + colHeaderH;
    svg += rect(x, y, cellW, headerRowH, { width: 1.8 });
    svg += text(x + cellW / 2, y + headerRowH / 2, String(label), { color: S.label, size: 16, bold: true });
  });
  if (showTotals) {
    const x = tableLeft + nDataCols * cellW;
    const y = PAD + colHeaderH;
    svg += rect(x, y, cellW, headerRowH, { width: 1.8 });
    svg += text(x + cellW / 2, y + headerRowH / 2, "Total", { color: S.label, size: 16, bold: true });
  }

  // ── Data rows ────────────────────────────────────────────────────────────
  rows.forEach((rowLabel, ri) => {
    const y = tableTop + ri * dataRowH;
    // Row label cell
    svg += rect(PAD, y, rowLabelW, dataRowH, { width: 1.8 });
    svg += text(PAD + rowLabelW - 10, y + dataRowH / 2, String(rowLabel), {
      color: S.label, size: 16, bold: true, anchor: "end",
    });
    // Data cells
    cols.forEach((_, ci) => {
      const x = tableLeft + ci * cellW;
      svg += rect(x, y, cellW, dataRowH, { width: 1.5 });
      const val = ((data[ri] || [])[ci] !== undefined) ? String(data[ri][ci]) : "";
      svg += text(x + cellW / 2, y + dataRowH / 2, val, { color: S.label, size: 17 });
    });
    // Row total cell
    if (showTotals) {
      const x = tableLeft + nDataCols * cellW;
      svg += rect(x, y, cellW, dataRowH, { width: 1.8 });
      svg += text(x + cellW / 2, y + dataRowH / 2, String(rowTotals[ri]), { color: S.dim, size: 17, bold: true });
    }
  });

  // ── Totals row ───────────────────────────────────────────────────────────
  if (showTotals) {
    const y = tableTop + nDataRows * dataRowH;
    // "Total" row label
    svg += rect(PAD, y, rowLabelW, dataRowH, { width: 1.8 });
    svg += text(PAD + rowLabelW - 10, y + dataRowH / 2, "Total", {
      color: S.label, size: 16, bold: true, anchor: "end",
    });
    // Column totals
    cols.forEach((_, ci) => {
      const x = tableLeft + ci * cellW;
      svg += rect(x, y, cellW, dataRowH, { width: 1.8 });
      svg += text(x + cellW / 2, y + dataRowH / 2, String(colTotals[ci]), { color: S.dim, size: 17, bold: true });
    });
    // Grand total
    const x = tableLeft + nDataCols * cellW;
    svg += rect(x, y, cellW, dataRowH, { width: 2.2 });
    svg += text(x + cellW / 2, y + dataRowH / 2, String(grandTotal), { color: S.dim, size: 17, bold: true });
  }

  svg += svgClose;
  return svg;
};

// ─── MAIN EXPORT ────────────────────────────────────────────────────────────

function safeCanvasSpec(spec) {
  const safeSpec = { ...spec };
  safeSpec._cw = spec.canvasWidth || (typeof spec.width === "number" ? spec.width : W);
  safeSpec._ch = spec.canvasHeight || (typeof spec.height === "number" ? spec.height : H);
  return safeSpec;
}

function renderDiagramSvgForTest(spec) {
  const type = String(spec?.type || "");
  const definition = getDiagramDefinition(type);
  if (!definition || definition.status === DIAGRAM_STATUS.DISABLED) return null;
  const generator = GENERATORS[type];
  if (!generator) return null;
  return generator(safeCanvasSpec(spec));
}

/**
 * Generate a maths diagram as a trimmed PNG.
 *
 * @param {Object} spec - Diagram spec with `type` and type-specific properties.
 * @returns {Promise<{buffer: Buffer, width: number, height: number} | null>}
 *   The PNG buffer and its actual pixel dimensions after trimming, or null if
 *   the type is unknown.
 */
async function generateDiagram(spec) {
  const type = String(spec?.type || "");
  const definition = getDiagramDefinition(type);
  if (!definition) {
    console.warn(`Unknown diagram type: ${type}, skipping`);
    return null;
  }
  if (definition.status === DIAGRAM_STATUS.DISABLED) {
    console.warn(`Disabled diagram type: ${type}, skipping`);
    return null;
  }

  const generator = GENERATORS[type];
  if (!generator) {
    console.warn(`Diagram type has no PNG renderer: ${type}, skipping`);
    return null;
  }

  // Ensure canvas dimensions are numeric — label strings like "45 m" must not
  // leak into the SVG width/height attributes.
  const safeSpec = safeCanvasSpec(spec);

  const svgStr = generator(safeSpec);
  // Render at 2× density for sharper lines after the image is scaled down in docx
  const rawPng = await sharp(Buffer.from(svgStr), { density: 144 }).png().toBuffer();

  // Trim the white background down to just the drawn content, then extend by a
  // consistent small margin. Result: an image that is mostly the diagram.
  let finalBuffer;
  try {
    finalBuffer = await sharp(rawPng)
      .trim({ background: "#FFFFFF", threshold: 10 })
      .extend({ top: 16, bottom: 16, left: 16, right: 16, background: "#FFFFFF" })
      .png()
      .toBuffer();
  } catch (e) {
    // If trim fails (rare — e.g. a uniform image), fall back to the raw render
    finalBuffer = rawPng;
  }

  const meta = await sharp(finalBuffer).metadata();
  return {
    buffer: finalBuffer,
    width: meta.width,
    height: meta.height,
  };
}

/**
 * @returns {string[]} All supported diagram `type` values.
 */
function supportedTypes() {
  return diagramEntries().map((entry) => entry.type);
}

module.exports = {
  DiagramLayoutError,
  generateDiagram,
  renderDiagramSvgForTest,
  supportedTypes,
};
