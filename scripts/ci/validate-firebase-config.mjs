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

// The production Hosting surfaces, in manifest order. Two independent
// applications on two sites in one Firebase project: the admin portal and the
// resource portal. Adding a third is a reviewed change, not a deploy-time one.
const reviewedHostingTargets = [
  {
    target: "admin-portal",
    public: "apps/admin-portal/dist",
    site: "tenacity-tutoring-b8eb2",
  },
  {
    target: "resource-portal",
    public: "apps/resource-portal/dist",
    site: "tenacity-resources-b8eb2",
  },
];

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
  // Exactly the two reviewed production Hosting targets. A third target, or a
  // changed site mapping, must go through review rather than appearing in a
  // deploy.
  hosting: [
    {
      target: "admin-portal",
      public: "apps/admin-portal/dist",
      ignore: ["firebase.json", "**/.*", "**/node_modules/**"],
      rewrites: [{ source: "**", destination: "/index.html" }],
    },
    {
      target: "resource-portal",
      public: "apps/resource-portal/dist",
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
  projects: {
    default: "tenacity-tutoring-b8eb2",
    staging: "tenacity-tutoring-staging",
  },
  targets: {
    "tenacity-tutoring-b8eb2": {
      hosting: {
        "admin-portal": ["tenacity-tutoring-b8eb2"],
        "resource-portal": ["tenacity-resources-b8eb2"],
      },
      storage: {
        primary: ["tenacity-tutoring-b8eb2.firebasestorage.app"],
      },
    },
    "tenacity-tutoring-staging": {
      storage: {
        primary: ["tenacity-tutoring-staging.firebasestorage.app"],
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
  staging: {
    projectId: "tenacity-tutoring-staging",
    storageBucket: "tenacity-tutoring-staging.firebasestorage.app",
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
    "Firebase deployment targets differ from the reviewed Firebase deployment policy."
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
  // The index counts that used to live here were redundant: any change to the
  // index manifest necessarily changes its hash above, so the counts added no
  // detection power and one more thing to forget. They are computed and
  // printed instead.
  assert(
    baseline.firestoreIndexes === undefined,
    "firestoreIndexes counts were removed from the baseline; they are derived " +
      "from the manifest and fully covered by its hash."
  );
  return baseline;
}

export const BASELINE_PATHS = [
  "backend/firebase/indexes/firestore.indexes.json",
  "backend/firebase/rules/firestore.rules",
  "backend/firebase/rules/storage.rules",
  "backend/firebase/storage.cors.json",
];

/**
 * Rewrite the baseline to match what is on disk.
 *
 * Explicit and never run by CI: a hash that a pipeline can refresh on its own
 * detects nothing. The point is only to remove the transcription step, since
 * the change being blessed is always visible in the same pull request's diff.
 */
export function writeSourceBaseline(repositoryRoot = defaultRoot) {
  const path = resolve(
    repositoryRoot,
    "backend/firebase/inventory/source-baseline.json"
  );
  const baseline = readJson(path);
  const changes = [];
  for (const relativePath of BASELINE_PATHS) {
    const actual = sha256(resolve(repositoryRoot, relativePath));
    if (baseline.sha256[relativePath] !== actual) {
      changes.push({
        path: relativePath,
        from: baseline.sha256[relativePath],
        to: actual,
      });
      baseline.sha256[relativePath] = actual;
    }
  }
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
  return changes;
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
    Array.isArray(firebase.hosting) &&
      firebase.hosting.length === reviewedHostingTargets.length,
    `Root manifest must contain exactly the ${reviewedHostingTargets.length} reviewed Hosting targets.`
  );
  reviewedHostingTargets.forEach((expected, index) => {
    const entry = firebase.hosting[index];
    assert(
      entry.target === expected.target && entry.public === expected.public,
      `Hosting target ${index} must be ${expected.target} serving ${expected.public}.`
    );
    assert(
      JSON.stringify(entry.rewrites) ===
        JSON.stringify([{ source: "**", destination: "/index.html" }]),
      `Hosting target ${expected.target} must retain the reviewed SPA fallback.`
    );
  });
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
  const configuredHosting = aliases.targets?.[projectId]?.hosting ?? {};
  assert(
    JSON.stringify(Object.keys(configuredHosting).sort()) ===
      JSON.stringify(reviewedHostingTargets.map((entry) => entry.target).sort()),
    "Hosting target mapping must contain exactly the reviewed targets."
  );
  for (const expected of reviewedHostingTargets) {
    const sites = configuredHosting[expected.target];
    assert(
      Array.isArray(sites) && sites.length === 1 && sites[0] === expected.site,
      `${expected.target} Hosting target mapping changed.`
    );
  }
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
  // Counts are derived and reported. The manifest's own hash below is what
  // detects a change to it, and the base-commit diff is what rejects removals.
  const indexCounts = validateIndexManifest(indexManifest);

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
    stagingProjectId: deploymentTargets.staging.projectId,
    stagingStorageBucket: deploymentTargets.staging.storageBucket,
    stagingDatabaseId: deploymentTargets.staging.databaseId,
    functionsCodebase: firebase.functions[0].codebase,
    hostingTargets: reviewedHostingTargets.map(({ target, site }) => ({ target, site })),
    storageTarget: firebase.storage[0].target,
    ...indexCounts,
    hashes,
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--write")) {
    const changes = writeSourceBaseline();
    if (changes.length === 0) {
      console.log("Source baseline already matches the working tree.");
      return;
    }
    for (const change of changes) {
      console.log(`${change.path}\n  ${change.from}\n  ${change.to}`);
    }
    console.log(
      `Rewrote ${changes.length} baseline hash(es). Review the diff before committing.`
    );
    return;
  }
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
      `${report.fieldOverrideCount} field override, Hosting targets ` +
      `${report.hostingTargets.map(({ target, site }) => `${target} → ${site}`).join(", ")}.`
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
