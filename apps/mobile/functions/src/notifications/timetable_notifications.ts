import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { DateTime } from "luxon";

function to12Hour(time24: string): string {
  // Expects "HH:mm"
  const [h, m] = time24.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return time24;
  const hour = ((h + 11) % 12) + 1;
  const ampm = h >= 12 ? "pm" : "am";
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export const dailyLessonAndShiftReminder = onSchedule(
  { schedule: "0 9 * * *", timeZone: "Australia/Sydney" },
  async (event) => {
      console.log("dailyLessonAndShiftReminder triggered");
      const db        = getFirestore();
      const messaging = getMessaging();

      const SYDNEY_TZ = "Australia/Sydney";
      const nowSydney = DateTime.now().setZone(SYDNEY_TZ);
      const startOfDaySydney = nowSydney.startOf("day");
      const startOfNextSydney = startOfDaySydney.plus({ days: 1 });

      const startOfDayUTC = startOfDaySydney.toUTC().toJSDate();
      const startOfNextUTC = startOfNextSydney.toUTC().toJSDate();

      const startOfDay  = Timestamp.fromDate(startOfDayUTC);
      const startOfNext = Timestamp.fromDate(startOfNextUTC);

      console.log("Sydney start of day (local):", startOfDaySydney.toString());
      console.log("Sydney start of next day (local):", startOfNextSydney.toString());
      console.log("Corresponding UTC range:", startOfDayUTC, startOfNextUTC);

      // Fetch ALL attendance docs whose `date` is today
      const attSnaps = await db
        .collectionGroup("attendance")
        .where("date", ">=", startOfDay)
        .where("date", "<",  startOfNext)
        .get();
      console.log(`Found ${attSnaps.docs.length} attendance documents for today`);

      // Helper: extract termId from attendance doc id (e.g., "2025_T3_W1" => "2025_T3")
      function getTermIdFromAttendanceId(attId: string): string | null {
        // Matches "2025_T3_W1" or "2025_T3_W12" etc.
        const match = attId.match(/^([A-Za-z0-9]+_T\d+)/);
        return match ? match[1] : null;
      }

      // Cache for term startDates to avoid repeated Firestore reads
      const termStartCache: Record<string, Date> = {};

      // Filter attendance docs: only keep those whose date >= term.startDate
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
        // Fetch and cache term startDate
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

      // Helper: extract classId from attendance doc ref path
      function getClassIdFromAttendanceSnap(snap: FirebaseFirestore.QueryDocumentSnapshot) {
        // path: classes/{classId}/attendance/{attendanceId}
        const pathParts = snap.ref.path.split("/");
        const classIdx = pathParts.indexOf("classes");
        if (classIdx !== -1 && pathParts.length > classIdx + 1) {
          return pathParts[classIdx + 1];
        }
        return null;
      }

      // Updated types to store start/end
      type SessionRange = { start: Date; end: Date };
      type ParentSession = { start: Date; end: Date; childName: string };

      const tutorMap  : Record<string, SessionRange[]> = {};
      const parentMap : Record<string, ParentSession[]> = {};

      for (const snap of filteredAttSnaps) {
        const data       = snap.data();
        console.log("Processing attendance document:", snap.id, data);
        const sessionDT  = (data.date as Timestamp).toDate();
        const tutorIds   = Array.isArray(data.tutors) ? data.tutors as string[] : [];
        const studentIds = Array.isArray(data.attendance) ? data.attendance as string[] : [];
        console.log(`Tutor IDs for doc ${snap.id}:`, tutorIds);
        console.log(`Student IDs for doc ${snap.id}:`, studentIds);

        // Get classId from path and fetch class doc
        const classId = getClassIdFromAttendanceSnap(snap);
        let start: Date = sessionDT;
        let end: Date = new Date(sessionDT.getTime() + 60 * 60 * 1000); // fallback 1 hour

        if (classId) {
          const classDoc = await db.collection("classes").doc(classId).get();
          if (classDoc.exists) {
            const classData = classDoc.data() || {};
            const startTime = classData.startTime as string | undefined;
            const endTime = classData.endTime as string | undefined;
            if (startTime && endTime) {
              // Use Luxon to build Sydney-local DateTime, then convert to JS Date
              const sessionSydney = DateTime.fromJSDate(sessionDT, { zone: SYDNEY_TZ });
              const [startH, startM] = startTime.split(":").map(Number);
              const [endH, endM] = endTime.split(":").map(Number);

              const startSydney = sessionSydney.set({ hour: startH, minute: startM, second: 0, millisecond: 0 });
              let endSydney = sessionSydney.set({ hour: endH, minute: endM, second: 0, millisecond: 0 });
              // If end is before start (overnight), add 1 day
              if (endSydney <= startSydney) endSydney = endSydney.plus({ days: 1 });

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
          const stu     = stuDoc.data() || {};
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

      //Helper to fetch FCM tokens
      async function getTokens(uid: string): Promise<string[]> {
        const tokSnap = await db.collection("userTokens").doc(uid).collection("tokens").get();
        const tokens = tokSnap.docs.map(d => d.data().token as string).filter(Boolean);
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
        const sorted  = sessions.sort((a, b) => a.start.getTime() - b.start.getTime());
        const first   = sorted[0].start;
        const lastEnd = sorted[sorted.length - 1].end;
        const fmt     = (d: Date) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });

        console.log(`Sending shift reminder to tutor ${tutorId} for shift ${fmt(first)}–${fmt(lastEnd)} with tokens:`, tokens);

        const msg: MulticastMessage = {
          notification: {
            title: "You have a shift tonight!",
            body : `You’re tutoring from ${fmt(first)}–${fmt(lastEnd)}.`,
          },
          data  : { type: "shift_reminder" },
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
        if (!tokens.length) continue;

        // 1) Group all sessions by child
        const byChild: Record<string, SessionRange[]> = {};
        sessions.forEach(({ start, end, childName }) => {
          (byChild[childName] ||= []).push({ start, end });
        });

        type Range = { start: Date; end: Date; children: Set<string> };
        const allRanges: Range[] = [];

        // 2) For each child, collapse their own back-to-back slots
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

        // 3) Merge ranges that have identical [start, end]
        const mergedMap = new Map<string, Range>();
        allRanges.forEach(r => {
          const key = `${r.start.getTime()}-${r.end.getTime()}`;
          if (!mergedMap.has(key)) {
            mergedMap.set(key, { start: r.start, end: r.end, children: new Set() });
          }
          r.children.forEach(c => mergedMap.get(key)!.children.add(c));
        });

        // 4) Sort and format
        const fmtOpts: Intl.DateTimeFormatOptions = {
          hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney"
        };
        const lines = Array.from(mergedMap.values())
          .sort((a, b) => a.start.getTime() - b.start.getTime())
          .map(r => {
            const names = Array.from(r.children).sort().join(" and ");
            const from = r.start.toLocaleTimeString("en-AU", fmtOpts);
            const to   = r.end  .toLocaleTimeString("en-AU", fmtOpts);
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

export const onSessionCancellation = onDocumentUpdated(
  "classes/{classId}/attendance/{attendanceId}",
  async (event) => {
    console.log("[onSessionCancellation] Function triggered");
    console.log("[onSessionCancellation] Event params:", event.params);
    
    if (!event.data?.before || !event.data?.after) {
      console.log("[onSessionCancellation] Missing before/after data, exiting");
      return;
    }

    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    console.log("[onSessionCancellation] Before data cancelled:", beforeData.cancelled);
    console.log("[onSessionCancellation] After data cancelled:", afterData.cancelled);

    // Check if the session was just cancelled
    const wasCancelled = beforeData.cancelled === false && afterData.cancelled === true;
    const wasReactivated = beforeData.cancelled === true && afterData.cancelled === false;

    console.log("[onSessionCancellation] Was cancelled:", wasCancelled);
    console.log("[onSessionCancellation] Was reactivated:", wasReactivated);

    if (!wasCancelled && !wasReactivated) {
      console.log("[onSessionCancellation] No cancellation/reactivation detected, exiting");
      return;
    }

    const db = getFirestore();
    const messaging = getMessaging();
    const classId = event.params.classId;
    const attendanceId = event.params.attendanceId;

    console.log("[onSessionCancellation] Processing notification for classId:", classId, "attendanceId:", attendanceId);

    try {
      // Get class information
      console.log("[onSessionCancellation] Fetching class document:", classId);
      const classDoc = await db.collection("classes").doc(classId).get();
      if (!classDoc.exists) {
        console.error(`[onSessionCancellation] Class document ${classId} does not exist`);
        return;
      }

      const classData = classDoc.data()!;
      const className = classData.type || "Class";
      const classDay = classData.day || "Unknown day";
      const classTime = classData.startTime
        ? to12Hour(classData.startTime as string)
        : "Unknown time";

      console.log("[onSessionCancellation] Class info - name:", className, "day:", classDay, "time:", classTime);

      // Get session date
      const sessionDate = afterData.date?.toDate();
      const sessionDateStr = sessionDate
        ? DateTime.fromJSDate(sessionDate).setZone("Australia/Sydney").toFormat("cccc d LLLL")
        : `${classDay}`;

      console.log("[onSessionCancellation] Session date:", sessionDate, "formatted:", sessionDateStr);

      const tokens: string[] = [];
      const notifiedUsers = new Set<string>();

      if (wasCancelled) {
        console.log("[onSessionCancellation] Processing cancellation notifications");

        // 1. Notify assigned tutors
        const assignedTutors = afterData.tutors as string[] || [];
        console.log("[onSessionCancellation] Assigned tutors:", assignedTutors);

        for (const tutorId of assignedTutors) {
          if (notifiedUsers.has(tutorId)) {
            console.log("[onSessionCancellation] Tutor", tutorId, "already notified, skipping");
            continue;
          }
          notifiedUsers.add(tutorId);

          console.log("[onSessionCancellation] Fetching tokens for tutor:", tutorId);
          const tutorTokensSnap = await db
            .collection("userTokens")
            .doc(tutorId)
            .collection("tokens")
            .get();
          
          let tutorTokenCount = 0;
          tutorTokensSnap.forEach(doc => {
            const token = doc.data().token as string;
            if (token) {
              tokens.push(token);
              tutorTokenCount++;
            }
          });
          console.log("[onSessionCancellation] Added", tutorTokenCount, "tokens for tutor:", tutorId);
        }

        // 2. Notify parents of enrolled students
        const enrolledStudents = afterData.attendance as string[] || [];
        console.log("[onSessionCancellation] Enrolled students:", enrolledStudents);

        for (const studentId of enrolledStudents) {
          console.log("[onSessionCancellation] Processing student:", studentId);
          try {
            const studentDoc = await db.collection("students").doc(studentId).get();
            if (!studentDoc.exists) {
              console.log("[onSessionCancellation] Student document does not exist:", studentId);
              continue;
            }

            const studentData = studentDoc.data()!;
            const parentIds = studentData.parents as string[] || [];
            console.log("[onSessionCancellation] Parent IDs for student", studentId, ":", parentIds);

            for (const parentId of parentIds) {
              if (notifiedUsers.has(parentId)) {
                console.log("[onSessionCancellation] Parent", parentId, "already notified, skipping");
                continue;
              }
              notifiedUsers.add(parentId);

              console.log("[onSessionCancellation] Fetching tokens for parent:", parentId);
              const parentTokensSnap = await db
                .collection("userTokens")
                .doc(parentId)
                .collection("tokens")
                .get();
              
              let parentTokenCount = 0;
              parentTokensSnap.forEach(doc => {
                const token = doc.data().token as string;
                if (token) {
                  tokens.push(token);
                  parentTokenCount++;
                }
              });
              console.log("[onSessionCancellation] Added", parentTokenCount, "tokens for parent:", parentId);
            }
          } catch (error) {
            console.error(`[onSessionCancellation] Error processing student ${studentId}:`, error);
          }
        }

        console.log("[onSessionCancellation] Total tokens collected for cancellation:", tokens.length);
        console.log("[onSessionCancellation] Total unique users to notify:", notifiedUsers.size);

        if (tokens.length > 0) {
          const notificationBody = `${sessionDateStr} at ${classTime} has been cancelled.`;
          console.log("[onSessionCancellation] Sending cancellation notification:", notificationBody);

          const message: MulticastMessage = {
            notification: {
              title: "Class Cancelled",
              body: notificationBody,
            },
            data: {
              type: "cancellation",
              classId,
              attendanceId,
            },
            tokens,
          };

          const response = await messaging.sendEachForMulticast(message);
          console.log(
            `[onSessionCancellation] Sent cancellation notifications: success=${response.successCount}, failure=${response.failureCount}, total=${tokens.length}`
          );

          if (response.failureCount > 0) {
            console.log("[onSessionCancellation] Failed notification details:");
            response.responses.forEach((resp, idx) => {
              if (!resp.success) {
                console.error("[onSessionCancellation] Failed token:", tokens[idx], "Error:", resp.error);
              }
            });
          }
        } else {
          console.log("[onSessionCancellation] No tokens found, skipping notification send");
        }

      } else if (wasReactivated) {
        console.log("[onSessionCancellation] Processing reactivation notifications");

        // Reset tokens and notified users for reactivation
        tokens.length = 0;
        notifiedUsers.clear();

        // 1. Notify assigned tutors
        const assignedTutors = afterData.tutors as string[] || [];
        console.log("[onSessionCancellation] Assigned tutors for reactivation:", assignedTutors);

        for (const tutorId of assignedTutors) {
          if (notifiedUsers.has(tutorId)) {
            console.log("[onSessionCancellation] Tutor", tutorId, "already notified for reactivation, skipping");
            continue;
          }
          notifiedUsers.add(tutorId);

          console.log("[onSessionCancellation] Fetching tokens for tutor (reactivation):", tutorId);
          const tutorTokensSnap = await db
            .collection("userTokens")
            .doc(tutorId)
            .collection("tokens")
            .get();
          
          let tutorTokenCount = 0;
          tutorTokensSnap.forEach(doc => {
            const token = doc.data().token as string;
            if (token) {
              tokens.push(token);
              tutorTokenCount++;
            }
          });
          console.log("[onSessionCancellation] Added", tutorTokenCount, "tokens for tutor (reactivation):", tutorId);
        }

        // 2. Notify parents of enrolled students
        const enrolledStudents = afterData.attendance as string[] || [];
        console.log("[onSessionCancellation] Enrolled students for reactivation:", enrolledStudents);

        for (const studentId of enrolledStudents) {
          console.log("[onSessionCancellation] Processing student for reactivation:", studentId);
          try {
            const studentDoc = await db.collection("students").doc(studentId).get();
            if (!studentDoc.exists) {
              console.log("[onSessionCancellation] Student document does not exist (reactivation):", studentId);
              continue;
            }

            const studentData = studentDoc.data()!;
            const parentIds = studentData.parents as string[] || [];
            console.log("[onSessionCancellation] Parent IDs for student", studentId, "reactivation:", parentIds);

            for (const parentId of parentIds) {
              if (notifiedUsers.has(parentId)) {
                console.log("[onSessionCancellation] Parent", parentId, "already notified for reactivation, skipping");
                continue;
              }
              notifiedUsers.add(parentId);

              console.log("[onSessionCancellation] Fetching tokens for parent (reactivation):", parentId);
              const parentTokensSnap = await db
                .collection("userTokens")
                .doc(parentId)
                .collection("tokens")
                .get();
              
              let parentTokenCount = 0;
              parentTokensSnap.forEach(doc => {
                const token = doc.data().token as string;
                if (token) {
                  tokens.push(token);
                  parentTokenCount++;
                }
              });
              console.log("[onSessionCancellation] Added", parentTokenCount, "tokens for parent (reactivation):", parentId);
            }
          } catch (error) {
            console.error(`[onSessionCancellation] Error processing student ${studentId} for reactivation:`, error);
          }
        }

        console.log("[onSessionCancellation] Total tokens collected for reactivation:", tokens.length);
        console.log("[onSessionCancellation] Total unique users to notify for reactivation:", notifiedUsers.size);

        if (tokens.length > 0) {
          const notificationBody = `${sessionDateStr} at ${classTime} has been reactivated.`;
          console.log("[onSessionCancellation] Sending reactivation notification:", notificationBody);

          const message: MulticastMessage = {
            notification: {
              title: "Class Reactivated",
              body: notificationBody,
            },
            data: {
              type: "reactivation",
              classId,
              attendanceId,
            },
            tokens,
          };

          const response = await messaging.sendEachForMulticast(message);
          console.log(
            `[onSessionCancellation] Sent reactivation notifications: success=${response.successCount}, failure=${response.failureCount}, total=${tokens.length}`
          );

          if (response.failureCount > 0) {
            console.log("[onSessionCancellation] Failed reactivation notification details:");
            response.responses.forEach((resp, idx) => {
              if (!resp.success) {
                console.error("[onSessionCancellation] Failed token:", tokens[idx], "Error:", resp.error);
              }
            });
          }
        } else {
          console.log("[onSessionCancellation] No tokens found for reactivation, skipping notification send");
        }
      }

      console.log("[onSessionCancellation] Function completed successfully");

    } catch (error) {
      console.error("[onSessionCancellation] Error in function execution:", error);
    }
  }
);

export const onPermanentSpotOpened = onDocumentUpdated(
  "classes/{classId}",
  async (event) => {
    // exit if no real change
    if (!event.data?.before || !event.data?.after) return;

    // grab before/after enrolledStudents
    const beforeArr = event.data.before.data().enrolledStudents as string[] || [];
    const afterArr  = event.data.after.data().enrolledStudents  as string[] || [];

    // only proceed on a removal
    if (afterArr.length >= beforeArr.length) return;

    // load class info for notification
    const classData = event.data.after.data();
    const day       = classData.day      as string || "a class day";
    const startTime = classData.startTime as string || "?";
    const start12   = to12Hour(startTime);

    // build the message
    const title = "Permanent Spot Opened!";
    const body  = `A permanent spot opened for ${day} at ${start12}.`;

    const db     = getFirestore();
    const msgSvc = getMessaging();

    // gather parent tokens
    const parentsSnap = await db.collection("users")
      .where("role", "==", "parent")
      .get();
    if (parentsSnap.empty) return;

    const tokens: string[] = [];
    for (const p of parentsSnap.docs) {
      // respect their spotOpened setting
      const settings = (await db.collection("userSettings").doc(p.id).get()).data() || {};
      if (settings.spotOpened === false) continue;

      const tsnap = await db
        .collection("userTokens")
        .doc(p.id)
        .collection("tokens")
        .get();
      tsnap.forEach(d => {
        const t = d.data().token as string;
        if (t) tokens.push(t);
      });
    }
    if (!tokens.length) return;

    // send one multicast
    await msgSvc.sendEachForMulticast({
      notification: { title, body },
      data: { type: "permanent_spot", classId: event.params.classId },
      tokens,
    });
    console.log(`Sent permanent‐spot notification for class ${event.params.classId}`);
  }
);

export const onPermanentEnrolmentNotifyAdmins = onDocumentUpdated(
  "classes/{classId}",
  async (event) => {
    if (!event.data?.before || !event.data?.after) return;

    const beforeArr = event.data.before.data().enrolledStudents as string[] || [];
    const afterArr  = event.data.after.data().enrolledStudents  as string[] || [];

    // Only proceed if a student was added
    if (afterArr.length <= beforeArr.length) return;

    const newStudentIds = afterArr.filter(id => !beforeArr.includes(id));
    if (!newStudentIds.length) return;

    const db = getFirestore();
    const messaging = getMessaging();
    const classId = event.params.classId;
    const classData = event.data.after.data();
    const classDay = classData.day || "Unknown day";
    const classTime = classData.startTime
      ? to12Hour(classData.startTime as string)
      : "Unknown time";

    // Fetch all admin users
    const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
    if (adminsSnap.empty) return;

    // Gather all admin tokens
    let tokens: string[] = [];
    for (const adminDoc of adminsSnap.docs) {
      const uid = adminDoc.id;
      const tokensSnap = await db.collection("userTokens").doc(uid).collection("tokens").get();
      tokens.push(...tokensSnap.docs.map(d => d.data().token as string).filter(Boolean));
    }
    if (!tokens.length) return;

    // For each new student, send notification
    for (const studentId of newStudentIds) {
      const studentSnap = await db.collection("students").doc(studentId).get();
      const studentData = studentSnap.data() || {};
      const studentName = `${studentData.firstName ?? ""} ${studentData.lastName ?? ""}`.trim() || studentId;

      const notifBody = `${studentName} has permanently enrolled for ${classDay} at ${classTime}.`;

      const msg: MulticastMessage = {
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
  }
);

export const onAttendanceChangeNotifyAdmins = onDocumentUpdated(
  "classes/{classId}/attendance/{attendanceId}",
  async (event) => {
    if (!event.data?.before || !event.data?.after) return;

    const beforeAttendance = event.data.before.data().attendance as string[] || [];
    const afterAttendance  = event.data.after.data().attendance as string[] || [];

    const addedStudentIds   = afterAttendance.filter(id => !beforeAttendance.includes(id));
    const removedStudentIds = beforeAttendance.filter(id => !afterAttendance.includes(id));
    if (!addedStudentIds.length && !removedStudentIds.length) return;

    const db = getFirestore();
    const messaging = getMessaging();
    const classId = event.params.classId;

    // Fetch class info
    const classSnap = await db.collection("classes").doc(classId).get();
    if (!classSnap.exists) return;
    const classData = classSnap.data() || {};
    const classDay = classData.day || "Unknown day";
    const classTime = classData.startTime
      ? to12Hour(classData.startTime as string)
      : "Unknown time";

    const attDateRaw = event.data.after.data().date;
    let attDate: Date | null = null;
    if (attDateRaw && typeof attDateRaw.toDate === "function") {
      attDate = attDateRaw.toDate();
    } else if (attDateRaw instanceof Date) {
      attDate = attDateRaw;
    } else if (attDateRaw && attDateRaw._seconds) {
      attDate = new Date(attDateRaw._seconds * 1000);
    }
    const attDateStr = attDate
      ? DateTime.fromJSDate(attDate).setZone("Australia/Sydney").toFormat("cccc d LLLL")
      : classDay;

    // Fetch all admin tokens
    const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
    if (adminsSnap.empty) return;
    let tokens: string[] = [];
    for (const adminDoc of adminsSnap.docs) {
      const uid = adminDoc.id;
      const tokensSnap = await db.collection("userTokens").doc(uid).collection("tokens").get();
      tokens.push(...tokensSnap.docs.map(d => d.data().token as string).filter(Boolean));
    }
    if (!tokens.length) return;

    // Notify for added students (booked)
    for (const studentId of addedStudentIds) {
      const studentSnap = await db.collection("students").doc(studentId).get();
      const studentData = studentSnap.data() || {};
      const studentName = `${studentData.firstName ?? ""} ${studentData.lastName ?? ""}`.trim() || studentId;

      // Format: "Student has been added to Monday at 6:00 pm on 12 August 2025."
      const notifBody = `${studentName} has been added to ${classDay} at ${classTime} on ${attDateStr}.`;

      const msg: MulticastMessage = {
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
      const studentName = `${studentData.firstName ?? ""} ${studentData.lastName ?? ""}`.trim() || studentId;

      // Format: "Student will be absent from Monday at 6:00 pm on 12 August 2025."
      const notifBody = `${studentName} will be absent from ${classDay} at ${classTime} on ${attDateStr}.`;

      const msg: MulticastMessage = {
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
  }
);