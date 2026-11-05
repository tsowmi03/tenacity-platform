"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createRun, pageKey, pagesToTake, parseArgs, parsePageKey, prepareSource, writeFinishedSources } = require("../../scripts/englishBankExtract");
const { PAGE_MAX_TOKENS, buildPageParams, pagePrompt } = require("../../src/englishBank/prompts");
const { PAGE_SCHEMA } = require("../../src/englishBank/schema");

describe("English bank extraction", () => {
  it("takes every page, or a run of consecutive pages that is the same each time", () => {
    assert.deepEqual(pagesToTake(4, null, 66), [1, 2, 3, 4]);
    assert.deepEqual(pagesToTake(4, 6, 66), [1, 2, 3, 4]);
    const sample = pagesToTake(40, 6, 66);
    assert.equal(sample.length, 6);
    assert.ok(sample.every((page, i) => i === 0 || page === sample[i - 1] + 1));
    assert.ok(sample[0] >= 1 && sample[5] <= 40);
    assert.deepEqual(pagesToTake(40, 6, 66), sample);
  });

  it("round-trips batch request ids, which allow only letters, digits, _ and -", () => {
    const key = pageKey("1AbC-x_9", 12);
    assert.match(key, /^[A-Za-z0-9_-]{1,64}$/);
    assert.deepEqual(parsePageKey(key), { sourceId: "1AbC-x_9", pageNumber: 12 });
    assert.throws(() => parsePageKey("sort_x"), /Unrecognised/);
  });

  it("needs a project and a work folder; --local writes nothing to production", () => {
    assert.throws(() => parseArgs(["--work-dir=/tmp/x"]), /--projectId is required/);
    assert.throws(() => parseArgs(["--projectId=p"]), /--work-dir is required/);
    const options = parseArgs(["--projectId=p", "--work-dir=/tmp/x", "--local", "--pages-per-source=6", "--commit", "--yes"]);
    assert.equal(options.local, true);
    assert.equal(options.pagesPerSource, 6);
    assert.equal(options.cap, 100);
  });

  it("asks for the page schema, with the role and text layer in the prompt", () => {
    const params = buildPageParams({ image: Buffer.from("jpeg"), sourcePath: "English/x.pdf", role: "guide", pageNumber: 2, width: 1000, height: 1400, textLayer: "Criteria: explains", previousPageText: "end of page one" });
    assert.equal(params.max_tokens, PAGE_MAX_TOKENS);
    assert.equal(params.output_config.format.schema, PAGE_SCHEMA);
    const text = params.messages[0].content[1].text;
    assert.match(text, /marking guideline/);
    assert.match(text, /<text_layer>\nCriteria: explains/);
    assert.match(text, /<previous_page_end>\nend of page one/);
    assert.doesNotMatch(pagePrompt({ sourcePath: "x", pageNumber: 1, width: 1, height: 1 }), /text_layer/);
  });

  function tempRun() {
    return createRun(fs.mkdtempSync(path.join(os.tmpdir(), "eb-test-")));
  }
  function fakeDb({ failSets = 0 } = {}) {
    const sets = [];
    let failures = failSets;
    return {
      sets,
      collection: (name) => ({ doc: (id) => ({ set: async (data) => {
        if (failures > 0) { failures -= 1; throw new Error("unavailable"); }
        sets.push({ name, id, data });
      } }) }),
      batch: () => ({ set() {}, commit: async () => {} }),
    };
  }

  it("leaves a file that failed to prepare for the next run, with its half-rendered pages dropped", async () => {
    const run = tempRun();
    const source = { id: "f1", name: "Paper.pdf", path: "English/Paper.pdf", mimeType: "application/vnd.google-apps.shortcut", version: "v1", role: "paper", prepared: false };
    run.state.sources = { f1: source };
    run.state.pages[pageKey("f1", 1)] = { sourceId: "f1", pageNumber: 1, stage: "extract" };
    await prepareSource(run, { getFile: async () => { throw new Error("Drive timed out"); } }, source, { pagesPerSource: null, seed: 66 });
    assert.equal(source.prepared, false);
    assert.match(source.error, /Drive timed out/);
    assert.deepEqual(run.state.pages, {});

    const db = fakeDb();
    await writeFinishedSources(run, { db, local: false });
    assert.equal(source.written, undefined);
    assert.deepEqual(db.sets.map((set) => set.data.extractionError), ["Drive timed out"]);
  });

  it("marks a file written only once its source records it as extracted", async () => {
    const run = tempRun();
    const source = { id: "f2", name: "Paper.pdf", path: "English/Paper.pdf", version: "v1", role: "paper", prepared: true, sampled: false };
    run.state.sources = { f2: source };
    await writeFinishedSources(run, { db: fakeDb({ failSets: 2 }), local: false, retryDelays: [0] });
    assert.equal(source.written, undefined);
    assert.match(source.writeError, /unavailable/);

    const db = fakeDb();
    await writeFinishedSources(run, { db, local: false, retryDelays: [0] });
    assert.equal(source.written, true);
    assert.equal(source.writeError, undefined);
    assert.equal(db.sets[0].data.extractedVersion, "v1");
  });
});
