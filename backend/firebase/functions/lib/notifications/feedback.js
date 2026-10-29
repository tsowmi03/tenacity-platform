"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onFeedbackResponded = exports.onFeedbackCreated = exports.createFeedback = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const feedback_action_1 = require("./feedback_action");
const send_1 = require("../../src/notifications/send");
function requiredString(data, key) {
    const value = data[key];
    if (typeof value !== "string" || value.trim() === "") {
        throw new https_1.HttpsError("invalid-argument", `Missing or invalid ${key}`);
    }
    return value.trim();
}
function studentParentIds(studentData) {
    return Array.isArray(studentData.parents)
        ? studentData.parents.filter((parentId) => typeof parentId === "string")
        : [];
}
function studentDisplayName(studentData) {
    var _a, _b;
    return `${(_a = studentData.firstName) !== null && _a !== void 0 ? _a : ""} ${(_b = studentData.lastName) !== null && _b !== void 0 ? _b : ""}`.trim() || "Your child";
}
async function userTokens(uid) {
    const tokensSnap = await (0, firestore_2.getFirestore)()
        .collection("userTokens")
        .doc(uid)
        .collection("tokens")
        .get();
    return tokensSnap.docs
        .map(doc => doc.data().token)
        .filter((token) => typeof token === "string" && token !== "");
}
async function sendFeedbackCreatedNotifications(feedbackId, feedbackDoc) {
    const db = (0, firestore_2.getFirestore)();
    const messaging = (0, messaging_1.getMessaging)();
    const studentId = feedbackDoc.studentId;
    if (typeof studentId !== "string" || studentId === "") {
        console.error("Feedback document missing studentId");
        return;
    }
    const studentSnap = await db.collection("students").doc(studentId).get();
    if (!studentSnap.exists) {
        console.error(`Student document ${studentId} does not exist`);
        return;
    }
    const studentData = studentSnap.data() || {};
    const parents = studentParentIds(studentData);
    const studentName = studentDisplayName(studentData);
    if (!parents.length) {
        console.log(`No parents array for student ${studentId}`);
        return;
    }
    for (const parentId of parents) {
        let tokens;
        try {
            tokens = await userTokens(parentId);
        }
        catch (err) {
            console.error(`Failed to fetch tokens for parent ${parentId}:`, err);
            continue;
        }
        if (!tokens.length) {
            console.log(`No tokens for parent ${parentId}`);
            continue;
        }
        try {
            await (0, send_1.sendAndRecord)({
                messaging,
                db: (0, firestore_2.getFirestore)(),
                recipients: [{ uid: parentId, role: "parent", tokens }],
                title: `New Feedback for ${studentName}`,
                body: (0, feedback_action_1.feedbackNotificationBody)(feedbackDoc.subject),
                data: {
                    type: "feedback",
                    studentId,
                    feedbackId,
                },
                source: "trigger:onFeedbackCreated",
                eventId: `feedback:${feedbackId}`,
                dedupeKey: `feedback:${feedbackId}:${parentId}`,
            });
        }
        catch (err) {
            console.error(`Error sending notification to parent ${parentId}:`, err);
        }
    }
}
exports.createFeedback = (0, https_1.onCall)(async (request) => {
    var _a;
    const requesterId = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!requesterId) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to create feedback.");
    }
    if (!request.data || typeof request.data !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Request data must be an object.");
    }
    const requestData = request.data;
    const studentId = requiredString(requestData, "studentId");
    const subject = requiredString(requestData, "subject");
    const feedback = requiredString(requestData, "feedback");
    const db = (0, firestore_2.getFirestore)();
    const actorRef = db.collection("users").doc(requesterId);
    const studentRef = db.collection("students").doc(studentId);
    const [actorSnap, studentSnap] = await Promise.all([
        actorRef.get(),
        studentRef.get(),
    ]);
    if (!actorSnap.exists) {
        throw new https_1.HttpsError("permission-denied", "User account not found.");
    }
    if (!studentSnap.exists) {
        throw new https_1.HttpsError("not-found", "Student not found.");
    }
    if (!(0, feedback_action_1.canCreateFeedback)(actorSnap.data() || {})) {
        throw new https_1.HttpsError("permission-denied", "You cannot create feedback.");
    }
    const studentData = studentSnap.data() || {};
    const feedbackRef = db.collection("feedback").doc();
    const feedbackDoc = {
        studentId,
        tutorId: requesterId,
        parentIds: studentParentIds(studentData),
        subject,
        feedback,
        createdAt: firestore_2.FieldValue.serverTimestamp(),
        isUnread: true,
        notificationAction: {
            type: "create_feedback",
            actorId: requesterId,
        },
    };
    await feedbackRef.set(feedbackDoc);
    try {
        await sendFeedbackCreatedNotifications(feedbackRef.id, feedbackDoc);
    }
    catch (error) {
        console.error("Error sending feedback notification:", error);
    }
    finally {
        try {
            await feedbackRef.update({
                notificationAction: firestore_2.FieldValue.delete(),
            });
        }
        catch (error) {
            console.error("Error clearing feedback notification action:", error);
        }
    }
    return {
        feedbackId: feedbackRef.id,
    };
});
exports.onFeedbackCreated = (0, firestore_1.onDocumentCreated)("feedback/{feedbackId}", async (event) => {
    var _a;
    const feedbackId = event.params.feedbackId;
    const feedbackDoc = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!feedbackDoc) {
        console.error("Feedback document data is undefined");
        return;
    }
    if ((0, feedback_action_1.shouldSuppressFeedbackCreatedNotification)(feedbackDoc.notificationAction))
        return;
    await sendFeedbackCreatedNotifications(feedbackId, feedbackDoc);
});
/**
 * MOB-52: tells the tutor who wrote a note that a parent asked a question or
 * left a comment on it. Runs on every feedback update — mostly read-state
 * changes — and returns early unless a new notifying response appeared.
 */
exports.onFeedbackResponded = (0, firestore_1.onDocumentUpdated)("feedback/{feedbackId}", async (event) => {
    var _a, _b, _c, _d;
    const feedbackId = event.params.feedbackId;
    const before = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before) === null || _b === void 0 ? void 0 : _b.data();
    const after = (_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.after) === null || _d === void 0 ? void 0 : _d.data();
    const responses = (0, feedback_action_1.responsesToNotify)(before, after);
    if (!responses.length)
        return;
    const tutorId = after.tutorId;
    if (typeof tutorId !== "string" || tutorId === "") {
        console.error(`Feedback ${feedbackId} has no tutorId to notify`);
        return;
    }
    const db = (0, firestore_2.getFirestore)();
    let studentName = "your student";
    if (typeof after.studentId === "string" && after.studentId !== "") {
        const studentSnap = await db.collection("students").doc(after.studentId).get();
        if (studentSnap.exists) {
            const firstName = (studentSnap.data() || {}).firstName;
            if (typeof firstName === "string" && firstName.trim() !== "")
                studentName = firstName.trim();
        }
    }
    let tokens;
    try {
        tokens = await userTokens(tutorId);
    }
    catch (err) {
        console.error(`Failed to fetch tokens for tutor ${tutorId}:`, err);
        return;
    }
    if (!tokens.length) {
        console.log(`No tokens for tutor ${tutorId}`);
        return;
    }
    for (const response of responses) {
        const verb = response.type === "question" ? "asked a question" : "commented";
        try {
            await (0, send_1.sendAndRecord)({
                messaging: (0, messaging_1.getMessaging)(),
                db,
                recipients: [{ uid: tutorId, role: "tutor", tokens }],
                title: `${response.parentName} ${verb} about ${studentName}`,
                body: (0, feedback_action_1.feedbackResponseNotificationBody)(response.text),
                // Same type as new feedback, so a tap opens the student's
                // feedback history where the response is shown.
                data: {
                    type: "feedback",
                    studentId: after.studentId,
                    feedbackId,
                },
                source: "trigger:onFeedbackResponded",
                eventId: `feedback-response:${feedbackId}:${response.parentId}`,
                dedupeKey: `feedback-response:${feedbackId}:${response.parentId}`,
            });
        }
        catch (err) {
            console.error(`Error notifying tutor ${tutorId} of a response on ${feedbackId}:`, err);
        }
    }
});
