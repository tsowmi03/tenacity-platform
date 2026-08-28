import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildFunctionGraph,
  deployedSourceFiles,
  globalTriggerPaths,
  isGlobalTrigger,
  isIgnoredPath,
  resolveChangedFunctions,
  runtimeRequireEdges,
  selectorsFor,
  staticRequireEdges,
  verifyRequireGraph,
} from "../resolve-function-deploys.mjs";

const policy = JSON.parse(
  readFileSync("backend/firebase/inventory/production-functions.json", "utf8")
);
const functionsRoot = "backend/firebase/functions/";

// A stand-in graph with the shape the real one has: two Functions sharing a
// module, one Function on its own.
const managedNames = ["alpha", "beta", "gamma"];
const graph = new Map([
  [
    "alpha",
    new Set([`${functionsRoot}src/a/alpha.js`, `${functionsRoot}src/shared/util.js`]),
  ],
  [
    "beta",
    new Set([`${functionsRoot}src/b/beta.js`, `${functionsRoot}src/shared/util.js`]),
  ],
  ["gamma", new Set([`${functionsRoot}src/c/gamma.js`])],
]);

const resolve = (changedPaths) =>
  resolveChangedFunctions({ changedPaths, graph, managedNames });

describe("resolveChangedFunctions", () => {
  it("selects only the Function whose own module changed", () => {
    const result = resolve([`${functionsRoot}src/c/gamma.js`]);
    assert.equal(result.mode, "scoped");
    assert.deepEqual(result.names, ["gamma"]);
  });

  it("fans a shared module out to every Function that depends on it", () => {
    const result = resolve([`${functionsRoot}src/shared/util.js`]);
    assert.equal(result.mode, "scoped");
    assert.deepEqual(result.names, ["alpha", "beta"]);
  });

  it("returns names in policy order, not discovery order", () => {
    const result = resolve([
      `${functionsRoot}src/c/gamma.js`,
      `${functionsRoot}src/a/alpha.js`,
    ]);
    assert.deepEqual(result.names, ["alpha", "gamma"]);
  });

  it("deploys nothing when no Function source changed", () => {
    const result = resolve(["apps/website/app/page.tsx", "log.md"]);
    assert.equal(result.mode, "scoped");
    assert.deepEqual(result.names, []);
  });

  it("ignores unit tests and maintenance scripts", () => {
    const result = resolve([
      `${functionsRoot}test/unit/alpha.test.js`,
      `${functionsRoot}scripts/backfillSomething.js`,
    ]);
    assert.equal(result.mode, "scoped");
    assert.deepEqual(result.names, []);
  });

  // The failure mode that matters. Environment files change the runtime
  // configuration of every Function while appearing in no require graph;
  // two real commits (c353dbc8, 9c7ab859) touched nothing else.
  it("deploys everything when an environment file changes", () => {
    for (const path of [
      `${functionsRoot}.env`,
      `${functionsRoot}.env.tenacity-tutoring-b8eb2`,
      `${functionsRoot}.env.tenacity-tutoring-staging`,
    ]) {
      const result = resolve([path]);
      assert.equal(result.mode, "all", `${path} must force a full deploy`);
      assert.deepEqual(result.names, managedNames);
    }
  });

  it("deploys everything when a manifest, entry point, or policy changes", () => {
    for (const path of globalTriggerPaths) {
      const result = resolve([path]);
      assert.equal(result.mode, "all", `${path} must force a full deploy`);
      assert.deepEqual(result.names, managedNames);
    }
  });

  // Fail safe, not fail cheap: an unrecognised path is a new directory, a
  // rename, or a module the graph did not see. Deploying nothing would ship
  // silently, so the resolver widens instead.
  it("deploys everything when a changed path maps to no Function", () => {
    const result = resolve([`${functionsRoot}src/brand/new/module.js`]);
    assert.equal(result.mode, "all");
    assert.deepEqual(result.names, managedNames);
    assert.match(result.reason, /not attributable/);
  });

  it("widens to a full deploy even alongside an otherwise scopeable change", () => {
    const result = resolve([
      `${functionsRoot}src/c/gamma.js`,
      `${functionsRoot}src/brand/new/module.js`,
    ]);
    assert.equal(result.mode, "all");
  });
});

describe("path classification", () => {
  it("treats every environment file variant as global", () => {
    assert.equal(isGlobalTrigger(`${functionsRoot}.env.local`), true);
    assert.equal(isGlobalTrigger(`${functionsRoot}lib/index.js`), true);
    assert.equal(isGlobalTrigger("firebase.json"), true);
    assert.equal(isGlobalTrigger(`${functionsRoot}src/a/alpha.js`), false);
  });

  it("ignores only tests and maintenance scripts", () => {
    assert.equal(isIgnoredPath(`${functionsRoot}test/unit/x.test.js`), true);
    assert.equal(isIgnoredPath(`${functionsRoot}scripts/seed.js`), true);
    assert.equal(isIgnoredPath(`${functionsRoot}src/a/alpha.js`), false);
  });
});

describe("selectorsFor", () => {
  it("batches names into bounded selectors", () => {
    const names = Array.from({ length: 23 }, (_, index) => `fn${index}`);
    const selectors = selectorsFor(names, 10);
    assert.equal(selectors.length, 3);
    assert.equal(selectors[0].split(",").length, 10);
    assert.equal(selectors[2].split(",").length, 3);
    assert.match(selectors[0], /^functions:default:fn0,/);
  });

  it("produces no selectors for an empty deploy", () => {
    assert.deepEqual(selectorsFor([]), []);
  });

  it("keeps every name exactly once across the batches", () => {
    const names = policy.managed.names;
    const flat = selectorsFor(names, 10)
      .join(",")
      .split(",")
      .map((selector) => selector.replace("functions:default:", ""));
    assert.deepEqual([...flat].sort(), [...names].sort());
    assert.equal(new Set(flat).size, names.length);
  });
});

describe("buildFunctionGraph", () => {
  // Exercises the real mechanism -- reference-identity attribution and the
  // transitive walk of Node's module graph -- against a synthetic module tree,
  // so the test needs none of the Functions' own dependencies installed.
  function fixture() {
    const dir = mkdtempSync(join(tmpdir(), "fn-graph-"));
    const write = (name, source) => writeFileSync(join(dir, name), source);
    write("shared.cjs", "module.exports = { helper: () => 1 };");
    write(
      "alpha.cjs",
      ['require("./shared.cjs");', "module.exports = { alpha: () => 1 };"].join("\n")
    );
    write(
      "beta.cjs",
      ['require("./shared.cjs");', "module.exports = { beta: () => 1 };"].join("\n")
    );
    write("gamma.cjs", "module.exports = { gamma: () => 1 };");
    write(
      "entry.cjs",
      [
        'const alpha = require("./alpha.cjs");',
        'const beta = require("./beta.cjs");',
        'const gamma = require("./gamma.cjs");',
        "module.exports = { ...alpha, ...beta, ...gamma };",
      ].join("\n")
    );
    return { dir, entryPoint: join(dir, "entry.cjs") };
  }

  it("attributes each Function to its defining module and its dependencies", () => {
    const { dir, entryPoint } = fixture();
    const built = buildFunctionGraph({
      managedNames: ["alpha", "beta", "gamma"],
      entryPoint,
      root: dir,
    });
    assert.deepEqual([...built.get("alpha")].sort(), ["alpha.cjs", "shared.cjs"]);
    assert.deepEqual([...built.get("beta")].sort(), ["beta.cjs", "shared.cjs"]);
    // The already-cached shared module must still be attributed to beta, and
    // must not leak into a Function that does not require it.
    assert.deepEqual([...built.get("gamma")], ["gamma.cjs"]);
  });

  it("refuses to guess when an export cannot be attributed", () => {
    const { dir, entryPoint } = fixture();
    assert.throws(
      () =>
        buildFunctionGraph({
          managedNames: ["alpha", "missingFunction"],
          entryPoint,
          root: dir,
        }),
      /missingFunction/
    );
  });

  it("maps every managed Function in the real inventory", () => {
    // Skips unless the Functions' dependencies are installed, so the fast
    // validate job stays dependency-free while the deploy job gets real cover.
    let real;
    try {
      real = buildFunctionGraph({
        managedNames: policy.managed.names,
        projectId: policy.projectId,
      });
    } catch (error) {
      if (error.code === "MODULE_NOT_FOUND") return;
      throw error;
    }
    assert.equal(real.size, policy.managed.names.length);
    for (const [name, files] of real) {
      assert.ok(files.size > 0, `${name} resolved to no source files`);
    }
  });
});

describe("staticRequireEdges", () => {
  function sourceFixture() {
    const dir = mkdtempSync(join(tmpdir(), "fn-static-"));
    mkdirSync(join(dir, "nested"), { recursive: true });
    writeFileSync(join(dir, "shared.js"), "module.exports = {};");
    writeFileSync(join(dir, "config.json"), "{}");
    writeFileSync(join(dir, "nested", "index.js"), "module.exports = {};");
    writeFileSync(
      join(dir, "top.js"),
      [
        'const shared = require("./shared");',
        'const dir = require("./nested");',
        'const data = require("./config.json");',
        'const admin = require("firebase-admin");',
        "module.exports = { shared, dir, data, admin };",
      ].join("\n")
    );
    writeFileSync(
      join(dir, "lazy.js"),
      [
        "module.exports.handler = () => {",
        '  const shared = require("./shared");',
        "  return shared;",
        "};",
      ].join("\n")
    );
    return dir;
  }

  it("resolves relative requires and ignores package specifiers", () => {
    const dir = sourceFixture();
    const { edges } = staticRequireEdges({
      files: [join(dir, "top.js")],
      root: dir,
    });
    assert.deepEqual([...edges.get("top.js")].sort(), [
      "config.json",
      "nested/index.js",
      "shared.js",
    ]);
  });

  // The regression this closes: a specifier the scan cannot read is invisible
  // here, and if the require is also deferred the runtime graph does not hold
  // it either -- so verification would pass over the exact gap it exists to
  // find. Reported rather than skipped.
  it("reports a require whose specifier it cannot read", () => {
    const dir = sourceFixture();
    writeFileSync(
      join(dir, "computed.js"),
      [
        "const name = \"./shared\";",
        "module.exports.handler = () => require(name);",
      ].join("\n")
    );
    const { edges, dynamic } = staticRequireEdges({
      files: [join(dir, "computed.js")],
      root: dir,
    });
    assert.deepEqual([...edges.get("computed.js")], []);
    assert.equal(dynamic.length, 1);
    assert.equal(dynamic[0].file, "computed.js");
    assert.equal(dynamic[0].text, "name");
  });

  it("reads a template literal with nothing interpolated as a plain specifier", () => {
    const dir = sourceFixture();
    writeFileSync(
      join(dir, "template.js"),
      "module.exports.handler = () => require(`./shared`);"
    );
    const { edges, dynamic } = staticRequireEdges({
      files: [join(dir, "template.js")],
      root: dir,
    });
    assert.deepEqual([...edges.get("template.js")], ["shared.js"]);
    assert.deepEqual(dynamic, []);
  });

  it("treats an interpolated template literal as unreadable", () => {
    const dir = sourceFixture();
    writeFileSync(
      join(dir, "interpolated.js"),
      [
        "const which = \"shared\";",
        "module.exports.handler = () => require(`./${which}`);",
      ].join("\n")
    );
    const { dynamic } = staticRequireEdges({
      files: [join(dir, "interpolated.js")],
      root: dir,
    });
    assert.equal(dynamic.length, 1);
  });

  it("does not mistake a require mentioned in a comment for a call", () => {
    const dir = sourceFixture();
    writeFileSync(
      join(dir, "commented.js"),
      [
        "/* Drop-in replacement for require(somethingComputed). */",
        "// see require(alsoNotACall)",
        'const shared = require("./shared");',
        "module.exports = { shared };",
      ].join("\n")
    );
    const { edges, dynamic } = staticRequireEdges({
      files: [join(dir, "commented.js")],
      root: dir,
    });
    assert.deepEqual(dynamic, []);
    assert.deepEqual([...edges.get("commented.js")], ["shared.js"]);
  });

  it("sees a require written inside a function body", () => {
    const dir = sourceFixture();
    const { edges } = staticRequireEdges({ files: [join(dir, "lazy.js")], root: dir });
    assert.deepEqual([...edges.get("lazy.js")], ["shared.js"]);
  });
});

describe("verifyRequireGraph", () => {
  // The failure this exists to catch: a require that only runs when the
  // handler runs is invisible to the runtime graph, so deploy scoping would
  // leave that Function out while its dependency changed underneath it.
  it("reports a local require the runtime graph never saw", () => {
    const result = verifyRequireGraph({
      staticEdges: new Map([["a.js", new Set(["shared.js"])]]),
      runtimeEdges: new Map([["a.js", new Set()]]),
    });
    assert.deepEqual(result.missing, [{ file: "a.js", target: "shared.js" }]);
  });

  it("accepts a graph where every written require was loaded", () => {
    const result = verifyRequireGraph({
      staticEdges: new Map([["a.js", new Set(["shared.js"])]]),
      runtimeEdges: new Map([["a.js", new Set(["shared.js"])]]),
    });
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.unloaded, []);
  });

  // A computed specifier resolves at runtime with no literal to read, so an
  // edge the source cannot explain is not a fault.
  it("does not fault edges the runtime saw but the source does not spell out", () => {
    const result = verifyRequireGraph({
      staticEdges: new Map([["a.js", new Set()]]),
      runtimeEdges: new Map([["a.js", new Set(["computed.js"])]]),
    });
    assert.deepEqual(result.missing, []);
  });

  it("separates files the entry point never loaded from missing edges", () => {
    const result = verifyRequireGraph({
      staticEdges: new Map([["orphan.js", new Set(["shared.js"])]]),
      runtimeEdges: new Map(),
    });
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.unloaded, ["orphan.js"]);
  });
});

describe("the real Function require graph", () => {
  // The load-bearing property for deploy scoping: every local require written
  // in the deployed sources is one the runtime graph actually saw. If this
  // fails, scoping can skip a Function whose dependency changed.
  it("has no local require the runtime graph missed", () => {
    let runtimeEdges;
    try {
      runtimeEdges = runtimeRequireEdges();
    } catch (error) {
      // Functions dependencies are not installed in the fast validate job.
      if (error.code === "MODULE_NOT_FOUND") return;
      throw error;
    }
    const { edges: staticEdges, dynamic } = staticRequireEdges({
      files: deployedSourceFiles(),
    });
    const { missing } = verifyRequireGraph({ staticEdges, runtimeEdges });
    assert.deepEqual(
      dynamic,
      [],
      `requires with unreadable specifiers cannot be verified: ${dynamic
        .map((entry) => `${entry.file}: require(${entry.text})`)
        .join(", ")}`
    );
    assert.deepEqual(
      missing,
      [],
      `deferred local requires break deploy scoping: ${missing
        .map((entry) => `${entry.file} -> ${entry.target}`)
        .join(", ")}`
    );
    assert.ok(staticEdges.size > 100, "expected the real source tree to be scanned");
  });
});
