"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onInvoicePaidNotifyAdmins = exports.invoiceReminderScheduler = exports.invoiceCreatedNotif = exports.createInvoice = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const params_1 = require("firebase-functions/params");
const firestore_2 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const luxon_1 = require("luxon");
const sgMail = require("@sendgrid/mail");
const invoice_action_1 = require("./invoice_action");
const shared_1 = require("./shared");
const xero_sync_flag_1 = require("../xero_sync_flag");
const sendgridApiKey = (0, params_1.defineSecret)("SENDGRID_API_KEY");
const ADMIN_NOTIFY_EMAIL = "admin@tenacitytutoring.com";
function requiredString(data, key) {
    const value = data[key];
    if (typeof value !== "string" || value.trim() === "") {
        throw new https_1.HttpsError("invalid-argument", `Missing or invalid ${key}`);
    }
    return value.trim();
}
function requiredNumber(data, key) {
    const value = data[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new https_1.HttpsError("invalid-argument", `Missing or invalid ${key}`);
    }
    return value;
}
function requiredInteger(data, key) {
    const value = requiredNumber(data, key);
    if (!Number.isInteger(value)) {
        throw new https_1.HttpsError("invalid-argument", `Missing or invalid ${key}`);
    }
    return value;
}
function optionalNumber(data, key) {
    const value = data[key];
    if (value == null)
        return undefined;
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    throw new https_1.HttpsError("invalid-argument", `Missing or invalid ${key}`);
}
function optionalString(data, key) {
    const value = data[key];
    if (value == null)
        return undefined;
    if (typeof value === "string")
        return value.trim() === "" ? undefined : value.trim();
    throw new https_1.HttpsError("invalid-argument", `Missing or invalid ${key}`);
}
function requiredTimestamp(value, key) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return firestore_2.Timestamp.fromMillis(value);
    }
    if (typeof value === "string") {
        const millis = Date.parse(value);
        if (Number.isFinite(millis))
            return firestore_2.Timestamp.fromMillis(millis);
    }
    if (value instanceof Date)
        return firestore_2.Timestamp.fromDate(value);
    if (value && typeof value.toDate === "function") {
        return firestore_2.Timestamp.fromDate(value.toDate());
    }
    throw new https_1.HttpsError("invalid-argument", `Missing or invalid ${key}`);
}
function stringArray(value) {
    return Array.isArray(value)
        ? value.filter((item) => typeof item === "string")
        : [];
}
function invoiceLineItems(value) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "Missing or invalid lineItems");
    }
    return value.map((item) => {
        if (!item || typeof item !== "object") {
            throw new https_1.HttpsError("invalid-argument", "Missing or invalid lineItems");
        }
        const raw = item;
        const description = requiredString(raw, "description");
        const quantity = requiredNumber(raw, "quantity");
        const unitAmount = requiredNumber(raw, "unitAmount");
        const lineTotal = requiredNumber(raw, "lineTotal");
        return Object.assign(Object.assign({}, raw), { description,
            quantity,
            unitAmount,
            lineTotal });
    });
}
async function sendInvoiceCreatedNotification(invoiceId, invoice) {
    const parentId = invoice.parentId;
    if (typeof parentId !== "string" || parentId === "") {
        console.error("Invoice missing parentId", invoiceId);
        return;
    }
    const db = (0, firestore_2.getFirestore)();
    const tokensSnap = await db
        .collection("userTokens")
        .doc(parentId)
        .collection("tokens")
        .get();
    const tokens = tokensSnap.docs
        .map(doc => doc.data().token)
        .filter((token) => typeof token === "string" && token !== "");
    if (tokens.length === 0) {
        console.log("No tokens for parent", parentId);
        return;
    }
    const msg = {
        notification: {
            title: "Your invoice is ready!",
            body: (0, invoice_action_1.invoiceCreatedNotificationBody)(invoice.amountDue),
        },
        data: {
            type: "invoice",
            invoiceId,
        },
        tokens,
    };
    const res = await (0, messaging_1.getMessaging)().sendEachForMulticast(msg);
    console.log(`Sent ${res.successCount}/${tokens.length} invoice notifications`);
    if (res.failureCount > 0) {
        res.responses.forEach((r, i) => {
            if (!r.success)
                console.error("Failed token:", tokens[i], r.error);
        });
    }
}
exports.createInvoice = (0, https_1.onCall)(async (request) => {
    var _a;
    const requesterId = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!requesterId) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to create an invoice.");
    }
    if (!request.data || typeof request.data !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Request data must be an object.");
    }
    const requestData = request.data;
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
    const stripePaymentIntentId = optionalString(requestData, "stripePaymentIntentId");
    const alreadyPaid = typeof stripePaymentIntentId === "string";
    const db = (0, firestore_2.getFirestore)();
    const actorSnap = await db.collection("users").doc(requesterId).get();
    if (!actorSnap.exists) {
        throw new https_1.HttpsError("permission-denied", "User account not found.");
    }
    const actorData = actorSnap.data() || {};
    if (!(0, invoice_action_1.canCreateInvoice)({
        actorId: requesterId,
        actorRole: actorData.role,
        parentId,
    })) {
        throw new https_1.HttpsError("permission-denied", "You cannot create this invoice.");
    }
    const invoiceRef = db.collection("invoices").doc();
    const counterRef = db.collection("counters").doc("invoices");
    const result = await db.runTransaction(async (transaction) => {
        var _a, _b;
        const counterDoc = await transaction.get(counterRef);
        const currentCount = counterDoc.exists && typeof ((_a = counterDoc.data()) === null || _a === void 0 ? void 0 : _a.current) === "number"
            ? (_b = counterDoc.data()) === null || _b === void 0 ? void 0 : _b.current
            : 0;
        const nextCount = currentCount + 1;
        const invoiceNumber = String(nextCount);
        const invoice = {
            parentId,
            parentName,
            parentEmail,
            lineItems,
            weeks,
            amountDue,
            amountDueComputed: amountDueComputed !== null && amountDueComputed !== void 0 ? amountDueComputed : null,
            amountDueOverride: amountDueOverride !== null && amountDueOverride !== void 0 ? amountDueOverride : null,
            status: alreadyPaid ? "paid" : "unpaid",
            dueDate,
            createdAt: firestore_2.FieldValue.serverTimestamp(),
            studentIds,
            invoiceNumber,
            xeroInvoiceId: null,
            stripePaymentIntentId: stripePaymentIntentId !== null && stripePaymentIntentId !== void 0 ? stripePaymentIntentId : null,
            paidAt: alreadyPaid ? firestore_2.FieldValue.serverTimestamp() : null,
            adminNotes: adminNotes !== null && adminNotes !== void 0 ? adminNotes : null,
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
    }
    catch (error) {
        console.error("Error sending invoice notification:", error);
    }
    finally {
        try {
            await invoiceRef.update({
                notificationAction: firestore_2.FieldValue.delete(),
            });
        }
        catch (error) {
            console.error("Error clearing invoice notification action:", error);
        }
    }
    return {
        invoiceId: result.invoiceId,
        invoiceNumber: result.invoiceNumber,
    };
});
exports.invoiceCreatedNotif = (0, firestore_1.onDocumentCreated)("invoices/{invoiceId}", async (event) => {
    var _a;
    const invoice = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!invoice)
        return console.error("No invoice data");
    if ((0, invoice_action_1.shouldSuppressInvoiceCreatedNotification)(invoice.notificationAction))
        return;
    const invoiceId = event.params.invoiceId;
    await sendInvoiceCreatedNotification(invoiceId, invoice);
});
exports.invoiceReminderScheduler = (0, scheduler_1.onSchedule)({ schedule: "0 10 * * *", timeZone: "Australia/Sydney" }, async (event) => {
    var _a, _b, _c, _d, _e, _f;
    const db = (0, firestore_2.getFirestore)();
    const messaging = (0, messaging_1.getMessaging)();
    const today = luxon_1.DateTime.now().setZone("Australia/Sydney").startOf("day");
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
/**
 * Tell the admins an invoice has been paid.
 *
 * This deliberately hangs off the invoice document rather than the Stripe
 * webhook, so it covers every way an invoice can end up paid: a single Stripe
 * payment, the multi-invoice payoff branch, and an admin marking an invoice
 * paid by hand in the portal. It is also independent of the Xero payment sync,
 * so it keeps working whether XERO_PAYMENT_SYNC is on or off — while it is off,
 * this notification is the prompt for an admin to enter the payment in Xero by
 * hand.
 */
exports.onInvoicePaidNotifyAdmins = (0, firestore_1.onDocumentUpdated)({
    document: "invoices/{invoiceId}",
    secrets: [sendgridApiKey],
}, async (event) => {
    var _a, _b;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!(0, invoice_action_1.shouldNotifyInvoicePaid)(before, after))
        return;
    const invoiceId = event.params.invoiceId;
    // Before the paid write, amountDue holds the amount that was outstanding;
    // after it is typically 0. Prefer the pre-payment figure.
    const amountPaid = typeof before.amountDue === "number" && before.amountDue > 0
        ? before.amountDue
        : after.amountDue;
    const content = (0, invoice_action_1.invoicePaidNotificationContent)({
        parentName: after.parentName,
        invoiceNumber: after.invoiceNumber,
        amountPaid,
        xeroInvoiceId: after.xeroInvoiceId,
        xeroSyncEnabled: (0, xero_sync_flag_1.xeroPaymentSyncEnabled)(),
    });
    // Push and email are independent: a failure in one must not suppress the
    // other, and neither should throw (the invoice is already paid — retrying
    // the trigger would just resend notifications).
    try {
        const tokens = await (0, shared_1.getAdminTokens)();
        if (tokens.length) {
            const res = await (0, messaging_1.getMessaging)().sendEachForMulticast({
                notification: { title: content.title, body: content.body },
                data: {
                    type: "invoice_paid",
                    invoiceId,
                    invoiceNumber: after.invoiceNumber || "",
                    xeroInvoiceId: after.xeroInvoiceId || "",
                },
                tokens,
            });
            console.log(`Sent ${res.successCount}/${tokens.length} invoice paid notifications for ${invoiceId}`);
            if (res.failureCount > 0) {
                res.responses.forEach((r, i) => {
                    if (!r.success)
                        console.error("Failed token:", tokens[i], r.error);
                });
            }
        }
        else {
            console.log("No admin tokens for invoice paid notification", invoiceId);
        }
    }
    catch (err) {
        console.error(`Failed to push invoice paid notification for ${invoiceId}:`, err);
    }
    try {
        const apiKey = sendgridApiKey.value();
        if (!apiKey)
            throw new Error("Missing SENDGRID_API_KEY secret");
        sgMail.setApiKey(apiKey);
        await sgMail.send({
            to: ADMIN_NOTIFY_EMAIL,
            from: "no-reply@tenacitytutoring.com",
            subject: content.subject,
            html: content.html,
        });
        console.log(`Invoice paid email sent for ${invoiceId} to ${ADMIN_NOTIFY_EMAIL}`);
    }
    catch (err) {
        console.error(`Failed to email invoice paid notification for ${invoiceId}:`, err);
    }
});
//# sourceMappingURL=invoices.js.map