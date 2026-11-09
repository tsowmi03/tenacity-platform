#!/usr/bin/env node

// Prints the commit of the last Functions deploy that succeeded, or nothing.
//
// Scoped deploys compare against this commit, so it has to be a fact about what
// production actually received. GitHub's own job history is the record: only a
// workflow run can write it, and it covers both routes into production, the
// direct dispatch and the orchestrator calling the same workflow.
//
// Every failure here means a full deploy, never a narrower one. The caller
// treats no output and a non-zero exit the same way.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const deployWorkflows = ["firebase-functions-production.yml", "production-deploy.yml"];
const deployJobName = "Authorized Function deployment";
export const deployStepName = "Deploy reviewed Functions in bounded batches";

// A job called from the orchestrator is reported as "Functions / <job name>".
function isDeployJob(job) {
  return job.name === deployJobName || job.name.endsWith(` / ${deployJobName}`);
}

export function isSuccessfulDeployJob(job) {
  return job.conclusion === "success" && isDeployJob(job);
}

/**
 * A deploy that ended badly after its batches began may have left production
 * partly updated, and a later revert would hide that from any diff. Assumed
 * partial unless the deploy step is known not to have run.
 */
export function mayHavePartlyDeployed(job) {
  if (!isDeployJob(job)) return false;
  if (job.conclusion === null || ["success", "skipped"].includes(job.conclusion)) return false;
  const step = job.steps?.find((candidate) => candidate.name === deployStepName);
  return !step || !["skipped", null].includes(step.conclusion);
}

export async function findLastFunctionDeploy({ repository, fetchJson, runsPerWorkflow = 50 }) {
  const candidates = [];
  const partial = [];
  for (const workflow of deployWorkflows) {
    const { workflow_runs: runs } = await fetchJson(
      `/repos/${repository}/actions/workflows/${workflow}/runs?branch=main&per_page=${runsPerWorkflow}`
    );
    // Newest first, so the first run that shipped Functions is this workflow's
    // latest. Orchestrator runs that skipped the Functions surface fall through.
    for (const run of runs) {
      const { jobs } = await fetchJson(
        `/repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`
      );
      const job = jobs.find(isSuccessfulDeployJob);
      if (job) {
        candidates.push({ sha: run.head_sha, completedAt: job.completed_at, runId: run.id });
        break;
      }
      partial.push(...jobs.filter(mayHavePartlyDeployed));
    }
  }
  candidates.sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));
  const last = candidates[0];
  if (!last) return null;
  // Written so that a job with no usable end time counts as newer.
  const lastTime = Date.parse(last.completedAt);
  if (partial.some((job) => !(Date.parse(job.completed_at) <= lastTime))) {
    console.error("A Functions deploy after the last successful one may have shipped partway.");
    return null;
  }
  return last;
}

async function main() {
  const { GH_TOKEN: token, GITHUB_REPOSITORY: repository } = process.env;
  if (!token || !repository) throw new Error("GH_TOKEN and GITHUB_REPOSITORY are required.");
  const apiUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const fetchJson = async (path) => {
    const response = await fetch(`${apiUrl}${path}`, {
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`GitHub API ${response.status} for ${path}`);
    return response.json();
  };
  const last = await findLastFunctionDeploy({ repository, fetchJson });
  if (!last) {
    console.error("No usable Functions deploy found in recent runs.");
    return;
  }
  console.error(`Last successful Functions deploy: run ${last.runId} at ${last.completedAt}.`);
  console.log(last.sha);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  });
}
