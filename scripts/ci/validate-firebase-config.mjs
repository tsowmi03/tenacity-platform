#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateFirebaseDeploymentTargets } from "../firebase/firebase-targets.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDir, "../..");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

const expectedFirebaseManifest = {
  firestore: {
    rules: "backend/firebase/rules/firestore.rules",
    indexes: "backend/firebase/indexes/firestore.indexes.json",
  },
  storage: [
    {
      target: "primary",
      rules: "backend/firebase/rules/storage.rules",
    },
  ],
  functions: [
    {
      source: "backend/firebase/functions",
      codebase: "default",
      ignore: [
        "node_modules",
        ".git",
        "firebase-debug.log",
        "firebase-debug.*.log",
        "*.local",
      ],
    },
  ],
  hosting: [
    {
      target: "admin-portal",
      public: "apps/admin-portal/dist",
      ignore: ["firebase.json", "**/.*", "**/node_modules/**"],
      rewrites: [{ source: "**", destination: "/index.html" }],
    },
  ],
  emulators: {
    auth: { port: 9099 },
    firestore: { port: 8080 },
    functions: { port: 5001 },
    storage: { port: 9199 },
    ui: { enabled: true },
    singleProjectMode: true,
  },
};

const expectedFirebaseAliases = {
  projects: { default: "tenacity-tutoring-b8eb2" },
  targets: {
    "tenacity-tutoring-b8eb2": {
      hosting: {
        "admin-portal": ["tenacity-tutoring-b8eb2"],
      },
      storage: {
        primary: ["tenacity-tutoring-b8eb2.firebasestorage.app"],
      },
    },
  },
};

const expectedFirebaseDeploymentTargets = {
  production: {
    projectId: "tenacity-tutoring-b8eb2",
    storageBucket: "tenacity-tutoring-b8eb2.firebasestorage.app",
    databaseId: "(default)",
  },
};

export function validateDeploymentManifests(firebase, aliases, mobile) {
  assert(
    JSON.stringify(stableJson(firebase)) ===
      JSON.stringify(stableJson(expectedFirebaseManifest)),
    "Root firebase.json differs from the reviewed deployment manifest."
  );
  assert(
    JSON.stringify(stableJson(aliases)) ===
      JSON.stringify(stableJson(expectedFirebaseAliases)),
    "Root .firebaserc differs from the reviewed project and target mapping."
  );
  assert(
    JSON.stringify(Object.keys(mobile ?? {}).sort()) === JSON.stringify(["flutter"]),
    "Mobile firebase.json must contain only FlutterFire metadata."
  );
}

export function validateDeploymentTargets(targets) {
  validateFirebaseDeploymentTargets(targets);
  assert(
    JSON.stringify(stableJson(targets)) ===
      JSON.stringify(stableJson(expectedFirebaseDeploymentTargets)),
    "Firebase deployment targets differ from the reviewed production policy."
  );
  return targets;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function canonicalIndex(index) {
  return JSON.stringify(stableJson({
    collectionGroup: index.collectionGroup,
    queryScope: index.queryScope,
    fields: index.fields,
  }));
}

function assertQueryScope(queryScope, label) {
  assert(
    ["COLLECTION", "COLLECTION_GROUP"].includes(queryScope),
    `${label} has unsupported queryScope ${String(queryScope)}.`
  );
}

function assertIndexMode(index, label) {
  const modes = ["order", "arrayConfig", "vectorConfig"].filter(
    (key) => index[key] !== undefined
  );
  assert(modes.length === 1, `${label} must have exactly one index mode.`);
  if (index.order !== undefined) {
    assert(
      ["ASCENDING", "DESCENDING"].includes(index.order),
      `${label} has unsupported order ${String(index.order)}.`
    );
  }
  if (index.arrayConfig !== undefined) {
    assert(
      index.arrayConfig === "CONTAINS",
      `${label} has unsupported arrayConfig ${String(index.arrayConfig)}.`
    );
  }
  assert(
    index.vectorConfig === undefined,
    `${label} uses vectorConfig, which requires an explicit validator update.`
  );
}

function canonicalFieldOverride(override) {
  const indexes = override.indexes
    .map((index) => stableJson(index))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return JSON.stringify(stableJson({
    collectionGroup: override.collectionGroup,
    fieldPath: override.fieldPath,
    indexes,
  }));
}

export function validateIndexManifest(manifest) {
  assert(
    JSON.stringify(Object.keys(manifest ?? {}).sort()) ===
      JSON.stringify(["fieldOverrides", "indexes"]),
    "Index manifest must contain only indexes and fieldOverrides."
  );
  assert(Array.isArray(manifest?.indexes), "Index manifest must contain an indexes array.");
  assert(Array.isArray(manifest?.fieldOverrides), "Index manifest must contain a fieldOverrides array.");
  const canonical = manifest.indexes.map((index, indexNumber) => {
    assert(
      JSON.stringify(Object.keys(index).sort()) ===
        JSON.stringify(["collectionGroup", "fields", "queryScope"]),
      `Index ${indexNumber} contains unsupported keys.`
    );
    assert(
      typeof index.collectionGroup === "string" && index.collectionGroup.length > 0,
      `Index ${indexNumber} is missing collectionGroup.`
    );
    assert(index.queryScope, `Index ${indexNumber} is missing queryScope.`);
    assertQueryScope(index.queryScope, `Index ${indexNumber}`);
    assert(Array.isArray(index.fields) && index.fields.length > 0, `Index ${indexNumber} has no fields.`);
    for (const [fieldNumber, field] of index.fields.entries()) {
      const fieldKeys = Object.keys(field).sort();
      assert(
        fieldKeys.length === 2 && fieldKeys.includes("fieldPath"),
        `Index ${indexNumber} field ${fieldNumber} contains unsupported keys.`
      );
      assert(
        typeof field.fieldPath === "string" && field.fieldPath.length > 0,
        `Index ${indexNumber} field ${fieldNumber} is missing fieldPath.`
      );
      assertIndexMode(field, `Index ${indexNumber} field ${field.fieldPath}`);
    }
    const fieldPaths = index.fields.map((field) => field.fieldPath);
    assert(
      fieldPaths.length === new Set(fieldPaths).size,
      `Index ${indexNumber} contains duplicate field paths.`
    );
    return canonicalIndex(index);
  });
  assert(canonical.length === new Set(canonical).size, "Index manifest contains duplicate definitions.");
  const overrideKeys = manifest.fieldOverrides.map((override, overrideNumber) => {
    assert(
      JSON.stringify(Object.keys(override).sort()) ===
        JSON.stringify(["collectionGroup", "fieldPath", "indexes"]),
      `Field override ${overrideNumber} contains unsupported keys.`
    );
    assert(
      typeof override.collectionGroup === "string" && override.collectionGroup.length > 0,
      `Field override ${overrideNumber} is missing collectionGroup.`
    );
    assert(
      typeof override.fieldPath === "string" && override.fieldPath.length > 0,
      `Field override ${overrideNumber} is missing fieldPath.`
    );
    assert(
      Array.isArray(override.indexes),
      `Field override ${overrideNumber} must contain an indexes array.`
    );
    for (const [indexNumber, index] of override.indexes.entries()) {
      const indexKeys = Object.keys(index).sort();
      assert(
        indexKeys.length === 2 && indexKeys.includes("queryScope"),
        `Field override ${overrideNumber} index ${indexNumber} contains unsupported keys.`
      );
      assert(index.queryScope, `Field override ${overrideNumber} index ${indexNumber} has no queryScope.`);
      assertQueryScope(
        index.queryScope,
        `Field override ${overrideNumber} index ${indexNumber}`
      );
      assertIndexMode(index, `Field override ${overrideNumber} index ${indexNumber}`);
    }
    const definitions = override.indexes.map((index) => JSON.stringify(stableJson(index)));
    assert(
      definitions.length === new Set(definitions).size,
      `Field override ${overrideNumber} contains duplicate index definitions.`
    );
    return `${override.collectionGroup}/${override.fieldPath}`;
  });
  assert(
    overrideKeys.length === new Set(overrideKeys).size,
    "Index manifest contains duplicate field overrides."
  );
  return {
    compositeCount: manifest.indexes.length,
    fieldOverrideCount: manifest.fieldOverrides.length,
  };
}

function decodedDefinitions(values) {
  return values.map((value) => JSON.parse(value));
}

export function compareIndexManifests(baseManifest, currentManifest) {
  validateIndexManifest(baseManifest);
  validateIndexManifest(currentManifest);
  const baseIndexes = new Set(baseManifest.indexes.map(canonicalIndex));
  const currentIndexes = new Set(currentManifest.indexes.map(canonicalIndex));
  const baseOverrides = new Set(baseManifest.fieldOverrides.map(canonicalFieldOverride));
  const currentOverrides = new Set(currentManifest.fieldOverrides.map(canonicalFieldOverride));
  return {
    addedIndexes: decodedDefinitions(
      [...currentIndexes].filter((definition) => !baseIndexes.has(definition))
    ),
    removedIndexes: decodedDefinitions(
      [...baseIndexes].filter((definition) => !currentIndexes.has(definition))
    ),
    addedFieldOverrides: decodedDefinitions(
      [...currentOverrides].filter((definition) => !baseOverrides.has(definition))
    ),
    removedFieldOverrides: decodedDefinitions(
      [...baseOverrides].filter((definition) => !currentOverrides.has(definition))
    ),
  };
}

export function validateSourceBaseline(baseline) {
  assert(baseline?.schemaVersion === 1, "Unsupported Firebase source baseline schema.");
  const requiredBaselinePaths = [
    "backend/firebase/indexes/firestore.indexes.json",
    "backend/firebase/rules/firestore.rules",
    "backend/firebase/rules/storage.rules",
    "backend/firebase/storage.cors.json",
  ];
  assert(
    JSON.stringify(Object.keys(baseline.sha256 ?? {}).sort()) ===
      JSON.stringify(requiredBaselinePaths),
    "Firebase source baseline must contain exactly the four reviewed source paths."
  );
  assert(
    Number.isInteger(baseline.firestoreIndexes?.compositeCount) &&
      Number.isInteger(baseline.firestoreIndexes?.fieldOverrideCount),
    "Firebase source baseline must contain reviewed index counts."
  );
  return baseline;
}

export function validateFirebaseConfiguration(repositoryRoot = defaultRoot) {
  const firebase = readJson(resolve(repositoryRoot, "firebase.json"));
  const aliases = readJson(resolve(repositoryRoot, ".firebaserc"));
  const mobile = readJson(resolve(repositoryRoot, "apps/mobile/firebase.json"));
  const deploymentTargets = readJson(
    resolve(repositoryRoot, "backend/firebase/deployment-targets.json")
  );
  const baseline = readJson(
    resolve(repositoryRoot, "backend/firebase/inventory/source-baseline.json")
  );
  validateDeploymentManifests(firebase, aliases, mobile);
  validateDeploymentTargets(deploymentTargets);
  validateSourceBaseline(baseline);
  assert(
    firebase.firestore?.rules === "backend/firebase/rules/firestore.rules",
    "Root Firestore rules path is not canonical."
  );
  assert(
    firebase.firestore?.indexes === "backend/firebase/indexes/firestore.indexes.json",
    "Root Firestore index path is not canonical."
  );
  assert(
    Array.isArray(firebase.storage) &&
      firebase.storage.length === 1 &&
      firebase.storage[0].target === "primary" &&
      firebase.storage[0].rules === "backend/firebase/rules/storage.rules",
    "Root Storage rules target and path are not canonical."
  );
  assert(
    Array.isArray(firebase.functions) && firebase.functions.length === 1,
    "Root manifest must contain one Functions codebase."
  );
  assert(
    firebase.functions[0].source === "backend/firebase/functions" &&
      firebase.functions[0].codebase === "default",
    "Root Functions source/codebase is not canonical."
  );
  assert(
    Array.isArray(firebase.hosting) && firebase.hosting.length === 1,
    "Root manifest must contain one explicit Hosting target."
  );
  assert(
    firebase.hosting[0].target === "admin-portal" &&
      firebase.hosting[0].public === "apps/admin-portal/dist",
    "Hosting must use the admin-portal target and portal dist directory."
  );
  assert(
    JSON.stringify(firebase.hosting[0].rewrites) ===
      JSON.stringify([{ source: "**", destination: "/index.html" }]),
    "Hosting must retain the reviewed SPA fallback."
  );
  const deployableMobileKeys = ["database", "firestore", "functions", "hosting", "storage"].filter(
    (key) => Object.prototype.hasOwnProperty.call(mobile, key)
  );
  assert(
    deployableMobileKeys.length === 0,
    `Mobile Firebase metadata contains deployable keys: ${deployableMobileKeys.join(", ")}.`
  );
  assert(mobile.flutter, "Mobile Firebase metadata must retain its Flutter block.");

  const projectId = aliases.projects?.default;
  assert(projectId === "tenacity-tutoring-b8eb2", "Root default Firebase project changed.");
  const targetSites = aliases.targets?.[projectId]?.hosting?.["admin-portal"];
  assert(
    Array.isArray(targetSites) && targetSites.length === 1 && targetSites[0] === projectId,
    "admin-portal Hosting target mapping changed."
  );
  const configuredPaths = [
    firebase.firestore.rules,
    firebase.firestore.indexes,
    firebase.storage[0].rules,
    firebase.functions[0].source,
  ];
  for (const relativePath of configuredPaths) {
    assert(existsSync(resolve(repositoryRoot, relativePath)), `Configured path does not exist: ${relativePath}.`);
  }

  const indexManifest = readJson(resolve(repositoryRoot, firebase.firestore.indexes));
  const indexCounts = validateIndexManifest(indexManifest);
  assert(
    indexCounts.compositeCount === baseline.firestoreIndexes.compositeCount,
    `Expected ${baseline.firestoreIndexes.compositeCount} composite indexes, found ${indexCounts.compositeCount}.`
  );
  assert(
    indexCounts.fieldOverrideCount === baseline.firestoreIndexes.fieldOverrideCount,
    `Expected ${baseline.firestoreIndexes.fieldOverrideCount} field override, found ${indexCounts.fieldOverrideCount}.`
  );

  const hashes = {};
  for (const [relativePath, expectedHash] of Object.entries(baseline.sha256)) {
    const absolutePath = resolve(repositoryRoot, relativePath);
    assert(existsSync(absolutePath), `Baseline source is missing: ${relativePath}.`);
    const actualHash = sha256(absolutePath);
    assert(
      actualHash === expectedHash,
      `${relativePath} hash changed: expected ${expectedHash}, got ${actualHash}.`
    );
    hashes[relativePath] = actualHash;
  }
  return {
    schemaVersion: 1,
    projectId,
    productionStorageBucket: deploymentTargets.production.storageBucket,
    productionDatabaseId: deploymentTargets.production.databaseId,
    functionsCodebase: firebase.functions[0].codebase,
    hostingTarget: firebase.hosting[0].target,
    hostingSite: targetSites[0],
    storageTarget: firebase.storage[0].target,
    ...indexCounts,
    hashes,
  };
}

function main() {
  const args = process.argv.slice(2);
  const reportIndex = args.indexOf("--report");
  const reportPath = reportIndex === -1 ? null : args[reportIndex + 1];
  if (reportIndex !== -1) assert(reportPath, "--report requires a path.");
  const baseIndex = args.indexOf("--base");
  const baseRef = baseIndex === -1 ? null : args[baseIndex + 1];
  if (baseIndex !== -1) {
    assert(baseRef, "--base requires a commit SHA.");
    assert(/^[0-9a-f]{40}$/.test(baseRef), "--base must be a full commit SHA.");
  }
  const report = validateFirebaseConfiguration();
  if (baseRef) {
    const relativePath = "backend/firebase/indexes/firestore.indexes.json";
    const baseManifest = JSON.parse(
      execFileSync("git", ["show", `${baseRef}:${relativePath}`], {
        cwd: defaultRoot,
        encoding: "utf8",
      })
    );
    const currentManifest = readJson(resolve(defaultRoot, relativePath));
    report.indexDiff = {
      baseRef,
      ...compareIndexManifests(baseManifest, currentManifest),
    };
  }
  if (reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (report.indexDiff) {
    const removalCount =
      report.indexDiff.removedIndexes.length +
      report.indexDiff.removedFieldOverrides.length;
    assert(removalCount === 0, `Index review found ${removalCount} removal(s).`);
  }
  console.log(
    `Firebase configuration valid: ${report.compositeCount} indexes, ` +
      `${report.fieldOverrideCount} field override, Hosting target ${report.hostingTarget}.`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  }
}
