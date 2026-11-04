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
    assert.match(doc.data.figures[0].storagePath, /^questionBank\/diagrams\/src1_p7_1_[0-9a-f]{8}_1\.png$/);
    const [changed] = toQuestionDocs({ source: { ...source, version: "m2:t2" }, pageNumber: 7, width: 1109, height: 1568, units: [unit()], runId: "r", model: "m" });
    assert.notEqual(changed.data.figures[0].storagePath, doc.data.figures[0].storagePath, "a new file version never overwrites an old crop");
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

  it("gives later parts the diagram they share with an earlier part, without a second crop", () => {
    const docs = toQuestionDocs({
      source, pageNumber: 3, width: 1000, height: 1000, runId: "r", model: "m",
      units: [
        unit({ label: "Exercise 7A Q2a", stem: "Find each angle.", text: "$x$" }),
        unit({ label: "Exercise 7A Q2b", stem: "Find each angle.", text: "$y$", figures: [] }),
        unit({ label: "Q3", stem: null, text: "Sketch $y = 2x - 3$.", figures: [] }),
        unit({ label: "Q4a", stem: "", text: "Find p.", figures: [{ type: "right_triangle", box: { x0: 20, y0: 500, x1: 300, y1: 800 }, description: "T2" }] }),
        unit({ label: "Q4b(ii)", stem: "", text: "Find q.", figures: [] }),
      ],
    });
    assert.deepEqual(docs.map((d) => d.data.label), ["Exercise 7A Q2a", "Exercise 7A Q2b", "Q4a", "Q4b(ii)"], "the part with no printed diagram stays out");
    assert.equal(docs[1].data.figures[0].storagePath, docs[0].data.figures[0].storagePath);
    assert.equal(docs[1].data.figures[0].sharedFrom, docs[0].id);
    assert.equal(docs[3].data.figures[0].storagePath, docs[2].data.figures[0].storagePath, "matched by question number");
    assert.equal(docs[2].data.figures[0].sharedFrom, undefined);
  });

  it("reads the question number from a printed label", () => {
    const { questionNumberOf } = require("../../src/questionBank/extraction");
    assert.equal(questionNumberOf("Exercise 7A Q2b"), "2");
    assert.equal(questionNumberOf("Q12a(ii)"), "12");
    assert.equal(questionNumberOf("Q8"), "8");
    assert.equal(questionNumberOf("Example 3"), "3");
    assert.equal(questionNumberOf("Investigation"), null);
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

  it("follows a shortcut to the file it points at", async () => {
    const fetched = [];
    const shortcutDrive = {
      getFile: async () => ({ shortcutDetails: { targetId: "target", targetMimeType: "application/pdf" } }),
      download: async (id) => { fetched.push(id); return Buffer.from("target pdf"); },
    };
    const source = { id: "short", name: "NSM.pdf", mimeType: "application/vnd.google-apps.shortcut" };
    assert.equal(String(await fetchSourcePdf({ drive: shortcutDrive, source })), "target pdf");
    assert.deepEqual(fetched, ["target"]);
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

describe("answer pages", () => {
  it("tells both calls that answers sections hold no questions", () => {
    const sort = buildSortParams({ image: IMAGE }).messages[0].content[1].text;
    const extract = buildExtractParams({ image: IMAGE, sourcePath: "x.pdf", pageNumber: 1, width: 10, height: 10, targetTypes: ["parabola"] }).messages[0].content[1].text;
    assert.match(sort, /answers or worked solutions/i);
    assert.match(extract, /answers section at the back of a book, are not questions/);
  });
});

describe("cleanCrop", () => {
  const sharp = require("sharp");
  const { cleanCrop } = require("../../src/questionBank/pages");

  // White canvas with black rectangles; returns the cleaned crop's pixels.
  async function drawn(width, height, rects) {
    const svg = `<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fff"/>${rects.map(([x, y, w, h, stroke]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${stroke ? "none" : "#000"}" stroke="#000" stroke-width="${stroke || 0}"/>`).join("")}</svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  it("removes a small neighbour's fragment touching the edge", async () => {
    const png = await drawn(200, 200, [[60, 60, 80, 80, 3], [0, 0, 12, 12]]);
    const meta = await sharp(await cleanCrop(png)).metadata();
    assert.ok(meta.width < 200 && meta.height < 200, "crop was trimmed around the figure");
  });

  it("keeps a large shape that runs to the crop's edge", async () => {
    const png = await drawn(200, 200, [[0, 0, 200, 200, 4], [80, 80, 40, 40]]);
    const meta = await sharp(await cleanCrop(png)).metadata();
    assert.equal(meta.width, 200);
    assert.equal(meta.height, 200);
  });
});

describe("printed wording", () => {
  it("asks for the printed wording only, never a description of the diagram", () => {
    const prompt = buildExtractParams({ image: IMAGE, sourcePath: "x.pdf", pageNumber: 1, width: 10, height: 10, targetTypes: ["solid_3d"] }).messages[0].content[1].text;
    assert.match(prompt, /stem and text are exactly what is printed/);
    assert.match(prompt, /only its letter and a diagram has an empty "text"/);
  });
});

describe("submitStage", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { createRun, submitStage } = require("../../scripts/questionBankExtract");

  function runWithPages(count) {
    const run = createRun(fs.mkdtempSync(path.join(os.tmpdir(), "qb-submit-")));
    run.state.sources = { src: { id: "src", path: "Maths/x.pdf" } };
    for (let n = 1; n <= count; n++) {
      const key = requestId("page", "src", n);
      fs.writeFileSync(run.imagePath(key), Buffer.alloc(2000, n));
      run.state.pages[key] = { sourceId: "src", pageNumber: n, width: 10, height: 10, stage: "sort" };
    }
    return run;
  }

  function fakeClient() {
    const batches = [];
    return { batches, messages: { batches: { create: async ({ requests }) => { batches.push(requests.map((r) => r.custom_id)); return { id: `b${batches.length}` }; } } } };
  }

  it("submits one size-limited batch at a time and records each", async () => {
    const run = runWithPages(3);
    const client = fakeClient();
    const finished = await submitStage(run, client, "sort", { cap: 100, maxBatchBytes: 4000 });
    assert.equal(finished, true);
    assert.deepEqual(client.batches.map((b) => b.length), [1, 1, 1]);
    assert.deepEqual(run.state.batches.map((b) => b.status), ["submitted", "submitted", "submitted"]);
    assert.equal(await submitStage(run, client, "sort", { cap: 100, maxBatchBytes: 4000 }), true);
    assert.equal(client.batches.length, 3, "pages already in a batch are not sent again");
  });

  it("stops before a batch that would pass the spending cap", async () => {
    const run = runWithPages(3);
    const client = fakeClient();
    assert.equal(await submitStage(run, client, "sort", { cap: 0.0001 }), false);
    assert.deepEqual(client.batches, []);
  });
});

describe("difficulty", () => {
  it("is a required rating of easy, medium or hard, kept on the question", () => {
    const unit = extractSchema(["right_triangle"]).properties.units.items;
    assert.ok(unit.required.includes("difficulty"));
    assert.deepEqual(unit.properties.difficulty.enum, ["easy", "medium", "hard"]);
    const [doc] = toQuestionDocs({
      source: { id: "s", path: "p", version: "v" }, pageNumber: 1, width: 1000, height: 1000, runId: "r", model: "m",
      units: [{
        kind: "question", label: "Q9", skill: "right_triangle/two_triangles_multi_step", description: "d", context: "real_world", steps: "multi",
        difficulty: "hard", topic: "Pythagoras", yearLevel: "Year 9", stem: null, text: "Find x.", box: { x0: 0, y0: 0, x1: 500, y1: 500 },
        figures: [{ type: "right_triangle", box: { x0: 10, y0: 10, x1: 300, y1: 300 }, description: "two triangles" }],
      }],
    });
    assert.equal(doc.data.difficulty, "hard");
  });
});

describe("Year 9-10 priority", () => {
  const { isPriority } = require("../../scripts/questionBankExtract");
  it("puts Year 9-10 and Stage 5 files first", () => {
    for (const path of [
      "Maths/Past Papers/Year 9/Yearly Papers/Baulkham Hills 2010 - Year 9 Yearly.pdf",
      "Maths/Mathletics/10/exam revision/Circles student.pdf",
      "Maths/MathsTEXTBOOKS/CMS_NSW_S5_9_CoreAdvanced_book.pdf",
      "Maths/Revision Workbooks/Year 10 Mathematics revision and exam.pdf",
      "Maths/MathsTEXTBOOKS/About Maths-Y9_5.3/x.pdf",
      "Maths/MathsTEXTBOOKS/Insight/Stage 5.3/ch1.pdf",
    ]) assert.equal(isPriority({ path }), true, path);
    for (const path of [
      "Maths/HSC/Advanced/Year 11/Ch 1-5 Topic Tests Cambridge.pdf",
      "Maths/Mathletics/07/exam/Algebra student.pdf",
      "Maths/Upper Primary/Measurement/Area.pdf",
    ]) assert.equal(isPriority({ path }), false, path);
  });
});

describe("questionBankExtract write failures", () => {
  const { rewriteTargets, withRetries } = require("../../scripts/questionBankExtract");

  it("retries a failed write, then gives up", async () => {
    let calls = 0;
    const slept = [];
    const result = await withRetries(async () => {
      calls += 1;
      if (calls < 3) throw new Error("DEADLINE_EXCEEDED");
      return "saved";
    }, { delays: [1, 2, 3], sleep: async (ms) => slept.push(ms) });
    assert.equal(result, "saved");
    assert.deepEqual(slept, [1, 2]);
    await assert.rejects(withRetries(async () => { throw new Error("down"); }, { delays: [1], sleep: async () => {} }), /down/);
  });

  it("finds pages whose answer came back but could not be saved", () => {
    const run = {
      state: {
        pages: {
          page_a_p1: { stage: "failed", error: "4 DEADLINE_EXCEEDED: Deadline exceeded after 60.001s" },
          page_a_p2: { stage: "failed", error: "request to https://storage.googleapis.com/upload/storage/v1/b/x failed" },
          page_a_p3: { stage: "failed", error: "errored: {\"type\":\"overloaded_error\"}" },
          page_a_p4: { stage: "done" },
          page_b_p1: { stage: "failed", writeFailed: true, error: "anything" },
        },
        batches: [
          { id: "b1", stage: "extract", status: "collected", keys: ["page_a_p1", "page_a_p2", "page_a_p3", "page_a_p4"] },
          { id: "b2", stage: "extract", status: "submitted", keys: ["page_b_p1"] },
          { id: "b3", stage: "sort", status: "collected", keys: ["page_b_p1"] },
        ],
      },
    };
    const targets = [...rewriteTargets(run)].map(([batch, keys]) => [batch.id, keys]);
    assert.deepEqual(targets, [["b1", ["page_a_p1", "page_a_p2"]]], "model failures, unfinished batches and sort batches are left alone");
  });
});
