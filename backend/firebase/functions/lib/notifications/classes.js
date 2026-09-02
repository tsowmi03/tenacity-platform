"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onPermanentEnrolmentNotifyAdmins = exports.onPermanentSpotOpened = exports.unenrollStudentPermanent = exports.enrollStudentPermanent = exports.enrollStudentPermanentForParent = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const preferences_1 = require("./preferences");
const permanent_enrollment_action_1 = require("./permanent_enrollment_action");
const permanentEnrolmentCapacity_1 = require("../../src/attendance/permanentEnrolmentCapacity");
const permanent_spot_action_1 = require("./permanent_spot_action");
const shared_1 = require("./shared");
const send_1 = require("../../src/notifications/send");
const events_1 = require("../../src/notifications/events");
const waitlist_action_1 = require("./waitlist_action");
const explicitPermanentEnrollmentActions = new Set([
    "direct_permanent_enrollment",
    "parent_permanent_enrollment",
    "waitlist_promotion",
]);
function requiredString(data, key) {
    const value = data[key];
    if (typeof value !== "string" || value.trim() === "") {
        throw new https_1.HttpsError("invalid-argument", `Missing or invalid ${key}`);
    }
    return value;
}
async function sendPermanentSpotOpenedNotification(params) {
    const { classId, title, body, eventId } = params;
    const db = (0, firestore_2.getFirestore)();
    const msgSvc = (0, messaging_1.getMessaging)();
    const parentsSnap = await db.collection("users")
        .where("role", "==", "parent")
        .get();
    if (parentsSnap.empty)
        return;
    const recipients = [];
    for (const p of parentsSnap.docs) {
        const enabled = await (0, preferences_1.isNotificationPreferenceEnabled)(p.id, "spotOpened");
        if (!enabled)
            continue;
        const tsnap = await db
            .collection("userTokens")
            .doc(p.id)
            .collection("tokens")
            .get();
        const tokens = [];
        tsnap.forEach(d => {
            const t = d.data().token;
            if (t)
                tokens.push(t);
        });
        if (tokens.length)
            recipients.push({ uid: p.id, role: "parent", tokens });
    }
    if (!recipients.length)
        return;
    await (0, send_1.sendAndRecord)({
        messaging: msgSvc,
        db,
        recipients,
        title,
        body,
        data: { type: "permanent_spot", classId },
        source: "trigger:onPermanentSpotOpened",
        eventId,
    });
}
exports.enrollStudentPermanentForParent = (0, https_1.onCall)(async (request) => {
    var _a;
    const requesterId = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!requesterId) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to enrol permanently.");
    }
    if (!request.data || typeof request.data !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Request data must be an object.");
    }
    const requestData = request.data;
    const classId = requiredString(requestData, "classId");
    const studentId = requiredString(requestData, "studentId");
    const parentId = requiredString(requestData, "parentId");
    if (requesterId !== parentId) {
        throw new https_1.HttpsError("permission-denied", "You can only enrol students for your own account.");
    }
    const db = (0, firestore_2.getFirestore)();
    const classRef = db.collection("classes").doc(classId);
    const studentRef = db.collection("students").doc(studentId);
    const entryId = (0, waitlist_action_1.waitlistEntryId)(classId, studentId);
    const entryRef = db.collection("waitlistEntries").doc(entryId);
    const result = await db.runTransaction(async (transaction) => {
        var _a, _b, _c, _d, _e, _f, _g;
        const classSnap = await transaction.get(classRef);
        const studentSnap = await transaction.get(studentRef);
        const waitlistSnap = await transaction.get(entryRef);
        if (!classSnap.exists) {
            throw new https_1.HttpsError("not-found", "Class not found.");
        }
        if (!studentSnap.exists) {
            throw new https_1.HttpsError("not-found", "Student not found.");
        }
        const classData = classSnap.data() || {};
        const studentData = studentSnap.data() || {};
        const parentIds = Array.isArray(studentData.parents)
            ? studentData.parents
            : [];
        const primaryParentId = studentData.primaryParentId;
        if (!parentIds.includes(parentId) && primaryParentId !== parentId) {
            throw new https_1.HttpsError("permission-denied", "This student is not linked to your account.");
        }
        const classState = (0, permanent_enrollment_action_1.classEnrollmentState)(classData);
        const enrolledStudents = Array.isArray(classData.enrolledStudents)
            ? classData.enrolledStudents
            : [];
        const promoteExistingWaitlistEntry = () => {
            if (!waitlistSnap.exists)
                return;
            const existingData = waitlistSnap.data() || {};
            if (!(0, waitlist_action_1.countsTowardWaitlist)(existingData.status))
                return;
            transaction.update(entryRef, {
                status: "promoted",
                promotedAt: firestore_2.FieldValue.serverTimestamp(),
                updatedAt: firestore_2.FieldValue.serverTimestamp(),
            });
            const classUpdates = {
                waitlistCount: firestore_2.FieldValue.increment(-1),
            };
            if ((0, waitlist_action_1.countsTowardOpenOffers)(existingData.status)) {
                classUpdates.openOfferCount = firestore_2.FieldValue.increment(-1);
            }
            transaction.update(classRef, classUpdates);
        };
        if (enrolledStudents.includes(studentId)) {
            promoteExistingWaitlistEntry();
            return {
                outcome: "already_enrolled",
                classState,
            };
        }
        if (!(0, permanent_enrollment_action_1.canAcceptParentPermanentEnrollment)(classData)) {
            const reason = (0, waitlist_action_1.normalizeWaitlistReason)(classState === "full" ? "class_full" : "class_not_open");
            if (waitlistSnap.exists) {
                const existingData = waitlistSnap.data() || {};
                if ((0, waitlist_action_1.countsTowardWaitlist)(existingData.status)) {
                    return {
                        outcome: "waitlisted",
                        classState,
                        waitlistEntryId: entryId,
                        shouldNotifyWaitlist: false,
                    };
                }
            }
            const nextPosition = ((_a = classData.waitlistCounter) !== null && _a !== void 0 ? _a : 0) + 1;
            const now = firestore_2.Timestamp.now();
            transaction.set(entryRef, {
                classId,
                studentId,
                parentId,
                classType: (_b = classData.type) !== null && _b !== void 0 ? _b : "",
                day: (_c = classData.day) !== null && _c !== void 0 ? _c : "",
                startTime: (_d = classData.startTime) !== null && _d !== void 0 ? _d : "",
                endTime: (_e = classData.endTime) !== null && _e !== void 0 ? _e : "",
                status: "active",
                reason,
                position: nextPosition,
                createdAt: now,
                updatedAt: now,
                offeredAt: null,
                offerExpiresAt: null,
                promotedAt: null,
                notificationAction: {
                    type: "join_waitlist",
                    parentId,
                },
            });
            transaction.update(classRef, {
                waitlistCounter: nextPosition,
                waitlistCount: firestore_2.FieldValue.increment(1),
            });
            return {
                outcome: "waitlisted",
                classState,
                waitlistEntryId: entryId,
                shouldNotifyWaitlist: true,
            };
        }
        const classDay = classData.day || "Unknown day";
        const classTime = classData.startTime
            ? (0, shared_1.to12Hour)(classData.startTime)
            : "Unknown time";
        const studentName = `${(_f = studentData.firstName) !== null && _f !== void 0 ? _f : ""} ${(_g = studentData.lastName) !== null && _g !== void 0 ? _g : ""}`.trim() || studentId;
        transaction.update(classRef, {
            enrolledStudents: firestore_2.FieldValue.arrayUnion(studentId),
            notificationAction: {
                type: "parent_permanent_enrollment",
                studentId,
                parentId,
            },
        });
        promoteExistingWaitlistEntry();
        return {
            outcome: "enrolled",
            classState,
            studentName,
            classDay,
            classTime,
        };
    });
    let skippedWeeks = [];
    if (result.outcome === "enrolled") {
        let attendanceSyncError;
        try {
            const sync = await (0, shared_1.addStudentToFutureAttendanceDocs)({
                classId,
                studentId,
                updatedBy: parentId,
            });
            skippedWeeks = (sync === null || sync === void 0 ? void 0 : sync.skipped) || [];
        }
        catch (error) {
            attendanceSyncError = error;
            console.error("Error syncing future attendance for parent permanent enrolment:", error);
        }
        try {
            const recipients = await (0, shared_1.getAdminTokenOwners)();
            if (recipients.length) {
                await (0, shared_1.sendAdminPermanentEnrollmentNotification)({
                    recipients,
                    classId,
                    studentId,
                    studentName: result.studentName,
                    classDay: result.classDay,
                    classTime: result.classTime,
                });
                if (skippedWeeks.length) {
                    await (0, shared_1.sendAdminEnrolmentSkippedWeeksNotification)({
                        recipients,
                        classId,
                        studentId,
                        studentName: result.studentName,
                        classDay: result.classDay,
                        classTime: result.classTime,
                        skipped: skippedWeeks,
                    });
                }
            }
        }
        catch (error) {
            console.error("Error sending parent permanent enrolment admin notification:", error);
        }
        finally {
            try {
                await classRef.update({
                    notificationAction: firestore_2.FieldValue.delete(),
                });
            }
            catch (error) {
                console.error("Error clearing parent permanent enrolment action:", error);
            }
        }
        if (attendanceSyncError) {
            throw new https_1.HttpsError("internal", "Permanent enrolment was saved, but future attendance sync failed.");
        }
    }
    if (result.outcome === "waitlisted" && result.shouldNotifyWaitlist) {
        try {
            const entrySnap = await entryRef.get();
            const waitlistEntry = entrySnap.data();
            if (waitlistEntry) {
                await (0, shared_1.sendWaitlistJoinedAdminNotification)(result.waitlistEntryId, waitlistEntry);
            }
        }
        catch (error) {
            console.error("Error sending permanent enrolment waitlist admin notification:", error);
        }
        finally {
            try {
                await entryRef.update({
                    notificationAction: firestore_2.FieldValue.delete(),
                });
            }
            catch (error) {
                console.error("Error clearing permanent enrolment waitlist action:", error);
            }
        }
    }
    if (result.outcome === "enrolled") {
        result.skippedWeeks = skippedWeeks;
    }
    return result;
});
exports.enrollStudentPermanent = (0, https_1.onCall)(async (request) => {
    var _a;
    const requesterId = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!requesterId) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to enrol permanently.");
    }
    if (!request.data || typeof request.data !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Request data must be an object.");
    }
    const requestData = request.data;
    const classId = requiredString(requestData, "classId");
    const studentId = requiredString(requestData, "studentId");
    const db = (0, firestore_2.getFirestore)();
    const actorRef = db.collection("users").doc(requesterId);
    const classRef = db.collection("classes").doc(classId);
    const studentRef = db.collection("students").doc(studentId);
    const result = await db.runTransaction(async (transaction) => {
        var _a, _b;
        const actorSnap = await transaction.get(actorRef);
        const classSnap = await transaction.get(classRef);
        const studentSnap = await transaction.get(studentRef);
        if (!actorSnap.exists) {
            throw new https_1.HttpsError("permission-denied", "User account not found.");
        }
        if (!classSnap.exists) {
            throw new https_1.HttpsError("not-found", "Class not found.");
        }
        if (!studentSnap.exists) {
            throw new https_1.HttpsError("not-found", "Student not found.");
        }
        const actorData = actorSnap.data() || {};
        const classData = classSnap.data() || {};
        const studentData = studentSnap.data() || {};
        if (!(0, permanent_enrollment_action_1.canPerformPermanentEnrollmentAction)(requesterId, actorData, studentData)) {
            throw new https_1.HttpsError("permission-denied", "You cannot enrol this student permanently.");
        }
        const enrolledStudents = Array.isArray(classData.enrolledStudents)
            ? classData.enrolledStudents
            : [];
        if (enrolledStudents.includes(studentId)) {
            return {
                outcome: "already_enrolled",
                classId,
                studentId,
                shouldSyncAttendance: true,
                shouldNotifyEnrollment: false,
            };
        }
        // The capacity gate. Admins may deliberately overfill a class — they
        // can see the room and know when a fifth chair fits — but nobody else
        // may, and until MOB-38 this path checked nothing at all. The parent
        // swap flow calls this function, so an unchecked enrol here was how a
        // family put two more children into a class with one spot left.
        if (actorData.role !== "admin" &&
            !(0, permanentEnrolmentCapacity_1.hasPermanentRoom)({
                capacity: classData.capacity,
                enrolledStudents,
                studentId,
            })) {
            throw new https_1.HttpsError("failed-precondition", "That class is full.");
        }
        const classDay = classData.day || "Unknown day";
        const classTime = classData.startTime
            ? (0, shared_1.to12Hour)(classData.startTime)
            : "Unknown time";
        const studentName = `${(_a = studentData.firstName) !== null && _a !== void 0 ? _a : ""} ${(_b = studentData.lastName) !== null && _b !== void 0 ? _b : ""}`.trim() || studentId;
        transaction.update(classRef, {
            enrolledStudents: firestore_2.FieldValue.arrayUnion(studentId),
            notificationAction: {
                type: "direct_permanent_enrollment",
                studentId,
                actorId: requesterId,
            },
        });
        return {
            outcome: "enrolled",
            classId,
            studentId,
            shouldSyncAttendance: true,
            shouldNotifyEnrollment: true,
            studentName,
            classDay,
            classTime,
        };
    });
    let attendanceSyncError;
    let skippedWeeks = [];
    if (result.shouldSyncAttendance) {
        try {
            const sync = await (0, shared_1.addStudentToFutureAttendanceDocs)({
                classId,
                studentId,
                updatedBy: requesterId,
            });
            skippedWeeks = (sync === null || sync === void 0 ? void 0 : sync.skipped) || [];
        }
        catch (error) {
            attendanceSyncError = error;
            console.error("Error syncing future attendance for direct permanent enrolment:", error);
        }
    }
    if (result.shouldNotifyEnrollment) {
        try {
            const recipients = await (0, shared_1.getAdminTokenOwners)();
            if (recipients.length) {
                await (0, shared_1.sendAdminPermanentEnrollmentNotification)({
                    recipients,
                    classId,
                    studentId,
                    studentName: result.studentName,
                    classDay: result.classDay,
                    classTime: result.classTime,
                });
                // Separate send: the enrolment succeeded, and the weeks it
                // could not take are a different thing for someone to act on.
                if (skippedWeeks.length) {
                    await (0, shared_1.sendAdminEnrolmentSkippedWeeksNotification)({
                        recipients,
                        classId,
                        studentId,
                        studentName: result.studentName,
                        classDay: result.classDay,
                        classTime: result.classTime,
                        skipped: skippedWeeks,
                    });
                }
            }
        }
        catch (error) {
            console.error("Error sending direct permanent enrolment admin notification:", error);
        }
        finally {
            try {
                await classRef.update({
                    notificationAction: firestore_2.FieldValue.delete(),
                });
            }
            catch (error) {
                console.error("Error clearing direct permanent enrolment action:", error);
            }
        }
    }
    if (attendanceSyncError) {
        throw new https_1.HttpsError("internal", "Permanent enrolment was saved, but future attendance sync failed.");
    }
    // The caller needs these: a swap keeps the student in the class they are
    // leaving for exactly these weeks.
    result.skippedWeeks = skippedWeeks;
    return result;
});
exports.unenrollStudentPermanent = (0, https_1.onCall)(async (request) => {
    var _a;
    const requesterId = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!requesterId) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to unenrol permanently.");
    }
    if (!request.data || typeof request.data !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Request data must be an object.");
    }
    const requestData = request.data;
    const classId = requiredString(requestData, "classId");
    const studentId = requiredString(requestData, "studentId");
    // Sessions to leave the student booked into. A swap sends the weeks the
    // class they are moving to could not take, so they keep a seat here for
    // those weeks instead of ending up in neither class (MOB-38).
    const keepSessionIds = Array.isArray(requestData.keepSessionIds)
        ? requestData.keepSessionIds.filter(id => typeof id === "string" && id.trim() !== "")
        : [];
    const db = (0, firestore_2.getFirestore)();
    const actorRef = db.collection("users").doc(requesterId);
    const classRef = db.collection("classes").doc(classId);
    const studentRef = db.collection("students").doc(studentId);
    const result = await db.runTransaction(async (transaction) => {
        const actorSnap = await transaction.get(actorRef);
        const classSnap = await transaction.get(classRef);
        const studentSnap = await transaction.get(studentRef);
        if (!actorSnap.exists) {
            throw new https_1.HttpsError("permission-denied", "User account not found.");
        }
        if (!classSnap.exists) {
            throw new https_1.HttpsError("not-found", "Class not found.");
        }
        if (!studentSnap.exists) {
            throw new https_1.HttpsError("not-found", "Student not found.");
        }
        const actorData = actorSnap.data() || {};
        const classData = classSnap.data() || {};
        const studentData = studentSnap.data() || {};
        if (!(0, permanent_enrollment_action_1.canPerformPermanentEnrollmentAction)(requesterId, actorData, studentData)) {
            throw new https_1.HttpsError("permission-denied", "You cannot unenrol this student permanently.");
        }
        const enrolledStudents = Array.isArray(classData.enrolledStudents)
            ? classData.enrolledStudents
            : [];
        if (!enrolledStudents.includes(studentId)) {
            return {
                outcome: "not_enrolled",
                classId,
                studentId,
                shouldSyncAttendance: true,
                shouldNotifySpotOpened: false,
            };
        }
        const spotMessage = (0, permanent_spot_action_1.permanentSpotOpenedMessage)(classData, shared_1.to12Hour);
        transaction.update(classRef, {
            enrolledStudents: firestore_2.FieldValue.arrayRemove(studentId),
            notificationAction: {
                type: "direct_permanent_unenrollment",
                studentId,
                actorId: requesterId,
            },
        });
        return {
            outcome: "unenrolled",
            classId,
            studentId,
            shouldSyncAttendance: true,
            shouldNotifySpotOpened: true,
            spotTitle: spotMessage.title,
            spotBody: spotMessage.body,
            studentName: `${studentData.firstName || ""} ${studentData.lastName || ""}`.trim() || studentId,
            classDay: classData.day,
            classTime: classData.startTime,
        };
    });
    let attendanceSyncError;
    if (result.shouldSyncAttendance) {
        try {
            const sync = await (0, shared_1.removeStudentFromFutureAttendanceDocs)({
                classId,
                studentId,
                updatedBy: requesterId,
                keepSessionIds,
            });
            result.keptWeeks = (sync === null || sync === void 0 ? void 0 : sync.kept) || [];
        }
        catch (error) {
            attendanceSyncError = error;
            console.error("Error syncing future attendance for direct permanent unenrolment:", error);
        }
    }
    if (result.outcome === "unenrolled") {
        // Admins previously learned about an unenrolment only by accident:
        // the mobile client's unguarded pass over future attendance produced
        // one "Student Absent" push per remaining week. That pass is gone, so
        // this is the single deliberate replacement.
        await (0, events_1.emitNotificationEvent)({
            type: events_1.NOTIFICATION_EVENTS.STUDENT_UNENROLLED,
            payload: {
                classId,
                studentId,
                studentName: result.studentName,
                classDay: result.classDay,
                classTime: result.classTime,
            },
            // No business-key eventId: the same student can legitimately be
            // unenrolled, re-enrolled and unenrolled again from this class,
            // and a stable classId+studentId id would make the second
            // unenrolment's ledger row collide with the first's and be
            // silently dropped as a replay. Falls through to sendAndRecord's
            // generated-uuid default.
        });
    }
    if (result.shouldNotifySpotOpened) {
        try {
            await sendPermanentSpotOpenedNotification({
                classId,
                title: result.spotTitle,
                body: result.spotBody,
            });
        }
        catch (error) {
            console.error("Error sending direct permanent unenrolment spot notification:", error);
        }
        finally {
            try {
                await classRef.update({
                    notificationAction: firestore_2.FieldValue.delete(),
                });
            }
            catch (error) {
                console.error("Error clearing direct permanent unenrolment action:", error);
            }
        }
    }
    if (attendanceSyncError) {
        throw new https_1.HttpsError("internal", "Permanent unenrolment was saved, but future attendance sync failed.");
    }
    return result;
});
exports.onPermanentSpotOpened = (0, firestore_1.onDocumentUpdated)("classes/{classId}", async (event) => {
    var _a, _b;
    if (!((_a = event.data) === null || _a === void 0 ? void 0 : _a.before) || !((_b = event.data) === null || _b === void 0 ? void 0 : _b.after))
        return;
    const beforeArr = event.data.before.data().enrolledStudents || [];
    const afterArr = event.data.after.data().enrolledStudents || [];
    const notificationAction = event.data.after.data().notificationAction;
    const removedStudentIds = (0, permanent_spot_action_1.permanentSpotStudentIdsForNotification)(beforeArr, afterArr, notificationAction);
    if (!removedStudentIds.length)
        return;
    const classData = event.data.after.data();
    const message = (0, permanent_spot_action_1.permanentSpotOpenedMessage)(classData, shared_1.to12Hour);
    await sendPermanentSpotOpenedNotification({
        classId: event.params.classId,
        title: message.title,
        body: message.body,
        eventId: event.id,
    });
    console.log(`Sent permanent‐spot notification for class ${event.params.classId}`);
});
exports.onPermanentEnrolmentNotifyAdmins = (0, firestore_1.onDocumentUpdated)("classes/{classId}", async (event) => {
    var _a, _b, _c, _d;
    if (!((_a = event.data) === null || _a === void 0 ? void 0 : _a.before) || !((_b = event.data) === null || _b === void 0 ? void 0 : _b.after))
        return;
    const beforeArr = event.data.before.data().enrolledStudents || [];
    const afterArr = event.data.after.data().enrolledStudents || [];
    if (afterArr.length <= beforeArr.length)
        return;
    const notificationAction = event.data.after.data().notificationAction;
    const newStudentIds = afterArr
        .filter(id => !beforeArr.includes(id))
        .filter(id => {
        return !(typeof (notificationAction === null || notificationAction === void 0 ? void 0 : notificationAction.type) === "string" &&
            explicitPermanentEnrollmentActions.has(notificationAction.type) &&
            notificationAction.studentId === id);
    });
    if (!newStudentIds.length)
        return;
    const db = (0, firestore_2.getFirestore)();
    const messaging = (0, messaging_1.getMessaging)();
    const classId = event.params.classId;
    const classData = event.data.after.data();
    const classDay = classData.day || "Unknown day";
    const classTime = classData.startTime
        ? (0, shared_1.to12Hour)(classData.startTime)
        : "Unknown time";
    const recipients = await (0, shared_1.getAdminTokenOwners)();
    if (!recipients.length)
        return;
    for (const studentId of newStudentIds) {
        try {
            const studentSnap = await db.collection("students").doc(studentId).get();
            const studentData = studentSnap.data() || {};
            const studentName = `${(_c = studentData.firstName) !== null && _c !== void 0 ? _c : ""} ${(_d = studentData.lastName) !== null && _d !== void 0 ? _d : ""}`.trim() || studentId;
            const notifBody = `${studentName} has permanently enrolled for ${classDay} at ${classTime}.`;
            await (0, send_1.sendAndRecord)({
                messaging,
                db,
                recipients,
                title: "Student Enrolled",
                body: notifBody,
                data: {
                    type: "student_enrolled",
                    classId,
                    studentId,
                    enrolType: "permanent",
                },
                source: "trigger:onPermanentEnrolmentNotifyAdmins",
                eventId: event.id,
                // Several students can be added in one class write; each is
                // its own notification and needs its own ledger row.
                dedupeKey: `${event.id}:student_enrolled:${studentId}`,
            });
        }
        catch (error) {
            // Same reasoning as attendance.js's onAttendanceChangeNotifyAdmins:
            // don't let one bad send throw the whole handler and trigger an
            // at-least-once retry that re-sends everything that already went
            // out for the other students in this write.
            console.error(`Error sending student-enrolled admin notification for ${studentId} on ${classId}:`, error);
        }
    }
});
