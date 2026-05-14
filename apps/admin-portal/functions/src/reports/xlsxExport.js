"use strict";

const XLSX = require("xlsx");

function summaryToRows(summary) {
  return Object.entries(summary).map(([key, value]) => {
    const label = key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (s) => s.toUpperCase());
    return { Metric: label, Value: value };
  });
}

function buildDataRows(rows, columns) {
  return rows.map((row) => {
    const out = {};
    columns.forEach((col) => {
      const val = row[col.key];
      out[col.header] = val === null || val === undefined ? "" : val;
    });
    return out;
  });
}

function applyColumnWidths(ws, columns) {
  ws["!cols"] = columns.map((col) => ({
    wch: Math.max(col.header.length, 12),
  }));
}

function reportToXlsx(report, columns, rows) {
  const wb = XLSX.utils.book_new();

  const summaryWs = XLSX.utils.json_to_sheet(summaryToRows(report.summary || {}));
  summaryWs["!cols"] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

  const dataRows = buildDataRows(rows, columns);
  const dataWs = XLSX.utils.json_to_sheet(dataRows);
  applyColumnWidths(dataWs, columns);
  XLSX.utils.book_append_sheet(wb, dataWs, "Data");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf.toString("base64");
}

module.exports = { reportToXlsx };
