"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAttendanceChangeNotifyAdmins = exports.onPermanentEnrolmentNotifyAdmins = exports.onWaitlistEntryReactivatedNotifyAdmins = exports.onWaitlistEntryCreatedNotifyAdmins = exports.onPermanentSpotOpened = exports.invoiceReminderScheduler = exports.onFeedbackCreated = exports.dailyLessonAndShiftReminder = exports.invoiceCreatedNotif = exports.onMessageReceived = exports.onAnnouncementCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const messaging_1 = require("firebase-admin/messaging");
const firestore_2 = require("firebase-admin/firestore");
const luxon_1 = require("luxon");
function to12Hour(time24) {
    // Expects "HH:mm"
    const [h, m] = time24.split(":").map(Number);
    if (isNaN(h) || isNaN(m))
        return time24;
    const hour = ((h + 11) % 12) + 1;
    const ampm = h >= 12 ? "pm" : "am";
    return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}
async function getAdminTokens() {
    const db = (0, firestore_2.getFirestore)();
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
async function sendWaitlistJoinedAdminNotification(waitlistEntryId, waitlistEntry) {
    var _a, _b, _c, _d;
    if (waitlistEntry.status !== "active")
        return;
    const db = (0, firestore_2.getFirestore)();
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
    const classDay = waitlistEntry.dayOfWeek || "Unknown day";
    const classTime = waitlistEntry.startTime
        ? to12Hour(waitlistEntry.startTime)
        : "Unknown time";
    const reason = waitlistEntry.reason === "classFull" ? "class is full" : "class is not open yet";
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
// function formatDate(date: Date, day: string, time12: string): string {
//   // Example: "Friday 14 June, 6:00 pm"
//   const dt = DateTime.fromJSDate(date);
//   return `${day} ${dt.toFormat("d MMMM")}, ${time12}`;
// }
exports.onAnnouncementCreated = (0, firestore_1.onDocumentCreated)("announcements/{announcementId}", async (event) => {
    var _a;
    const announcement = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!announcement) {
        console.error("Announcement data is undefined");
        return;
    }
    const db = (0, firestore_2.getFirestore)();
    const messaging = (0, messaging_1.getMessaging)();
    try {
        const tokens = [];
        console.log("Announcement audience:", announcement.audience);
        if (announcement.audience === "all") {
            const usersSnapshot = await db.collection("userTokens").get();
            console.log(`Found ${usersSnapshot.docs.length} users in "userTokens" collection.`);
            for (const userDoc of usersSnapshot.docs) {
                console.log(`Checking tokens for user document: ${userDoc.id}`);
                const tokensSnapshot = await userDoc.ref.collection("tokens").get();
                console.log(`User ${userDoc.id} has ${tokensSnapshot.size} token(s).`);
                tokensSnapshot.forEach((tokenDoc) => {
                    const token = tokenDoc.data().token;
                    console.log(`Found token: ${token} for user ${userDoc.id}`);
                    tokens.push(token);
                });
            }
        }
        else {
            const usersQuerySnapshot = await db
                .collection("users")
                .where("role", "==", announcement.audience)
                .get();
            console.log(`Found ${usersQuerySnapshot.docs.length} user(s) in "users" collection for role ${announcement.audience}.`);
            if (usersQuerySnapshot.empty) {
                console.log("No users found for audience:", announcement.audience);
                return;
            }
            for (const userDoc of usersQuerySnapshot.docs) {
                const uid = userDoc.id;
                const userTokensDocRef = db.collection("userTokens").doc(uid);
                const userTokensSnap = await userTokensDocRef.get();
                if (!userTokensSnap.exists) {
                    console.log(`No token document found for user ${uid} in "userTokens".`);
                    continue;
                }
                const tokensSnapshot = await userTokensDocRef.collection("tokens").get();
                console.log(`User ${uid} has ${tokensSnapshot.size} token(s) in "tokens" collection.`);
                tokensSnapshot.forEach((tokenDoc) => {
                    const token = tokenDoc.data().token;
                    console.log(`Found token: ${token} for user ${uid}`);
                    tokens.push(token);
                });
            }
        }
        console.log(`Total tokens collected: ${tokens.length}`);
        if (tokens.length === 0) {
            console.log("No tokens to send to");
            return;
        }
        const message = {
            notification: {
                title: "New Announcement",
                body: announcement.title || "A new announcement has been posted",
            },
            data: {
                type: "announcement",
                announcementId: event.params.announcementId,
            },
            tokens: tokens,
        };
        const response = await messaging.sendEachForMulticast(message);
        console.log(`Successfully sent messages: ${response.successCount}`);
        console.log(`Failed messages: ${response.failureCount}`);
        if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    console.log("Failed to send to token:", tokens[idx]);
                    console.log("Error:", resp.error);
                }
            });
        }
    }
    catch (error) {
        console.error("Error sending notifications:", error);
    }
});
exports.onMessageReceived = (0, firestore_1.onDocumentCreated)("chats/{chatId}/messages/{messageId}", async (event) => {
    var _a, _b, _c, _d;
    const db = (0, firestore_2.getFirestore)();
    const messaging = (0, messaging_1.getMessaging)();
    // 1) Get the message data
    const messageData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!messageData) {
        console.error("Message data is undefined");
        return;
    }
    const { senderId, text = "", type } = messageData;
    // 2) Build preview
    const chatId = event.params.chatId;
    const msgId = event.params.messageId;
    const msgPreview = text || (type === "image" ? "[Image]" : "[Media]");
    // 3) Load chat participants
    const chatSnap = await db.collection("chats").doc(chatId).get();
    if (!chatSnap.exists) {
        console.error(`Chat document with ID ${chatId} does not exist`);
        return;
    }
    const participants = ((_b = chatSnap.data()) === null || _b === void 0 ? void 0 : _b.participants) || [];
    const recipientIds = participants.filter((id) => id !== senderId);
    if (recipientIds.length === 0) {
        console.log("No recipients found for this message");
        return;
    }
    // Fetch sender's first and last name for navigation
    const senderDoc = await db.collection("users").doc(senderId).get();
    const senderData = senderDoc.data() || {};
    const otherUserName = (`${((_c = senderData['firstName']) !== null && _c !== void 0 ? _c : '')} ${((_d = senderData['lastName']) !== null && _d !== void 0 ? _d : '')}`).trim() || "Unknown";
    // 4) Load user tokens
    const tokens = [];
    for (const recipientId of recipientIds) {
        const tokenSnap = await db
            .collection("userTokens")
            .doc(recipientId)
            .collection("tokens")
            .get();
        tokenSnap.forEach((tokenDoc) => {
            const token = tokenDoc.data().token;
            if (token) {
                tokens.push(token);
            }
        });
    }
    if (tokens.length === 0) {
        console.log("No tokens found for recipients");
        return;
    }
    // 5) Send notification
    const payload = {
        notification: {
            title: otherUserName,
            body: msgPreview.length > 100 ? msgPreview.substring(0, 97) + "..." : msgPreview,
        },
        data: {
            type: "chat_message",
            chatId: String(chatId),
            messageId: String(msgId),
            otherUserName: String(otherUserName),
        },
        tokens: tokens,
    };
    try {
        const response = await messaging.sendEachForMulticast(payload);
        console.log(`Successfully sent messages: ${response.successCount}`);
        response.responses.forEach((resp, idx) => {
            if (!resp.success) {
                console.log("Failed to send to token:", tokens[idx]);
                console.log("Error:", resp.error);
            }
        });
    }
    catch (error) {
        console.error("Error sending notifications:", error);
    }
});
exports.invoiceCreatedNotif = (0, firestore_1.onDocumentCreated)("invoices/{invoiceId}", async (event) => {
    var _a;
    const invoice = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!invoice)
        return console.error("No invoice data");
    const invoiceId = event.params.invoiceId;
    const parentId = invoice.parentId;
    const db = (0, firestore_2.getFirestore)();
    const messaging = (0, messaging_1.getMessaging)();
    // 1. Load the parent’s FCM tokens
    const tokensSnap = await db
        .collection("userTokens")
        .doc(parentId)
        .collection("tokens")
        .get();
    const tokens = tokensSnap.docs
        .map(doc => doc.data().token)
        .filter(token => !!token);
    if (tokens.length === 0) {
        console.log("No tokens for parent", parentId);
        return;
    }
    // 2. Build notification payload
    const msg = {
        notification: {
            title: "Your invoice is ready!",
            body: `Invoice for amount \$${invoice.amountDue.toFixed(2)}`,
        },
        data: {
            type: "invoice",
            invoiceId,
        },
        tokens,
    };
    // 3. Send it!
    const res = await messaging.sendEachForMulticast(msg);
    console.log(`Sent ${res.successCount}/${tokens.length} invoice notifications`);
    if (res.failureCount > 0) {
        res.responses.forEach((r, i) => {
            if (!r.success)
                console.error("Failed token:", tokens[i], r.error);
        });
    }
});
exports.dailyLessonAndShiftReminder = (0, scheduler_1.onSchedule)({ schedule: "0 9 * * *", timeZone: "Australia/Sydney" }, async (event) => {
    var _a, _b;
    console.log("dailyLessonAndShiftReminder triggered");
    const db = (0, firestore_2.getFirestore)();
    const messaging = (0, messaging_1.getMessaging)();
    const SYDNEY_TZ = "Australia/Sydney";
    const nowSydney = luxon_1.DateTime.now().setZone(SYDNEY_TZ);
    const startOfDaySydney = nowSydney.startOf("day");
    const startOfNextSydney = startOfDaySydney.plus({ days: 1 });
    const startOfDayUTC = startOfDaySydney.toUTC().toJSDate();
    const startOfNextUTC = startOfNextSydney.toUTC().toJSDate();
    const startOfDay = firestore_2.Timestamp.fromDate(startOfDayUTC);
    const startOfNext = firestore_2.Timestamp.fromDate(startOfNextUTC);
    console.log("Sydney start of day (local):", startOfDaySydney.toString());
    console.log("Sydney start of next day (local):", startOfNextSydney.toString());
    console.log("Corresponding UTC range:", startOfDayUTC, startOfNextUTC);
    // Fetch ALL attendance docs whose `date` is today
    const attSnaps = await db
        .collectionGroup("attendance")
        .where("date", ">=", startOfDay)
        .where("date", "<", startOfNext)
        .get();
    console.log(`Found ${attSnaps.docs.length} attendance documents for today`);
    // Helper: extract termId from attendance doc id (e.g., "2025_T3_W1" => "2025_T3")
    function getTermIdFromAttendanceId(attId) {
        // Matches "2025_T3_W1" or "2025_T3_W12" etc.
        const match = attId.match(/^([A-Za-z0-9]+_T\d+)/);
        return match ? match[1] : null;
    }
    // Cache for term startDates to avoid repeated Firestore reads
    const termStartCache = {};
    // Filter attendance docs: only keep those whose date >= term.startDate
    const filteredAttSnaps = [];
    for (const snap of attSnaps.docs) {
        const data = snap.data();
        const attId = data.id;
        const sessionDate = data.date.toDate();
        const termId = getTermIdFromAttendanceId(attId);
        if (!termId) {
            console.warn(`Could not extract termId from attendance id: ${attId}`);
            continue;
        }
        // Fetch and cache term startDate
        if (!termStartCache[termId]) {
            const termDoc = await db.collection("terms").doc(termId).get();
            if (!termDoc.exists) {
                console.warn(`No term doc for termId: ${termId}`);
                continue;
            }
            const termData = termDoc.data();
            if (!(termData === null || termData === void 0 ? void 0 : termData.startDate)) {
                console.warn(`No startDate for termId: ${termId}`);
                continue;
            }
            termStartCache[termId] = termData.startDate.toDate();
        }
        const termStart = termStartCache[termId];
        if (sessionDate >= termStart) {
            filteredAttSnaps.push(snap);
        }
        else {
            console.log(`Skipping attendance ${attId}: sessionDate ${sessionDate} < termStart ${termStart}`);
        }
    }
    // Helper: extract classId from attendance doc ref path
    function getClassIdFromAttendanceSnap(snap) {
        // path: classes/{classId}/attendance/{attendanceId}
        const pathParts = snap.ref.path.split("/");
        const classIdx = pathParts.indexOf("classes");
        if (classIdx !== -1 && pathParts.length > classIdx + 1) {
            return pathParts[classIdx + 1];
        }
        return null;
    }
    const tutorMap = {};
    const parentMap = {};
    for (const snap of filteredAttSnaps) {
        const data = snap.data();
        console.log("Processing attendance document:", snap.id, data);
        const sessionDT = data.date.toDate();
        const tutorIds = Array.isArray(data.tutors) ? data.tutors : [];
        const studentIds = Array.isArray(data.attendance) ? data.attendance : [];
        console.log(`Tutor IDs for doc ${snap.id}:`, tutorIds);
        console.log(`Student IDs for doc ${snap.id}:`, studentIds);
        // Get classId from path and fetch class doc
        const classId = getClassIdFromAttendanceSnap(snap);
        let start = sessionDT;
        let end = new Date(sessionDT.getTime() + 60 * 60 * 1000); // fallback 1 hour
        if (classId) {
            const classDoc = await db.collection("classes").doc(classId).get();
            if (classDoc.exists) {
                const classData = classDoc.data() || {};
                const startTime = classData.startTime;
                const endTime = classData.endTime;
                if (startTime && endTime) {
                    // Use Luxon to build Sydney-local DateTime, then convert to JS Date
                    const sessionSydney = luxon_1.DateTime.fromJSDate(sessionDT, { zone: SYDNEY_TZ });
                    const [startH, startM] = startTime.split(":").map(Number);
                    const [endH, endM] = endTime.split(":").map(Number);
                    const startSydney = sessionSydney.set({ hour: startH, minute: startM, second: 0, millisecond: 0 });
                    let endSydney = sessionSydney.set({ hour: endH, minute: endM, second: 0, millisecond: 0 });
                    // If end is before start (overnight), add 1 day
                    if (endSydney <= startSydney)
                        endSydney = endSydney.plus({ days: 1 });
                    start = startSydney.toJSDate();
                    end = endSydney.toJSDate();
                }
            }
        }
        // Add sessions for all tutors
        tutorIds.forEach(tid => {
            (tutorMap[tid] = tutorMap[tid] || []).push({ start, end });
        });
        // Add sessions for all parents of students
        for (const sid of studentIds) {
            const stuDoc = await db.collection("students").doc(sid).get();
            if (!stuDoc.exists) {
                console.log(`Student doc ${sid} does not exist, skipping`);
                continue;
            }
            const stu = stuDoc.data() || {};
            const childNm = `${(_a = stu.firstName) !== null && _a !== void 0 ? _a : ""} ${(_b = stu.lastName) !== null && _b !== void 0 ? _b : ""}`.trim() || "Your child";
            const parentIds = Array.isArray(stu.parents) ? stu.parents : [];
            if (!parentIds.length) {
                console.log(`Student ${sid} has no parents array or it is empty, skipping`);
                continue;
            }
            parentIds.forEach(pId => {
                (parentMap[pId] = parentMap[pId] || []).push({ start, end, childName: childNm });
            });
        }
    }
    console.log("Populated tutorMap:", tutorMap);
    console.log("Populated parentMap:", parentMap);
    //Helper to fetch FCM tokens
    async function getTokens(uid) {
        const tokSnap = await db.collection("userTokens").doc(uid).collection("tokens").get();
        const tokens = tokSnap.docs.map(d => d.data().token).filter(Boolean);
        console.log(`Fetched tokens for user ${uid}:`, tokens);
        return tokens;
    }
    //SEND ‑‑ Tutors  (shift window)
    for (const [tutorId, sessions] of Object.entries(tutorMap)) {
        const tokens = await getTokens(tutorId);
        if (!tokens.length) {
            console.log(`No tokens for tutor ${tutorId}, skipping notification`);
            continue;
        }
        const sorted = sessions.sort((a, b) => a.start.getTime() - b.start.getTime());
        const first = sorted[0].start;
        const lastEnd = sorted[sorted.length - 1].end;
        const fmt = (d) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });
        console.log(`Sending shift reminder to tutor ${tutorId} for shift ${fmt(first)}–${fmt(lastEnd)} with tokens:`, tokens);
        const msg = {
            notification: {
                title: "You have a shift tonight!",
                body: `You’re tutoring from ${fmt(first)}–${fmt(lastEnd)}.`,
            },
            data: { type: "shift_reminder" },
            tokens,
        };
        const res = await messaging.sendEachForMulticast(msg);
        console.log(`Sent shift reminder to tutor ${tutorId}: success=${res.successCount}, failure=${res.failureCount}, tokensCount=${tokens.length}`);
    }
    //SEND ‑‑ Parents (lesson per child)
    for (const [parentId, sessions] of Object.entries(parentMap)) {
        // check userSettings
        const settingsSnap = await db.collection("userSettings").doc(parentId).get();
        if (!settingsSnap.exists) {
            const settings = settingsSnap.data() || {};
            if (settings.lessonReminder == false) {
                console.log(`Skipping lesson reminder for parent ${parentId} due to userSettings`);
                continue;
            }
        }
        const tokens = await getTokens(parentId);
        if (!tokens.length)
            continue;
        // 1) Group all sessions by child
        const byChild = {};
        sessions.forEach(({ start, end, childName }) => {
            (byChild[childName] || (byChild[childName] = [])).push({ start, end });
        });
        const allRanges = [];
        // 2) For each child, collapse their own back-to-back slots
        for (const [child, ranges] of Object.entries(byChild)) {
            const sorted = ranges.sort((a, b) => a.start.getTime() - b.start.getTime());
            let curStart = sorted[0].start, curEnd = sorted[0].end;
            for (let i = 1; i < sorted.length; i++) {
                const next = sorted[i];
                if (next.start.getTime() <= curEnd.getTime()) {
                    curEnd = new Date(Math.max(curEnd.getTime(), next.end.getTime()));
                }
                else {
                    allRanges.push({ start: curStart, end: curEnd, children: new Set([child]) });
                    curStart = next.start;
                    curEnd = next.end;
                }
            }
            allRanges.push({ start: curStart, end: curEnd, children: new Set([child]) });
        }
        // 3) Merge ranges that have identical [start, end]
        const mergedMap = new Map();
        allRanges.forEach(r => {
            const key = `${r.start.getTime()}-${r.end.getTime()}`;
            if (!mergedMap.has(key)) {
                mergedMap.set(key, { start: r.start, end: r.end, children: new Set() });
            }
            r.children.forEach(c => mergedMap.get(key).children.add(c));
        });
        // 4) Sort and format
        const fmtOpts = {
            hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney"
        };
        const lines = Array.from(mergedMap.values())
            .sort((a, b) => a.start.getTime() - b.start.getTime())
            .map(r => {
            const names = Array.from(r.children).sort().join(" and ");
            const from = r.start.toLocaleTimeString("en-AU", fmtOpts);
            const to = r.end.toLocaleTimeString("en-AU", fmtOpts);
            return `${names} ${from}–${to}`;
        });
        console.log(`Sending lesson reminder to parent ${parentId} with:`, lines);
        const msg = {
            notification: {
                title: "You have a lesson tonight!",
                body: lines.join("; "),
            },
            data: { type: "lesson_reminder" },
            tokens,
        };
        await messaging.sendEachForMulticast(msg);
    }
    console.log(`Daily reminders sent: tutors=${Object.keys(tutorMap).length}, parents=${Object.keys(parentMap).length}`);
});
exports.onFeedbackCreated = (0, firestore_1.onDocumentCreated)("feedback/{feedbackId}", async (event) => {
    var _a, _b, _c;
    const db = (0, firestore_2.getFirestore)();
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
exports.invoiceReminderScheduler = (0, scheduler_1.onSchedule)({ schedule: "0 10 * * *", timeZone: "Australia/Sydney" }, // 10am daily
async (event) => {
    var _a, _b, _c, _d, _e, _f;
    const db = (0, firestore_2.getFirestore)();
    const messaging = (0, messaging_1.getMessaging)();
    const today = luxon_1.DateTime.now().setZone("Australia/Sydney").startOf("day");
    // 1. Query all open/unpaid invoices
    const invoicesSnap = await db
        .collection("invoices")
        .where("status", "in", ["unpaid", "overdue"])
        .get();
    for (const doc of invoicesSnap.docs) {
        const invoice = doc.data();
        const invoiceId = doc.id;
        const parentId = invoice.parentId;
        if (!parentId || !invoice.dueDate)
            continue;
        // Convert Firestore Timestamp to Luxon DateTime
        const dueDate = luxon_1.DateTime.fromJSDate(invoice.dueDate.toDate(), { zone: "Australia/Sydney" }).startOf("day");
        const daysUntilDue = Math.floor(dueDate.diff(today, "days").days);
        const daysOverdue = Math.floor(today.diff(dueDate, "days").days);
        let shouldSend = false;
        let notifTitle = "";
        let notifBody = "";
        if (daysUntilDue === 7) {
            shouldSend = true;
            notifTitle = "Invoice due in 1 week";
            notifBody = `Your invoice for \$${(_b = (_a = invoice.amountDue) === null || _a === void 0 ? void 0 : _a.toFixed(2)) !== null && _b !== void 0 ? _b : ""} is due on ${dueDate.toFormat("d MMM yyyy")}.`;
        }
        else if (daysUntilDue === 0) {
            shouldSend = true;
            notifTitle = "Invoice due today";
            notifBody = `Your invoice for \$${(_d = (_c = invoice.amountDue) === null || _c === void 0 ? void 0 : _c.toFixed(2)) !== null && _d !== void 0 ? _d : ""} is due today.`;
        }
        else if (daysOverdue > 0 && daysOverdue % 7 === 0) {
            shouldSend = true;
            notifTitle = "Invoice overdue";
            notifBody = `Your invoice for \$${(_f = (_e = invoice.amountDue) === null || _e === void 0 ? void 0 : _e.toFixed(2)) !== null && _f !== void 0 ? _f : ""} is overdue by ${daysOverdue} day(s).`;
        }
        if (!shouldSend)
            continue;
        // Fetch parent tokens
        const tokensSnap = await db
            .collection("userTokens")
            .doc(parentId)
            .collection("tokens")
            .get();
        const tokens = tokensSnap.docs.map(d => d.data().token).filter(Boolean);
        if (!tokens.length)
            continue;
        const msg = {
            notification: {
                title: notifTitle,
                body: notifBody,
            },
            data: {
                type: "invoice_reminder",
                invoiceId,
            },
            tokens,
        };
        try {
            const res = await messaging.sendEachForMulticast(msg);
            console.log(`Invoice reminder sent to parent ${parentId} for invoice ${invoiceId}: success=${res.successCount}, failure=${res.failureCount}`);
            if (res.failureCount > 0) {
                res.responses.forEach((r, i) => {
                    if (!r.success)
                        console.error("Failed token:", tokens[i], r.error);
                });
            }
        }
        catch (err) {
            console.error(`Error sending invoice reminder to parent ${parentId}:`, err);
        }
    }
});
// export const onAttendanceCancellation = onDocumentUpdated(
//   "classes/{classId}/attendance/{attendanceId}",
//   async (event) => {
//     // 1) Fetch before/after arrays
//     if (!event.data || !event.data.before || !event.data.after) {
//       console.error("event.data, event.data.before, or event.data.after is undefined");
//       return;
//     }
//     const before = event.data.before.data().attendance as string[] || [];
//     const after  = event.data.after.data().attendance as string[] || [];
//     // 2) Only fire on a removal
//     if (after.length >= before.length) {
//       console.log("No cancellations detected, skipping notification");
//       return;
//     }
//     const classId = event.params.classId;
//     const db      = getFirestore();
//     const msgSvc  = getMessaging();
//     const removed = before.filter(id => !after.includes(id));
//     if (removed.length) {
//       const justRemoved = removed[0];
//       const classSnap = await db.collection("classes").doc(classId).get();
//       const enrolled: string[] = classSnap.data()?.enrolledStudents || [];
//       if (!enrolled.includes(justRemoved)) {
//         console.log(`Suppressing notification for ${justRemoved} for permanent unenrolment`);
//       }
//       return;
//     }
//     // 1. Load class info
//     const classSnap = await db.collection("classes").doc(classId).get();
//     const cd = classSnap.data() || {};
//     const day       = cd.day      as string || "a class day";
//     const startTime = cd.startTime as string || "?";
//     const startTime12 = to12Hour(startTime);
//     // 2. Get attendance date
//     const attDateRaw = event.data.after.data().date;
//     let attDate: Date | null = null;
//     if (attDateRaw && typeof attDateRaw.toDate === "function") {
//       attDate = attDateRaw.toDate();
//     } else if (attDateRaw instanceof Date) {
//       attDate = attDateRaw;
//     } else if (attDateRaw && attDateRaw._seconds) {
//       attDate = new Date(attDateRaw._seconds * 1000);
//     }
//     // 3. Only send if date is in the future
//     if (!attDate) {
//       console.log("Attendance date missing or invalid, skipping notification");
//       return;
//     }
//     const now = new Date();
//     if (attDate < now) {
//       console.log("Attendance date is in the past, skipping notification");
//       return;
//     }
//     // 4. Format date for notification
//     const dateStr = formatDate(attDate, day, startTime12);
//     // 5. Gather all parents’ tokens (as before)
//     const parentUsers = await db
//       .collection("users")
//       .where("role", "==", "parent")
//       .get();
//     if (parentUsers.empty) return;
//     const tokens: string[] = [];
//     for (const p of parentUsers.docs) {
//       const uid = p.id;
//       // Check userSettings for spotOpened
//       const settingsSnap = await db.collection("userSettings").doc(uid).get();
//       if (settingsSnap.exists) {
//         const settings = settingsSnap.data() || {};
//         if (settings.spotOpened === false) {
//           console.log(`Parent ${uid} has spot opened notifications disabled, skipping`);
//           continue;
//         }
//       }
//       const tsnap = await db
//         .collection("userTokens")
//         .doc(uid)
//         .collection("tokens")
//         .get();
//       tsnap.forEach(d => {
//         const t = d.data().token as string;
//         if (t) tokens.push(t);
//       });
//     }
//     if (!tokens.length) return;
//     // 6. Send notification
//     const multicast = {
//       notification: {
//         title: "Spot Opened!",
//         body: `A spot opened up for ${dateStr}.`,
//       },
//       data: { type: "cancellation", classId },
//       tokens,
//     };
//     const res = await msgSvc.sendEachForMulticast(multicast);
//     console.log(
//       `Sent ${res.successCount}/${tokens.length} cancellation notices`
//     );
//     if (res.failureCount > 0) {
//       res.responses.forEach((r, i) => {
//         if (!r.success) console.error("Failed token:", tokens[i], r.error);
//       });
//     }
//   }
// );
// export const onStudentEnrolmentNotifyAdmins = onDocumentUpdated(
//   "classes/{classId}/attendance/{attendanceId}",
//   async (event) => {
//     if (!event.data?.before || !event.data?.after) return;
//     const beforeAttendance = event.data.before.data().attendance as string[] || [];
//     const afterAttendance  = event.data.after.data().attendance as string[] || [];
//     // Only fire if a student was added to attendance
//     if (afterAttendance.length <= beforeAttendance.length) return;
//     const newStudentIds = afterAttendance.filter(id => !beforeAttendance.includes(id));
//     if (!newStudentIds.length) return;
//     const db = getFirestore();
//     const messaging = getMessaging();
//     const classId = event.params.classId;
//     // Fetch class doc and enrolledStudents
//     const classSnap = await db.collection("classes").doc(classId).get();
//     if (!classSnap.exists) return;
//     const classData = classSnap.data() || {};
//     const enrolledStudents: string[] = classData.enrolledStudents || [];
//     const classDay = classData.day || "Unknown day";
//     const classTime = classData.startTime
//       ? (() => {
//           const [h, m] = classData.startTime.split(":").map(Number);
//           const date = new Date();
//           date.setHours(h, m, 0, 0);
//           return date.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true });
//         })()
//       : "Unknown time";
//     const attDateRaw = event.data.after.data().date;
//     let attDate: Date | null = null;
//     if (attDateRaw && typeof attDateRaw.toDate === "function") {
//       attDate = attDateRaw.toDate();
//     } else if (attDateRaw instanceof Date) {
//       attDate = attDateRaw;
//     } else if (attDateRaw && attDateRaw._seconds) {
//       attDate = new Date(attDateRaw._seconds * 1000);
//     }
//     // Fetch all admin users
//     const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
//     if (adminsSnap.empty) return;
//     // Gather all admin tokens
//     let tokens: string[] = [];
//     for (const adminDoc of adminsSnap.docs) {
//       const uid = adminDoc.id;
//       const tokensSnap = await db.collection("userTokens").doc(uid).collection("tokens").get();
//       tokens.push(...tokensSnap.docs.map(d => d.data().token as string).filter(Boolean));
//     }
//     if (!tokens.length) return;
//     // For each new student, determine enrolment type and send notification
//     for (const studentId of newStudentIds) {
//       // Fetch student info
//       const studentSnap = await db.collection("students").doc(studentId).get();
//       const studentData = studentSnap.data() || {};
//       const studentName = `${studentData.firstName ?? ""} ${studentData.lastName ?? ""}`.trim() || studentId;
//       const isPermanent = enrolledStudents.includes(studentId);
//       const enrolType = isPermanent ? "permanently enrolled" : "one-off enrolled";
//       // Format notification body based on enrolment type
//       let notifBody: string;
//       if (isPermanent) {
//         notifBody = `${studentName} has permanently enrolled for ${classDay} at ${classTime}.`;
//       } else {
//         // Use the specific date for one-off
//         let oneOffDateStr = "";
//         if (attDate) {
//           const dt = DateTime.fromJSDate(attDate);
//           oneOffDateStr = `${dt.toFormat("cccc d LLLL")}, ${classTime}`;
//         } else {
//           oneOffDateStr = `${classDay} at ${classTime}`;
//         }
//         notifBody = `${studentName} has one-off enrolled for ${oneOffDateStr}.`;
//       }
//       const msg: MulticastMessage = {
//         notification: {
//           title: "Student Enrolled",
//           body: notifBody,
//         },
//         data: {
//           type: "student_enrolled",
//           classId,
//           studentId,
//           enrolType: isPermanent ? "permanent" : "one-off",
//         },
//         tokens,
//       };
//       const res = await messaging.sendEachForMulticast(msg);
//       console.log(
//         `Sent admin notification for ${studentName} (${enrolType}): success=${res.successCount}, failure=${res.failureCount}, tokensCount=${tokens.length}`
//       );
//       if (res.failureCount > 0) {
//         res.responses.forEach((r, i) => {
//           if (!r.success) console.error("Failed token:", tokens[i], r.error);
//         });
//       }
//     }
//   }
// );
exports.onPermanentSpotOpened = (0, firestore_1.onDocumentUpdated)("classes/{classId}", async (event) => {
    var _a, _b;
    // exit if no real change
    if (!((_a = event.data) === null || _a === void 0 ? void 0 : _a.before) || !((_b = event.data) === null || _b === void 0 ? void 0 : _b.after))
        return;
    // grab before/after enrolledStudents
    const beforeArr = event.data.before.data().enrolledStudents || [];
    const afterArr = event.data.after.data().enrolledStudents || [];
    // only proceed on a removal
    if (afterArr.length >= beforeArr.length)
        return;
    // load class info for notification
    const classData = event.data.after.data();
    const day = classData.day || "a class day";
    const startTime = classData.startTime || "?";
    const start12 = to12Hour(startTime);
    // build the message
    const title = "Permanent Spot Opened!";
    const body = `A permanent spot opened for ${day} at ${start12}.`;
    const db = (0, firestore_2.getFirestore)();
    const msgSvc = (0, messaging_1.getMessaging)();
    // gather parent tokens
    const parentsSnap = await db.collection("users")
        .where("role", "==", "parent")
        .get();
    if (parentsSnap.empty)
        return;
    const tokens = [];
    for (const p of parentsSnap.docs) {
        // respect their spotOpened setting
        const settings = (await db.collection("userSettings").doc(p.id).get()).data() || {};
        if (settings.spotOpened === false)
            continue;
        const tsnap = await db
            .collection("userTokens")
            .doc(p.id)
            .collection("tokens")
            .get();
        tsnap.forEach(d => {
            const t = d.data().token;
            if (t)
                tokens.push(t);
        });
    }
    if (!tokens.length)
        return;
    // send one multicast
    await msgSvc.sendEachForMulticast({
        notification: { title, body },
        data: { type: "permanent_spot", classId: event.params.classId },
        tokens,
    });
    console.log(`Sent permanent‐spot notification for class ${event.params.classId}`);
});
exports.onWaitlistEntryCreatedNotifyAdmins = (0, firestore_1.onDocumentCreated)("waitlistEntries/{waitlistEntryId}", async (event) => {
    var _a;
    const waitlistEntry = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!waitlistEntry)
        return;
    await sendWaitlistJoinedAdminNotification(event.params.waitlistEntryId, waitlistEntry);
});
exports.onWaitlistEntryReactivatedNotifyAdmins = (0, firestore_1.onDocumentUpdated)("waitlistEntries/{waitlistEntryId}", async (event) => {
    var _a, _b;
    if (!((_a = event.data) === null || _a === void 0 ? void 0 : _a.before) || !((_b = event.data) === null || _b === void 0 ? void 0 : _b.after))
        return;
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status === "active" || after.status !== "active")
        return;
    await sendWaitlistJoinedAdminNotification(event.params.waitlistEntryId, after);
});
exports.onPermanentEnrolmentNotifyAdmins = (0, firestore_1.onDocumentUpdated)("classes/{classId}", async (event) => {
    var _a, _b, _c, _d;
    if (!((_a = event.data) === null || _a === void 0 ? void 0 : _a.before) || !((_b = event.data) === null || _b === void 0 ? void 0 : _b.after))
        return;
    const beforeArr = event.data.before.data().enrolledStudents || [];
    const afterArr = event.data.after.data().enrolledStudents || [];
    // Only proceed if a student was added
    if (afterArr.length <= beforeArr.length)
        return;
    const newStudentIds = afterArr.filter(id => !beforeArr.includes(id));
    if (!newStudentIds.length)
        return;
    const db = (0, firestore_2.getFirestore)();
    const messaging = (0, messaging_1.getMessaging)();
    const classId = event.params.classId;
    const classData = event.data.after.data();
    const classDay = classData.day || "Unknown day";
    const classTime = classData.startTime
        ? to12Hour(classData.startTime)
        : "Unknown time";
    // Fetch all admin users
    const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
    if (adminsSnap.empty)
        return;
    // Gather all admin tokens
    let tokens = [];
    for (const adminDoc of adminsSnap.docs) {
        const uid = adminDoc.id;
        const tokensSnap = await db.collection("userTokens").doc(uid).collection("tokens").get();
        tokens.push(...tokensSnap.docs.map(d => d.data().token).filter(Boolean));
    }
    if (!tokens.length)
        return;
    // For each new student, send notification
    for (const studentId of newStudentIds) {
        const studentSnap = await db.collection("students").doc(studentId).get();
        const studentData = studentSnap.data() || {};
        const studentName = `${(_c = studentData.firstName) !== null && _c !== void 0 ? _c : ""} ${(_d = studentData.lastName) !== null && _d !== void 0 ? _d : ""}`.trim() || studentId;
        const notifBody = `${studentName} has permanently enrolled for ${classDay} at ${classTime}.`;
        const msg = {
            notification: {
                title: "Student Enrolled",
                body: notifBody,
            },
            data: {
                type: "student_enrolled",
                classId,
                studentId,
                enrolType: "permanent",
            },
            tokens,
        };
        await messaging.sendEachForMulticast(msg);
    }
});
exports.onAttendanceChangeNotifyAdmins = (0, firestore_1.onDocumentUpdated)("classes/{classId}/attendance/{attendanceId}", async (event) => {
    var _a, _b, _c, _d, _e, _f;
    if (!((_a = event.data) === null || _a === void 0 ? void 0 : _a.before) || !((_b = event.data) === null || _b === void 0 ? void 0 : _b.after))
        return;
    const beforeAttendance = event.data.before.data().attendance || [];
    const afterAttendance = event.data.after.data().attendance || [];
    const addedStudentIds = afterAttendance.filter(id => !beforeAttendance.includes(id));
    const removedStudentIds = beforeAttendance.filter(id => !afterAttendance.includes(id));
    if (!addedStudentIds.length && !removedStudentIds.length)
        return;
    const db = (0, firestore_2.getFirestore)();
    const messaging = (0, messaging_1.getMessaging)();
    const classId = event.params.classId;
    // Fetch class info
    const classSnap = await db.collection("classes").doc(classId).get();
    if (!classSnap.exists)
        return;
    const classData = classSnap.data() || {};
    const classDay = classData.day || "Unknown day";
    const classTime = classData.startTime
        ? to12Hour(classData.startTime)
        : "Unknown time";
    const attDateRaw = event.data.after.data().date;
    let attDate = null;
    if (attDateRaw && typeof attDateRaw.toDate === "function") {
        attDate = attDateRaw.toDate();
    }
    else if (attDateRaw instanceof Date) {
        attDate = attDateRaw;
    }
    else if (attDateRaw && attDateRaw._seconds) {
        attDate = new Date(attDateRaw._seconds * 1000);
    }
    const attDateStr = attDate
        ? luxon_1.DateTime.fromJSDate(attDate).setZone("Australia/Sydney").toFormat("cccc d LLLL")
        : classDay;
    // Fetch all admin tokens
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
    // Notify for added students (booked)
    for (const studentId of addedStudentIds) {
        const studentSnap = await db.collection("students").doc(studentId).get();
        const studentData = studentSnap.data() || {};
        const studentName = `${(_c = studentData.firstName) !== null && _c !== void 0 ? _c : ""} ${(_d = studentData.lastName) !== null && _d !== void 0 ? _d : ""}`.trim() || studentId;
        // Format: "Student has been added to Monday at 6:00 pm on 12 August 2025."
        const notifBody = `${studentName} has been added to ${classDay} at ${classTime} on ${attDateStr}.`;
        const msg = {
            notification: {
                title: "Student Added",
                body: notifBody,
            },
            data: {
                type: "student_added",
                classId,
                studentId,
            },
            tokens,
        };
        await messaging.sendEachForMulticast(msg);
    }
    // Notify for removed students (absent)
    for (const studentId of removedStudentIds) {
        const studentSnap = await db.collection("students").doc(studentId).get();
        const studentData = studentSnap.data() || {};
        const studentName = `${(_e = studentData.firstName) !== null && _e !== void 0 ? _e : ""} ${(_f = studentData.lastName) !== null && _f !== void 0 ? _f : ""}`.trim() || studentId;
        // Format: "Student will be absent from Monday at 6:00 pm on 12 August 2025."
        const notifBody = `${studentName} will be absent from ${classDay} at ${classTime} on ${attDateStr}.`;
        const msg = {
            notification: {
                title: "Student Absent",
                body: notifBody,
            },
            data: {
                type: "student_absent",
                classId,
                studentId,
            },
            tokens,
        };
        await messaging.sendEachForMulticast(msg);
    }
});
//# sourceMappingURL=notifications.js.map