"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { ensureAuthUser } = require("../auth/authUsers");
const { toHttpsError } = require("../shared/errors");
const { displayName, writeAuditLog } = require("../shared/auditLog");
const { validateCreateUserInput } = require("./userSchemas");
const { buildUserDoc } = require("./userFactory");
const { validateCreateStudentInput } = require("../students/studentSchemas");
const { buildStudentDoc } = require("../students/studentFactory");
const { sendgridApiKey } = require("../email/sendgridSecret");
const { sendWelcomeEmailSafe } = require("../email/welcomeEmail");

/**
 * Validate the full `adminCreateUser` payload, including optional bundled
 * students for parent users. Returns `{ user, students }` where each piece is
 * already normalised by its respective validator.
 *
 * Non-parent roles cannot bundle students — this prevents the UI from
 * accidentally orphaning student docs under a tutor/admin account.
 */
function validateCreateUserPayload(input) {
  const user = validateCreateUserInput(input || {});
  let students = [];
  if (input && Array.isArray(input.students)) {
    if (user.role !== "parent") {
      throw new HttpsError(
        "invalid-argument",
        "students[] is only allowed when role is 'parent'"
      );
    }
    students = input.students.map((s, i) => {
      try {
        return validateCreateStudentInput(s);
      } catch (err) {
        if (err && err.issues) {
          err.message = `students[${i}]: ${err.message}`;
        }
        throw err;
      }
    });
  }
  return { user, students };
}

/**
 * Core implementation, separated from the onCall wrapper for testability.
 * `deps` lets callers stub `admin`, `db`, `clock`, and the welcome-email
 * sender. The function is idempotent on its bundled-student set (it always
 * generates fresh student IDs), but NOT on the auth-user identity: re-running
 * with the same email after a successful create returns a conflict.
 */
async function createUserImpl({ payload, actor, deps }) {
  const { admin, db, clock, sendWelcomeEmail = sendWelcomeEmailSafe } = deps;
  if (!admin || !db) throw new TypeError("createUserImpl requires admin/db deps");
  if (!actor?.uid) throw new TypeError("createUserImpl requires actor.uid");

  const { user, students } = payload;

  const { uid, created } = await ensureAuthUser(
    {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      temporaryPassword: user.temporaryPassword,
    },
    { admin }
  );

  // Pre-allocate student IDs so we can wire `users.students` ↔ `students.parents`
  // in a single batch.
  const studentRefs = students.map(() => db.collection("students").doc());
  const studentIds = studentRefs.map((ref) => ref.id);

  const userRef = db.collection("users").doc(uid);
  const existing = await userRef.get();
  if (existing.exists) {
    throw new HttpsError(
      "already-exists",
      `User document already exists for ${user.email} (uid=${uid})`
    );
  }

  const userDoc = buildUserDoc(user, { actorUid: actor.uid, clock });
  if (user.role === "parent" && studentIds.length) {
    userDoc.students = [...studentIds];
  }

  const batch = db.batch();
  batch.set(userRef, userDoc);
  students.forEach((studentInput, i) => {
    const doc = buildStudentDoc(
      { ...studentInput, parents: [uid] },
      { actorUid: actor.uid, clock }
    );
    if (!doc.primaryParentId) doc.primaryParentId = uid;
    batch.set(studentRefs[i], doc);
  });
  await batch.commit();

  // Set the role claim directly so the new user gets correct permissions on
  // their first sign-in without waiting for the syncUserRoleClaim trigger.
  try {
    await admin.auth().setCustomUserClaims(uid, { role: user.role });
  } catch (err) {
    logger.warn("[adminCreateUser] setCustomUserClaims failed (continuing)", {
      uid,
      errorMessage: err?.message,
    });
  }

  // Welcome email is sent when:
  //   - the auth user was just created (always — they need to set a password), OR
  //   - the caller explicitly opts in via sendWelcomeEmail
  const wantsEmail = created || user.sendWelcomeEmail === true;
  let welcomeEmail = { sent: false, reason: "skipped" };
  if (wantsEmail) {
    welcomeEmail = await sendWelcomeEmail(user.email, user.firstName);
  }

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.claims?.role || actor.role || null,
      action: "user.create",
      targetType: "user",
      targetId: uid,
      targetName: displayName(user, uid),
      payloadSummary: {
        role: user.role,
        email: user.email,
        bundledStudentIds: studentIds,
        reusedAuthUser: !created,
      },
    },
    { logger, clock }
  );

  return {
    uid,
    role: user.role,
    studentIds,
    authUserCreated: created,
    welcomeEmail,
  };
}

const adminCreateUser = onCall(
  { region: "us-central1", secrets: [sendgridApiKey] },
  async (request) => {
    const admin = require("firebase-admin");
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateCreateUserPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await createUserImpl({
        payload,
        actor,
        deps: { admin, db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminCreateUser] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  validateCreateUserPayload,
  createUserImpl,
  adminCreateUser,
};
