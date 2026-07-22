import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const fixturePath =
  "backend/firebase/rules/staging/firestore-deny-all.rules";
const fixtureContent = readFileSync(fixturePath, "utf8");
const expectedFixtureSha256 =
  "cd5089e4e5116dbb994013dc5fd5e7e411ec348935b8d06d13acd00173cca15b";

describe("Firebase staging rehearsal fixture", () => {
  it("pins the exact restrictive Firestore fixture", () => {
    assert.equal(
      createHash("sha256").update(fixtureContent).digest("hex"),
      expectedFixtureSha256
    );
    assert.match(fixtureContent, /service\s+cloud\.firestore\s*\{/);
    assert.doesNotMatch(fixtureContent, /tenacity-tutoring-b8eb2/);
  });

  it("contains only a literal deny-all allow expression", () => {
    const allowStatements = [
      ...fixtureContent.matchAll(/\ballow\s+([^:;]+):\s*if\s+([^;]+);/g),
    ];
    assert.equal(allowStatements.length, 1);
    assert.equal(allowStatements[0][1].trim(), "read, write");
    assert.equal(allowStatements[0][2].trim(), "false");
    assert.equal((fixtureContent.match(/\ballow\b/g) ?? []).length, 1);
  });

  it("is not referenced by the root Firebase deployment manifest", () => {
    const firebaseManifest = readFileSync("firebase.json", "utf8");
    assert.doesNotMatch(firebaseManifest, /firestore-deny-all\.rules/);
    assert.doesNotMatch(firebaseManifest, /rules\/staging\//);
  });
});
