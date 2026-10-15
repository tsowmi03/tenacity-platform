"use strict";

/*
 * Fails when loading the Functions bundle takes more memory than the budget.
 *
 * Every function instance loads all of `lib/index.js` at startup, whichever
 * function it serves, so a library required at the top of any file is paid
 * for by all ~100 functions. That headroom ran out more than once without
 * anyone noticing until production did: TP-22, and then the one-week swap,
 * which failed at startup after RES-42 added the PostHog AI SDK (TP-37).
 *
 * Measured locally, startup was about 225 MiB before TP-37 and about 86 MiB
 * after it; production adds roughly 40-70 MiB on top of the local figure once
 * a request is being handled. The budget leaves room to grow while keeping
 * that total well inside the smallest memory any function is given (512MiB,
 * set globally in lib/index.js). Going over it almost always means a heavy
 * library is required at the top of a file: load it with
 * `src/shared/lazyRequire.js` inside the code that uses it instead.
 *
 * Usage:
 *   node scripts/checkStartupMemory.js
 *   node scripts/checkStartupMemory.js --budget-mib=200
 */

const { execFileSync } = require("child_process");
const path = require("path");

const DEFAULT_BUDGET_MIB = 160;

const entryPoint = path.resolve(__dirname, "../lib/index.js");

function parseBudget(argv) {
  const arg = argv.find((value) => value.startsWith("--budget-mib="));
  if (!arg) return DEFAULT_BUDGET_MIB;
  const budget = Number(arg.slice("--budget-mib=".length));
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new Error(`Invalid --budget-mib: ${arg}`);
  }
  return budget;
}

// Run in a fresh process so nothing this script loads is counted, and with
// --expose-gc so garbage from module evaluation is not counted either.
const probe = `
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-startup-memory";
  require(${JSON.stringify(entryPoint)});
  global.gc();
  const packages = {};
  for (const file of Object.keys(require.cache)) {
    const match = file.match(/node_modules\\/((?:@[^/]+\\/)?[^/]+)\\//);
    if (match) packages[match[1]] = (packages[match[1]] || 0) + 1;
  }
  process.stdout.write(JSON.stringify({
    rssMiB: process.memoryUsage().rss / 1048576,
    packages,
  }));
`;

function measure() {
  const output = execFileSync(process.execPath, ["--expose-gc", "-e", probe], {
    encoding: "utf8",
    // Startup logging from firebase-functions is not part of the result.
    stdio: ["ignore", "pipe", "inherit"],
  });
  return JSON.parse(output);
}

function main() {
  const budget = parseBudget(process.argv.slice(2));
  const { rssMiB, packages } = measure();
  const rounded = Math.round(rssMiB);

  if (rssMiB <= budget) {
    console.log(`Startup memory ${rounded} MiB, within the ${budget} MiB budget.`);
    return;
  }

  // The list of packages loaded at startup is what someone fixing this needs:
  // the one that was not there before is usually the cause.
  const loaded = Object.entries(packages)
    .sort(([, a], [, b]) => b - a)
    .map(([name, files]) => `  ${name} (${files} files)`)
    .join("\n");
  console.error(
    `::error file=backend/firebase/functions/lib/index.js::` +
      `Startup memory ${rounded} MiB is over the ${budget} MiB budget. ` +
      "A heavy library is probably required at the top of a file; load it " +
      "with src/shared/lazyRequire.js where it is used instead (TP-37)."
  );
  console.error(`Packages loaded at startup, by files loaded:\n${loaded}`);
  process.exitCode = 1;
}

main();
