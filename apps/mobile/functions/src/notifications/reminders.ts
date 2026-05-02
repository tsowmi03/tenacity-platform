import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import { DateTime } from "luxon";

export const dailyLessonAndShiftReminder = onSchedule(
  { schedule: "0 9 * * *", timeZone: "Australia/Sydney" },
  async (event) => {
    console.log("dailyLessonAndShiftReminder triggered");
    const db = getFirestore();
    const messaging = getMessaging();

    const SYDNEY_TZ = "Australia/Sydney";
    const nowSydney = DateTime.now().setZone(SYDNEY_TZ);
    const startOfDaySydney = nowSydney.startOf("day");
    const startOfNextSydney = startOfDaySydney.plus({ days: 1 });

    const startOfDayUTC = startOfDaySydney.toUTC().toJSDate();
    const startOfNextUTC = startOfNextSydney.toUTC().toJSDate();

    const startOfDay = Timestamp.fromDate(startOfDayUTC);
    const startOfNext = Timestamp.fromDate(startOfNextUTC);

    console.log("Sydney start of day (local):", startOfDaySydney.toString());
    console.log("Sydney start of next day (local):", startOfNextSydney.toString());
    console.log("Corresponding UTC range:", startOfDayUTC, startOfNextUTC);

    const attSnaps = await db
      .collectionGroup("attendance")
      .where("date", ">=", startOfDay)
      .where("date", "<", startOfNext)
      .get();
    console.log(`Found ${attSnaps.docs.length} attendance documents for today`);

    function getTermIdFromAttendanceId(attId: string): string | null {
      const match = attId.match(/^([A-Za-z0-9]+_T\d+)/);
      return match ? match[1] : null;
    }

    const termStartCache: Record<string, Date> = {};

    const filteredAttSnaps: typeof attSnaps.docs = [];
    for (const snap of attSnaps.docs) {
      const data = snap.data();
      const attId = data.id as string;
      const sessionDate = (data.date as Timestamp).toDate();
      const termId = getTermIdFromAttendanceId(attId);
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
        if (!termData?.startDate) {
          console.warn(`No startDate for termId: ${termId}`);
          continue;
        }
        termStartCache[termId] = termData.startDate.toDate();
      }
      const termStart = termStartCache[termId];
      if (sessionDate >= termStart) {
        filteredAttSnaps.push(snap);
      } else {
        console.log(`Skipping attendance ${attId}: sessionDate ${sessionDate} < termStart ${termStart}`);
      }
    }

    function getClassIdFromAttendanceSnap(snap: (typeof attSnaps.docs)[number]) {
      const pathParts = snap.ref.path.split("/");
      const classIdx = pathParts.indexOf("classes");
      if (classIdx !== -1 && pathParts.length > classIdx + 1) {
        return pathParts[classIdx + 1];
      }
      return null;
    }

    type SessionRange = { start: Date; end: Date };
    type ParentSession = { start: Date; end: Date; childName: string };

    const tutorMap: Record<string, SessionRange[]> = {};
    const parentMap: Record<string, ParentSession[]> = {};

    for (const snap of filteredAttSnaps) {
      const data = snap.data();
      console.log("Processing attendance document:", snap.id, data);
      const sessionDT = (data.date as Timestamp).toDate();
      const tutorIds = Array.isArray(data.tutors) ? data.tutors as string[] : [];
      const studentIds = Array.isArray(data.attendance) ? data.attendance as string[] : [];
      console.log(`Tutor IDs for doc ${snap.id}:`, tutorIds);
      console.log(`Student IDs for doc ${snap.id}:`, studentIds);

      const classId = getClassIdFromAttendanceSnap(snap);
      let start: Date = sessionDT;
      let end: Date = new Date(sessionDT.getTime() + 60 * 60 * 1000);

      if (classId) {
        const classDoc = await db.collection("classes").doc(classId).get();
        if (classDoc.exists) {
          const classData = classDoc.data() || {};
          const startTime = classData.startTime as string | undefined;
          const endTime = classData.endTime as string | undefined;
          if (startTime && endTime) {
            const sessionSydney = DateTime.fromJSDate(sessionDT, { zone: SYDNEY_TZ });
            const [startH, startM] = startTime.split(":").map(Number);
            const [endH, endM] = endTime.split(":").map(Number);

            const startSydney = sessionSydney.set({ hour: startH, minute: startM, second: 0, millisecond: 0 });
            let endSydney = sessionSydney.set({ hour: endH, minute: endM, second: 0, millisecond: 0 });
            if (endSydney <= startSydney) endSydney = endSydney.plus({ days: 1 });

            start = startSydney.toJSDate();
            end = endSydney.toJSDate();
          }
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
        const childNm = `${stu.firstName ?? ""} ${stu.lastName ?? ""}`.trim() || "Your child";
        const parentIds = Array.isArray(stu.parents) ? stu.parents as string[] : [];
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

    async function getTokens(uid: string): Promise<string[]> {
      const tokSnap = await db.collection("userTokens").doc(uid).collection("tokens").get();
      const tokens = tokSnap.docs.map(d => d.data().token as string).filter(Boolean);
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
      const fmt = (d: Date) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });

      console.log(`Sending shift reminder to tutor ${tutorId} for shift ${fmt(first)}–${fmt(lastEnd)} with tokens:`, tokens);

      const msg: MulticastMessage = {
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
      const settingsSnap = await db.collection("userSettings").doc(parentId).get();
      if (!settingsSnap.exists) {
        const settings = settingsSnap.data() || {};
        if (settings.lessonReminder == false) {
          console.log(`Skipping lesson reminder for parent ${parentId} due to userSettings`);
          continue;
        }
      }
      const tokens = await getTokens(parentId);
      if (!tokens.length) continue;

      const byChild: Record<string, SessionRange[]> = {};
      sessions.forEach(({ start, end, childName }) => {
        (byChild[childName] ||= []).push({ start, end });
      });

      type Range = { start: Date; end: Date; children: Set<string> };
      const allRanges: Range[] = [];

      for (const [child, ranges] of Object.entries(byChild)) {
        const sorted = ranges.sort((a, b) => a.start.getTime() - b.start.getTime());
        let curStart = sorted[0].start, curEnd = sorted[0].end;
        for (let i = 1; i < sorted.length; i++) {
          const next = sorted[i];
          if (next.start.getTime() <= curEnd.getTime()) {
            curEnd = new Date(Math.max(curEnd.getTime(), next.end.getTime()));
          } else {
            allRanges.push({ start: curStart, end: curEnd, children: new Set([child]) });
            curStart = next.start;
            curEnd = next.end;
          }
        }
        allRanges.push({ start: curStart, end: curEnd, children: new Set([child]) });
      }

      const mergedMap = new Map<string, Range>();
      allRanges.forEach(r => {
        const key = `${r.start.getTime()}-${r.end.getTime()}`;
        if (!mergedMap.has(key)) {
          mergedMap.set(key, { start: r.start, end: r.end, children: new Set() });
        }
        r.children.forEach(c => mergedMap.get(key)!.children.add(c));
      });

      const fmtOpts: Intl.DateTimeFormatOptions = {
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
      const msg: MulticastMessage = {
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
  }
);
