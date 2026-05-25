"use strict";

const {
  AlignmentType,
  BorderStyle,
  ImageRun,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} = require("docx");

const { generateDiagram } = require("../diagramGenerator");
const { BRAND, PAGE } = require("./branding");
const { cleanText } = require("./shared");

const DIAGRAM_TARGET_WIDTH = 280;

function tableTextRun(text, opts = {}) {
  return new TextRun({
    text: cleanText(text),
    font: BRAND.FONT,
    size: opts.size || BRAND.FONT_SIZE_SMALL,
    bold: opts.bold,
  });
}

function twoWayTableBlock(spec) {
  const rowLabels = Array.isArray(spec?.rows) ? spec.rows : [];
  const colLabels = Array.isArray(spec?.cols) ? spec.cols : [];
  const data = Array.isArray(spec?.data) ? spec.data : [];
  const showTotals = !!spec?.totals;
  const nCols = colLabels.length + 1 + (showTotals ? 1 : 0);
  const cellWidth = Math.min(
    1200,
    Math.max(700, Math.floor(PAGE.CONTENT_WIDTH / Math.max(nCols, 5)))
  );
  const totalWidth = cellWidth * nCols;
  const columnWidths = Array(nCols).fill(cellWidth);

  const colTotals = colLabels.map((_, colIndex) =>
    data.reduce((sum, row) => sum + (Number(row?.[colIndex]) || 0), 0)
  );
  const rowTotals = data.map((row) =>
    Array.isArray(row) ? row.reduce((sum, value) => sum + (Number(value) || 0), 0) : 0
  );
  const grandTotal = rowTotals.reduce((sum, value) => sum + value, 0);

  const thin = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  const bold = { style: BorderStyle.SINGLE, size: 12, color: "000000" };
  const cellMargins = { top: 80, bottom: 80, left: 100, right: 100 };

  const makeCell = (value, opts = {}) => {
    const {
      bold: isBold = false,
      shading,
      borderRight,
      borderBottom,
      borderTop,
    } = opts;
    return new TableCell({
      width: { size: cellWidth, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      margins: cellMargins,
      shading: shading ? { fill: shading, type: ShadingType.CLEAR } : undefined,
      borders: {
        top: borderTop || thin,
        bottom: borderBottom || thin,
        left: thin,
        right: borderRight || thin,
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0 },
          children: [tableTextRun(value, { bold: isBold })],
        }),
      ],
    });
  };

  const rows = [];
  const headerCells = [
    makeCell(spec?.rowHeader || "", {
      bold: true,
      shading: BRAND.LIGHT_GREY,
      borderRight: bold,
      borderBottom: bold,
    }),
  ];

  colLabels.forEach((label, index) => {
    const isLastDataCol = index === colLabels.length - 1;
    headerCells.push(
      makeCell(label, {
        bold: true,
        shading: BRAND.LIGHT_GREY,
        borderBottom: bold,
        borderRight: showTotals && isLastDataCol ? bold : thin,
      })
    );
  });

  if (showTotals) {
    headerCells.push(
      makeCell("Total", {
        bold: true,
        shading: BRAND.LIGHT_GREY,
        borderBottom: bold,
      })
    );
  }
  rows.push(new TableRow({ cantSplit: true, children: headerCells }));

  rowLabels.forEach((label, rowIndex) => {
    const cells = [
      makeCell(label, {
        bold: true,
        shading: BRAND.LIGHT_GREY,
        borderRight: bold,
      }),
    ];
    colLabels.forEach((_, colIndex) => {
      const isLastDataCol = colIndex === colLabels.length - 1;
      cells.push(
        makeCell(data[rowIndex]?.[colIndex] ?? "", {
          borderRight: showTotals && isLastDataCol ? bold : thin,
        })
      );
    });
    if (showTotals) {
      cells.push(makeCell(rowTotals[rowIndex], { bold: true, shading: BRAND.LIGHT_GREY }));
    }
    rows.push(new TableRow({ cantSplit: true, children: cells }));
  });

  if (showTotals) {
    const totalCells = [
      makeCell("Total", {
        bold: true,
        shading: BRAND.LIGHT_GREY,
        borderRight: bold,
        borderTop: bold,
      }),
    ];
    colTotals.forEach((total, index) => {
      const isLastDataCol = index === colLabels.length - 1;
      totalCells.push(
        makeCell(total, {
          bold: true,
          shading: BRAND.LIGHT_GREY,
          borderTop: bold,
          borderRight: isLastDataCol ? bold : thin,
        })
      );
    });
    totalCells.push(
      makeCell(grandTotal, {
        bold: true,
        shading: BRAND.LIGHT_GREY,
        borderTop: bold,
      })
    );
    rows.push(new TableRow({ cantSplit: true, children: totalCells }));
  }

  const block = [];
  if (spec?.colHeader) {
    block.push(
      new Paragraph({
        spacing: { before: 80, after: 80 },
        keepNext: true,
        children: [tableTextRun(spec.colHeader, { bold: true, size: BRAND.FONT_SIZE_BODY })],
      })
    );
  }
  block.push(
    new Table({
      width: { size: totalWidth, type: WidthType.DXA },
      columnWidths,
      layout: TableLayoutType.FIXED,
      rows,
    })
  );
  block.push(new Paragraph({ spacing: { before: 0, after: 140 } }));
  return block;
}

async function renderDiagramBlock(spec, context = {}) {
  if (!spec || typeof spec !== "object") return [];
  if (spec.type === "two-way-table") {
    return twoWayTableBlock(spec);
  }

  try {
    const diagram = await generateDiagram(spec);
    if (!diagram?.buffer) return [];

    const scale = Math.min(1, DIAGRAM_TARGET_WIDTH / diagram.width);
    return [
      new Paragraph({
        spacing: { before: 80, after: 140 },
        keepNext: true,
        children: [
          new ImageRun({
            data: diagram.buffer,
            type: "png",
            transformation: {
              width: Math.round(diagram.width * scale),
              height: Math.round(diagram.height * scale),
            },
          }),
        ],
      }),
    ];
  } catch (err) {
    console.warn(
      `[resource-diagrams] skipped ${context.label || "diagram"}: ${err?.message || err}`
    );
    return [];
  }
}

module.exports = {
  renderDiagramBlock,
  twoWayTableBlock,
};
