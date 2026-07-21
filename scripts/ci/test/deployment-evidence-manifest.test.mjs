import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import {
  createEvidenceManifest,
  runCli,
  verifyEvidenceManifest,
} from "../../firebase/deployment-evidence-manifest.mjs";

const workingDirectory = mkdtempSync(join(tmpdir(), "tenacity-evidence-test-"));

after(() => rmSync(workingDirectory, { recursive: true, force: true }));

const target = {
  targetName: "production",
  projectId: "tenacity-tutoring-b8eb2",
  storageBucket: "tenacity-tutoring-b8eb2.firebasestorage.app",
  databaseId: "(default)",
};

const run = {
  gitSha: "a".repeat(40),
  runId: "12345",
  runAttempt: "2",
  repository: "tsowmi03/tenacity-platform",
};

describe("Firebase deployment evidence manifest", () => {
  it("records exact run metadata, outcomes, file presence, and hashes", () => {
    const deployLog = join(workingDirectory, "rules-deploy.log");
    writeFileSync(deployLog, "deployment output\n");
    const manifest = createEvidenceManifest(
      {
        evidenceType: "firebase-rules-deployment",
        ...target,
        ...run,
        workflow: "Deploy Firebase rules to production",
        job: "deploy",
        outcomes: { deploy: "success", readback: "success" },
        evidenceFiles: {
          deployLog,
          missingStatus: join(workingDirectory, "missing.json"),
        },
      },
      { now: () => new Date("2026-07-21T03:00:00.000Z") }
    );

    assert.equal(manifest.generatedAt, "2026-07-21T03:00:00.000Z");
    assert.equal(manifest.runId, 12345);
    assert.equal(manifest.runAttempt, 2);
    assert.deepEqual(manifest.target, {
      name: "production",
      projectId: target.projectId,
      storageBucket: target.storageBucket,
      databaseId: target.databaseId,
    });
    assert.deepEqual(manifest.files.deployLog, {
      path: "rules-deploy.log",
      present: true,
      bytes: 18,
      sha256: createHash("sha256").update("deployment output\n").digest("hex"),
    });
    assert.deepEqual(manifest.files.missingStatus, {
      path: "missing.json",
      present: false,
      bytes: null,
      sha256: null,
    });
  });

  it("verifies provenance, required outcomes, and every recorded file hash", () => {
    const rulesBefore = join(workingDirectory, "rules-before.json");
    writeFileSync(rulesBefore, '{"snapshotDigest":"before"}\n');
    const manifest = createEvidenceManifest({
      evidenceType: "firebase-rules-deployment",
      ...target,
      ...run,
      workflow: "Deploy Firebase rules to production",
      job: "deploy",
      outcomes: { deploy: "success", captureAfter: "success" },
      evidenceFiles: { rulesBefore },
    });

    assert.deepEqual(
      verifyEvidenceManifest(manifest, {
        artifactDirectory: workingDirectory,
        evidenceType: "firebase-rules-deployment",
        ...target,
        ...run,
        requiredFiles: ["rulesBefore"],
        requiredOutcomes: { deploy: "success", captureAfter: "success" },
      }),
      {
        valid: true,
        evidenceType: "firebase-rules-deployment",
        gitSha: run.gitSha,
        runId: 12345,
        runAttempt: 2,
        verifiedFiles: 1,
      }
    );

    writeFileSync(rulesBefore, '{"snapshotDigest":"tampered"}\n');
    assert.throws(
      () =>
        verifyEvidenceManifest(manifest, {
          artifactDirectory: workingDirectory,
          evidenceType: "firebase-rules-deployment",
          ...target,
          ...run,
          requiredFiles: ["rulesBefore"],
          requiredOutcomes: { deploy: "success" },
        }),
      /size does not match|hash does not match/
    );
  });

  it("rejects incomplete or mismatched deployment provenance", () => {
    const emptyLog = join(workingDirectory, "empty-deploy.log");
    writeFileSync(emptyLog, "");
    const manifest = createEvidenceManifest({
      evidenceType: "firebase-index-deployment",
      ...target,
      ...run,
      workflow: "Deploy Firestore indexes to production",
      job: "deploy",
      outcomes: { deploy: "failure", readback: "skipped" },
      evidenceFiles: { deployLog: emptyLog },
    });
    const options = {
      artifactDirectory: workingDirectory,
      evidenceType: "firebase-index-deployment",
      ...target,
      ...run,
      requiredFiles: ["deployLog", "readback"],
      requiredOutcomes: { deploy: "success" },
    };
    assert.throws(() => verifyEvidenceManifest(manifest, options), /outcome deploy does not match/);
    assert.throws(
      () => verifyEvidenceManifest(manifest, { ...options, requiredOutcomes: {}, runAttempt: "3" }),
      /run attempt does not match/
    );
  });

  it("accepts only an explicitly allowed deployment outcome set", () => {
    const deployLog = join(workingDirectory, "failed-deploy.log");
    writeFileSync(deployLog, "partial failure\n");
    const manifest = createEvidenceManifest({
      evidenceType: "firebase-rules-deployment",
      ...target,
      ...run,
      workflow: "Deploy Firebase rules to production",
      job: "deploy",
      outcomes: { deploy: "failure", captureAfter: "success" },
      evidenceFiles: { deployLog },
    });
    const options = {
      artifactDirectory: workingDirectory,
      evidenceType: "firebase-rules-deployment",
      ...target,
      ...run,
      requiredFiles: ["deployLog"],
      requiredOutcomes: { captureAfter: "success" },
      allowedOutcomeSets: { deploy: ["success", "failure"] },
    };
    assert.equal(verifyEvidenceManifest(manifest, options).valid, true);
    assert.throws(
      () => verifyEvidenceManifest(manifest, { ...options, allowedOutcomeSets: { deploy: ["success"] } }),
      /outcome deploy is not allowed/
    );
  });

  it("creates and verifies a manifest through the CLI contract", () => {
    const deployLog = join(workingDirectory, "cli-deploy.log");
    const manifestPath = join(workingDirectory, "cli-manifest.json");
    writeFileSync(deployLog, "ok\n");
    runCli([
      "create",
      "--type",
      "firebase-rules-deployment",
      "--target",
      target.targetName,
      "--project",
      target.projectId,
      "--storage-bucket",
      target.storageBucket,
      "--database",
      target.databaseId,
      "--git-sha",
      run.gitSha,
      "--run-id",
      run.runId,
      "--run-attempt",
      run.runAttempt,
      "--repository",
      run.repository,
      "--workflow",
      "Rules deployment",
      "--job",
      "deploy",
      "--outcome",
      "deploy=success",
      "--file",
      `deployLog=${deployLog}`,
      "--output",
      manifestPath,
    ]);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.files.deployLog.present, true);
    assert.throws(
      () =>
        runCli([
          "create",
          "--type",
          "firebase-rules-deployment",
          "--target",
          target.targetName,
          "--project",
          target.projectId,
          "--storage-bucket",
          target.storageBucket,
          "--database",
          target.databaseId,
          "--git-sha",
          run.gitSha,
          "--run-id",
          run.runId,
          "--run-attempt",
          run.runAttempt,
          "--repository",
          run.repository,
          "--workflow",
          "Rules deployment",
          "--job",
          "deploy",
          "--outcome",
          "deploy=success",
          "--file",
          `deployLog=${deployLog}`,
          "--output",
          manifestPath,
        ]),
      /file already exists/
    );
    assert.throws(
      () => runCli(["create", "--unknown", "value"]),
      /Unknown argument --unknown/
    );
  });

  it("rejects duplicate artifact basenames", () => {
    const first = join(workingDirectory, "first", "same.log");
    const second = join(workingDirectory, "second", "same.log");
    assert.throws(
      () =>
        createEvidenceManifest({
          evidenceType: "firebase-rules-deployment",
          ...target,
          ...run,
          workflow: "Rules deployment",
          job: "deploy",
          outcomes: { deploy: "success" },
          evidenceFiles: { first, second },
        }),
      /path same\.log is duplicated/
    );
  });
});
