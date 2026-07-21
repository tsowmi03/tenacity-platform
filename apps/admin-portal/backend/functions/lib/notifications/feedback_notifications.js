"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onFeedbackCreated = void 0;
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const firestore_2 = require("firebase-functions/v2/firestore");
exports.onFeedbackCreated = (0, firestore_2.onDocumentCreated)("feedback/{feedbackId}", async (event) => {
    var _a, _b, _c;
    const db = (0, firestore_1.getFirestore)();
    const messaging = (0, messaging_1.getMessaging)();
    const feedbackId = event.params.feedbackId;
    const feedbackDoc = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!feedbackDoc) {
        console.error("Feedback document data is undefined");
        return;
    }
    const { studentId, subject } = feedbackDoc;
    if (!studentId) {
        console.error("Feedback document missing studentId");
        return;
    }
    // Fetch student doc
    const studentSnap = await db.collection("students").doc(studentId).get();
    if (!studentSnap.exists) {
        console.error(`Student document ${studentId} does not exist`);
        return;
    }
    const studentData = studentSnap.data() || {};
    const parents = Array.isArray(studentData.parents) ? studentData.parents : [];
    const studentName = `${(_b = studentData.firstName) !== null && _b !== void 0 ? _b : ""} ${(_c = studentData.lastName) !== null && _c !== void 0 ? _c : ""}`.trim() || "Your child";
    if (!parents.length) {
        console.log(`No parents array for student ${studentId}`);
        return;
    }
    // Helper: fetch tokens for a parentId
    async function getParentTokens(parentId) {
        const tokensSnap = await db
            .collection("userTokens")
            .doc(parentId)
            .collection("tokens")
            .get();
        return tokensSnap.docs.map(doc => doc.data().token).filter(Boolean);
    }
    // Send notification to each parent's devices
    for (const parentId of parents) {
        let tokens;
        try {
            tokens = await getParentTokens(parentId);
        }
        catch (err) {
            console.error(`Failed to fetch tokens for parent ${parentId}:`, err);
            continue;
        }
        if (!tokens.length) {
            console.log(`No tokens for parent ${parentId}`);
            continue;
        }
        let notifBody;
        if (typeof subject === "string" && subject.length) {
            notifBody = subject.length > 80 ? subject.slice(0, 77) + "..." : subject;
        }
        else {
            notifBody = "You have new feedback for your child.";
        }
        const msg = {
            notification: {
                title: `New Feedback for ${studentName}`,
                body: notifBody,
            },
            data: {
                type: "feedback",
                studentId: studentId,
                feedbackId: feedbackId,
            },
            tokens,
        };
        try {
            const res = await messaging.sendEachForMulticast(msg);
            console.log(`Feedback notification sent to parent ${parentId}: success=${res.successCount}, failure=${res.failureCount}, tokensCount=${tokens.length}`);
            if (res.failureCount > 0) {
                res.responses.forEach((r, i) => {
                    if (!r.success)
                        console.error("Failed token:", tokens[i], r.error);
                });
            }
        }
        catch (err) {
            console.error(`Error sending notification to parent ${parentId}:`, err);
        }
    }
});
//# sourceMappingURL=feedback_notifications.js.map