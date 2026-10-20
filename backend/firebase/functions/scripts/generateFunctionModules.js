"use strict";

/*
 * Writes lib/functionModules.json: for each deployed function, the one file a
 * cold instance needs to load to serve it (MOB-55). See lib/index.js.
 *
 * For every export of lib/allFunctions.js it finds each loaded file whose own
 * exports hold that same function object, then keeps the one that pulls in the
 * fewest modules on its own: the defining file, not an aggregator that
 * re-exports it.
 *
 * Usage:
 *   node scripts/generateFunctionModules.js           # rewrite the manifest
 *   node scripts/generateFunctionModules.js --check   # exit 1 if it is stale
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LIB = path.join(ROOT, "lib");
const MANIFEST = path.join(LIB, "functionModules.json");

// Mirrors the setup at the top of lib/index.js, which every file assumes has
// already run.
const BOOTSTRAP = [
  'require("firebase-admin").initializeApp();',
  'require("firebase-functions/v2/options").setGlobalOptions({ memory: "512MiB" });',
].join("");

const childEnv = () => {
  const env = {
    ...process.env,
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT || "demo-function-modules",
  };
  delete env.FUNCTION_TARGET;
  return env;
};

function modulesLoadedBy(file) {
  let out;
  try {
    out = execFileSync(
      process.execPath,
      [
        "-e",
        `${BOOTSTRAP}require(${JSON.stringify(file)});` +
          "process.stdout.write(String(Object.keys(require.cache).length));",
      ],
      { cwd: ROOT, env: childEnv(), stdio: ["ignore", "pipe", "ignore"] }
    );
  } catch {
    return Infinity;
  }
  // A file that cannot load on its own is never the cheapest choice.
  const count = Number(out.toString());
  return out.length && Number.isFinite(count) ? count : Infinity;
}

function buildManifest() {
  process.env.GCLOUD_PROJECT =
    process.env.GCLOUD_PROJECT || "demo-function-modules";
  delete process.env.FUNCTION_TARGET;
  const all = require(path.join(LIB, "index.js"));

  const ownFiles = Object.keys(require.cache).filter(
    (file) =>
      file.startsWith(ROOT + path.sep) &&
      !file.includes(`${path.sep}node_modules${path.sep}`) &&
      file !== path.join(LIB, "index.js") &&
      file !== path.join(LIB, "allFunctions.js") &&
      file.endsWith(".js")
  );

  const cost = new Map();
  const costOf = (file) => {
    if (!cost.has(file)) cost.set(file, modulesLoadedBy(file));
    return cost.get(file);
  };

  const manifest = {};
  const unresolved = [];
  for (const name of Object.keys(all).sort()) {
    const candidates = [];
    for (const file of ownFiles) {
      const exported = require.cache[file].exports;
      if (!exported || typeof exported !== "object") continue;
      for (const [exportName, value] of Object.entries(exported)) {
        if (value === all[name]) candidates.push({ file, exportName });
      }
    }
    if (!candidates.length) {
      unresolved.push(name);
      continue;
    }
    candidates.sort(
      (a, b) => costOf(a.file) - costOf(b.file) || a.file.localeCompare(b.file)
    );
    const best = candidates[0];
    let rel = path.relative(LIB, best.file).replace(/\\/g, "/").replace(/\.js$/, "");
    if (!rel.startsWith(".")) rel = `./${rel}`;
    manifest[name] = [rel, best.exportName];
  }
  return { manifest, unresolved };
}

if (require.main === module) {
  const { manifest, unresolved } = buildManifest();
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  if (unresolved.length) {
    console.warn(
      `No defining file found for: ${unresolved.join(", ")}. ` +
        "These fall back to loading every function."
    );
  }
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(MANIFEST) ? fs.readFileSync(MANIFEST, "utf8") : "";
    if (current !== json) {
      console.error(
        "lib/functionModules.json is stale. Run: npm run generate:function-modules"
      );
      process.exit(1);
    }
    console.log(`lib/functionModules.json is current (${Object.keys(manifest).length} functions).`);
  } else {
    fs.writeFileSync(MANIFEST, json);
    console.log(`Wrote lib/functionModules.json (${Object.keys(manifest).length} functions).`);
  }
}

module.exports = { buildManifest };
