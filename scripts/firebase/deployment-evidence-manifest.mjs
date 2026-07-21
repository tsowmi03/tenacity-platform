import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { assertFirebaseDeploymentTarget } from "./firebase-targets.mjs";

const allowedOutcomes = new Set([
  "success",
  "failure",
  "skipped",
  "cancelled",
  "unknown",
]);

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

function requiredString(value, label, pattern) {
  assert(typeof value === "string" && value.length > 0, `${label} is required.`);
  if (pattern) assert(pattern.test(value), `${label} is invalid.`);
  return value;
}

function positiveIntegerString(value, label) {
  requiredString(value, label, /^\d+$/);
  const parsed = Number(value);
  assert(Number.isSafeInteger(parsed) && parsed > 0, `${label} is invalid.`);
  return parsed;
}

function normalizedPairs(values, label) {
  const entries = {};
  for (const value of values ?? []) {
    assert(typeof value === "string", `${label} must be a string.`);
    const separator = value.indexOf("=");
    assert(separator > 0 && separator < value.length - 1, `${label} must use name=value.`);
    const name = value.slice(0, separator);
    const pairValue = value.slice(separator + 1);
    assert(/^[a-z][a-zA-Z0-9]*$/.test(name), `${label} name is invalid.`);
    assert(entries[name] === undefined, `${label} name ${name} is duplicated.`);
    entries[name] = pairValue;
  }
  return entries;
}

function normalizedOutcomeSets(values) {
  const pairs = normalizedPairs(values, "Allowed outcome set");
  return Object.fromEntries(
    Object.entries(pairs).map(([name, value]) => {
      const outcomes = value.split(",");
      assert(
        outcomes.length > 0 && outcomes.every((outcome) => allowedOutcomes.has(outcome)),
        `Allowed outcome set ${name} is invalid.`
      );
      return [name, [...new Set(outcomes)]];
    })
  );
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function normalizeEvidenceFiles(filePairs) {
  const files = {};
  const usedPaths = new Set();
  for (const [name, path] of Object.entries(filePairs)) {
    const absolutePath = resolve(path);
    const relativePath = basename(absolutePath);
    assert(relativePath === basename(path), `Evidence file ${name} must have a file name.`);
    assert(!usedPaths.has(relativePath), `Evidence file path ${relativePath} is duplicated.`);
    usedPaths.add(relativePath);
    if (!existsSync(absolutePath)) {
      files[name] = { path: relativePath, present: false, bytes: null, sha256: null };
      continue;
    }
    const stats = statSync(absolutePath);
    assert(stats.isFile(), `Evidence path ${name} must be a regular file.`);
    files[name] = {
      path: relativePath,
      present: true,
      bytes: stats.size,
      sha256: sha256File(absolutePath),
    };
  }
  return files;
}

function validateOutcomeEntries(outcomes) {
  assert(
    outcomes && typeof outcomes === "object" && !Array.isArray(outcomes),
    "Evidence outcomes must be an object."
  );
  assert(Object.keys(outcomes).length > 0, "At least one evidence outcome is required.");
  for (const [name, outcome] of Object.entries(outcomes)) {
    assert(/^[a-z][a-zA-Z0-9]*$/.test(name), "Evidence outcome name is invalid.");
    assert(allowedOutcomes.has(outcome), `Evidence outcome ${name} is invalid.`);
  }
}

export function createEvidenceManifest(
  {
    evidenceType,
    targetName,
    projectId,
    storageBucket,
    databaseId,
    gitSha,
    runId,
    runAttempt,
    repository,
    workflow,
    job,
    outcomes,
    evidenceFiles,
  },
  { now = () => new Date() } = {}
) {
  requiredString(evidenceType, "Evidence type", /^[a-z][a-z0-9-]+$/);
  requiredString(gitSha, "Git SHA", /^[0-9a-f]{40}$/);
  requiredString(repository, "Repository", /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
  requiredString(workflow, "Workflow");
  requiredString(job, "Job", /^[A-Za-z0-9_.-]+$/);
  const normalizedRunId = positiveIntegerString(String(runId), "Run ID");
  const normalizedRunAttempt = positiveIntegerString(
    String(runAttempt),
    "Run attempt"
  );
  assertFirebaseDeploymentTarget({
    targetName,
    projectId,
    storageBucket,
    databaseId,
  });
  validateOutcomeEntries(outcomes);
  assert(
    evidenceFiles && typeof evidenceFiles === "object" && !Array.isArray(evidenceFiles),
    "Evidence files must be an object."
  );
  assert(Object.keys(evidenceFiles).length > 0, "At least one evidence file is required.");
  const generatedAt = now();
  assert(generatedAt instanceof Date && !Number.isNaN(generatedAt.valueOf()), "Evidence time is invalid.");

  return {
    schemaVersion: 1,
    evidenceType,
    generatedAt: generatedAt.toISOString(),
    repository,
    workflow,
    job,
    gitSha,
    runId: normalizedRunId,
    runAttempt: normalizedRunAttempt,
    target: {
      name: targetName,
      projectId,
      storageBucket,
      databaseId,
    },
    outcomes: structuredClone(outcomes),
    files: normalizeEvidenceFiles(evidenceFiles),
  };
}

function validateFileRecord(record, label) {
  exactKeys(record, ["path", "present", "bytes", "sha256"], label);
  requiredString(record.path, `${label} path`, /^[A-Za-z0-9_.-]+$/);
  assert(record.path === basename(record.path), `${label} path must be a file name.`);
  assert(typeof record.present === "boolean", `${label} presence is invalid.`);
  if (record.present) {
    assert(Number.isSafeInteger(record.bytes) && record.bytes >= 0, `${label} size is invalid.`);
    requiredString(record.sha256, `${label} SHA-256`, /^[0-9a-f]{64}$/);
  } else {
    assert(record.bytes === null && record.sha256 === null, `${label} missing-file record is invalid.`);
  }
}

export function verifyEvidenceManifest(
  manifest,
  {
    artifactDirectory,
    evidenceType,
    targetName,
    projectId,
    storageBucket,
    databaseId,
    gitSha,
    runId,
    runAttempt,
    repository,
    requiredFiles = [],
    requiredOutcomes = {},
    allowedOutcomeSets = {},
  }
) {
  exactKeys(
    manifest,
    [
      "schemaVersion",
      "evidenceType",
      "generatedAt",
      "repository",
      "workflow",
      "job",
      "gitSha",
      "runId",
      "runAttempt",
      "target",
      "outcomes",
      "files",
    ],
    "Evidence manifest"
  );
  assert(manifest.schemaVersion === 1, "Evidence manifest schema is unsupported.");
  assert(manifest.evidenceType === evidenceType, "Evidence type does not match.");
  assert(manifest.repository === repository, "Evidence repository does not match.");
  assert(manifest.gitSha === gitSha, "Evidence Git SHA does not match.");
  assert(manifest.runId === positiveIntegerString(String(runId), "Expected run ID"), "Evidence run ID does not match.");
  assert(
    manifest.runAttempt === positiveIntegerString(String(runAttempt), "Expected run attempt"),
    "Evidence run attempt does not match."
  );
  requiredString(manifest.generatedAt, "Evidence generated time");
  assert(!Number.isNaN(Date.parse(manifest.generatedAt)), "Evidence generated time is invalid.");
  requiredString(manifest.workflow, "Evidence workflow");
  requiredString(manifest.job, "Evidence job", /^[A-Za-z0-9_.-]+$/);
  exactKeys(
    manifest.target,
    ["name", "projectId", "storageBucket", "databaseId"],
    "Evidence target"
  );
  assertFirebaseDeploymentTarget({
    targetName: manifest.target.name,
    projectId: manifest.target.projectId,
    storageBucket: manifest.target.storageBucket,
    databaseId: manifest.target.databaseId,
  });
  assert(
    JSON.stringify(manifest.target) ===
      JSON.stringify({ name: targetName, projectId, storageBucket, databaseId }),
    "Evidence target does not match."
  );
  validateOutcomeEntries(manifest.outcomes);
  for (const [name, expected] of Object.entries(requiredOutcomes)) {
    assert(allowedOutcomes.has(expected), `Required outcome ${name} is invalid.`);
    assert(manifest.outcomes[name] === expected, `Evidence outcome ${name} does not match.`);
  }
  for (const [name, expectedValues] of Object.entries(allowedOutcomeSets)) {
    assert(Array.isArray(expectedValues) && expectedValues.length > 0, `Allowed outcome set ${name} is empty.`);
    assert(
      expectedValues.every((outcome) => allowedOutcomes.has(outcome)),
      `Allowed outcome set ${name} is invalid.`
    );
    assert(
      expectedValues.includes(manifest.outcomes[name]),
      `Evidence outcome ${name} is not allowed.`
    );
  }
  assert(
    manifest.files && typeof manifest.files === "object" && !Array.isArray(manifest.files),
    "Evidence files are invalid."
  );
  const directory = resolve(artifactDirectory);
  const usedPaths = new Set();
  for (const [name, record] of Object.entries(manifest.files)) {
    assert(/^[a-z][a-zA-Z0-9]*$/.test(name), "Evidence file name is invalid.");
    validateFileRecord(record, `Evidence file ${name}`);
    assert(!usedPaths.has(record.path), `Evidence file path ${record.path} is duplicated.`);
    usedPaths.add(record.path);
    if (!record.present) continue;
    const path = resolve(directory, record.path);
    assert(dirname(path) === directory, `Evidence file ${name} escapes the artifact directory.`);
    assert(existsSync(path) && statSync(path).isFile(), `Evidence file ${name} is missing.`);
    assert(statSync(path).size === record.bytes, `Evidence file ${name} size does not match.`);
    assert(sha256File(path) === record.sha256, `Evidence file ${name} hash does not match.`);
  }
  for (const name of requiredFiles) {
    const record = manifest.files[name];
    assert(record?.present === true, `Required evidence file ${name} is missing.`);
  }
  return {
    valid: true,
    evidenceType: manifest.evidenceType,
    gitSha: manifest.gitSha,
    runId: manifest.runId,
    runAttempt: manifest.runAttempt,
    verifiedFiles: Object.values(manifest.files).filter((record) => record.present).length,
  };
}

function parseArgs(args, allowedScalarNames) {
  const scalar = {};
  const list = {
    outcome: [],
    file: [],
    "require-file": [],
    "require-outcome": [],
    "require-outcome-one-of": [],
  };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    assert(token.startsWith("--"), `Unexpected argument ${token}.`);
    const name = token.slice(2);
    const value = args[index + 1];
    assert(value !== undefined && !value.startsWith("--"), `Argument --${name} requires a value.`);
    index += 1;
    if (list[name]) {
      list[name].push(value);
      continue;
    }
    assert(allowedScalarNames.has(name), `Unknown argument --${name}.`);
    assert(scalar[name] === undefined, `Argument --${name} is duplicated.`);
    scalar[name] = value;
  }
  return { scalar, list };
}

function commonOptions(scalar) {
  return {
    evidenceType: scalar.type,
    targetName: scalar.target,
    projectId: scalar.project,
    storageBucket: scalar["storage-bucket"],
    databaseId: scalar.database,
    gitSha: scalar["git-sha"],
    runId: scalar["run-id"],
    runAttempt: scalar["run-attempt"],
    repository: scalar.repository,
  };
}

export function runCli(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  assert(["create", "verify"].includes(command), "Command must be create or verify.");
  const commonScalarNames = [
    "type",
    "target",
    "project",
    "storage-bucket",
    "database",
    "git-sha",
    "run-id",
    "run-attempt",
    "repository",
  ];
  const allowedScalarNames = new Set(
    command === "create"
      ? [...commonScalarNames, "workflow", "job", "output"]
      : [...commonScalarNames, "manifest", "artifact-directory"]
  );
  const { scalar, list } = parseArgs(rest, allowedScalarNames);
  if (command === "create") {
    assert(list["require-file"].length === 0, "--require-file is accepted only by verify.");
    assert(list["require-outcome"].length === 0, "--require-outcome is accepted only by verify.");
    assert(
      list["require-outcome-one-of"].length === 0,
      "--require-outcome-one-of is accepted only by verify."
    );
    const evidenceFiles = normalizedPairs(list.file, "File");
    const output = resolve(requiredString(scalar.output, "Output path"));
    assert(
      Object.values(evidenceFiles).every((path) => resolve(path) !== output),
      "Evidence manifest output cannot also be an evidence input."
    );
    const manifest = createEvidenceManifest({
      ...commonOptions(scalar),
      workflow: scalar.workflow,
      job: scalar.job,
      outcomes: normalizedPairs(list.outcome, "Outcome"),
      evidenceFiles,
    });
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return manifest;
  }

  assert(list.outcome.length === 0, "--outcome is accepted only by create.");
  assert(list.file.length === 0, "--file is accepted only by create.");

  const manifestPath = resolve(requiredString(scalar.manifest, "Manifest path"));
  const artifactDirectory = resolve(
    scalar["artifact-directory"] ?? dirname(manifestPath)
  );
  const report = verifyEvidenceManifest(
    JSON.parse(readFileSync(manifestPath, "utf8")),
    {
      ...commonOptions(scalar),
      artifactDirectory,
      requiredFiles: list["require-file"],
      requiredOutcomes: normalizedPairs(list["require-outcome"], "Required outcome"),
      allowedOutcomeSets: normalizedOutcomeSets(list["require-outcome-one-of"]),
    }
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
