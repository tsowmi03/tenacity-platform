"use strict";

const PDFDocument = require("pdfkit");

const NAVY = "#1B3A6B";
const BLUE = "#4A90C4";
const LIGHT_ROW = "#f0f4f8";
const TEXT = "#333333";
const MUTED = "#666666";
const MARGIN = 40;

function reportSubtitle(report) {
  const f = report.filters || {};
  if (f.fromDate && f.toDate) {
    return `${f.fromDate.slice(0, 10)} to ${f.toDate.slice(0, 10)}`;
  }
  if (f.asOfDate) return `As of ${f.asOfDate.slice(0, 10)}`;
  return `Generated ${(report.generatedAt || "").slice(0, 10)}`;
}

function humanLabel(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

function generateReportPdf(title, report, columns, rows) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: "A4", layout: "landscape" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width;
    const contentW = pageW - MARGIN * 2;

    // ── Header ───────────────────────────────────────────────────────────────
    doc.fontSize(18).fillColor(NAVY).text("Tenacity Tutoring", MARGIN, MARGIN);
    doc.fontSize(13).fillColor(NAVY).text(title, MARGIN, doc.y + 3);
    doc.fontSize(9).fillColor(MUTED).text(reportSubtitle(report), MARGIN, doc.y + 2);
    doc.moveDown(0.4);
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(MARGIN + contentW, doc.y)
      .strokeColor(BLUE)
      .lineWidth(1.5)
      .stroke();
    doc.moveDown(0.6);

    // ── Summary ───────────────────────────────────────────────────────────────
    const summary = report.summary || {};
    const summaryEntries = Object.entries(summary);
    if (summaryEntries.length > 0) {
      doc.fontSize(10).fillColor(NAVY).text("Summary", MARGIN, doc.y);
      doc.moveDown(0.3);
      const colW = contentW / Math.min(summaryEntries.length, 4);
      let sx = MARGIN;
      let sy = doc.y;
      summaryEntries.forEach(([key, value], i) => {
        if (i > 0 && i % 4 === 0) {
          sx = MARGIN;
          sy += 30;
        }
        doc.fontSize(7).fillColor(MUTED).text(humanLabel(key), sx + (i % 4) * colW, sy, { width: colW - 6 });
        doc.fontSize(9).fillColor(TEXT).text(String(value ?? ""), sx + (i % 4) * colW, sy + 10, { width: colW - 6 });
      });
      doc.moveDown(1.8);
    }

    // ── Table ────────────────────────────────────────────────────────────────
    const colW = contentW / columns.length;
    const ROW_H = 16;
    const HEADER_H = 18;

    function drawTableHeader(y) {
      doc.fillColor(NAVY).rect(MARGIN, y, contentW, HEADER_H).fill();
      columns.forEach((col, i) => {
        doc
          .fontSize(7.5)
          .fillColor("#ffffff")
          .text(col.header, MARGIN + i * colW + 3, y + 5, {
            width: colW - 6,
            lineBreak: false,
            ellipsis: true,
          });
      });
      return y + HEADER_H;
    }

    let y = drawTableHeader(doc.y);

    rows.forEach((row, idx) => {
      if (y + ROW_H > doc.page.height - 50) {
        doc.addPage({ layout: "landscape" });
        y = drawTableHeader(MARGIN);
      }
      if (idx % 2 === 0) {
        doc.fillColor(LIGHT_ROW).rect(MARGIN, y, contentW, ROW_H).fill();
      }
      columns.forEach((col, i) => {
        const val = row[col.key];
        const text = val === null || val === undefined ? "" : String(val);
        doc
          .fontSize(7)
          .fillColor(TEXT)
          .text(text, MARGIN + i * colW + 3, y + 4, {
            width: colW - 6,
            lineBreak: false,
            ellipsis: true,
          });
      });
      y += ROW_H;
    });

    // ── Footer ────────────────────────────────────────────────────────────────
    const pageH = doc.page.height;
    doc
      .fontSize(7)
      .fillColor(MUTED)
      .text(
        `${rows.length} row${rows.length !== 1 ? "s" : ""}  ·  Generated ${report.generatedAt || ""}`,
        MARGIN,
        pageH - 30,
        { align: "left" }
      );

    doc.end();
  });
}

module.exports = { generateReportPdf };
