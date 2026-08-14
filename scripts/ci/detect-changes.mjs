#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const outputNames = [
  "mobile",
  "portal",
  "resource_portal",
  "website",
  "functions",
  "rules",
  "firebase_config",
];

function emptyClassification(value = false) {
  return Object.fromEntries(outputNames.map((name) => [name, value]));
}

function setAll(classification) {
  for (const name of outputNames) classification[name] = true;
}

export function classifyPaths(paths, { runAll = false } = {}) {
  const classification = emptyClassification(runAll);
  if (runAll) return classification;
  for (const path of paths) {
    if (
      path.startsWith(".github/workflows/") ||
      path.startsWith(".github/actions/") ||
      path.startsWith("docs/operations/workflow-templates/") ||
      path.startsWith("scripts/ci/") ||
      path.startsWith("scripts/firebase/") ||
      path === "backend/firebase/deployment-targets.json" ||
      path.startsWith("contracts/")
    ) {
      setAll(classification);
      continue;
    }
    if (path.startsWith("apps/mobile/")) classification.mobile = true;
    if (path.startsWith("apps/admin-portal/")) {
      classification.portal = true;
      if (
        path === "apps/admin-portal/package.json" ||
        path === "apps/admin-portal/package-lock.json" ||
        path === "apps/admin-portal/vitest.rules.config.js" ||
        path === "apps/admin-portal/test/firestoreRules.test.mjs" ||
        path === "apps/admin-portal/test/storageRules.test.mjs"
      ) {
        classification.rules = true;
      }
    }
    if (path.startsWith("apps/resource-portal/")) classification.resource_portal = true;
    if (path.startsWith("apps/website/")) classification.website = true;
    if (path.startsWith("backend/firebase/functions/")) classification.functions = true;
    if (
      path.startsWith("backend/firebase/rules/") ||
      path.startsWith("backend/firebase/indexes/")
    ) {
      classification.rules = true;
      classification.firebase_config = true;
    }
    if (path === "backend/firebase/inventory/production-functions.json") {
      classification.functions = true;
      classification.firebase_config = true;
    }
    if (
      path === "backend/firebase/storage.cors.json" ||
      path === "backend/firebase/inventory/source-baseline.json" ||
      path === "apps/mobile/firebase.json"
    ) {
      classification.firebase_config = true;
    }
    if (path === "firebase.json" || path === ".firebaserc") {
      classification.portal = true;
      classification.resource_portal = true;
      classification.functions = true;
      classification.rules = true;
      classification.firebase_config = true;
    }
  }
  return classification;
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  if (!args[index + 1]) throw new Error(`${flag} requires a value.`);
  return args[index + 1];
}

export function changedPaths(base, head, { cwd = process.cwd() } = {}) {
  const args = !base || /^0+$/.test(base)
    ? ["diff-tree", "--root", "--no-renames", "--no-commit-id", "--name-only", "-r", head, "--"]
    : ["diff", "--name-only", "--no-renames", base, head, "--"];
  return execFileSync("git", args, { cwd, encoding: "utf8" })
    .split("\n")
    .map((path) => path.trim())
    .filter(Boolean);
}

function main() {
  const args = process.argv.slice(2);
  const runAll = args.includes("--run-all");
  const base = argumentValue(args, "--base");
  const head = argumentValue(args, "--head");
  const outputPath = argumentValue(args, "--github-output");
  if (!runAll && !head) throw new Error("--head is required unless --run-all is used.");
  const paths = runAll ? [] : changedPaths(base, head);
  const classification = classifyPaths(paths, { runAll });
  const output = outputNames
    .map((name) => `${name}=${classification[name] ? "true" : "false"}`)
    .join("\n");
  if (outputPath) appendFileSync(outputPath, `${output}\n`);
  console.log(`Changed paths (${paths.length}):`);
  paths.forEach((path) => console.log(`- ${path}`));
  console.log(output);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  }
}
