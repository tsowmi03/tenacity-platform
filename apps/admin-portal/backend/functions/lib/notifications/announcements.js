"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAnnouncementCreated = exports.createAnnouncement = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const announcement_action_1 = require("./announcement_action");
function requiredString(data, key) {
    const value = data[key];
    if (typeof value !== "string" || value.trim() === "") {
        throw new https_1.HttpsError("invalid-argument", `Missing or invalid ${key}`);
    }
    return value.trim();
}
function optionalBoolean(data, key, defaultValue) {
    const value = data[key];
    if (value == null)
        return defaultValue;
    if (typeof value === "boolean")
        return value;
    throw new https_1.HttpsError("invalid-argument", `Missing or invalid ${key}`);
}
async function announcementTokensForAudience(audience) {
    const db = (0, firestore_2.getFirestore)();
    const tokens = [];
    if (audience === "all") {
        const usersSnapshot = await db.collection("userTokens").get();
        for (const userDoc of usersSnapshot.docs) {
            const tokensSnapshot = await userDoc.ref.collection("tokens").get();
            tokensSnapshot.forEach((tokenDoc) => {
                const token = tokenDoc.data().token;
                if (typeof token === "string" && token)
                    tokens.push(token);
            });
        }
        return tokens;
    }
    const usersQuerySnapshot = await db
        .collection("users")
        .where("role", "==", audience)
        .get();
    if (usersQuerySnapshot.empty)
        return tokens;
    for (const userDoc of usersQuerySnapshot.docs) {
        const tokensSnapshot = await db
            .collection("userTokens")
            .doc(userDoc.id)
            .collection("tokens")
            .get();
        tokensSnapshot.forEach((tokenDoc) => {
            const token = tokenDoc.data().token;
            if (typeof token === "string" && token)
                tokens.push(token);
        });
    }
    return tokens;
}
async function sendAnnouncementCreatedNotification(announcementId, announcement) {
    var _a;
    const audience = (0, announcement_action_1.normalizeAnnouncementAudience)((_a = announcement.audience) !== null && _a !== void 0 ? _a : "all");
    const tokens = await announcementTokensForAudience(audience);
    if (!tokens.length)
        return;
    const message = {
        notification: {
            title: "New Announcement",
            body: (0, announcement_action_1.announcementNotificationBody)(announcement.title),
        },
        data: {
            type: "announcement",
            announcementId,
        },
        tokens,
    };
    const response = await (0, messaging_1.getMessaging)().sendEachForMulticast(message);
    console.log(`Successfully sent announcement messages: ${response.successCount}`);
    console.log(`Failed announcement messages: ${response.failureCount}`);
    if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
            if (!resp.success) {
                console.log("Failed to send announcement to token:", tokens[idx]);
                console.log("Error:", resp.error);
            }
        });
    }
}
exports.createAnnouncement = (0, https_1.onCall)(async (request) => {
    var _a;
    const requesterId = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!requesterId) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to create an announcement.");
    }
    if (!request.data || typeof request.data !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Request data must be an object.");
    }
    const requestData = request.data;
    const title = requiredString(requestData, "title");
    const body = requiredString(requestData, "body");
    const archived = optionalBoolean(requestData, "archived", false);
    const audience = (() => {
        var _a;
        try {
            return (0, announcement_action_1.normalizeAnnouncementAudience)((_a = requestData.audience) !== null && _a !== void 0 ? _a : "all");
        }
        catch (_b) {
            throw new https_1.HttpsError("invalid-argument", "Missing or invalid audience");
        }
    })();
    const db = (0, firestore_2.getFirestore)();
    const actorSnap = await db.collection("users").doc(requesterId).get();
    if (!actorSnap.exists) {
        throw new https_1.HttpsError("permission-denied", "User account not found.");
    }
    if (!(0, announcement_action_1.canCreateAnnouncement)(actorSnap.data() || {})) {
        throw new https_1.HttpsError("permission-denied", "You cannot create announcements.");
    }
    const announcementRef = db.collection("announcements").doc();
    const announcement = {
        title,
        body,
        archived,
        audience,
        createdAt: firestore_2.FieldValue.serverTimestamp(),
        createdBy: requesterId,
        notificationAction: {
            type: "create_announcement",
            actorId: requesterId,
        },
    };
    await announcementRef.set(announcement);
    try {
        await sendAnnouncementCreatedNotification(announcementRef.id, announcement);
    }
    catch (error) {
        console.error("Error sending announcement notification:", error);
    }
    finally {
        try {
            await announcementRef.update({
                notificationAction: firestore_2.FieldValue.delete(),
            });
        }
        catch (error) {
            console.error("Error clearing announcement notification action:", error);
        }
    }
    return {
        announcementId: announcementRef.id,
    };
});
exports.onAnnouncementCreated = (0, firestore_1.onDocumentCreated)("announcements/{announcementId}", async (event) => {
    var _a;
    const announcement = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!announcement) {
        console.error("Announcement data is undefined");
        return;
    }
    if ((0, announcement_action_1.shouldSuppressAnnouncementCreatedNotification)(announcement.notificationAction))
        return;
    try {
        await sendAnnouncementCreatedNotification(event.params.announcementId, announcement);
    }
    catch (error) {
        console.error("Error sending notifications:", error);
    }
});
//# sourceMappingURL=announcements.js.map