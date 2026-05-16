"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoiceReminderScheduler = exports.invoiceCreatedNotif = void 0;
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const firestore_2 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const luxon_1 = require("luxon");
exports.invoiceCreatedNotif = (0, firestore_2.onDocumentCreated)("invoices/{invoiceId}", async (event) => {
    var _a;
    const invoice = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!invoice)
        return console.error("No invoice data");
    const invoiceId = event.params.invoiceId;
    const parentId = invoice.parentId;
    const db = (0, firestore_1.getFirestore)();
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
exports.invoiceReminderScheduler = (0, scheduler_1.onSchedule)({ schedule: "0 10 * * *", timeZone: "Australia/Sydney" }, // 10am daily
async (event) => {
    var _a, _b, _c, _d, _e, _f;
    const db = (0, firestore_1.getFirestore)();
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
//# sourceMappingURL=invoice_notifications.js.map