"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSystemPrompt,
} = require("../../src/resources/promptBuilder");
const {
  DIAGRAM_STATUS,
  RENDERER_BACKEND,
  diagramEntries,
  disabledDiagramTypes,
  fixtureDiagramEntries,
  promptVisibleDiagramEntries,
} = require("../../src/resources/diagramRegistry");
const {
  validateDiagram,
} = require("../../src/resources/builder/validation");
const {
  generateDiagram,
  renderDiagramSvgForTest,
} = require("../../src/resources/diagramGenerator");

describe("diagram registry", () => {
  it("keeps prompt-visible diagrams in the registry", () => {
    const promptTypes = promptVisibleDiagramEntries().map((entry) => entry.type).sort();

    assert.deepEqual(promptTypes, [
      "L-shape",
      "T-shape",
      "angles",
      "array",
      "bar-graph",
      "box-plot",
      "circle",
      "circle-sector",
      "clock",
      "coordinate-plane",
      "cylinder",
      "dot-plot",
      "fraction-bar",
      "function-plot",
      "histogram",
      "number-line",
      "parallel-lines",
      "pictograph",
      "pie-chart",
      "prism-rect",
      "prism-tri",
      "rect-semicircle",
      "rect-triangle",
      "rectangle",
      "right-triangle",
      "scatter-plot",
      "spinner",
      "stem-and-leaf",
      "tree-diagram",
      "triangle",
      "two-way-table",
      "venn-diagram",
    ]);
  });

  it("does not expose disabled diagrams in the prompt", () => {
    const prompt = buildSystemPrompt("worksheet", { year: 8, subject: "maths" });

    for (const entry of promptVisibleDiagramEntries()) {
      assert.match(prompt, new RegExp(`- ${entry.type}:`));
    }
    for (const type of disabledDiagramTypes()) {
      assert.doesNotMatch(prompt, new RegExp(`- ${type}:`));
    }
  });

  it("classifies every diagram entry with status and renderer backend metadata", () => {
    const statuses = new Set(Object.values(DIAGRAM_STATUS));
    const renderers = new Set(Object.values(RENDERER_BACKEND));

    for (const entry of diagramEntries({ includeDisabled: true })) {
      assert.ok(statuses.has(entry.status), `${entry.type} has unknown status ${entry.status}`);
      assert.ok(
        renderers.has(entry.rendererBackend),
        `${entry.type} has unknown renderer backend ${entry.rendererBackend}`
      );
    }
  });

  it("has local render fixtures for every prompt-visible PNG diagram", () => {
    const fixtureTypes = new Set(
      fixtureDiagramEntries({ promptVisibleOnly: true, imageBackedOnly: true })
        .map((entry) => entry.type)
    );

    for (const entry of promptVisibleDiagramEntries()) {
      if (entry.rendererBackend === RENDERER_BACKEND.NATIVE_DOCX) continue;
      assert.ok(fixtureTypes.has(entry.type), `${entry.type} is missing a PNG fixture`);
    }
  });

  it("rejects unknown and disabled diagram types at validation", () => {
    assert.throws(
      () => validateDiagram({ type: "unsupported-diagram" }, "question.diagram"),
      /unsupported-diagram is not supported/
    );
    assert.throws(
      () => validateDiagram({ type: "parallelogram" }, "question.diagram"),
      /parallelogram is temporarily disabled/
    );
  });

  it("validates every prompt-visible fixture against its diagram schema", () => {
    for (const entry of promptVisibleDiagramEntries()) {
      assert.doesNotThrow(
        () => validateDiagram(entry.fixture, `${entry.type}.diagram`),
        `${entry.type} fixture should validate`
      );
    }
  });

  it("rejects unknown fields and layout-control fields", () => {
    assert.throws(
      () => validateDiagram({
        type: "number-line",
        min: 0,
        max: 10,
        step: 1,
        marks: [],
        arbitrary: "ignored by renderer",
      }, "question.diagram"),
      /question\.diagram\.arbitrary is not supported/
    );

    assert.throws(
      () => validateDiagram({
        type: "number-line",
        min: 0,
        max: 10,
        step: 1,
        marks: [],
        canvasWidth: 2000,
      }, "question.diagram"),
      /question\.diagram\.canvasWidth is not allowed/
    );
  });

  it("rejects malformed nested diagram specs", () => {
    assert.throws(
      () => validateDiagram({
        type: "angles",
        subtype: "on-line",
        angles: [50, 60],
        labels: ["50 degrees", "x"],
      }, "question.diagram"),
      /question\.diagram\.angles must sum to 180/
    );

    assert.throws(
      () => validateDiagram({
        type: "two-way-table",
        cols: ["A", "B"],
        rows: ["Year 9"],
        data: [[1]],
      }, "question.diagram"),
      /question\.diagram\.data\[0\] must have one value per question\.diagram\.cols item/
    );
  });

  it("validates rectangle-family semantics and rejects inconsistent dimensions", () => {
    for (const type of ["rectangle", "L-shape", "T-shape"]) {
      const entry = diagramEntries({ includeDisabled: true })
        .find((diagram) => diagram.type === type);
      assert.doesNotThrow(() => validateDiagram(entry.fixture, `${type}.diagram`));
    }

    assert.throws(
      () => validateDiagram({
        type: "rectangle",
        dimensions: { width: 0, height: 7 },
        unit: "cm",
      }, "question.diagram"),
      /question\.diagram\.dimensions\.width must be at least/
    );
    assert.throws(
      () => validateDiagram({
        type: "L-shape",
        dimensions: {
          totalWidth: 10,
          totalHeight: 8,
          cutoutWidth: 10,
          cutoutHeight: 4,
        },
      }, "question.diagram"),
      /cutoutWidth must be less than/
    );
    assert.throws(
      () => validateDiagram({
        type: "T-shape",
        dimensions: {
          topWidth: 8,
          topHeight: 2,
          stemWidth: 8,
          stemHeight: 6,
        },
      }, "question.diagram"),
      /stemWidth must be less than/
    );
  });

  it("validates stable mixed-shape semantic dimensions", () => {
    const mixedShapes = ["rect-triangle", "rect-semicircle"].map((type) =>
      diagramEntries({ includeDisabled: true }).find((diagram) => diagram.type === type)
    );

    for (const entry of mixedShapes) {
      assert.equal(entry.status, DIAGRAM_STATUS.STABLE);
      assert.equal(entry.promptVisible, true);
      assert.doesNotThrow(() => validateDiagram(entry.fixture, `${entry.type}.diagram`));
    }

    assert.throws(
      () => validateDiagram({
        type: "rect-triangle",
        dimensions: {
          width: 10,
          rectangleHeight: 4,
          triangleHeight: 0,
        },
      }, "question.diagram"),
      /question\.diagram\.dimensions\.triangleHeight must be at least/
    );
    assert.throws(
      () => validateDiagram({
        type: "rect-semicircle",
        dimensions: {
          rectangleWidth: 8,
          diameter: -2,
        },
      }, "question.diagram"),
      /question\.diagram\.dimensions\.diameter must be at least/
    );
    assert.throws(
      () => validateDiagram({
        type: "rect-triangle",
        dimLabels: {
          base: "10 cm",
          rectH: "4 cm",
          triH: "3 cm",
        },
      }, "question.diagram"),
      /question\.diagram\.dimLabels is not supported/
    );
  });

  it("validates stable right-triangle dimensions", () => {
    const entry = diagramEntries({ includeDisabled: true })
      .find((diagram) => diagram.type === "right-triangle");

    assert.equal(entry.status, DIAGRAM_STATUS.STABLE);
    assert.equal(entry.promptVisible, true);
    assert.doesNotThrow(() => validateDiagram(entry.fixture, "right-triangle.diagram"));
    assert.doesNotThrow(() => validateDiagram({
      type: "right-triangle",
      dimensions: { base: 8, height: 6 },
      unit: "cm",
    }, "question.diagram"));
    assert.throws(
      () => validateDiagram({
        type: "right-triangle",
        dimensions: { base: 8, height: 6, hypotenuse: 9 },
        unit: "cm",
      }, "question.diagram"),
      /hypotenuse must satisfy Pythagoras/
    );
    assert.throws(
      () => validateDiagram({
        type: "right-triangle",
        dimensions: { base: 0, height: 6 },
        unit: "cm",
      }, "question.diagram"),
      /dimensions\.base must be at least/
    );
  });

  it("validates stable general-triangle semantic dimensions", () => {
    const entry = diagramEntries({ includeDisabled: true })
      .find((diagram) => diagram.type === "triangle");

    assert.equal(entry.status, DIAGRAM_STATUS.STABLE);
    assert.equal(entry.promptVisible, true);
    assert.doesNotThrow(() => validateDiagram(entry.fixture, "triangle.diagram"));
    assert.doesNotThrow(() => validateDiagram({
      type: "triangle",
      dimensions: { base: 10, height: 6 },
      unit: "cm",
    }, "question.diagram"));
    assert.throws(
      () => validateDiagram({
        type: "triangle",
        dimensions: { base: 8, leftSide: 6 },
      }, "question.diagram"),
      /leftSide and question\.diagram\.dimensions\.rightSide must be supplied together/
    );
    assert.throws(
      () => validateDiagram({
        type: "triangle",
        dimensions: { base: 8, leftSide: 2, rightSide: 10 },
      }, "question.diagram"),
      /must satisfy the triangle inequality/
    );
    assert.throws(
      () => validateDiagram({
        type: "triangle",
        dimensions: { base: 8, leftSide: 6, rightSide: 7, height: 4 },
      }, "question.diagram"),
      /height must match the perpendicular height/
    );
  });

  it("validates stable circle-family semantic dimensions", () => {
    const entries = ["circle", "circle-sector"].map((type) =>
      diagramEntries({ includeDisabled: true })
        .find((diagram) => diagram.type === type)
    );

    for (const entry of entries) {
      assert.equal(entry.status, DIAGRAM_STATUS.STABLE);
      assert.equal(entry.promptVisible, true);
      assert.doesNotThrow(() => validateDiagram(entry.fixture, `${entry.type}.diagram`));
    }
    assert.doesNotThrow(() => validateDiagram({
      type: "circle",
      dimensions: { diameter: 10 },
      unit: "cm",
    }, "question.diagram"));
    assert.throws(
      () => validateDiagram({
        type: "circle",
        dimensions: { radius: 5, diameter: 10 },
      }, "question.diagram"),
      /must supply exactly one of radius or diameter/
    );
    assert.throws(
      () => validateDiagram({
        type: "circle",
        dimensions: {},
      }, "question.diagram"),
      /must supply exactly one of radius or diameter/
    );
    assert.throws(
      () => validateDiagram({
        type: "circle-sector",
        dimensions: { radius: 6, angle: 360 },
      }, "question.diagram"),
      /angle must be less than 360/
    );
    assert.throws(
      () => validateDiagram({
        type: "circle-sector",
        dimensions: { radius: 0, angle: 90 },
      }, "question.diagram"),
      /radius must be at least/
    );
  });

  it("validates stable prism and cylinder semantic dimensions", () => {
    const entries = ["prism-rect", "prism-tri", "cylinder"].map((type) =>
      diagramEntries({ includeDisabled: true })
        .find((diagram) => diagram.type === type)
    );

    for (const entry of entries) {
      assert.equal(entry.status, DIAGRAM_STATUS.STABLE);
      assert.equal(entry.promptVisible, true);
      assert.doesNotThrow(() => validateDiagram(entry.fixture, `${entry.type}.diagram`));
    }
    assert.doesNotThrow(() => validateDiagram({
      type: "cylinder",
      dimensions: { diameter: 10, height: 12 },
      unit: "cm",
    }, "question.diagram"));
    assert.throws(
      () => validateDiagram({
        type: "prism-rect",
        dimensions: { length: 10, width: 5, height: 0 },
      }, "question.diagram"),
      /height must be at least/
    );
    assert.throws(
      () => validateDiagram({
        type: "prism-tri",
        dimensions: { triangleBase: 8, triangleHeight: 5 },
      }, "question.diagram"),
      /length must be a finite number/
    );
    assert.throws(
      () => validateDiagram({
        type: "cylinder",
        dimensions: { radius: 5, diameter: 10, height: 12 },
      }, "question.diagram"),
      /must supply exactly one of radius or diameter/
    );
  });

  it("renders scatter-plot fixtures that use prompt-style point objects", async () => {
    const entry = promptVisibleDiagramEntries()
      .find((diagram) => diagram.type === "scatter-plot");

    validateDiagram(entry.fixture, "scatter.diagram");
    const rendered = await generateDiagram(entry.fixture);

    assert.ok(Buffer.isBuffer(rendered.buffer));
    assert.ok(rendered.width > 0);
    assert.ok(rendered.height > 0);
  });

  it("renders function labels with superscripts and clean arrow endpoints", () => {
    const svg = renderDiagramSvgForTest({
      type: "function-plot",
      minX: -5,
      maxX: 5,
      minY: -5,
      maxY: 5,
      showGrid: false,
      functions: [
        { type: "quadratic", a: 1, b: 0, c: -4, label: "y = x^2 - 4" },
      ],
    });

    assert.match(svg, />y = x² - 4<\/text>/);
    assert.doesNotMatch(svg, /x\^2/);

    const buttCappedAxes = svg.match(/<line\b[^>]*stroke-linecap="butt"\/>/g) || [];
    assert.equal(buttCappedAxes.length, 2);
    assert.match(
      svg,
      /<path d="[^"]+" fill="none" stroke="#1B3F71" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="butt"\/>/
    );
  });

  it("renders every allowed angles subtype", async () => {
    const specs = [
      { type: "angles", subtype: "single", angle: 50, label: "50 degrees" },
      { type: "angles", subtype: "on-line", angles: [50, 70, 60], labels: ["50 degrees", "x", "60 degrees"] },
      { type: "angles", subtype: "at-point", angles: [70, 110, 80, 100], labels: ["70 degrees", "110 degrees", "80 degrees", "100 degrees"] },
      { type: "angles", subtype: "vertically-opposite", angle: 50, labels: ["130 degrees", "50 degrees", "130 degrees", "50 degrees"] },
    ];

    for (const [index, spec] of specs.entries()) {
      validateDiagram(spec, `angles[${index}].diagram`);
      const rendered = await generateDiagram(spec);

      assert.ok(Buffer.isBuffer(rendered.buffer), `${spec.subtype} should render a PNG buffer`);
      assert.ok(rendered.width > 0, `${spec.subtype} should have rendered width`);
      assert.ok(rendered.height > 0, `${spec.subtype} should have rendered height`);
    }
  });
});
