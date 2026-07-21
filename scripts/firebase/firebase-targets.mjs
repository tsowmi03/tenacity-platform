import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, "../..");
const defaultTargetsPath = resolve(
  repositoryRoot,
  "backend/firebase/deployment-targets.json"
);
const allowedTargetNames = new Set(["production", "staging"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, keys, label) {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object.`
  );
  assert(
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort()),
    `${label} has unexpected or missing fields.`
  );
}

export function validateFirebaseProjectId(projectId) {
  assert(
    typeof projectId === "string" &&
      /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId),
    "Firebase project ID is invalid."
  );
  return projectId;
}

export function validateFirebaseStorageBucket(storageBucket) {
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

export function validateFirestoreDatabaseId(databaseId) {
  assert(
    databaseId === "(default)" ||
      (typeof databaseId === "string" &&
        /^[a-z][a-z0-9-]{2,62}$/.test(databaseId)),
    "Firestore database ID is invalid."
  );
  return databaseId;
}

export function validateFirebaseDeploymentTargets(targets) {
  assert(
    targets && typeof targets === "object" && !Array.isArray(targets),
    "Firebase deployment targets must be an object."
  );
  const names = Object.keys(targets);
  assert(names.includes("production"), "Firebase production target is required.");
  assert(
    names.every((name) => allowedTargetNames.has(name)),
    "Firebase deployment targets may contain only production and staging."
  );
  for (const name of names) {
    const target = targets[name];
    exactKeys(
      target,
      ["projectId", "storageBucket", "databaseId"],
      `Firebase ${name} target`
    );
    validateFirebaseProjectId(target.projectId);
    validateFirebaseStorageBucket(target.storageBucket);
    validateFirestoreDatabaseId(target.databaseId);
  }
  if (targets.staging) {
    assert(
      targets.staging.projectId !== targets.production.projectId &&
        targets.staging.storageBucket !== targets.production.storageBucket,
      "Firebase staging must use a different project and Storage bucket from production."
    );
  }
  return targets;
}

export function loadFirebaseDeploymentTargets(path = defaultTargetsPath) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch {
    throw new Error(`Could not read Firebase deployment targets at ${resolve(path)}.`);
  }
  return validateFirebaseDeploymentTargets(parsed);
}

export function getFirebaseDeploymentTarget(
  targetName,
  { targetsPath = defaultTargetsPath } = {}
) {
  assert(
    allowedTargetNames.has(targetName),
    "Firebase target must be production or staging."
  );
  const targets = loadFirebaseDeploymentTargets(targetsPath);
  assert(
    targets[targetName],
    `Firebase ${targetName} target is not configured.`
  );
  return structuredClone(targets[targetName]);
}

export function assertFirebaseDeploymentTarget(
  { targetName, projectId, storageBucket, databaseId },
  options
) {
  const expected = getFirebaseDeploymentTarget(targetName, options);
  validateFirebaseProjectId(projectId);
  validateFirebaseStorageBucket(storageBucket);
  validateFirestoreDatabaseId(databaseId);
  assert(
    projectId === expected.projectId &&
      storageBucket === expected.storageBucket &&
      databaseId === expected.databaseId,
    `Firebase ${targetName} target does not match the reviewed deployment policy.`
  );
  return expected;
}

export const firebaseDeploymentTargetsPath = defaultTargetsPath;
