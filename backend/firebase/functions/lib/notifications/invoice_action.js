"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoicePaidNotificationContent = exports.shouldNotifyInvoicePaid = exports.invoiceCreatedNotificationBody = exports.shouldSuppressInvoiceCreatedNotification = exports.canCreateInvoice = void 0;
function canCreateInvoice(params) {
    const { actorId, actorRole, parentId } = params;
    if (actorRole === "admin")
        return true;
    return actorRole === "parent" && parentId === actorId;
}
exports.canCreateInvoice = canCreateInvoice;
function shouldSuppressInvoiceCreatedNotification(notificationAction) {
    return (notificationAction === null || notificationAction === void 0 ? void 0 : notificationAction.type) === "create_invoice";
}
exports.shouldSuppressInvoiceCreatedNotification = shouldSuppressInvoiceCreatedNotification;
function invoiceCreatedNotificationBody(amountDue) {
    const amount = typeof amountDue === "number" && Number.isFinite(amountDue)
        ? amountDue
        : 0;
    return `Invoice for amount $${amount.toFixed(2)}`;
}
exports.invoiceCreatedNotificationBody = invoiceCreatedNotificationBody;
function shouldNotifyInvoicePaid(before, after) {
    if (!before || !after)
        return false;
    return before.status !== "paid" && after.status === "paid";
}
exports.shouldNotifyInvoicePaid = shouldNotifyInvoicePaid;
function formatAmount(amount) {
    const value = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
    return `$${value.toFixed(2)}`;
}
/**
 * Build the admin-facing copy for a paid invoice. When the automatic Xero
 * payment sync is off the message has to spell out the manual action, because
 * nothing else will mark the invoice off in Xero. Once sync is reconnected the
 * same notification keeps sending, minus the manual-entry wording.
 */
function invoicePaidNotificationContent(params) {
    const { parentName, invoiceNumber, amountPaid, xeroInvoiceId, xeroSyncEnabled } = params;
    const payer = parentName || "A parent";
    const amount = formatAmount(amountPaid);
    const reference = invoiceNumber ? `invoice ${invoiceNumber}` : "an invoice";
    // Only prompt manual Xero entry when sync is off AND the invoice actually
    // exists in Xero; an invoice that never synced has nothing to mark off.
    const needsManualXero = !xeroSyncEnabled && Boolean(xeroInvoiceId);
    const title = needsManualXero ? "Invoice paid — enter in Xero" : "Invoice paid";
    const body = needsManualXero
        ? `${payer} paid ${amount} for ${reference}. Record this payment in Xero manually.`
        : `${payer} paid ${amount} for ${reference}.`;
    const subject = invoiceNumber
        ? `${title}: ${invoiceNumber} (${amount})`
        : `${title}: ${amount}`;
    const xeroLine = needsManualXero
        ? "<p><strong>Automatic Xero payment sync is off.</strong> Record this payment against the invoice in Xero manually.</p>"
        : "";
    const html = [
        `<p>${payer} has paid ${amount} for ${reference}.</p>`,
        "<ul>",
        `<li>Invoice number: ${invoiceNumber || "—"}</li>`,
        `<li>Amount paid: ${amount}</li>`,
        `<li>Xero invoice ID: ${xeroInvoiceId || "not synced to Xero"}</li>`,
        "</ul>",
        xeroLine,
    ]
        .filter(Boolean)
        .join("\n");
    return { title, body, subject, html, needsManualXero };
}
exports.invoicePaidNotificationContent = invoicePaidNotificationContent;
