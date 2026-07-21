"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoiceCreatedNotificationBody = exports.shouldSuppressInvoiceCreatedNotification = exports.canCreateInvoice = void 0;
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
//# sourceMappingURL=invoice_action.js.map