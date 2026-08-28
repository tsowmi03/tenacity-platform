#!/usr/bin/env node

// Decides which managed Functions a commit actually needs to deploy.
//
// The deploy previously redeployed all 91 managed Functions on every dispatch,
// because the selectors came from the inventory and nothing else. That cost a
// flat ~21 minutes regardless of whether the commit touched one Function or all
// of them.
//
// The mapping from Function to source file is taken from Node's own module
// graph rather than parsed out of the source. `lib/index.js` is required in
// process, exactly as the inventory check already requires it, after which
// `require.cache` holds the real resolved graph. Each managed export is
// attributed to its defining module by reference identity, and that module's
// transitive children are the files that Function depends on.
//
// The dangerous direction here is under-deploying: shipping nothing and
// reporting success. Every rule below therefore fails towards a full deploy.

import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateInventoryPolicy } from "./check-functions-inventory.mjs";

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
const functionsRoot = "backend/firebase/functions/";

// Files every managed Function depends on, but which no require graph can see.
// Environment files are the reason this list exists: two real commits
// (c353dbc8, 9c7ab859) changed only `.env.tenacity-tutoring-b8eb2`, which
// resolves to zero Functions through the module graph while changing the
// runtime configuration of all of them.
export const globalTriggerPaths = [
  "firebase.json",
  ".firebaserc",
  "backend/firebase/inventory/production-functions.json",
  `${functionsRoot}package.json`,
  `${functionsRoot}package-lock.json`,
  `${functionsRoot}index.js`,
  `${functionsRoot}lib/index.js`,
];

// Paths under functions/ that are never part of a deployed Function: unit
// tests and one-off maintenance scripts. Anything else the graph cannot
// account for is treated as a full deploy rather than ignored.
const ignoredPathPrefixes = [`${functionsRoot}test/`, `${functionsRoot}scripts/`];

export function isGlobalTrigger(path) {
  if (globalTriggerPaths.includes(path)) return true;
  // .env, .env.tenacity-tutoring-b8eb2, .env.local and friends.
  return path.startsWith(`${functionsRoot}.env`);
}

export function isIgnoredPath(path) {
  return ignoredPathPrefixes.some((prefix) => path.startsWith(prefix));
}

/**
 * Builds the Function -> source files map by loading the entry point and
 * walking Node's resolved module graph.
 *
 * Takes the managed names directly rather than a policy: the caller validates
 * the policy once, and this only ever needs the name list.
 *
 * Returns a Map of managed Function name to a Set of repository-relative file
 * paths that Function transitively depends on.
 */
export function buildFunctionGraph({
  managedNames,
  projectId,
  entryPoint = defaultEntryPoint,
  root = repositoryRoot,
} = {}) {
  if (!Array.isArray(managedNames) || managedNames.length === 0) {
    throw new Error("managedNames must be a non-empty array.");
  }
  if (projectId) process.env.GCLOUD_PROJECT ||= projectId;
  // require.cache is keyed by the real path. Compare and relativise against
  // real paths too, or a symlinked ancestor (/var -> /private/var on macOS)
  // makes the entry-point check below silently miss and attribute every
  // export to the entry point itself.
  const realEntryPoint = realpathSync(entryPoint);
  const realRoot = realpathSync(root);
  // Same reason as inspectLocalExports: firebase-admin's credential parser
  // rejects the workload identity federation file the deploy job exports, and
  // introspecting the exports needs no credentials at all.
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const require = createRequire(import.meta.url);
  const exportsObject = require(realEntryPoint);

  // Reference identity, not name matching: an export is attributed to the
  // module whose own exports hold the very same function object.
  const definingModule = new Map();
  for (const [file, module] of Object.entries(require.cache)) {
    if (file === realEntryPoint) continue;
    const moduleExports = module.exports;
    if (!moduleExports) continue;
    if (typeof moduleExports !== "object" && typeof moduleExports !== "function") continue;
    let keys = [];
    try {
      keys = Object.keys(moduleExports);
    } catch {
      continue;
    }
    for (const key of keys) {
      let value;
      try {
        value = moduleExports[key];
      } catch {
        continue;
      }
      if (!value) continue;
      if (typeof value !== "object" && typeof value !== "function") continue;
      if (!definingModule.has(value)) definingModule.set(value, file);
    }
  }

  const isLocal = (file) => !file.includes("node_modules");
  const closureCache = new Map();
  function closure(file) {
    if (closureCache.has(file)) return closureCache.get(file);
    const seen = new Set();
    const stack = [file];
    while (stack.length > 0) {
      const current = stack.pop();
      if (seen.has(current) || !isLocal(current)) continue;
      seen.add(current);
      const module = require.cache[current];
      if (!module) continue;
      for (const child of module.children) {
        if (isLocal(child.filename)) stack.push(child.filename);
      }
    }
    closureCache.set(file, seen);
    return seen;
  }

  const graph = new Map();
  const unattributed = [];
  for (const name of managedNames) {
    const owner = definingModule.get(exportsObject[name]);
    if (!owner) {
      unattributed.push(name);
      continue;
    }
    const files = new Set();
    for (const file of closure(owner)) {
      files.add(relative(realRoot, file).split("\\").join("/"));
    }
    graph.set(name, files);
  }
  if (unattributed.length > 0) {
    throw new Error(
      `Could not attribute managed Functions to a source module: ${unattributed.join(", ")}.`
    );
  }
  return graph;
}

/**
 * The runtime graph's own adjacency, as repository-relative paths.
 *
 * Exposed separately from the closures so it can be checked against an
 * independent reading of the source. See verifyRequireGraph.
 */
export function runtimeRequireEdges({
  entryPoint = defaultEntryPoint,
  root = repositoryRoot,
} = {}) {
  const realEntryPoint = realpathSync(entryPoint);
  const realRoot = realpathSync(root);
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const require = createRequire(import.meta.url);
  require(realEntryPoint);
  const rel = (file) => relative(realRoot, file).split("\\").join("/");
  const edges = new Map();
  for (const [file, module] of Object.entries(require.cache)) {
    if (file.includes("node_modules")) continue;
    const targets = new Set();
    for (const child of module.children) {
      if (!child.filename.includes("node_modules")) targets.add(rel(child.filename));
    }
    edges.set(rel(file), targets);
  }
  return edges;
}

const requireLiteralPattern = /require\(\s*["']([^"']+)["']\s*\)/g;

function resolveLocalSpecifier(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [base, `${base}.js`, `${base}.json`, `${base}/index.js`];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Not this candidate; try the next.
    }
  }
  return null;
}

/**
 * Reads every relative require literal out of the source, without executing it.
 *
 * Deliberately a different derivation from the runtime graph: this sees a
 * require wherever it is written, including inside a function body, where the
 * runtime graph only sees the ones that actually ran at load time.
 */
export function staticRequireEdges({ files, root = repositoryRoot }) {
  const realRoot = realpathSync(root);
  // Normalise here rather than trusting the caller: relativising a /var path
  // against a /private/var root silently yields a ../../.. key instead.
  const rel = (file) => relative(realRoot, realpathSync(file)).split("\\").join("/");
  const edges = new Map();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const targets = new Set();
    for (const match of source.matchAll(requireLiteralPattern)) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) continue;
      const resolved = resolveLocalSpecifier(file, specifier);
      if (resolved) targets.add(rel(resolved));
    }
    edges.set(rel(file), targets);
  }
  return edges;
}

/**
 * Every local require written in the source must also be an edge the runtime
 * graph saw. A require that only runs later -- inside a handler, behind a
 * condition -- is invisible to the runtime graph, so the Function that needs it
 * would be left out of a scoped deploy and silently ship stale.
 *
 * The reverse direction is not a fault: the runtime graph legitimately sees
 * edges no literal explains, such as a computed specifier.
 */
export function verifyRequireGraph({ staticEdges, runtimeEdges }) {
  const missing = [];
  for (const [file, targets] of staticEdges) {
    const seen = runtimeEdges.get(file);
    for (const target of targets) {
      // A file the runtime never loaded at all is reported against its own
      // entry rather than per edge, below.
      if (seen && !seen.has(target)) missing.push({ file, target });
    }
  }
  const unloaded = [...staticEdges.keys()].filter((file) => !runtimeEdges.has(file));
  return { missing, unloaded };
}

/**
 * Given a set of changed repository paths and a Function graph, decides what to
 * deploy. Pure, so the decision table can be tested without loading Functions.
 *
 * Returns { mode, names, reason } where mode is "all" or "scoped".
 */
export function resolveChangedFunctions({ changedPaths, graph, managedNames }) {
  const names = [...managedNames];
  const functionPaths = changedPaths.filter(
    (path) => path.startsWith(functionsRoot) || globalTriggerPaths.includes(path)
  );
  if (functionPaths.length === 0) {
    return { mode: "scoped", names: [], reason: "No Function sources changed." };
  }

  const globalHits = functionPaths.filter((path) => isGlobalTrigger(path));
  if (globalHits.length > 0) {
    return {
      mode: "all",
      names,
      reason: `Global Function dependency changed: ${globalHits.join(", ")}.`,
    };
  }

  // Reverse the graph once so every changed file can be looked up directly.
  const affects = new Map();
  for (const [name, files] of graph) {
    for (const file of files) {
      if (!affects.has(file)) affects.set(file, new Set());
      affects.get(file).add(name);
    }
  }

  const selected = new Set();
  const unmapped = [];
  for (const path of functionPaths) {
    if (isIgnoredPath(path)) continue;
    const owners = affects.get(path);
    if (!owners) {
      unmapped.push(path);
      continue;
    }
    for (const name of owners) selected.add(name);
  }

  // A file under functions/ that no Function claims is something this resolver
  // does not understand: a new directory, a rename, a module reached by a
  // require the graph did not see. Deploy everything rather than guess.
  if (unmapped.length > 0) {
    return {
      mode: "all",
      names,
      reason: `Changed paths not attributable to any Function: ${unmapped.join(", ")}.`,
    };
  }

  const ordered = names.filter((name) => selected.has(name));
  return {
    mode: "scoped",
    names: ordered,
    reason: `${ordered.length} of ${names.length} Functions affected.`,
  };
}

/**
 * The deployed Function sources: everything under the Functions directory
 * except dependencies, unit tests and maintenance scripts, none of which the
 * entry point loads.
 */
export function deployedSourceFiles({ root = repositoryRoot } = {}) {
  const realRoot = realpathSync(root);
  const found = [];
  const walk = (directory) => {
    let entries = [];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = `${directory}/${entry.name}`;
      const relativePath = relative(realRoot, full).split("\\").join("/");
      if (entry.name === "node_modules") continue;
      if (isIgnoredPath(`${relativePath}/`) || isIgnoredPath(relativePath)) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) found.push(full);
    }
  };
  walk(resolve(realRoot, `${functionsRoot}lib`));
  walk(resolve(realRoot, `${functionsRoot}src`));
  return found;
}

export function changedPathsBetween(base, head, { cwd = repositoryRoot } = {}) {
  const args =
    !base || /^0+$/.test(base)
      ? ["diff-tree", "--root", "--no-renames", "--no-commit-id", "--name-only", "-r", head, "--"]
      : ["diff", "--name-only", "--no-renames", base, head, "--"];
  return execFileSync("git", args, { cwd, encoding: "utf8" })
    .split("\n")
    .map((path) => path.trim())
    .filter(Boolean);
}

export function selectorsFor(names, batchSize = 10) {
  const selectors = [];
  for (let index = 0; index < names.length; index += batchSize) {
    selectors.push(
      names
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
  if (!args[index + 1]) throw new Error(`${flag} requires a value.`);
  return args[index + 1];
}

function main() {
  const args = process.argv.slice(2);
  const policyPath = argumentValue(args, "--policy") ?? defaultPolicyPath;
  const entryPoint = argumentValue(args, "--entry-point") ?? defaultEntryPoint;
  const base = argumentValue(args, "--base");
  const head = argumentValue(args, "--head");
  const reportPath = argumentValue(args, "--report");
  const outputPath = argumentValue(args, "--github-output");
  const forceAll = args.includes("--all");

  const policy = validateInventoryPolicy(JSON.parse(readFileSync(policyPath, "utf8")));
  const managedNames = policy.managed.names;

  // Independent check on the graph the scoping depends on. Runs at pull
  // request time, not inside the deploy window.
  if (args.includes("--verify-graph")) {
    const runtimeEdges = runtimeRequireEdges({ entryPoint });
    const staticEdges = staticRequireEdges({ files: deployedSourceFiles() });
    const { missing, unloaded } = verifyRequireGraph({ staticEdges, runtimeEdges });
    for (const { file, target } of missing) {
      console.log(
        `::error file=${file}::requires ${target} somewhere the entry point does not load. ` +
          "A deferred local require is invisible to deploy scoping, so this Function " +
          "would be skipped while stale. Hoist it to the top level of the module."
      );
    }
    for (const file of unloaded) {
      console.log(
        `::warning file=${file}::not reached from the entry point; deploy scoping ` +
          "cannot attribute it to any Function."
      );
    }
    const checked = [...staticEdges.values()].reduce((total, set) => total + set.size, 0);
    console.log(
      `::notice::require graph verified: ${staticEdges.size} files, ${checked} local edges, ` +
        `${missing.length} unseen by the runtime graph.`
    );
    if (missing.length > 0) process.exitCode = 1;
    return;
  }

  let resolution;
  if (forceAll) {
    resolution = { mode: "all", names: [...managedNames], reason: "Requested with --all." };
  } else {
    if (!head) throw new Error("--head is required unless --all is used.");
    const graph = buildFunctionGraph({
      managedNames,
      projectId: policy.projectId,
      entryPoint,
    });
    resolution = resolveChangedFunctions({
      changedPaths: changedPathsBetween(base, head),
      graph,
      managedNames,
    });
  }

  const selectors = selectorsFor(resolution.names);
  if (args.includes("--print-selectors")) {
    if (selectors.length > 0) console.log(selectors.join("\n"));
    return;
  }

  const skipped = managedNames.filter((name) => !resolution.names.includes(name));
  const report = {
    schemaVersion: 1,
    mode: resolution.mode,
    reason: resolution.reason,
    managedCount: managedNames.length,
    deployCount: resolution.names.length,
    deploy: resolution.names,
    skipped,
    batches: selectors.length,
    selectors,
  };
  if (reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (outputPath) {
    appendFileSync(
      outputPath,
      `mode=${resolution.mode}\ndeploy_count=${resolution.names.length}\nbatches=${selectors.length}\n`
    );
  }
  console.log(`::notice::${resolution.mode}: ${resolution.reason} (${selectors.length} batches)`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
