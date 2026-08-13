"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dryRunCurrentTermInvoices = exports.deleteUserByUidV2 = exports.rolloverTermData = void 0;
const admin = require("firebase-admin");
const https_1 = require("firebase-functions/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_2 = require("firebase-functions/v2/https");
const luxon_1 = require("luxon");
const class_schedule_dates_1 = require("./class_schedule_dates");
const chatCleanup_1 = require("../src/chats/chatCleanup");
// import { v4 as uuid } from "uuid";
const db = admin.firestore();
// Helper: Pre-generate attendance docs for a class for a given term.
async function generateAttendanceDocsForTerm(classModel, term) {
    const classRef = admin.firestore().collection('classes').doc(classModel.id);
    const attendanceColl = classRef.collection('attendance');
    const termStart = term.startDate.toDate();
    for (let w = 1; w <= term.weeksNum; w++) {
        // Create doc ID in format "YYYY_TN_WN"
        const attendanceDocId = `${term.id}_W${w}`;
        const sessionDate = (0, class_schedule_dates_1.classSessionDateForWeek)({
            termStart,
            classDay: classModel.day,
            startTime: classModel.startTime,
            weekNumber: w,
        });
        const newAttendance = {
            id: attendanceDocId,
            termId: term.id,
            // `weekNum`, not `weekNumber`. The mobile app's Attendance model
            // reads `weekNum` and silently defaults to 0 when it is absent, and
            // the timetable queries the field directly. This function wrote
            // `weekNumber` for every term rollover, which left roughly half of
            // all attendance documents invisible to those queries while looking
            // fine in the console. `src/classes/attendanceFactory.js` — the
            // class-creation path — has always written `weekNum`.
            weekNum: w,
            date: admin.firestore.Timestamp.fromDate(sessionDate),
            updatedAt: admin.firestore.Timestamp.now(),
            updatedBy: 'system',
            // Pre-fill with permanently enrolled students.
            attendance: classModel.enrolledStudents || [],
            tutors: classModel.tutors || [],
        };
        await attendanceColl.doc(attendanceDocId).set(newAttendance);
    }
}
// Cloud Function that runs daily at 00:05.
exports.rolloverTermData = (0, scheduler_1.onSchedule)({
    schedule: "every day 00:05",
    timeZone: class_schedule_dates_1.SYDNEY_TZ,
}, async (context) => {
    const db = admin.firestore();
    const nowSydney = luxon_1.DateTime.now().setZone(class_schedule_dates_1.SYDNEY_TZ);
    // Define a window for "yesterday" – the day the term ended.
    const yesterdaySydney = nowSydney.minus({ days: 1 }).startOf("day");
    const tomorrowSydney = yesterdaySydney.plus({ days: 1 });
    const yesterday = yesterdaySydney.toUTC().toJSDate();
    const tomorrow = tomorrowSydney.toUTC().toJSDate();
    try {
        // 1. Find the term that ended yesterday.
        const endedTermQuery = await db.collection('terms')
            .where('endDate', '>=', admin.firestore.Timestamp.fromDate(yesterday))
            .where('endDate', '<', admin.firestore.Timestamp.fromDate(tomorrow))
            .get();
        if (endedTermQuery.empty) {
            console.log("No term ended yesterday. Exiting.");
            return;
        }
        let endedTerm;
        endedTermQuery.forEach(doc => {
            endedTerm = Object.assign({ id: doc.id }, doc.data());
        });
        // 2. Mark the ended term as inactive.
        await db.collection('terms').doc(endedTerm.id).update({ status: 'inactive' });
        console.log(`Term ${endedTerm.id} marked as inactive.`);
        // 3. Find the next term.
        // query for the term with the earliest startDate that is greater than the ended term's endDate.
        const newTermQuery = await db.collection('terms')
            .where('startDate', '>', endedTerm.endDate)
            .orderBy('startDate', 'asc')
            .limit(1)
            .get();
        if (newTermQuery.empty) {
            console.log("No new term found.");
            return;
        }
        let newTerm;
        newTermQuery.forEach(doc => {
            newTerm = Object.assign({ id: doc.id }, doc.data());
        });
        // 4. Mark the status for the new term.
        await db.collection('terms').doc(newTerm.id).update({ status: "active" });
        console.log(`Term ${newTerm.id} marked as "active".`);
        // 5. For each class, generate attendance docs for the new term.
        const classesSnapshot = await db.collection('classes').get();
        const promises = [];
        classesSnapshot.forEach(doc => {
            const classData = doc.data();
            promises.push(generateAttendanceDocsForTerm(Object.assign({ id: doc.id }, classData), newTerm));
        });
        await Promise.all(promises);
        console.log("Attendance docs generated for new term on all classes.");
        return;
    }
    catch (error) {
        console.error("Error during term rollover:", error);
        throw new Error("Term rollover failed");
    }
});
/**
 * Delete a user's Firebase Auth record, and clean up the chats they leave
 * behind.
 *
 * Reached from two mobile flows, both of which delete `users/{uid}` on the
 * client first and then call this:
 *   - an admin removing someone (`fullyRemoveParentAndStudents` /
 *     `fullyRemoveTutorOrAdmin`), and
 *   - a user deleting their own account (`deleteCurrentAccount`).
 *
 * The chat cleanup is here rather than only in `adminDeleteUser` because
 * neither of those flows goes anywhere near `adminDeleteUser` — the app never
 * calls it. Without this, every deletion made through the app kept recreating
 * exactly the orphaned "Unknown User" threads that cleanup was meant to end.
 * Self-service deletion cannot route through `adminDeleteUser` at all: that one
 * requires an admin claim and explicitly refuses to let a caller delete
 * themselves.
 *
 * `deleteHistory` is false here, unconditionally. The client has already
 * removed the user document by this point, so `visibility` cannot be read —
 * and deactivating (hide the thread, keep the messages) is the right default
 * for a real person regardless.
 */
// 512MiB, not the 256MiB default. This used to make a single Auth call and
// nothing else; it now also queries and rewrites the user's chats. The shared
// lib/index.js entrypoint already costs ~200MiB before the handler runs, so the
// default left ~56MiB — the same margin that OOM-killed four other functions on
// 13 Aug 2026. An OOM here would be particularly bad: the Auth record is
// deleted first, so a kill mid-cleanup strands exactly the orphaned threads
// this function exists to prevent.
exports.deleteUserByUidV2 = (0, https_1.onCall)({ memory: "512MiB" }, async (request) => {
    var _a, _b, _c;
    const { uid } = request.data || {};
    const callerUid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    console.log(`[deleteUserByUidV2] Request received for uid: ${uid}`);
    if (!callerUid) {
        throw new https_2.HttpsError("unauthenticated", "You must be signed in to delete an account.");
    }
    if (!uid || typeof uid !== "string") {
        throw new https_2.HttpsError("invalid-argument", "Missing uid");
    }
    // Previously this had no authorization check whatsoever: any caller could
    // pass any uid and destroy that person's sign-in. The two legitimate
    // callers are an admin removing someone, and a user removing themselves.
    const isSelf = uid === callerUid;
    const isAdmin = ((_c = (_b = request.auth) === null || _b === void 0 ? void 0 : _b.token) === null || _c === void 0 ? void 0 : _c.role) === "admin";
    if (!isSelf && !isAdmin) {
        console.error(`[deleteUserByUidV2] Refused: ${callerUid} may not delete ${uid}`);
        throw new https_2.HttpsError("permission-denied", "You may only delete your own account.");
    }
    try {
        console.log(`[deleteUserByUidV2] Attempting to delete user with uid: ${uid}`);
        await admin.auth().deleteUser(uid);
        console.log(`[deleteUserByUidV2] Successfully deleted user with uid: ${uid}`);
    }
    catch (error) {
        console.error(`[deleteUserByUidV2] Error deleting user with uid: ${uid}`, error);
        throw new https_2.HttpsError("internal", error.message || "Failed to delete user");
    }
    // After the account is gone, never before: a failure here leaves orphaned
    // threads, which scripts/purgeOrphanedChats.js repairs. The reverse order
    // would hide a live user's conversations if the auth delete then failed.
    let chatCleanup = { chatsDeleted: 0, chatsDeactivated: 0, chatsPruned: 0 };
    try {
        chatCleanup = await (0, chatCleanup_1.applyChatCleanupForUser)({
            db: admin.firestore(),
            fieldValue: admin.firestore.FieldValue,
            uid,
            deleteHistory: false,
            timestamp: admin.firestore.Timestamp.now(),
        });
        console.log(`[deleteUserByUidV2] Chat cleanup for ${uid}:`, chatCleanup);
    }
    catch (error) {
        // Best-effort: the account is already deleted, so failing the whole call
        // would misreport a completed deletion as a failure.
        console.error(`[deleteUserByUidV2] Chat cleanup failed for uid: ${uid}`, error);
    }
    return Object.assign({ success: true }, chatCleanup);
});
// export const generateTermInvoices = onSchedule(
//   { schedule: "every day 09:00" },
//   async (context) => {
//     const now = new Date();
//     // 1. Find the current active term whose startDate has commenced and invoices not generated
//     const termSnap = await db
//       .collection("terms")
//       .where("status", "==", "active")
//       .where("startDate", "<=", admin.firestore.Timestamp.fromDate(now))
//       .where("invoicesGeneratedAt", "==", null)
//       .limit(1)
//       .get();
//     if (termSnap.empty) {
//       console.log("[generateTermInvoices] No eligible term found (either not started or invoices already generated).");
//       return;
//     }
//     const termDoc = termSnap.docs[0];
//     const termId = termDoc.id;
//     const term = termDoc.data()!;
//     const weeks = term.weeksNum as number;
//     const termStart = term.startDate.toDate();
//     const nowTs = admin.firestore.Timestamp.now();
//     // 1) Load all classes for this term
//     const classesSnap = await db
//       .collection("classes")
//       .get();
//     // 2) Build up a per-parent invoice payload
//     type LineItem = {
//       description: string;
//       quantity:    number;
//       unitAmount:  number;
//       lineTotal:   number;
//     };
//     type Payload = {
//       parentId:    string;
//       parentName:  string;
//       parentEmail: string;
//       lineItems:   LineItem[];
//     };
//     const invoicesByParent = new Map<string, Payload>();
//     for (const clsDoc of classesSnap.docs) {
//       const clsData = clsDoc.data() as any;
//       const className = clsData.type || "Class";
//       const enrolledStudents: string[] = clsData.enrolledStudents || [];
//       for (const studentId of enrolledStudents) {
//         // a) load student, derive grade & rate
//         const studentSnap = await db.collection("students").doc(studentId).get();
//         if (!studentSnap.exists) continue;
//         const student = studentSnap.data() as any;
//         const gradeNum = parseInt((student.grade||"").replace(/\D/g, ""), 10) || 0;
//         const baseRate = gradeNum >= 7 && gradeNum <= 12 ? 70 : 60;
//         // b) load parent (first in array)
//         const parentId = student.primaryParentId || (student.parents as string[])[0];
//         if (!parentId) continue;
//         const userSnap = await db.collection("users").doc(parentId).get();
//         if (!userSnap.exists) continue;
//         const user = userSnap.data() as any;
//         // c) init payload
//         if (!invoicesByParent.has(parentId)) {
//           invoicesByParent.set(parentId, {
//             parentId,
//             parentName:  `${user.firstName} ${user.lastName}`,
//             parentEmail: user.email,
//             lineItems:   [],
//           });
//         }
//         const payload = invoicesByParent.get(parentId)!;
//         // d) push one line item per class-session series
//         const subtotal = baseRate * weeks;
//         payload.lineItems.push({
//           description: `${student.firstName} ${student.lastName} — ${className}`,
//           quantity:    weeks,
//           unitAmount:  baseRate,
//           lineTotal:   subtotal,
//         });
//       }
//     }
//     // 3) Apply "second-lesson" discount: for every 2 full lines, −$10/session
//     for (const payload of invoicesByParent.values()) {
//       const fullCount = payload.lineItems.length;
//       const pairs     = Math.floor(fullCount / 2);
//       for (let i = 0; i < pairs; i++) {
//         const discLineTotal = -10 * weeks;
//         payload.lineItems.push({
//           description: "Second lesson discount",
//           quantity:    weeks,
//           unitAmount:  -10,
//           lineTotal:   discLineTotal,
//         });
//       }
//     }
//     // 4) Write each invoice doc
//     const batch = db.batch();
//     for (const p of invoicesByParent.values()) {
//       const invId   = uuid();
//       const amount  = p.lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
//       const dueDate = admin.firestore.Timestamp.fromDate(
//         new Date(termStart.getTime() + 21 * 24 * 60 * 60 * 1000)
//       );
//       const ref = db.collection("invoices").doc(invId);
//       batch.set(ref, {
//         parentId:    p.parentId,
//         parentName:  p.parentName,
//         parentEmail: p.parentEmail,
//         lineItems:   p.lineItems,
//         weeks:       weeks,
//         amountDue:   amount,
//         status:      "unpaid",
//         dueDate:     dueDate,
//         createdAt:   nowTs,
//         termId:      termId,
//       });
//     }
//     await batch.commit();
//     // 5. After successful invoice creation, mark invoices as generated for this term
//     await db.collection("terms").doc(termId).update({
//       invoicesGeneratedAt: nowTs,
//     });
//     console.log(`[generateTermInvoices] Invoices generated and marked for term ${termId}.`);
//   }
// );
/**
 * Dry-run generator for the CURRENT active term.
 * Logs what invoices WOULD be created, but writes nothing.
 */
exports.dryRunCurrentTermInvoices = (0, https_2.onRequest)({}, async (_req, res) => {
    try {
        console.log("[dryRunCurrentTermInvoices] Starting dry run for current active term.");
        // 1) Grab the active term
        console.log("[dryRunCurrentTermInvoices] Fetching active term...");
        const termSnap = await db
            .collection("terms")
            .where("status", "==", "active")
            .limit(1)
            .get();
        if (termSnap.empty) {
            console.log("[dryRunCurrentTermInvoices] No active term found.");
            res.status(404).send("No active term found");
            return;
        }
        const termDoc = termSnap.docs[0];
        const termId = termDoc.id;
        const term = termDoc.data();
        const weeks = term.weeksNum;
        console.log(`[dryRunCurrentTermInvoices] Active term: ${termId}, weeks: ${weeks}`);
        // 2) Load all classes in that term
        console.log(`[dryRunCurrentTermInvoices] Fetching classes for term ${termId}...`);
        const classesSnap = await db
            .collection("classes")
            .get();
        console.log(`[dryRunCurrentTermInvoices] Found ${classesSnap.size} classes.`);
        const invoicesByParent = new Map();
        // 3) Build each parent's line items
        for (const clsDoc of classesSnap.docs) {
            const cls = clsDoc.data();
            const name = cls.type || clsDoc.id;
            console.log(`[dryRunCurrentTermInvoices] Processing class: ${name} (${clsDoc.id})`);
            for (const studentId of cls.enrolledStudents || []) {
                console.log(`[dryRunCurrentTermInvoices] Fetching student: ${studentId}`);
                const studentSnap = await db.collection("students").doc(studentId).get();
                if (!studentSnap.exists) {
                    console.log(`[dryRunCurrentTermInvoices] Student ${studentId} not found, skipping.`);
                    continue;
                }
                const student = studentSnap.data();
                const gradeNum = parseInt((student.grade || "").replace(/\D/g, ""), 10) || 0;
                const rate = gradeNum >= 7 && gradeNum <= 12 ? 70 : 60;
                const parentId = student.parents[0];
                if (!parentId) {
                    console.log(`[dryRunCurrentTermInvoices] No parent found for student ${studentId}, skipping.`);
                    continue;
                }
                console.log(`[dryRunCurrentTermInvoices] Fetching parent: ${parentId}`);
                const userSnap = await db.collection("users").doc(parentId).get();
                if (!userSnap.exists) {
                    console.log(`[dryRunCurrentTermInvoices] Parent ${parentId} not found, skipping.`);
                    continue;
                }
                const user = userSnap.data();
                if (!invoicesByParent.has(parentId)) {
                    invoicesByParent.set(parentId, {
                        parentId,
                        parentName: `${user.firstName} ${user.lastName}`,
                        parentEmail: user.email,
                        lineItems: [],
                    });
                    console.log(`[dryRunCurrentTermInvoices] Created invoice payload for parent: ${user.email}`);
                }
                const p = invoicesByParent.get(parentId);
                const subtotal = rate * weeks;
                p.lineItems.push({
                    description: `${student.firstName} ${student.lastName} — ${name}`,
                    quantity: weeks,
                    unitAmount: rate,
                    lineTotal: subtotal,
                });
                console.log(`[dryRunCurrentTermInvoices] Added line item for ${student.firstName} ${student.lastName} (${user.email}): $${subtotal}`);
            }
        }
        // 4) Apply second-lesson discount
        console.log("[dryRunCurrentTermInvoices] Applying second-lesson discounts...");
        for (const p of invoicesByParent.values()) {
            const pairs = Math.floor(p.lineItems.length / 2);
            for (let i = 0; i < pairs; i++) {
                p.lineItems.push({
                    description: "Second lesson discount",
                    quantity: weeks,
                    unitAmount: -10,
                    lineTotal: -10 * weeks,
                });
                console.log(`[dryRunCurrentTermInvoices] Applied second lesson discount for ${p.parentEmail}: -$${10 * weeks}`);
            }
        }
        // 5) Log what WOULD be written
        console.log("[dryRunCurrentTermInvoices] Final invoice preview:");
        const output = Array.from(invoicesByParent.values()).map(p => {
            const total = p.lineItems.reduce((s, li) => s + li.lineTotal, 0);
            console.log("[dryRunCurrentTermInvoices] Invoice for", p.parentEmail, JSON.stringify(p, null, 2));
            return {
                parentEmail: p.parentEmail,
                amountDue: total,
                lineItems: p.lineItems,
            };
        });
        res.status(200).json({ termId, count: output.length, invoices: output });
        console.log("[dryRunCurrentTermInvoices] Dry run complete.");
    }
    catch (err) {
        console.error("dryRunCurrentTermInvoices error:", err);
        res.status(500).send(err.message);
    }
});
//# sourceMappingURL=timetable_functions.js.map