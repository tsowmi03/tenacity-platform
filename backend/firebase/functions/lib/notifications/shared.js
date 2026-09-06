"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWaitlistJoinedAdminNotification = exports.firstSessionFromWeek = exports.deriveSwapKeptSessionIds = exports.removeStudentFromFutureAttendanceDocs = exports.addStudentToFutureAttendanceDocs = exports.sendAdminEnrolmentSkippedWeeksNotification = exports.sendAdminPermanentEnrollmentNotification = exports.resetAdminTokensCache = exports.getAdminTokens = exports.getAdminTokenOwners = exports.to12Hour = void 0;
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const waitlist_action_1 = require("./waitlist_action");
const send_1 = require("../../src/notifications/send");
const permanentEnrolmentCapacity_1 = require("../../src/attendance/permanentEnrolmentCapacity");
const permanent_enrollment_action_1 = require("./permanent_enrollment_action");
function to12Hour(time24) {
    // Expects "HH:mm"
    const [h, m] = time24.split(":").map(Number);
    if (isNaN(h) || isNaN(m))
        return time24;
    const hour = ((h + 11) % 12) + 1;
    const ampm = h >= 12 ? "pm" : "am";
    return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}
exports.to12Hour = to12Hour;
const ADMIN_TOKENS_CACHE_TTL_MS = 60 * 1000;
// Module-scoped, so it's shared across invocations in the same warm Cloud
// Functions instance, not just within one call.
let adminTokensCacheEntry = null; // { promise: Promise<string[]>, fetchedAt: number }
async function fetchAdminTokensFromFirestore() {
    const db = (0, firestore_1.getFirestore)();
    const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
    if (adminsSnap.empty)
        return [];
    const owners = [];
    for (const adminDoc of adminsSnap.docs) {
        const tokensSnap = await db
            .collection("userTokens")
            .doc(adminDoc.id)
            .collection("tokens")
            .get();
        const tokens = tokensSnap.docs.map(d => d.data().token).filter(Boolean);
        if (tokens.length)
            owners.push({ uid: adminDoc.id, role: "admin", tokens });
    }
    return owners;
}
/**
 * The cache stores tokens grouped by admin uid, because the notification
 * ledger records one row per person and an admin commonly has several
 * devices. `getAdminTokens` flattens that for the send itself.
 *
 * Tests inject a `fetchImpl` that returns a plain token list, so accept
 * either shape rather than making every caller of the cache know which one
 * it is holding.
 */
function normaliseTokenOwners(fetched) {
    if (!Array.isArray(fetched))
        return [];
    return fetched.map((entry) => typeof entry === "string"
        ? { uid: null, tokens: [entry] }
        : { uid: entry.uid || null, role: entry.role, tokens: entry.tokens || [] });
}
/**
 * Admin tokens are re-fetched on every guarded write in a fan-out (e.g. every
 * future-attendance-doc write in a class swap), which used to mean a fresh
 * "every admin, every token" query per write. Cache the result for a short
 * TTL so a burst of writes belonging to one human action shares one
 * Firestore round trip instead of one each.
 *
 * Concurrent callers within the TTL window share the same in-flight promise
 * rather than firing duplicate queries, and a failed fetch is never cached —
 * the next call retries against Firestore instead of repeating the error.
 *
 * `fetchImpl`/`nowMs` are injectable so tests can exercise the cache/TTL
 * behaviour without a real Firestore instance; production call sites should
 * not pass them.
 */
async function getAdminTokenOwners(options) {
    const { forceRefresh = false, ttlMs = ADMIN_TOKENS_CACHE_TTL_MS, fetchImpl = fetchAdminTokensFromFirestore, nowMs = Date.now(), } = options || {};
    if (!forceRefresh &&
        adminTokensCacheEntry &&
        nowMs - adminTokensCacheEntry.fetchedAt < ttlMs) {
        return adminTokensCacheEntry.promise;
    }
    const fetchedAt = nowMs;
    const promise = fetchImpl()
        .then(normaliseTokenOwners)
        .catch((error) => {
        if (adminTokensCacheEntry && adminTokensCacheEntry.fetchedAt === fetchedAt) {
            adminTokensCacheEntry = null;
        }
        throw error;
    });
    adminTokensCacheEntry = { promise, fetchedAt };
    return promise;
}
exports.getAdminTokenOwners = getAdminTokenOwners;
async function getAdminTokens(options) {
    const owners = await getAdminTokenOwners(options);
    return owners.flatMap((owner) => owner.tokens);
}
exports.getAdminTokens = getAdminTokens;
function resetAdminTokensCache() {
    adminTokensCacheEntry = null;
}
exports.resetAdminTokensCache = resetAdminTokensCache;
async function sendAdminPermanentEnrollmentNotification(params) {
    const { recipients, eventId, classId, studentId, studentName, classDay, classTime, startDate = null, } = params;
    // A swap the family asked to start later reads as an ordinary enrolment
    // otherwise, and the difference is one an admin has to know: the spot it
    // frees in the class being left is not free for those weeks, so promoting
    // somebody off the waitlist into it would seat them in a full room. Naming
    // the date is what makes that visible (MOB-39).
    const startLabel = (0, permanent_enrollment_action_1.shortDate)(startDate);
    const body = startLabel
        ? `${studentName} has permanently enrolled for ${classDay} at ${classTime}, starting ${startLabel}.`
        : `${studentName} has permanently enrolled for ${classDay} at ${classTime}.`;
    return (0, send_1.sendAndRecord)({
        messaging: (0, messaging_1.getMessaging)(),
        db: (0, firestore_1.getFirestore)(),
        recipients,
        title: "Student Enrolled",
        body,
        data: {
            type: "student_enrolled",
            classId,
            studentId,
            enrolType: "permanent",
        },
        source: "callable:permanentEnrolment",
        eventId,
    });
}
exports.sendAdminPermanentEnrollmentNotification = sendAdminPermanentEnrollmentNotification;
/**
 * Tell admins which weeks a permanent enrolment could not take.
 *
 * Sent alongside the ordinary "Student Enrolled" notification rather than
 * instead of it: the enrolment did happen, and the skipped weeks are a
 * separate thing somebody has to act on.
 */
async function sendAdminEnrolmentSkippedWeeksNotification(params) {
    const { recipients, eventId, classId, studentId, studentName, classDay, classTime, skipped, } = params;
    const message = (0, permanent_enrollment_action_1.permanentEnrolmentSkippedWeeksMessage)({
        studentName,
        classDay,
        classTime,
        skipped,
    });
    if (!message)
        return null;
    return (0, send_1.sendAndRecord)({
        messaging: (0, messaging_1.getMessaging)(),
        db: (0, firestore_1.getFirestore)(),
        recipients,
        title: message.title,
        body: message.body,
        data: {
            type: "enrolment_skipped_weeks",
            classId,
            studentId,
            skippedDates: skipped.map(entry => entry.date).filter(Boolean).join(","),
        },
        source: "callable:permanentEnrolment",
        eventId,
    });
}
exports.sendAdminEnrolmentSkippedWeeksNotification = sendAdminEnrolmentSkippedWeeksNotification;
/**
 * Put a newly permanent student into every future session of their class that
 * has room for them.
 *
 * A session already at capacity is skipped rather than overfilled. Its seats
 * are taken by the permanent roster plus that week's one-off visitors, and a
 * visitor has paid for theirs — so the student becomes permanent from the
 * first week with room instead of displacing anybody (MOB-38).
 *
 * Returns the sessions that were skipped, in date order, so the caller can
 * tell an admin which weeks the student is not in.
 */
async function addStudentToFutureAttendanceDocs(params) {
    const { classId, studentId, updatedBy, allowOverfill = false, startWeek = null, } = params;
    const db = (0, firestore_1.getFirestore)();
    const nowSydney = new Date().toLocaleDateString("en-CA", {
        timeZone: "Australia/Sydney",
    });
    const classSnap = await db.collection("classes").doc(classId).get();
    const classData = classSnap.data() || {};
    const capacity = typeof classData.capacity === "number" ? classData.capacity : 0;
    const attendanceSnapshots = await db
        .collection("classes")
        .doc(classId)
        .collection("attendance")
        .get();
    const futureSessions = [];
    for (const snap of attendanceSnapshots.docs) {
        const data = snap.data();
        const rawDate = data.date;
        const attendanceDate = rawDate && typeof rawDate.toDate === "function"
            ? rawDate.toDate()
            : null;
        if (!attendanceDate)
            continue;
        const attendanceSydney = attendanceDate.toLocaleDateString("en-CA", {
            timeZone: "Australia/Sydney",
        });
        if (attendanceSydney >= nowSydney) {
            futureSessions.push({
                id: snap.id,
                date: attendanceSydney,
                attendance: Array.isArray(data.attendance) ? data.attendance : [],
                ref: snap.ref,
            });
        }
    }
    // Date order, so a skipped-weeks message reads chronologically rather than
    // in whatever order Firestore returned the documents.
    futureSessions.sort((a, b) => a.date.localeCompare(b.date));
    // A swap the family asked to start later begins at its start week; every
    // other enrolment begins at the next session, as it always has (MOB-39).
    // The weeks before the start week are not skips — nothing was refused —
    // so they are filtered out before the capacity plan rather than inside it.
    const sessionsToPlan = (0, permanentEnrolmentCapacity_1.sessionsFromWeek)({
        sessions: futureSessions,
        startWeek,
    });
    // An admin deliberately overfilling the roster means every week, not the
    // roster alone: skipping the full ones would put the student on the class
    // list and no roll, silently undoing the override they just made.
    const plan = allowOverfill
        ? {
            toAdd: sessionsToPlan
                .filter(session => !session.attendance.includes(studentId))
                .map(session => session.id),
            skipped: [],
        }
        : (0, permanentEnrolmentCapacity_1.planPermanentAttendanceSync)({
            sessions: sessionsToPlan,
            capacity,
            studentId,
        });
    const refsById = new Map(futureSessions.map(session => [session.id, session.ref]));
    const dateById = new Map(futureSessions.map(session => [session.id, session.date]));
    for (const sessionId of plan.toAdd) {
        const ref = refsById.get(sessionId);
        if (!ref)
            continue;
        await ref.update({
            attendance: firestore_1.FieldValue.arrayUnion(studentId),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedBy,
            notificationAction: {
                type: "bulk_attendance_sync",
                studentId,
            },
        });
    }
    // The first session the student is actually in, so the family can be told
    // the date their change takes effect rather than "for the rest of the
    // term". Sessions are in date order, and a session they already held
    // counts: a retried swap should report the same date as the first attempt.
    const firstSession = sessionsToPlan.find(session => plan.toAdd.includes(session.id) ||
        session.attendance.includes(studentId));
    return {
        skipped: plan.skipped,
        added: plan.toAdd.map(id => ({ id, date: dateById.get(id) ?? null })),
        firstDate: firstSession ? firstSession.date : null,
    };
}
exports.addStudentToFutureAttendanceDocs = addStudentToFutureAttendanceDocs;
/**
 * Read the future sessions of a class, newest last, for the capacity rules.
 *
 * Sydney dates throughout: a session is "future" by the calendar day the
 * centre is open on, not by UTC.
 */
async function futureSessionsFor(classId) {
    const db = (0, firestore_1.getFirestore)();
    const nowSydney = new Date().toLocaleDateString("en-CA", {
        timeZone: "Australia/Sydney",
    });
    const snapshots = await db
        .collection("classes")
        .doc(classId)
        .collection("attendance")
        .get();
    const sessions = [];
    for (const snap of snapshots.docs) {
        const data = snap.data();
        const rawDate = data.date;
        const attendanceDate = rawDate && typeof rawDate.toDate === "function"
            ? rawDate.toDate()
            : null;
        if (!attendanceDate)
            continue;
        const attendanceSydney = attendanceDate.toLocaleDateString("en-CA", {
            timeZone: "Australia/Sydney",
        });
        if (attendanceSydney < nowSydney)
            continue;
        sessions.push({
            id: snap.id,
            date: attendanceSydney,
            attendance: Array.isArray(data.attendance) ? data.attendance : [],
            ref: snap.ref,
        });
    }
    sessions.sort((a, b) => a.date.localeCompare(b.date));
    return sessions;
}
/**
 * Which sessions of the class a student is leaving they should stay booked
 * into, because the class they are moving to does not hold them that week —
 * because it is full, or because the family asked the swap to start later.
 *
 * Every input is read from Firestore. The caller names the destination class
 * and nothing else — not even the start week it asked for on the way in — so
 * see `planSwapKeptSessions` for why a caller-supplied list of weeks would be
 * exploitable.
 */
async function deriveSwapKeptSessionIds(params) {
    const { leavingClassId, destinationClassId, studentId } = params;
    if (!destinationClassId || destinationClassId === leavingClassId)
        return [];
    const db = (0, firestore_1.getFirestore)();
    const destinationSnap = await db
        .collection("classes")
        .doc(destinationClassId)
        .get();
    if (!destinationSnap.exists)
        return [];
    const destinationData = destinationSnap.data() || {};
    const [leavingSessions, destinationSessions] = await Promise.all([
        futureSessionsFor(leavingClassId),
        futureSessionsFor(destinationClassId),
    ]);
    return (0, permanentEnrolmentCapacity_1.planSwapKeptSessions)({
        leavingSessions,
        destinationSessions,
        destinationEnrolledStudents: destinationData.enrolledStudents,
        studentId,
    });
}
exports.deriveSwapKeptSessionIds = deriveSwapKeptSessionIds;
/**
 * The first session of [classId] from [startWeek] onward, or null when the
 * class has none.
 *
 * The guard on a deferred swap (MOB-39). A start week past the class's last
 * session would enrol the student permanently while seating them in no week
 * at all — and a student on the roster of a class that never has them is
 * exactly the state `planSwapKeptSessions` reads as "keep every week in the
 * class they are leaving". That is the MOB-38 exploit reached by a different
 * road: the permanent spot freed for the waitlist, every remaining week kept.
 * So the start week has to land on a real session, checked before anything is
 * written.
 *
 * Reads `date` alone rather than going through `futureSessionsFor`. This runs
 * moments before `addStudentToFutureAttendanceDocs` reads the same
 * subcollection in full, and the check needs neither the attendance arrays nor
 * the document references that the fan-out does — carrying both copies is
 * weight on a function that turned out to be sitting two megabytes under its
 * limit. The week still comes from the document id, so this and the fan-out
 * cannot disagree about which week a session belongs to.
 */
async function firstSessionFromWeek(params) {
    const { classId, startWeek } = params;
    const db = (0, firestore_1.getFirestore)();
    const nowSydney = new Date().toLocaleDateString("en-CA", {
        timeZone: "Australia/Sydney",
    });
    const snapshots = await db
        .collection("classes")
        .doc(classId)
        .collection("attendance")
        .select("date")
        .get();
    const sessions = [];
    for (const snap of snapshots.docs) {
        const rawDate = snap.data().date;
        const attendanceDate = rawDate && typeof rawDate.toDate === "function"
            ? rawDate.toDate()
            : null;
        if (!attendanceDate)
            continue;
        const attendanceSydney = attendanceDate.toLocaleDateString("en-CA", {
            timeZone: "Australia/Sydney",
        });
        if (attendanceSydney < nowSydney)
            continue;
        sessions.push({
            id: snap.id,
            date: attendanceSydney,
            startsAt: attendanceDate,
        });
    }
    sessions.sort((a, b) => a.date.localeCompare(b.date));
    const first = (0, permanentEnrolmentCapacity_1.sessionsFromWeek)({
        sessions,
        startWeek,
    })[0];
    // `startsAt` is the session's start instant, which the caller needs to
    // tell an hour ago from later today. The Sydney calendar date cannot.
    return first
        ? { id: first.id, date: first.date, startsAt: first.startsAt }
        : null;
}
exports.firstSessionFromWeek = firstSessionFromWeek;
/**
 * Take a student out of every future session of a class.
 *
 * `keepSessionIds` names sessions to leave them in. A swap uses it: when the
 * class they are moving to is full in a given week, they keep their seat in
 * the class they are leaving for that week rather than being removed from
 * both and having no class at all (MOB-38). Attendance document ids are
 * `{termId}_W{weekNum}`, so the same week has the same id in either class and
 * the list carries across unchanged.
 *
 * They still come off `enrolledStudents`, so they are no longer permanent
 * here — just booked into the specific weeks that were kept, the same shape
 * as any one-off visitor.
 */
async function removeStudentFromFutureAttendanceDocs(params) {
    const { classId, studentId, updatedBy, keepSessionIds = [] } = params;
    const db = (0, firestore_1.getFirestore)();
    const keep = new Set(Array.isArray(keepSessionIds) ? keepSessionIds : []);
    const nowSydney = new Date().toLocaleDateString("en-CA", {
        timeZone: "Australia/Sydney",
    });
    const attendanceSnapshots = await db
        .collection("classes")
        .doc(classId)
        .collection("attendance")
        .get();
    const kept = [];
    for (const snap of attendanceSnapshots.docs) {
        const data = snap.data();
        const rawDate = data.date;
        const attendanceDate = rawDate && typeof rawDate.toDate === "function"
            ? rawDate.toDate()
            : null;
        if (!attendanceDate)
            continue;
        const attendanceSydney = attendanceDate.toLocaleDateString("en-CA", {
            timeZone: "Australia/Sydney",
        });
        if (attendanceSydney >= nowSydney) {
            if (keep.has(snap.id)) {
                kept.push({ id: snap.id, date: attendanceSydney });
                continue;
            }
            await snap.ref.update({
                attendance: firestore_1.FieldValue.arrayRemove(studentId),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedBy,
                notificationAction: {
                    type: "bulk_attendance_sync",
                    studentId,
                },
            });
        }
    }
    kept.sort((a, b) => a.date.localeCompare(b.date));
    return { kept };
}
exports.removeStudentFromFutureAttendanceDocs = removeStudentFromFutureAttendanceDocs;
async function sendWaitlistJoinedAdminNotification(waitlistEntryId, waitlistEntry, eventId) {
    var _a, _b, _c, _d;
    if (waitlistEntry.status !== "active")
        return;
    const db = (0, firestore_1.getFirestore)();
    const messaging = (0, messaging_1.getMessaging)();
    const recipients = await getAdminTokenOwners();
    if (!recipients.length)
        return;
    const studentId = waitlistEntry.studentId;
    const parentId = waitlistEntry.parentId;
    const classId = waitlistEntry.classId;
    const studentSnap = studentId
        ? await db.collection("students").doc(studentId).get()
        : null;
    const parentSnap = parentId
        ? await db.collection("users").doc(parentId).get()
        : null;
    const studentData = (studentSnap === null || studentSnap === void 0 ? void 0 : studentSnap.data()) || {};
    const parentData = (parentSnap === null || parentSnap === void 0 ? void 0 : parentSnap.data()) || {};
    const studentName = `${(_a = studentData.firstName) !== null && _a !== void 0 ? _a : ""} ${(_b = studentData.lastName) !== null && _b !== void 0 ? _b : ""}`.trim() ||
        studentId ||
        "A student";
    const parentName = `${(_c = parentData.firstName) !== null && _c !== void 0 ? _c : ""} ${(_d = parentData.lastName) !== null && _d !== void 0 ? _d : ""}`.trim() ||
        parentId ||
        "a parent";
    const classDay = (0, waitlist_action_1.waitlistDisplayDay)(waitlistEntry);
    const classTime = waitlistEntry.startTime
        ? to12Hour(waitlistEntry.startTime)
        : "Unknown time";
    const reason = waitlistEntry.reason === "classFull" || waitlistEntry.reason === "class_full"
        ? "class is full"
        : "class is not open yet";
    await (0, send_1.sendAndRecord)({
        messaging,
        db,
        recipients,
        title: "New Waitlist Request",
        body: `${studentName} joined the waitlist for ${classDay} at ${classTime} because the ${reason}.`,
        data: {
            type: "waitlist_joined",
            waitlistEntryId,
            classId: classId !== null && classId !== void 0 ? classId : "",
            studentId: studentId !== null && studentId !== void 0 ? studentId : "",
            parentId: parentId !== null && parentId !== void 0 ? parentId : "",
            parentName,
        },
        source: "waitlist:joined",
        // No fallback string here on purpose: a business-key default (the
        // original bug) makes a create followed by a later reactivation of
        // the same waitlistEntryId collide in the ledger. Both real callers
        // are triggers and pass their own event.id; sendAndRecord's own
        // randomUUID() default covers any caller that does not.
        eventId,
    });
}
exports.sendWaitlistJoinedAdminNotification = sendWaitlistJoinedAdminNotification;
