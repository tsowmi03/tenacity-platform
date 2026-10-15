"use strict";

const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");

const {
  EVENTS,
  enrolmentCreatedFromIntake,
  eventFromAuditEntry,
  paymentFromInvoice,
  paymentFromPaymentLog,
  personPropertiesChanged,
  personPropertiesForUser,
} = require("./businessEvents");
const {
  parentForStudent,
  sendToPostHog,
  studentStillEnrolled,
} = require("./serverAnalytics");

/**
 * Live TP-35 triggers. Each reads a record the platform already writes and
 * sends what it means to PostHog, so the app, the portal and Stripe don't each
 * need their own analytics call.
 *
 * - `adminAuditLogs` carries enrolments, unenrolments and swaps, from the app
 *   and the portal alike.
 * - `invoices` turning paid covers every payment method.
 * - `paymentLogs` adds one-off bookings and failed payments.
 * - `users` keeps names, emails and roles on PostHog persons current.
 */

/** The audit entry's business event, with its parent resolved. */
async function auditLogEventImpl({ entry, logId, db }) {
  if (entry?.action === "enrolment.accept") {
    const payload = entry.payloadSummary || {};
    const enrolmentSnap = await db.collection("enrolments").doc(entry.targetId).get();
    return enrolmentCreatedFromIntake({
      enrolmentId: entry.targetId,
      enrolment: enrolmentSnap.exists ? enrolmentSnap.data() : {},
      parentId: payload.parentId,
      studentId: payload.studentId,
      classIds: payload.classIds,
      newParent: payload.authUserCreated,
      acceptedAt: entry.createdAt,
      actorRole: entry.actorRole,
    });
  }

  const draft = eventFromAuditEntry(entry, logId);
  if (!draft) return null;

  const distinctId = draft.parentId || (await parentForStudent(db, draft.studentId));
  if (!distinctId) {
    logger.info("[analytics] no parent for audit event; skipped", {
      logId,
      action: entry.action,
    });
    return null;
  }

  const properties = { ...draft.properties };
  if (draft.event === EVENTS.ENROLMENT_CANCELLED && properties.reason === "class_removed") {
    // false means the student has left every class: churn, not a change.
    properties.student_still_enrolled = await studentStillEnrolled(db, draft.studentId);
  }

  return { ...draft, distinctId, properties };
}

const onAuditLogAnalytics = onDocumentCreated(
  "adminAuditLogs/{logId}",
  async (event) => {
    const entry = event.data?.data();
    try {
      const evt = await auditLogEventImpl({
        entry,
        logId: event.params.logId,
        db: admin.firestore(),
      });
      if (evt) await sendToPostHog({ events: [evt] }, { logger });
    } catch (err) {
      logger.warn("[analytics] audit log event failed", {
        logId: event.params.logId,
        errorMessage: err?.message,
      });
    }
  }
);

const onInvoicePaidAnalytics = onDocumentUpdated(
  "invoices/{invoiceId}",
  async (event) => {
    const evt = paymentFromInvoice({
      invoiceId: event.params.invoiceId,
      before: event.data?.before.data(),
      after: event.data?.after.data(),
      fallbackTime: event.time,
    });
    if (evt) await sendToPostHog({ events: [evt] }, { logger });
  }
);

const onPaymentLogAnalytics = onDocumentWritten(
  "paymentLogs/{paymentIntentId}",
  async (event) => {
    const evt = paymentFromPaymentLog({
      paymentIntentId: event.params.paymentIntentId,
      before: event.data?.before?.exists ? event.data.before.data() : null,
      after: event.data?.after?.exists ? event.data.after.data() : null,
    });
    if (evt) await sendToPostHog({ events: [evt] }, { logger });
  }
);

const onUserAnalytics = onDocumentWritten("users/{uid}", async (event) => {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  // Most user writes are chat counters and push tokens; only names, emails,
  // roles and student counts reach PostHog.
  if (!personPropertiesChanged(before, after)) return;
  await sendToPostHog(
    {
      people: [
        { distinctId: event.params.uid, properties: personPropertiesForUser(after) },
      ],
    },
    { logger }
  );
});

module.exports = {
  auditLogEventImpl,
  onAuditLogAnalytics,
  onInvoicePaidAnalytics,
  onPaymentLogAnalytics,
  onUserAnalytics,
};
