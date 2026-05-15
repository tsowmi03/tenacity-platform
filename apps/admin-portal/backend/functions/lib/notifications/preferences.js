"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNotificationPreferenceEnabled = exports.isPreferenceEnabled = void 0;
const firestore_1 = require("firebase-admin/firestore");
const defaultNotificationPreferences = {
    spotOpened: true,
    lessonReminder: true,
};
function isPreferenceEnabled(settings, key) {
    const value = settings === null || settings === void 0 ? void 0 : settings[key];
    return typeof value === "boolean"
        ? value
        : defaultNotificationPreferences[key];
}
exports.isPreferenceEnabled = isPreferenceEnabled;
async function isNotificationPreferenceEnabled(userId, key) {
    const settingsSnap = await (0, firestore_1.getFirestore)()
        .collection("userSettings")
        .doc(userId)
        .get();
    return isPreferenceEnabled(settingsSnap.exists ? settingsSnap.data() : undefined, key);
}
exports.isNotificationPreferenceEnabled = isNotificationPreferenceEnabled;
//# sourceMappingURL=preferences.js.map