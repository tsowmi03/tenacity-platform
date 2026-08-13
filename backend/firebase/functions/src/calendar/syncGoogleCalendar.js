"use strict";

const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { DateTime } = require("luxon");

const {
  createGoogleCalendarClient,
  exportCalendarClaim,
} = require("./googleCalendarClient");

const SYDNEY_ZONE = "Australia/Sydney";
const CONFIG_COLLECTION = "integrations";
const CONFIG_DOCUMENT = "googleCalendarExport";
const MANAGED_MARKER = {
  key: "tenacityManaged",
  value: "firestore-week-v1",
};
const SOURCE_PROPERTY = "tenacitySource";

function weekRangeFor(date = new Date()) {
  const now = DateTime.fromJSDate(date, { zone: SYDNEY_ZONE });
  if (!now.isValid) throw new TypeError("weekRangeFor requires a valid Date");
  const start = now.startOf("week");
  const end = start.plus({ weeks: 1 });
  return {
    start: start.toJSDate(),
    end: end.toJSDate(),
    startSydney: start,
    endSydney: end,
  };
}

function dateFromFirestore(value, field = "date") {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value && typeof value.toDate === "function") {
    const date = value.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
  }
  throw new TypeError(`${field} must be a Firestore Timestamp or Date`);
}

function parseTime(value, field) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ""));
  if (!match) throw new TypeError(`${field} must use HH:mm`);
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function sessionTimes(sessionDate, classData) {
  const day = DateTime.fromJSDate(sessionDate, { zone: SYDNEY_ZONE }).startOf(
    "day"
  );
  const startTime = parseTime(classData.startTime, "startTime");
  const endTime = parseTime(classData.endTime, "endTime");
  const start = day.set({
    ...startTime,
    second: 0,
    millisecond: 0,
  });
  let end = day.set({
    ...endTime,
    second: 0,
    millisecond: 0,
  });
  if (end <= start) end = end.plus({ days: 1 });
  return { start, end };
}

function displayName(userData, fallback) {
  const name = [userData?.firstName, userData?.lastName]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" ");
  return name || fallback;
}

function sourceKey(classId, attendanceId) {
  return `classes/${classId}/attendance/${attendanceId}`;
}

function buildCalendarEvent({
  classId,
  attendanceId,
  classData,
  attendanceData,
  tutorNames = [],
}) {
  const sessionDate = dateFromFirestore(attendanceData.date);
  const { start, end } = sessionTimes(sessionDate, classData);
  const cancelled = attendanceData.cancelled === true;
  const classType =
    typeof classData.type === "string" && classData.type.trim()
      ? classData.type.trim()
      : "Tenacity class";
  const studentCount = Array.isArray(attendanceData.attendance)
    ? attendanceData.attendance.length
    : 0;
  const tutors = tutorNames.length ? tutorNames.join(", ") : "Unassigned";
  const key = sourceKey(classId, attendanceId);

  return {
    summary: cancelled ? `Cancelled: ${classType}` : classType,
    description: [
      `Tutor: ${tutors}`,
      `Students scheduled: ${studentCount}`,
      "",
      "Read-only Tenacity timetable mirror.",
      "Make timetable changes in Tenacity.",
    ].join("\n"),
    start: {
      dateTime: start.toISO({ suppressMilliseconds: true }),
      timeZone: SYDNEY_ZONE,
    },
    end: {
      dateTime: end.toISO({ suppressMilliseconds: true }),
      timeZone: SYDNEY_ZONE,
    },
    transparency: cancelled ? "transparent" : "opaque",
    visibility: "default",
    extendedProperties: {
      private: {
        [MANAGED_MARKER.key]: MANAGED_MARKER.value,
        [SOURCE_PROPERTY]: key,
      },
    },
  };
}

function eventSource(event) {
  const value = event?.extendedProperties?.private?.[SOURCE_PROPERTY];
  return typeof value === "string" && value ? value : null;
}

function sameInstant(left, right) {
  const leftMs = Date.parse(left || "");
  const rightMs = Date.parse(right || "");
  return Number.isFinite(leftMs) && leftMs === rightMs;
}

function eventMatches(existing, desired) {
  return (
    existing?.summary === desired.summary &&
    existing?.description === desired.description &&
    sameInstant(existing?.start?.dateTime, desired.start.dateTime) &&
    existing?.start?.timeZone === desired.start.timeZone &&
    sameInstant(existing?.end?.dateTime, desired.end.dateTime) &&
    existing?.end?.timeZone === desired.end.timeZone &&
    (existing?.transparency || "opaque") === desired.transparency &&
    (existing?.visibility || "default") === desired.visibility &&
    eventSource(existing) === eventSource(desired) &&
    existing?.extendedProperties?.private?.[MANAGED_MARKER.key] ===
      MANAGED_MARKER.value &&
    !existing?.location &&
    (!Array.isArray(existing?.attendees) || existing.attendees.length === 0) &&
    (!Array.isArray(existing?.recurrence) || existing.recurrence.length === 0)
  );
}

function isMissingError(error) {
  const status = error?.response?.status ?? error?.code;
  return status === 404 || status === 410;
}

async function loadExportConfig(db) {
  const snap = await db
    .collection(CONFIG_COLLECTION)
    .doc(CONFIG_DOCUMENT)
    .get();
  if (!snap.exists) return { enabled: false, reason: "missing-config" };
  const data = snap.data() || {};
  if (data.enabled !== true) return { enabled: false, reason: "disabled" };
  if (typeof data.calendarId !== "string" || !data.calendarId.trim()) {
    throw new TypeError(
      `${CONFIG_COLLECTION}/${CONFIG_DOCUMENT}.calendarId must be a non-empty string`
    );
  }
  return {
    enabled: true,
    calendarId: exportCalendarClaim(data.calendarId),
  };
}

async function loadDesiredEvents(db, range, { log = logger } = {}) {
  const attendanceSnap = await db
    .collectionGroup("attendance")
    .where(
      "date",
      ">=",
      admin.firestore.Timestamp.fromDate(range.start)
    )
    .where("date", "<", admin.firestore.Timestamp.fromDate(range.end))
    .get();

  const attendanceRows = attendanceSnap.docs.map((doc) => {
    const classRef = doc.ref.parent.parent;
    return {
      attendanceId: doc.id,
      classId: classRef?.id,
      classRef,
      data: doc.data() || {},
    };
  });
  const loadErrors = [];
  const validRows = attendanceRows.filter((row) => {
    if (row.classId && row.classRef) return true;
    const error = new Error(
      `Attendance ${row.attendanceId} has an invalid Firestore path`
    );
    loadErrors.push(error);
    log.error("[googleCalendarExport] invalid attendance path", {
      attendanceId: row.attendanceId,
    });
    return false;
  });

  const uniqueClassRefs = [
    ...new Map(validRows.map((row) => [row.classId, row.classRef])).values(),
  ];
  const classSnaps = uniqueClassRefs.length
    ? await db.getAll(...uniqueClassRefs)
    : [];
  const classes = new Map(
    classSnaps
      .filter((snap) => snap.exists)
      .map((snap) => [snap.id, snap.data() || {}])
  );

  const tutorIds = [
    ...new Set(
      validRows.flatMap((row) =>
        Array.isArray(row.data.tutors) ? row.data.tutors : []
      )
    ),
  ];
  const tutorRefs = tutorIds.map((id) => db.collection("users").doc(id));
  const tutorSnaps = tutorRefs.length ? await db.getAll(...tutorRefs) : [];
  const tutorNames = new Map(
    tutorSnaps
      .filter((snap) => snap.exists)
      .map((snap) => [snap.id, displayName(snap.data() || {}, snap.id)])
  );

  const desired = new Map();
  for (const row of validRows) {
    const classData = classes.get(row.classId);
    if (!classData) {
      const error = new Error(
        `Class ${row.classId} is missing for attendance ${row.attendanceId}`
      );
      loadErrors.push(error);
      log.error("[googleCalendarExport] session has missing class", {
        classId: row.classId,
        attendanceId: row.attendanceId,
      });
      continue;
    }
    try {
      const names = (Array.isArray(row.data.tutors) ? row.data.tutors : []).map(
        (id) => tutorNames.get(id) || id
      );
      const event = buildCalendarEvent({
        classId: row.classId,
        attendanceId: row.attendanceId,
        classData,
        attendanceData: row.data,
        tutorNames: names,
      });
      desired.set(eventSource(event), event);
    } catch (error) {
      loadErrors.push(error);
      log.error("[googleCalendarExport] invalid Firestore session", {
        classId: row.classId,
        attendanceId: row.attendanceId,
        errorMessage: error?.message,
      });
    }
  }
  if (loadErrors.length) {
    throw new AggregateError(
      loadErrors,
      `Google Calendar export stopped before mutation because ${loadErrors.length} Firestore session(s) were invalid`
    );
  }
  return desired;
}

async function reconcileCalendar({
  calendar,
  calendarId,
  desired,
  log = logger,
}) {
  const existing = await calendar.listManagedEvents(
    calendarId,
    MANAGED_MARKER
  );
  const bySource = new Map();
  const orphaned = [];
  for (const event of existing) {
    const source = eventSource(event);
    if (!source) {
      orphaned.push(event);
      continue;
    }
    const events = bySource.get(source) || [];
    events.push(event);
    bySource.set(source, events);
  }

  const result = {
    desired: desired.size,
    created: 0,
    updated: 0,
    unchanged: 0,
    deleted: 0,
    errors: 0,
  };
  const errors = [];

  async function remove(event) {
    if (!event?.id) return;
    try {
      await calendar.deleteEvent(calendarId, event.id);
      result.deleted += 1;
    } catch (error) {
      if (isMissingError(error)) return;
      result.errors += 1;
      errors.push(error);
      log.error("[googleCalendarExport] event delete failed", {
        eventId: event.id,
        errorMessage: error?.message,
      });
    }
  }

  for (const [source, wanted] of desired) {
    const matches = bySource.get(source) || [];
    const current =
      matches.find((event) => eventMatches(event, wanted)) || matches[0];
    if (!current) {
      try {
        await calendar.insertEvent(calendarId, wanted);
        result.created += 1;
      } catch (error) {
        result.errors += 1;
        errors.push(error);
        log.error("[googleCalendarExport] event create failed", {
          source,
          errorMessage: error?.message,
        });
      }
    } else if (eventMatches(current, wanted)) {
      result.unchanged += 1;
    } else {
      try {
        await calendar.updateEvent(calendarId, current.id, wanted);
        result.updated += 1;
      } catch (error) {
        if (isMissingError(error)) {
          try {
            await calendar.insertEvent(calendarId, wanted);
            result.created += 1;
          } catch (insertError) {
            result.errors += 1;
            errors.push(insertError);
            log.error(
              "[googleCalendarExport] replacement event create failed",
              {
                source,
                errorMessage: insertError?.message,
              }
            );
          }
        } else {
          result.errors += 1;
          errors.push(error);
          log.error("[googleCalendarExport] event update failed", {
            source,
            eventId: current.id,
            errorMessage: error?.message,
          });
        }
      }
    }
    for (const duplicate of matches) {
      if (duplicate !== current) await remove(duplicate);
    }
    bySource.delete(source);
  }

  for (const staleEvents of bySource.values()) {
    for (const event of staleEvents) await remove(event);
  }
  for (const event of orphaned) await remove(event);

  if (errors.length) {
    const error = new AggregateError(
      errors,
      `Google Calendar export completed with ${errors.length} error(s)`
    );
    error.result = result;
    throw error;
  }
  return result;
}

async function syncGoogleCalendarImpl({
  db,
  calendar,
  clock = () => new Date(),
  log = logger,
}) {
  if (!db) throw new TypeError("syncGoogleCalendarImpl requires db");
  if (!calendar) throw new TypeError("syncGoogleCalendarImpl requires calendar");

  const config = await loadExportConfig(db);
  if (!config.enabled) {
    log.info("[googleCalendarExport] sync skipped", {
      reason: config.reason,
    });
    return { skipped: true, reason: config.reason };
  }

  const range = weekRangeFor(clock());
  const desired = await loadDesiredEvents(db, range, { log });
  const result = await reconcileCalendar({
    calendar,
    calendarId: config.calendarId,
    desired,
    log,
  });
  log.info("[googleCalendarExport] sync complete", {
    weekStart: range.startSydney.toISODate(),
    weekEndExclusive: range.endSydney.toISODate(),
    ...result,
  });
  return {
    skipped: false,
    weekStart: range.startSydney.toISODate(),
    weekEndExclusive: range.endSydney.toISODate(),
    ...result,
  };
}

const syncGoogleCalendar = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: SYDNEY_ZONE,
    region: "us-central1",
    timeoutSeconds: 300,
    // 512MiB: the shared `lib/index.js` entrypoint costs ~200MiB before this
    // runs, and at 256MiB the every-15-minutes sync was being OOM-killed —
    // the most frequent offender in the logs. See sendChatMessage.
    memory: "512MiB",
    maxInstances: 1,
    concurrency: 1,
  },
  async () =>
    syncGoogleCalendarImpl({
      db: admin.firestore(),
      calendar: createGoogleCalendarClient(),
    })
);

module.exports = {
  CONFIG_COLLECTION,
  CONFIG_DOCUMENT,
  MANAGED_MARKER,
  SOURCE_PROPERTY,
  SYDNEY_ZONE,
  buildCalendarEvent,
  eventMatches,
  eventSource,
  loadDesiredEvents,
  loadExportConfig,
  reconcileCalendar,
  sessionTimes,
  sourceKey,
  syncGoogleCalendar,
  syncGoogleCalendarImpl,
  weekRangeFor,
};
