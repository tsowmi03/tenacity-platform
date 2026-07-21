"use strict";

/*
 * One-off backfill script: adds actorRole to historical adminAuditLogs docs.
 *
 * Usage:
 *   node scripts/backfillAuditActorRoles.js
 *   node scripts/backfillAuditActorRoles.js --commit --yes
 *
 * Flags:
 *   --commit        Write updates. Omit for dry-run.
 *   --yes           Required with --commit.
 *   --force         Recompute actorRole even when it already exists.
 *   --limit=N       Page size. Default 450, max 500.
 *   --projectId=ID  Firebase project id. Falls back to env/.firebaserc.
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function parseArgs(argv) {
  const args = {
    commit: false,
    force: false,
    limit: 450,
    projectId: "",
    yes: false,
  };

  for (const raw of argv.slice(2)) {
    if (raw === "--commit") args.commit = true;
    else if (raw === "--force") args.force = true;
    else if (raw === "--yes" || raw === "-y") args.yes = true;
    else if (raw.startsWith("--limit=")) {
      const n = Number(raw.split("=")[1]);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`Invalid --limit value: ${raw}`);
      }
      args.limit = Math.min(500, Math.floor(n));
    } else if (raw.startsWith("--projectId=")) {
      args.projectId = String(raw.split("=")[1] || "").trim();
    }
  }

  return args;
}

function readFirebaseRcProjectId() {
  try {
    const repoRoot = path.resolve(__dirname, "..", "..");
    const firebaseRcPath = path.join(repoRoot, ".firebaserc");
    if (!fs.existsSync(firebaseRcPath)) return "";

    const raw = fs.readFileSync(firebaseRcPath, "utf8");
    const parsed = JSON.parse(raw);
    const projectId = parsed?.projects?.default;
    return typeof projectId === "string" ? projectId.trim() : "";
  } catch {
    return "";
  }
}

function resolveProjectId(cliProjectId) {
  const candidates = [
    String(cliProjectId || "").trim(),
    String(process.env.GCLOUD_PROJECT || "").trim(),
    String(process.env.GOOGLE_CLOUD_PROJECT || "").trim(),
    String(process.env.FIREBASE_PROJECT_ID || "").trim(),
    readFirebaseRcProjectId(),
  ].filter(Boolean);

  return candidates[0] || "";
}

async function actorRoleForUid(db, roleCache, uid) {
  if (!uid) return null;
  if (roleCache.has(uid)) return roleCache.get(uid);

  const snap = await db.collection("users").doc(uid).get();
  const role = snap.exists && typeof snap.data()?.role === "string"
    ? snap.data().role
    : null;
  roleCache.set(uid, role);
  return role;
}

async function backfillAuditActorRoles({ db, commit, force, limit }) {
  const roleCache = new Map();
  let scanned = 0;
  let alreadyHadRole = 0;
  let missingActorUid = 0;
  let missingUserRole = 0;
  let eligible = 0;
  let updated = 0;
  let lastDoc = null;

  while (true) {
    let query = db
      .collection("adminAuditLogs")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(limit);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;

    scanned += snap.size;

    const batch = db.batch();
    let batchOps = 0;

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const hasRole = typeof data.actorRole === "string" && data.actorRole.trim();
      if (hasRole && !force) {
        alreadyHadRole += 1;
        continue;
      }

      if (!data.actorUid) {
        missingActorUid += 1;
        continue;
      }

      const role = await actorRoleForUid(db, roleCache, data.actorUid);
      if (!role) {
        missingUserRole += 1;
        continue;
      }

      eligible += 1;
      if (commit) {
        batch.update(doc.ref, { actorRole: role });
        batchOps += 1;
      }
    }

    if (commit && batchOps > 0) {
      await batch.commit();
      updated += batchOps;
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    console.log(
      `[page] scanned=${scanned} eligible=${eligible} updated=${updated} last=${lastDoc.id} writesThisPage=${batchOps}`
    );
  }

  return {
    scanned,
    alreadyHadRole,
    missingActorUid,
    missingUserRole,
    eligible,
    updated,
    dryRun: !commit,
    cachedActors: roleCache.size,
  };
}

async function main() {
  const { commit, force, limit, projectId: cliProjectId, yes } = parseArgs(process.argv);
  if (commit && !yes) {
    throw new Error("Refusing to write without confirmation. Re-run with --commit --yes.");
  }

  const projectId = resolveProjectId(cliProjectId);
  if (!projectId) {
    throw new Error(
      "Missing project id. Provide --projectId=<id>, set GCLOUD_PROJECT/GOOGLE_CLOUD_PROJECT, or ensure .firebaserc has projects.default."
    );
  }

  process.env.GCLOUD_PROJECT = projectId;
  process.env.GOOGLE_CLOUD_PROJECT = projectId;

  const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  admin.initializeApp(
    usingEmulator
      ? { projectId }
      : { projectId, credential: admin.credential.applicationDefault() }
  );

  console.log(JSON.stringify({ projectId, commit, force, limit, usingEmulator }, null, 2));

  const summary = await backfillAuditActorRoles({
    db: admin.firestore(),
    commit,
    force,
    limit,
  });

  console.log("\nDone.");
  console.log(JSON.stringify(summary, null, 2));
  if (!commit) console.log("Dry run only; no writes were performed.");
}

main().catch((err) => {
  console.error("backfillAuditActorRoles failed", err);
  process.exitCode = 1;
});
