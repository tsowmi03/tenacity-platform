#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getFirebaseDeploymentTarget } from "./firebase-targets.mjs";
import {
  accessTokenFromEnvironment,
  authorizedJsonRequest,
  getAccessToken,
} from "./google-api.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = resolve(scriptDir, "../..");
const rulesApiBaseUrl = "https://firebaserules.googleapis.com/v1";
const snapshotKind = "tenacity.firebase-rules-release-snapshot";
const snapshotSchemaVersion = 1;
const firebaseScope = "https://www.googleapis.com/auth/firebase";
const firebaseReadonlyScope = "https://www.googleapis.com/auth/firebase.readonly";
const surfaceDefinitions = {
  firestore: { service: "cloud.firestore" },
  storage: { service: "firebase.storage" },
};
const surfaceNames = Object.keys(surfaceDefinitions);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, keys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} has unexpected or missing fields.`);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, stableValue(value[key])])
  );
}

function stableString(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

export function validateProjectId(projectId) {
  assert(
    typeof projectId === "string" && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId),
    "Firebase project ID is invalid."
  );
  return projectId;
}

export function validateStorageBucket(storageBucket) {
  assert(
    typeof storageBucket === "string" &&
      storageBucket.length >= 3 &&
      storageBucket.length <= 222 &&
      /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(storageBucket) &&
      !storageBucket.includes(".."),
    "Firebase Storage bucket is invalid."
  );
  return storageBucket;
}

function releaseId(surface, storageBucket) {
  return surface === "firestore" ? "cloud.firestore" : `firebase.storage/${storageBucket}`;
}

export function expectedReleaseName(projectId, surface, storageBucket) {
  validateProjectId(projectId);
  assert(surfaceNames.includes(surface), `Unknown rules surface: ${String(surface)}.`);
  validateStorageBucket(storageBucket);
  return `projects/${projectId}/releases/${releaseId(surface, storageBucket)}`;
}

function encodeResourceName(resourceName) {
  return resourceName.split("/").map(encodeURIComponent).join("/");
}

function resourceUrl(resourceName) {
  return `${rulesApiBaseUrl}/${encodeResourceName(resourceName)}`;
}

function rulesetNamePattern(projectId) {
  return new RegExp(`^projects/${projectId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/rulesets/[A-Za-z0-9._-]+$`);
}

function normalizeRelease(payload, { projectId, releaseName }) {
  assert(payload && typeof payload === "object" && !Array.isArray(payload), "Rules API release response is invalid.");
  assert(payload.name === releaseName, `Rules API returned the wrong release: ${String(payload.name)}.`);
  assert(
    typeof payload.rulesetName === "string" && rulesetNamePattern(projectId).test(payload.rulesetName),
    `Release ${releaseName} refers to an invalid or cross-project ruleset.`
  );
  assert(isTimestamp(payload.createTime), `Release ${releaseName} has an invalid createTime.`);
  assert(isTimestamp(payload.updateTime), `Release ${releaseName} has an invalid updateTime.`);
  return {
    name: payload.name,
    rulesetName: payload.rulesetName,
    createTime: payload.createTime,
    updateTime: payload.updateTime,
  };
}

function normalizeSourceFiles(files, label) {
  assert(Array.isArray(files) && files.length > 0, `${label} must contain at least one source file.`);
  const normalized = files.map((file, index) => {
    assert(file && typeof file === "object" && !Array.isArray(file), `${label} file ${index} is invalid.`);
    assert(
      typeof file.name === "string" && file.name.length > 0 && !file.name.includes("\0"),
      `${label} file ${index} has an invalid name.`
    );
    assert(typeof file.content === "string", `${label} file ${file.name} has invalid content.`);
    assert(
      file.fingerprint === undefined ||
        file.fingerprint === null ||
        typeof file.fingerprint === "string",
      `${label} file ${file.name} has an invalid fingerprint.`
    );
    return {
      name: file.name,
      content: file.content,
      fingerprint: file.fingerprint ?? null,
    };
  });
  const names = normalized.map((file) => file.name);
  assert(names.length === new Set(names).size, `${label} contains duplicate source file names.`);
  return normalized.sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeRuleset(payload, { projectId, rulesetName, service }) {
  assert(payload && typeof payload === "object" && !Array.isArray(payload), "Rules API ruleset response is invalid.");
  assert(payload.name === rulesetName, `Rules API returned the wrong ruleset: ${String(payload.name)}.`);
  assert(rulesetNamePattern(projectId).test(payload.name), "Rules API returned a cross-project ruleset.");
  assert(isTimestamp(payload.createTime), `Ruleset ${rulesetName} has an invalid createTime.`);
  const services = payload.metadata?.services;
  assert(Array.isArray(services) && services.includes(service), `Ruleset ${rulesetName} does not declare ${service}.`);
  assert(
    services.every((entry) => typeof entry === "string") && services.length === new Set(services).size,
    `Ruleset ${rulesetName} has invalid service metadata.`
  );
  const camelAttachment = payload.attachmentPoint;
  const snakeAttachment = payload.attachment_point;
  assert(
    camelAttachment === undefined || snakeAttachment === undefined || camelAttachment === snakeAttachment,
    `Ruleset ${rulesetName} returned conflicting attachment points.`
  );
  const attachmentPoint = camelAttachment ?? snakeAttachment ?? null;
  assert(
    attachmentPoint === null || typeof attachmentPoint === "string",
    `Ruleset ${rulesetName} has an invalid attachment point.`
  );
  return {
    name: payload.name,
    createTime: payload.createTime,
    metadata: { services: [...services].sort() },
    attachmentPoint,
    source: {
      files: normalizeSourceFiles(payload.source?.files, `Ruleset ${rulesetName}`),
    },
  };
}

function unsignedSnapshot(snapshot) {
  const { snapshotDigestSha256: _digest, ...unsigned } = snapshot;
  return unsigned;
}

export function rulesSnapshotDigest(snapshot) {
  return sha256(stableString(unsignedSnapshot(snapshot)));
}

function finalizeSnapshot(snapshot) {
  return {
    ...snapshot,
    snapshotDigestSha256: rulesSnapshotDigest(snapshot),
  };
}

function validateNormalizedRelease(release, { projectId, releaseName, label }) {
  exactKeys(release, ["name", "rulesetName", "createTime", "updateTime"], `${label} release`);
  return normalizeRelease(release, { projectId, releaseName });
}

function validateNormalizedRuleset(ruleset, { projectId, rulesetName, service, label }) {
  exactKeys(
    ruleset,
    ["name", "createTime", "metadata", "attachmentPoint", "source"],
    `${label} ruleset`
  );
  exactKeys(ruleset.metadata, ["services"], `${label} ruleset metadata`);
  exactKeys(ruleset.source, ["files"], `${label} ruleset source`);
  for (const [index, file] of (ruleset.source.files ?? []).entries()) {
    exactKeys(file, ["name", "content", "fingerprint"], `${label} ruleset source file ${index}`);
  }
  return normalizeRuleset(ruleset, { projectId, rulesetName, service });
}

export function validateRulesSnapshot(snapshot, { projectId = null, storageBucket = null } = {}) {
  exactKeys(
    snapshot,
    [
      "kind",
      "schemaVersion",
      "projectId",
      "storageBucket",
      "capturedAt",
      "releases",
      "snapshotDigestSha256",
    ],
    "Rules snapshot"
  );
  assert(snapshot.kind === snapshotKind, "Rules snapshot kind is invalid.");
  assert(snapshot.schemaVersion === snapshotSchemaVersion, "Rules snapshot schema version is unsupported.");
  validateProjectId(snapshot.projectId);
  validateStorageBucket(snapshot.storageBucket);
  assert(isTimestamp(snapshot.capturedAt), "Rules snapshot capturedAt is invalid.");
  if (projectId !== null) {
    validateProjectId(projectId);
    assert(snapshot.projectId === projectId, "Rules snapshot belongs to a different Firebase project.");
  }
  if (storageBucket !== null) {
    validateStorageBucket(storageBucket);
    assert(snapshot.storageBucket === storageBucket, "Rules snapshot belongs to a different Storage bucket.");
  }
  exactKeys(snapshot.releases, surfaceNames, "Rules snapshot releases");
  for (const surface of surfaceNames) {
    const entry = snapshot.releases[surface];
    const service = surfaceDefinitions[surface].service;
    const label = `Rules snapshot ${surface}`;
    exactKeys(entry, ["service", "release", "ruleset"], label);
    assert(entry.service === service, `${label} has the wrong service.`);
    const releaseName = expectedReleaseName(snapshot.projectId, surface, snapshot.storageBucket);
    const release = validateNormalizedRelease(entry.release, {
      projectId: snapshot.projectId,
      releaseName,
      label,
    });
    const ruleset = validateNormalizedRuleset(entry.ruleset, {
      projectId: snapshot.projectId,
      rulesetName: release.rulesetName,
      service,
      label,
    });
    assert(release.rulesetName === ruleset.name, `${label} release and ruleset do not match.`);
  }
  assert(
    typeof snapshot.snapshotDigestSha256 === "string" && /^[a-f0-9]{64}$/.test(snapshot.snapshotDigestSha256),
    "Rules snapshot digest is invalid."
  );
  const actualDigest = rulesSnapshotDigest(snapshot);
  assert(
    snapshot.snapshotDigestSha256 === actualDigest,
    `Rules snapshot digest mismatch: expected ${snapshot.snapshotDigestSha256}, got ${actualDigest}.`
  );
  return snapshot;
}

async function rulesRequest(resourceName, { accessToken, fetchImpl, method = "GET", body }) {
  return authorizedJsonRequest(resourceUrl(resourceName), {
    accessToken,
    fetchImpl,
    method,
    ...(body === undefined ? {} : { body }),
  });
}

export async function captureRulesSnapshot({
  projectId,
  storageBucket,
  accessToken,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
} = {}) {
  validateProjectId(projectId);
  validateStorageBucket(storageBucket);
  assert(typeof now === "function", "now must be a function.");
  const releases = {};
  for (const surface of surfaceNames) {
    const service = surfaceDefinitions[surface].service;
    const releaseName = expectedReleaseName(projectId, surface, storageBucket);
    const releasePayload = await rulesRequest(releaseName, { accessToken, fetchImpl });
    const release = normalizeRelease(releasePayload, { projectId, releaseName });
    const rulesetPayload = await rulesRequest(release.rulesetName, { accessToken, fetchImpl });
    const ruleset = normalizeRuleset(rulesetPayload, {
      projectId,
      rulesetName: release.rulesetName,
      service,
    });
    releases[surface] = { service, release, ruleset };
  }
  const snapshot = finalizeSnapshot({
    kind: snapshotKind,
    schemaVersion: snapshotSchemaVersion,
    projectId,
    storageBucket,
    capturedAt: new Date(now()).toISOString(),
    releases,
  });
  return validateRulesSnapshot(snapshot, { projectId, storageBucket });
}

function readJson(path, label = "JSON file") {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`Could not read ${label} ${path}.`);
  }
}

function configuredPath(root, configured, label) {
  assert(typeof configured === "string" && configured.length > 0, `${label} rules path is not configured.`);
  assert(!isAbsolute(configured) && !configured.includes("\0"), `${label} rules path must be repository-relative.`);
  const absolute = resolve(root, configured);
  const fromRoot = relative(root, absolute);
  assert(
    fromRoot && !fromRoot.startsWith("..") && !isAbsolute(fromRoot),
    `${label} rules path escapes the repository.`
  );
  return { name: configured, absolute };
}

export function loadRulesConfiguration(repositoryRoot = defaultRepositoryRoot) {
  const root = resolve(repositoryRoot);
  const firebase = readJson(resolve(root, "firebase.json"), "Firebase manifest");
  assert(
    Array.isArray(firebase?.storage) &&
      firebase.storage.length === 1 &&
      firebase.storage[0]?.target === "primary",
    "Firebase manifest must bind Storage rules to the primary deploy target."
  );
  const localSources = {};
  for (const surface of surfaceNames) {
    const configured =
      surface === "firestore"
        ? firebase?.firestore?.rules
        : firebase.storage[0].rules;
    const sourcePath = configuredPath(root, configured, surface);
    assert(existsSync(sourcePath.absolute), `${surface} rules source does not exist: ${configured}.`);
    localSources[surface] = {
      name: sourcePath.name,
      content: readFileSync(sourcePath.absolute, "utf8"),
    };
  }
  return { repositoryRoot: root, localSources };
}

export function verifyRulesSnapshotAgainstLocal(
  snapshot,
  {
    repositoryRoot = defaultRepositoryRoot,
    projectId = null,
    storageBucket,
    requireConfiguredSourceNames = true,
    // A pre-deploy verification of a commit that actually changes rules
    // content can never find the live (before) snapshot equal to the new
    // local source - that content is precisely what the deploy is about to
    // replace. Callers making a content-changing deploy pass false here
    // (via --allow-content-drift) to skip only the equality assertion; the
    // comparison is still computed and reported as `contentMatches`, and
    // name checking and schema validation are unaffected. Post-deploy
    // verification must never set this false: after a real deploy the live
    // content is required to exactly equal the source that was just pushed.
    requireMatchingContent = true,
  } = {}
) {
  const configuration = loadRulesConfiguration(repositoryRoot);
  const expectedProjectId = projectId ?? snapshot?.projectId;
  validateRulesSnapshot(snapshot, { projectId: expectedProjectId, storageBucket });
  const surfaces = {};
  for (const surface of surfaceNames) {
    const files = snapshot.releases[surface].ruleset.source.files;
    const local = configuration.localSources[surface];
    assert(files.length === 1, `${surface} ruleset must contain exactly one source file for local verification.`);
    const captured = files[0];
    if (requireConfiguredSourceNames) {
      assert(
        captured.name === local.name,
        `${surface} rules source name mismatch: expected ${local.name}, got ${captured.name}.`
      );
    }
    const contentMatches = captured.content === local.content;
    if (requireMatchingContent) {
      assert(contentMatches, `${surface} rules source content differs from ${local.name}.`);
    }
    surfaces[surface] = {
      configuredName: local.name,
      capturedName: captured.name,
      nameMatches: captured.name === local.name,
      contentMatches,
      contentSha256: sha256(captured.content),
    };
  }
  return {
    projectId: expectedProjectId,
    storageBucket,
    snapshotDigestSha256: snapshot.snapshotDigestSha256,
    requireConfiguredSourceNames,
    requireMatchingContent,
    surfaces,
  };
}

function assertSame(left, right, message) {
  assert(stableString(left) === stableString(right), message);
}

function comparableRuleset(ruleset) {
  return {
    name: ruleset.name,
    createTime: ruleset.createTime,
    metadata: ruleset.metadata,
    attachmentPoint: ruleset.attachmentPoint,
    source: {
      files: ruleset.source.files.map(({ name, content }) => ({ name, content })),
    },
  };
}

async function getVerifiedRuleset(entry, snapshot, { accessToken, fetchImpl, label }) {
  const payload = await rulesRequest(entry.ruleset.name, { accessToken, fetchImpl });
  const live = normalizeRuleset(payload, {
    projectId: snapshot.projectId,
    rulesetName: entry.ruleset.name,
    service: entry.service,
  });
  // Fingerprint is captured as evidence but is optional API metadata. The
  // immutable identity, source file names, and byte content are authoritative.
  assertSame(
    comparableRuleset(live),
    comparableRuleset(entry.ruleset),
    `${label} immutable ruleset no longer matches its captured source.`
  );
  return live;
}

async function getMatchingRelease(entry, snapshot, { accessToken, fetchImpl, label }) {
  const payload = await rulesRequest(entry.release.name, { accessToken, fetchImpl });
  const live = normalizeRelease(payload, {
    projectId: snapshot.projectId,
    releaseName: entry.release.name,
  });
  assertSame(
    live,
    entry.release,
    `${label} live release binding no longer matches the captured current snapshot.`
  );
  return live;
}

export function expectedRulesRollbackConfirmation(priorSnapshot, currentSnapshot) {
  validateRulesSnapshot(priorSnapshot);
  validateRulesSnapshot(currentSnapshot, {
    projectId: priorSnapshot.projectId,
    storageBucket: priorSnapshot.storageBucket,
  });
  return (
    `ROLLBACK FIREBASE RULES ${priorSnapshot.projectId} ` +
    `FROM ${currentSnapshot.snapshotDigestSha256} TO ${priorSnapshot.snapshotDigestSha256}`
  );
}

function initialRollbackStatus(priorSnapshot, currentSnapshot, now) {
  return {
    schemaVersion: 1,
    kind: "tenacity.firebase-rules-rollback-status",
    projectId: priorSnapshot.projectId,
    storageBucket: priorSnapshot.storageBucket,
    priorSnapshotDigestSha256: priorSnapshot.snapshotDigestSha256,
    currentSnapshotDigestSha256: currentSnapshot.snapshotDigestSha256,
    startedAt: new Date(now()).toISOString(),
    updatedAt: new Date(now()).toISOString(),
    state: "preflight",
    error: null,
    surfaces: Object.fromEntries(
      surfaceNames.map((surface) => [
        surface,
        {
          state: "pending",
          releaseName: priorSnapshot.releases[surface].release.name,
          fromRulesetName: currentSnapshot.releases[surface].release.rulesetName,
          toRulesetName: priorSnapshot.releases[surface].release.rulesetName,
          error: null,
        },
      ])
    ),
  };
}

function safeErrorMessage(error) {
  return String(error?.message ?? error).replace(/[\r\n]+/g, " ").slice(0, 500);
}

export class RulesRollbackError extends Error {
  constructor(message, status, cause) {
    super(message, { cause });
    this.name = "RulesRollbackError";
    this.status = structuredClone(status);
  }
}

async function recordStatus(recordStatus, status, now) {
  status.updatedAt = new Date(now()).toISOString();
  if (recordStatus) await recordStatus(structuredClone(status));
}

function markJournalFailure(status, error, now) {
  status.state = "journal-failed";
  status.error = `Status journal failed: ${safeErrorMessage(error)}`;
  status.updatedAt = new Date(now()).toISOString();
}

async function recordProgress({
  statusRecorder,
  status,
  now,
  providerMutationAttempted,
  failureMessage,
}) {
  try {
    await recordStatus(statusRecorder, status, now);
  } catch (error) {
    if (!providerMutationAttempted) throw error;
    markJournalFailure(status, error, now);
    throw new RulesRollbackError(failureMessage, status, error);
  }
}

async function recordFailureStatus(statusRecorder, status, now, primaryError) {
  try {
    await recordStatus(statusRecorder, status, now);
    return primaryError;
  } catch (statusError) {
    status.error = `${status.error}; status journal failed: ${safeErrorMessage(statusError)}`;
    status.updatedAt = new Date(now()).toISOString();
    return new AggregateError(
      [primaryError, statusError],
      "Rules rollback failed and its status journal could not be updated."
    );
  }
}

export async function rollbackRulesReleases({
  priorSnapshot,
  currentSnapshot,
  projectId,
  storageBucket,
  accessToken,
  fetchImpl = globalThis.fetch,
  apply = false,
  confirmation = null,
  exclusiveDeploymentLock = false,
  recordStatus: statusRecorder = null,
  now = () => Date.now(),
} = {}) {
  validateProjectId(projectId);
  validateStorageBucket(storageBucket);
  validateRulesSnapshot(priorSnapshot, { projectId, storageBucket });
  validateRulesSnapshot(currentSnapshot, { projectId, storageBucket });
  assert(
    priorSnapshot.snapshotDigestSha256 !== currentSnapshot.snapshotDigestSha256,
    "Prior and current rules snapshots must be different."
  );
  const rollbackRequired = surfaceNames.some(
    (surface) =>
      priorSnapshot.releases[surface].release.rulesetName !==
      currentSnapshot.releases[surface].release.rulesetName
  );
  assert(typeof now === "function", "now must be a function.");
  assert(statusRecorder === null || typeof statusRecorder === "function", "recordStatus must be a function.");
  const expectedConfirmation = expectedRulesRollbackConfirmation(priorSnapshot, currentSnapshot);
  if (apply) {
    assert(rollbackRequired, "Applied rollback is not allowed because both release bindings are unchanged.");
    assert(confirmation === expectedConfirmation, `Rollback confirmation must exactly equal: ${expectedConfirmation}`);
    assert(
      exclusiveDeploymentLock === true,
      "Applied rollback requires an explicit exclusive deployment lock assertion."
    );
    assert(statusRecorder, "Applied rollback requires a status recorder.");
  } else {
    assert(confirmation === null, "Rollback confirmation is accepted only with --apply.");
    assert(
      exclusiveDeploymentLock === false,
      "The exclusive deployment lock assertion is accepted only with --apply."
    );
  }

  const status = initialRollbackStatus(priorSnapshot, currentSnapshot, now);

  // Preflight all immutable sources and all current bindings before any write.
  for (const surface of surfaceNames) {
    await getVerifiedRuleset(priorSnapshot.releases[surface], priorSnapshot, {
      accessToken,
      fetchImpl,
      label: `Prior ${surface}`,
    });
    await getVerifiedRuleset(currentSnapshot.releases[surface], currentSnapshot, {
      accessToken,
      fetchImpl,
      label: `Current ${surface}`,
    });
    await getMatchingRelease(currentSnapshot.releases[surface], currentSnapshot, {
      accessToken,
      fetchImpl,
      label: `Current ${surface}`,
    });
  }
  status.state = apply ? "ready" : "preflight-complete";
  if (!apply) {
    return { applied: false, rollbackRequired, expectedConfirmation, status };
  }
  let providerMutationAttempted = false;
  await recordProgress({
    statusRecorder,
    status,
    now,
    providerMutationAttempted,
    failureMessage: "Rules rollback status journal failed before the first mutation.",
  });

  for (const surface of surfaceNames) {
    const prior = priorSnapshot.releases[surface];
    const current = currentSnapshot.releases[surface];
    const surfaceStatus = status.surfaces[surface];
    if (prior.release.rulesetName === current.release.rulesetName) {
      surfaceStatus.state = "unchanged";
      await recordProgress({
        statusRecorder,
        status,
        now,
        providerMutationAttempted,
        failureMessage: `Rules rollback stopped at ${surface} because the status journal failed after a mutation.`,
      });
      continue;
    }

    surfaceStatus.state = "applying";
    await recordProgress({
      statusRecorder,
      status,
      now,
      providerMutationAttempted,
      failureMessage: `Rules rollback stopped before ${surface} because the status journal failed after a mutation.`,
    });
    let patchAttempted = false;
    try {
      // Repeat the comparison immediately before this mutation to narrow the
      // Rules API's lack of an update-time/etag precondition.
      await getMatchingRelease(current, currentSnapshot, {
        accessToken,
        fetchImpl,
        label: `Current ${surface}`,
      });
      patchAttempted = true;
      providerMutationAttempted = true;
      const response = await rulesRequest(prior.release.name, {
        accessToken,
        fetchImpl,
        method: "PATCH",
        body: {
          release: {
            name: prior.release.name,
            rulesetName: prior.release.rulesetName,
          },
          updateMask: "rulesetName",
        },
      });
      const updated = normalizeRelease(response, {
        projectId,
        releaseName: prior.release.name,
      });
      assert(
        updated.rulesetName === prior.release.rulesetName,
        `${surface} rollback response did not point to the prior ruleset.`
      );
      surfaceStatus.state = "applied";
    } catch (error) {
      surfaceStatus.state = patchAttempted ? "unknown-after-apply" : "failed";
      surfaceStatus.error = safeErrorMessage(error);
      const earlierApplied = Object.values(status.surfaces).some((entry) => entry.state === "applied");
      status.state = earlierApplied ? "partial" : patchAttempted ? "unknown" : "failed";
      status.error = safeErrorMessage(error);
      const rollbackCause = await recordFailureStatus(statusRecorder, status, now, error);
      throw new RulesRollbackError(
        `Rules rollback stopped at ${surface}; inspect live release state before any retry.`,
        status,
        rollbackCause
      );
    }
    await recordProgress({
      statusRecorder,
      status,
      now,
      providerMutationAttempted,
      failureMessage: `Rules rollback stopped after ${surface} because the status journal failed.`,
    });
  }

  try {
    for (const surface of surfaceNames) {
      const prior = priorSnapshot.releases[surface];
      const response = await rulesRequest(prior.release.name, { accessToken, fetchImpl });
      const live = normalizeRelease(response, {
        projectId,
        releaseName: prior.release.name,
      });
      assert(
        live.rulesetName === prior.release.rulesetName,
        `${surface} live release does not point to the prior ruleset after rollback.`
      );
    }
  } catch (error) {
    status.state = "verification-failed";
    status.error = safeErrorMessage(error);
    const rollbackCause = await recordFailureStatus(statusRecorder, status, now, error);
    throw new RulesRollbackError(
      "Rules rollback mutation completed, but final read-back failed; inspect both live releases.",
      status,
      rollbackCause
    );
  }

  status.state = "complete";
  status.error = null;
  await recordProgress({
    statusRecorder,
    status,
    now,
    providerMutationAttempted,
    failureMessage: "Rules rollback completed, but its final status journal update failed.",
  });
  return { applied: true, rollbackRequired, expectedConfirmation, status };
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  assert(args[index + 1] && !args[index + 1].startsWith("--"), `${flag} requires a value.`);
  assert(args.indexOf(flag, index + 1) === -1, `${flag} may be provided only once.`);
  return args[index + 1];
}

function hasFlag(args, flag) {
  assert(args.indexOf(flag) === args.lastIndexOf(flag), `${flag} may be provided only once.`);
  return args.includes(flag);
}

function assertKnownArguments(args, valueFlags, booleanFlags = []) {
  const allowed = new Set([...valueFlags, ...booleanFlags]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    assert(argument.startsWith("--") && allowed.has(argument), `Unknown argument: ${argument}.`);
    if (valueFlags.includes(argument)) index += 1;
  }
}

function serviceAccountPath(args) {
  const path = argumentValue(args, "--credentials") ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  assert(path, "Provide --credentials or GOOGLE_APPLICATION_CREDENTIALS.");
  return resolve(path);
}

function writeNewJson(path, value) {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

export function createAtomicStatusRecorder(path) {
  const absolute = resolve(path);
  assert(!existsSync(absolute), `Rollback status output already exists: ${absolute}.`);
  mkdirSync(dirname(absolute), { recursive: true });
  return async (status) => {
    const temporary = `${absolute}.tmp-${process.pid}`;
    try {
      writeFileSync(temporary, `${JSON.stringify(status, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      renameSync(temporary, absolute);
    } catch (error) {
      if (existsSync(temporary)) unlinkSync(temporary);
      throw error;
    }
  };
}

async function authenticatedClient(args, scopes) {
  const federatedToken = accessTokenFromEnvironment();
  if (federatedToken !== null) return federatedToken;
  const serviceAccount = readJson(serviceAccountPath(args), "service-account credentials");
  return getAccessToken({ serviceAccount, scopes });
}

export function resolveRulesTargetInputs(args, options = {}) {
  const targetName = argumentValue(args, "--target");
  const projectId = argumentValue(args, "--project");
  const storageBucket = argumentValue(args, "--storage-bucket");
  assert(targetName, "Provide --target production or --target staging.");
  validateProjectId(projectId);
  validateStorageBucket(storageBucket);
  const target = getFirebaseDeploymentTarget(targetName, options);
  assert(
    projectId === target.projectId && storageBucket === target.storageBucket,
    `Firebase ${targetName} project and Storage bucket do not match the reviewed deployment policy.`
  );
  return { targetName, projectId, storageBucket };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  assert(["capture", "verify", "rollback"].includes(command), "Command must be capture, verify, or rollback.");
  const commonValueFlags = ["--target", "--project", "--storage-bucket"];
  const { targetName, projectId, storageBucket } = resolveRulesTargetInputs(args);

  if (command === "capture") {
    const valueFlags = [...commonValueFlags, "--credentials", "--output"];
    assertKnownArguments(args, valueFlags);
    const output = argumentValue(args, "--output");
    assert(output, "capture requires --output.");
    const accessToken = await authenticatedClient(args, [firebaseReadonlyScope]);
    const snapshot = await captureRulesSnapshot({ projectId, storageBucket, accessToken });
    writeNewJson(output, snapshot);
    console.log(
      JSON.stringify({
        output: resolve(output),
        target: targetName,
        projectId,
        storageBucket,
        snapshotDigestSha256: snapshot.snapshotDigestSha256,
        releases: Object.fromEntries(
          surfaceNames.map((surface) => [surface, snapshot.releases[surface].release.rulesetName])
        ),
      })
    );
    return;
  }

  if (command === "verify") {
    const valueFlags = [...commonValueFlags, "--snapshot"];
    const booleanFlags = ["--allow-source-name-mismatch", "--allow-content-drift"];
    assertKnownArguments(args, valueFlags, booleanFlags);
    const snapshotPath = argumentValue(args, "--snapshot");
    assert(snapshotPath, "verify requires --snapshot.");
    const report = verifyRulesSnapshotAgainstLocal(readJson(resolve(snapshotPath), "rules snapshot"), {
      projectId,
      storageBucket,
      requireConfiguredSourceNames: !hasFlag(args, "--allow-source-name-mismatch"),
      requireMatchingContent: !hasFlag(args, "--allow-content-drift"),
    });
    console.log(JSON.stringify(report));
    return;
  }

  const valueFlags = [
    ...commonValueFlags,
    "--credentials",
    "--prior-snapshot",
    "--current-snapshot",
    "--confirmation",
    "--status-output",
  ];
  assertKnownArguments(args, valueFlags, ["--apply", "--exclusive-deployment-lock"]);
  const priorPath = argumentValue(args, "--prior-snapshot");
  const currentPath = argumentValue(args, "--current-snapshot");
  assert(priorPath && currentPath, "rollback requires --prior-snapshot and --current-snapshot.");
  const priorSnapshot = readJson(resolve(priorPath), "prior rules snapshot");
  const currentSnapshot = readJson(resolve(currentPath), "current rules snapshot");
  validateRulesSnapshot(priorSnapshot, { projectId, storageBucket });
  validateRulesSnapshot(currentSnapshot, { projectId, storageBucket });
  const apply = hasFlag(args, "--apply");
  const exclusiveDeploymentLock = hasFlag(args, "--exclusive-deployment-lock");
  const confirmation = argumentValue(args, "--confirmation");
  const statusOutput = argumentValue(args, "--status-output");
  if (apply) {
    assert(statusOutput, "Applied rollback requires --status-output.");
    assert(
      exclusiveDeploymentLock,
      "Applied rollback requires --exclusive-deployment-lock to assert that an external deployment lock is held."
    );
    assert(
      priorSnapshot.snapshotDigestSha256 !== currentSnapshot.snapshotDigestSha256,
      "Prior and current rules snapshots must be different."
    );
    assert(
      surfaceNames.some(
        (surface) =>
          priorSnapshot.releases[surface].release.rulesetName !==
          currentSnapshot.releases[surface].release.rulesetName
      ),
      "Applied rollback is not allowed because both release bindings are unchanged."
    );
    const expectedConfirmation = expectedRulesRollbackConfirmation(priorSnapshot, currentSnapshot);
    assert(
      confirmation === expectedConfirmation,
      `Rollback confirmation must exactly equal: ${expectedConfirmation}`
    );
  } else {
    assert(!statusOutput, "--status-output is accepted only with --apply.");
    assert(!confirmation, "--confirmation is accepted only with --apply.");
    assert(
      !exclusiveDeploymentLock,
      "--exclusive-deployment-lock is accepted only with --apply."
    );
  }
  const accessToken = await authenticatedClient(
    args,
    apply ? [firebaseScope] : [firebaseReadonlyScope]
  );
  const result = await rollbackRulesReleases({
    priorSnapshot,
    currentSnapshot,
    projectId,
    storageBucket,
    accessToken,
    apply,
    confirmation,
    exclusiveDeploymentLock,
    recordStatus: apply ? createAtomicStatusRecorder(statusOutput) : null,
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    if (error instanceof RulesRollbackError) console.error(JSON.stringify(error.status));
    process.exitCode = 1;
  });
}
