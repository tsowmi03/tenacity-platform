import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { DateTime } from "luxon";

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
                chatId: chatId,
                messageId: msgId,
                otherUserName: otherUserName,
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

export const onInvoiceCreated = onDocumentCreated(
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
  
      /* Build two maps:
            tutorId  ➜  Date[]   (their sessions)
            parentId ➜  { time:Date , childName:string }[] */
      type ParentSession = { time: Date; childName: string };
  
      const tutorMap  : Record<string, Date[]>            = {};
      const parentMap : Record<string, ParentSession[]>   = {};
  
      for (const snap of attSnaps.docs) {
        const data       = snap.data();
        console.log("Processing attendance document:", snap.id, data);
        const sessionDT  = (data.date as Timestamp).toDate();
        const tutorIds   = Array.isArray(data.tutors) ? data.tutors as string[] : [];
        const studentIds = Array.isArray(data.attendance) ? data.attendance as string[] : [];
        console.log(`Tutor IDs for doc ${snap.id}:`, tutorIds);
        console.log(`Student IDs for doc ${snap.id}:`, studentIds);

        tutorIds.forEach(tid => {
          (tutorMap[tid] = tutorMap[tid] || []).push(sessionDT);
        });

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
            (parentMap[pId] = parentMap[pId] || []).push({ time: sessionDT, childName: childNm });
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
      for (const [tutorId, times] of Object.entries(tutorMap)) {
        const tokens = await getTokens(tutorId);
        if (!tokens.length) {
          console.log(`No tokens for tutor ${tutorId}, skipping notification`);
          continue;
        }

        // Earliest & latest session to compute shift window
        const sorted  = times.sort((a, b) => a.getTime() - b.getTime());
        const first   = sorted[0];
        const last    = sorted[sorted.length - 1];
        const shiftEnd = new Date(last.getTime() + 60 * 60 * 1000);
        const fmt     = (d: Date) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });

        console.log(`Sending shift reminder to tutor ${tutorId} for shift ${fmt(first)}–${fmt(shiftEnd)} with tokens:`, tokens);

        const msg: MulticastMessage = {
          notification: {
            title: "You have a shift tonight!",
            body : `You’re tutoring from ${fmt(first)}–${fmt(shiftEnd)}.`,
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
        if (!tokens.length) {
          console.log(`No tokens for parent ${parentId}, skipping notification`);
          continue;
        }
  
        // Build lines like "6:00 pm — Alice"
        const lines = sessions
          .sort((a, b) => a.time.getTime() - b.time.getTime())
          .map(({ time, childName }) =>
            `${time.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" })} — ${childName}`
          );
  
        console.log(`Sending lesson reminder to parent ${parentId} with sessions:`, lines, "and tokens:", tokens);
  
        const msg: MulticastMessage = {
          notification: {
            title: "You have a lesson tonight!",
            body : lines.join("; "),
          },
          data  : { type: "lesson_reminder" },
          tokens,
        };
        const res = await messaging.sendEachForMulticast(msg);
        console.log(`Sent lesson reminder to parent ${parentId}: success=${res.successCount}, failure=${res.failureCount}, tokensCount=${tokens.length}`);
      }
  
      console.log(`Daily reminders sent: tutors=${Object.keys(tutorMap).length}, parents=${Object.keys(parentMap).length}`);
    }
  );