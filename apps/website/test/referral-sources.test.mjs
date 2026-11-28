import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

// WEB-17: the "How did you hear about us?" options.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = ts.transpileModule(
  fs.readFileSync(path.join(root, "src/lib/referralSources.ts"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }
).outputText;
const module = { exports: {} };
vm.runInNewContext(source, { module, exports: module.exports });
const { REFERRAL_SOURCE_OPTIONS, isReferralSourceCode, referralSourceOption } =
  module.exports;

test("Google ad and AI assistant are offered, apart from Google search", () => {
  for (const code of ["google", "google_ad", "ai_assistant"]) {
    assert.ok(isReferralSourceCode(code), code);
  }
  assert.equal(referralSourceOption("google_ad").label, "Google ad");
  assert.equal(referralSourceOption("google_ad").detailLabel, undefined);
});

test("a referred family is asked who to thank, without being told it is optional", () => {
  for (const code of ["friend_family", "existing_family"]) {
    const option = referralSourceOption(code);
    assert.match(option.detailLabel, /can we thank\?$/);
    assert.doesNotMatch(option.detailLabel, /optional/i);
    assert.ok(option.detailPlaceholder);
  }
});

test("the website offers the same codes as the admin portal", () => {
  const portal = fs.readFileSync(
    path.join(root, "../admin-portal/src/backend/referralSources.js"),
    "utf8"
  );
  const portalCodes = [...portal.matchAll(/code: "([a-z_]+)"/g)].map((m) => m[1]);
  // The portal gains the two new codes in TP-48, which merges first.
  const websiteCodes = REFERRAL_SOURCE_OPTIONS.map((option) => option.code);
  for (const code of portalCodes) assert.ok(websiteCodes.includes(code), code);
});
