"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { displayName, writeAuditLog } = require("../shared/auditLog");
const { now } = require("../shared/timestamps");
const {
  assertString,
  assertEmail,
  validateShape,
} = require("../shared/validation");

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

  const totalOps =
    1 +
    cleanup.classes.length +
    cleanup.classes.reduce((sum, c) => sum + c.attendanceRefs.length, 0);
  if (totalOps > 450) {
    // Leave headroom under Firestore's 500-op batch limit.
    throw new HttpsError(
      "resource-exhausted",
      `Cleanup would require ${totalOps} writes; please reduce scope first.`
    );
  }

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
  batch.delete(userRef);
  await batch.commit();

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
