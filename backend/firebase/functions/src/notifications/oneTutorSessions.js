"use strict";

const { getMessaging } = require("firebase-admin/messaging");
const admin = require("firebase-admin");

const { sendAndRecord } = require("./send");
const { getAdminTokenOwners } = require("../../lib/notifications/shared");

/**
 * A session with this many students or fewer is staffed by one tutor.
 *
 * Two is the number Tenacity works to, and it is a ceiling rather than an
 * exact match: a session down to one student, or emptied entirely by
 * absences, needs one tutor at most as well. Flagging only the exact-two case
 * would leave the emptier sessions looking unremarkable, which is the
 * opposite of the point.
 *
 * The mobile timetable applies the same ceiling when it draws the row badge —
 * see `AdminSession.needsOneTutorOnly`. The two are independent
 * implementations of one rule and have to be changed together.
 */
const ONE_TUTOR_ROSTER_CEILING = 2;

/**
 * FCM `data.type` for the summary. Like the other admin-facing types in
 * `events.js`, the app does not route a tap on this yet.
 */
const ONE_TUTOR_NOTIFICATION_TYPE = "one_tutor_sessions";

/** How many sessions the body names before it starts counting the rest. */
const MAX_LISTED_SESSIONS = 4;

/**
 * Whether one tutor is enough for a session.
 *
 * The roster count is the week's own attendance list — the people actually
 * expected, net of absences and cancellations — not the standing enrolment.
 * A class of six with four absences is a one-tutor session on the day, and
 * the day is when the allocation is made.
 */
function sessionNeedsOneTutorOnly({ cancelled, rosterCount } = {}) {
  if (cancelled === true) return false;
  if (typeof rosterCount !== "number" || !Number.isFinite(rosterCount)) {
    return false;
  }
  return rosterCount <= ONE_TUTOR_ROSTER_CEILING;
}

function studentsLabel(count) {
  if (count === 0) return "no students";
  return count === 1 ? "1 student" : `${count} students`;
}

/**
 * `4:30 pm (2 students)`.
 *
 * The time alone names the session, as every other admin notification does
 * (`classDescription` in `events.js` uses the day and the time and nothing
 * else). The class type is deliberately left out: the stored values are codes
 * — `5-10`, `advmath12` — and the readable labels for them live only in the
 * mobile app. Porting that map here would be a second copy free to drift from
 * the first, to gain a word in a push whose whole job is to say "open the
 * timetable", where the row carries the class name already.
 *
 * Two classes sharing a slot therefore list as two entries at the same time.
 * That reads as "two of them at 4:30", which is what it is.
 */
function sessionLabel({ timeLabel, rosterCount }) {
  const when = timeLabel || "Unknown time";
  return `${when} (${studentsLabel(rosterCount)})`;
}

/**
 * The admin-facing content for the day's one-tutor sessions.
 *
 * One summary rather than one push per session: the 9am sweep commonly finds
 * several, and five notifications in a row for one glanceable fact is a
 * worse way to say the same thing. Returns null when nothing qualifies, so
 * the caller sends nothing rather than a push saying there is nothing.
 *
 * Kept separate from the send so the wording is unit-testable without
 * Firestore or FCM.
 */
function oneTutorNotificationFor(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;

  const ordered = [...sessions].sort((a, b) => {
    const aStart = a.startsAt ? a.startsAt.getTime() : 0;
    const bStart = b.startsAt ? b.startsAt.getTime() : 0;
    return aStart - bStart;
  });

  if (ordered.length === 1) {
    return {
      title: "One tutor is enough today",
      body: `${sessionLabel(ordered[0])} — one tutor covers it.`,
    };
  }

  const listed = ordered.slice(0, MAX_LISTED_SESSIONS).map(sessionLabel);
  const remaining = ordered.length - listed.length;
  const tail = remaining > 0 ? `, and ${remaining} more` : "";

  return {
    title: `${ordered.length} classes need one tutor today`,
    body: `${listed.join(", ")}${tail}.`,
  };
}

/**
 * Send the day's one-tutor summary to every admin.
 *
 * `sweepDate` scopes the ledger row to the day the summary is for, so a
 * re-run of today's sweep updates the same row rather than adding another —
 * the same shape `dailyLessonAndShiftReminder` uses for its own reminders.
 *
 * Never throws. This runs at the tail of a scheduled sweep that has already
 * sent the day's tutor and parent reminders, and a failure here must not
 * cause a retry that sends those all over again.
 */
async function notifyAdminsOfOneTutorSessions(
  { sessions, sweepDate },
  { logger = console, db, messaging, recipientsImpl } = {}
) {
  const content = oneTutorNotificationFor(sessions);
  if (!content) return { sent: false, noSessions: true };

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
          type: ONE_TUTOR_NOTIFICATION_TYPE,
          sessionCount: String(sessions.length),
          classIds: sessions
            .map((session) => session.classId || "")
            .filter(Boolean)
            .join(","),
        },
        source: "schedule:dailyLessonAndShiftReminder",
        eventId: `oneTutorSessions:${sweepDate}`,
      },
      { logger }
    );
  } catch (error) {
    logger.error?.("[oneTutorSessions] summary failed", error);
    return { sent: false, error };
  }
}

module.exports = {
  MAX_LISTED_SESSIONS,
  ONE_TUTOR_NOTIFICATION_TYPE,
  ONE_TUTOR_ROSTER_CEILING,
  notifyAdminsOfOneTutorSessions,
  oneTutorNotificationFor,
  sessionNeedsOneTutorOnly,
};
