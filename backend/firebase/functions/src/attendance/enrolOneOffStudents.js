"use strict";

const { FieldValue } = require("firebase-admin/firestore");

const { sessionIsCancelled } = require("./cancelledSession");
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
 *
 * A cancelled session is refused as `session_cancelled`, and enrols nobody.
 * Checked inside the transaction, so a screen opened before the admin
 * cancelled cannot book into it (MOB-58). For the webhook that means a
 * payment taken moments before the cancellation lands with an admin rather
 * than buying a class that is not running.
 *
 * `chargeTokensTo` is the parent who pays with lesson tokens: one token per
 * student actually added, taken in this same transaction (MOB-64). The app
 * used to take it afterwards, from the device, and Firestore rules refused
 * every one of those writes, so families booked and kept their tokens. Too
 * few tokens is refused as `insufficient_tokens` before anything is written.
 * A student already in the session costs nothing, so a retried call cannot
 * charge twice.
 *
 * `notifyAdminsViaTrigger` lets `onAttendanceChangeNotifyAdmins` tell admins
 * about the new students, as it does for any other attendance write. Off by
 * default, which marks the write so the trigger stays quiet: the webhook and
 * the sweep have never sent that notification and still do not. The
 * parent-facing callable turns it on so it can answer the family as soon as
 * the seat is written, instead of making them wait for the push (MOB-55).
 */
async function enrolOneOffStudentsImpl({
  db,
  classId,
  attendanceDocId,
  studentIds,
  actor,
  canEnrol,
  chargeTokensTo = null,
  respectHolds = false,
  notifyAdminsViaTrigger = false,
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
  const payerRef = chargeTokensTo
    ? db.collection("users").doc(chargeTokensTo)
    : null;

  return db.runTransaction(async (transaction) => {
    const [classSnap, attendanceSnap, payerSnap] = await Promise.all([
      transaction.get(classRef),
      transaction.get(attendanceRef),
      payerRef ? transaction.get(payerRef) : Promise.resolve(null),
    ]);

    if (!classSnap.exists) {
      return { ok: false, reason: "class_not_found" };
    }
    if (!attendanceSnap.exists) {
      return { ok: false, reason: "attendance_not_found" };
    }

    const classData = classSnap.data() || {};
    const attendanceData = attendanceSnap.data() || {};

    if (sessionIsCancelled(attendanceData)) {
      return { ok: false, reason: "session_cancelled" };
    }

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

    let tokens = null;
    if (payerRef) {
      if (!payerSnap.exists) {
        return { ok: false, reason: "payer_not_found" };
      }
      const payerData = payerSnap.data() || {};
      const before =
        typeof payerData.lessonTokens === "number" ? payerData.lessonTokens : 0;
      const cost = plan.toEnrol.length;
      if (cost > before) {
        return {
          ok: false,
          reason: "insufficient_tokens",
          tokensAvailable: before,
          tokensNeeded: cost,
        };
      }
      tokens = { charged: cost, before, after: before - cost };
      if (cost > 0) {
        transaction.update(payerRef, { lessonTokens: tokens.after });
      }
    }

    if (!plan.isNoOp) {
      transaction.update(attendanceRef, {
        attendance: FieldValue.arrayUnion(...plan.toEnrol),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor?.uid || "system",
        // Deleting rather than omitting: a marker left by an earlier write
        // would otherwise still be on the document and silence the trigger.
        notificationAction: notifyAdminsViaTrigger
          ? FieldValue.delete()
          : {
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
      tokens,
      classData,
      attendanceData,
    };
  });
}

module.exports = { enrolOneOffStudentsImpl };
