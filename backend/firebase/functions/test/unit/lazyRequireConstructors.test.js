"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// `new loadXeroNode().XeroClient(...)` parses as `new (loadXeroNode)()`, which
// calls the loader as a constructor and throws "is not a constructor". It broke
// every Xero call after the TP-37 lazy-load change (TP-39). A lazy loader
// returns the module, so the class has to be reached before `new`:
// `new (loadXeroNode().XeroClient)(...)`.
const LOADER_AS_CONSTRUCTOR = /\bnew\s+load[A-Z]\w*\s*\(/;

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : jsFiles(full);
    return entry.name.endsWith(".js") ? [full] : [];
  });
}

test("no lazy loader is called as a constructor", () => {
  const root = path.join(__dirname, "..", "..");
  const offenders = [];
  for (const dir of ["lib", "src"]) {
    for (const file of jsFiles(path.join(root, dir))) {
      fs.readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (LOADER_AS_CONSTRUCTOR.test(line)) {
            offenders.push(`${path.relative(root, file)}:${i + 1}: ${line.trim()}`);
          }
        });
    }
  }
  assert.deepEqual(offenders, []);
});
