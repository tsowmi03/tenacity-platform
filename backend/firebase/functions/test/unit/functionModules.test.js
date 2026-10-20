"use strict";

// A cold instance loads only the file lib/functionModules.json names for its
// FUNCTION_TARGET (MOB-55). These tests are what make that safe: the manifest
// must match lib/allFunctions.js, and each function loaded on its own must be
// deployed exactly as it would be from the full map.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const path = require("node:path");

const { buildManifest } = require("../../scripts/generateFunctionModules");
const committed = require("../../lib/functionModules.json");

const ROOT = path.resolve(__dirname, "../..");
const run = promisify(execFile);

// Prints a function's deploy definition as the platform would read it.
const ENDPOINT_OF = (name) =>
  `const fn = require("./lib/index.js")[${JSON.stringify(name)}];` +
  "process.stdout.write(JSON.stringify({ type: typeof fn, endpoint: fn && fn.__endpoint }));";

async function endpointFor(name, { target }) {
  const env = { ...process.env, GCLOUD_PROJECT: "demo-function-modules" };
  delete env.FUNCTION_TARGET;
  if (target) env.FUNCTION_TARGET = name;
  const { stdout } = await run(process.execPath, ["-e", ENDPOINT_OF(name)], {
    cwd: ROOT,
    env,
    maxBuffer: 4 * 1024 * 1024,
  });
  // The load-time log line comes first when FUNCTION_TARGET is set.
  return stdout.slice(stdout.lastIndexOf("\n") + 1);
}

async function inBatches(items, size, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return results;
}

describe("function module manifest", () => {
  it("matches what the generator produces from allFunctions.js", () => {
    const { manifest, unresolved } = buildManifest();
    assert.deepEqual(unresolved, []);
    assert.deepEqual(
      committed,
      manifest,
      "lib/functionModules.json is stale: run npm run generate:function-modules"
    );
  });

  it("deploys every function identically whether loaded alone or with all of them", async () => {
    const names = Object.keys(committed);
    const mismatches = await inBatches(names, 8, async (name) => {
      const [alone, full] = await Promise.all([
        endpointFor(name, { target: true }),
        endpointFor(name, { target: false }),
      ]);
      if (JSON.parse(full).type === "undefined") return `${name}: missing from full map`;
      return alone === full ? null : `${name}: endpoint differs when loaded alone`;
    });
    assert.deepEqual(mismatches.filter(Boolean), []);
  });
});
