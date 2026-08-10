#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, "../..");
const defaultPolicyPath = resolve(
  repositoryRoot,
  "backend/firebase/inventory/production-functions.json"
);
const defaultEntryPoint = resolve(
  repositoryRoot,
  "backend/firebase/functions/lib/index.js"
);
const inventoryFields = [
  "platform",
  "region",
  "runtime",
  "state",
  "triggerType",
  "deploymentTool",
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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

function hashStableValue(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export function hashManagedNames(names) {
  return createHash("sha256").update(sorted(names).join("\n")).digest("hex");
}

export function hashManagedMetadata(policy) {
  const defaults = policy.managed.metadataDefaults;
  const records = policy.managed.names.map((id) => ({
    id,
    ...defaults,
    platform: policy.managed.platformOverrides?.[id] ?? defaults.platform,
    triggerType: triggerTypeFor(policy, id),
  }));
  return createHash("sha256").update(JSON.stringify(records)).digest("hex");
}

export function validateInventoryPolicy(policy) {
  assert(policy?.schemaVersion === 1, "Unsupported Function inventory schema.");
  assert(
    policy.projectId === "tenacity-tutoring-b8eb2",
    "Function inventory projectId must remain tenacity-tutoring-b8eb2."
  );

  const managedNames = policy.managed?.names ?? [];
  const helperNames = policy.localHelperExports ?? [];
  assert(
    policy.managed?.allowedMissingBeforeDeploy === undefined,
    "allowedMissingBeforeDeploy was removed; the pre-deploy comparison reports " +
      "not-yet-live Functions instead and the post-batch check stays strict."
  );
  // Deliberately a literal, so adding or removing a Function is a decision
  // someone makes here rather than something a refactor does quietly.
  assert(managedNames.length === 87, `Expected 87 managed Functions, found ${managedNames.length}.`);
  assert(helperNames.length === 3, `Expected three helper exports, found ${helperNames.length}.`);
  assert(
    sameArray(managedNames, sorted(new Set(managedNames))),
    "Managed Function names must be unique and sorted."
  );
  assert(
    sameArray(helperNames, sorted(new Set(helperNames))),
    "Helper export names must be unique and sorted."
  );
  assert(
    managedNames.every((name) => !helperNames.includes(name)),
    "Managed and helper export names must not overlap."
  );
  assert(
    JSON.stringify(policy.managed.metadataDefaults) ===
      JSON.stringify({
        platform: "gcfv2",
        region: "us-central1",
        runtime: "nodejs22",
        state: "ACTIVE",
        triggerType: "callable",
        deploymentTool: "cli-firebase",
      }),
    "Managed Function metadata defaults changed."
  );
  assert(
    JSON.stringify(policy.managed.platformOverrides ?? {}) ===
      JSON.stringify({ syncUserRoleClaim: "gcfv1" }),
    "Managed Function platform overrides changed."
  );
  assert(
    sameArray(sorted(Object.keys(policy.managed.triggerOverrides ?? {})), [
      "event",
      "https",
      "schedule",
    ]),
    "Managed Function trigger override groups changed."
  );

  const overrideNames = [];
  for (const [triggerType, names] of Object.entries(policy.managed.triggerOverrides ?? {})) {
    assert(triggerType !== "callable", "Callable is the default trigger type.");
    for (const name of names) {
      assert(managedNames.includes(name), `Unknown trigger override ${name}.`);
      overrideNames.push(name);
    }
  }
  assert(
    overrideNames.length === new Set(overrideNames).size,
    "A managed Function has more than one trigger override."
  );
  for (const name of Object.keys(policy.managed.platformOverrides ?? {})) {
    assert(managedNames.includes(name), `Unknown platform override ${name}.`);
  }

  const actualHash = hashManagedNames(managedNames);
  assert(
    policy.managed.nameHashSha256 === actualHash,
    `Managed Function hash mismatch: expected ${policy.managed.nameHashSha256}, got ${actualHash}.`
  );
  const actualMetadataHash = hashManagedMetadata(policy);
  assert(
    policy.managed.metadataHashSha256 === actualMetadataHash,
    `Managed Function metadata hash mismatch: expected ${policy.managed.metadataHashSha256}, got ${actualMetadataHash}.`
  );

  const protectedIds = (policy.protectedExternal ?? []).map((item) => item.id);
  const extensionIds = (policy.extensionManaged ?? []).map((item) => item.id);
  assert(
    sameArray(sorted(protectedIds), ["generateXeroAuthUrl", "xeroOAuthCallback"]),
    "Protected legacy Function IDs changed."
  );
  assert(
    sameArray(sorted(extensionIds), [
      "ext-firestore-algolia-search-executeFullIndexOperation",
      "ext-firestore-algolia-search-executeIndexOperation",
    ]),
    "Extension-managed Function IDs changed."
  );
  const externalIds = [...protectedIds, ...extensionIds];
  assert(externalIds.length === 4, `Expected four external Functions, found ${externalIds.length}.`);
  assert(externalIds.length === new Set(externalIds).size, "External Function IDs must be unique.");
  assert(
    externalIds.every((id) => !managedNames.includes(id) && !helperNames.includes(id)),
    "External Function IDs must not appear in local exports."
  );
  const exactExternalMetadata = {
    generateXeroAuthUrl: ["gcfv2", "us-central1", "nodejs18", "UNKNOWN", "https", null],
    xeroOAuthCallback: ["gcfv2", "us-central1", "nodejs18", "UNKNOWN", "https", null],
    "ext-firestore-algolia-search-executeFullIndexOperation": [
      "gcfv1",
      "us-central1",
      "nodejs20",
      "ACTIVE",
      "https",
      "firebase-extensions",
    ],
    "ext-firestore-algolia-search-executeIndexOperation": [
      "gcfv1",
      "us-central1",
      "nodejs20",
      "ACTIVE",
      "event",
      "firebase-extensions",
    ],
  };
  for (const record of [...policy.protectedExternal, ...policy.extensionManaged]) {
    const actual = inventoryFields.map((field) => record[field]);
    assert(
      JSON.stringify(actual) === JSON.stringify(exactExternalMetadata[record.id]),
      `External Function metadata changed for ${record.id}.`
    );
  }
  return policy;
}

function triggerTypeFor(policy, name) {
  for (const [triggerType, names] of Object.entries(policy.managed.triggerOverrides ?? {})) {
    if (names.includes(name)) return triggerType;
  }
  return policy.managed.metadataDefaults.triggerType;
}

function sortedRecords(records) {
  return [...records].sort((left, right) => left.id.localeCompare(right.id));
}

export function expectedLiveInventory(policyInput) {
  const policy = validateInventoryPolicy(policyInput);
  const defaults = policy.managed.metadataDefaults;
  const managed = policy.managed.names.map((id) => ({
    id,
    ...defaults,
    platform: policy.managed.platformOverrides?.[id] ?? defaults.platform,
    triggerType: triggerTypeFor(policy, id),
  }));
  return sortedRecords([...managed, ...policy.protectedExternal, ...policy.extensionManaged]);
}

function triggerTypeFromLiveRecord(record) {
  const keys = Object.keys(record).filter((candidate) => candidate.endsWith("Trigger"));
  assert(keys.length === 1, `${record.id ?? "Unknown Function"} must have exactly one trigger.`);
  return keys[0].slice(0, -"Trigger".length);
}

export function normalizeLiveInventory(payload, { projectId = null } = {}) {
  const records = Array.isArray(payload) ? payload : payload?.result;
  assert(Array.isArray(records), "Firebase Functions JSON must contain a result array.");
  const ids = records.map((record) => record.id);
  assert(ids.every(Boolean), "Every live Function must have an ID.");
  assert(ids.length === new Set(ids).size, "Live Function inventory contains duplicate IDs.");
  if (projectId) {
    const wrongProjects = records
      .filter((record) => record.project !== projectId)
      .map((record) => `${record.id}=${String(record.project)}`);
    assert(
      wrongProjects.length === 0,
      `Live Function inventory contains the wrong project: ${wrongProjects.join(", ")}.`
    );
  }
  return sortedRecords(
    records.map((record) => ({
      id: record.id,
      platform: record.platform ?? null,
      region: record.region ?? null,
      runtime: record.runtime ?? null,
      state: record.state ?? null,
      triggerType: triggerTypeFromLiveRecord(record),
      deploymentTool: record.labels?.["deployment-tool"] ?? null,
    }))
  );
}

export function redactLivePayload(payload) {
  const records = Array.isArray(payload) ? payload : payload?.result;
  return records
    .map((record, index) => ({
      id: record.id ?? null,
      sourceIndex: index,
      project: record.project ?? null,
      platform: record.platform ?? null,
      region: record.region ?? null,
      runtime: record.runtime ?? null,
      state: record.state ?? null,
      triggerTypes: Object.keys(record)
        .filter((key) => key.endsWith("Trigger"))
        .map((key) => key.slice(0, -"Trigger".length))
        .sort(),
      deploymentTool: record.labels?.["deployment-tool"] ?? null,
      recordSha256: hashStableValue(record),
      environmentVariableNames: Object.keys(record.environmentVariables ?? {}).sort(),
      secretEnvironmentVariableNames: (record.secretEnvironmentVariables ?? [])
        .map((item) => item.key ?? item.name ?? String(item))
        .sort(),
    }))
    .sort((left, right) =>
      String(left.id ?? "").localeCompare(String(right.id ?? ""))
    );
}

export function redactedLiveEvidence(policyInput, payload) {
  const policy = validateInventoryPolicy(policyInput);
  normalizeLiveInventory(payload, { projectId: policy.projectId });
  return redactLivePayload(payload);
}

function externalState(record) {
  triggerTypeFromLiveRecord(record);
  return stableValue(record);
}

export function compareExternalInventoryUnchanged(policyInput, beforePayload, afterPayload) {
  const policy = validateInventoryPolicy(policyInput);
  const beforeRecords = Array.isArray(beforePayload) ? beforePayload : beforePayload?.result;
  const afterRecords = Array.isArray(afterPayload) ? afterPayload : afterPayload?.result;
  assert(Array.isArray(beforeRecords), "Before inventory must contain a result array.");
  assert(Array.isArray(afterRecords), "After inventory must contain a result array.");
  normalizeLiveInventory(beforeRecords, { projectId: policy.projectId });
  normalizeLiveInventory(afterRecords, { projectId: policy.projectId });
  const beforeById = new Map(beforeRecords.map((record) => [record.id, record]));
  const afterById = new Map(afterRecords.map((record) => [record.id, record]));
  const externalIds = [
    ...policy.protectedExternal.map((record) => record.id),
    ...policy.extensionManaged.map((record) => record.id),
  ];
  const changed = [];
  for (const id of externalIds) {
    const before = beforeById.get(id);
    const after = afterById.get(id);
    if (!before || !after) {
      changed.push(`${id} is missing from the ${before ? "post-deploy" : "pre-deploy"} inventory`);
      continue;
    }
    if (JSON.stringify(externalState(before)) !== JSON.stringify(externalState(after))) {
      changed.push(`${id} changed during deployment`);
    }
  }
  if (changed.length > 0) {
    throw new Error(`Protected external Function drift:\n- ${changed.join("\n- ")}`);
  }
  return externalIds;
}

export function compareLiveInventory(policy, livePayload) {
  return compareLiveInventoryWithOptions(policy, livePayload);
}

/**
 * The comparison used before and between deployment batches.
 *
 * A Function that has never deployed cannot be in the live inventory, so a
 * strict pre-deploy comparison fails every release that adds one. That used to
 * be handled by naming the Function in `allowedMissingBeforeDeploy` in one pull
 * request and removing it in another — a ritual that was forgotten twice, and
 * each time aborted a live deployment window.
 *
 * The end state is unchanged without it: the post-batch call is strict and
 * unconditional, so a Function missing when the run finishes still fails the
 * run. Only the *timing* of that failure moves. Everything that could indicate
 * real drift — an unexpected live Function, or any metadata mismatch on one
 * that exists — stays a hard failure here.
 */
export function compareLiveInventoryPreDeploy(policy, livePayload) {
  return compareLiveInventoryWithOptions(policy, livePayload, {
    preDeploy: true,
  });
}

function compareLiveInventoryWithOptions(
  policy,
  livePayload,
  { preDeploy = false } = {}
) {
  const expected = expectedLiveInventory(policy);
  const actual = normalizeLiveInventory(livePayload, { projectId: policy.projectId });
  const expectedById = new Map(expected.map((record) => [record.id, record]));
  const actualById = new Map(actual.map((record) => [record.id, record]));
  const problems = [];
  const pendingAdditions = [];
  for (const record of expected) {
    if (!actualById.has(record.id)) {
      if (preDeploy) {
        pendingAdditions.push(record.id);
        continue;
      }
      problems.push(`missing live Function: ${record.id}`);
      continue;
    }
    const live = actualById.get(record.id);
    for (const field of inventoryFields) {
      if (live[field] !== record[field]) {
        problems.push(
          `${record.id} ${field}: expected ${String(record[field])}, got ${String(live[field])}`
        );
      }
    }
  }
  for (const record of actual) {
    if (!expectedById.has(record.id)) problems.push(`unexpected live Function: ${record.id}`);
  }
  if (problems.length > 0) {
    throw new Error(`Live Function inventory drift:\n- ${problems.join("\n- ")}`);
  }
  if (pendingAdditions.length > 0) {
    // Visible in the run log, and carried into the evidence report, so a
    // first-time deployment is still a recorded fact rather than a silent one.
    console.warn(
      `Not yet live, expected to be deployed by this run:\n- ${pendingAdditions.join("\n- ")}`
    );
  }
  actual.pendingAdditions = pendingAdditions;
  return actual;
}

function isDeployableExport(value) {
  return Boolean(
    value &&
      (Object.prototype.hasOwnProperty.call(value, "__endpoint") ||
        Object.prototype.hasOwnProperty.call(value, "__trigger"))
  );
}

export function inspectLocalExports(policyInput, entryPoint = defaultEntryPoint) {
  const policy = validateInventoryPolicy(policyInput);
  process.env.GCLOUD_PROJECT ||= policy.projectId;
  // The entry point calls admin.initializeApp() at load time. Introspecting its
  // exports needs no Google credentials, but firebase-admin's file-based
  // credential parser only accepts service_account / authorized_user /
  // impersonated_service_account files and throws "Invalid contents in the
  // credentials file" for the external_account (workload identity federation)
  // file the deploy job exports as GOOGLE_APPLICATION_CREDENTIALS. Drop that
  // variable for this process so admin init falls back to a lazy default that
  // is never exercised here; separate `firebase` CLI processes keep their own
  // credentials. The validate job already loads this module with the variable
  // unset, so this matches a path that is known to work.
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const require = createRequire(import.meta.url);
  const exportsObject = require(entryPoint);
  const exportNames = sorted(Object.keys(exportsObject));
  const expectedExports = sorted([...policy.managed.names, ...policy.localHelperExports]);
  assert(
    sameArray(exportNames, expectedExports),
    `Local export set differs from policy.\nExpected: ${expectedExports.join(", ")}\nActual: ${exportNames.join(", ")}`
  );
  const nonDeployableManaged = policy.managed.names.filter(
    (name) => !isDeployableExport(exportsObject[name])
  );
  assert(
    nonDeployableManaged.length === 0,
    `Managed exports without Firebase trigger metadata: ${nonDeployableManaged.join(", ")}.`
  );
  const deployableHelpers = policy.localHelperExports.filter((name) =>
    isDeployableExport(exportsObject[name])
  );
  assert(
    deployableHelpers.length === 0,
    `Helper exports unexpectedly became deployable: ${deployableHelpers.join(", ")}.`
  );
  return {
    exportNames,
    managedNames: [...policy.managed.names],
    helperNames: [...policy.localHelperExports],
    nameHashSha256: hashManagedNames(policy.managed.names),
  };
}

export function functionDeploySelectors(policyInput, batchSize = 10) {
  const policy = validateInventoryPolicy(policyInput);
  assert(Number.isInteger(batchSize) && batchSize > 0, "batchSize must be a positive integer.");
  const selectors = [];
  for (let index = 0; index < policy.managed.names.length; index += batchSize) {
    selectors.push(
      policy.managed.names
        .slice(index, index + batchSize)
        .map((name) => `functions:default:${name}`)
        .join(",")
    );
  }
  return selectors;
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  assert(args[index + 1], `${flag} requires a value.`);
  return args[index + 1];
}

function main() {
  const args = process.argv.slice(2);
  const policyPath = argumentValue(args, "--policy") ?? defaultPolicyPath;
  const entryPoint = argumentValue(args, "--entry-point") ?? defaultEntryPoint;
  const livePath = argumentValue(args, "--live");
  const preDeploy = args.includes("--pre-deploy");
  const redactLivePath = argumentValue(args, "--redact-live");
  const beforeLivePath = argumentValue(args, "--before-live");
  const afterLivePath = argumentValue(args, "--after-live");
  const reportPath = argumentValue(args, "--report");
  const policy = validateInventoryPolicy(readJson(policyPath));
  if (redactLivePath) {
    assert(reportPath, "--redact-live requires --report.");
    const report = {
      schemaVersion: 1,
      projectId: policy.projectId,
      verificationStatus: "not-run",
      liveEvidence: redactLivePayload(readJson(redactLivePath)),
    };
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Wrote redacted evidence for ${report.liveEvidence.length} Functions.`);
    return;
  }
  const local = inspectLocalExports(policy, entryPoint);
  let live = null;
  let livePayload = null;
  if (livePath) {
    livePayload = readJson(livePath);
    live = preDeploy
      ? compareLiveInventoryPreDeploy(policy, livePayload)
      : compareLiveInventory(policy, livePayload);
  }
  assert(
    Boolean(beforeLivePath) === Boolean(afterLivePath),
    "--before-live and --after-live must be supplied together."
  );
  let unchangedExternal = null;
  let beforeLivePayload = null;
  let afterLivePayload = null;
  if (beforeLivePath && afterLivePath) {
    beforeLivePayload = readJson(beforeLivePath);
    afterLivePayload = readJson(afterLivePath);
    unchangedExternal = compareExternalInventoryUnchanged(
      policy,
      beforeLivePayload,
      afterLivePayload
    );
  }
  if (args.includes("--print-selectors")) {
    console.log(functionDeploySelectors(policy).join("\n"));
    return;
  }
  const report = {
    schemaVersion: 1,
    projectId: policy.projectId,
    managedCount: local.managedNames.length,
    helperCount: local.helperNames.length,
    liveCount: live?.length ?? null,
    nameHashSha256: local.nameHashSha256,
    managedNames: local.managedNames,
    helperNames: local.helperNames,
    protectedExternal: policy.protectedExternal.map((item) => item.id),
    extensionManaged: policy.extensionManaged.map((item) => item.id),
    liveInventoryVerified: Boolean(live),
    preDeploy,
    pendingAdditions: live?.pendingAdditions ?? [],
    externalInventoryUnchanged: unchangedExternal !== null,
    liveEvidence: livePayload ? redactedLiveEvidence(policy, livePayload) : null,
    protectedExternalEvidenceBefore: beforeLivePayload
      ? redactedLiveEvidence(policy, beforeLivePayload).filter((record) =>
          unchangedExternal.includes(record.id)
        )
      : null,
    protectedExternalEvidenceAfter: afterLivePayload
      ? redactedLiveEvidence(policy, afterLivePayload).filter((record) =>
          unchangedExternal.includes(record.id)
        )
      : null,
  };
  if (reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(
    `Function inventory valid: ${report.managedCount} managed endpoints, ` +
      `${report.helperCount} helpers, hash ${report.nameHashSha256}.`
  );
  report.protectedExternal.forEach((name) => console.log(`Protected external Function: ${name}`));
  report.extensionManaged.forEach((name) => console.log(`Extension-managed Function: ${name}`));
  if (live) console.log(`Live inventory valid: ${live.length} Functions.`);
  if (unchangedExternal) {
    console.log(`Protected external inventory unchanged: ${unchangedExternal.length} Functions.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  }
}
