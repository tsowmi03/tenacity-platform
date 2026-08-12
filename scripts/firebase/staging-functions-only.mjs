#!/usr/bin/env node

/*
 * Turns backend/firebase/inventory/staging-functions.json into the
 * `--only` argument for a partial Cloud Functions deploy to staging.
 *
 *   node scripts/firebase/staging-functions-only.mjs
 *     -> functions:adminCreateClass,functions:adminDeleteClass,...
 *
 *   node scripts/firebase/staging-functions-only.mjs --verify
 *     -> exits non-zero if any listed name is not a real export of
 *        backend/firebase/functions/lib/index.js
 *
 * Deploying a subset is what keeps the six scheduled functions — and the
 * outbound email and Google Calendar writes they trigger — out of staging
 * entirely, rather than deployed-then-paused.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const manifestPath = resolve(
  repoRoot,
  "backend/firebase/inventory/staging-functions.json"
);

export function readStagingFunctionNames(path = manifestPath) {
  const manifest = JSON.parse(readFileSync(path, "utf8"));

  if (manifest.projectId !== "tenacity-tutoring-staging") {
    throw new Error(
      `staging-functions.json must target tenacity-tutoring-staging, got "${manifest.projectId}".`
    );
  }

  const names = [
    ...(manifest.deploy.callable ?? []),
    ...(manifest.deploy.event ?? []),
    ...(manifest.deploy.https ?? []),
  ];

  const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate function names in the manifest: ${duplicates.join(", ")}`);
  }
  if (names.length === 0) {
    throw new Error("staging-functions.json lists no functions to deploy.");
  }

  return names.sort((a, b) => a.localeCompare(b));
}

export function buildOnlyArgument(names) {
  return names.map((name) => `functions:${name}`).join(",");
}

function verifyAgainstExports(names) {
  const require = createRequire(import.meta.url);
  const exported = new Set(
    Object.keys(require(resolve(repoRoot, "backend/firebase/functions/lib/index.js")))
  );

  const missing = names.filter((name) => !exported.has(name));
  if (missing.length > 0) {
    throw new Error(
      `staging-functions.json lists ${missing.length} name(s) that lib/index.js does not export:\n  ` +
        missing.join("\n  ")
    );
  }
  return exported.size;
}

function main() {
  const names = readStagingFunctionNames();

  if (process.argv.includes("--verify")) {
    const total = verifyAgainstExports(names);
    console.error(
      `OK: all ${names.length} staging function(s) exist among ${total} exports.`
    );
    return;
  }

  process.stdout.write(buildOnlyArgument(names));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
