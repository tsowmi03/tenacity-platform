import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import { DateTime } from "luxon";
import {
  canCreateInvoice,
  invoiceCreatedNotificationBody,
  shouldSuppressInvoiceCreatedNotification,
} from "./invoice_action";

type InvoiceDocument = Record<string, unknown>;
type InvoiceLineItem = Record<string, unknown>;

function requiredString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpsError("invalid-argument", `Missing or invalid ${key}`);
  }
  return value.trim();
}

function requiredNumber(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpsError("invalid-argument", `Missing or invalid ${key}`);
  }
  return value;
}

function requiredInteger(data: Record<string, unknown>, key: string): number {
  const value = requiredNumber(data, key);
  if (!Number.isInteger(value)) {
    throw new HttpsError("invalid-argument", `Missing or invalid ${key}`);
  }
  return value;
}

function optionalNumber(data: Record<string, unknown>, key: string): number | undefined {
  const value = data[key];
  if (value == null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new HttpsError("invalid-argument", `Missing or invalid ${key}`);
}

function optionalString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  if (value == null) return undefined;
  if (typeof value === "string") return value.trim() === "" ? undefined : value.trim();
  throw new HttpsError("invalid-argument", `Missing or invalid ${key}`);
}

function requiredTimestamp(value: unknown, key: string): Timestamp {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Timestamp.fromMillis(value);
  }
  if (typeof value === "string") {
    const millis = Date.parse(value);
    if (Number.isFinite(millis)) return Timestamp.fromMillis(millis);
  }
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return Timestamp.fromDate((value as { toDate: () => Date }).toDate());
  }
  throw new HttpsError("invalid-argument", `Missing or invalid ${key}`);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function invoiceLineItems(value: unknown): InvoiceLineItem[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpsError("invalid-argument", "Missing or invalid lineItems");
  }

  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new HttpsError("invalid-argument", "Missing or invalid lineItems");
    }
    const raw = item as Record<string, unknown>;
    const description = requiredString(raw, "description");
    const quantity = requiredNumber(raw, "quantity");
    const unitAmount = requiredNumber(raw, "unitAmount");
    const lineTotal = requiredNumber(raw, "lineTotal");
    return {
      ...raw,
      description,
      quantity,
      unitAmount,
      lineTotal,
    };
  });
}

async function sendInvoiceCreatedNotification(
  invoiceId: string,
  invoice: InvoiceDocument,
): Promise<void> {
  const parentId = invoice.parentId;
  if (typeof parentId !== "string" || parentId === "") {
    console.error("Invoice missing parentId", invoiceId);
    return;
  }

  const db = getFirestore();
  const tokensSnap = await db
    .collection("userTokens")
    .doc(parentId)
    .collection("tokens")
    .get();

  const tokens = tokensSnap.docs
    .map(doc => doc.data().token)
    .filter((token): token is string => typeof token === "string" && token !== "");

  if (tokens.length === 0) {
    console.log("No tokens for parent", parentId);
    return;
  }

  const msg: MulticastMessage = {
    notification: {
      title: "Your invoice is ready!",
      body: invoiceCreatedNotificationBody(invoice.amountDue),
    },
    data: {
      type: "invoice",
      invoiceId,
    },
    tokens,
  };

  const res = await getMessaging().sendEachForMulticast(msg);
  console.log(`Sent ${res.successCount}/${tokens.length} invoice notifications`);
  if (res.failureCount > 0) {
    res.responses.forEach((r, i) => {
      if (!r.success) console.error("Failed token:", tokens[i], r.error);
    });
  }
}

export const createInvoice = onCall(async (request) => {
  const requesterId = request.auth?.uid;
  if (!requesterId) {
    throw new HttpsError("unauthenticated", "You must be signed in to create an invoice.");
  }

  if (!request.data || typeof request.data !== "object") {
    throw new HttpsError("invalid-argument", "Request data must be an object.");
  }

  const requestData = request.data as Record<string, unknown>;
  const parentId = requiredString(requestData, "parentId");
  const parentName = requiredString(requestData, "parentName");
  const parentEmail = requiredString(requestData, "parentEmail");
  const lineItems = invoiceLineItems(requestData.lineItems);
  const weeks = requiredInteger(requestData, "weeks");
  const amountDue = requiredNumber(requestData, "amountDue");
  const amountDueComputed = optionalNumber(requestData, "amountDueComputed");
  const amountDueOverride = optionalNumber(requestData, "amountDueOverride");
  const dueDate = requiredTimestamp(requestData.dueDate, "dueDate");
  const studentIds = stringArray(requestData.studentIds);
  const adminNotes = optionalString(requestData, "adminNotes");

  const db = getFirestore();
  const actorSnap = await db.collection("users").doc(requesterId).get();
  if (!actorSnap.exists) {
    throw new HttpsError("permission-denied", "User account not found.");
  }
  const actorData = actorSnap.data() || {};
  if (!canCreateInvoice({
    actorId: requesterId,
    actorRole: actorData.role,
    parentId,
  })) {
    throw new HttpsError("permission-denied", "You cannot create this invoice.");
  }

  const invoiceRef = db.collection("invoices").doc();
  const counterRef = db.collection("counters").doc("invoices");

  const result = await db.runTransaction<{
    invoiceId: string;
    invoiceNumber: string;
    invoice: InvoiceDocument;
  }>(async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    const currentCount = counterDoc.exists && typeof counterDoc.data()?.current === "number"
      ? counterDoc.data()?.current as number
      : 0;
    const nextCount = currentCount + 1;
    const invoiceNumber = String(nextCount);
    const invoice: InvoiceDocument = {
      parentId,
      parentName,
      parentEmail,
      lineItems,
      weeks,
      amountDue,
      amountDueComputed: amountDueComputed ?? null,
      amountDueOverride: amountDueOverride ?? null,
      status: "unpaid",
      dueDate,
      createdAt: FieldValue.serverTimestamp(),
      studentIds,
      invoiceNumber,
      xeroInvoiceId: null,
      stripePaymentIntentId: null,
      paidAt: null,
      adminNotes: adminNotes ?? null,
      createdByAdminId: actorData.role === "admin" ? requesterId : null,
      notificationAction: {
        type: "create_invoice",
        actorId: requesterId,
      },
    };

    transaction.set(counterRef, { current: nextCount }, { merge: true });
    transaction.set(invoiceRef, invoice);

    return {
      invoiceId: invoiceRef.id,
      invoiceNumber,
      invoice,
    };
  });

  try {
    await sendInvoiceCreatedNotification(result.invoiceId, result.invoice);
  } catch (error) {
    console.error("Error sending invoice notification:", error);
  } finally {
    try {
      await invoiceRef.update({
        notificationAction: FieldValue.delete(),
      });
    } catch (error) {
      console.error("Error clearing invoice notification action:", error);
    }
  }

  return {
    invoiceId: result.invoiceId,
    invoiceNumber: result.invoiceNumber,
  };
});

export const invoiceCreatedNotif = onDocumentCreated(
  "invoices/{invoiceId}",
  async (event) => {
    const invoice = event.data?.data();
    if (!invoice) return console.error("No invoice data");
    if (shouldSuppressInvoiceCreatedNotification(
      invoice.notificationAction as { type?: unknown } | undefined,
    )) return;

    const invoiceId = event.params.invoiceId;

    await sendInvoiceCreatedNotification(invoiceId, invoice);
  }
);

export const invoiceReminderScheduler = onSchedule(
  { schedule: "0 10 * * *", timeZone: "Australia/Sydney" },
  async (event) => {
    const db = getFirestore();
    const messaging = getMessaging();
    const today = DateTime.now().setZone("Australia/Sydney").startOf("day");

    const invoicesSnap = await db
      .collection("invoices")
      .where("status", "in", ["unpaid", "overdue"])
      .get();

    for (const doc of invoicesSnap.docs) {
      const invoice = doc.data();
      const invoiceId = doc.id;
      const parentId = invoice.parentId;
      if (!parentId || !invoice.dueDate) continue;

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
