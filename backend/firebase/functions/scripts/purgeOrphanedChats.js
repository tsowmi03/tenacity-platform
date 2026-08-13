"use strict";

/*
 * One-off remediation: removes chat threads left behind by user deletions.
 *
 * `deleteUserImpl` has never cleaned up `chats`, so every account deleted to
 * date has orphaned its threads. Parents see them as "Unknown User" rows in the
 * inbox and can still send messages into them. This clears the backlog; the
 * delete-time fix in `users/deleteUser.js` stops new ones appearing.
 *
 * Usage:
 *   node scripts/purgeOrphanedChats.js --projectId=tenacity-tutoring-b8eb2
 *   node scripts/purgeOrphanedChats.js --projectId=tenacity-tutoring-b8eb2 --commit --yes
 *
 *   # against the local emulator suite
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *     node scripts/purgeOrphanedChats.js --projectId=demo-tenacity-chats --commit --yes
 *
 * Flags:
 *   --projectId=ID    REQUIRED. Never inferred from .firebaserc — this script
 *                     writes, and the ambient default project is exactly the
 *                     kind of thing that is wrong at the worst moment.
 *   --commit          Write. Omit for a dry run (the default).
 *   --yes             Required with --commit.
 *   --mode=MODE       `deactivate` (default) hides orphaned threads but keeps
 *                     them. `hard-delete` removes them and their messages.
 *   --batchSize=N     Chats read per page. Default 200.
 *
 * Prefer the default. These orphans predate any record of why each account was
 * deleted, and a production dry run found threads whose departed party was the
 * official admin@tenacitytutoring.com identity rather than a test account —
 * including a real parent's conversation with the business. Deactivating gets
 * them out of inboxes, which is the actual goal, and is reversible.
 *
 * Read the dry-run output before committing: it lists every affected chat with
 * its message count and which uids are missing.
 */

const admin = require("firebase-admin");

const {
  purgeOrphanedChatsImpl,
} = require("../src/chats/purgeOrphanedChats");

function parseArgs(argv) {
  const args = {
    projectId: "",
    commit: false,
    yes: false,
    mode: "deactivate",
    batchSize: 200,
  };

  for (const raw of argv.slice(2)) {
    if (raw === "--commit") args.commit = true;
    else if (raw === "--yes" || raw === "-y") args.yes = true;
    else if (raw.startsWith("--projectId=")) {
      args.projectId = String(raw.split("=")[1] || "").trim();
    } else if (raw.startsWith("--mode=")) {
      args.mode = String(raw.split("=")[1] || "").trim();
      if (!["deactivate", "hard-delete"].includes(args.mode)) {
        throw new Error(
          `Invalid --mode: ${args.mode}. Use deactivate or hard-delete.`
        );
      }
    } else if (raw.startsWith("--batchSize=")) {
      const n = Number(raw.split("=")[1]);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error(`Invalid --batchSize value: ${raw}`);
      }
      args.batchSize = n;
    } else {
      throw new Error(`Unrecognised argument: ${raw}`);
    }
  }

  if (!args.projectId) {
    throw new Error("--projectId is required and is never inferred.");
  }
  if (args.commit && !args.yes) {
    throw new Error("--commit requires --yes. Refusing to delete unconfirmed.");
  }

  return args;
}

async function main() {
  const { projectId, commit, mode, batchSize } = parseArgs(process.argv);

  process.env.GCLOUD_PROJECT = projectId;
  process.env.GOOGLE_CLOUD_PROJECT = projectId;

  const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  admin.initializeApp(
    usingEmulator
      ? { projectId }
      : { projectId, credential: admin.credential.applicationDefault() }
  );

  const logger = {
    info: (msg, meta) => console.log(msg, meta || ""),
    warn: (msg, meta) => console.warn(msg, meta || ""),
    error: (msg, meta) => console.error(msg, meta || ""),
  };

  const result = await purgeOrphanedChatsImpl({
    db: admin.firestore(),
    fieldValue: admin.firestore.FieldValue,
    timestamp: admin.firestore.Timestamp.now(),
    logger,
    dryRun: !commit,
    mode,
    batchSize,
  });

  if (result.dryRun) {
    console.log(
      "\nDry run only — nothing was written. Re-run with --commit --yes to apply."
    );
  }
}

main().catch((err) => {
  console.error("purgeOrphanedChats failed", err);
  process.exitCode = 1;
});
