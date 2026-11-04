"use strict";

/*
 * RES-56: lists every file under Resources/Maths in the shared drive, decides
 * which ones the question bank extracts (src/questionBank/sourceRules.js) and
 * records each in the questionBankSources collection.
 *
 * Usage:
 *   node scripts/questionBankSync.js --projectId=tenacity-tutoring-staging
 *   node scripts/questionBankSync.js --projectId=tenacity-tutoring-staging --commit --yes
 *
 * Flags:
 *   --projectId=ID   REQUIRED. The Firebase project whose Firestore is synced.
 *   --commit --yes   Write the changes. Without both, nothing is written.
 *   --impersonate=SA Drive account to impersonate (default: the question bank's).
 *
 * Auth: your Application Default Credentials need the Service Account Token
 * Creator role on the Drive account. Drive itself is read-only.
 */

const admin = require("firebase-admin");

const { createDriveClient, createImpersonatedTokenProvider, listTree, QUESTION_BANK_DRIVE_ACCOUNT } = require("../src/questionBank/driveSource");
const { planSources } = require("../src/questionBank/sourceRules");
const { applySourceWrites, loadSources, planSourceWrites } = require("../src/questionBank/sourceStore");

function parseArgs(argv) {
  const options = { projectId: "", commit: false, yes: false, impersonate: QUESTION_BANK_DRIVE_ACCOUNT };
  for (const arg of argv) {
    if (arg === "--commit") options.commit = true;
    else if (arg === "--yes") options.yes = true;
    else if (arg.startsWith("--projectId=")) options.projectId = arg.slice("--projectId=".length);
    else if (arg.startsWith("--impersonate=")) options.impersonate = arg.slice("--impersonate=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.projectId) throw new Error("--projectId is required");
  return options;
}

function countBy(items, key) {
  return items.reduce((counts, item) => ({ ...counts, [item[key]]: (counts[item[key]] || 0) + 1 }), {});
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const drive = createDriveClient({ getAccessToken: createImpersonatedTokenProvider({ targetPrincipal: options.impersonate }) });

  let lastProgress = 0;
  const files = await listTree(drive, undefined, undefined, {
    onProgress: ({ folders, files: found }) => {
      if (Date.now() - lastProgress < 5000) return;
      lastProgress = Date.now();
      console.log(`Listing Drive: ${folders} folders, ${found} files so far`);
    },
  });
  const plans = planSources(files);
  const skipped = plans.filter((plan) => plan.status === "skipped");
  console.log(`${files.length} files: ${plans.length - skipped.length} to extract, ${skipped.length} skipped`);
  console.log("Skipped by reason:", countBy(skipped, "skipReason"));

  admin.initializeApp({ projectId: options.projectId });
  const db = admin.firestore();
  const writes = planSourceWrites(await loadSources(db), plans);
  console.log(`${writes.length} docs to write in ${options.projectId}:`, countBy(writes, "change"));

  if (!(options.commit && options.yes)) {
    console.log("Dry run: nothing written. Pass --commit --yes to write.");
    return;
  }
  await applySourceWrites(db, writes);
  console.log("Written.");
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs };
