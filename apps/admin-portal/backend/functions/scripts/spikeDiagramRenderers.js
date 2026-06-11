"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");

const {
  Document,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} = require("docx");
const sharp = require("sharp");

const { generateDiagram } = require("../src/resources/diagramGenerator");

const DEFAULT_OUTPUT_DIR = path.join("/tmp", "tenacity-resource-diagram-renderer-spikes");
const TARGET_DOCX_WIDTH = 280;
const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 460;

const functionPlotSpec = {
  type: "function-plot",
  minX: -5,
  maxX: 5,
  minY: -5,
  maxY: 5,
  functions: [
    { type: "linear", m: 1, b: 2, label: "y = x + 2" },
    { type: "quadratic", a: 1, b: 0, c: -4, label: "y = x^2 - 4" },
  ],
  points: [{ x: 2, y: 0, label: "(2, 0)" }],
};

const scenarios = [
  {
    id: "angle-on-line",
    title: "Angle On Line",
    customSpec: {
      type: "angles",
      subtype: "on-line",
      angles: [50, 70, 60],
      labels: ["50 degrees", "x", "60 degrees"],
    },
    asySource: String.raw`
size(8cm);
defaultpen(fontsize(10pt));
pair O=(0,0);
draw((-3,0)--(3,0), linewidth(1));
draw(O--2.5*dir(50), linewidth(1));
draw(O--2.5*dir(120), linewidth(1));
draw(arc(O,0.8,0,50), red+linewidth(0.8));
draw(arc(O,1.0,50,120), red+linewidth(0.8));
draw(arc(O,0.8,120,180), red+linewidth(0.8));
label("50 degrees", 1.25*dir(25), red);
label("x", 1.45*dir(85), red);
label("60 degrees", 1.25*dir(150), red);
`,
  },
  {
    id: "right-triangle-measurement",
    title: "Right Triangle Measurement",
    customSvg: rightTriangleMeasurementSvg,
    asySource: String.raw`
size(8cm);
defaultpen(fontsize(10pt));
pair A=(0,0), B=(4,0), C=(4,3);
draw(A--B--C--cycle, linewidth(1));
draw((3.72,0)--(3.72,0.28)--(4,0.28), linewidth(0.8));
label("8 cm", (2,-0.35));
label("6 cm", (4.45,1.5));
label("x", (1.95,1.75));
`,
  },
  {
    id: "function-plot",
    title: "Function Plot",
    customSpec: functionPlotSpec,
    asySource: String.raw`
import graph;
size(8cm);
defaultpen(fontsize(10pt));
real f(real x) { return x + 2; }
real g(real x) { return x*x - 4; }
xaxis("$x$", -5, 5, Ticks(Step=1));
yaxis("$y$", -5, 5, Ticks(Step=1));
draw(graph(f, -5, 3), blue+linewidth(1));
draw(graph(g, -3, 3), red+linewidth(1));
dot((2,0));
label("(2, 0)", (2,0), SE);
label("$y=x+2$", (3,5), blue);
label("$y=x^2-4$", (-2.8,3.8), red);
`,
  },
];

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgText(x, y, value, opts = {}) {
  const anchor = opts.anchor || "middle";
  const fill = opts.fill || "#222222";
  const size = opts.size || 22;
  const style = opts.italic ? "italic" : "normal";
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-style="${style}" text-anchor="${anchor}" dominant-baseline="middle">${xmlEscape(value)}</text>`;
}

function rightTriangleMeasurementSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">
  <rect width="100%" height="100%" fill="#FFFFFF"/>
  <path d="M 140 350 L 500 350 L 500 110 Z" fill="none" stroke="#222222" stroke-width="3" stroke-linejoin="round"/>
  <path d="M 472 350 L 472 322 L 500 322" fill="none" stroke="#222222" stroke-width="2"/>
  <line x1="140" y1="382" x2="500" y2="382" stroke="#4D4D4D" stroke-width="1.5"/>
  <line x1="140" y1="374" x2="140" y2="390" stroke="#4D4D4D" stroke-width="1.5"/>
  <line x1="500" y1="374" x2="500" y2="390" stroke="#4D4D4D" stroke-width="1.5"/>
  <line x1="532" y1="110" x2="532" y2="350" stroke="#4D4D4D" stroke-width="1.5"/>
  <line x1="524" y1="110" x2="540" y2="110" stroke="#4D4D4D" stroke-width="1.5"/>
  <line x1="524" y1="350" x2="540" y2="350" stroke="#4D4D4D" stroke-width="1.5"/>
  ${svgText(320, 410, "8 cm", { fill: "#4D4D4D", size: 24 })}
  ${svgText(558, 230, "6 cm", { fill: "#4D4D4D", size: 24, anchor: "start" })}
  ${svgText(325, 245, "x", { fill: "#C0392B", size: 28, italic: true })}
</svg>`;
}

async function rasterizeSvg(svg) {
  const rawPng = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
  let finalBuffer;
  try {
    finalBuffer = await sharp(rawPng)
      .trim({ background: "#FFFFFF", threshold: 10 })
      .extend({ top: 16, bottom: 16, left: 16, right: 16, background: "#FFFFFF" })
      .png()
      .toBuffer();
  } catch (err) {
    finalBuffer = rawPng;
  }
  const meta = await sharp(finalBuffer).metadata();
  return { buffer: finalBuffer, width: meta.width, height: meta.height };
}

async function renderCustom(scenario) {
  if (scenario.customSpec) return generateDiagram(scenario.customSpec);
  if (scenario.customSvg) return rasterizeSvg(scenario.customSvg());
  return null;
}

function zipEntryNames(buffer) {
  const eocdSig = 0x06054b50;
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === eocdSig) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("ZIP end of central directory not found");

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  const names = [];
  let cursor = centralDirOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory entry");
    }
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    names.push(buffer.subarray(cursor + 46, cursor + 46 + fileNameLength).toString("utf8"));
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  return names;
}

async function writeDocx({ scenario, renderer, rendered, outputDir }) {
  const scale = Math.min(1, TARGET_DOCX_WIDTH / rendered.width);
  const width = Math.round(rendered.width * scale);
  const height = Math.round(rendered.height * scale);
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            spacing: { after: 160 },
            children: [
              new TextRun({
                text: `${scenario.title} - ${renderer}`,
                bold: true,
                font: "Arial",
                size: 24,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new ImageRun({
                data: rendered.buffer,
                type: "png",
                transformation: { width, height },
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const filePath = path.join(outputDir, renderer, `${scenario.id}.docx`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  const mediaEntries = zipEntryNames(buffer).filter((name) => /^word\/media\/.+\.png$/.test(name));
  return {
    filePath,
    bytes: buffer.length,
    embeddedWidth: width,
    embeddedHeight: height,
    mediaEntries: mediaEntries.length,
  };
}

async function writeRenderedResult({ scenario, renderer, rendered, outputDir, renderMs }) {
  if (!rendered?.buffer) throw new Error(`${renderer}/${scenario.id} did not return a PNG buffer`);
  const pngPath = path.join(outputDir, renderer, `${scenario.id}.png`);
  fs.mkdirSync(path.dirname(pngPath), { recursive: true });
  fs.writeFileSync(pngPath, rendered.buffer);
  const docx = await writeDocx({ scenario, renderer, rendered, outputDir });
  return {
    scenario: scenario.id,
    renderer,
    status: "rendered",
    pngPath,
    pngBytes: rendered.buffer.length,
    width: rendered.width,
    height: rendered.height,
    renderMs: Math.round(renderMs * 10) / 10,
    docx,
  };
}

async function renderWithTiming(callback) {
  const started = performance.now();
  const rendered = await callback();
  return { rendered, renderMs: performance.now() - started };
}

function findExecutable(name) {
  const result = spawnSync("which", [name], { encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

async function renderAsymptote(scenario, outputDir) {
  const asy = findExecutable("asy");
  if (!asy) return { scenario: scenario.id, renderer: "asymptote", status: "skipped", reason: "asy executable not found" };

  const sourcePath = path.join(outputDir, "asymptote-source", `${scenario.id}.asy`);
  const svgPath = path.join(outputDir, "asymptote-source", `${scenario.id}.svg`);
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, scenario.asySource.trimStart());

  const result = spawnSync(asy, ["-f", "svg", "-o", svgPath, sourcePath], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 || !fs.existsSync(svgPath)) {
    return {
      scenario: scenario.id,
      renderer: "asymptote",
      status: "failed",
      reason: (result.stderr || result.stdout || "Asymptote did not write SVG").trim(),
    };
  }

  const { rendered, renderMs } = await renderWithTiming(() => rasterizeSvg(fs.readFileSync(svgPath, "utf8")));
  return writeRenderedResult({ scenario, renderer: "asymptote", rendered, outputDir, renderMs });
}

function resolvePackageRoot(packageName) {
  let resolved;
  try {
    resolved = require.resolve(packageName);
  } catch (err) {
    return null;
  }

  let dir = path.dirname(resolved);
  while (dir !== path.dirname(dir)) {
    const manifest = path.join(dir, "package.json");
    if (fs.existsSync(manifest)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
        if (pkg.name === packageName) return dir;
      } catch (err) {
        return null;
      }
    }
    dir = path.dirname(dir);
  }
  return null;
}

function setupJsxGraphDom() {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="box"></div></body></html>`,
    { pretendToBeVisual: true, url: "http://localhost/" }
  );
  const win = dom.window;
  win.matchMedia = win.matchMedia || (() => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  }));
  win.IntersectionObserver = win.IntersectionObserver || class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  ["window", "document", "XMLSerializer", "Node", "HTMLElement", "SVGElement", "DOMParser", "IntersectionObserver"].forEach((key) => {
    global[key] = win[key];
  });
  Object.defineProperty(global, "navigator", { value: win.navigator, configurable: true });
  Object.defineProperty(global.navigator, "appVersion", {
    value: global.navigator.appVersion || "Node.js",
    configurable: true,
  });
  Object.defineProperty(global.navigator, "userAgent", {
    value: global.navigator.userAgent || "Node.js",
    configurable: true,
  });
  global.self = win;

  const box = win.document.getElementById("box");
  box.style.width = `${CANVAS_WIDTH}px`;
  box.style.height = `${CANVAS_HEIGHT}px`;
  box.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    top: 0,
    left: 0,
    right: CANVAS_WIDTH,
    bottom: CANVAS_HEIGHT,
  });
  Object.defineProperties(box, {
    clientWidth: { value: CANVAS_WIDTH },
    clientHeight: { value: CANVAS_HEIGHT },
    offsetWidth: { value: CANVAS_WIDTH },
    offsetHeight: { value: CANVAS_HEIGHT },
  });

  return dom;
}

function loadJsxGraph() {
  const packageRoot = resolvePackageRoot("jsxgraph");
  if (!packageRoot) return null;
  const corePath = path.join(packageRoot, "distrib", "jsxgraphcore.js");
  if (!fs.existsSync(corePath)) {
    return {
      error: "jsxgraph package found, but distrib/jsxgraphcore.js is not available",
    };
  }
  return { corePath };
}

function makeJsxGraphBoard(JXG, boundingbox) {
  JXG.Options.renderer = "svg";
  return JXG.JSXGraph.initBoard("box", {
    boundingbox,
    axis: false,
    renderer: "svg",
    showCopyright: false,
    showNavigation: false,
  });
}

function jsxGraphSvgForScenario(loaded, scenario) {
  const dom = setupJsxGraphDom();
  const JXG = require(loaded.corePath);
  let board;
  if (scenario.id === "function-plot") {
    board = makeJsxGraphBoard(JXG, [-5.5, 5.5, 5.5, -5.5]);
    board.create("axis", [[0, 0], [1, 0]], { strokeColor: "#333333" });
    board.create("axis", [[0, 0], [0, 1]], { strokeColor: "#333333" });
    board.create("functiongraph", [(x) => x + 2, -5, 3], { strokeColor: "#1F77B4", strokeWidth: 2 });
    board.create("functiongraph", [(x) => x * x - 4, -3, 3], { strokeColor: "#C0392B", strokeWidth: 2 });
    board.create("point", [2, 0], { name: "(2, 0)", fixed: true, size: 3, label: { display: "internal" } });
    board.create("text", [3.1, 5, "y = x + 2"], { fixed: true, fontSize: 16, strokeColor: "#1F77B4", display: "internal" });
    board.create("text", [-2.8, 4.2, "y = x^2 - 4"], { fixed: true, fontSize: 16, strokeColor: "#C0392B", display: "internal" });
  } else if (scenario.id === "right-triangle-measurement") {
    board = makeJsxGraphBoard(JXG, [-1, 4, 6, -1]);
    const a = board.create("point", [0, 0], { name: "", fixed: true, visible: false });
    const b = board.create("point", [5, 0], { name: "", fixed: true, visible: false });
    const c = board.create("point", [5, 3], { name: "", fixed: true, visible: false });
    board.create("polygon", [a, b, c], { fillOpacity: 0, borders: { strokeWidth: 2, strokeColor: "#222222" } });
    board.create("text", [2.5, -0.35, "8 cm"], { fixed: true, fontSize: 18, display: "internal" });
    board.create("text", [5.25, 1.5, "6 cm"], { fixed: true, fontSize: 18, display: "internal" });
    board.create("text", [2.5, 1.55, "x"], { fixed: true, fontSize: 22, strokeColor: "#C0392B", display: "internal" });
  } else {
    board = makeJsxGraphBoard(JXG, [-3.5, 3.5, 3.5, -2]);
    const o = board.create("point", [0, 0], { name: "", fixed: true, visible: false });
    const a = board.create("point", [3, 0], { name: "", fixed: true, visible: false });
    const b = board.create("point", [2 * Math.cos(55 * Math.PI / 180), 2 * Math.sin(55 * Math.PI / 180)], {
      name: "",
      fixed: true,
      visible: false,
    });
    board.create("segment", [o, a], { strokeColor: "#222222", strokeWidth: 2 });
    board.create("segment", [o, b], { strokeColor: "#222222", strokeWidth: 2 });
    board.create("angle", [a, o, b], { radius: 0.7, name: "", strokeColor: "#C0392B", fillOpacity: 0, strokeWidth: 2 });
    board.create("text", [1.05, 0.52, "55 degrees"], { fixed: true, strokeColor: "#C0392B", fontSize: 18, display: "internal" });
  }

  board.update();
  const svg = dom.window.document.querySelector("#box svg");
  if (!svg) throw new Error("JSXGraph did not produce an SVG root");
  return svg.outerHTML;
}

async function renderJsxGraph(scenario, outputDir) {
  let loaded;
  try {
    loaded = loadJsxGraph();
  } catch (err) {
    return { scenario: scenario.id, renderer: "jsxgraph", status: "failed", reason: err.message };
  }
  if (!loaded) {
    return { scenario: scenario.id, renderer: "jsxgraph", status: "skipped", reason: "jsxgraph package not installed" };
  }
  if (loaded.error) {
    return { scenario: scenario.id, renderer: "jsxgraph", status: "failed", reason: loaded.error };
  }

  try {
    const { rendered, renderMs } = await renderWithTiming(async () => {
      const svg = jsxGraphSvgForScenario(loaded, scenario);
      return rasterizeSvg(svg);
    });
    return writeRenderedResult({ scenario, renderer: "jsxgraph", rendered, outputDir, renderMs });
  } catch (err) {
    return { scenario: scenario.id, renderer: "jsxgraph", status: "failed", reason: err.message };
  }
}

async function runSpike(outputDir) {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const results = [];
  for (const scenario of scenarios) {
    const custom = await renderWithTiming(() => renderCustom(scenario));
    results.push(await writeRenderedResult({
      scenario,
      renderer: "custom-svg",
      rendered: custom.rendered,
      outputDir,
      renderMs: custom.renderMs,
    }));
    results.push(await renderJsxGraph(scenario, outputDir));
    results.push(await renderAsymptote(scenario, outputDir));
  }

  const summaryPath = path.join(outputDir, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify({ outputDir, results }, null, 2));
  return { outputDir, summaryPath, results };
}

async function main() {
  const outputDir = process.argv[2] || process.env.DIAGRAM_RENDERER_SPIKE_OUTPUT_DIR || DEFAULT_OUTPUT_DIR;
  const { summaryPath, results } = await runSpike(outputDir);
  for (const item of results) {
    if (item.status === "rendered") {
      console.log(
        `${item.renderer}/${item.scenario} -> ${item.pngPath} (${item.width}x${item.height}, ${item.renderMs}ms), docx media=${item.docx.mediaEntries}`
      );
    } else {
      console.log(`${item.renderer}/${item.scenario} -> ${item.status}: ${item.reason}`);
    }
  }
  console.log(`Summary: ${summaryPath}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err?.stack || err);
    process.exit(1);
  });
}

module.exports = {
  runSpike,
};
