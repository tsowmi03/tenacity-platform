import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  compareExternalInventoryUnchanged,
  compareLiveInventory,
  compareLiveInventoryPreDeploy,
  expectedLiveInventory,
  functionDeploySelectors,
  hashManagedMetadata,
  hashManagedNames,
  inspectLocalExports,
  redactedLiveEvidence,
  redactLivePayload,
  validateInventoryPolicy,
} from "../check-functions-inventory.mjs";

const policy = JSON.parse(readFileSync("backend/firebase/inventory/production-functions.json", "utf8"));

function asFirebaseRecord(record) {
  return {
    id: record.id,
    project: policy.projectId,
    platform: record.platform,
    region: record.region,
    runtime: record.runtime,
    state: record.state,
    [`${record.triggerType}Trigger`]: {},
    labels: record.deploymentTool ? { "deployment-tool": record.deploymentTool } : {},
  };
}

describe("Function inventory policy", () => {
  it("is internally consistent and ties to production reality", () => {
    validateInventoryPolicy(policy);
    // The one structural fact worth asserting: this repository owns every
    // managed Function, and production additionally runs exactly four it does
    // not own (two legacy Xero, two extension-managed).
    assert.equal(
      expectedLiveInventory(policy).length,
      policy.managed.names.length +
        policy.protectedExternal.length +
        policy.extensionManaged.length
    );
    assert.equal(policy.protectedExternal.length + policy.extensionManaged.length, 4);
    // Counts and hashes are derived, not restated. Restating them meant one
    // added Function forced edits in six coordinated places, which had already
    // drifted in practice.
    assert.match(hashManagedNames(policy.managed.names), /^[0-9a-f]{64}$/);
    assert.match(hashManagedMetadata(policy), /^[0-9a-f]{64}$/);
  });

  it("rejects malformed managed metadata", () => {
    const malformed = structuredClone(policy);
    malformed.managed.metadataDefaults.runtime = "nodejs99";
    assert.throws(
      () => validateInventoryPolicy(malformed),
      /metadata defaults changed/
    );
  });

  it("rejects a policy that reintroduces the pending-addition window", () => {
    // The open/close ritual was removed. Reintroducing the field silently
    // would restore a control the pre-deploy comparison no longer honours.
    const malformed = structuredClone(policy);
    malformed.managed.allowedMissingBeforeDeploy = ["adminCreateClass"];
    assert.throws(
      () => validateInventoryPolicy(malformed),
      /allowedMissingBeforeDeploy was removed/
    );
  });

  it("rejects a policy for another project", () => {
    const malformed = structuredClone(policy);
    malformed.projectId = "some-other-project";
    assert.throws(
      () => validateInventoryPolicy(malformed),
      /must remain tenacity-tutoring-b8eb2/
    );
  });

  it("accepts an exact normalized live inventory", () => {
    const live = expectedLiveInventory(policy).map(asFirebaseRecord);
    assert.equal(
      compareLiveInventory(policy, { result: live }).length,
      expectedLiveInventory(policy).length
    );
  });

  it("pre-deploy reports a not-yet-live Function instead of failing", () => {
    // A Function deploying for the first time cannot be live yet. Naming it in
    // the policy used to be mandatory and was forgotten twice, each time
    // aborting a live window. It is now simply reported.
    const live = expectedLiveInventory(policy)
      .filter((record) => record.id !== "adminCreateClass")
      .map(asFirebaseRecord);
    const result = compareLiveInventoryPreDeploy(policy, { result: live });
    assert.equal(result.length, expectedLiveInventory(policy).length - 1);
    assert.deepEqual(result.pendingAdditions, ["adminCreateClass"]);
  });

  it("the strict comparison still rejects the same absence", () => {
    // The end state is unchanged: the post-batch check is strict, so a Function
    // that never went live still fails the run.
    const live = expectedLiveInventory(policy)
      .filter((record) => record.id !== "adminCreateClass")
      .map(asFirebaseRecord);
    assert.throws(
      () => compareLiveInventory(policy, { result: live }),
      /missing live Function: adminCreateClass/
    );
  });

  it("pre-deploy still rejects an unexpected live Function", () => {
    const live = expectedLiveInventory(policy).map(asFirebaseRecord);
    live.push(
      asFirebaseRecord({
        id: "somethingNobodyReviewed",
        platform: "gcfv2",
        region: "us-central1",
        runtime: "nodejs22",
        state: "ACTIVE",
        triggerType: "callable",
        deploymentTool: "cli-firebase",
      })
    );
    assert.throws(
      () => compareLiveInventoryPreDeploy(policy, { result: live }),
      /unexpected live Function: somethingNobodyReviewed/
    );
  });

  it("pre-deploy still rejects metadata drift on an existing Function", () => {
    const live = expectedLiveInventory(policy).map((record) =>
      asFirebaseRecord(
        record.id === "adminCreateClass"
          ? { ...record, runtime: "nodejs18" }
          : record
      )
    );
    assert.throws(
      () => compareLiveInventoryPreDeploy(policy, { result: live }),
      /adminCreateClass runtime: expected nodejs22, got nodejs18/
    );
  });

  it("rejects a missing protected legacy Function", () => {
    const live = expectedLiveInventory(policy)
      .filter((record) => record.id !== "generateXeroAuthUrl")
      .map(asFirebaseRecord);
    assert.throws(
      () => compareLiveInventory(policy, { result: live }),
      /missing live Function: generateXeroAuthUrl/
    );
  });

  it("rejects trigger drift", () => {
    const live = expectedLiveInventory(policy).map(asFirebaseRecord);
    const target = live.find((record) => record.id === "stripeWebhook");
    delete target.httpsTrigger;
    target.callableTrigger = {};
    assert.throws(() => compareLiveInventory(policy, { result: live }), /stripeWebhook triggerType/);
  });

  it("rejects a protected external Function changing during deployment", () => {
    const before = expectedLiveInventory(policy).map(asFirebaseRecord);
    const after = structuredClone(before);
    const target = after.find((record) => record.id === "xeroOAuthCallback");
    target.hash = "changed-source";
    assert.throws(
      () => compareExternalInventoryUnchanged(policy, { result: before }, { result: after }),
      /xeroOAuthCallback changed during deployment/
    );
  });

  it("rejects any external deployment configuration drift", () => {
    const before = expectedLiveInventory(policy).map(asFirebaseRecord);
    const after = structuredClone(before);
    const target = after.find((record) =>
      record.id.startsWith("ext-firestore-algolia-search-")
    );
    target.environmentVariables = { EXT_INSTANCE_ID: "changed" };
    assert.throws(
      () => compareExternalInventoryUnchanged(policy, { result: before }, { result: after }),
      /changed during deployment/
    );
  });

  it("rejects a live inventory from the wrong project", () => {
    const live = expectedLiveInventory(policy).map(asFirebaseRecord);
    live[0].project = "wrong-project";
    assert.throws(
      () => compareLiveInventory(policy, { result: live }),
      /wrong project/
    );
  });

  it("records live evidence without environment-variable values", () => {
    const live = expectedLiveInventory(policy).map(asFirebaseRecord);
    live[0].environmentVariables = { SAFE_NAME: "sensitive-value" };
    const evidence = redactedLiveEvidence(policy, { result: live });
    const target = evidence.find((record) => record.id === live[0].id);
    assert.deepEqual(target.environmentVariableNames, ["SAFE_NAME"]);
    assert.equal(JSON.stringify(evidence).includes("sensitive-value"), false);
    assert.match(target.recordSha256, /^[0-9a-f]{64}$/);
    live[0].project = "wrong-project";
    assert.equal(redactLivePayload({ result: live })[0].project, "wrong-project");
    delete live[0].id;
    const malformedEvidence = redactLivePayload({ result: live });
    assert.equal(malformedEvidence[0].id, null);
  });

  it("drops GOOGLE_APPLICATION_CREDENTIALS before loading the entry point", () => {
    // Regression: the deploy job exports an external_account (federated)
    // credential file that firebase-admin's file parser rejects at
    // admin.initializeApp() load time. Introspection must load the module with
    // that variable unset so a set-but-unparseable credential cannot break it.
    const dir = mkdtempSync(join(tmpdir(), "fn-inventory-"));
    const captureFile = join(dir, "capture.json");
    const policyPath = join(dir, "policy.json");
    const fixturePath = join(dir, "entry.cjs");
    writeFileSync(policyPath, JSON.stringify(policy));
    writeFileSync(
      fixturePath,
      [
        'const fs = require("fs");',
        "fs.writeFileSync(process.env.GAC_CAPTURE_FILE, JSON.stringify({",
        "  gac: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? null }));",
        'const p = JSON.parse(fs.readFileSync(process.env.FIXTURE_POLICY_PATH, "utf8"));',
        "const out = {};",
        "for (const n of p.managed.names) out[n] = { __endpoint: {} };",
        "for (const n of p.localHelperExports) out[n] = { helper: true };",
        "module.exports = out;",
      ].join("\n")
    );

    const prev = {
      gac: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      cap: process.env.GAC_CAPTURE_FILE,
      pol: process.env.FIXTURE_POLICY_PATH,
    };
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/nonexistent/external_account.json";
    process.env.GAC_CAPTURE_FILE = captureFile;
    process.env.FIXTURE_POLICY_PATH = policyPath;
    try {
      const result = inspectLocalExports(policy, fixturePath);
      assert.equal(
        result.exportNames.length,
        policy.managed.names.length + policy.localHelperExports.length
      );
      const captured = JSON.parse(readFileSync(captureFile, "utf8"));
      assert.equal(
        captured.gac,
        null,
        "entry point must load with GOOGLE_APPLICATION_CREDENTIALS unset"
      );
      assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
    } finally {
      for (const [key, value] of [
        ["GOOGLE_APPLICATION_CREDENTIALS", prev.gac],
        ["GAC_CAPTURE_FILE", prev.cap],
        ["FIXTURE_POLICY_PATH", prev.pol],
      ]) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("builds explicit, bounded deployment selectors", () => {
    const selectors = functionDeploySelectors(policy, 10);
    assert.equal(selectors.length, Math.ceil(policy.managed.names.length / 10));
    assert.equal(
      selectors.flatMap((selector) => selector.split(",")).length,
      policy.managed.names.length
    );
    assert.equal(
      selectors.every((selector) =>
        selector.split(",").every((item) => item.startsWith("functions:default:"))
      ),
      true
    );
  });
});
