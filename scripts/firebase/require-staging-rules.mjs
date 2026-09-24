#!/usr/bin/env node
/**
 * Refuse a production rules deploy that staging is not already serving.
 *
 * Reads the drift report the staging sync workflow
 * (`firebase-rules-staging-sync.yml`) leaves behind after it deploys and
 * verifies staging, and requires that every surface was in sync and that the
 * live source staging reported is byte-identical to the rules about to go to
 * production.
 *
 * It works from that evidence rather than reading staging directly because a
 * production workflow must never hold, or even name, a staging identity. The
 * report is the output of `firebase-rules-drift.mjs`, captured by the staging
 * Rules identity straight after its deploy, so the comparison is against what
 * staging served, not against what a commit said it would serve.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getFirebaseDeploymentTarget } from "./firebase-targets.mjs";
import { loadRulesConfiguration, rulesSurfaceNames } from "./firebase-rules-state.mjs";

const reportKind = "tenacity.firebase-rules-drift-report";
const reportSchemaVersion = 1;
const syncWorkflowName = "Sync Firebase rules to staging";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function shortSha(value) {
  return typeof value === "string" ? `${value.slice(0, 12)}…` : "none";
}

/**
 * Throws, naming each surface that differs, unless the report shows staging
 * serving exactly the local rules. Returns the per-surface hashes it matched.
 */
export function assertStagingServesLocalRules(
  report,
  {
    configuration = loadRulesConfiguration(),
    stagingTarget = getFirebaseDeploymentTarget("staging"),
  } = {}
) {
  assert(
    report?.kind === reportKind && report?.schemaVersion === reportSchemaVersion,
    "Staging evidence is not a rules drift report."
  );
  assert(
    report.target === "staging" &&
      report.projectId === stagingTarget.projectId &&
      report.storageBucket === stagingTarget.storageBucket,
    "Staging evidence was not captured from the reviewed staging project."
  );

  const matched = {};
  const mismatches = [];
  for (const surface of rulesSurfaceNames) {
    const entry = report.surfaces?.[surface];
    const localSha256 = sha256(configuration.localSources[surface].content);
    if (entry?.state !== "in-sync" || entry.liveContentSha256 !== localSha256) {
      mismatches.push(
        `${surface} (staging ${shortSha(entry?.liveContentSha256)}, deploying ${shortSha(localSha256)})`
      );
      continue;
    }
    matched[surface] = localSha256;
  }
  assert(
    mismatches.length === 0,
    `Staging is not serving the rules being deployed: ${mismatches.join(", ")}. ` +
      `Run "${syncWorkflowName}" on main and wait for it to pass, then deploy again.`
  );
  return { checkedAt: report.checkedAt, surfaces: matched };
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  assert(typeof value === "string" && !value.startsWith("--"), `${flag} requires a value.`);
  return value;
}

function main() {
  const args = process.argv.slice(2);
  const reportPath = argumentValue(args, "--report");
  assert(reportPath, "Provide --report with the staging sync drift report.");
  assert(
    existsSync(resolve(reportPath)),
    `No staging sync evidence at ${reportPath}. Run "${syncWorkflowName}" on main first.`
  );
  const report = JSON.parse(readFileSync(resolve(reportPath), "utf8"));
  console.log(JSON.stringify(assertStagingServesLocalRules(report)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
