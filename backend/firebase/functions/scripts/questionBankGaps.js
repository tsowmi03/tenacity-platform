"use strict";

/*
 * RES-74: rebuilds the summary behind the admin "Gaps" tab: what the maths
 * bank holds by diagram type, skill and year, how often recent resources
 * needed each one, and where diagrams were drawn instead (src/questionBank/
 * gaps.js). Run daily by .github/workflows/question-bank-gaps-daily.yml.
 *
 * Usage:
 *   node scripts/questionBankGaps.js --projectId=tenacity-tutoring-staging
 *   node scripts/questionBankGaps.js --projectId=tenacity-tutoring-b8eb2 --commit --yes
 *
 * Flags:
 *   --projectId=ID   REQUIRED. The Firebase project to read and write.
 *   --days=N         How far back to read resources (default 90).
 *   --commit --yes   Write the summary. Without both, it is only printed.
 *
 * Reads the whole bank (four fields a question) and the window's resources.
 * No model calls.
 */

const admin = require("firebase-admin");
const { adminAppOptions } = require("./lib/questionBankAuth");
const { WINDOW_DAYS, buildBankGaps, writeBankGaps } = require("../src/questionBank/gaps");

function parseArgs(argv) {
  const options = { projectId: "", commit: false, yes: false, days: WINDOW_DAYS };
  for (const arg of argv) {
    if (arg === "--commit") options.commit = true;
    else if (arg === "--yes") options.yes = true;
    else if (arg.startsWith("--projectId=")) options.projectId = arg.slice("--projectId=".length);
    else if (arg.startsWith("--days=")) options.days = Number(arg.slice("--days=".length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.projectId) throw new Error("--projectId is required");
  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 365) throw new Error("--days must be a whole number from 1 to 365");
  return options;
}

function report(summary) {
  const { totals } = summary.demand;
  const share = totals.slots ? Math.round((totals.used / totals.slots) * 100) : 0;
  return [
    `Bank: ${summary.supply.total} live questions in ${Object.keys(summary.supply.byType).length} diagram types`,
    `Last ${summary.windowDays} days: ${summary.jobs} maths resources, ${totals.slots} diagram questions, ${totals.used} from the bank (${share}%), ${totals.drawn} drawn`,
    `Drawn because: ${Object.entries(totals.reasons).sort((a, b) => b[1] - a[1]).map(([reason, count]) => `${reason} ${count}`).join(", ") || "nothing drawn"}`,
    `Gaps listed: ${summary.gaps.length}`,
  ];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  admin.initializeApp(adminAppOptions({ projectId: options.projectId }));
  const db = admin.firestore();
  const summary = await buildBankGaps(db, { windowDays: options.days });
  for (const line of report(summary)) console.log(line);
  if (!(options.commit && options.yes)) {
    console.log("Dry run: nothing written. Pass --commit --yes to write.");
    return;
  }
  await writeBankGaps(db, summary, { serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp() });
  console.log(`Written to ${options.projectId}.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, report };
