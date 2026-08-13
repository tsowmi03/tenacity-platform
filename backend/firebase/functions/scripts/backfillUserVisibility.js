"use strict";

/*
 * Stamps `visibility: "standard"` on every user document that lacks it.
 *
 * This MUST complete before the matching Firestore rules are deployed. It is a
 * hard prerequisite, not a tidy-up:
 *
 *   - The rule requires `visibility == "standard"` for a non-staff reader, so
 *     an account still missing the field becomes invisible to parents.
 *   - The contact-list queries filter on the same equality, and a Firestore
 *     equality filter does not match documents where the field is absent.
 *
 * The rule cannot be made tolerant of a missing field to soften this. Doing so
 * requires a `!('visibility' in data) || ...` disjunction, and for a `list`
 * Firestore decides access from the query's constraints rather than per
 * document — it cannot reason about field existence, so the disjunction is
 * unprovable, the query is permitted wholesale, and internal accounts come
 * back in the results. Strictness is what makes the rule work at all.
 *
 * Deploy order:
 *   1. this script                      (every user gains the field)
 *   2. firestore.rules + indexes        (rule and query now agree)
 *   3. the app build with the filter    (queries carry the constraint)
 *   4. flip chosen accounts to internal (see --setInternal)
 *
 * Between 2 and 3, an older app build queries without the constraint and is
 * denied — so ship 3 promptly, or accept that stale builds lose their contact
 * list until they update.
 *
 * Usage:
 *   node scripts/backfillUserVisibility.js --projectId=tenacity-tutoring-b8eb2
 *   node scripts/backfillUserVisibility.js --projectId=tenacity-tutoring-b8eb2 --commit --yes
 *
 *   # mark specific accounts internal, once the backfill is done
 *   node scripts/backfillUserVisibility.js --projectId=tenacity-tutoring-b8eb2 \
 *     --setInternal=uid1,uid2 --commit --yes
 *
 * Flags:
 *   --projectId=ID       REQUIRED. Never inferred from .firebaserc.
 *   --commit             Write. Omit for a dry run (the default).
 *   --yes                Required with --commit.
 *   --setInternal=A,B    Also set these uids to `internal`. Refuses any uid
 *                        that is not already a user, so a typo cannot create
 *                        a half-formed document.
 *
 * Marking an account internal takes effect on their NEXT token refresh, since
 * `syncUserRoleClaim` mirrors the field into a custom claim. Sign them out, or
 * expect up to an hour of stale-token grace.
 */

const admin = require("firebase-admin");

const DEFAULT_VISIBILITY = "standard";
const INTERNAL_VISIBILITY = "internal";

function parseArgs(argv) {
  const args = {
    projectId: "",
    commit: false,
    yes: false,
    setInternal: [],
  };

  for (const raw of argv.slice(2)) {
    if (raw === "--commit") args.commit = true;
    else if (raw === "--yes" || raw === "-y") args.yes = true;
    else if (raw.startsWith("--projectId=")) {
      args.projectId = String(raw.split("=")[1] || "").trim();
    } else if (raw.startsWith("--setInternal=")) {
      args.setInternal = String(raw.split("=")[1] || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      throw new Error(`Unrecognised argument: ${raw}`);
    }
  }

  if (!args.projectId) {
    throw new Error("--projectId is required and is never inferred.");
  }
  if (args.commit && !args.yes) {
    throw new Error("--commit requires --yes. Refusing to write unconfirmed.");
  }
  return args;
}

async function main() {
  const { projectId, commit, setInternal } = parseArgs(process.argv);

  process.env.GCLOUD_PROJECT = projectId;
  process.env.GOOGLE_CLOUD_PROJECT = projectId;

  const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  admin.initializeApp(
    usingEmulator
      ? { projectId }
      : { projectId, credential: admin.credential.applicationDefault() }
  );

  const db = admin.firestore();
  const snap = await db.collection("users").get();
  if (snap.empty) {
    throw new Error(
      "Refusing to run: no users found. Check the target project and credentials."
    );
  }

  const byId = new Map(snap.docs.map((d) => [d.id, d.data() || {}]));

  const unknown = setInternal.filter((uid) => !byId.has(uid));
  if (unknown.length) {
    throw new Error(
      `--setInternal names uids with no user document: ${unknown.join(", ")}`
    );
  }

  const needsDefault = snap.docs.filter((d) => !("visibility" in (d.data() || {})));
  const toInternal = setInternal.filter(
    (uid) => byId.get(uid).visibility !== INTERNAL_VISIBILITY
  );

  console.log(`users: ${snap.size}`);
  console.log(`  missing visibility -> "${DEFAULT_VISIBILITY}": ${needsDefault.length}`);
  console.log(`  to mark "${INTERNAL_VISIBILITY}": ${toInternal.length}`);

  for (const uid of toInternal) {
    const u = byId.get(uid);
    console.log(
      `    ${uid}  ${u.firstName || "?"} ${u.lastName || "?"} <${u.email}> role=${u.role}`
    );
  }

  if (!commit) {
    console.log("\nDry run only — nothing was written. Re-run with --commit --yes.");
    return;
  }

  let written = 0;
  for (let i = 0; i < needsDefault.length; i += 400) {
    const batch = db.batch();
    for (const doc of needsDefault.slice(i, i + 400)) {
      batch.update(doc.ref, { visibility: DEFAULT_VISIBILITY });
    }
    await batch.commit();
    written += Math.min(400, needsDefault.length - i);
    console.log(`  defaulted ${written}/${needsDefault.length}`);
  }

  if (toInternal.length) {
    const batch = db.batch();
    for (const uid of toInternal) {
      batch.update(db.collection("users").doc(uid), {
        visibility: INTERNAL_VISIBILITY,
      });
    }
    await batch.commit();
    console.log(`  marked ${toInternal.length} internal`);
  }

  console.log(
    "\nDone. Custom claims follow via syncUserRoleClaim on the next write; " +
      "affected users need a token refresh before rules see the change."
  );
}

main().catch((err) => {
  console.error("backfillUserVisibility failed", err);
  process.exitCode = 1;
});
