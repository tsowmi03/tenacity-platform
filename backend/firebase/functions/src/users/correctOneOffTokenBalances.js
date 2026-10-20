"use strict";

const { displayName, writeAuditLog } = require("../shared/auditLog");

/**
 * MOB-64 remediation: give back the lesson tokens one-off bookings never took.
 *
 * From 22 May 2026, when production Firestore rules stopped letting a parent
 * write their own `lessonTokens`, the app's token deduction after a one-off
 * booking failed every time. The booking itself went through, so families
 * booked with a token and kept it. `enrollStudentOneOff` now takes the token
 * in the booking's own transaction; this corrects the balances left behind.
 *
 * Before 22 May the rules were open and the deduction worked, so bookings
 * before then are not counted.
 *
 * A token booking is a parent's `class.book_one_off` audit entry (written by
 * the app after the callable succeeded) that is not matched to a paid one-off:
 * until August, paid one-offs came through the same callable, so each is
 * matched against a one-off invoice or a payment fulfilment for the same
 * parent and student. A booking the server has already charged for is
 * recorded as a `one_off_booking` token audit and is never counted twice.
 *
 * Corrections never take a balance below zero; what cannot be taken back is
 * reported as written off. Each correction is recorded in the audit log, and a
 * parent already corrected is skipped, so running the script twice is safe.
 */

const RULES_LOCKED_AT = new Date("2026-05-22T04:27:20Z");
const CORRECTION_REASON = "mob64_correction";
const INVOICE_MATCH_WINDOW_MS = 2 * 60 * 60 * 1000;

const millis = (value) => {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return null;
};

const isOneOffInvoice = (invoice) =>
  invoice.weeks === 1 &&
  (invoice.lineItems || []).some((line) =>
    /one-off/i.test(line.description || "")
  );

/**
 * Work out, per parent, how many tokens their bookings should have taken.
 * Pure: everything it needs is passed in, so it can be tested without
 * Firestore.
 */
function planTokenCorrections({ auditLogs, invoices, fulfilments, parents }) {
  const lockedAt = RULES_LOCKED_AT.getTime();
  const corrected = new Set(
    auditLogs
      .filter(
        (e) =>
          e.action === "user.adjust_lesson_tokens" &&
          e.payloadSummary?.reason === CORRECTION_REASON
      )
      .map((e) => e.targetId)
  );
  const serverCharged = new Set(
    auditLogs
      .filter(
        (e) =>
          e.action === "user.adjust_lesson_tokens" &&
          e.payloadSummary?.reason === "one_off_booking"
      )
      .map(
        (e) =>
          `${e.targetId}|${e.payloadSummary.classId}|${e.payloadSummary.attendanceDocId}|${e.payloadSummary.studentId}`
      )
  );

  const bookings = auditLogs
    .filter(
      (e) =>
        e.action === "class.book_one_off" &&
        e.actorRole === "parent" &&
        millis(e.createdAt) >= lockedAt
    )
    .sort((a, b) => millis(a.createdAt) - millis(b.createdAt));

  const oneOffInvoices = invoices.filter(isOneOffInvoice);
  const usedInvoices = new Set();
  const owed = new Map();

  for (const booking of bookings) {
    const parentId = booking.actorUid;
    const { studentId, classId } = booking.payloadSummary || {};
    const attendanceDocId = booking.targetId;
    const at = millis(booking.createdAt);

    if (serverCharged.has(`${parentId}|${classId}|${attendanceDocId}|${studentId}`)) {
      continue;
    }

    const invoice = oneOffInvoices.find(
      (i) =>
        !usedInvoices.has(i.id) &&
        i.parentId === parentId &&
        (i.studentIds || []).includes(studentId) &&
        Math.abs(millis(i.createdAt) - at) < INVOICE_MATCH_WINDOW_MS
    );
    if (invoice) {
      usedInvoices.add(invoice.id);
      continue;
    }
    const paidByWebhook = fulfilments.some(
      (f) =>
        f.parentId === parentId &&
        f.booking?.classId === classId &&
        f.booking?.attendanceDocId === attendanceDocId &&
        (f.enrolledStudentIds || []).includes(studentId)
    );
    if (paidByWebhook) continue;

    const entry = owed.get(parentId) || { parentId, bookings: [] };
    entry.bookings.push({ at: new Date(at).toISOString(), classId, attendanceDocId, studentId });
    owed.set(parentId, entry);
  }

  return [...owed.values()].map((entry) => {
    const parent = parents.get(entry.parentId) || {};
    const current = typeof parent.lessonTokens === "number" ? parent.lessonTokens : 0;
    const tokenBookings = entry.bookings.length;
    const target = Math.max(0, current - tokenBookings);
    return {
      parentId: entry.parentId,
      name: displayName(parent, entry.parentId),
      tokenBookings,
      current,
      target,
      writtenOff: Math.max(0, tokenBookings - current),
      alreadyCorrected: corrected.has(entry.parentId),
      bookings: entry.bookings,
    };
  });
}

/**
 * Apply one parent's correction. Re-reads the balance in a transaction, so a
 * booking or admin edit made since the plan was printed is respected: the
 * same number of tokens is taken from whatever the balance is now.
 */
async function applyTokenCorrection({ db, correction, logger }) {
  const ref = db.collection("users").doc(correction.parentId);
  let before = 0;
  let after = 0;
  let userData = {};
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    userData = snap.data() || {};
    before = typeof userData.lessonTokens === "number" ? userData.lessonTokens : 0;
    after = Math.max(0, before - correction.tokenBookings);
    if (after !== before) txn.update(ref, { lessonTokens: after });
  });

  await writeAuditLog(
    db,
    {
      actorUid: "system:mob-64",
      actorRole: "system",
      action: "user.adjust_lesson_tokens",
      targetType: "user",
      targetId: correction.parentId,
      targetName: displayName(userData, correction.parentId),
      payloadSummary: {
        mode: "delta",
        value: after - before,
        reason: CORRECTION_REASON,
        tokenBookings: correction.tokenBookings,
        writtenOff: correction.tokenBookings - (before - after),
      },
      before: { lessonTokens: before },
      after: { lessonTokens: after },
    },
    { logger, throwOnError: true }
  );

  return { before, after };
}

async function loadCorrectionInputs(db) {
  const [auditSnap, invoiceSnap, fulfilmentSnap] = await Promise.all([
    db.collection("adminAuditLogs").get(),
    db.collection("invoices").get(),
    db.collection("oneOffFulfilments").get(),
  ]);
  const auditLogs = auditSnap.docs.map((d) => d.data());
  const parentIds = [
    ...new Set(
      auditLogs
        .filter((e) => e.action === "class.book_one_off" && e.actorRole === "parent")
        .map((e) => e.actorUid)
    ),
  ];
  const parentSnaps = await Promise.all(
    parentIds.map((id) => db.collection("users").doc(id).get())
  );
  return {
    auditLogs,
    invoices: invoiceSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    fulfilments: fulfilmentSnap.docs.map((d) => d.data()),
    parents: new Map(parentSnaps.map((s) => [s.id, s.data() || {}])),
  };
}

module.exports = {
  CORRECTION_REASON,
  RULES_LOCKED_AT,
  applyTokenCorrection,
  loadCorrectionInputs,
  planTokenCorrections,
};
