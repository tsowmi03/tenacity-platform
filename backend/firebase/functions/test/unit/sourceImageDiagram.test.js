"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const JSZip = require("jszip");
const sharp = require("sharp");

const { buildResourceDocx } = require("../../src/resources/builder");
const { validateDiagram } = require("../../src/resources/builder/validation");
const { getDiagramDefinition } = require("../../src/resources/diagramRegistry");

async function png(width, height) {
  return sharp({ create: { width, height, channels: 3, background: "#fff" } }).png().toBuffer();
}

function worksheet(diagram) {
  return {
    title: "Volume",
    subject: "Maths",
    year: 9,
    topic: "Volume of prisms",
    totalMarks: 2,
    questions: [{ number: 1, stem: "Find the volume of the prism.", marks: 2, diagram }],
    answers: [{ questionNumber: 1, answer: "$120\\text{ cm}^3$", workingOut: "$V = Ah = 12 \\times 10 = 120$" }],
  };
}

describe("source-image diagrams", () => {
  it("is never offered to the model", () => {
    assert.equal(getDiagramDefinition("source-image"), null);
  });

  it("requires the PNG and its size", async () => {
    const image = await png(4, 4);
    assert.throws(() => validateDiagram({ type: "source-image", width: 10, height: 10 }, "q.diagram"), /must be the diagram's PNG/);
    assert.throws(() => validateDiagram({ type: "source-image", image, width: 0, height: 10 }, "q.diagram"), /width/);
    validateDiagram({ type: "source-image", image, width: 4, height: 4, storagePath: "questionBank/diagrams/x.png" }, "q.diagram");
  });

  it("puts the crop into the worksheet as an image", async () => {
    const diagram = { type: "source-image", image: await png(900, 600), width: 900, height: 600 };
    const buffer = await buildResourceDocx("worksheet", worksheet(diagram), { answerMode: "worked" });
    const zip = await JSZip.loadAsync(buffer);
    const media = Object.keys(zip.files).filter((name) => name.startsWith("word/media/"));
    assert.equal(media.length >= 1, true);
    const xml = await zip.file("word/document.xml").async("string");
    // RES-81: the crop sits beside the question, fitted to the 7 cm diagram
    // column (265px, which Word stores as 265 * 9525 EMU).
    assert.match(xml, /cx="2524125"/);
  });
});

// RES-94
{
  const { it } = require("node:test");
  const assert = require("node:assert/strict");
  const { cloneWithSourceImages, withoutSourceImageBytes } = require("../../src/resources/sourceImages");
  it("keeps a sourced stimulus photo's bytes through the build copy, and out of stored JSON", () => {
    const photo = Buffer.alloc(2_000_000, 7);
    const resource = { stimulus: [{ kind: "image", label: "Image 1", image: { buffer: photo, type: "jpg", width: 1280, height: 806 } }],
      questions: [{ diagram: { type: "source-image", storagePath: "questionBank/x.png", image: Buffer.from([1]) } }] };
    const copy = cloneWithSourceImages(resource);
    assert.ok(Buffer.isBuffer(copy.stimulus[0].image.buffer));
    assert.ok(Buffer.isBuffer(copy.questions[0].diagram.image));
    copy.stimulus[0].label = "changed";
    assert.equal(resource.stimulus[0].label, "Image 1", "a real copy");
    const stored = JSON.stringify(resource, withoutSourceImageBytes);
    assert.ok(stored.length < 1000, `${stored.length} bytes`);
    assert.deepEqual(JSON.parse(stored).stimulus[0].image, { type: "jpg", width: 1280, height: 806 });
  });
}
