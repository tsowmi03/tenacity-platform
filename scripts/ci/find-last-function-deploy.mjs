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

// A job called from the orchestrator is reported as "Functions / <job name>".
export function isSuccessfulDeployJob(job) {
  return (
    job.conclusion === "success" &&
    (job.name === deployJobName || job.name.endsWith(` / ${deployJobName}`))
  );
}

export async function findLastFunctionDeploy({ repository, fetchJson, runsPerWorkflow = 50 }) {
  const candidates = [];
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
    }
  }
  candidates.sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));
  return candidates[0] ?? null;
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
    console.error("No successful Functions deploy found in recent runs.");
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
