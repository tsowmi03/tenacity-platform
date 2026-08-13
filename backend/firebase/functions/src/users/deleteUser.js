"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { displayName, writeAuditLog } = require("../shared/auditLog");
const { now } = require("../shared/timestamps");
const { buildPruneUpdate } = require("../chats/orphanedChats");
const {
  buildDeactivateUpdate,
  planChatCleanup,
} = require("../chats/chatCleanup");
const {
  assertString,
  assertEmail,
  validateShape,
} = require("../shared/validation");
const { isInternalAccount } = require("./userSchemas");

/**
 * Hard-delete a parent / tutor / admin user.
 *
 * Per portal policy:
 *  - The caller must pass `confirmEmail` equal to the stored user.email
 *    (case-insensitive, trimmed). This stops UI bugs from nuking the wrong
 *    account.
 *  - Parents with linked students are refused — the admin must unlink or
 *    delete each student first via adminUnlinkStudentFromParent /
 *    adminDeleteStudent. We do not silently orphan students.
 *  - Tutor/admin: removes uid from `classes.tutors` AND from FUTURE
 *    attendance docs only (date >= now). Historical attendance keeps the
 *    tutor reference so reports stay correct.
 *  - Chats the user took part in are cleaned up (see `chats/chatCleanup.js`).
 *    Group threads simply lose the member. A one-to-one thread is DEACTIVATED
 *    for a real user — hidden everywhere, still on disk — and DELETED outright,
 *    messages included, for an internal/test account. Skipping this is what
 *    left parents with "Unknown User" rows they could still type into.
 *  - After firestore, delete the Firebase Auth user and best-effort clean
 *    `userTokens/{uid}`. If auth deletion fails, the user is still
 *    inaccessible (no users doc → syncUserRoleClaim clears their claim).
 *
 * Returns a structured summary so the UI can display what actually changed.
 */
function validateDeleteUserPayload(input) {
  return validateShape(input || {}, {
    uid: (v) => assertString(v, "uid", { max: 120 }),
    confirmEmail: (v) => assertEmail(v, "confirmEmail"),
  });
}

/**
 * Find every class doc that lists `uid` in `tutors`, paired with the IDs of
 * future attendance docs that need a corresponding cleanup. Done OUTSIDE the
 * batch so we can read first and write second.
 */
async function gatherTutorCleanup(db, uid, clock) {
  const cutoff = now(clock);
  const classSnap = await db
    .collection("classes")
    .where("tutors", "array-contains", uid)
    .get();

  const classes = [];
  for (const cls of classSnap.docs) {
    const futureSnap = await cls.ref
      .collection("attendance")
      .where("date", ">=", cutoff)
      .get();
    classes.push({
      ref: cls.ref,
      attendanceRefs: futureSnap.docs.map((d) => d.ref),
    });
  }
  return { classes, cutoff };
}

/**
 * Plan what happens to every chat `uid` takes part in. Read-only, so the
 * caller can size the batch before writing anything.
 *
 * `deleteHistory` comes from the account's `visibility` flag. Until the
 * internal-account tier lands that flag is absent on every user, so every
 * deletion takes the conservative deactivate path — which is the right
 * default for a real person regardless.
 */
async function gatherChatCleanup(db, uid, deleteHistory) {
  const chatSnap = await db
    .collection("chats")
    .where("participants", "array-contains", uid)
    .get();

  const plans = [];
  for (const chat of chatSnap.docs) {
    const plan = planChatCleanup({
      participants: (chat.data() || {}).participants,
      deletedUid: uid,
      deleteHistory,
    });
    if (plan.action === "skip") continue;
    plans.push({ ref: chat.ref, ...plan });
  }
  return plans;
}

async function deleteUserImpl({ payload, actor, deps }) {
  const { admin: adminSdk, db, clock } = deps;
  if (!adminSdk || !db) throw new TypeError("deleteUserImpl requires admin/db deps");
  if (!actor?.uid) throw new TypeError("deleteUserImpl requires actor.uid");

  const { uid, confirmEmail } = payload;
  if (uid === actor.uid) {
    throw new HttpsError("failed-precondition", "Admins cannot delete themselves");
  }

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new HttpsError("not-found", `User not found: ${uid}`);
  }
  const userData = userSnap.data() || {};
  const storedEmail = String(userData.email || "").trim().toLowerCase();
  if (storedEmail !== confirmEmail) {
    throw new HttpsError(
      "failed-precondition",
      "confirmEmail does not match the user's stored email"
    );
  }

  if (userData.role === "parent") {
    const students = Array.isArray(userData.students) ? userData.students : [];
    if (students.length > 0) {
      throw new HttpsError(
        "failed-precondition",
        `Parent still has ${students.length} linked student(s). Unlink or delete them first.`
      );
    }
  }

  const cleanup = ["tutor", "admin"].includes(userData.role)
    ? await gatherTutorCleanup(db, uid, clock)
    : { classes: [], cutoff: now(clock) };

  const chatPlans = await gatherChatCleanup(db, uid, isInternalAccount(userData));
  // Recursive deletes run after the batch, so only the in-batch chat writes
  // count towards the limit.
  const batchedChatWrites = chatPlans.filter(
    (plan) => plan.action !== "delete"
  ).length;

  const totalOps =
    1 +
    cleanup.classes.length +
    cleanup.classes.reduce((sum, c) => sum + c.attendanceRefs.length, 0) +
    batchedChatWrites;
  if (totalOps > 450) {
    // Leave headroom under Firestore's 500-op batch limit.
    throw new HttpsError(
      "resource-exhausted",
      `Cleanup would require ${totalOps} writes; please reduce scope first.`
    );
  }

  const chatTimestamp = now(clock);
  const batch = db.batch();
  cleanup.classes.forEach((c) => {
    batch.update(c.ref, {
      tutors: admin.firestore.FieldValue.arrayRemove(uid),
    });
    c.attendanceRefs.forEach((aref) => {
      batch.update(aref, {
        tutors: admin.firestore.FieldValue.arrayRemove(uid),
      });
    });
  });
  chatPlans.forEach((plan) => {
    if (plan.action === "prune") {
      batch.update(
        plan.ref,
        buildPruneUpdate({
          deadUids: [uid],
          remainingParticipants: plan.remainingParticipants,
          fieldValue: admin.firestore.FieldValue,
        })
      );
    } else if (plan.action === "deactivate") {
      batch.update(
        plan.ref,
        buildDeactivateUpdate({
          participants: [...plan.remainingParticipants, uid],
          deletedUids: [uid],
          timestamp: chatTimestamp,
        })
      );
    }
  });
  batch.delete(userRef);
  await batch.commit();

  // Outside the batch: deleting the chat doc alone would strand its `messages`
  // subcollection, since Firestore does not cascade. Best-effort — the user is
  // already gone by this point, and a stranded thread is recoverable with
  // `scripts/purgeOrphanedChats.js`.
  const chatsDeleted = [];
  for (const plan of chatPlans) {
    if (plan.action !== "delete") continue;
    try {
      await db.recursiveDelete(plan.ref);
      chatsDeleted.push(plan.ref.id);
    } catch (err) {
      logger.warn("[adminDeleteUser] chat deletion failed (continuing)", {
        uid,
        chatId: plan.ref.id,
        errorMessage: err?.message,
      });
    }
  }

  let authDeleted = false;
  try {
    await adminSdk.auth().deleteUser(uid);
    authDeleted = true;
  } catch (err) {
    if (err?.code !== "auth/user-not-found") {
      logger.warn("[adminDeleteUser] auth deletion failed (continuing)", {
        uid,
        errorMessage: err?.message,
      });
    } else {
      authDeleted = true; // already gone — effectively the same outcome
    }
  }

  let tokensCleaned = false;
  try {
    await db.collection("userTokens").doc(uid).delete();
    tokensCleaned = true;
  } catch (err) {
    logger.warn("[adminDeleteUser] userTokens cleanup failed (continuing)", {
      uid,
      errorMessage: err?.message,
    });
  }

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.claims?.role || actor.role || null,
      action: "user.delete",
      targetType: "user",
      targetId: uid,
      targetName: displayName(userData, uid),
      payloadSummary: {
        role: userData.role,
        email: storedEmail,
        classesUpdated: cleanup.classes.length,
        futureAttendanceUpdated: cleanup.classes.reduce(
          (sum, c) => sum + c.attendanceRefs.length,
          0
        ),
        authDeleted,
        tokensCleaned,
        chatsDeleted: chatsDeleted.length,
        chatsDeactivated: chatPlans.filter((p) => p.action === "deactivate")
          .length,
        chatsPruned: chatPlans.filter((p) => p.action === "prune").length,
      },
      before: {
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
        email: userData.email,
      },
    },
    { logger, clock }
  );

  return {
    uid,
    role: userData.role,
    classesUpdated: cleanup.classes.length,
    futureAttendanceUpdated: cleanup.classes.reduce(
      (sum, c) => sum + c.attendanceRefs.length,
      0
    ),
    authDeleted,
    tokensCleaned,
    chatsDeleted: chatsDeleted.length,
    chatsDeactivated: chatPlans.filter((p) => p.action === "deactivate").length,
    chatsPruned: chatPlans.filter((p) => p.action === "prune").length,
  };
}

const adminDeleteUser = onCall({ region: "us-central1" }, async (request) => {
  const actor = requireAdminCallable(request);
  let payload;
  try {
    payload = validateDeleteUserPayload(request.data);
  } catch (err) {
    throw toHttpsError(err);
  }
  try {
    return await deleteUserImpl({
      payload,
      actor,
      deps: { admin, db: admin.firestore() },
    });
  } catch (err) {
    logger.error("[adminDeleteUser] failed", {
      errorMessage: err?.message,
      actorUid: actor.uid,
    });
    throw toHttpsError(err);
  }
});

module.exports = {
  validateDeleteUserPayload,
  deleteUserImpl,
  adminDeleteUser,
};
