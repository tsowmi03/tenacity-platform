"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { lazyRequire } = require("../../src/shared/lazyRequire");

test("lazyRequire does not load until the first call", () => {
  let loads = 0;
  const load = lazyRequire(() => {
    loads += 1;
    return { value: 42 };
  });

  assert.equal(loads, 0);
  assert.equal(load().value, 42);
  assert.equal(loads, 1);
});

test("lazyRequire loads once and returns the same module afterwards", () => {
  let loads = 0;
  const load = lazyRequire(() => {
    loads += 1;
    return {};
  });

  const first = load();
  assert.equal(load(), first);
  assert.equal(loads, 1);
});

test("lazyRequire caches a falsy module rather than reloading it", () => {
  let loads = 0;
  const load = lazyRequire(() => {
    loads += 1;
    return undefined;
  });

  load();
  load();
  assert.equal(loads, 1);
});

test("lazyRequire retries after a failed load", () => {
  let loads = 0;
  const load = lazyRequire(() => {
    loads += 1;
    if (loads === 1) throw new Error("not yet");
    return "loaded";
  });

  assert.throws(load, /not yet/);
  assert.equal(load(), "loaded");
});

test("the Functions bundle does not load the heavy libraries at startup", () => {
  // The libraries TP-37 moved behind lazyRequire. Loading any of these at the
  // top of a file puts it back into every function's startup memory.
  const heavy = [
    "@anthropic-ai/sdk",
    "@posthog/ai",
    "@sendgrid/mail",
    "mammoth",
    "openai",
    "pdf-parse",
    "pdfkit",
    "posthog-node",
    "sharp",
    "stripe",
    "xero-node",
    "xlsx",
  ];
  const { execFileSync } = require("child_process");
  const path = require("path");
  const entryPoint = path.resolve(__dirname, "../../lib/index.js");
  const output = execFileSync(
    process.execPath,
    [
      "-e",
      `process.env.GCLOUD_PROJECT = "demo-lazy-require";
       require(${JSON.stringify(entryPoint)});
       process.stdout.write(JSON.stringify(Object.keys(require.cache)));`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
  const loadedFiles = JSON.parse(output);
  const loadedHeavy = heavy.filter((name) =>
    loadedFiles.some((file) => file.includes(`/node_modules/${name}/`))
  );
  assert.deepEqual(loadedHeavy, []);
});
