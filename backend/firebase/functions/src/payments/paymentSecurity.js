"use strict";

const { HttpsError } = require("firebase-functions/v2/https");

function signedInUid(request) {
  const uid = request?.auth?.uid;
  return typeof uid === "string" && uid.trim() !== "" ? uid : null;
}

async function actorRole(request, db) {
  const claimRole = request?.auth?.token?.role;
  if (typeof claimRole === "string" && claimRole.trim() !== "") {
    return claimRole;
  }

  const uid = signedInUid(request);
  if (!uid) return null;

  const userSnap = await db.collection("users").doc(uid).get();
  const role = userSnap.exists ? userSnap.data()?.role : null;
  return typeof role === "string" && role.trim() !== "" ? role : null;
}

async function requireParentOrAdmin(request, parentId, db) {
  const uid = signedInUid(request);
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign-in required");
  }

  if (uid === parentId) {
    return { uid, role: "parent" };
  }

  const role = await actorRole(request, db);
  if (role === "admin") {
    return { uid, role };
  }

  throw new HttpsError("permission-denied", "Cannot manage payments for this parent");
}

function normalizeInvoiceIds(invoiceIds) {
  if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
    throw new HttpsError("invalid-argument", "Missing or invalid invoiceIds");
  }

  const normalized = invoiceIds
    .map((invoiceId) => String(invoiceId).trim())
    .filter(Boolean)
    .sort();

  if (normalized.length === 0 || new Set(normalized).size !== normalized.length) {
    throw new HttpsError("invalid-argument", "Invalid invoiceIds");
  }

  return normalized;
}

function amountDueCents(invoice) {
  const value = invoice?.amountDue;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new HttpsError("failed-precondition", "Invoice has no payable amount");
  }
  return Math.round(value * 100);
}

async function loadValidatedInvoicesForPayment({ db, invoiceIds, parentId, amount }) {
  const normalizedInvoiceIds = normalizeInvoiceIds(invoiceIds);
  let expectedAmountCents = 0;
  const invoices = [];

  for (const invoiceId of normalizedInvoiceIds) {
    const invoiceSnap = await db.collection("invoices").doc(invoiceId).get();
    if (!invoiceSnap.exists) {
      throw new HttpsError("not-found", `Invoice not found: ${invoiceId}`);
    }

    const invoice = invoiceSnap.data();
    if (invoice?.parentId !== parentId) {
      throw new HttpsError("permission-denied", "parentId does not match invoice parentId");
    }
    if (invoice?.status === "paid") {
      throw new HttpsError("failed-precondition", "Invoice is already paid");
    }

    expectedAmountCents += amountDueCents(invoice);
    invoices.push({ id: invoiceId, data: invoice });
  }

  if (amount !== expectedAmountCents) {
    throw new HttpsError("invalid-argument", "Payment amount does not match invoice balance");
  }

  return {
    invoiceIds: normalizedInvoiceIds,
    invoices,
    firstInvoice: invoices[0].data,
    expectedAmountCents,
  };
}

function paymentIntentParentId(paymentIntent) {
  const parentId = paymentIntent?.metadata?.parentId;
  return typeof parentId === "string" && parentId.trim() !== "" ? parentId : null;
}

module.exports = {
  requireParentOrAdmin,
  loadValidatedInvoicesForPayment,
  normalizeInvoiceIds,
  amountDueCents,
  paymentIntentParentId,
};
