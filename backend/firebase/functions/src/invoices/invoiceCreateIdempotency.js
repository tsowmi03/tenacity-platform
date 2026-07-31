"use strict";

const { createHash } = require("node:crypto");
const { FieldValue } = require("firebase-admin/firestore");

const REQUEST_COLLECTION = "invoiceCreateRequests";

class InvoiceCreateRequestConflictError extends Error {
  constructor() {
    super("createRequestId was already used with different invoice details");
    this.name = "InvoiceCreateRequestConflictError";
    this.code = "invoice-create-request-conflict";
  }
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError("Invoice create payload contains an invalid Date");
    }
    return `{"$timestampMillis":${value.getTime()}}`;
  }
  if (typeof value.toMillis === "function") {
    const millis = value.toMillis();
    if (typeof millis !== "number" || !Number.isFinite(millis)) {
      throw new TypeError(
        "Invoice create payload contains an invalid Timestamp"
      );
    }
    return `{"$timestampMillis":${millis}}`;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  const entries = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
  return `{${entries.join(",")}}`;
}

function fingerprintInvoiceCreatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("Invoice create payload must be an object");
  }
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function invoiceCreateRequestDocumentId(requesterId, createRequestId) {
  if (typeof requesterId !== "string" || requesterId.trim() === "") {
    throw new TypeError("requesterId must be a non-empty string");
  }
  if (
    typeof createRequestId !== "string" ||
    createRequestId.trim() === ""
  ) {
    throw new TypeError("createRequestId must be a non-empty string");
  }

  return createHash("sha256")
    .update(requesterId)
    .update("\0")
    .update(createRequestId)
    .digest("hex");
}

/**
 * Atomically creates one invoice for a requester/request-id pair.
 *
 * The request record, invoice, and counter update share a transaction. A retry
 * therefore returns the original invoice without writing another invoice
 * document or incrementing the counter.
 */
async function createInvoiceOnce({
  db,
  requesterId,
  createRequestId,
  payloadFingerprint,
  buildInvoice,
}) {
  if (!db) throw new TypeError("createInvoiceOnce requires db");
  if (typeof requesterId !== "string" || requesterId.trim() === "") {
    throw new TypeError("createInvoiceOnce requires requesterId");
  }
  if (typeof buildInvoice !== "function") {
    throw new TypeError("createInvoiceOnce requires buildInvoice");
  }

  if (createRequestId != null && typeof createRequestId !== "string") {
    throw new TypeError("createRequestId must be a string");
  }
  const normalizedRequestId =
    createRequestId == null ? null : createRequestId.trim();
  if (normalizedRequestId === "") {
    throw new TypeError("createRequestId must be a non-empty string");
  }
  if (
    normalizedRequestId != null &&
    (typeof payloadFingerprint !== "string" ||
      payloadFingerprint.trim() === "")
  ) {
    throw new TypeError(
      "createInvoiceOnce requires payloadFingerprint with createRequestId"
    );
  }

  const invoiceRef = db.collection("invoices").doc();
  const counterRef = db.collection("counters").doc("invoices");
  const requestRef =
    normalizedRequestId == null
      ? null
      : db
          .collection(REQUEST_COLLECTION)
          .doc(
            invoiceCreateRequestDocumentId(
              requesterId,
              normalizedRequestId
            )
          );

  return db.runTransaction(async (transaction) => {
    if (requestRef) {
      const requestSnapshot = await transaction.get(requestRef);
      if (requestSnapshot.exists) {
        const prior = requestSnapshot.data() || {};
        if (prior.payloadFingerprint !== payloadFingerprint) {
          throw new InvoiceCreateRequestConflictError();
        }
        if (
          typeof prior.invoiceId !== "string" ||
          prior.invoiceId === "" ||
          typeof prior.invoiceNumber !== "string" ||
          prior.invoiceNumber === ""
        ) {
          throw new Error(
            `Invoice create request ${requestRef.id} is incomplete`
          );
        }
        return {
          created: false,
          invoiceId: prior.invoiceId,
          invoiceNumber: prior.invoiceNumber,
          invoice: null,
        };
      }
    }

    const counterSnapshot = await transaction.get(counterRef);
    const counterData = counterSnapshot.data() || {};
    const currentCount =
      counterSnapshot.exists && typeof counterData.current === "number"
        ? counterData.current
        : 0;
    const nextCount = currentCount + 1;
    const invoiceNumber = String(nextCount);
    const invoice = buildInvoice(invoiceNumber);

    transaction.set(counterRef, { current: nextCount }, { merge: true });
    transaction.set(invoiceRef, invoice);
    if (requestRef) {
      transaction.set(requestRef, {
        requesterId,
        createRequestId: normalizedRequestId,
        payloadFingerprint,
        invoiceId: invoiceRef.id,
        invoiceNumber,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      created: true,
      invoiceId: invoiceRef.id,
      invoiceNumber,
      invoice,
    };
  });
}

module.exports = {
  InvoiceCreateRequestConflictError,
  REQUEST_COLLECTION,
  fingerprintInvoiceCreatePayload,
  createInvoiceOnce,
  invoiceCreateRequestDocumentId,
};
