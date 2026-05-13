"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { ensureAuthUser } = require("../auth/authUsers");
const { toHttpsError } = require("../shared/errors");
const { writeAuditLog } = require("../shared/auditLog");
const { now } = require("../shared/timestamps");
const {
  sendgridApiKey,
} = require("../email/sendgridSecret");
const { sendWelcomeEmailSafe } = require("../email/welcomeEmail");
const {
  sendParentEnrolmentAcceptedEmail,
} = require("../../lib/email_functions");
const {
  validateAcceptEnrolmentInput,
} = require("./enrolmentSchemas");
const { acceptedFields } = require("./enrolmentFactory");
const { buildUserDoc } = require("../users/userFactory");
const { buildStudentDoc } = require("../students/studentFactory");

/**
 * Idempotent enrolment acceptance.
 *
 * Replaces the original onRequest `acceptPendingEnrolment` (which was not
 * idempotent and returned plain text). Behavior matches PLAN.md §5:
 *
 *  - If the enrolment is already `accepted`, return the existing
 *    `createdParentId` / `createdStudentId` — no duplicate student.
 *  - Otherwise, ensure the Firebase Auth parent user (create-or-reuse),
 *    create the student doc, link both ways, enrol into selected classes,
 *    add the student to FUTURE attendance docs only, and update the
 *    enrolment lifecycle fields (status=accepted, archived=true,
 *    acceptedAt/By, createdParentId/StudentId).
 *  - Send welcome email only when a new auth user was created. Always send
 *    the enrolment-accepted email.
 *
 * Caveat: enrolments accepted by the OLD onRequest function never had their
 * `status` field set. Re-running this function against such a record would
 * create a duplicate student. We accept that risk because the old function
 * was only called once per enrolment in practice; the live UI now uses this
 * callable and writes the lifecycle fields.
 */

async function sendAcceptedEmailSafe(email, studentName, classes, subjects) {
  try {
    await sendParentEnrolmentAcceptedEmail(email, studentName, classes, subjects);
    return { sent: true };
  } catch (err) {
    logger.warn("[adminAcceptEnrolment] accepted email send failed (continuing)", {
      email,
      errorMessage: err?.message,
    });
    return { sent: false, reason: "send-failed", error: err };
  }
}

function buildClassesSummary(classesArr) {
  if (!Array.isArray(classesArr)) return "";
  return classesArr
    .map((c) => `${c?.day || "?"} @ ${c?.startTime || "?"}`)
    .join(", ");
}

/**
 * Pre-query each selected class's future-attendance docs OUTSIDE the txn so
 * the txn body only does reads on specific document refs. Firestore txns
 * cannot run collection queries.
 */
async function gatherClassEnrolmentTargets(db, classIds, clock) {
  const cutoff = now(clock);
  const out = [];
  for (const classId of classIds) {
    const classRef = db.collection("classes").doc(classId);
    const futureSnap = await classRef
      .collection("attendance")
      .where("date", ">=", cutoff)
      .get();
    out.push({
      classId,
      classRef,
      attendanceRefs: futureSnap.docs.map((d) => d.ref),
    });
  }
  return out;
}

async function acceptEnrolmentImpl({ payload, actor, deps }) {
  const {
    admin: adminSdk,
    db,
    clock,
    sendWelcomeEmail = sendWelcomeEmailSafe,
    sendAcceptedEmail = sendAcceptedEmailSafe,
  } = deps;
  if (!adminSdk || !db) {
    throw new TypeError("acceptEnrolmentImpl requires admin/db deps");
  }
  if (!actor?.uid) {
    throw new TypeError("acceptEnrolmentImpl requires actor.uid");
  }

  const { enrolmentId } = payload;
  const enrolmentRef = db.collection("enrolments").doc(enrolmentId);
  const snap = await enrolmentRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `Enrolment not found: ${enrolmentId}`);
  }
  const data = snap.data() || {};

  if (data.status === "accepted" && data.createdParentId && data.createdStudentId) {
    return {
      idempotent: true,
      enrolmentId,
      parentId: data.createdParentId,
      studentId: data.createdStudentId,
      classIds: (data.classes || []).map((c) => c?.id).filter(Boolean),
      welcomeEmail: { sent: false, reason: "already-accepted" },
      acceptedEmail: { sent: false, reason: "already-accepted" },
    };
  }
  if (data.status === "deleted") {
    throw new HttpsError("failed-precondition", "Enrolment has been deleted");
  }

  const parentInput = {
    role: "parent",
    firstName: data.carerFirstName || "",
    lastName: data.carerLastName || "",
    email: String(data.carerEmail || "").trim().toLowerCase(),
    phone: data.carerPhone || "",
  };
  if (!parentInput.email) {
    throw new HttpsError(
      "failed-precondition",
      "Enrolment is missing carerEmail"
    );
  }

  const subjects = Array.isArray(data.studentSubjects)
    ? data.studentSubjects.map((s) => (typeof s === "string" ? s.trim() : ""))
    : [];
  const studentInput = {
    firstName: data.studentFirstName || "",
    lastName: data.studentLastName || "",
    grade: data.studentYear || "",
    subjects,
  };

  const classIds = Array.isArray(data.classes)
    ? data.classes.map((c) => c?.id).filter(Boolean)
    : [];

  const { uid: parentUid, created: authUserCreated } = await ensureAuthUser(
    {
      email: parentInput.email,
      firstName: parentInput.firstName,
      lastName: parentInput.lastName,
    },
    { admin: adminSdk }
  );

  const studentRef = db.collection("students").doc();
  const studentId = studentRef.id;
  const targets = await gatherClassEnrolmentTargets(db, classIds, clock);

  const totalOps =
    2 + // parent + enrolment
    1 + // student
    targets.length +
    targets.reduce((sum, t) => sum + t.attendanceRefs.length, 0);
  if (totalOps > 450) {
    throw new HttpsError(
      "resource-exhausted",
      `Acceptance would require ${totalOps} writes; please reduce scope first.`
    );
  }

  await db.runTransaction(async (txn) => {
    const fresh = await txn.get(enrolmentRef);
    if (!fresh.exists) {
      throw new HttpsError("not-found", "Enrolment vanished during accept");
    }
    const freshData = fresh.data() || {};
    if (freshData.status === "accepted") {
      // Another admin won the race. Abort so the caller retries and hits the
      // idempotency short-circuit above.
      throw new HttpsError(
        "aborted",
        "Enrolment was accepted concurrently; please retry"
      );
    }

    const parentRef = db.collection("users").doc(parentUid);
    const parentSnap = await txn.get(parentRef);

    if (parentSnap.exists) {
      txn.update(parentRef, {
        students: admin.firestore.FieldValue.arrayUnion(studentId),
      });
    } else {
      const parentDoc = buildUserDoc(parentInput, {
        actorUid: actor.uid,
        clock,
      });
      parentDoc.students = [studentId];
      txn.set(parentRef, parentDoc);
    }

    const studentDoc = buildStudentDoc(
      { ...studentInput, parents: [parentUid] },
      { actorUid: actor.uid, clock }
    );
    studentDoc.primaryParentId = parentUid;
    txn.set(studentRef, studentDoc);

    targets.forEach(({ classRef, attendanceRefs }) => {
      txn.update(classRef, {
        enrolledStudents: admin.firestore.FieldValue.arrayUnion(studentId),
      });
      attendanceRefs.forEach((aref) => {
        txn.update(aref, {
          attendance: admin.firestore.FieldValue.arrayUnion(studentId),
          updatedAt: now(clock),
          updatedBy: actor.uid,
        });
      });
    });

    txn.update(
      enrolmentRef,
      acceptedFields({
        actorUid: actor.uid,
        createdParentId: parentUid,
        createdStudentId: studentId,
        clock,
      })
    );
  });

  try {
    await adminSdk.auth().setCustomUserClaims(parentUid, { role: "parent" });
  } catch (err) {
    logger.warn("[adminAcceptEnrolment] setCustomUserClaims failed (continuing)", {
      uid: parentUid,
      errorMessage: err?.message,
    });
  }

  let welcomeEmail = { sent: false, reason: "skipped" };
  if (authUserCreated) {
    welcomeEmail = await sendWelcomeEmail(parentInput.email, parentInput.firstName);
  }

  const studentDisplay = `${studentInput.firstName} ${studentInput.lastName}`.trim();
  const acceptedEmail = await sendAcceptedEmail(
    parentInput.email,
    studentDisplay,
    buildClassesSummary(data.classes),
    subjects.join(", ")
  );

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: "enrolment.accept",
      targetType: "enrolment",
      targetId: enrolmentId,
      payloadSummary: {
        parentId: parentUid,
        studentId,
        classIds,
        authUserCreated,
      },
    },
    { logger, clock }
  );

  return {
    idempotent: false,
    enrolmentId,
    parentId: parentUid,
    studentId,
    authUserCreated,
    classIds,
    welcomeEmail,
    acceptedEmail,
  };
}

const adminAcceptEnrolment = onCall(
  { region: "us-central1", secrets: [sendgridApiKey] },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateAcceptEnrolmentInput(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await acceptEnrolmentImpl({
        payload,
        actor,
        deps: { admin, db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminAcceptEnrolment] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
        enrolmentId: payload?.enrolmentId,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  acceptEnrolmentImpl,
  adminAcceptEnrolment,
};
