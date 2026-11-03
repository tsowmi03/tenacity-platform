"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { DIAGRAM_TYPES, TYPE_IDS, skillIds, skillsFor } = require("../../src/questionBank/taxonomy");
const { buildExtractParams, buildSortParams, extractSchema, readMessage } = require("../../src/questionBank/prompts");
const { majorityYearLevel, parseRequestId, requestId, toQuestionDocs } = require("../../src/questionBank/extraction");
const { batchCostOf, chunkRequests, collectResults, waitForBatch } = require("../../src/questionBank/batches");
const { fetchSourcePdf } = require("../../src/questionBank/sourceFiles");
const { parseArgs, randomSource, shuffled } = require("../../scripts/questionBankExtract");

const IMAGE = Buffer.from("jpeg");

describe("taxonomy", () => {
  it("has the 23 agreed diagram types, each with skills ending in other", () => {
    assert.equal(TYPE_IDS.length, 23);
    for (const type of TYPE_IDS) {
      const skills = skillsFor(type);
      assert.equal(skills.at(-1), "other");
      assert.equal(new Set(skills).size, skills.length, `${type} has a repeated skill`);
      assert.ok(DIAGRAM_TYPES[type].covers);
    }
    assert.ok(skillsFor("right_triangle").includes("find_shorter_side"));
  });

  it("names skills as type/skill", () => {
    assert.ok(skillIds(["right_triangle"]).includes("right_triangle/find_hypotenuse"));
    assert.ok(skillIds(["right_triangle"]).every((id) => id.startsWith("right_triangle/")));
  });
});

describe("prompts", () => {
  it("sorts on Haiku at low effort with a schema of the 23 types", () => {
    const params = buildSortParams({ image: IMAGE });
    assert.equal(params.model, "claude-haiku-5-5");
    assert.deepEqual(params.thinking, { type: "adaptive" });
    assert.equal(params.output_config.effort, "low");
    assert.deepEqual(params.output_config.format.schema.properties.types.items.enum, TYPE_IDS);
    assert.equal(params.messages[0].content[0].source.data, IMAGE.toString("base64"));
  });

  it("limits extraction to the page's diagram types and their skills", () => {
    const schema = extractSchema(["triangle_not_a_type".replace("triangle_not_a_type", "right_triangle"), "parabola"]);
    const unit = schema.properties.units.items.properties;
    assert.deepEqual(unit.figures.items.properties.type.enum, ["right_triangle", "parabola"]);
    assert.ok(unit.skill.enum.includes("parabola/vertex_axis_of_symmetry"));
    assert.ok(!unit.skill.enum.some((id) => id.startsWith("shape_2d/")));
    assert.deepEqual(unit.context.enum, ["abstract", "real_world"]);
    assert.deepEqual(unit.steps.enum, ["single", "multi"]);
  });

  it("puts the page size, previous page and text layer in the extraction prompt", () => {
    const params = buildExtractParams({
      image: IMAGE, sourcePath: "Maths/Y9.pdf", pageNumber: 12, width: 1109, height: 1568,
      targetTypes: ["right_triangle"], textLayer: "Find x", previousPageText: "Example 4 continued",
    });
    const prompt = params.messages[0].content[1].text;
    assert.match(prompt, /page 12 of "Maths\/Y9\.pdf"\. It is 1109x1568 pixels/);
    assert.match(prompt, /<previous_page>\nExample 4 continued/);
    assert.match(prompt, /<text_layer>\nFind x/);
    assert.equal(params.output_config.effort, "high");
  });

  it("reads the answer after any thinking blocks", () => {
    const message = {
      stop_reason: "end_turn",
      content: [{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text: "{\"types\":[\"parabola\"]}" }],
      usage: { input_tokens: 3000, output_tokens: 20 },
    };
    const { parsed, usage } = readMessage(message, 4000);
    assert.deepEqual(parsed, { types: ["parabola"] });
    assert.equal(usage.inputTokens, 3000);
  });

  it("fails loudly on a truncated response", () => {
    const message = { stop_reason: "max_tokens", content: [{ type: "text", text: "{\"units\":[" }], usage: {} };
    assert.throws(() => readMessage(message, 32000), /truncated/);
  });
});

describe("request ids", () => {
  it("round-trips Drive IDs with underscores and dashes, within 64 characters", () => {
    const sourceId = "1--LBKSyqw6eeNpftWdLAx_PrFLB1ofVG";
    const id = requestId("extract", sourceId, 548);
    assert.ok(id.length <= 64);
    assert.match(id, /^[a-zA-Z0-9_-]+$/);
    assert.deepEqual(parseRequestId(id), { stage: "extract", sourceId, pageNumber: 548 });
  });
});

describe("toQuestionDocs", () => {
  const source = { id: "src1", path: "Maths/Y9.pdf", version: "m:t" };
  const unit = (extra) => ({
    kind: "question", label: "Q1a", skill: "right_triangle/find_hypotenuse", description: "Find the hypotenuse",
    context: "abstract", steps: "single", topic: "Pythagoras", yearLevel: "Year 9", stem: "Find x.", text: "",
    box: { x0: 10, y0: 10, x1: 500, y1: 400 },
    figures: [{ type: "right_triangle", box: { x0: 20, y0: 20, x1: 300, y1: 300 }, description: "Triangle" }],
    ...extra,
  });

  it("builds one record per unit with its diagram crops", () => {
    const [doc] = toQuestionDocs({ source, pageNumber: 7, width: 1109, height: 1568, units: [unit()], runId: "r", model: "claude-haiku-5-5" });
    assert.equal(doc.id, "src1_p7_1");
    assert.equal(doc.data.diagramType, "right_triangle");
    assert.equal(doc.data.skill, "find_hypotenuse");
    assert.equal(doc.data.status, "live");
    assert.equal(doc.data.figures[0].storagePath, "questionBank/diagrams/src1_p7_1_1.png");
  });

  it("drops units whose diagrams are all unusable", () => {
    const docs = toQuestionDocs({
      source, pageNumber: 1, width: 1000, height: 1000, runId: "r", model: "m",
      units: [unit({ figures: [] }), unit({ figures: [{ type: "right_triangle", box: { x0: 5, y0: 5, x1: 6, y1: 6 }, description: "speck" }] })],
    });
    assert.deepEqual(docs, []);
  });

  it("clamps boxes to the page and falls back to other when the skill names another type", () => {
    const [doc] = toQuestionDocs({
      source, pageNumber: 1, width: 1000, height: 1000, runId: "r", model: "m",
      units: [unit({ skill: "parabola/vertex_axis_of_symmetry", figures: [{ type: "right_triangle", box: { x0: -5, y0: 900, x1: 400, y1: 1200 }, description: "t" }] })],
    });
    assert.equal(doc.data.diagramType, "right_triangle");
    assert.equal(doc.data.skill, "other");
    assert.deepEqual(doc.data.figures[0].box, { x0: 0, y0: 900, x1: 400, y1: 1000 });
  });
});

describe("majorityYearLevel", () => {
  it("picks the most common level and ignores gaps", () => {
    assert.equal(majorityYearLevel(["Stage 5.2", null, "Stage 5.2", "Year 9", ""]), "Stage 5.2");
    assert.equal(majorityYearLevel([null, ""]), null);
  });
});

describe("batches", () => {
  it("splits requests by size", () => {
    const requests = Array.from({ length: 5 }, (_, i) => ({ custom_id: `r${i}`, params: { pad: "x".repeat(100) } }));
    const chunks = chunkRequests(requests, { maxBytes: 300 });
    assert.deepEqual(chunks.map((chunk) => chunk.length), [2, 2, 1]);
  });

  it("prices usage at half the Haiku list price", () => {
    assert.equal(batchCostOf({ inputTokens: 1e6, outputTokens: 1e6 }, "claude-haiku-5-5"), 0.3);
    assert.throws(() => batchCostOf({}, "claude-unknown"), /No price/);
  });

  it("waits for a batch to end and reads every result", async () => {
    const statuses = ["in_progress", "ended"];
    const client = {
      messages: {
        batches: {
          retrieve: async () => ({ processing_status: statuses.shift(), request_counts: { processing: 1 } }),
          results: async () => (async function* () {
            yield { custom_id: "a", result: { type: "succeeded", message: { id: "m" } } };
            yield { custom_id: "b", result: { type: "errored", error: { type: "server_error" } } };
          })(),
        },
      },
    };
    await waitForBatch(client, "b1", { sleep: async () => {} });
    const results = await collectResults(client, "b1");
    assert.deepEqual(results.map((r) => [r.customId, r.type]), [["a", "succeeded"], ["b", "errored"]]);
  });
});

describe("fetchSourcePdf", () => {
  const drive = { download: async () => Buffer.from("raw"), exportPdf: async () => Buffer.from("exported") };

  it("downloads PDFs, exports Google Docs and converts Office files", async () => {
    const convert = async (buffer, name) => Buffer.from(`converted ${name}`);
    assert.equal(String(await fetchSourcePdf({ drive, convert, source: { id: "1", name: "a.pdf", mimeType: "application/pdf" } })), "raw");
    assert.equal(String(await fetchSourcePdf({ drive, convert, source: { id: "2", name: "Sheet", mimeType: "application/vnd.google-apps.document" } })), "exported");
    assert.equal(String(await fetchSourcePdf({ drive, convert, source: { id: "3", name: "b.docx", mimeType: "application/msword" } })), "converted b.docx");
  });
});

describe("questionBankExtract options", () => {
  it("requires a project and a work dir, and reads numbers", () => {
    assert.throws(() => parseArgs(["--work-dir=/tmp/x"]), /projectId/);
    const options = parseArgs(["--projectId=p", "--work-dir=/tmp/x", "--limit-sources=40", "--pages-per-source=5", "--cap=2"]);
    assert.equal(options.limitSources, 40);
    assert.equal(options.pagesPerSource, 5);
    assert.equal(options.cap, 2);
    assert.equal(options.commit, false);
  });

  it("draws the same sample for the same seed", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    assert.deepEqual(shuffled(items, randomSource(54)), shuffled(items, randomSource(54)));
    assert.notDeepEqual(shuffled(items, randomSource(54)), shuffled(items, randomSource(55)));
  });
});
