"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailyLessonAndShiftReminder = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const luxon_1 = require("luxon");
const attendance_doc_dates_1 = require("../attendance_doc_dates");
const class_schedule_dates_1 = require("../class_schedule_dates");
const preferences_1 = require("./preferences");
exports.dailyLessonAndShiftReminder = (0, scheduler_1.onSchedule)({ schedule: "0 9 * * *", timeZone: class_schedule_dates_1.SYDNEY_TZ }, async (event) => {
    var _a, _b;
    console.log("dailyLessonAndShiftReminder triggered");
    const db = (0, firestore_1.getFirestore)();
    const messaging = (0, messaging_1.getMessaging)();
    const nowSydney = luxon_1.DateTime.now().setZone(class_schedule_dates_1.SYDNEY_TZ);
    const startOfDaySydney = nowSydney.startOf("day");
    const startOfNextSydney = startOfDaySydney.plus({ days: 1 });
    const startOfDayUTC = startOfDaySydney.toUTC().toJSDate();
    const startOfNextUTC = startOfNextSydney.toUTC().toJSDate();
    const startOfDay = firestore_1.Timestamp.fromDate(startOfDayUTC);
    const startOfNext = firestore_1.Timestamp.fromDate(startOfNextUTC);
    console.log("Sydney start of day (local):", startOfDaySydney.toString());
    console.log("Sydney start of next day (local):", startOfNextSydney.toString());
    console.log("Corresponding UTC range:", startOfDayUTC, startOfNextUTC);
    const attSnaps = await db
        .collectionGroup("attendance")
        .where("date", ">=", startOfDay)
        .where("date", "<", startOfNext)
        .get();
    console.log(`Found ${attSnaps.docs.length} attendance documents for today`);
    const termStartCache = {};
    const filteredAttSnaps = [];
    for (const snap of attSnaps.docs) {
        const data = snap.data();
        const attId = typeof data.id === "string" ? data.id : snap.id;
        const sessionDate = data.date.toDate();
        const termId = (0, attendance_doc_dates_1.attendanceTermIdForDoc)(attId, data);
        if (!termId) {
            console.warn(`Could not extract termId from attendance id: ${attId}`);
            continue;
        }
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
    function getClassIdFromAttendanceSnap(snap) {
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
        const classId = getClassIdFromAttendanceSnap(snap);
        let start = sessionDT;
        let end = new Date(sessionDT.getTime() + 60 * 60 * 1000);
        let classData;
        if (classId) {
            const classDoc = await db.collection("classes").doc(classId).get();
            if (classDoc.exists) {
                classData = classDoc.data() || {};
            }
        }
        const classDay = typeof (classData === null || classData === void 0 ? void 0 : classData.day) === "string" ? classData.day : undefined;
        if (!(0, class_schedule_dates_1.shouldProcessReminderAttendance)({
            cancelled: data.cancelled,
            attendanceDate: sessionDT,
            classDay,
            timeZone: class_schedule_dates_1.SYDNEY_TZ,
        })) {
            if (data.cancelled === true) {
                console.log(`Skipping attendance ${snap.id}: class is cancelled`);
            }
            else if (classDay && !(0, class_schedule_dates_1.attendanceDateMatchesClassDay)(sessionDT, classDay, class_schedule_dates_1.SYDNEY_TZ)) {
                console.warn(`Skipping attendance ${snap.id}: date falls on ${(0, class_schedule_dates_1.classDayNameForDate)(sessionDT, class_schedule_dates_1.SYDNEY_TZ)} in Sydney, class day is ${classDay}`);
            }
            continue;
        }
        if (classData) {
            const startTime = typeof classData.startTime === "string" ? classData.startTime : undefined;
            const endTime = typeof classData.endTime === "string" ? classData.endTime : undefined;
            if (startTime && endTime) {
                const sessionSydney = luxon_1.DateTime.fromJSDate(sessionDT, { zone: class_schedule_dates_1.SYDNEY_TZ });
                const [startH, startM] = startTime.split(":").map(Number);
                const [endH, endM] = endTime.split(":").map(Number);
                const startSydney = sessionSydney.set({ hour: startH, minute: startM, second: 0, millisecond: 0 });
                let endSydney = sessionSydney.set({ hour: endH, minute: endM, second: 0, millisecond: 0 });
                if (endSydney <= startSydney)
                    endSydney = endSydney.plus({ days: 1 });
                start = startSydney.toJSDate();
                end = endSydney.toJSDate();
            }
        }
        tutorIds.forEach(tid => {
            (tutorMap[tid] = tutorMap[tid] || []).push({ start, end });
        });
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
    async function getTokens(uid) {
        const tokSnap = await db.collection("userTokens").doc(uid).collection("tokens").get();
        const tokens = tokSnap.docs.map(d => d.data().token).filter(Boolean);
        console.log(`Fetched tokens for user ${uid}:`, tokens);
        return tokens;
    }
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
    for (const [parentId, sessions] of Object.entries(parentMap)) {
        const enabled = await (0, preferences_1.isNotificationPreferenceEnabled)(parentId, "lessonReminder");
        if (!enabled) {
            console.log(`Skipping lesson reminder for parent ${parentId} due to userSettings`);
            continue;
        }
        const tokens = await getTokens(parentId);
        if (!tokens.length)
            continue;
        const byChild = {};
        sessions.forEach(({ start, end, childName }) => {
            (byChild[childName] || (byChild[childName] = [])).push({ start, end });
        });
        const allRanges = [];
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
        const mergedMap = new Map();
        allRanges.forEach(r => {
            const key = `${r.start.getTime()}-${r.end.getTime()}`;
            if (!mergedMap.has(key)) {
                mergedMap.set(key, { start: r.start, end: r.end, children: new Set() });
            }
            r.children.forEach(c => mergedMap.get(key).children.add(c));
        });
        const fmtOpts = {
            hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney",
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
//# sourceMappingURL=reminders.js.map