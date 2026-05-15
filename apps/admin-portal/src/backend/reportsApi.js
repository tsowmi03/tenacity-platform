import { callFunction } from "./callable";

export function incomeReport(filters) {
  return callFunction("adminIncomeReport", filters);
}

export function invoiceAgingReport(filters) {
  return callFunction("adminInvoiceAgingReport", filters);
}

export function attendanceReport(filters) {
  return callFunction("adminAttendanceReport", filters);
}

export function studentEnrolmentReport(filters) {
  return callFunction("adminStudentEnrolmentReport", filters);
}

export function classUtilisationReport(filters) {
  return callFunction("adminClassUtilisationReport", filters);
}

/**
 * Export a report. The backend re-runs the report internally using the
 * `report` payload, then renders to the requested format.
 */
export function exportReport({ reportType, format, report, fileName }) {
  const payload = { reportType, format };
  if (report)   payload.report   = report;
  if (fileName) payload.fileName = fileName;
  return callFunction("adminExportReport", payload);
}

export function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i += 1) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

/**
 * Build a Blob from a backend export response, handling CSV strings,
 * base64-encoded data, and {type:"Buffer",data:[...]} buffer shapes.
 */
export function exportResultToBlob(result) {
  const contentType = result?.contentType || "application/octet-stream";
  if (typeof result?.csv === "string") {
    return new Blob([result.csv], { type: contentType });
  }
  const data = result?.data;
  if (typeof data === "string") {
    return base64ToBlob(data, contentType);
  }
  if (data && typeof data === "object" && Array.isArray(data.data)) {
    return new Blob([new Uint8Array(data.data)], { type: contentType });
  }
  if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
    return new Blob([data], { type: contentType });
  }
  throw new Error("Export response had no recognisable payload.");
}

export function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName || "report";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
