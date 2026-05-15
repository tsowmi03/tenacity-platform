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

export function exportReport(reportType, format, rows, fileName) {
  return callFunction("adminExportReport", { reportType, format, rows, fileName });
}

export function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i += 1) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}
