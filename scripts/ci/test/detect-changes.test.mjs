import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  changedPaths,
  classifyPaths,
  outputNames,
} from "../detect-changes.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

describe("classifyPaths", () => {
  it("selects only the directly affected application", () => {
    const result = classifyPaths(["apps/website/app/page.tsx"]);
    assert.equal(result.website, true);
    assert.deepEqual(outputNames.filter((name) => result[name]), ["website"]);
  });

  it("fans root Firebase configuration changes out to affected surfaces", () => {
    const result = classifyPaths(["firebase.json"]);
    assert.equal(result.portal, true);
    assert.equal(result.functions, true);
    assert.equal(result.rules, true);
    assert.equal(result.firebase_config, true);
    assert.equal(result.mobile, false);
    assert.equal(result.website, false);
  });

  it("runs every validation job for workflow and shared tooling changes", () => {
    for (const path of [
      ".github/workflows/deploy.yml",
      ".github/actions/platform/action.yml",
      "docs/operations/workflow-templates/firebase-functions-production.yml",
      "scripts/ci/check.mjs",
      "scripts/firebase/firestore-index-state.mjs",
      "backend/firebase/deployment-targets.json",
      "contracts/a.json",
    ]) {
      const result = classifyPaths([path]);
      assert.equal(outputNames.every((name) => result[name]), true);
    }
  });

  it("reports both sides of a cross-surface rename", (context) => {
    const repository = mkdtempSync(join(tmpdir(), "tenacity-path-filter-"));
    context.after(() => rmSync(repository, { recursive: true, force: true }));
    git(repository, "init", "--quiet");
    git(repository, "config", "user.name", "CI Test");
    git(repository, "config", "user.email", "ci@example.invalid");
    const sourceDirectory = join(repository, "backend/firebase/functions");
    const destinationDirectory = join(repository, "apps/website");
    mkdirSync(sourceDirectory, { recursive: true });
    mkdirSync(destinationDirectory, { recursive: true });
    const source = join(sourceDirectory, "renamed.js");
    const destination = join(destinationDirectory, "renamed.js");
    writeFileSync(source, "export const value = true;\n");
    git(repository, "add", ".");
    git(repository, "commit", "--quiet", "-m", "source");
    const base = git(repository, "rev-parse", "HEAD");
    renameSync(source, destination);
    git(repository, "add", "--all");
    git(repository, "commit", "--quiet", "-m", "rename");
    const head = git(repository, "rev-parse", "HEAD");

    assert.deepEqual(changedPaths(base, head, { cwd: repository }).sort(), [
      "apps/website/renamed.js",
      "backend/firebase/functions/renamed.js",
    ]);
  });

  it("includes rules when their test dependencies change", () => {
    const result = classifyPaths(["apps/admin-portal/package-lock.json"]);
    assert.equal(result.portal, true);
    assert.equal(result.rules, true);
  });

  it("validates each portal independently", () => {
    const admin = classifyPaths(["apps/admin-portal/src/App.jsx"]);
    assert.equal(admin.portal, true);
    assert.equal(admin.resource_portal, false);

    const resource = classifyPaths(["apps/resource-portal/src/App.jsx"]);
    assert.equal(resource.resource_portal, true);
    assert.equal(resource.portal, false);
    // The rules suite lives in the admin portal, so resource-portal sources
    // do not drag it in.
    assert.equal(resource.rules, false);
  });

  it("revalidates both portals when the Hosting manifest changes", () => {
    for (const path of ["firebase.json", ".firebaserc"]) {
      const result = classifyPaths([path]);
      assert.equal(result.portal, true, path);
      assert.equal(result.resource_portal, true, path);
    }
  });

  it("runs Function validation when its production inventory changes", () => {
    const result = classifyPaths([
      "backend/firebase/inventory/production-functions.json",
    ]);
    assert.equal(result.functions, true);
    assert.equal(result.firebase_config, true);
  });

  it("runs everything for manual dispatch", () => {
    const result = classifyPaths([], { runAll: true });
    assert.equal(outputNames.every((name) => result[name]), true);
  });
});
