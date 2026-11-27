import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src/lib/personName.ts"), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});
const module = { exports: {} };
new Function("module", "exports", outputText)(module, module.exports);
const { normalisePersonName } = module.exports;

test("names typed in capitals become title case", () => {
  assert.equal(normalisePersonName("MIA"), "Mia");
  assert.equal(normalisePersonName("LINH CHAN"), "Linh Chan");
  assert.equal(normalisePersonName("MARY-JANE"), "Mary-Jane");
  assert.equal(normalisePersonName("O'BRIEN"), "O'Brien");
  assert.equal(normalisePersonName("ZOË"), "Zoë");
});

test("names typed in lower case become title case", () => {
  assert.equal(normalisePersonName("mia"), "Mia");
  assert.equal(normalisePersonName("anne-marie o’neill"), "Anne-Marie O’Neill");
});

test("names with mixed case are left as typed", () => {
  assert.equal(normalisePersonName("McDonald"), "McDonald");
  assert.equal(normalisePersonName("van der Berg"), "van der Berg");
  assert.equal(normalisePersonName("DeSouza"), "DeSouza");
  assert.equal(normalisePersonName("Mia"), "Mia");
});

test("extra whitespace is collapsed and trimmed", () => {
  assert.equal(normalisePersonName("  MIA   ROSE  "), "Mia Rose");
  assert.equal(normalisePersonName("Mia  Rose"), "Mia Rose");
  assert.equal(normalisePersonName(""), "");
});
