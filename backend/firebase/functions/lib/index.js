"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const { setGlobalOptions } = require("firebase-functions/v2/options");
// Before any function is defined: some options are read at definition time.
//
// The 256MiB default left each function a few megabytes from failing at
// startup whenever a dependency grew. It did, repeatedly: TP-22, then the
// one-week swap after RES-42 added the PostHog AI SDK (TP-37). Functions that
// need more still say so on their own definition, which overrides this.
// `scripts/checkStartupMemory.js` fails CI before the bundle nears it.
setGlobalOptions({ memory: "512MiB" });
admin.initializeApp(); // Firebase Admin SDK initialization

// A deployed instance serves exactly one function, named by FUNCTION_TARGET,
// so it loads only the file that defines it (MOB-55). Loading all ~100 made
// every cold start pay for code it never ran, and a cold start is what a
// family waits through when booking a class.
//
// Everywhere else — deploy discovery, the emulator, tests, scripts — gets the
// full export map from `allFunctions.js`, which stays the single source of
// truth. `functionModules.json` is generated from it
// (`npm run generate:function-modules`) and a unit test fails when they drift.
// A target missing from the manifest falls back to the full map rather than
// failing to start.
// Read unconditionally so deploy scoping's require graph sees it.
const functionModules = require("./functionModules.json");
const target = process.env.FUNCTION_TARGET;
const entry = target ? functionModules[target] : undefined;

if (entry) {
  const [modulePath, exportName] = entry;
  module.exports = { [target]: require(modulePath)[exportName] };
} else {
  module.exports = require("./allFunctions");
}

// How long this instance took to load, measured from Node's own start. A cold
// start is mostly time spent before Node runs at all; logging this figure is
// what separates the part our code controls from the part it does not.
if (target) {
  console.log(JSON.stringify({
    message: "functions_bundle_loaded",
    functionTarget: target,
    loadedSingleModule: Boolean(entry),
    loadMs: Math.round(process.uptime() * 1000),
    modulesLoaded: Object.keys(require.cache).length,
  }));
}
