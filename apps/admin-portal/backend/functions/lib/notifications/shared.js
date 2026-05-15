"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWaitlistJoinedAdminNotification = exports.removeStudentFromFutureAttendanceDocs = exports.addStudentToFutureAttendanceDocs = exports.sendAdminPermanentEnrollmentNotification = exports.getAdminTokens = exports.to12Hour = void 0;
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const waitlist_action_1 = require("./waitlist_action");
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
async function getAdminTokens() {
    const db = (0, firestore_1.getFirestore)();
    const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
    if (adminsSnap.empty)
        return [];
    const tokens = [];
    for (const adminDoc of adminsSnap.docs) {
        const tokensSnap = await db
            .collection("userTokens")
            .doc(adminDoc.id)
            .collection("tokens")
            .get();
        tokens.push(...tokensSnap.docs.map(d => d.data().token).filter(Boolean));
    }
    return tokens;
}
exports.getAdminTokens = getAdminTokens;
async function sendAdminPermanentEnrollmentNotification(params) {
    const { tokens, classId, studentId, studentName, classDay, classTime } = params;
    const msg = {
        notification: {
            title: "Student Enrolled",
            body: `${studentName} has permanently enrolled for ${classDay} at ${classTime}.`,
        },
        data: {
            type: "student_enrolled",
            classId,
            studentId,
            enrolType: "permanent",
        },
        tokens,
    };
    await (0, messaging_1.getMessaging)().sendEachForMulticast(msg);
}
exports.sendAdminPermanentEnrollmentNotification = sendAdminPermanentEnrollmentNotification;
async function addStudentToFutureAttendanceDocs(params) {
    const { classId, studentId, updatedBy } = params;
    const db = (0, firestore_1.getFirestore)();
    const nowSydney = new Date().toLocaleDateString("en-CA", {
        timeZone: "Australia/Sydney",
    });
    const attendanceSnapshots = await db
        .collection("classes")
        .doc(classId)
        .collection("attendance")
        .get();
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
            await snap.ref.update({
                attendance: firestore_1.FieldValue.arrayUnion(studentId),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedBy,
            });
        }
    }
}
exports.addStudentToFutureAttendanceDocs = addStudentToFutureAttendanceDocs;
async function removeStudentFromFutureAttendanceDocs(params) {
    const { classId, studentId, updatedBy } = params;
    const db = (0, firestore_1.getFirestore)();
    const nowSydney = new Date().toLocaleDateString("en-CA", {
        timeZone: "Australia/Sydney",
    });
    const attendanceSnapshots = await db
        .collection("classes")
        .doc(classId)
        .collection("attendance")
        .get();
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
            await snap.ref.update({
                attendance: firestore_1.FieldValue.arrayRemove(studentId),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedBy,
            });
        }
    }
}
exports.removeStudentFromFutureAttendanceDocs = removeStudentFromFutureAttendanceDocs;
async function sendWaitlistJoinedAdminNotification(waitlistEntryId, waitlistEntry) {
    var _a, _b, _c, _d;
    if (waitlistEntry.status !== "active")
        return;
    const db = (0, firestore_1.getFirestore)();
    const messaging = (0, messaging_1.getMessaging)();
    const tokens = await getAdminTokens();
    if (!tokens.length)
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
    const msg = {
        notification: {
            title: "New Waitlist Request",
            body: `${studentName} joined the waitlist for ${classDay} at ${classTime} because the ${reason}.`,
        },
        data: {
            type: "waitlist_joined",
            waitlistEntryId,
            classId: classId !== null && classId !== void 0 ? classId : "",
            studentId: studentId !== null && studentId !== void 0 ? studentId : "",
            parentId: parentId !== null && parentId !== void 0 ? parentId : "",
            parentName,
        },
        tokens,
    };
    const response = await messaging.sendEachForMulticast(msg);
    console.log(`Sent waitlist notification for ${waitlistEntryId}: success=${response.successCount}, failure=${response.failureCount}`);
    if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
            if (!resp.success) {
                console.error("Failed waitlist notification token:", tokens[idx], resp.error);
            }
        });
    }
}
exports.sendWaitlistJoinedAdminNotification = sendWaitlistJoinedAdminNotification;
//# sourceMappingURL=shared.js.map