import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findLastFunctionDeploy,
  isSuccessfulDeployJob,
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

describe("findLastFunctionDeploy", () => {
  it("skips a failed deploy, so its changes are still covered next time", async () => {
    const result = await find({
      direct: [
        { id: 2, head_sha: "new", jobs: [job("Authorized Function deployment", "failure")] },
        { id: 1, head_sha: "old", jobs: [job("Authorized Function deployment", "success")] },
      ],
    });
    assert.equal(result.sha, "old");
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
