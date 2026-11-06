"use strict";
const { it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { parseArgs, localStorage } = require("../../scripts/replayResourceLocally");

it("requires explicit replay inputs, output and a bounded call budget", () => {
  assert.throws(() => parseArgs([]), /required/);
  assert.throws(() => parseArgs(["--input", "input.json", "--output", "out", "--max-calls", "301"]), /1–300/);
  assert.throws(() => parseArgs(["--production"]), /Unknown option/);
  assert.equal(parseArgs(["--input", "i", "--output", "o"]).firebaseSecrets, false);
});

it("stores checkpoints only under the local directory and treats absent objects as cache misses", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "res51-replay-test-"));
  try {
    const bucket = localStorage(root).bucket();
    await assert.rejects(bucket.file("missing.json").download(), { code: 404 });
    await bucket.file("checkpoints/one.json").save("saved");
    assert.equal((await bucket.file("checkpoints/one.json").download())[0].toString(), "saved");
    await assert.rejects(bucket.file("../escape").save("no"), /Unsafe/);
    await bucket.deleteFiles({ prefix: "checkpoints/" });
    await assert.rejects(bucket.file("checkpoints/one.json").download(), { code: 404 });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
