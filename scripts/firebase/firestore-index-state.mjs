#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compareIndexManifests,
  validateIndexManifest,
} from "../ci/validate-firebase-config.mjs";
import { authorizedJsonRequest, getAccessToken } from "./google-api.mjs";
import {
  assertFirebaseDeploymentTarget,
  getFirebaseDeploymentTarget,
} from "./firebase-targets.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, "../..");
const firestoreOrigin = "https://firestore.googleapis.com";
const datastoreScope = "https://www.googleapis.com/auth/datastore";
const databaseResponseKeys = new Set([
  "appEngineIntegrationMode",
  "cmekConfig",
  "concurrencyMode",
  "createTime",
  "databaseEdition",
  "deleteProtectionState",
  "deleteTime",
  "earliestVersionTime",
  "etag",
  "firestoreDataAccessMode",
  "freeTier",
  "keyPrefix",
  "locationId",
  "mongodbCompatibleDataAccessMode",
  "name",
  "pointInTimeRecoveryEnablement",
  "previousId",
  "realtimeUpdatesMode",
  "sourceInfo",
  "tags",
  "type",
  "uid",
  "updateTime",
  "versionRetentionPeriod",
]);
const indexResponseKeys = new Set([
  "apiScope",
  "density",
  "fields",
  "multikey",
  "name",
  "queryScope",
  "searchIndexOptions",
  "shardCount",
  "state",
  "unique",
]);
const indexFieldResponseKeys = new Set([
  "arrayConfig",
  "fieldPath",
  "order",
  "searchConfig",
  "vectorConfig",
]);
const indexConfigResponseKeys = new Set([
  "ancestorField",
  "indexes",
  "reverting",
  "usesAncestorConfig",
]);
const fieldResponseKeys = new Set(["indexConfig", "name", "ttlConfig"]);
const ttlConfigResponseKeys = new Set(["expirationOffset", "state"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertObject(value, label) {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object.`
  );
}

function assertAllowedKeys(value, allowedKeys, label) {
  assertObject(value, label);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  assert(
    unknownKeys.length === 0,
    `${label} contains unsupported keys: ${unknownKeys.join(", ")}.`
  );
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, stableJson(value[key])])
  );
}

function stableString(value) {
  return JSON.stringify(stableJson(value));
}

function sortedByStableJson(values) {
  return [...values].sort((left, right) =>
    stableString(left).localeCompare(stableString(right))
  );
}

function readJson(path, label = "JSON file") {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`Could not read ${label} at ${path}.`);
  }
}

export function writeNewJsonExclusive(path, value) {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.tmp-${randomUUID()}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    linkSync(temporary, absolute);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`Output already exists: ${absolute}.`);
    }
    throw error;
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return absolute;
}

function validateProjectId(projectId) {
  assert(
    typeof projectId === "string" &&
      /^[a-z0-9][a-z0-9-]{3,62}$/.test(projectId),
    "Project ID is invalid."
  );
  return projectId;
}

function validateDatabaseId(databaseId) {
  assert(
    databaseId === "(default)" ||
      (typeof databaseId === "string" &&
        /^[a-z][a-z0-9-]{2,62}$/.test(databaseId)),
    "Firestore database ID is invalid."
  );
  return databaseId;
}

function databaseResourceName(projectId, databaseId) {
  return `projects/${projectId}/databases/${databaseId}`;
}

function decodeResourcePart(value, label) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`${label} is not valid URL encoding.`);
  }
}

function parseCompositeIndexName(name, databaseName) {
  const prefix = `${databaseName}/collectionGroups/`;
  assert(
    typeof name === "string" && name.startsWith(prefix),
    `Composite index resource is outside ${databaseName}.`
  );
  const remainder = name.slice(prefix.length);
  const separator = "/indexes/";
  const separatorIndex = remainder.indexOf(separator);
  assert(separatorIndex > 0, `Composite index resource name is invalid: ${name}.`);
  const collectionGroup = decodeResourcePart(
    remainder.slice(0, separatorIndex),
    "Composite index collection group"
  );
  const indexId = remainder.slice(separatorIndex + separator.length);
  assert(
    collectionGroup.length > 0 && !collectionGroup.includes("/") &&
      indexId.length > 0 && !indexId.includes("/"),
    `Composite index resource name is invalid: ${name}.`
  );
  return { collectionGroup, indexId };
}

function parseFieldName(name, databaseName) {
  const prefix = `${databaseName}/collectionGroups/`;
  assert(
    typeof name === "string" && name.startsWith(prefix),
    `Field resource is outside ${databaseName}.`
  );
  const remainder = name.slice(prefix.length);
  const separator = "/fields/";
  const separatorIndex = remainder.indexOf(separator);
  assert(separatorIndex > 0, `Field resource name is invalid: ${name}.`);
  const collectionGroup = decodeResourcePart(
    remainder.slice(0, separatorIndex),
    "Field collection group"
  );
  const fieldPath = decodeResourcePart(
    remainder.slice(separatorIndex + separator.length),
    "Field path"
  );
  assert(
    collectionGroup.length > 0 && !collectionGroup.includes("/") &&
      fieldPath.length > 0,
    `Field resource name is invalid: ${name}.`
  );
  return { collectionGroup, fieldPath };
}

function canonicalIndexField(field, label) {
  assertAllowedKeys(field, indexFieldResponseKeys, label);
  assert(
    typeof field.fieldPath === "string" && field.fieldPath.length > 0,
    `${label} is missing fieldPath.`
  );
  const modes = ["arrayConfig", "order", "vectorConfig"].filter(
    (key) => field[key] !== undefined
  );
  assert(modes.length === 1, `${label} must have exactly one index mode.`);
  assert(
    field.order === undefined ||
      ["ASCENDING", "DESCENDING"].includes(field.order),
    `${label} has unsupported order ${String(field.order)}.`
  );
  assert(
    field.arrayConfig === undefined || field.arrayConfig === "CONTAINS",
    `${label} has unsupported arrayConfig ${String(field.arrayConfig)}.`
  );
  assert(
    field.vectorConfig === undefined,
    `${label} uses vectorConfig, which requires a reviewed validator update.`
  );
  assert(
    field.searchConfig === undefined,
    `${label} uses searchConfig, which requires a reviewed validator update.`
  );
  const result = { fieldPath: field.fieldPath };
  if (field.order !== undefined) result.order = field.order;
  if (field.arrayConfig !== undefined) result.arrayConfig = field.arrayConfig;
  return result;
}

function implicitNameOrder(fields) {
  let result = "ASCENDING";
  for (const field of fields) {
    if (field.order !== undefined) result = field.order;
  }
  return result;
}

function assertStandardIndexDefaults(index, label) {
  assert(
    index.apiScope === undefined || index.apiScope === "ANY_API",
    `${label} has unsupported apiScope ${String(index.apiScope)}.`
  );
  assert(
    index.density === undefined || index.density === "SPARSE_ALL",
    `${label} has unsupported density ${String(index.density)}.`
  );
  assert(
    index.multikey === undefined || index.multikey === false,
    `${label} unexpectedly enables multikey.`
  );
  assert(
    index.unique === undefined || index.unique === false,
    `${label} unexpectedly enables unique indexing.`
  );
  assert(
    index.shardCount === undefined ||
      (Number.isInteger(index.shardCount) && index.shardCount === 0),
    `${label} unexpectedly configures shardCount.`
  );
  assert(
    index.searchIndexOptions === undefined,
    `${label} unexpectedly configures searchIndexOptions.`
  );
}

function canonicalCompositeIndex(index, databaseName, indexNumber) {
  const label = `Composite index ${indexNumber}`;
  assertAllowedKeys(index, indexResponseKeys, label);
  const { collectionGroup } = parseCompositeIndexName(index.name, databaseName);
  assert(index.state === "READY", `${label} is not READY: ${String(index.state)}.`);
  assert(
    ["COLLECTION", "COLLECTION_GROUP"].includes(index.queryScope),
    `${label} has unsupported queryScope ${String(index.queryScope)}.`
  );
  assertStandardIndexDefaults(index, label);
  assert(
    Array.isArray(index.fields) && index.fields.length > 0,
    `${label} has no fields.`
  );
  const fields = index.fields.map((field, fieldNumber) =>
    canonicalIndexField(field, `${label} field ${fieldNumber}`)
  );
  return {
    resource: {
      name: index.name,
      state: index.state,
    },
    definition: {
      collectionGroup,
      queryScope: index.queryScope,
      fields,
    },
  };
}

function canonicalFieldIndex(index, fieldPath, label) {
  assertAllowedKeys(index, indexResponseKeys, label);
  assert(index.state === "READY", `${label} is not READY: ${String(index.state)}.`);
  assert(
    ["COLLECTION", "COLLECTION_GROUP"].includes(index.queryScope),
    `${label} has unsupported queryScope ${String(index.queryScope)}.`
  );
  assertStandardIndexDefaults(index, label);
  assert(
    Array.isArray(index.fields) && index.fields.length === 1,
    `${label} must contain exactly one field.`
  );
  const field = canonicalIndexField(index.fields[0], `${label} field`);
  assert(
    field.fieldPath === fieldPath,
    `${label} targets ${field.fieldPath}, expected ${fieldPath}.`
  );
  const definition = { queryScope: index.queryScope };
  if (field.order !== undefined) definition.order = field.order;
  if (field.arrayConfig !== undefined) definition.arrayConfig = field.arrayConfig;
  return definition;
}

function canonicalFieldResource(field, databaseName, fieldNumber) {
  const label = `Field resource ${fieldNumber}`;
  assertAllowedKeys(field, fieldResponseKeys, label);
  const { collectionGroup, fieldPath } = parseFieldName(field.name, databaseName);
  const indexConfig = field.indexConfig;
  if (indexConfig !== undefined) {
    assertAllowedKeys(indexConfig, indexConfigResponseKeys, `${label} indexConfig`);
    assert(
      indexConfig.usesAncestorConfig === undefined ||
        typeof indexConfig.usesAncestorConfig === "boolean",
      `${label} indexConfig usesAncestorConfig is invalid.`
    );
    assert(
      indexConfig.ancestorField === undefined ||
        typeof indexConfig.ancestorField === "string",
      `${label} indexConfig ancestorField is invalid.`
    );
    assert(
      indexConfig.reverting === undefined ||
        typeof indexConfig.reverting === "boolean",
      `${label} indexConfig reverting is invalid.`
    );
  }
  const isExplicit = indexConfig?.usesAncestorConfig === false;
  if (indexConfig?.reverting !== undefined) {
    assert(indexConfig.reverting === false, `${label} is reverting.`);
  }
  if (field.ttlConfig !== undefined) {
    assertAllowedKeys(field.ttlConfig, ttlConfigResponseKeys, `${label} ttlConfig`);
  }
  const ttlPolicy = field.ttlConfig
    ? {
        name: field.name,
        state: field.ttlConfig.state,
        expirationOffset: field.ttlConfig.expirationOffset ?? null,
      }
    : null;
  if (ttlPolicy) {
    assert(
      ttlPolicy.state === "ACTIVE",
      `${label} TTL policy is not ACTIVE: ${String(ttlPolicy.state)}.`
    );
  }
  if (!isExplicit) {
    assert(
      collectionGroup !== "__default__",
      `${label} inherited __default__ configuration is not explicit.`
    );
    return { resource: null, definition: null, defaultResource: null, ttlPolicy };
  }
  assert(
    Array.isArray(indexConfig.indexes),
    `${label} explicit indexConfig has no indexes array.`
  );
  const indexes = indexConfig.indexes.map((index, indexNumber) =>
    canonicalFieldIndex(
      index,
      fieldPath,
      `${label} index ${indexNumber}`
    )
  );
  if (collectionGroup === "__default__") {
    return {
      resource: null,
      definition: null,
      defaultResource: {
        name: field.name,
        fieldPath,
        usesAncestorConfig: false,
        ancestorField: indexConfig.ancestorField ?? null,
        reverting: false,
        indexStates: indexConfig.indexes.map((index) => index.state),
        indexes: sortedByStableJson(indexes),
      },
      ttlPolicy,
    };
  }
  return {
    resource: {
      name: field.name,
      reverting: false,
      indexStates: indexConfig.indexes.map((index) => index.state),
    },
    definition: {
      collectionGroup,
      fieldPath,
      indexes: sortedByStableJson(indexes),
    },
    defaultResource: null,
    ttlPolicy,
  };
}

export function canonicalizeLiveIndexState(
  { database, indexes = [], fields = [] },
  { projectId, databaseId = "(default)", capturedAt = new Date().toISOString() }
) {
  validateProjectId(projectId);
  validateDatabaseId(databaseId);
  const databaseName = databaseResourceName(projectId, databaseId);
  assertAllowedKeys(database, databaseResponseKeys, "Database response");
  assert(database?.name === databaseName, `Unexpected database ${String(database?.name)}.`);
  assert(
    database.type === "FIRESTORE_NATIVE",
    `Expected FIRESTORE_NATIVE, found ${String(database.type)}.`
  );
  assert(
    database.databaseEdition === undefined || database.databaseEdition === "STANDARD",
    `Expected STANDARD edition, found ${String(database.databaseEdition)}.`
  );
  assert(Array.isArray(indexes), "Live indexes response must be an array.");
  assert(Array.isArray(fields), "Live fields response must be an array.");

  const composite = indexes.map((index, indexNumber) =>
    canonicalCompositeIndex(index, databaseName, indexNumber)
  );
  const fieldResults = fields.map((field, fieldNumber) =>
    canonicalFieldResource(field, databaseName, fieldNumber)
  );
  const manifest = {
    indexes: sortedByStableJson(composite.map((entry) => entry.definition)),
    fieldOverrides: sortedByStableJson(
      fieldResults
        .filter((entry) => entry.definition)
        .map((entry) => entry.definition)
    ),
  };
  validateIndexManifest(manifest);

  return {
    schemaVersion: 1,
    projectId,
    databaseId,
    capturedAt,
    raw: stableJson({ database, indexes, fields }),
    database: {
      name: database.name,
      type: database.type,
      databaseEdition: database.databaseEdition ?? "STANDARD",
      locationId: database.locationId ?? null,
    },
    manifest,
    compositeResources: sortedByStableJson(
      composite.map((entry) => ({
        ...entry.resource,
        definition: entry.definition,
      }))
    ),
    fieldResources: sortedByStableJson(
      fieldResults
        .filter((entry) => entry.resource)
        .map((entry) => ({
          ...entry.resource,
          definition: entry.definition,
        }))
    ),
    defaultFieldResources: sortedByStableJson(
      fieldResults
        .filter((entry) => entry.defaultResource)
        .map((entry) => entry.defaultResource)
    ),
    externalTtlPolicies: sortedByStableJson(
      fieldResults
        .filter((entry) => entry.ttlPolicy)
        .map((entry) => entry.ttlPolicy)
    ),
  };
}

function validateSnapshot(snapshot) {
  assert(snapshot?.schemaVersion === 1, "Unsupported index snapshot schema.");
  validateProjectId(snapshot.projectId);
  validateDatabaseId(snapshot.databaseId);
  validateIndexManifest(snapshot.manifest);
  assert(Array.isArray(snapshot.compositeResources), "Snapshot has no composite resources.");
  assert(Array.isArray(snapshot.fieldResources), "Snapshot has no field resources.");
  assert(Array.isArray(snapshot.defaultFieldResources), "Snapshot has no inherited __default__ resources.");
  assert(Array.isArray(snapshot.externalTtlPolicies), "Snapshot has no TTL policy list.");
  assert(
    snapshot.raw &&
      typeof snapshot.raw === "object" &&
      snapshot.raw.database &&
      typeof snapshot.raw.database === "object" &&
      Array.isArray(snapshot.raw.indexes) &&
      Array.isArray(snapshot.raw.fields),
    "Snapshot has no raw Firestore API evidence."
  );
  const expectedDatabaseName = databaseResourceName(
    snapshot.projectId,
    snapshot.databaseId
  );
  assert(
    snapshot.database?.name === expectedDatabaseName &&
      snapshot.database?.type === "FIRESTORE_NATIVE" &&
      snapshot.database?.databaseEdition === "STANDARD",
    "Snapshot database metadata is invalid."
  );
  assert(
    snapshot.compositeResources.every(
      (resource) =>
        resource?.state === "READY" &&
        typeof resource.name === "string" &&
        resource.name.startsWith(`${expectedDatabaseName}/collectionGroups/`)
    ),
    "Snapshot contains an invalid composite resource."
  );
  assert(
    snapshot.fieldResources.every(
      (resource) =>
        resource?.reverting === false &&
        Array.isArray(resource.indexStates) &&
        resource.indexStates.every((state) => state === "READY") &&
        typeof resource.name === "string" &&
        resource.name.startsWith(`${expectedDatabaseName}/collectionGroups/`)
    ),
    "Snapshot contains an invalid field resource."
  );
  assert(
    snapshot.defaultFieldResources.every(
      (resource) =>
        resource?.usesAncestorConfig === false &&
        resource?.reverting === false &&
        Array.isArray(resource.indexStates) &&
        resource.indexStates.every((state) => state === "READY") &&
        Array.isArray(resource.indexes) &&
        typeof resource.name === "string" &&
        resource.name.startsWith(
          `${expectedDatabaseName}/collectionGroups/__default__/fields/`
        )
    ),
    "Snapshot contains an invalid inherited __default__ resource."
  );
  assert(
    snapshot.externalTtlPolicies.every(
      (policy) =>
        policy?.state === "ACTIVE" &&
        typeof policy.name === "string" &&
        policy.name.startsWith(`${expectedDatabaseName}/collectionGroups/`)
    ),
    "Snapshot contains an invalid TTL policy."
  );
  const compositeNames = snapshot.compositeResources.map(
    (resource) => resource.name
  );
  const fieldNames = snapshot.fieldResources.map((resource) => resource.name);
  const defaultFieldNames = snapshot.defaultFieldResources.map(
    (resource) => resource.name
  );
  const ttlNames = snapshot.externalTtlPolicies.map((policy) => policy.name);
  assert(
    compositeNames.length === new Set(compositeNames).size &&
      fieldNames.length === new Set(fieldNames).size &&
      defaultFieldNames.length === new Set(defaultFieldNames).size &&
      ttlNames.length === new Set(ttlNames).size,
    "Snapshot contains duplicate resource names."
  );
  assert(
    stableString(
      sortedByStableJson(
        snapshot.compositeResources.map((resource) => resource.definition)
      )
    ) === stableString(snapshot.manifest.indexes),
    "Snapshot composite resources do not match its manifest."
  );
  assert(
    stableString(
      sortedByStableJson(
        snapshot.fieldResources.map((resource) => resource.definition)
      )
    ) === stableString(snapshot.manifest.fieldOverrides),
    "Snapshot field resources do not match its manifest."
  );
  const rederived = canonicalizeLiveIndexState(snapshot.raw, {
    projectId: snapshot.projectId,
    databaseId: snapshot.databaseId,
    capturedAt: snapshot.capturedAt,
  });
  assert(
    stableString(comparableSnapshot(rederived)) ===
      stableString(comparableSnapshot(snapshot)),
    "Snapshot canonical state does not match its raw API evidence."
  );
  return snapshot;
}

function emptyIndexDiff(diff) {
  return (
    diff.addedIndexes.length === 0 &&
    diff.removedIndexes.length === 0 &&
    diff.addedFieldOverrides.length === 0 &&
    diff.removedFieldOverrides.length === 0
  );
}

export function expandSourceIndexManifest(sourceManifest) {
  validateIndexManifest(sourceManifest);
  const indexes = sourceManifest.indexes.map((index) => {
    const fields = index.fields.map((field) => ({ ...field }));
    if (fields.at(-1)?.fieldPath !== "__name__") {
      fields.push({
        fieldPath: "__name__",
        order: implicitNameOrder(fields),
      });
    }
    return { ...index, fields };
  });
  const expanded = {
    indexes: sortedByStableJson(indexes),
    fieldOverrides: sortedByStableJson(
      sourceManifest.fieldOverrides.map((override) => ({
        ...override,
        indexes: sortedByStableJson(override.indexes),
      }))
    ),
  };
  validateIndexManifest(expanded);
  return expanded;
}

function comparableSnapshot(snapshot) {
  return {
    projectId: snapshot.projectId,
    databaseId: snapshot.databaseId,
    database: snapshot.database,
    manifest: snapshot.manifest,
    compositeResources: snapshot.compositeResources,
    fieldResources: snapshot.fieldResources,
    defaultFieldResources: snapshot.defaultFieldResources,
    externalTtlPolicies: snapshot.externalTtlPolicies,
  };
}

export function verifyLiveIndexSnapshot(
  snapshot,
  sourceManifest,
  {
    baseline = null,
    projectId = null,
    databaseId = null,
  } = {}
) {
  validateSnapshot(snapshot);
  if (projectId !== null) {
    validateProjectId(projectId);
    assert(
      snapshot.projectId === projectId,
      "Index snapshot belongs to a different Firebase project."
    );
  }
  if (databaseId !== null) {
    validateDatabaseId(databaseId);
    assert(
      snapshot.databaseId === databaseId,
      "Index snapshot belongs to a different Firestore database."
    );
  }
  validateIndexManifest(sourceManifest);
  const expandedSource = expandSourceIndexManifest(sourceManifest);
  const sourceDiff = compareIndexManifests(expandedSource, snapshot.manifest);
  assert(
    emptyIndexDiff(sourceDiff),
    "Live Firestore indexes differ from the reviewed source manifest."
  );
  let baselineEqual = null;
  if (baseline) {
    validateSnapshot(baseline);
    assert(
      baseline.projectId === snapshot.projectId &&
        baseline.databaseId === snapshot.databaseId,
      "Index baseline targets a different project or database."
    );
    baselineEqual =
      stableString(comparableSnapshot(baseline)) ===
      stableString(comparableSnapshot(snapshot));
    assert(
      baselineEqual,
      "Live index resources changed from the captured no-op baseline."
    );
  }
  return {
    schemaVersion: 1,
    projectId: snapshot.projectId,
    databaseId: snapshot.databaseId,
    sourceEqual: true,
    baselineEqual,
    compositeCount: snapshot.manifest.indexes.length,
    fieldOverrideCount: snapshot.manifest.fieldOverrides.length,
    defaultFieldResourceCount: snapshot.defaultFieldResources.length,
    externalTtlPolicyCount: snapshot.externalTtlPolicies.length,
    sourceDiff,
  };
}

async function listAll(baseUrl, key, requestJson) {
  const values = [];
  let pageToken = null;
  const seenPageTokens = new Set();
  do {
    const url = new URL(baseUrl);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await requestJson(url.toString());
    assertObject(response, `${key} response`);
    const responseKeys = new Set([key, "nextPageToken"]);
    assertAllowedKeys(response, responseKeys, `${key} response`);
    const pageValues = response[key] ?? [];
    assert(Array.isArray(pageValues), `${key} response is not an array.`);
    values.push(...pageValues);
    pageToken = response.nextPageToken ?? null;
    assert(
      pageToken === null ||
        (typeof pageToken === "string" && pageToken.length > 0),
      `${key} nextPageToken is invalid.`
    );
    if (pageToken !== null) {
      assert(
        !seenPageTokens.has(pageToken),
        `${key} response repeated a pagination token.`
      );
      seenPageTokens.add(pageToken);
    }
  } while (pageToken);
  return values;
}

export async function captureLiveIndexState({
  projectId,
  databaseId = "(default)",
  requestJson,
  capturedAt = new Date().toISOString(),
}) {
  validateProjectId(projectId);
  validateDatabaseId(databaseId);
  assert(typeof requestJson === "function", "requestJson must be a function.");
  const project = encodeURIComponent(projectId);
  const database = encodeURIComponent(databaseId);
  const apiBase = `${firestoreOrigin}/v1/projects/${project}/databases/${database}`;
  const [databaseRecord, indexes, fields] = await Promise.all([
    requestJson(apiBase),
    listAll(`${apiBase}/collectionGroups/-/indexes`, "indexes", requestJson),
    listAll(
      `${apiBase}/collectionGroups/-/fields?filter=${encodeURIComponent(
        "indexConfig.usesAncestorConfig:false OR ttlConfig:*"
      )}`,
      "fields",
      requestJson
    ),
  ]);
  return canonicalizeLiveIndexState(
    { database: databaseRecord, indexes, fields },
    { projectId, databaseId, capturedAt }
  );
}

function parseValueArguments(args, { required = [], optional = [] }) {
  const allowed = new Set([...required, ...optional]);
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    assert(
      typeof flag === "string" && flag.startsWith("--") && allowed.has(flag),
      `Unknown argument: ${String(flag)}.`
    );
    assert(!values.has(flag), `${flag} may be provided only once.`);
    const value = args[index + 1];
    assert(
      typeof value === "string" && value.length > 0 && !value.startsWith("--"),
      `${flag} requires a value.`
    );
    values.set(flag, value);
  }
  for (const flag of required) {
    assert(values.has(flag), `${flag} is required.`);
  }
  return values;
}

function reviewedTargetInputs(values) {
  const targetName = values.get("--target");
  const projectId = values.get("--project");
  const databaseId = values.get("--database");
  const policyTarget = getFirebaseDeploymentTarget(targetName);
  assertFirebaseDeploymentTarget({
    targetName,
    projectId,
    databaseId,
    storageBucket: policyTarget.storageBucket,
  });
  return { targetName, projectId, databaseId };
}

function assertDistinctPaths(entries) {
  const seen = new Map();
  for (const [label, path] of entries) {
    if (!path) continue;
    const absolute = resolve(path);
    assert(
      !seen.has(absolute),
      `${label} collides with ${seen.get(absolute)} at ${absolute}.`
    );
    seen.set(absolute, label);
  }
}

function assertNewOutputPath(path, label) {
  assert(!existsSync(path), `${label} already exists: ${path}.`);
}

async function captureCommand(args) {
  const values = parseValueArguments(args, {
    required: ["--target", "--project", "--database", "--output"],
    optional: ["--credentials"],
  });
  const { targetName, projectId, databaseId } = reviewedTargetInputs(values);
  const outputPath = resolve(values.get("--output"));
  const credentialsArgument =
    values.get("--credentials") ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  assert(
    credentialsArgument,
    "Provide --credentials or GOOGLE_APPLICATION_CREDENTIALS."
  );
  const credentialsPath = resolve(credentialsArgument);
  assertDistinctPaths([
    ["Capture output", outputPath],
    ["Service-account credentials", credentialsPath],
  ]);
  assertNewOutputPath(outputPath, "Capture output");
  const serviceAccount = readJson(
    credentialsPath,
    "service-account credentials"
  );
  const accessToken = await getAccessToken({
    serviceAccount,
    scopes: [datastoreScope],
  });
  const snapshot = await captureLiveIndexState({
    projectId,
    databaseId,
    requestJson: (url) => authorizedJsonRequest(url, { accessToken }),
  });
  writeNewJsonExclusive(outputPath, snapshot);
  console.log(
    `Captured ${targetName} ${snapshot.manifest.indexes.length} READY composite indexes and ` +
      `${snapshot.manifest.fieldOverrides.length} field override(s).`
  );
}

function verifyCommand(args) {
  const values = parseValueArguments(args, {
    required: [
      "--target",
      "--project",
      "--database",
      "--snapshot",
      "--source",
    ],
    optional: ["--baseline", "--report"],
  });
  const { targetName, projectId, databaseId } = reviewedTargetInputs(values);
  const snapshotPath = resolve(values.get("--snapshot"));
  const sourcePath = resolve(repositoryRoot, values.get("--source"));
  const baselinePath = values.has("--baseline")
    ? resolve(values.get("--baseline"))
    : null;
  const reportPath = values.has("--report")
    ? resolve(values.get("--report"))
    : null;
  assertDistinctPaths([
    ["Snapshot", snapshotPath],
    ["Source manifest", sourcePath],
    ["Baseline snapshot", baselinePath],
    ["Verification report", reportPath],
  ]);
  if (reportPath) assertNewOutputPath(reportPath, "Verification report");
  const report = verifyLiveIndexSnapshot(
    readJson(snapshotPath, "index snapshot"),
    readJson(sourcePath, "index source manifest"),
    {
      baseline: baselinePath
        ? readJson(baselinePath, "index baseline snapshot")
        : null,
      projectId,
      databaseId,
    }
  );
  if (reportPath) writeNewJsonExclusive(reportPath, report);
  console.log(
    `Live ${targetName} Firestore indexes equal source: ${report.compositeCount} composite ` +
      `indexes and ${report.fieldOverrideCount} field override(s).`
  );
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "capture") return captureCommand(args);
  if (command === "verify") return verifyCommand(args);
  throw new Error("Usage: firestore-index-state.mjs <capture|verify> [options]");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
