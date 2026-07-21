import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  compareExternalInventoryUnchanged,
  compareLiveInventory,
  expectedLiveInventory,
  functionDeploySelectors,
  hashManagedMetadata,
  hashManagedNames,
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
  it("contains the approved 83-name source hash", () => {
    validateInventoryPolicy(policy);
    assert.equal(policy.managed.names.length, 83);
    assert.equal(
      hashManagedNames(policy.managed.names),
      "0c873f43bf336f4f96283c35d34177fd851132c5f226503d55d6ed2a991c4c20"
    );
    assert.equal(
      hashManagedMetadata(policy),
      policy.managed.metadataHashSha256
    );
  });

  it("rejects malformed managed metadata", () => {
    const malformed = structuredClone(policy);
    malformed.managed.metadataDefaults.runtime = "nodejs99";
    assert.throws(
      () => validateInventoryPolicy(malformed),
      /metadata defaults changed/
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
    assert.equal(compareLiveInventory(policy, { result: live }).length, 87);
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

  it("builds explicit, bounded deployment selectors", () => {
    const selectors = functionDeploySelectors(policy, 10);
    assert.equal(selectors.length, 9);
    assert.equal(selectors.flatMap((selector) => selector.split(",")).length, 83);
    assert.equal(
      selectors.every((selector) =>
        selector.split(",").every((item) => item.startsWith("functions:default:"))
      ),
      true
    );
  });
});
