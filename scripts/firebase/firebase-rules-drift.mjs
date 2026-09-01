#!/usr/bin/env node
/**
 * Report whether a Firebase project's live rules match the repository.
 *
 * Read-only. It mints a `firebase.readonly` token, reads the live releases and
 * rulesets through the Rules API, and compares the deployed source against the
 * files `firebase.json` points at. It never deploys, and it never writes to the
 * project - drift is reported, not corrected.
 *
 * The comparison itself is `firebase-rules-state.mjs` capture and verify, the
 * same pair the production deploy uses for its before/after evidence, so the
 * check and the deploy can never disagree about what "matches" means.
 *
 * Exits `RULES_DRIFT_EXIT_CODE` when drift is found, so a caller can tell a
 * project that has drifted from a check that could not run.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  captureRulesSnapshot,
  findMissingRulesReleases,
  loadRulesConfiguration,
  resolveRulesTargetInputs,
  rulesSurfaceNames,
  verifyRulesSnapshotAgainstLocal,
} from "./firebase-rules-state.mjs";
import { accessTokenFromEnvironment, getAccessToken } from "./google-api.mjs";

export const RULES_DRIFT_EXIT_CODE = 20;

const reportKind = "tenacity.firebase-rules-drift-report";
const reportSchemaVersion = 1;
const firebaseReadonlyScope = "https://www.googleapis.com/auth/firebase.readonly";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function surfaceState(entry) {
  if (!entry.contentMatches) return "content-drift";
  if (!entry.nameMatches) return "source-name-drift";
  return "in-sync";
}

/**
 * Compare every rules surface of one project against the repository.
 *
 * Surfaces are probed before capture because a surface that has never been
 * released answers 404, which would otherwise abort the capture and leave the
 * other surface unreported. Staging is in exactly that state: its Storage
 * rules have never been deployed.
 */
export async function checkRulesDrift({
  target,
  projectId,
  storageBucket,
  accessToken,
  fetchImpl = globalThis.fetch,
  repositoryRoot = undefined,
  now = () => Date.now(),
} = {}) {
  assert(typeof target === "string" && target.length > 0, "A deployment target name is required.");
  const configuration =
    repositoryRoot === undefined ? loadRulesConfiguration() : loadRulesConfiguration(repositoryRoot);
  const missingSurfaces = await findMissingRulesReleases({
    projectId,
    storageBucket,
    accessToken,
    fetchImpl,
  });
  const releasedSurfaces = rulesSurfaceNames.filter((surface) => !missingSurfaces.includes(surface));

  let verification = null;
  let snapshot = null;
  if (releasedSurfaces.length > 0) {
    snapshot = await captureRulesSnapshot({
      projectId,
      storageBucket,
      accessToken,
      fetchImpl,
      now,
      surfaces: releasedSurfaces,
    });
    // Both requirements are relaxed to false so a mismatch is returned as a
    // finding rather than thrown: this check reports on drift, so drift is its
    // expected output, not an error.
    verification = verifyRulesSnapshotAgainstLocal(snapshot, {
      ...(repositoryRoot === undefined ? {} : { repositoryRoot }),
      projectId,
      storageBucket,
      surfaces: releasedSurfaces,
      requireConfiguredSourceNames: false,
      requireMatchingContent: false,
    });
  }

  const surfaces = {};
  for (const surface of rulesSurfaceNames) {
    const local = configuration.localSources[surface];
    if (missingSurfaces.includes(surface)) {
      surfaces[surface] = {
        state: "never-released",
        rulesetName: null,
        releaseUpdateTime: null,
        configuredName: local.name,
        capturedName: null,
        liveContentSha256: null,
        localContentSha256: sha256(local.content),
      };
      continue;
    }
    const entry = verification.surfaces[surface];
    surfaces[surface] = {
      state: surfaceState(entry),
      rulesetName: snapshot.releases[surface].release.rulesetName,
      releaseUpdateTime: snapshot.releases[surface].release.updateTime,
      configuredName: entry.configuredName,
      capturedName: entry.capturedName,
      liveContentSha256: entry.contentSha256,
      localContentSha256: sha256(local.content),
    };
  }

  const driftedSurfaces = rulesSurfaceNames.filter(
    (surface) => surfaces[surface].state !== "in-sync"
  );
  return {
    kind: reportKind,
    schemaVersion: reportSchemaVersion,
    target,
    projectId,
    storageBucket,
    checkedAt: new Date(now()).toISOString(),
    inSync: driftedSurfaces.length === 0,
    driftedSurfaces,
    surfaces,
  };
}

// What drift means, and where to go about it, differs by target: staging
// misleads whoever is testing there, production is serving rules nobody
// reviewed. A summary that says "staging" to a production operator sends them
// to the wrong runbook.
const targetGuidance = {
  staging: {
    runbook: "docs/operations/mobile-staging-environment.md",
    consequence:
      "Nothing tested against staging can be trusted until the rules are deployed — a client " +
      "writing a field the deployed rules do not allow has its whole write denied, silently.",
  },
  production: {
    runbook: "docs/operations/production-deployment-controls.md",
    consequence:
      "Production is serving rules that are not the reviewed ones. Deploy the repository rules " +
      "through the production workflow, or roll back to the ruleset that was reviewed.",
  },
};

function guidanceFor(target) {
  return (
    targetGuidance[target] ?? {
      runbook: null,
      consequence: "The deployed rules are not the ones in the repository.",
    }
  );
}

const stateDescriptions = {
  "in-sync": "matches the repository",
  "content-drift": "deployed source differs from the repository",
  "source-name-drift": "deployed under a different source file name",
  "never-released": "never released to this project",
};

function shortSha(value) {
  return value === null ? "—" : `\`${value.slice(0, 12)}…\``;
}

export function formatDriftSummary(report) {
  const guidance = guidanceFor(report.target);
  const heading = `### Firebase rules — ${report.target} (\`${report.projectId}\`)`;
  const verdict = report.inSync
    ? "**In sync.** Every rules surface matches the repository."
    : `**Drift detected** on ${report.driftedSurfaces.join(", ")}. ${guidance.consequence}`;
  const rows = rulesSurfaceNames.map((surface) => {
    const entry = report.surfaces[surface];
    return `| ${surface} | ${stateDescriptions[entry.state]} | ${
      entry.rulesetName === null ? "—" : `\`${entry.rulesetName.split("/").pop()}\``
    } | ${entry.releaseUpdateTime ?? "—"} | ${shortSha(entry.liveContentSha256)} | ${shortSha(
      entry.localContentSha256
    )} |`;
  });
  return [
    heading,
    "",
    verdict,
    "",
    "| Surface | State | Live ruleset | Released | Live source | Repository source |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
    guidance.runbook === null
      ? `Checked at ${report.checkedAt}.`
      : `Checked at ${report.checkedAt} — see \`${guidance.runbook}\`.`,
    "",
  ].join("\n");
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  assert(args.indexOf(flag) === args.lastIndexOf(flag), `${flag} may be provided only once.`);
  const value = args[index + 1];
  assert(typeof value === "string" && !value.startsWith("--"), `${flag} requires a value.`);
  return value;
}

function assertKnownArguments(args, valueFlags) {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    assert(argument.startsWith("--") && valueFlags.includes(argument), `Unknown argument: ${argument}.`);
    index += 1;
  }
}

function writeFileWithParents(path, contents) {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents, { encoding: "utf8", mode: 0o600 });
}

async function resolveAccessToken(args) {
  const federatedToken = accessTokenFromEnvironment();
  if (federatedToken !== null) return federatedToken;
  const path = argumentValue(args, "--credentials") ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  assert(path, "Provide GOOGLE_OAUTH_ACCESS_TOKEN, --credentials, or GOOGLE_APPLICATION_CREDENTIALS.");
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch {
    throw new Error(`Could not read service-account credentials ${path}.`);
  }
  return getAccessToken({ serviceAccount, scopes: [firebaseReadonlyScope] });
}

async function main() {
  const args = process.argv.slice(2);
  const valueFlags = ["--target", "--project", "--storage-bucket", "--credentials", "--report", "--summary"];
  assertKnownArguments(args, valueFlags);
  const { targetName, projectId, storageBucket } = resolveRulesTargetInputs(args);
  const accessToken = await resolveAccessToken(args);

  const report = await checkRulesDrift({
    target: targetName,
    projectId,
    storageBucket,
    accessToken,
  });
  const summary = formatDriftSummary(report);

  const reportPath = argumentValue(args, "--report");
  if (reportPath) writeFileWithParents(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const summaryPath = argumentValue(args, "--summary");
  if (summaryPath) writeFileWithParents(summaryPath, summary);

  console.log(JSON.stringify(report));
  console.error(summary);
  if (!report.inSync) process.exitCode = RULES_DRIFT_EXIT_CODE;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
