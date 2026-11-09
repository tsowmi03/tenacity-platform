import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readFileSync } from "node:fs";

import {
  deployStepName,
  findLastFunctionDeploy,
  isSuccessfulDeployJob,
  mayHavePartlyDeployed,
} from "../find-last-function-deploy.mjs";

const job = (name, conclusion, completed_at = "2026-11-09T02:00:00Z") => ({
  name,
  conclusion,
  completed_at,
});

// Serves workflow runs and each run's jobs the way the Actions API does.
function fakeApi({ direct = [], orchestrated = [] }) {
  const jobsByRun = new Map([...direct, ...orchestrated].map((run) => [run.id, run.jobs]));
  return async (path) => {
    if (path.includes("/workflows/firebase-functions-production.yml/runs")) {
      return { workflow_runs: direct };
    }
    if (path.includes("/workflows/production-deploy.yml/runs")) {
      return { workflow_runs: orchestrated };
    }
    return { jobs: jobsByRun.get(Number(path.match(/runs\/(\d+)\/jobs/)[1])) };
  };
}

const find = (runs) =>
  findLastFunctionDeploy({ repository: "owner/repo", fetchJson: fakeApi(runs) });

describe("isSuccessfulDeployJob", () => {
  it("recognises the job on both routes into production", () => {
    assert.ok(isSuccessfulDeployJob(job("Authorized Function deployment", "success")));
    assert.ok(isSuccessfulDeployJob(job("Functions / Authorized Function deployment", "success")));
  });

  it("rejects a failed, skipped or differently named job", () => {
    assert.ok(!isSuccessfulDeployJob(job("Authorized Function deployment", "failure")));
    assert.ok(!isSuccessfulDeployJob(job("Functions / Authorized Function deployment", "skipped")));
    assert.ok(!isSuccessfulDeployJob(job("Validate exact Function source", "success")));
  });
});

describe("mayHavePartlyDeployed", () => {
  const name = "Authorized Function deployment";

  it("ignores a job that succeeded, was skipped or is still running", () => {
    assert.ok(!mayHavePartlyDeployed(job(name, "success")));
    assert.ok(!mayHavePartlyDeployed(job(name, "skipped")));
    assert.ok(!mayHavePartlyDeployed(job(name, null)));
  });

  it("assumes partial when it cannot see the deploy step", () => {
    assert.ok(mayHavePartlyDeployed(job(name, "failure")));
  });

  it("names a step that exists in the workflow", () => {
    const workflow = readFileSync(".github/workflows/firebase-functions-production.yml", "utf8");
    assert.ok(workflow.includes(`- name: ${deployStepName}`));
  });
});

describe("findLastFunctionDeploy", () => {
  const name = "Authorized Function deployment";
  const withDeployStep = (base, conclusion) => ({
    ...base,
    steps: [{ name: deployStepName, conclusion }],
  });

  it("skips a deploy that failed before shipping anything", async () => {
    const result = await find({
      direct: [
        { id: 2, head_sha: "new", jobs: [withDeployStep(job(name, "failure", "2026-11-09T03:00:00Z"), "skipped")] },
        { id: 1, head_sha: "old", jobs: [job(name, "success")] },
      ],
    });
    assert.equal(result.sha, "old");
  });

  // A failed deploy can leave a Function on newer code, and a later revert
  // removes that file from the diff against the last good deploy.
  it("reports nothing after a deploy that may have shipped partway", async () => {
    const result = await find({
      direct: [
        { id: 2, head_sha: "new", jobs: [withDeployStep(job(name, "failure", "2026-11-09T03:00:00Z"), "failure")] },
        { id: 1, head_sha: "old", jobs: [job(name, "success")] },
      ],
    });
    assert.equal(result, null);
  });

  it("sees a partial deploy on the other route into production", async () => {
    const result = await find({
      direct: [{ id: 1, head_sha: "old", jobs: [job(name, "success", "2026-11-09T02:00:00Z")] }],
      orchestrated: [
        { id: 2, head_sha: "new", jobs: [withDeployStep(job(`Functions / ${name}`, "cancelled", "2026-11-09T03:00:00Z"), "cancelled")] },
      ],
    });
    assert.equal(result, null);
  });

  it("trusts a successful deploy made after the partial one", async () => {
    const result = await find({
      direct: [{ id: 3, head_sha: "full", jobs: [job(name, "success", "2026-11-09T04:00:00Z")] }],
      orchestrated: [
        { id: 2, head_sha: "new", jobs: [withDeployStep(job(`Functions / ${name}`, "failure", "2026-11-09T03:00:00Z"), "failure")] },
      ],
    });
    assert.equal(result.sha, "full");
  });

  it("passes over an orchestrator run that skipped the Functions surface", async () => {
    const result = await find({
      orchestrated: [
        { id: 2, head_sha: "web", jobs: [job("Functions / Authorized Function deployment", "skipped")] },
        { id: 1, head_sha: "fn", jobs: [job("Functions / Authorized Function deployment", "success")] },
      ],
    });
    assert.equal(result.sha, "fn");
  });

  it("takes whichever route deployed most recently", async () => {
    const result = await find({
      direct: [
        { id: 1, head_sha: "earlier", jobs: [job("Authorized Function deployment", "success", "2026-11-08T00:00:00Z")] },
      ],
      orchestrated: [
        { id: 2, head_sha: "later", jobs: [job("Functions / Authorized Function deployment", "success", "2026-11-09T00:00:00Z")] },
      ],
    });
    assert.equal(result.sha, "later");
  });

  it("reports nothing when no deploy succeeded, which forces a full deploy", async () => {
    assert.equal(await find({}), null);
  });
});
