"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { writeAuditLog } = require("../shared/auditLog");
const {
  assertBoolean,
  assertString,
  validateShape,
} = require("../shared/validation");

function validateDeleteInvoicePayload(input) {
  return validateShape(input || {}, {
    invoiceId: (v) => assertString(v, "invoiceId", { max: 120 }),
    confirmInvoiceId: (v) => assertString(v, "confirmInvoiceId", { max: 120 }),
    acknowledgeXeroWarning: (v) =>
      v === undefined ? false : assertBoolean(v, "acknowledgeXeroWarning"),
  });
}

async function deleteStoredPdf({ storage, path }) {
  if (!path) return { attempted: false, deleted: false };
  try {
    await storage.bucket().file(path).delete();
    return { attempted: true, deleted: true };
  } catch (err) {
    const code = err?.code || err?.errors?.[0]?.reason;
    if (code === 404 || code === "notFound") {
      return { attempted: true, deleted: false, missing: true };
    }
    logger.warn("[adminDeleteInvoice] PDF delete failed", {
      path,
      errorMessage: err?.message,
    });
    return {
      attempted: true,
      deleted: false,
      errorMessage: err?.message || "PDF delete failed",
    };
  }
}

async function deleteInvoiceImpl({ payload, actor, deps }) {
  const { db, storage, clock } = deps;
  if (!db) throw new TypeError("deleteInvoiceImpl requires db");
  if (!storage) throw new TypeError("deleteInvoiceImpl requires storage");
  if (!actor?.uid) throw new TypeError("deleteInvoiceImpl requires actor.uid");

  if (payload.invoiceId !== payload.confirmInvoiceId) {
    throw new HttpsError(
      "failed-precondition",
      "confirmInvoiceId does not match invoiceId"
    );
  }

  const ref = db.collection("invoices").doc(payload.invoiceId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `Invoice not found: ${payload.invoiceId}`);
  }
  const before = snap.data() || {};
  const hasXeroInvoice = Boolean(before.xeroInvoiceId);
  if (hasXeroInvoice && payload.acknowledgeXeroWarning !== true) {
    throw new HttpsError(
      "failed-precondition",
      "acknowledgeXeroWarning must be true before deleting a Xero-synced invoice"
    );
  }

  const pdfDelete = await deleteStoredPdf({
    storage,
    path: before.xeroInvoicePdfPath,
  });
  await ref.delete();

  const warnings = hasXeroInvoice
    ? [
        "This invoice was hard-deleted from Firestore only. Xero was not changed and must be updated manually if required.",
      ]
    : [];

  const beforeAudit = {
    parentId: before.parentId,
    studentIds: before.studentIds,
    status: before.status,
    amountDue: before.amountDue,
  };
  if (before.invoiceNumber !== undefined) {
    beforeAudit.invoiceNumber = before.invoiceNumber;
  }
  if (before.xeroInvoiceId !== undefined) {
    beforeAudit.xeroInvoiceId = before.xeroInvoiceId;
  }
  if (before.xeroInvoicePdfPath !== undefined) {
    beforeAudit.xeroInvoicePdfPath = before.xeroInvoicePdfPath;
  }

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: "invoice.delete",
      targetType: "invoice",
      targetId: payload.invoiceId,
      before: beforeAudit,
      payloadSummary: { hardDeleted: true, pdfDelete, warnings },
    },
    { logger, clock }
  );

  return { invoiceId: payload.invoiceId, hardDeleted: true, pdfDelete, warnings };
}

const adminDeleteInvoice = onCall({ region: "us-central1" }, async (request) => {
  const actor = requireAdminCallable(request);
  let payload;
  try {
    payload = validateDeleteInvoicePayload(request.data);
  } catch (err) {
    throw toHttpsError(err);
  }
  try {
    return await deleteInvoiceImpl({
      payload,
      actor,
      deps: { db: admin.firestore(), storage: admin.storage() },
    });
  } catch (err) {
    logger.error("[adminDeleteInvoice] failed", {
      errorMessage: err?.message,
      actorUid: actor.uid,
    });
    throw toHttpsError(err);
  }
});

module.exports = {
  validateDeleteInvoicePayload,
  deleteStoredPdf,
  deleteInvoiceImpl,
  adminDeleteInvoice,
};
