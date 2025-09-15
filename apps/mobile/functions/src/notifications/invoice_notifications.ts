import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { DateTime } from "luxon";

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