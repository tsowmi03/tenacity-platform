"use strict";

const { FieldValue } = require("firebase-admin/firestore");

const { planOneOffEnrolment } = require("./oneOffEnrolmentPlan");
const { HOLD_COLLECTION, capacityAfterHolds } = require("./oneOffSeatHolds");

/**
 * Put students into one session, transactionally.
 *
 * The one place a one-off enrolment is written. The parent-facing callable, the
 * payment webhook and the reconciliation sweep all come through here, so the
 * capacity check happens once and the same seat cannot be sold twice.
 *
 * Idempotent by construction: a student already in the session is reported as
 * `alreadyEnrolled` rather than added again, and the write uses `arrayUnion`.
 * A webhook Stripe delivers three times therefore enrols once.
 *
 * Never throws for a full session. Callers differ on what that means — the app
 * shows an error, the webhook refunds — so the decision belongs to them.
 */
async function enrolOneOffStudentsImpl({
  db,
  classId,
  attendanceDocId,
  studentIds,
  actor,
  canEnrol,
  respectHolds = false,
  paymentIntentId = null,
  now = new Date(),
}) {
  if (!db) throw new TypeError("enrolOneOffStudentsImpl requires db");
  if (!classId) throw new TypeError("enrolOneOffStudentsImpl requires classId");
  if (!attendanceDocId) {
    throw new TypeError("enrolOneOffStudentsImpl requires attendanceDocId");
  }
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    throw new TypeError("enrolOneOffStudentsImpl requires studentIds");
  }

  const classRef = db.collection("classes").doc(classId);
  const attendanceRef = classRef.collection("attendance").doc(attendanceDocId);

  return db.runTransaction(async (transaction) => {
    const [classSnap, attendanceSnap] = await Promise.all([
      transaction.get(classRef),
      transaction.get(attendanceRef),
    ]);

    if (!classSnap.exists) {
      return { ok: false, reason: "class_not_found" };
    }
    if (!attendanceSnap.exists) {
      return { ok: false, reason: "attendance_not_found" };
    }

    const classData = classSnap.data() || {};
    const attendanceData = attendanceSnap.data() || {};

    // Permission is the caller's to define. The webhook and the sweep act as
    // the system on a payment that has already been taken, so they pass
    // nothing; a parent-facing call passes a check against the student.
    if (typeof canEnrol === "function") {
      const studentSnaps = await Promise.all(
        studentIds.map((id) => transaction.get(db.collection("students").doc(id)))
      );
      for (let i = 0; i < studentSnaps.length; i += 1) {
        if (!studentSnaps[i].exists) {
          return { ok: false, reason: "student_not_found", studentId: studentIds[i] };
        }
        if (!canEnrol(studentSnaps[i].data() || {})) {
          return { ok: false, reason: "forbidden", studentId: studentIds[i] };
        }
      }
    }

    let capacity = typeof classData.capacity === "number" ? classData.capacity : 0;
    if (respectHolds) {
      // Seats reserved for payments still at the card sheet. Off unless the
      // caller asks: see oneOffSeatHolds.js for why the default is not to hold.
      const heldSnap = await transaction.get(
        db
          .collection(HOLD_COLLECTION)
          .where("classId", "==", classId)
          .where("attendanceDocId", "==", attendanceDocId)
      );
      capacity = capacityAfterHolds({
        capacity,
        holds: heldSnap.docs.map((doc) => doc.data()),
        now,
        excludePaymentIntentId: paymentIntentId,
      });
    }

    const plan = planOneOffEnrolment({
      currentAttendance: Array.isArray(attendanceData.attendance)
        ? attendanceData.attendance
        : [],
      capacity,
      studentIds,
    });

    if (!plan.isNoOp) {
      transaction.update(attendanceRef, {
        attendance: FieldValue.arrayUnion(...plan.toEnrol),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor?.uid || "system",
        notificationAction: {
          type: "one_off_enrollment",
          studentId: plan.toEnrol[0],
          studentIds: plan.toEnrol,
          actorId: actor?.uid || "system",
        },
      });
    }

    return {
      ok: true,
      enrolled: plan.toEnrol,
      alreadyEnrolled: plan.alreadyEnrolled,
      noCapacity: plan.noCapacity,
      classData,
      attendanceData,
    };
  });
}

module.exports = { enrolOneOffStudentsImpl };
