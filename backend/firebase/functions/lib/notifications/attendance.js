"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAttendanceChangeNotifyAdmins = exports.notifyStudentAbsence = exports.rescheduleStudentToDifferentClass = exports.cancelStudentForWeek = exports.enrollStudentOneOff = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const absence_1 = require("./absence");
const attendance_action_1 = require("./attendance_action");
const permanent_enrollment_action_1 = require("./permanent_enrollment_action");
const shared_1 = require("./shared");
const enrolOneOffStudents_1 = require("../../src/attendance/enrolOneOffStudents");
function requiredString(data, key) {
    const value = data[key];
    if (typeof value !== "string" || value.trim() === "") {
        throw new https_1.HttpsError("invalid-argument", `Missing or invalid ${key}`);
    }
    return value;
}
async function sendAdminStudentAddedNotification(params) {
    const { tokens, classId, studentId, studentName, classDay, classTime, attDateStr, } = params;
    const msg = {
        notification: {
            title: "Student Added",
            body: (0, attendance_action_1.studentAddedNotificationBody)({
                studentName,
                classDay,
                classTime,
                attendanceDateText: attDateStr,
            }),
        },
        data: {
            type: "student_added",
            classId,
            studentId,
        },
        tokens,
    };
    await (0, messaging_1.getMessaging)().sendEachForMulticast(msg);
}
async function sendAdminStudentAbsentNotification(params) {
    const { tokens, classId, studentId, studentName, classDay, classTime, attDateStr, } = params;
    const msg = {
        notification: {
            title: "Student Absent",
            body: (0, attendance_action_1.studentAbsentNotificationBody)({
                studentName,
                classDay,
                classTime,
                attendanceDateText: attDateStr,
            }),
        },
        data: {
            type: "student_absent",
            classId,
            studentId,
        },
        tokens,
    };
    await (0, messaging_1.getMessaging)().sendEachForMulticast(msg);
}
// The other half of the one-off money path: if this runs out of memory the
// parent has paid and has no class. See PAYMENT_FUNCTION_MEMORY in
// payment_functions.js for why the 256MiB default is not enough headroom.
exports.enrollStudentOneOff = (0, https_1.onCall)({ memory: "512MiB" }, async (request) => {
    var _a, _b, _c;
    const requesterId = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!requesterId) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to enrol for a class.");
    }
    if (!request.data || typeof request.data !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Request data must be an object.");
    }
    const requestData = request.data;
    const classId = requiredString(requestData, "classId");
    const studentId = requiredString(requestData, "studentId");
    const attendanceDocId = requiredString(requestData, "attendanceDocId");
    const db = (0, firestore_2.getFirestore)();
    const actorSnap = await db.collection("users").doc(requesterId).get();
    if (!actorSnap.exists) {
        throw new https_1.HttpsError("permission-denied", "User account not found.");
    }
    const actorData = actorSnap.data() || {};
    // Shares the capacity check and the arrayUnion write with the payment
    // webhook and the reconciliation sweep, so a seat cannot be sold twice by
    // two paths disagreeing about whether it was free.
    const result = await (0, enrolOneOffStudents_1.enrolOneOffStudentsImpl)({
        db,
        classId,
        attendanceDocId,
        studentIds: [studentId],
        actor: { uid: requesterId },
        canEnrol: (studentData) => (0, permanent_enrollment_action_1.canPerformPermanentEnrollmentAction)(requesterId, actorData, studentData),
    });
    if (!result.ok) {
        switch (result.reason) {
            case "class_not_found":
                throw new https_1.HttpsError("not-found", "Class not found.");
            case "attendance_not_found":
                throw new https_1.HttpsError("not-found", "Attendance record not found.");
            case "student_not_found":
                throw new https_1.HttpsError("not-found", "Student not found.");
            default:
                throw new https_1.HttpsError("permission-denied", "You cannot enrol this student for this class.");
        }
    }
    if (result.noCapacity.length > 0) {
        throw new https_1.HttpsError("failed-precondition", "Class is full for this date/week.");
    }
    const didAddStudent = result.enrolled.includes(studentId);
    if (didAddStudent) {
        const attendanceRef = db
            .collection("classes")
            .doc(classId)
            .collection("attendance")
            .doc(attendanceDocId);
        try {
            const tokens = await (0, shared_1.getAdminTokens)();
            if (tokens.length) {
                const classData = result.classData || {};
                const studentSnap = await db.collection("students").doc(studentId).get();
                const studentData = studentSnap.data() || {};
                const classDay = classData.day || "Unknown day";
                await sendAdminStudentAddedNotification({
                    tokens,
                    classId,
                    studentId,
                    studentName: `${(_b = studentData.firstName) !== null && _b !== void 0 ? _b : ""} ${(_c = studentData.lastName) !== null && _c !== void 0 ? _c : ""}`.trim() || studentId,
                    classDay,
                    classTime: classData.startTime
                        ? (0, shared_1.to12Hour)(classData.startTime)
                        : "Unknown time",
                    attDateStr: (0, absence_1.formatSydneyAttendanceDate)((0, absence_1.timestampToDate)((result.attendanceData || {}).date), classDay),
                });
            }
        }
        catch (error) {
            console.error("Error sending one-off enrolment admin notification:", error);
        }
        finally {
            try {
                await attendanceRef.update({
                    notificationAction: firestore_2.FieldValue.delete(),
                });
            }
            catch (error) {
                console.error("Error clearing one-off enrolment notification action:", error);
            }
        }
    }
    return {
        added: didAddStudent,
        alreadyEnrolled: result.alreadyEnrolled.includes(studentId),
    };
});
exports.cancelStudentForWeek = (0, https_1.onCall)(async (request) => {
    var _a;
    const requesterId = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!requesterId) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to cancel attendance.");
    }
    if (!request.data || typeof request.data !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Request data must be an object.");
    }
    const requestData = request.data;
    const classId = requiredString(requestData, "classId");
    const studentId = requiredString(requestData, "studentId");
    const attendanceDocId = requiredString(requestData, "attendanceDocId");
    const db = (0, firestore_2.getFirestore)();
    const actorRef = db.collection("users").doc(requesterId);
    const classRef = db.collection("classes").doc(classId);
    const attendanceRef = classRef.collection("attendance").doc(attendanceDocId);
    const studentRef = db.collection("students").doc(studentId);
    const result = await db.runTransaction(async (transaction) => {
        var _a, _b;
        const actorSnap = await transaction.get(actorRef);
        const classSnap = await transaction.get(classRef);
        const attendanceSnap = await transaction.get(attendanceRef);
        const studentSnap = await transaction.get(studentRef);
        if (!actorSnap.exists) {
            throw new https_1.HttpsError("permission-denied", "User account not found.");
        }
        if (!classSnap.exists) {
            throw new https_1.HttpsError("not-found", "Class not found.");
        }
        if (!attendanceSnap.exists) {
            throw new https_1.HttpsError("not-found", "Attendance record not found.");
        }
        if (!studentSnap.exists) {
            throw new https_1.HttpsError("not-found", "Student not found.");
        }
        const actorData = actorSnap.data() || {};
        const classData = classSnap.data() || {};
        const attendanceData = attendanceSnap.data() || {};
        const studentData = studentSnap.data() || {};
        if (!(0, permanent_enrollment_action_1.canPerformPermanentEnrollmentAction)(requesterId, actorData, studentData)) {
            throw new https_1.HttpsError("permission-denied", "You cannot cancel attendance for this student.");
        }
        const currentAttendance = Array.isArray(attendanceData.attendance)
            ? attendanceData.attendance
            : [];
        if (!currentAttendance.includes(studentId)) {
            return {
                didRemoveStudent: false,
                alreadyAbsent: true,
            };
        }
        const attendanceDate = (0, absence_1.timestampToDate)(attendanceData.date);
        const classDay = classData.day || "Unknown day";
        const classTime = classData.startTime
            ? (0, shared_1.to12Hour)(classData.startTime)
            : "Unknown time";
        const attDateStr = (0, absence_1.formatSydneyAttendanceDate)(attendanceDate, classDay);
        const studentName = `${(_a = studentData.firstName) !== null && _a !== void 0 ? _a : ""} ${(_b = studentData.lastName) !== null && _b !== void 0 ? _b : ""}`.trim() || studentId;
        transaction.update(attendanceRef, {
            attendance: firestore_2.FieldValue.arrayRemove(studentId),
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
            updatedBy: requesterId,
            notificationAction: {
                type: "cancel_student_for_week",
                studentId,
                actorId: requesterId,
            },
        });
        return {
            didRemoveStudent: true,
            alreadyAbsent: false,
            classDay,
            classTime,
            attDateStr,
            studentName,
        };
    });
    if (result.didRemoveStudent) {
        try {
            const tokens = await (0, shared_1.getAdminTokens)();
            if (tokens.length) {
                await sendAdminStudentAbsentNotification({
                    tokens,
                    classId,
                    studentId,
                    studentName: result.studentName,
                    classDay: result.classDay,
                    classTime: result.classTime,
                    attDateStr: result.attDateStr,
                });
            }
        }
        catch (error) {
            console.error("Error sending cancel-attendance admin notification:", error);
        }
        finally {
            try {
                await attendanceRef.update({
                    notificationAction: firestore_2.FieldValue.delete(),
                });
            }
            catch (error) {
                console.error("Error clearing cancel-attendance notification action:", error);
            }
        }
    }
    return {
        removed: result.didRemoveStudent,
        alreadyAbsent: result.alreadyAbsent,
    };
});
exports.rescheduleStudentToDifferentClass = (0, https_1.onCall)(async (request) => {
    var _a;
    const requesterId = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!requesterId) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to reschedule attendance.");
    }
    if (!request.data || typeof request.data !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Request data must be an object.");
    }
    const requestData = request.data;
    const oldClassId = requiredString(requestData, "oldClassId");
    const oldAttendanceDocId = requiredString(requestData, "oldAttendanceDocId");
    const newClassId = requiredString(requestData, "newClassId");
    const newAttendanceDocId = requiredString(requestData, "newAttendanceDocId");
    const studentId = requiredString(requestData, "studentId");
    if (oldClassId === newClassId && oldAttendanceDocId === newAttendanceDocId) {
        throw new https_1.HttpsError("invalid-argument", "Old and new attendance records must be different.");
    }
    const db = (0, firestore_2.getFirestore)();
    const actorRef = db.collection("users").doc(requesterId);
    const oldClassRef = db.collection("classes").doc(oldClassId);
    const newClassRef = db.collection("classes").doc(newClassId);
    const oldAttendanceRef = oldClassRef.collection("attendance").doc(oldAttendanceDocId);
    const newAttendanceRef = newClassRef.collection("attendance").doc(newAttendanceDocId);
    const studentRef = db.collection("students").doc(studentId);
    const result = await db.runTransaction(async (transaction) => {
        var _a, _b;
        const actorSnap = await transaction.get(actorRef);
        const oldClassSnap = await transaction.get(oldClassRef);
        const newClassSnap = await transaction.get(newClassRef);
        const oldAttendanceSnap = await transaction.get(oldAttendanceRef);
        const newAttendanceSnap = await transaction.get(newAttendanceRef);
        const studentSnap = await transaction.get(studentRef);
        if (!actorSnap.exists) {
            throw new https_1.HttpsError("permission-denied", "User account not found.");
        }
        if (!oldClassSnap.exists) {
            throw new https_1.HttpsError("not-found", "Original class not found.");
        }
        if (!newClassSnap.exists) {
            throw new https_1.HttpsError("not-found", "Destination class not found.");
        }
        if (!oldAttendanceSnap.exists) {
            throw new https_1.HttpsError("not-found", "Original attendance record not found.");
        }
        if (!newAttendanceSnap.exists) {
            throw new https_1.HttpsError("not-found", "Destination attendance record not found.");
        }
        if (!studentSnap.exists) {
            throw new https_1.HttpsError("not-found", "Student not found.");
        }
        const actorData = actorSnap.data() || {};
        const oldClassData = oldClassSnap.data() || {};
        const newClassData = newClassSnap.data() || {};
        const oldAttendanceData = oldAttendanceSnap.data() || {};
        const newAttendanceData = newAttendanceSnap.data() || {};
        const studentData = studentSnap.data() || {};
        if (!(0, permanent_enrollment_action_1.canPerformPermanentEnrollmentAction)(requesterId, actorData, studentData)) {
            throw new https_1.HttpsError("permission-denied", "You cannot reschedule attendance for this student.");
        }
        const oldAttendance = Array.isArray(oldAttendanceData.attendance)
            ? oldAttendanceData.attendance
            : [];
        const newAttendance = Array.isArray(newAttendanceData.attendance)
            ? newAttendanceData.attendance
            : [];
        const didRemoveStudent = oldAttendance.includes(studentId);
        const didAddStudent = !newAttendance.includes(studentId);
        if (didAddStudent) {
            const capacity = typeof newClassData.capacity === "number" ? newClassData.capacity : 0;
            if (newAttendance.length >= capacity) {
                throw new https_1.HttpsError("failed-precondition", "Class is full for this date/week.");
            }
        }
        const studentName = `${(_a = studentData.firstName) !== null && _a !== void 0 ? _a : ""} ${(_b = studentData.lastName) !== null && _b !== void 0 ? _b : ""}`.trim() || studentId;
        const oldClassDay = oldClassData.day || "Unknown day";
        const oldClassTime = oldClassData.startTime
            ? (0, shared_1.to12Hour)(oldClassData.startTime)
            : "Unknown time";
        const oldAttDateStr = (0, absence_1.formatSydneyAttendanceDate)((0, absence_1.timestampToDate)(oldAttendanceData.date), oldClassDay);
        const newClassDay = newClassData.day || "Unknown day";
        const newClassTime = newClassData.startTime
            ? (0, shared_1.to12Hour)(newClassData.startTime)
            : "Unknown time";
        const newAttDateStr = (0, absence_1.formatSydneyAttendanceDate)((0, absence_1.timestampToDate)(newAttendanceData.date), newClassDay);
        if (didRemoveStudent) {
            transaction.update(oldAttendanceRef, {
                attendance: firestore_2.FieldValue.arrayRemove(studentId),
                updatedAt: firestore_2.FieldValue.serverTimestamp(),
                updatedBy: requesterId,
                notificationAction: {
                    type: "reschedule_from",
                    studentId,
                    actorId: requesterId,
                    newClassId,
                    newAttendanceDocId,
                },
            });
        }
        if (didAddStudent) {
            transaction.update(newAttendanceRef, {
                attendance: firestore_2.FieldValue.arrayUnion(studentId),
                updatedAt: firestore_2.FieldValue.serverTimestamp(),
                updatedBy: requesterId,
                notificationAction: {
                    type: "reschedule_to",
                    studentId,
                    actorId: requesterId,
                    oldClassId,
                    oldAttendanceDocId,
                },
            });
        }
        return {
            didRemoveStudent,
            didAddStudent,
            alreadyAbsent: !didRemoveStudent,
            alreadyEnrolled: !didAddStudent,
            old: didRemoveStudent
                ? {
                    classDay: oldClassDay,
                    classTime: oldClassTime,
                    attDateStr: oldAttDateStr,
                    studentName,
                }
                : undefined,
            next: didAddStudent
                ? {
                    classDay: newClassDay,
                    classTime: newClassTime,
                    attDateStr: newAttDateStr,
                    studentName,
                }
                : undefined,
        };
    });
    if (result.didRemoveStudent || result.didAddStudent) {
        try {
            const tokens = await (0, shared_1.getAdminTokens)();
            if (tokens.length) {
                if (result.didRemoveStudent && result.old) {
                    try {
                        await sendAdminStudentAbsentNotification({
                            tokens,
                            classId: oldClassId,
                            studentId,
                            studentName: result.old.studentName,
                            classDay: result.old.classDay,
                            classTime: result.old.classTime,
                            attDateStr: result.old.attDateStr,
                        });
                    }
                    catch (error) {
                        console.error("Error sending reschedule source admin notification:", error);
                    }
                }
                if (result.didAddStudent && result.next) {
                    try {
                        await sendAdminStudentAddedNotification({
                            tokens,
                            classId: newClassId,
                            studentId,
                            studentName: result.next.studentName,
                            classDay: result.next.classDay,
                            classTime: result.next.classTime,
                            attDateStr: result.next.attDateStr,
                        });
                    }
                    catch (error) {
                        console.error("Error sending reschedule destination admin notification:", error);
                    }
                }
            }
        }
        catch (error) {
            console.error("Error loading admin tokens for reschedule notifications:", error);
        }
        finally {
            if (result.didRemoveStudent) {
                try {
                    await oldAttendanceRef.update({
                        notificationAction: firestore_2.FieldValue.delete(),
                    });
                }
                catch (error) {
                    console.error("Error clearing reschedule source notification action:", error);
                }
            }
            if (result.didAddStudent) {
                try {
                    await newAttendanceRef.update({
                        notificationAction: firestore_2.FieldValue.delete(),
                    });
                }
                catch (error) {
                    console.error("Error clearing reschedule destination notification action:", error);
                }
            }
        }
    }
    return {
        removed: result.didRemoveStudent,
        added: result.didAddStudent,
        alreadyAbsent: result.alreadyAbsent,
        alreadyEnrolled: result.alreadyEnrolled,
    };
});
exports.notifyStudentAbsence = (0, https_1.onCall)(async (request) => {
    var _a;
    const requesterId = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!requesterId) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to notify an absence.");
    }
    if (!request.data || typeof request.data !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Request data must be an object.");
    }
    const requestData = request.data;
    const classId = requiredString(requestData, "classId");
    const studentId = requiredString(requestData, "studentId");
    const attendanceDocId = requiredString(requestData, "attendanceDocId");
    const parentId = requiredString(requestData, "parentId");
    if (requesterId !== parentId) {
        throw new https_1.HttpsError("permission-denied", "You can only notify absences for your own account.");
    }
    const db = (0, firestore_2.getFirestore)();
    const classRef = db.collection("classes").doc(classId);
    const attendanceRef = classRef.collection("attendance").doc(attendanceDocId);
    const studentRef = db.collection("students").doc(studentId);
    const parentRef = db.collection("users").doc(parentId);
    const result = await db.runTransaction(async (transaction) => {
        var _a, _b;
        const classSnap = await transaction.get(classRef);
        const attendanceSnap = await transaction.get(attendanceRef);
        const studentSnap = await transaction.get(studentRef);
        const parentSnap = await transaction.get(parentRef);
        if (!classSnap.exists) {
            throw new https_1.HttpsError("not-found", "Class not found.");
        }
        if (!attendanceSnap.exists) {
            throw new https_1.HttpsError("not-found", "Attendance record not found.");
        }
        if (!studentSnap.exists) {
            throw new https_1.HttpsError("not-found", "Student not found.");
        }
        if (!parentSnap.exists) {
            throw new https_1.HttpsError("not-found", "Parent not found.");
        }
        const classData = classSnap.data() || {};
        const attendanceData = attendanceSnap.data() || {};
        const studentData = studentSnap.data() || {};
        const parentIds = Array.isArray(studentData.parents)
            ? studentData.parents
            : [];
        if (!parentIds.includes(parentId)) {
            throw new https_1.HttpsError("permission-denied", "This student is not linked to your account.");
        }
        const currentAttendance = Array.isArray(attendanceData.attendance)
            ? attendanceData.attendance
            : [];
        if (!currentAttendance.includes(studentId)) {
            return {
                didRemoveStudent: false,
                tokenAwarded: false,
            };
        }
        const attendanceDate = (0, absence_1.timestampToDate)(attendanceData.date);
        if (!attendanceDate) {
            throw new https_1.HttpsError("failed-precondition", "Attendance date is missing or invalid.");
        }
        const tokenAwarded = (0, absence_1.shouldAwardAbsenceLessonToken)(attendanceDate);
        const classDay = classData.day || "Unknown day";
        const classTime = classData.startTime
            ? (0, shared_1.to12Hour)(classData.startTime)
            : "Unknown time";
        const attDateStr = (0, absence_1.formatSydneyAttendanceDate)(attendanceDate, classDay);
        const studentName = `${(_a = studentData.firstName) !== null && _a !== void 0 ? _a : ""} ${(_b = studentData.lastName) !== null && _b !== void 0 ? _b : ""}`.trim() || studentId;
        transaction.update(attendanceRef, {
            attendance: firestore_2.FieldValue.arrayRemove(studentId),
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
            updatedBy: parentId,
            notificationAction: {
                type: "notify_absence",
                studentId,
                parentId,
            },
        });
        if (tokenAwarded) {
            transaction.update(parentRef, {
                lessonTokens: firestore_2.FieldValue.increment(1),
            });
        }
        return {
            didRemoveStudent: true,
            tokenAwarded,
            classDay,
            classTime,
            attDateStr,
            studentName,
        };
    });
    if (result.didRemoveStudent) {
        try {
            const tokens = await (0, shared_1.getAdminTokens)();
            if (tokens.length) {
                await sendAdminStudentAbsentNotification({
                    tokens,
                    classId,
                    studentId,
                    studentName: result.studentName,
                    classDay: result.classDay,
                    classTime: result.classTime,
                    attDateStr: result.attDateStr,
                });
            }
        }
        catch (error) {
            console.error("Error sending notify-absence admin notification:", error);
        }
        finally {
            try {
                await attendanceRef.update({
                    notificationAction: firestore_2.FieldValue.delete(),
                });
            }
            catch (error) {
                console.error("Error clearing notify-absence notification action:", error);
            }
        }
    }
    return {
        tokenAwarded: result.tokenAwarded,
        alreadyAbsent: !result.didRemoveStudent,
    };
});
exports.onAttendanceChangeNotifyAdmins = (0, firestore_1.onDocumentUpdated)("classes/{classId}/attendance/{attendanceId}", async (event) => {
    var _a, _b, _c, _d, _e, _f;
    if (!((_a = event.data) === null || _a === void 0 ? void 0 : _a.before) || !((_b = event.data) === null || _b === void 0 ? void 0 : _b.after))
        return;
    const beforeAttendance = event.data.before.data().attendance || [];
    const afterAttendance = event.data.after.data().attendance || [];
    const notificationAction = event.data.after.data().notificationAction;
    const addedStudentIds = (0, attendance_action_1.attendanceAddedStudentIdsForNotification)(beforeAttendance, afterAttendance, notificationAction);
    const removedStudentIds = (0, attendance_action_1.attendanceRemovedStudentIdsForNotification)(beforeAttendance, afterAttendance, notificationAction);
    if (!addedStudentIds.length && !removedStudentIds.length)
        return;
    const db = (0, firestore_2.getFirestore)();
    const classId = event.params.classId;
    const classSnap = await db.collection("classes").doc(classId).get();
    if (!classSnap.exists)
        return;
    const classData = classSnap.data() || {};
    const classDay = classData.day || "Unknown day";
    const classTime = classData.startTime
        ? (0, shared_1.to12Hour)(classData.startTime)
        : "Unknown time";
    const attDate = (0, absence_1.timestampToDate)(event.data.after.data().date);
    const attDateStr = (0, absence_1.formatSydneyAttendanceDate)(attDate, classDay);
    const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
    if (adminsSnap.empty)
        return;
    let tokens = [];
    for (const adminDoc of adminsSnap.docs) {
        const uid = adminDoc.id;
        const tokensSnap = await db.collection("userTokens").doc(uid).collection("tokens").get();
        tokens.push(...tokensSnap.docs.map(d => d.data().token).filter(Boolean));
    }
    if (!tokens.length)
        return;
    for (const studentId of addedStudentIds) {
        const studentSnap = await db.collection("students").doc(studentId).get();
        const studentData = studentSnap.data() || {};
        const studentName = `${(_c = studentData.firstName) !== null && _c !== void 0 ? _c : ""} ${(_d = studentData.lastName) !== null && _d !== void 0 ? _d : ""}`.trim() || studentId;
        await sendAdminStudentAddedNotification({
            tokens,
            classId,
            studentId,
            studentName,
            classDay,
            classTime,
            attDateStr,
        });
    }
    for (const studentId of removedStudentIds) {
        const studentSnap = await db.collection("students").doc(studentId).get();
        const studentData = studentSnap.data() || {};
        const studentName = `${(_e = studentData.firstName) !== null && _e !== void 0 ? _e : ""} ${(_f = studentData.lastName) !== null && _f !== void 0 ? _f : ""}`.trim() || studentId;
        await sendAdminStudentAbsentNotification({
            tokens,
            classId,
            studentId,
            studentName,
            classDay,
            classTime,
            attDateStr,
        });
    }
});
//# sourceMappingURL=attendance.js.map