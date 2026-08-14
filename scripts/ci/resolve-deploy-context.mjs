#!/usr/bin/env node

/**
 * Decides which commit a production deploy runs against, and whether it should
 * run at all.
 *
 * Two triggers reach the frontend deployment workflows:
 *
 * - `workflow_dispatch` — a human typed the confirmation. The commit is the
 *   supplied SHA and the deploy always proceeds; no path gating, because the
 *   human asked for it explicitly.
 * - `workflow_run` — "Validate platform" finished on `main`. The commit is that
 *   run's head SHA, and the deploy only proceeds if this surface's own source
 *   actually changed.
 *
 * Keeping this in a tested module rather than branching bash across two
 * workflow files is deliberate: the guards below are the only thing standing
 * between a fork's pull request and a production deploy.
 */

const REPOSITORY = "tsowmi03/tenacity-platform";

/**
 * Paths whose contents end up in a deployed frontend artifact.
 *
 * Deliberately narrower than `detect-changes.mjs`, which answers a different
 * question. That module maps `.github/workflows/` and `scripts/ci/` to *every*
 * area so CI revalidates everything when the pipeline changes — correct for
 * validation, wrong here, where it would redeploy both frontends on every
 * workflow or docs edit.
 */
const DEPLOY_PATHS = {
  website: ["apps/website/"],
  portal: ["apps/admin-portal/"],
  resource_portal: ["apps/resource-portal/"],
};

/**
 * A change to any of these can alter what a frontend talks to, so a frontend
 * must not be auto-deployed in the same merge — the backend has to go first,
 * in order, through the orchestrator.
 */
const BACKEND_PATHS = [
  "backend/firebase/functions/",
  "backend/firebase/rules/",
  "backend/firebase/indexes/",
  "backend/firebase/deployment-targets.json",
  "firebase.json",
  ".firebaserc",
];

function startsWithAny(path, prefixes) {
  return prefixes.some((prefix) =>
    prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix
  );
}

/** Documentation-only edits under a deployable path do not change the build. */
function isDocOnly(path) {
  return path.endsWith(".md") || path.includes("/docs/");
}

export function classifyChanges(changedPaths, surface) {
  const paths = (changedPaths ?? []).filter(Boolean);
  const own = DEPLOY_PATHS[surface];
  if (!own) throw new Error(`Unknown surface: ${surface}`);

  const touchesSurface = paths.some(
    (path) => startsWithAny(path, own) && !isDocOnly(path)
  );
  const touchesBackend = paths.some((path) => startsWithAny(path, BACKEND_PATHS));

  return { touchesSurface, touchesBackend };
}

/**
 * @returns {{sha: string, trigger: string, deploy: boolean, reason: string}}
 * @throws if the event is not one this workflow may act on.
 */
export function resolveDeployContext({
  eventName,
  surface,
  inputs = {},
  workflowRun = null,
  repository = REPOSITORY,
  changedPaths = null,
}) {
  if (repository !== REPOSITORY) {
    throw new Error(`Refusing to deploy from ${repository}.`);
  }

  if (eventName === "workflow_dispatch") {
    const sha = String(inputs.git_sha ?? "");
    if (!/^[0-9a-f]{40}$/.test(sha)) {
      throw new Error("git_sha must be a full 40-character commit SHA.");
    }
    return {
      sha,
      trigger: "dispatch",
      deploy: true,
      reason: "Dispatched explicitly.",
    };
  }

  if (eventName !== "workflow_run") {
    throw new Error(`Unsupported trigger: ${eventName}.`);
  }

  if (!workflowRun) throw new Error("workflow_run payload missing.");

  const sha = String(workflowRun.head_sha ?? "");

  // `types: [completed]` fires for failures and cancellations too. Not
  // deploying is the correct outcome, not an error — throwing here would paint
  // a red deploy run next to every red validation run.
  if (workflowRun.conclusion !== "success") {
    return {
      sha,
      trigger: "auto",
      deploy: false,
      reason: `Validation concluded '${workflowRun.conclusion}', not success.`,
    };
  }

  if (workflowRun.head_branch !== "main") {
    throw new Error(`Validation ran on '${workflowRun.head_branch}', not main.`);
  }
  // A fork's pull request can make "Validate platform" succeed, but its head
  // repository is not this one. Without this the fork's code would deploy.
  const headRepo = workflowRun.head_repository?.full_name;
  if (headRepo !== REPOSITORY) {
    throw new Error(`Validation head repository was '${headRepo}'.`);
  }

  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error("workflow_run head_sha is not a full commit SHA.");
  }

  const { touchesSurface, touchesBackend } = classifyChanges(
    changedPaths,
    surface
  );

  if (!touchesSurface) {
    return {
      sha,
      trigger: "auto",
      deploy: false,
      reason: `No ${surface} source changed in this commit.`,
    };
  }
  if (touchesBackend) {
    return {
      sha,
      trigger: "auto",
      deploy: false,
      reason:
        `Backend changed alongside ${surface}. Auto-deploy is skipped so the ` +
        "frontend cannot go live against rules or Functions that have not " +
        "deployed yet — dispatch the production orchestrator instead.",
    };
  }
  return {
    sha,
    trigger: "auto",
    deploy: true,
    reason: `${surface} source changed and no backend change accompanies it.`,
  };
}

function main() {
  // Everything arrives through the environment. A workflow_run payload is
  // attacker-influenced JSON (branch names, repository names), so it must never
  // be interpolated into a shell argument list.
  const workflowRunRaw = process.env.WORKFLOW_RUN_JSON ?? "";
  const changedRaw = process.env.CHANGED_PATHS ?? "";

  const context = resolveDeployContext({
    eventName: process.env.GITHUB_EVENT_NAME,
    surface: process.env.SURFACE,
    inputs: { git_sha: process.env.INPUT_GIT_SHA },
    workflowRun:
      workflowRunRaw && workflowRunRaw !== "null"
        ? JSON.parse(workflowRunRaw)
        : null,
    repository: process.env.GITHUB_REPOSITORY,
    changedPaths: changedRaw.split("\n").map((line) => line.trim()),
  });

  const out = [
    `sha=${context.sha}`,
    `trigger=${context.trigger}`,
    `deploy=${context.deploy}`,
    `reason=${context.reason}`,
  ].join("\n");
  process.stdout.write(`${out}\n`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    main();
  } catch (error) {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  }
}
