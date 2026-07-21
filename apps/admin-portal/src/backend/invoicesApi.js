import { BackendError, callFunction } from "./callable";
import { getDocument, listDocuments, orderBy } from "./firestoreReads";
import { getDownloadUrlForPath } from "./storage";
import { normalizeInvoice } from "./schemas";

export function listInvoices() {
  return listDocuments("invoices", {
    constraints: [orderBy("createdAt", "desc")],
    normalize: normalizeInvoice,
  });
}

export function listInvoiceDrafts() {
  return listDocuments("invoiceDrafts", {
    constraints: [orderBy("createdAt", "desc")],
    normalize: (id, data) => normalizeInvoice(id, data, { draft: true }),
  });
}

export async function getInvoice(id, { draft = false } = {}) {
  return getDocument(draft ? "invoiceDrafts" : "invoices", id, {
    normalize: (docId, data) => normalizeInvoice(docId, data, { draft }),
  });
}

export function createInvoice(payload) {
  return callFunction("adminCreateInvoice", payload);
}

export function createInvoiceDraft(payload) {
  return callFunction("adminCreateInvoiceDraft", payload);
}

export function updateInvoice(invoiceId, updates) {
  return callFunction("adminUpdateInvoice", { invoiceId, ...updates });
}

export function deleteInvoice(invoiceId, confirmInvoiceId, acknowledgeXeroWarning = false) {
  return callFunction("adminDeleteInvoice", {
    invoiceId,
    confirmInvoiceId,
    acknowledgeXeroWarning,
  });
}

export async function getInvoicePdf(invoiceId) {
  const result = await callFunction("adminGetInvoicePdf", { invoiceId });
  const pdfPath = result?.pdfPath || null;
  const directUrl = result?.downloadUrl || null;
  if (directUrl) return { ...result, pdfPath, downloadUrl: directUrl };
  if (!pdfPath) {
    throw new BackendError({
      code: "not-found",
      message: "No PDF has been generated for this invoice yet.",
    });
  }
  const downloadUrl = await getDownloadUrlForPath(pdfPath);
  return { ...result, pdfPath, downloadUrl };
}
