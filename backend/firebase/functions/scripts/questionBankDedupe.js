#!/usr/bin/env node
"use strict";

/**
 * RES-59. Merges copies of one question from different books or editions:
 * the newest copy stays live and lists every source; the others are marked
 * "duplicate" and never come back from a search. Safe to rerun, and it undoes
 * a merge whose copies no longer match.
 *
 *   node scripts/questionBankDedupe.js --projectId=tenacity-tutoring-staging [--commit --yes] [--show=20]
 *
 * Without --commit --yes it reports the groups it found and writes nothing.
 */

const admin = require("firebase-admin");

const { QUESTIONS_COLLECTION } = require("../src/questionBank/extraction");
const { findDuplicateGroups, planDuplicateWrites } = require("../src/questionBank/dedupe");

const SOURCES_COLLECTION = "questionBankSources";

function parseArgs(argv) {
  const options = { projectId: "", commit: false, yes: false, show: 10 };
  for (const arg of argv) {
    if (arg.startsWith("--projectId=")) options.projectId = arg.slice("--projectId=".length);
    else if (arg.startsWith("--show=")) options.show = Number(arg.slice("--show=".length));
    else if (arg === "--commit") options.commit = true;
    else if (arg === "--yes") options.yes = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.projectId) throw new Error("--projectId is required");
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  admin.initializeApp({ projectId: options.projectId });
  const db = admin.firestore();

  const sources = await db.collection(SOURCES_COLLECTION).select("modifiedTime").get();
  const modified = new Map(sources.docs.map((doc) => [doc.id, doc.get("modifiedTime") || null]));
  const snapshot = await db
    .collection(QUESTIONS_COLLECTION)
    .select("status", "sourceId", "sourcePath", "pageNumber", "label", "kind", "diagramType", "skill", "stem", "text", "figures", "duplicateOf", "sources")
    .get();
  const questions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), sourceModifiedTime: modified.get(doc.get("sourceId")) || null }));

  const groups = findDuplicateGroups(questions);
  const writes = planDuplicateWrites(questions, groups);
  const copies = groups.reduce((sum, group) => sum + group.copies.length, 0);
  console.log(`${questions.length} questions; ${groups.length} groups of copies, ${copies} copies to mark as duplicates; ${writes.length} documents to update.`);
  for (const { keep, copies: rest } of groups.slice(0, options.show)) {
    console.log(`\nKeep ${keep.id}  ${keep.sourcePath} p${keep.pageNumber} ${keep.label || ""}\n  ${(keep.text || keep.stem || "").slice(0, 120)}`);
    for (const copy of rest) console.log(`  copy ${copy.id}  ${copy.sourcePath} p${copy.pageNumber} ${copy.label || ""}`);
  }
  if (!(options.commit && options.yes)) {
    console.log("\nDry run. Pass --commit --yes to write.");
    return;
  }

  const writer = db.bulkWriter();
  for (const { id, data } of writes) writer.update(db.collection(QUESTIONS_COLLECTION).doc(id), data);
  await writer.close();
  console.log(`Updated ${writes.length} questions.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs };
