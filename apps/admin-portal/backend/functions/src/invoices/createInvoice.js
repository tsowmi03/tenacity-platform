"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { writeAuditLog } = require("../shared/auditLog");
const { validateCreateInvoiceInput } = require("./invoiceSchemas");
const { buildInvoiceDoc, buildInvoiceDraftDoc } = require("./invoiceFactory");
const { loadInvoiceParties } = require("./invoiceParties");

async function allocateInvoiceNumber(txn, counterRef) {
  const snap = await txn.get(counterRef);
  const current =
    snap.exists && typeof snap.data()?.current === "number"
      ? snap.data().current
      : 0;
  const next = current + 1;
  txn.set(counterRef, { current: next }, { merge: true });
  return String(next);
}

async function createInvoiceImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("createInvoiceImpl requires db");
  if (!actor?.uid) throw new TypeError("createInvoiceImpl requires actor.uid");

  await loadInvoiceParties(db, {
    parentId: payload.parentId,
    studentIds: payload.studentIds,
  });

  const invoiceRef = db.collection("invoices").doc();
  const counterRef = db.collection("counters").doc("invoices");

  const result = await db.runTransaction(async (txn) => {
    const invoiceNumber = await allocateInvoiceNumber(txn, counterRef);
    const invoiceDoc = buildInvoiceDoc(payload, {
      actorUid: actor.uid,
      invoiceNumber,
      clock,
    });
    txn.set(invoiceRef, invoiceDoc);
    return { invoiceNumber, invoiceDoc };
  });

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: "invoice.create",
      targetType: "invoice",
      targetId: invoiceRef.id,
      payloadSummary: {
        parentId: payload.parentId,
        studentIds: payload.studentIds,
        amountDue: result.invoiceDoc.amountDue,
        invoiceNumber: result.invoiceNumber,
      },
    },
    { logger, clock }
  );

  return {
    invoiceId: invoiceRef.id,
    invoiceNumber: result.invoiceNumber,
    warnings: [
      "Creating an invoice writes Firestore. Existing invoice triggers may create and email the matching Xero invoice.",
    ],
  };
}

async function createInvoiceDraftImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("createInvoiceDraftImpl requires db");
  if (!actor?.uid) {
    throw new TypeError("createInvoiceDraftImpl requires actor.uid");
  }

  await loadInvoiceParties(db, {
    parentId: payload.parentId,
    studentIds: payload.studentIds,
  });

  const draftRef = db.collection("invoiceDrafts").doc();
  const draftDoc = buildInvoiceDraftDoc(payload, { actorUid: actor.uid, clock });
  await draftRef.set(draftDoc);

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: "invoiceDraft.create",
      targetType: "invoiceDraft",
      targetId: draftRef.id,
      payloadSummary: {
        parentId: payload.parentId,
        studentIds: payload.studentIds,
        amountDue: draftDoc.amountDue,
      },
    },
    { logger, clock }
  );

  return {
    draftId: draftRef.id,
    warnings: ["Drafts are saved outside invoices and do not trigger Xero."],
  };
}

function validatePayload(input) {
  try {
    return validateCreateInvoiceInput(input);
  } catch (err) {
    throw toHttpsError(err);
  }
}

const adminCreateInvoice = onCall({ region: "us-central1" }, async (request) => {
  const actor = requireAdminCallable(request);
  const payload = validatePayload(request.data);
  try {
    return await createInvoiceImpl({
      payload,
      actor,
      deps: { db: admin.firestore() },
    });
  } catch (err) {
    logger.error("[adminCreateInvoice] failed", {
      errorMessage: err?.message,
      actorUid: actor.uid,
    });
    throw toHttpsError(err);
  }
});

const adminCreateInvoiceDraft = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    const payload = validatePayload(request.data);
    try {
      return await createInvoiceDraftImpl({
        payload,
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminCreateInvoiceDraft] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  allocateInvoiceNumber,
  createInvoiceImpl,
  createInvoiceDraftImpl,
  adminCreateInvoice,
  adminCreateInvoiceDraft,
};
