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
} = require("../../src/resources/diagramGenerator");

describe("diagram registry", () => {
  it("keeps prompt-visible diagrams in the registry", () => {
    const promptTypes = promptVisibleDiagramEntries().map((entry) => entry.type).sort();

    assert.deepEqual(promptTypes, [
      "angles",
      "array",
      "bar-graph",
      "box-plot",
      "clock",
      "coordinate-plane",
      "dot-plot",
      "fraction-bar",
      "function-plot",
      "histogram",
      "number-line",
      "parallel-lines",
      "pictograph",
      "pie-chart",
      "scatter-plot",
      "spinner",
      "stem-and-leaf",
      "tree-diagram",
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
      () => validateDiagram({ type: "rectangle" }, "question.diagram"),
      /rectangle is temporarily disabled/
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

  it("renders scatter-plot fixtures that use prompt-style point objects", async () => {
    const entry = promptVisibleDiagramEntries()
      .find((diagram) => diagram.type === "scatter-plot");

    validateDiagram(entry.fixture, "scatter.diagram");
    const rendered = await generateDiagram(entry.fixture);

    assert.ok(Buffer.isBuffer(rendered.buffer));
    assert.ok(rendered.width > 0);
    assert.ok(rendered.height > 0);
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
