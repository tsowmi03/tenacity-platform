"use strict";

/*
 * RES-65: lists every file under Resources/English in the shared drive,
 * decides which ones the English bank extracts and what each is
 * (src/englishBank/sourceRules.js), pairs marking guides with their papers,
 * and records each file in the englishBankSources collection. It is the
 * English counterpart of questionBankSync.js, kept in its own collection so
 * the maths extraction and weekly job never see English files.
 *
 * Usage:
 *   node scripts/englishBankSync.js --projectId=tenacity-tutoring-b8eb2
 *   node scripts/englishBankSync.js --projectId=tenacity-tutoring-b8eb2 --commit --yes
 *
 * Flags:
 *   --projectId=ID   REQUIRED. The Firebase project whose Firestore is synced.
 *   --commit --yes   Write the changes. Without both, nothing is written.
 *   --impersonate=SA Drive account to impersonate (default: the question bank's).
 *
 * SHOW_PAIRS=1 prints every guide with the paper it was paired with.
 *
 * Auth: as questionBankSync.js. Drive itself is read-only.
 */

const admin = require("firebase-admin");
const { adminAppOptions } = require("./lib/questionBankAuth");

const { ENGLISH_FOLDER_ID, QUESTION_BANK_DRIVE_ACCOUNT, createDriveClient, createImpersonatedTokenProvider, listTree } = require("../src/questionBank/driveSource");
const { ENGLISH_SKIP_REASONS, ROLES, planEnglishSources } = require("../src/englishBank/sourceRules");
const { SYNCED_FIELDS, applySourceWrites, loadSources, planSourceWrites } = require("../src/questionBank/sourceStore");

const ENGLISH_SOURCES_COLLECTION = "englishBankSources";
const ENGLISH_FIELDS = [...SYNCED_FIELDS, "role", "pairedWith"];

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

function countBy(items, keyOf) {
  return items.reduce((counts, item) => {
    const key = keyOf(item);
    return { ...counts, [key]: (counts[key] || 0) + 1 };
  }, {});
}

// Only the stimulus folders get a record; LitCharts (RES-67) and the rest of
// English are left out of the collection rather than stored as skipped.
function recordedPlans(plans) {
  return plans.filter((plan) => plan.skipReason !== ENGLISH_SKIP_REASONS.outOfScope);
}

/** What the sync found, per top-level folder and role, plus unpaired guides. */
function report(plans) {
  const pending = plans.filter((plan) => plan.status === "pending");
  const skipped = plans.filter((plan) => plan.status === "skipped");
  const guides = pending.filter((plan) => plan.role === ROLES.guide);
  return {
    total: plans.length,
    toExtract: pending.length,
    byFolderAndRole: countBy(pending, (plan) => `${plan.path.split("/")[1]} / ${plan.role}`),
    skippedByReason: countBy(skipped, (plan) => plan.skipReason),
    guidesPaired: guides.filter((plan) => plan.pairedWith).length,
    unpairedGuides: guides.filter((plan) => !plan.pairedWith).map((plan) => plan.path).sort(),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const drive = createDriveClient({ getAccessToken: createImpersonatedTokenProvider({ targetPrincipal: options.impersonate }) });

  let lastProgress = 0;
  const files = await listTree(drive, ENGLISH_FOLDER_ID, "English", {
    onProgress: ({ folders, files: found }) => {
      if (Date.now() - lastProgress < 5000) return;
      lastProgress = Date.now();
      console.log(`Listing Drive: ${folders} folders, ${found} files so far`);
    },
  });
  const plans = planEnglishSources(files);
  const summary = report(plans);
  if (process.env.SHOW_PAIRS) {
    const byId = new Map(plans.map((plan) => [plan.id, plan]));
    for (const guide of plans.filter((plan) => plan.pairedWith)) console.log(`  ${guide.name}  ->  ${byId.get(guide.pairedWith).name}`);
  }
  console.log(`${summary.total} files: ${summary.toExtract} to extract`);
  console.log("By folder and role:", summary.byFolderAndRole);
  console.log("Skipped by reason:", summary.skippedByReason);
  console.log(`Guides paired with a paper: ${summary.guidesPaired}; unpaired: ${summary.unpairedGuides.length}`);
  for (const path of summary.unpairedGuides) console.log(`  unpaired: ${path}`);

  admin.initializeApp(adminAppOptions({ projectId: options.projectId }));
  const db = admin.firestore();
  const existing = await loadSources(db, { collection: ENGLISH_SOURCES_COLLECTION });
  const writes = planSourceWrites(existing, recordedPlans(plans), { fields: ENGLISH_FIELDS });
  console.log(`${writes.length} docs to write in ${options.projectId}/${ENGLISH_SOURCES_COLLECTION}:`, countBy(writes, (write) => write.change));

  if (!(options.commit && options.yes)) {
    console.log("Dry run: nothing written. Pass --commit --yes to write.");
    return;
  }
  await applySourceWrites(db, writes, { collection: ENGLISH_SOURCES_COLLECTION });
  console.log("Written.");
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { ENGLISH_FIELDS, ENGLISH_SOURCES_COLLECTION, parseArgs, recordedPlans, report };
