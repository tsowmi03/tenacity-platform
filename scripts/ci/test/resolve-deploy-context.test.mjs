import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyChanges,
  resolveDeployContext,
} from "../resolve-deploy-context.mjs";

const SHA = "1c156b367708bc0147f31248d201e5f98195de04";
const OTHER_SHA = "0".repeat(40);

function run(payload) {
  return {
    conclusion: "success",
    head_branch: "main",
    head_sha: SHA,
    head_repository: { full_name: "tsowmi03/tenacity-platform" },
    ...payload,
  };
}

describe("resolveDeployContext", () => {
  it("dispatch deploys the supplied SHA without path gating", () => {
    const context = resolveDeployContext({
      eventName: "workflow_dispatch",
      surface: "website",
      inputs: { git_sha: SHA },
      changedPaths: ["README.md"],
    });
    assert.equal(context.sha, SHA);
    assert.equal(context.trigger, "dispatch");
    assert.equal(context.deploy, true);
  });

  it("dispatch rejects a short or malformed SHA", () => {
    for (const git_sha of ["main", "1c156b3", "", "Z".repeat(40)]) {
      assert.throws(
        () =>
          resolveDeployContext({
            eventName: "workflow_dispatch",
            surface: "website",
            inputs: { git_sha },
          }),
        /full 40-character commit SHA/
      );
    }
  });

  it("auto-deploys when only the surface's own source changed", () => {
    const context = resolveDeployContext({
      eventName: "workflow_run",
      surface: "website",
      workflowRun: run(),
      changedPaths: ["apps/website/src/pages/index.tsx"],
    });
    assert.equal(context.deploy, true);
    assert.equal(context.trigger, "auto");
    assert.equal(context.sha, SHA);
  });

  it("skips when the surface's source did not change", () => {
    const context = resolveDeployContext({
      eventName: "workflow_run",
      surface: "website",
      workflowRun: run(),
      changedPaths: ["apps/admin-portal/src/App.jsx"],
    });
    assert.equal(context.deploy, false);
    assert.match(context.reason, /No website source changed/);
  });

  it("does not redeploy a frontend for a workflow or docs change", () => {
    // detect-changes.mjs maps these to every area so CI revalidates broadly.
    // Reusing that here would redeploy both frontends on every pipeline edit.
    for (const path of [
      ".github/workflows/validate.yml",
      "scripts/ci/detect-changes.mjs",
      "docs/operations/production-deployment-controls.md",
      "log.md",
    ]) {
      const context = resolveDeployContext({
        eventName: "workflow_run",
        surface: "website",
        workflowRun: run(),
        changedPaths: [path],
      });
      assert.equal(context.deploy, false, `${path} should not deploy`);
    }
  });

  it("ignores documentation inside a deployable path", () => {
    const context = resolveDeployContext({
      eventName: "workflow_run",
      surface: "website",
      workflowRun: run(),
      changedPaths: ["apps/website/docs/deployment.md"],
    });
    assert.equal(context.deploy, false);
  });

  it("skips a frontend when the same commit changed the backend", () => {
    for (const backendPath of [
      "backend/firebase/rules/firestore.rules",
      "backend/firebase/functions/src/email/parentEmailBlast.js",
      "backend/firebase/indexes/firestore.indexes.json",
      "firebase.json",
      ".firebaserc",
    ]) {
      const context = resolveDeployContext({
        eventName: "workflow_run",
        surface: "portal",
        workflowRun: run(),
        changedPaths: ["apps/admin-portal/src/App.jsx", backendPath],
      });
      assert.equal(context.deploy, false, `${backendPath} must interlock`);
      assert.match(context.reason, /Backend changed alongside portal/);
    }
  });

  it("skips a validation run that did not succeed, without failing", () => {
    // `types: [completed]` fires for failures and cancellations. Throwing would
    // paint a red deploy run next to every red validation run.
    for (const conclusion of ["failure", "cancelled", "skipped", null]) {
      const context = resolveDeployContext({
        eventName: "workflow_run",
        surface: "website",
        workflowRun: run({ conclusion }),
        changedPaths: ["apps/website/src/x.tsx"],
      });
      assert.equal(context.deploy, false, `conclusion ${conclusion}`);
      assert.match(context.reason, /not success/);
    }
  });

  it("refuses a validation run from another branch", () => {
    assert.throws(
      () =>
        resolveDeployContext({
          eventName: "workflow_run",
          surface: "website",
          workflowRun: run({ head_branch: "feat/whatever" }),
          changedPaths: ["apps/website/src/x.tsx"],
        }),
      /not main/
    );
  });

  it("refuses a validation run whose head repository is a fork", () => {
    // A fork's pull request can make Validate platform succeed. Without this
    // check that fork's code would reach production.
    assert.throws(
      () =>
        resolveDeployContext({
          eventName: "workflow_run",
          surface: "website",
          workflowRun: run({
            head_repository: { full_name: "someone-else/tenacity-platform" },
          }),
          changedPaths: ["apps/website/src/x.tsx"],
        }),
      /head repository was 'someone-else\/tenacity-platform'/
    );
  });

  it("refuses to run outside this repository", () => {
    assert.throws(
      () =>
        resolveDeployContext({
          eventName: "workflow_dispatch",
          surface: "website",
          inputs: { git_sha: SHA },
          repository: "someone-else/tenacity-platform",
        }),
      /Refusing to deploy from/
    );
  });

  it("refuses an unsupported trigger", () => {
    assert.throws(
      () =>
        resolveDeployContext({
          eventName: "push",
          surface: "website",
          workflowRun: run(),
        }),
      /Unsupported trigger: push/
    );
  });

  it("refuses a workflow_run head SHA that is not a full SHA", () => {
    assert.throws(
      () =>
        resolveDeployContext({
          eventName: "workflow_run",
          surface: "website",
          workflowRun: run({ head_sha: "main" }),
          changedPaths: ["apps/website/src/x.tsx"],
        }),
      /not a full commit SHA/
    );
  });
});

describe("classifyChanges", () => {
  it("separates the two frontends", () => {
    const paths = ["apps/website/src/a.tsx", "apps/admin-portal/src/b.jsx"];
    assert.equal(classifyChanges(paths, "website").touchesSurface, true);
    assert.equal(classifyChanges(paths, "portal").touchesSurface, true);
    assert.equal(
      classifyChanges(["apps/website/src/a.tsx"], "portal").touchesSurface,
      false
    );
  });

  it("matches an exact file entry without prefix-matching a sibling", () => {
    // `firebase.json` is an exact entry; `firebase.json.bak` must not match it.
    assert.equal(
      classifyChanges(["firebase.json.bak"], "website").touchesBackend,
      false
    );
    assert.equal(
      classifyChanges(["firebase.json"], "website").touchesBackend,
      true
    );
  });

  it("rejects an unknown surface", () => {
    assert.throws(() => classifyChanges([], "mobile"), /Unknown surface/);
  });

  it("tolerates an empty or missing change list", () => {
    assert.equal(classifyChanges([], "website").touchesSurface, false);
    assert.equal(classifyChanges(null, "website").touchesSurface, false);
  });
});

void OTHER_SHA;
