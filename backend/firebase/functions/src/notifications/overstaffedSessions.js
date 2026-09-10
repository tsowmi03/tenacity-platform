"use strict";

const { getMessaging } = require("firebase-admin/messaging");
const admin = require("firebase-admin");

const { sendAndRecord } = require("./send");
const { getAdminTokenOwners } = require("../../lib/notifications/shared");

/**
 * A session with this many students or fewer needs only one tutor.
 *
 * Two is the number Tenacity works to, and it is a ceiling rather than an
 * exact match: a session down to one student, or emptied entirely by
 * absences, needs one tutor at most as well.
 *
 * The mobile timetable applies the same ceiling when it draws the row badge —
 * see `oneTutorRosterCeiling` in `admin_classes_data.dart`. The two are
 * independent implementations of one rule and have to be changed together.
 */
const ONE_TUTOR_ROSTER_CEILING = 2;

/**
 * FCM `data.type` for the summary. Like the other admin-facing types in
 * `events.js`, the app does not route a tap on this yet.
 */
const OVERSTAFFED_NOTIFICATION_TYPE = "overstaffed_sessions";

/** How many sessions the body names before it starts counting the rest. */
const MAX_LISTED_SESSIONS = 4;

/**
 * Whether a session has more tutors on it than it needs.
 *
 * Two conditions, and the second is what makes this worth sending: the
 * session is quiet enough for one tutor *and* more than one is assigned to
 * it. A quiet class already down to a single tutor is correctly staffed and
 * is not reported — the notification exists so a tutor can be stood down, and
 * there is nothing to stand down there.
 *
 * A quiet class with nobody assigned is not reported either. It is not
 * overstaffed, and on the morning of the session an unstaffed class is a
 * larger problem than this summary is equipped to raise.
 *
 * The roster count is the week's own attendance list — the people actually
 * expected, net of absences and cancellations — not the standing enrolment.
 * A class of six with four absences is a one-tutor session on the day, and
 * the day is when the allocation is made.
 */
/**
 * The length of a stored list, or `undefined` when the field is not a list at
 * all.
 *
 * The difference matters. Callers reading an attendance document normalise a
 * missing or malformed `attendance` array to `[]` so the rest of their work
 * can iterate it safely, which is right for "who do I send a reminder to" and
 * wrong here: it turns "this document is unreadable" into "this class has
 * nobody in it", and an empty class with two tutors is exactly the shape this
 * module reports. An admin would be told to stand a tutor down on the strength
 * of a broken document.
 *
 * Passing the raw field through this keeps the unreadable case unreadable, so
 * [sessionIsOverstaffed] can decline to judge it.
 */
function countIfReadable(list) {
  return Array.isArray(list) ? list.length : undefined;
}

function sessionIsOverstaffed({ cancelled, rosterCount, tutorCount } = {}) {
  if (cancelled === true) return false;
  if (!Number.isFinite(rosterCount) || !Number.isFinite(tutorCount)) {
    return false;
  }
  if (tutorCount < 2) return false;
  return rosterCount <= ONE_TUTOR_ROSTER_CEILING;
}

function studentsLabel(count) {
  if (count === 0) return "no students";
  return count === 1 ? "1 student" : `${count} students`;
}

/**
 * `4:30 pm (2 tutors, 2 students)`.
 *
 * Both numbers, because the tutor count is the thing to change and the
 * student count is the reason. The time alone names the session, as every
 * other admin notification does (`classDescription` in `events.js` uses the
 * day and the time and nothing else). The class type is deliberately left
 * out: the stored values are codes — `5-10`, `advmath12` — and the readable
 * labels for them live only in the mobile app. Porting that map here would be
 * a second copy free to drift from the first, to gain a word in a push whose
 * whole job is to say "open the timetable", where the row carries the class
 * name already.
 */
function sessionLabel({ timeLabel, tutorCount, rosterCount }) {
  const when = timeLabel || "Unknown time";
  return `${when} (${tutorCount} tutors, ${studentsLabel(rosterCount)})`;
}

/**
 * The admin-facing content for the day's overstaffed sessions.
 *
 * One summary rather than one push per session: the 9am sweep can find
 * several, and five notifications in a row for one glanceable fact is a worse
 * way to say the same thing. Returns null when nothing qualifies, so the
 * caller sends nothing rather than a push saying there is nothing.
 *
 * Kept separate from the send so the wording is unit-testable without
 * Firestore or FCM.
 */
function overstaffedNotificationFor(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;

  const ordered = [...sessions].sort((a, b) => {
    const aStart = a.startsAt ? a.startsAt.getTime() : 0;
    const bStart = b.startsAt ? b.startsAt.getTime() : 0;
    return aStart - bStart;
  });

  if (ordered.length === 1) {
    return {
      title: "A class today only needs one tutor",
      body: `${sessionLabel(ordered[0])} — one tutor is enough.`,
    };
  }

  const listed = ordered.slice(0, MAX_LISTED_SESSIONS).map(sessionLabel);
  const remaining = ordered.length - listed.length;
  const tail = remaining > 0 ? `, and ${remaining} more` : "";

  return {
    title: `${ordered.length} classes today only need one tutor`,
    body: `${listed.join(", ")}${tail}.`,
  };
}

/**
 * Send the day's overstaffing summary to every admin.
 *
 * `sweepDate` scopes the ledger row to the day the summary is for, so a
 * re-run of today's sweep updates the same row rather than adding another —
 * the same shape `dailyLessonAndShiftReminder` uses for its own reminders.
 *
 * Never throws. This runs at the tail of the 9am sweep, which has already
 * sent the day's parent lesson reminders, and a failure here must not cause a
 * retry that sends those all over again.
 *
 * The tutors are told about their shifts an hour later, by
 * `dailyTutorShiftReminder` (MOB-50), so that this summary reaches an admin
 * with time to stand a tutor down before that goes out.
 */
async function notifyAdminsOfOverstaffedSessions(
  { sessions, sweepDate },
  { logger = console, db, messaging, recipientsImpl } = {}
) {
  const content = overstaffedNotificationFor(sessions);
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
          type: OVERSTAFFED_NOTIFICATION_TYPE,
          sessionCount: String(sessions.length),
          classIds: sessions
            .map((session) => session.classId || "")
            .filter(Boolean)
            .join(","),
        },
        source: "schedule:dailyLessonAndShiftReminder",
        eventId: `overstaffedSessions:${sweepDate}`,
      },
      { logger }
    );
  } catch (error) {
    logger.error?.("[overstaffedSessions] summary failed", error);
    return { sent: false, error };
  }
}

module.exports = {
  MAX_LISTED_SESSIONS,
  countIfReadable,
  ONE_TUTOR_ROSTER_CEILING,
  OVERSTAFFED_NOTIFICATION_TYPE,
  notifyAdminsOfOverstaffedSessions,
  overstaffedNotificationFor,
  sessionIsOverstaffed,
};
