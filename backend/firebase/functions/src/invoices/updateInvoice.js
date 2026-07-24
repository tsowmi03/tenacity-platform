"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { invoiceName, writeAuditLog } = require("../shared/auditLog");
const { updatedMeta, fromDate } = require("../shared/timestamps");
const { assertString, validateShape } = require("../shared/validation");
const { validateUpdateInvoiceInput } = require("./invoiceSchemas");
const { lineItemsTotal } = require("./invoiceFactory");

function validateUpdateInvoicePayload(input) {
  const { invoiceId } = validateShape(input || {}, {
    invoiceId: (v) => assertString(v, "invoiceId", { max: 120 }),
  });
  const updates = validateUpdateInvoiceInput(input || {});
  if (Object.keys(updates).length === 0) {
    throw new HttpsError("invalid-argument", "At least one invoice field is required");
  }
  return { invoiceId, updates };
}

function buildInvoicePatch(before, updates, actorUid, clock) {
  const patch = { ...updatedMeta(actorUid, clock) };
  const effectiveLineItems = updates.lineItems || before.lineItems || [];
  const effectiveOverride =
    updates.amountDueOverride !== undefined
      ? updates.amountDueOverride
      : before.amountDueOverride;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.adminNotes !== undefined) patch.adminNotes = updates.adminNotes;
  if (updates.dueDate !== undefined) patch.dueDate = fromDate(updates.dueDate);
  if (updates.lineItems !== undefined) {
    patch.lineItems = updates.lineItems.map((item) => ({ ...item }));
    patch.amountDueComputed = lineItemsTotal(updates.lineItems);
  }
  if (typeof effectiveOverride === "number") {
    const total = lineItemsTotal(effectiveLineItems);
    if (Math.abs(total - effectiveOverride) >= 0.01) {
      throw new HttpsError(
        "invalid-argument",
        "amountDueOverride must match lineItems total; add an Admin adjustment line for overrides"
      );
    }
    patch.amountDue = effectiveOverride;
  } else if (updates.lineItems !== undefined) {
    patch.amountDue = lineItemsTotal(updates.lineItems);
  }
  if (updates.amountDueOverride !== undefined) {
    patch.amountDueOverride = updates.amountDueOverride;
  }
  return patch;
}

function xeroWarningsForUpdate(before, updates) {
  if (!before.xeroInvoiceId) return [];
  const warnings = [
    "This invoice is already synced to Xero. Make the matching change in Xero manually if the Firestore edit changes customer-facing invoice details.",
  ];
  if (updates.status === "paid" && before.status !== "paid") {
    warnings.push(
      "Automatic Xero payment sync is off, so marking this invoice paid will NOT record the payment in Xero. Enter the payment against the invoice in Xero manually."
    );
  }
  return warnings;
}

function definedOnly(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
  );
}

async function updateInvoiceImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("updateInvoiceImpl requires db");
  if (!actor?.uid) throw new TypeError("updateInvoiceImpl requires actor.uid");

  const ref = db.collection("invoices").doc(payload.invoiceId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `Invoice not found: ${payload.invoiceId}`);
  }
  const before = snap.data() || {};
  const patch = buildInvoicePatch(before, payload.updates, actor.uid, clock);
  await ref.update(patch);
  const warnings = xeroWarningsForUpdate(before, payload.updates);

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.claims?.role || actor.role || null,
      action: "invoice.update",
      targetType: "invoice",
      targetId: payload.invoiceId,
      targetName: invoiceName(before, payload.invoiceId),
      before: definedOnly({
        status: before.status,
        amountDue: before.amountDue,
        amountDueOverride: before.amountDueOverride,
        dueDate: before.dueDate,
        hasXeroInvoice: Boolean(before.xeroInvoiceId),
      }),
      after: definedOnly({
        status: patch.status ?? before.status,
        amountDue: patch.amountDue ?? before.amountDue,
        amountDueOverride:
          patch.amountDueOverride ?? before.amountDueOverride,
        hasXeroInvoice: Boolean(before.xeroInvoiceId),
      }),
      payloadSummary: { fields: Object.keys(payload.updates), warnings },
    },
    { logger, clock }
  );

  return { invoiceId: payload.invoiceId, warnings };
}

const adminUpdateInvoice = onCall({ region: "us-central1" }, async (request) => {
  const actor = requireAdminCallable(request);
  let payload;
  try {
    payload = validateUpdateInvoicePayload(request.data);
  } catch (err) {
    throw toHttpsError(err);
  }
  try {
    return await updateInvoiceImpl({
      payload,
      actor,
      deps: { db: admin.firestore() },
    });
  } catch (err) {
    logger.error("[adminUpdateInvoice] failed", {
      errorMessage: err?.message,
      actorUid: actor.uid,
    });
    throw toHttpsError(err);
  }
});

module.exports = {
  validateUpdateInvoicePayload,
  buildInvoicePatch,
  xeroWarningsForUpdate,
  updateInvoiceImpl,
  adminUpdateInvoice,
};
