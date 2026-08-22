"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onWaitlistEntryReactivatedNotifyAdmins = exports.onWaitlistEntryCreatedNotifyAdmins = exports.updateWaitlistEntryStatus = exports.promoteWaitlistEntry = exports.joinWaitlist = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("firebase-admin/firestore");
const shared_1 = require("./shared");
const permanent_enrollment_action_1 = require("./permanent_enrollment_action");
const waitlist_action_1 = require("./waitlist_action");
const waitlist_promotion_action_1 = require("./waitlist_promotion_action");
const { className, displayName, writeAuditLog } = require("../../src/shared/auditLog");
function requiredString(data, key) {
    const value = data[key];
    if (typeof value !== "string" || value.trim() === "") {
        throw new https_1.HttpsError("invalid-argument", `Missing or invalid ${key}`);
    }
    return value;
}
function optionalTimestamp(value) {
    if (value == null)
        return undefined;
    if (typeof value === "number" && Number.isFinite(value)) {
        return firestore_2.Timestamp.fromMillis(value);
    }
    if (typeof value === "string") {
        const millis = Date.parse(value);
        if (Number.isFinite(millis))
            return firestore_2.Timestamp.fromMillis(millis);
    }
    if (value instanceof Date)
        return firestore_2.Timestamp.fromDate(value);
    if (value && typeof value.toDate === "function") {
        return firestore_2.Timestamp.fromDate(value.toDate());
    }
    throw new https_1.HttpsError("invalid-argument", "Missing or invalid offerExpiresAt");
}
exports.joinWaitlist = (0, https_1.onCall)(async (request) => {
    var _a;
    const requesterId = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!requesterId) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to join a waitlist.");
    }
    if (!request.data || typeof request.data !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Request data must be an object.");
    }
    const requestData = request.data;
    const classId = requiredString(requestData, "classId");
    const studentId = requiredString(requestData, "studentId");
    const parentId = requiredString(requestData, "parentId");
    const reason = (() => {
        try {
            return (0, waitlist_action_1.normalizeWaitlistReason)(requestData.reason);
        }
        catch (_a) {
            throw new https_1.HttpsError("invalid-argument", "Missing or invalid reason");
        }
    })();
    if (requesterId !== parentId) {
        throw new https_1.HttpsError("permission-denied", "You can only join waitlists for your own account.");
    }
    const db = (0, firestore_2.getFirestore)();
    const entryId = (0, waitlist_action_1.waitlistEntryId)(classId, studentId);
    const entryRef = db.collection("waitlistEntries").doc(entryId);
    const classRef = db.collection("classes").doc(classId);
    const studentRef = db.collection("students").doc(studentId);
    const result = await db.runTransaction(async (transaction) => {
        var _a, _b, _c, _d, _e;
        const existingSnap = await transaction.get(entryRef);
        const classSnap = await transaction.get(classRef);
        const studentSnap = await transaction.get(studentRef);
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
        const enrolledStudents = Array.isArray(classData.enrolledStudents)
            ? classData.enrolledStudents
            : [];
        if (enrolledStudents.includes(studentId)) {
            throw new https_1.HttpsError("failed-precondition", "Student is already permanently enrolled in class.");
        }
        if (existingSnap.exists) {
            const existingData = existingSnap.data() || {};
            if ((0, waitlist_action_1.countsTowardWaitlist)(existingData.status)) {
                return {
                    entryId,
                    shouldNotifyAdmins: false,
                };
            }
        }
        const nextPosition = ((_a = classData.waitlistCounter) !== null && _a !== void 0 ? _a : 0) + 1;
        const now = firestore_2.Timestamp.now();
        const entry = {
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
        };
        transaction.set(entryRef, entry);
        transaction.update(classRef, {
            waitlistCounter: nextPosition,
            waitlistCount: firestore_2.FieldValue.increment(1),
        });
        return {
            entryId,
            shouldNotifyAdmins: true,
        };
    });
    if (result.shouldNotifyAdmins) {
        try {
            const entrySnap = await entryRef.get();
            const waitlistEntry = entrySnap.data();
            if (waitlistEntry) {
                await (0, shared_1.sendWaitlistJoinedAdminNotification)(entryId, waitlistEntry);
            }
        }
        catch (error) {
            console.error("Error sending join-waitlist admin notification:", error);
        }
        finally {
            try {
                await entryRef.update({
                    notificationAction: firestore_2.FieldValue.delete(),
                });
            }
            catch (error) {
                console.error("Error clearing join-waitlist notification action:", error);
            }
        }
    }
    return {
        entryId: result.entryId,
        joined: result.shouldNotifyAdmins,
    };
});
exports.promoteWaitlistEntry = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    const requesterId = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!requesterId) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to promote a waitlist entry.");
    }
    if (!request.data || typeof request.data !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Request data must be an object.");
    }
    const requestData = request.data;
    const entryId = requiredString(requestData, "entryId");
    const db = (0, firestore_2.getFirestore)();
    const adminRef = db.collection("users").doc(requesterId);
    const entryRef = db.collection("waitlistEntries").doc(entryId);
    let classRef;
    const result = await db.runTransaction(async (transaction) => {
        var _a, _b, _c;
        const adminSnap = await transaction.get(adminRef);
        const entrySnap = await transaction.get(entryRef);
        const actorData = adminSnap.data() || {};
        if (!adminSnap.exists || actorData.role !== "admin") {
            throw new https_1.HttpsError("permission-denied", "Only admins can promote waitlist entries.");
        }
        if (!entrySnap.exists) {
            throw new https_1.HttpsError("not-found", "Waitlist entry not found.");
        }
        const entryData = entrySnap.data() || {};
        const classId = requiredString(entryData, "classId");
        const studentId = requiredString(entryData, "studentId");
        const parentId = requiredString(entryData, "parentId");
        const previousStatus = typeof entryData.status === "string"
            ? entryData.status
            : "active";
        classRef = db.collection("classes").doc(classId);
        const studentRef = db.collection("students").doc(studentId);
        const classSnap = await transaction.get(classRef);
        const studentSnap = await transaction.get(studentRef);
        if (!classSnap.exists) {
            throw new https_1.HttpsError("not-found", "Class not found.");
        }
        if (!studentSnap.exists) {
            throw new https_1.HttpsError("not-found", "Student not found.");
        }
        const classData = classSnap.data() || {};
        const studentData = studentSnap.data() || {};
        const studentName = displayName(studentData, studentId);
        const classDisplayName = className(classData, classId);
        const spotsRemaining = (0, permanent_enrollment_action_1.permanentSpotsRemaining)(classData);
        const enrolledStudents = Array.isArray(classData.enrolledStudents)
            ? classData.enrolledStudents
            : [];
        if (!(0, waitlist_promotion_action_1.canPromoteWaitlistStatus)(previousStatus)) {
            return {
                outcome: "not_promotable",
                entryId,
                classId,
                studentId,
                parentId,
                actorEmail: actorData.email || null,
                actorRole: actorData.role || null,
                studentName,
                className: classDisplayName,
                previousStatus,
                permanentSpotsRemaining: spotsRemaining,
                shouldSyncAttendance: false,
                shouldNotifyEnrollment: false,
            };
        }
        const promotedEntryUpdates = {
            status: "promoted",
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
            promotedAt: firestore_2.FieldValue.serverTimestamp(),
        };
        const counterDeltas = (0, waitlist_promotion_action_1.waitlistPromotionCounterDeltas)(previousStatus);
        const classCounterUpdates = {};
        if (counterDeltas.waitlistCount !== 0) {
            classCounterUpdates.waitlistCount = firestore_2.FieldValue.increment(counterDeltas.waitlistCount);
        }
        if (counterDeltas.openOfferCount !== 0) {
            classCounterUpdates.openOfferCount = firestore_2.FieldValue.increment(counterDeltas.openOfferCount);
        }
        if (enrolledStudents.includes(studentId)) {
            transaction.update(entryRef, promotedEntryUpdates);
            if (Object.keys(classCounterUpdates).length) {
                transaction.update(classRef, classCounterUpdates);
            }
            return {
                outcome: "already_enrolled",
                entryId,
                classId,
                studentId,
                parentId,
                actorEmail: actorData.email || null,
                actorRole: actorData.role || null,
                studentName,
                className: classDisplayName,
                previousStatus,
                permanentSpotsRemaining: spotsRemaining,
                shouldSyncAttendance: true,
                shouldNotifyEnrollment: false,
            };
        }
        if (spotsRemaining <= 0) {
            return {
                outcome: "class_full",
                entryId,
                classId,
                studentId,
                parentId,
                actorEmail: actorData.email || null,
                actorRole: actorData.role || null,
                studentName,
                className: classDisplayName,
                previousStatus,
                permanentSpotsRemaining: spotsRemaining,
                shouldSyncAttendance: false,
                shouldNotifyEnrollment: false,
            };
        }
        const classDay = classData.day || "Unknown day";
        const classTime = classData.startTime
            ? (0, shared_1.to12Hour)(classData.startTime)
            : "Unknown time";
        transaction.update(entryRef, promotedEntryUpdates);
        transaction.update(classRef, Object.assign(Object.assign({}, classCounterUpdates), { enrolledStudents: firestore_2.FieldValue.arrayUnion(studentId), notificationAction: {
                type: "waitlist_promotion",
                entryId,
                studentId,
                adminId: requesterId,
            } }));
        return {
            outcome: "promoted",
            entryId,
            classId,
            studentId,
            parentId,
            actorEmail: actorData.email || null,
            actorRole: actorData.role || null,
            previousStatus,
            permanentSpotsRemaining: spotsRemaining - 1,
            shouldSyncAttendance: true,
            shouldNotifyEnrollment: true,
            studentName,
            className: classDisplayName,
            classDay,
            classTime,
        };
    });
    let attendanceSyncError;
    if (result.shouldSyncAttendance) {
        try {
            await (0, shared_1.addStudentToFutureAttendanceDocs)({
                classId: result.classId,
                studentId: result.studentId,
                updatedBy: requesterId,
            });
        }
        catch (error) {
            attendanceSyncError = error;
            console.error("Error syncing future attendance for waitlist promotion:", error);
        }
    }
    if (result.shouldNotifyEnrollment && classRef) {
        try {
            const recipients = await (0, shared_1.getAdminTokenOwners)();
            if (recipients.length) {
                await (0, shared_1.sendAdminPermanentEnrollmentNotification)({
                    recipients,
                    classId: result.classId,
                    studentId: result.studentId,
                    studentName: (_b = result.studentName) !== null && _b !== void 0 ? _b : result.studentId,
                    classDay: (_c = result.classDay) !== null && _c !== void 0 ? _c : "Unknown day",
                    classTime: (_d = result.classTime) !== null && _d !== void 0 ? _d : "Unknown time",
                });
            }
        }
        catch (error) {
            console.error("Error sending waitlist promotion admin notification:", error);
        }
        finally {
            try {
                await classRef.update({
                    notificationAction: firestore_2.FieldValue.delete(),
                });
            }
            catch (error) {
                console.error("Error clearing waitlist promotion notification action:", error);
            }
        }
    }
    if (attendanceSyncError) {
        await writeAuditLog(db, {
            actorUid: requesterId,
            actorEmail: result.actorEmail,
            actorRole: result.actorRole,
            action: "waitlist.promote",
            targetType: "waitlistEntry",
            targetId: entryId,
            targetName: result.studentName || entryId,
            payloadSummary: {
                outcome: result.outcome,
                classId: result.classId,
                className: result.className || null,
                studentId: result.studentId,
                parentId: result.parentId,
                attendanceSync: "failed",
            },
            before: { status: result.previousStatus },
            after: { status: result.outcome === "class_full" || result.outcome === "not_promotable" ? result.previousStatus : "promoted" },
        }, { logger: console });
        throw new https_1.HttpsError("internal", "Waitlist promotion was saved, but future attendance sync failed.");
    }
    await writeAuditLog(db, {
        actorUid: requesterId,
        actorEmail: result.actorEmail,
        actorRole: result.actorRole,
        action: "waitlist.promote",
        targetType: "waitlistEntry",
        targetId: entryId,
        targetName: result.studentName || entryId,
        payloadSummary: {
            outcome: result.outcome,
            classId: result.classId,
            className: result.className || null,
            studentId: result.studentId,
            parentId: result.parentId,
            attendanceSync: result.shouldSyncAttendance ? "succeeded" : "not_required",
        },
        before: { status: result.previousStatus },
        after: { status: result.outcome === "class_full" || result.outcome === "not_promotable" ? result.previousStatus : "promoted" },
    }, { logger: console });
    return result;
});
exports.updateWaitlistEntryStatus = (0, https_1.onCall)(async (request) => {
    var _a;
    const requesterId = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!requesterId) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to update a waitlist entry.");
    }
    if (!request.data || typeof request.data !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Request data must be an object.");
    }
    const requestData = request.data;
    const entryId = requiredString(requestData, "entryId");
    const status = (() => {
        try {
            return (0, waitlist_action_1.normalizeWaitlistStatus)(requestData.status);
        }
        catch (_a) {
            throw new https_1.HttpsError("invalid-argument", "Missing or invalid status");
        }
    })();
    const offerExpiresAt = optionalTimestamp(requestData.offerExpiresAt);
    const db = (0, firestore_2.getFirestore)();
    const actorRef = db.collection("users").doc(requesterId);
    const entryRef = db.collection("waitlistEntries").doc(entryId);
    const result = await db.runTransaction(async (transaction) => {
        const actorSnap = await transaction.get(actorRef);
        const entrySnap = await transaction.get(entryRef);
        if (!actorSnap.exists) {
            throw new https_1.HttpsError("permission-denied", "User account not found.");
        }
        if (!entrySnap.exists) {
            throw new https_1.HttpsError("not-found", "Waitlist entry not found.");
        }
        const actorData = actorSnap.data() || {};
        const entryData = entrySnap.data() || {};
        const previousStatus = typeof entryData.status === "string"
            ? entryData.status
            : "active";
        const classId = requiredString(entryData, "classId");
        const parentId = requiredString(entryData, "parentId");
        const studentId = typeof entryData.studentId === "string" ? entryData.studentId : null;
        const [studentSnap, classSnap] = await Promise.all([
            studentId ? transaction.get(db.collection("students").doc(studentId)) : Promise.resolve(null),
            transaction.get(db.collection("classes").doc(classId)),
        ]);
        const studentData = (studentSnap === null || studentSnap === void 0 ? void 0 : studentSnap.data()) || {};
        const classData = (classSnap === null || classSnap === void 0 ? void 0 : classSnap.data()) || {};
        if (!(0, waitlist_action_1.canPerformWaitlistStatusUpdate)({
            actorId: requesterId,
            actorRole: actorData.role,
            entryParentId: parentId,
            nextStatus: status,
        })) {
            throw new https_1.HttpsError("permission-denied", "You cannot update this waitlist entry.");
        }
        const shouldNotifyAdmins = (0, waitlist_action_1.shouldNotifyWaitlistReactivated)(previousStatus, status);
        const updates = {
            status,
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
        };
        if (status === "offered" && previousStatus !== "offered") {
            updates.offeredAt = firestore_2.FieldValue.serverTimestamp();
        }
        if (offerExpiresAt) {
            updates.offerExpiresAt = offerExpiresAt;
        }
        if (status === "promoted") {
            updates.promotedAt = firestore_2.FieldValue.serverTimestamp();
        }
        if (shouldNotifyAdmins) {
            updates.notificationAction = {
                type: "update_waitlist_status",
                actorId: requesterId,
            };
        }
        const counterDeltas = (0, waitlist_action_1.waitlistStatusCounterDeltas)(previousStatus, status);
        const classUpdates = {};
        if (counterDeltas.waitlistCount !== 0) {
            classUpdates.waitlistCount = firestore_2.FieldValue.increment(counterDeltas.waitlistCount);
        }
        if (counterDeltas.openOfferCount !== 0) {
            classUpdates.openOfferCount = firestore_2.FieldValue.increment(counterDeltas.openOfferCount);
        }
        transaction.update(entryRef, updates);
        if (Object.keys(classUpdates).length) {
            transaction.update(db.collection("classes").doc(classId), classUpdates);
        }
        return {
            entryId,
            classId,
            parentId,
            studentId,
            actorEmail: actorData.email || null,
            actorRole: actorData.role || null,
            studentName: displayName(studentData, studentId || entryId),
            className: className(classData, classId),
            previousStatus,
            status,
            shouldNotifyAdmins,
        };
    });
    if (result.shouldNotifyAdmins) {
        try {
            const entrySnap = await entryRef.get();
            const waitlistEntry = entrySnap.data();
            if (waitlistEntry) {
                await (0, shared_1.sendWaitlistJoinedAdminNotification)(entryId, waitlistEntry);
            }
        }
        catch (error) {
            console.error("Error sending waitlist status admin notification:", error);
        }
        finally {
            try {
                await entryRef.update({
                    notificationAction: firestore_2.FieldValue.delete(),
                });
            }
            catch (error) {
                console.error("Error clearing waitlist status notification action:", error);
            }
        }
    }
    await writeAuditLog(db, {
        actorUid: requesterId,
        actorEmail: result.actorEmail,
        actorRole: result.actorRole,
        action: "waitlist.status.update",
        targetType: "waitlistEntry",
        targetId: entryId,
        targetName: result.studentName || entryId,
        payloadSummary: {
            classId: result.classId,
            className: result.className || null,
            studentId: result.studentId || null,
            parentId: result.parentId,
            notifiedAdmins: result.shouldNotifyAdmins,
        },
        before: { status: result.previousStatus },
        after: { status: result.status },
    }, { logger: console });
    return result;
});
exports.onWaitlistEntryCreatedNotifyAdmins = (0, firestore_1.onDocumentCreated)("waitlistEntries/{waitlistEntryId}", async (event) => {
    var _a;
    const waitlistEntry = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!waitlistEntry)
        return;
    const notificationAction = waitlistEntry.notificationAction;
    if ((notificationAction === null || notificationAction === void 0 ? void 0 : notificationAction.type) === "join_waitlist")
        return;
    await (0, shared_1.sendWaitlistJoinedAdminNotification)(event.params.waitlistEntryId, waitlistEntry, event.id);
});
exports.onWaitlistEntryReactivatedNotifyAdmins = (0, firestore_1.onDocumentUpdated)("waitlistEntries/{waitlistEntryId}", async (event) => {
    var _a, _b;
    if (!((_a = event.data) === null || _a === void 0 ? void 0 : _a.before) || !((_b = event.data) === null || _b === void 0 ? void 0 : _b.after))
        return;
    const before = event.data.before.data();
    const after = event.data.after.data();
    const notificationAction = after.notificationAction;
    if ((notificationAction === null || notificationAction === void 0 ? void 0 : notificationAction.type) === "join_waitlist" ||
        (notificationAction === null || notificationAction === void 0 ? void 0 : notificationAction.type) === "update_waitlist_status")
        return;
    if (before.status === "active" || after.status !== "active")
        return;
    await (0, shared_1.sendWaitlistJoinedAdminNotification)(event.params.waitlistEntryId, after, event.id);
});
