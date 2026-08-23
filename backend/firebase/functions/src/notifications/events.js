"use strict";

const { getMessaging } = require("firebase-admin/messaging");
const admin = require("firebase-admin");

const { sendAndRecord } = require("./send");
const {
  getAdminTokenOwners,
  to12Hour,
} = require("../../lib/notifications/shared");

/**
 * Business events that produce a notification.
 *
 * The notification layer grew up reading Firestore document diffs and
 * inferring what a person had done. That inference is the root of the
 * duplicate-notification problem: one human action writes to many documents,
 * and a trigger watching documents cannot tell "an admin moved a student" from
 * "twenty separate weekly changes". These names say what happened instead, so
 * one action produces exactly one notification regardless of how many writes
 * it takes.
 *
 * Dispatch is in-process. The abandoned `lib/events/` sketch routed events
 * through a Pub/Sub topic, which buys decoupling this system has no use for
 * while costing a dependency, a topic to provision, two more deployed
 * functions, and — because there is no Pub/Sub emulator configured — a domain
 * with no test coverage. Every mutation already runs inside a callable that
 * knows the intent, so the callable emits directly after its write commits.
 *
 * The names are the ones the earlier sketch chose; there was no reason to
 * invent different ones.
 */
const NOTIFICATION_EVENTS = {
  STUDENT_ENROLLED: "student.enrolled",
  STUDENT_UNENROLLED: "student.unenrolled",
  SESSION_STUDENT_ADDED: "session.student_added",
  SESSION_STUDENT_ABSENT: "session.student_absent",
};

/**
 * FCM `data.type` values, unchanged from what the triggers sent.
 *
 * The mobile app routes a notification tap on `data.type`
 * (`notification_service.dart`), so a new value is a push that does nothing
 * when tapped until an app release adds it. The admin-facing types below are
 * already in that position — none of them are routed today — so
 * `student_unenrolled` joins an existing gap rather than making a new one.
 * Worth closing app-side, but not by silently renaming what the backend
 * sends.
 */
const ADMIN_NOTIFICATION_TYPES = {
  [NOTIFICATION_EVENTS.STUDENT_ENROLLED]: "student_enrolled",
  [NOTIFICATION_EVENTS.STUDENT_UNENROLLED]: "student_unenrolled",
  [NOTIFICATION_EVENTS.SESSION_STUDENT_ADDED]: "student_added",
  [NOTIFICATION_EVENTS.SESSION_STUDENT_ABSENT]: "student_absent",
};

function classDescription({ classDay, classTime }) {
  const day = classDay || "Unknown day";
  const time = classTime ? to12Hour(classTime) : "Unknown time";
  return { day, time };
}

/**
 * Build the admin-facing content for an event. Kept separate from the send so
 * the wording is unit-testable without Firestore or FCM.
 */
function adminNotificationFor(eventType, payload) {
  const { studentName, sessionDateText } = payload;
  const { day, time } = classDescription(payload);
  const who = studentName || payload.studentId;

  switch (eventType) {
    case NOTIFICATION_EVENTS.STUDENT_ENROLLED:
      return {
        title: "Student Enrolled",
        body: `${who} has permanently enrolled for ${day} at ${time}.`,
      };
    case NOTIFICATION_EVENTS.STUDENT_UNENROLLED:
      return {
        title: "Student Unenrolled",
        body: `${who} has been unenrolled from ${day} at ${time}.`,
      };
    case NOTIFICATION_EVENTS.SESSION_STUDENT_ADDED:
      return {
        title: "Student Added",
        body: `${who} was added to ${day} at ${time}${
          sessionDateText ? ` on ${sessionDateText}` : ""
        }.`,
      };
    case NOTIFICATION_EVENTS.SESSION_STUDENT_ABSENT:
      return {
        title: "Student Absent",
        body: `${who} is absent from ${day} at ${time}${
          sessionDateText ? ` on ${sessionDateText}` : ""
        }.`,
      };
    default:
      return null;
  }
}

/**
 * Publish one business event and send the single notification it warrants.
 *
 * `eventId` identifies the action, not the write, and must be stable if the
 * same action is processed twice — that is what keeps the ledger honest. Pass
 * something derived from the thing that happened, e.g.
 * `unenrolPermanent:${classId}:${studentId}`.
 *
 * Never throws. The caller's write has already committed by the time this
 * runs, and a notification failure must not roll it back or fail the request.
 */
async function emitNotificationEvent(
  { type, payload = {}, eventId, dedupeKey },
  { logger = console, db, messaging, recipientsImpl } = {}
) {
  const content = adminNotificationFor(type, payload);
  if (!content) {
    logger.warn?.(`[notificationEvents] no handler for event ${type}`);
    return { sent: false, unhandled: true };
  }

  try {
    const resolveRecipients = recipientsImpl || getAdminTokenOwners;
    const recipients = await resolveRecipients();
    if (!recipients.length) return { sent: false, noRecipients: true };

    return await sendAndRecord(
      {
        messaging: messaging || getMessaging(),
        db: db || admin.firestore(),
        recipients,
        title: content.title,
        body: content.body,
        data: {
          type: ADMIN_NOTIFICATION_TYPES[type],
          event: type,
          classId: payload.classId || "",
          studentId: payload.studentId || "",
        },
        source: `event:${type}`,
        eventId,
        dedupeKey,
      },
      { logger }
    );
  } catch (error) {
    logger.error?.(`[notificationEvents] ${type} failed`, error);
    return { sent: false, error };
  }
}

module.exports = {
  ADMIN_NOTIFICATION_TYPES,
  NOTIFICATION_EVENTS,
  adminNotificationFor,
  emitNotificationEvent,
};
