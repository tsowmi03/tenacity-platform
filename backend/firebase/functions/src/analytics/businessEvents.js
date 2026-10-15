"use strict";

const { createHash } = require("crypto");

/**
 * Business events and person properties for PostHog (TP-35).
 *
 * What a family did, read from the records the platform already keeps, so
 * the numbers can't be lost to ad blockers or old app versions:
 *
 *   enrolment_created     an intake accepted, or a student added to a class
 *   enrolment_cancelled   a student taken out of a class, or removed (churn)
 *   swap_processed        a one-week or permanent class swap
 *   payment_received      an invoice paid (any method) or a one-off booking
 *   payment_failed        a Stripe payment that failed
 *
 * Every event is attributed to the family's parent UID, the same distinct ID
 * the app identifies with (MOB-59), so it joins the parent's app usage.
 *
 * Everything here is pure. The live triggers (`triggers.js`) and the backfill
 * script (`scripts/backfillPostHog.js`) both build events through these
 * functions, and both give an event the same UUID, so running the backfill
 * after the triggers are live doesn't double-count.
 *
 * Properties are IDs, fixed choices, counts and amounts. Never a child's name:
 * a class name ("Maths · Monday · 16:00") is fine, a student's is not.
 */

const EVENTS = Object.freeze({
  ENROLMENT_CREATED: "enrolment_created",
  ENROLMENT_CANCELLED: "enrolment_cancelled",
  SWAP_PROCESSED: "swap_processed",
  PAYMENT_RECEIVED: "payment_received",
  PAYMENT_FAILED: "payment_failed",
});

/** Roles that get a PostHog person profile. Students live elsewhere. */
const PERSON_ROLES = new Set(["parent", "tutor", "admin"]);

function trimmed(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function amount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/**
 * A stable UUID for one business fact, e.g. `payment_received:invoice:abc`.
 * PostHog replaces an event when the same UUID arrives again (it can take a
 * few minutes to show), which is what makes the backfill safe to rerun and
 * how a corrected event overwrites a wrong one.
 */
function eventUuid(key) {
  const hex = createHash("sha1").update(String(key)).digest("hex");
  // RFC 4122 shape, version 5 (name-based, SHA-1).
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function fullName(user) {
  return [trimmed(user?.firstName), trimmed(user?.lastName)]
    .filter(Boolean)
    .join(" ");
}

/**
 * The person properties for a `users/{uid}` doc, or null when the doc isn't a
 * person PostHog should know about. Name and email are approved (2026-10-14)
 * so dashboards can show who someone is rather than a UID. No phone number.
 */
function personPropertiesForUser(user) {
  if (!user || !PERSON_ROLES.has(user.role)) return null;
  const props = {
    name: fullName(user) || trimmed(user.email) || null,
    first_name: trimmed(user.firstName),
    last_name: trimmed(user.lastName),
    email: trimmed(user.email),
    role: user.role,
  };
  if (user.role === "parent") {
    props.student_count = Array.isArray(user.students) ? user.students.length : 0;
  }
  return props;
}

/** Whether a users doc write changed anything PostHog shows. */
function personPropertiesChanged(before, after) {
  const a = personPropertiesForUser(before);
  const b = personPropertiesForUser(after);
  if (!b) return false;
  return JSON.stringify(a) !== JSON.stringify(b);
}

/** The first-touch facts an accepted intake puts on the parent. */
function acquisitionProperties(enrolment, acceptedAt) {
  return {
    referral_source: trimmed(enrolment?.referralSource),
    registration_group_id: trimmed(enrolment?.registrationGroupId),
    acquired_via_referral_link: Boolean(trimmed(enrolment?.referralCode)),
    first_enrolled_at: acceptedAt ? acceptedAt.toISOString() : null,
  };
}

function classCount(value) {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * An accepted intake as `enrolment_created`.
 *
 * Built from the enrolment doc so the live trigger (which reads it when the
 * audit entry lands) and the backfill (which reads every accepted enrolment)
 * produce the same event.
 */
function enrolmentCreatedFromIntake({ enrolmentId, enrolment, parentId, studentId, classIds, newParent, acceptedAt, actorRole }) {
  const distinctId = trimmed(parentId) || trimmed(enrolment?.createdParentId);
  const when = toDate(acceptedAt) || toDate(enrolment?.acceptedAt);
  if (!distinctId || !when) return null;
  return {
    event: EVENTS.ENROLMENT_CREATED,
    distinctId,
    timestamp: when,
    uuid: eventUuid(`${EVENTS.ENROLMENT_CREATED}:intake:${enrolmentId}`),
    properties: {
      enrolment_type: "intake",
      enrolment_id: enrolmentId,
      student_id: trimmed(studentId) || trimmed(enrolment?.createdStudentId),
      class_count: classCount(classIds),
      year: trimmed(enrolment?.studentYear),
      subjects: Array.isArray(enrolment?.studentSubjects) ? enrolment.studentSubjects : [],
      new_parent: typeof newParent === "boolean" ? newParent : null,
      referral_source: trimmed(enrolment?.referralSource),
      by_role: actorRole || "admin",
    },
    setOnce: acquisitionProperties(enrolment, when),
  };
}

/**
 * The business event an audit entry describes, before its parent is known.
 *
 * Returns `{ event, studentId, parentId, ... }`. `parentId` is set when the
 * entry names the family itself (a parent acting, or `student.unenrol`, which
 * records it); otherwise the caller looks it up from the student. Returns null
 * for audit actions that aren't business events, and for `enrolment.accept`,
 * which needs the enrolment doc (see `enrolmentCreatedFromIntake`).
 */
function eventFromAuditEntry(entry, logId) {
  if (!entry || typeof entry !== "object") return null;
  const payload = entry.payloadSummary || {};
  const timestamp = toDate(entry.createdAt);
  if (!timestamp) return null;
  const byRole = entry.actorRole || null;
  const actorParent = byRole === "parent" ? trimmed(entry.actorUid) : null;
  const base = { timestamp, uuid: eventUuid(`audit:${logId}`) };

  switch (entry.action) {
    case "class.enrol_permanent":
      return {
        ...base,
        event: EVENTS.ENROLMENT_CREATED,
        studentId: trimmed(payload.studentId),
        parentId: actorParent,
        properties: {
          enrolment_type: "class_added",
          class_id: trimmed(payload.classId) || trimmed(entry.targetId),
          class_name: trimmed(payload.className) || trimmed(entry.targetName),
          student_id: trimmed(payload.studentId),
          by_role: byRole,
        },
      };
    case "class.unenrol_permanent":
      return {
        ...base,
        event: EVENTS.ENROLMENT_CANCELLED,
        studentId: trimmed(payload.studentId),
        parentId: actorParent,
        properties: {
          reason: "class_removed",
          class_id: trimmed(payload.classId) || trimmed(entry.targetId),
          class_name: trimmed(payload.className) || trimmed(entry.targetName),
          student_id: trimmed(payload.studentId),
          by_role: byRole,
        },
      };
    case "student.unenrol":
      return {
        ...base,
        event: EVENTS.ENROLMENT_CANCELLED,
        studentId: trimmed(entry.targetId),
        parentId: trimmed(payload.parentId) || actorParent,
        properties: {
          reason: "student_removed",
          student_id: trimmed(entry.targetId),
          class_count: classCount(payload.classIds),
          // The student is gone, so they are no longer in any class.
          student_still_enrolled: false,
          by_role: byRole,
        },
      };
    case "class.reschedule":
      return {
        ...base,
        event: EVENTS.SWAP_PROCESSED,
        studentId: trimmed(payload.studentId),
        parentId: actorParent,
        properties: {
          mode: payload.mode === "permanent" ? "permanent" : "one_week",
          from_class_id: trimmed(payload.oldClassId),
          from_class_name: trimmed(payload.oldClassName),
          to_class_id: trimmed(payload.newClassId) || trimmed(entry.targetId),
          to_class_name: trimmed(payload.newClassName) || trimmed(entry.targetName),
          student_id: trimmed(payload.studentId),
          by_role: byRole,
        },
      };
    default:
      return null;
  }
}

/** Before the paid write, amountDue holds what was outstanding; after, often 0. */
function invoiceAmountPaid(before, after) {
  if (typeof before?.amountDue === "number" && before.amountDue > 0) {
    return amount(before.amountDue);
  }
  return amount(after?.amountDue);
}

function daysBetween(from, to) {
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/**
 * An invoice that became paid, by any method: Stripe in the app, Xero's "Pay
 * now", or an admin marking it paid. `before` is null in the backfill, which
 * reads invoices that are already paid.
 */
function paymentFromInvoice({ invoiceId, before, after, fallbackTime }) {
  if (!after || after.status !== "paid") return null;
  if (before && before.status === "paid") return null;
  const distinctId = trimmed(after.parentId);
  const recorded = toDate(after.paidAt) || toDate(after.updatedAt);
  const timestamp = recorded || toDate(fallbackTime);
  if (!distinctId || !timestamp) return null;
  const dueDate = toDate(after.dueDate);
  return {
    event: EVENTS.PAYMENT_RECEIVED,
    distinctId,
    timestamp,
    uuid: eventUuid(`${EVENTS.PAYMENT_RECEIVED}:invoice:${invoiceId}`),
    properties: {
      kind: "invoice",
      invoice_id: invoiceId,
      invoice_number: after.invoiceNumber ?? null,
      amount: before ? invoiceAmountPaid(before, after) : amount(after.amountDue) || amount(after.amountDueComputed),
      currency: "aud",
      method: trimmed(after.stripePaymentIntentId) ? "stripe" : "manual",
      student_count: classCount(after.studentIds),
      days_after_due: recorded ? daysBetween(dueDate, timestamp) : null,
      // Some older invoices never recorded when they were paid, so the time
      // is the caller's fallback (the due date, in the backfill).
      paid_at_estimated: !recorded,
    },
  };
}

/**
 * A `paymentLogs/{paymentIntentId}` entry as an event.
 *
 * Invoice payments are left to `paymentFromInvoice`, which sees every method,
 * so they aren't counted twice. That leaves one-off bookings (no invoice) and
 * failures. Returns null otherwise, or when the status hasn't changed.
 */
function paymentFromPaymentLog({ paymentIntentId, before, after }) {
  if (!after) return null;
  if (before && before.status === after.status) return null;
  const metadata = after.metadata || {};
  const distinctId = trimmed(metadata.parentId);
  const timestamp = toDate(after.paidAt) || toDate(after.processedAt);
  if (!distinctId || !timestamp) return null;

  const common = {
    payment_intent_id: paymentIntentId,
    payment_source: after.source || null,
    amount: amount(after.amount),
    currency: after.currency || null,
  };

  if (after.status === "failed") {
    return {
      event: EVENTS.PAYMENT_FAILED,
      distinctId,
      timestamp,
      uuid: eventUuid(`${EVENTS.PAYMENT_FAILED}:${paymentIntentId}`),
      properties: {
        ...common,
        invoice_count: classCount(after.invoiceIds),
        error: trimmed(after.error),
      },
    };
  }

  if (after.status === "succeeded" && after.source === "one_off_booking") {
    return {
      event: EVENTS.PAYMENT_RECEIVED,
      distinctId,
      timestamp,
      uuid: eventUuid(`${EVENTS.PAYMENT_RECEIVED}:one_off:${paymentIntentId}`),
      properties: { ...common, kind: "one_off_booking", method: "stripe" },
    };
  }

  return null;
}

module.exports = {
  EVENTS,
  eventUuid,
  personPropertiesForUser,
  personPropertiesChanged,
  enrolmentCreatedFromIntake,
  eventFromAuditEntry,
  paymentFromInvoice,
  paymentFromPaymentLog,
  toDate,
};
