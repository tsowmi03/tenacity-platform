type InvoiceNotificationAction = {
  type?: unknown;
};

export function canCreateInvoice(params: {
  actorId: string;
  actorRole: unknown;
  parentId: unknown;
}): boolean {
  const { actorId, actorRole, parentId } = params;
  if (actorRole === "admin") return true;
  return actorRole === "parent" && parentId === actorId;
}

export function shouldSuppressInvoiceCreatedNotification(
  notificationAction?: InvoiceNotificationAction,
): boolean {
  return notificationAction?.type === "create_invoice";
}

export function invoiceCreatedNotificationBody(amountDue: unknown): string {
  const amount = typeof amountDue === "number" && Number.isFinite(amountDue)
    ? amountDue
    : 0;
  return `Invoice for amount $${amount.toFixed(2)}`;
}
