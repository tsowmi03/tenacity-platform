"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { ensureAuthUser } = require("../auth/authUsers");
const { toHttpsError } = require("../shared/errors");
const { displayName, writeAuditLog } = require("../shared/auditLog");
const {
  assertArray,
  assertString,
  validateShape,
} = require("../shared/validation");
const { validateCreateUserInput } = require("./userSchemas");
const { buildUserDoc } = require("./userFactory");
const { sendgridApiKey } = require("../email/sendgridSecret");
const { sendWelcomeEmailSafe } = require("../email/welcomeEmail");

/**
 * `adminCreateParent` payload: parent user fields + the existing studentIds to
 * link them to. `role` is always 'parent' here — the caller doesn't pass it.
 *
 * Bundled student CREATION is owned by adminCreateUser. This endpoint exists
 * specifically for the case "the kid already exists in students/, give them a
 * (new) parent account".
 */
function validateCreateParentPayload(input) {
  if (!input || typeof input !== "object") {
    throw new HttpsError("invalid-argument", "payload required");
  }
  const userFields = validateCreateUserInput({ ...input, role: "parent" });
  const { studentIds } = validateShape(input, {
    studentIds: (v) =>
      assertArray(v, "studentIds", {
        itemAssert: (item, f) => assertString(item, f, { max: 120 }),
        unique: true,
        min: 1,
      }),
  });
  return { user: userFields, studentIds };
}

/**
 * Read all student docs, verify they exist, then transactionally:
 *   - write users/{uid} with students = [...studentIds]
 *   - arrayUnion the new uid onto each student's `parents`
 *
 * If any student is missing, throw `not-found` before writing anything.
 *
 * If the parent's auth user already exists AND has a users doc, that's a
 * conflict — `adminLinkStudentToParent` is the right tool for "add this kid
 * to an existing parent".
 */
async function createParentImpl({ payload, actor, deps }) {
  const { admin: adminSdk, db, clock, sendWelcomeEmail = sendWelcomeEmailSafe } = deps;
  if (!adminSdk || !db) throw new TypeError("createParentImpl requires admin/db deps");
  if (!actor?.uid) throw new TypeError("createParentImpl requires actor.uid");

  const { user, studentIds } = payload;

  const { uid, created } = await ensureAuthUser(
    {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      temporaryPassword: user.temporaryPassword,
    },
    { admin: adminSdk }
  );

  const userRef = db.collection("users").doc(uid);
  const studentRefs = studentIds.map((id) => db.collection("students").doc(id));

  await db.runTransaction(async (txn) => {
    const userSnap = await txn.get(userRef);
    if (userSnap.exists) {
      throw new HttpsError(
        "already-exists",
        `User document already exists for ${user.email} (uid=${uid})`
      );
    }
    const studentSnaps = await Promise.all(studentRefs.map((r) => txn.get(r)));
    studentSnaps.forEach((snap, i) => {
      if (!snap.exists) {
        throw new HttpsError(
          "not-found",
          `Student not found: ${studentIds[i]}`
        );
      }
    });

    const userDoc = buildUserDoc(user, { actorUid: actor.uid, clock });
    userDoc.students = [...studentIds];
    txn.set(userRef, userDoc);
    studentRefs.forEach((ref) => {
      txn.update(ref, {
        parents: admin.firestore.FieldValue.arrayUnion(uid),
      });
    });
  });

  try {
    await adminSdk.auth().setCustomUserClaims(uid, { role: "parent" });
  } catch (err) {
    logger.warn("[adminCreateParent] setCustomUserClaims failed (continuing)", {
      uid,
      errorMessage: err?.message,
    });
  }

  let welcomeEmail = { sent: false, reason: "skipped" };
  if (created || user.sendWelcomeEmail === true) {
    welcomeEmail = await sendWelcomeEmail(user.email, user.firstName);
  }

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.claims?.role || actor.role || null,
      action: "parent.create",
      targetType: "user",
      targetId: uid,
      targetName: displayName(user, uid),
      payloadSummary: {
        email: user.email,
        linkedStudentIds: studentIds,
        reusedAuthUser: !created,
      },
    },
    { logger, clock }
  );

  return {
    uid,
    role: "parent",
    studentIds,
    authUserCreated: created,
    welcomeEmail,
  };
}

const adminCreateParent = onCall(
  { region: "us-central1", secrets: [sendgridApiKey] },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateCreateParentPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await createParentImpl({
        payload,
        actor,
        deps: { admin, db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminCreateParent] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  validateCreateParentPayload,
  createParentImpl,
  adminCreateParent,
};
