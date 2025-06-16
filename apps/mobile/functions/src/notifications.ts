import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { DateTime } from "luxon";

function to12Hour(time24: string): string {
  // Expects "HH:mm"
  const [h, m] = time24.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return time24;
  const hour = ((h + 11) % 12) + 1;
  const ampm = h >= 12 ? "pm" : "am";
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatDate(date: Date, day: string, time12: string): string {
  // Example: "Friday 14 June, 6:00 pm"
  const dt = DateTime.fromJSDate(date);
  return `${day} ${dt.toFormat("d MMMM")}, ${time12}`;
}

export const onAnnouncementCreated = onDocumentCreated(
    "announcements/{announcementId}",
    async (event) => {
        const announcement = event.data?.data();
        if (!announcement) {
            console.error("Announcement data is undefined");
            return;
        }
        const db = getFirestore();
        const messaging = getMessaging();

        try {
            const tokens: string[] = [];
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
            } else {
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
        } catch (error) {
            console.error("Error sending notifications:", error);
        }
    }
);

export const onMessageReceived = onDocumentCreated(
    "chats/{chatId}/messages/{messageId}",
    async (event) => {
        const db = getFirestore();
        const messaging = getMessaging();

        // 1) Get the message data
        const messageData = event.data?.data();
        if (!messageData) {
            console.error("Message data is undefined");
            return;
        }
        const { senderId, text = "", type } = messageData as {
            senderId: string;
            text?: string;
            type?: string;
        };

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
        const participants: string[] = chatSnap.data()?.participants || [];
        const recipientIds = participants.filter((id) => id !== senderId);
        if (recipientIds.length === 0) {
            console.log("No recipients found for this message");
            return;
        }

        // Fetch sender's first and last name for navigation
        const senderDoc = await db.collection("users").doc(senderId).get();
        const senderData = senderDoc.data() || {};
        const otherUserName = (
          `${(senderData['firstName'] as string ?? '')} ${(senderData['lastName'] as string ?? '')}`
        ).trim() || "Unknown";

        // 4) Load user tokens
        const tokens: string[] = [];
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
            }
            );
        } catch (error) {
            console.error("Error sending notifications:", error);
        }
    }
)

export const invoiceCreatedNotif = onDocumentCreated(
  "invoices/{invoiceId}",
  async (event) => {
    const invoice = event.data?.data();
    if (!invoice) return console.error("No invoice data");
    const invoiceId = event.params.invoiceId;
    const parentId: string = invoice.parentId;

    const db = getFirestore();
    const messaging = getMessaging();

    // 1. Load the parent’s FCM tokens
    const tokensSnap = await db
      .collection("userTokens")
      .doc(parentId)
      .collection("tokens")
      .get();

    const tokens = tokensSnap.docs
      .map(doc => doc.data().token as string)
      .filter(token => !!token);

    if (tokens.length === 0) {
      console.log("No tokens for parent", parentId);
      return;
    }

    // 2. Build notification payload
    const msg: MulticastMessage = {
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
        if (!r.success) console.error("Failed token:", tokens[i], r.error);
      });
    }
  }
);

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

      for (const snap of attSnaps.docs) {
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

export const onFeedbackCreated = onDocumentCreated(
  "feedback/{feedbackId}",
  async (event) => {
    const db = getFirestore();
    const messaging = getMessaging();
    const feedbackId = event.params.feedbackId;
    const feedbackDoc = event.data?.data();
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
    const parents: string[] = Array.isArray(studentData.parents) ? studentData.parents : [];
    const studentName =
      `${studentData.firstName ?? ""} ${studentData.lastName ?? ""}`.trim() || "Your child";

    if (!parents.length) {
      console.log(`No parents array for student ${studentId}`);
      return;
    }

    // Helper: fetch tokens for a parentId
    async function getParentTokens(parentId: string): Promise<string[]> {
      const tokensSnap = await db
        .collection("userTokens")
        .doc(parentId)
        .collection("tokens")
        .get();
      return tokensSnap.docs.map(doc => doc.data().token as string).filter(Boolean);
    }

    // Send notification to each parent's devices
    for (const parentId of parents) {
      let tokens: string[];
      try {
        tokens = await getParentTokens(parentId);
      } catch (err) {
        console.error(`Failed to fetch tokens for parent ${parentId}:`, err);
        continue;
      }
      if (!tokens.length) {
        console.log(`No tokens for parent ${parentId}`);
        continue;
      }
      let notifBody: string;
      if (typeof subject === "string" && subject.length) {
        notifBody = subject.length > 80 ? subject.slice(0, 77) + "..." : subject;
      } else {
        notifBody = "You have new feedback for your child.";
      }
      const msg: MulticastMessage = {
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
        console.log(
          `Feedback notification sent to parent ${parentId}: success=${res.successCount}, failure=${res.failureCount}, tokensCount=${tokens.length}`
        );
        if (res.failureCount > 0) {
          res.responses.forEach((r, i) => {
            if (!r.success) console.error("Failed token:", tokens[i], r.error);
          });
        }
      } catch (err) {
        console.error(`Error sending notification to parent ${parentId}:`, err);
      }
    }
  }
);

export const invoiceReminderScheduler = onSchedule(
  { schedule: "0 10 * * *", timeZone: "Australia/Sydney" }, // 10am daily
  async (event) => {
    const db = getFirestore();
    const messaging = getMessaging();
    const today = DateTime.now().setZone("Australia/Sydney").startOf("day");

    // 1. Query all open/unpaid invoices
    const invoicesSnap = await db
      .collection("invoices")
      .where("status", "in", ["unpaid", "overdue"])
      .get();

    for (const doc of invoicesSnap.docs) {
      const invoice = doc.data();
      const invoiceId = doc.id;
      const parentId = invoice.parentId;
      if (!parentId || !invoice.dueDate) continue;

      // Convert Firestore Timestamp to Luxon DateTime
      const dueDate = DateTime.fromJSDate(
        (invoice.dueDate as Timestamp).toDate(),
        { zone: "Australia/Sydney" }
      ).startOf("day");

      const daysUntilDue = Math.floor(dueDate.diff(today, "days").days);
      const daysOverdue = Math.floor(today.diff(dueDate, "days").days);

      let shouldSend = false;
      let notifTitle = "";
      let notifBody = "";

      if (daysUntilDue === 7) {
        shouldSend = true;
        notifTitle = "Invoice due in 1 week";
        notifBody = `Your invoice for \$${invoice.amountDue?.toFixed(2) ?? ""} is due on ${dueDate.toFormat("d MMM yyyy")}.`;
      } else if (daysUntilDue === 0) {
        shouldSend = true;
        notifTitle = "Invoice due today";
        notifBody = `Your invoice for \$${invoice.amountDue?.toFixed(2) ?? ""} is due today.`;
      } else if (daysOverdue > 0 && daysOverdue % 7 === 0) {
        shouldSend = true;
        notifTitle = "Invoice overdue";
        notifBody = `Your invoice for \$${invoice.amountDue?.toFixed(2) ?? ""} is overdue by ${daysOverdue} day(s).`;
      }

      if (!shouldSend) continue;

      // Fetch parent tokens
      const tokensSnap = await db
        .collection("userTokens")
        .doc(parentId)
        .collection("tokens")
        .get();
      const tokens = tokensSnap.docs.map(d => d.data().token as string).filter(Boolean);
      if (!tokens.length) continue;

      const msg: MulticastMessage = {
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
        console.log(
          `Invoice reminder sent to parent ${parentId} for invoice ${invoiceId}: success=${res.successCount}, failure=${res.failureCount}`
        );
        if (res.failureCount > 0) {
          res.responses.forEach((r, i) => {
            if (!r.success) console.error("Failed token:", tokens[i], r.error);
          });
        }
      } catch (err) {
        console.error(`Error sending invoice reminder to parent ${parentId}:`, err);
      }
    }
  }
);

export const onAttendanceCancellation = onDocumentUpdated(
  "classes/{classId}/attendance/{attendanceId}",
  async (event) => {
    // 1) Fetch before/after arrays
    if (!event.data || !event.data.before || !event.data.after) {
      console.error("event.data, event.data.before, or event.data.after is undefined");
      return;
    }
    const before = event.data.before.data().attendance as string[] || [];
    const after  = event.data.after.data().attendance as string[] || [];

    // 2) Only fire on a removal
    if (after.length >= before.length) {
      console.log("No cancellations detected, skipping notification");
      return;
    }

    const classId = event.params.classId;
    const db      = getFirestore();
    const msgSvc  = getMessaging();

    // 1. Load class info
    const classSnap = await db.collection("classes").doc(classId).get();
    const cd = classSnap.data() || {};
    const day       = cd.day      as string || "a class day";
    const startTime = cd.startTime as string || "?";
    const startTime12 = to12Hour(startTime);

    // 2. Get attendance date
    const attDateRaw = event.data.after.data().date;
    let attDate: Date | null = null;
    if (attDateRaw && typeof attDateRaw.toDate === "function") {
      attDate = attDateRaw.toDate();
    } else if (attDateRaw instanceof Date) {
      attDate = attDateRaw;
    } else if (attDateRaw && attDateRaw._seconds) {
      attDate = new Date(attDateRaw._seconds * 1000);
    }

    // 3. Only send if date is in the future
    if (!attDate) {
      console.log("Attendance date missing or invalid, skipping notification");
      return;
    }
    const now = new Date();
    if (attDate < now) {
      console.log("Attendance date is in the past, skipping notification");
      return;
    }

    // 4. Format date for notification
    const dateStr = formatDate(attDate, day, startTime12);

    // 5. Gather all parents’ tokens (as before)
    const parentUsers = await db
      .collection("users")
      .where("role", "==", "parent")
      .get();
    if (parentUsers.empty) return;

    const tokens: string[] = [];
    for (const p of parentUsers.docs) {
      const uid = p.id;
      const tsnap = await db
        .collection("userTokens")
        .doc(uid)
        .collection("tokens")
        .get();
      tsnap.forEach(d => {
        const t = d.data().token as string;
        if (t) tokens.push(t);
      });
    }
    if (!tokens.length) return;

    // 6. Send notification
    const multicast = {
      notification: {
        title: "Spot Opened!",
        body: `A spot opened up for ${dateStr}.`,
      },
      data: { type: "cancellation", classId },
      tokens,
    };
    const res = await msgSvc.sendEachForMulticast(multicast);
    console.log(
      `Sent ${res.successCount}/${tokens.length} cancellation notices`
    );
    if (res.failureCount > 0) {
      res.responses.forEach((r, i) => {
        if (!r.success) console.error("Failed token:", tokens[i], r.error);
      });
    }
  }
);