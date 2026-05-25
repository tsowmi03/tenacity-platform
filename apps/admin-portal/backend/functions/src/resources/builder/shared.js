"use strict";

const {
  AlignmentType,
  BorderStyle,
  Footer,
  Header,
  ImageRun,
  Math: DocxMath,
  MathFraction,
  MathRun,
  MathSuperScript,
  PageBreak,
  PageNumber,
  Paragraph,
  PositionalTab,
  PositionalTabAlignment,
  PositionalTabLeader,
  PositionalTabRelativeTo,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
} = require("docx");

const { BRAND, PAGE, loadLogoBuffer } = require("./branding");

const noBorder = { style: BorderStyle.NONE, size: 0, color: BRAND.WHITE };
const noBorders = {
  top: noBorder,
  bottom: noBorder,
  left: noBorder,
  right: noBorder,
};
const thinGreyBorder = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };

function cleanText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

function titleCase(value) {
  return cleanText(value)
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatSubject(subject) {
  if (!subject) return null;
  const value = cleanText(subject).toLowerCase();
  if (value === "maths") return "Maths";
  if (value === "english") return "English";
  return titleCase(value);
}

function textRun(text, opts = {}) {
  return new TextRun({
    text: cleanText(text),
    font: BRAND.FONT,
    size: opts.size || BRAND.FONT_SIZE_BODY,
    bold: opts.bold,
    color: opts.color,
    italics: opts.italics,
  });
}

function rawTextRun(text, opts = {}) {
  return new TextRun({
    text: String(text ?? ""),
    font: BRAND.FONT,
    size: opts.size || BRAND.FONT_SIZE_BODY,
    bold: opts.bold,
    color: opts.color,
    italics: opts.italics,
  });
}

function mathText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

function plainMathRuns(value) {
  return [new MathRun(mathText(value))];
}

function fractionMath(numerator, denominator) {
  return new DocxMath({
    children: [
      new MathFraction({
        numerator: plainMathRuns(numerator),
        denominator: plainMathRuns(denominator),
      }),
    ],
  });
}

function superScriptMath(base, exponent) {
  return new DocxMath({
    children: [
      new MathSuperScript({
        children: plainMathRuns(base),
        superScript: plainMathRuns(exponent),
      }),
    ],
  });
}

const SUPERSCRIPT_DIGITS = new Map([
  ["⁰", "0"],
  ["¹", "1"],
  ["²", "2"],
  ["³", "3"],
  ["⁴", "4"],
  ["⁵", "5"],
  ["⁶", "6"],
  ["⁷", "7"],
  ["⁸", "8"],
  ["⁹", "9"],
]);

function findMathToken(text, start) {
  const candidates = [
    {
      type: "fraction",
      regex: /\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,
    },
    {
      type: "fraction",
      regex: /\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g,
    },
    {
      type: "fraction",
      regex: /\b([A-Za-z]\w*|\d+(?:\.\d+)?|\d+[A-Za-z]+)\s*\/\s*([A-Za-z]\w*|\d+(?:\.\d+)?|\d+[A-Za-z]+)\b/g,
    },
    {
      type: "power",
      regex: /(\([^)]+\)|[A-Za-z]\w*|\d+(?:\.\d+)?)\s*\^\s*([A-Za-z0-9+\-]+)/g,
    },
    {
      type: "power",
      regex: /(\([^)]+\)|[A-Za-z]\w*|\d+(?:\.\d+)?)([⁰¹²³⁴⁵⁶⁷⁸⁹])/g,
    },
  ];

  let best = null;
  for (const candidate of candidates) {
    candidate.regex.lastIndex = start;
    const match = candidate.regex.exec(text);
    if (!match) continue;
    if (!best || match.index < best.index) {
      best = {
        ...candidate,
        index: match.index,
        text: match[0],
        left: match[1],
        right: match[2],
      };
    }
  }
  return best;
}

function richTextRuns(text, opts = {}) {
  const value = mathText(text);
  if (!value) return [rawTextRun("", opts)];

  const runs = [];
  let cursor = 0;
  while (cursor < value.length) {
    const token = findMathToken(value, cursor);
    if (!token) break;
    if (token.index > cursor) {
      runs.push(rawTextRun(value.slice(cursor, token.index), opts));
    }
    if (token.type === "fraction") {
      runs.push(fractionMath(token.left, token.right));
    } else if (token.type === "power") {
      runs.push(superScriptMath(
        token.left,
        SUPERSCRIPT_DIGITS.get(token.right) || token.right
      ));
    }
    cursor = token.index + token.text.length;
  }

  if (cursor < value.length) {
    runs.push(rawTextRun(value.slice(cursor), opts));
  }
  return runs.length ? runs : [rawTextRun(value, opts)];
}

function paragraph(text, opts = {}) {
  return new Paragraph({
    alignment: opts.alignment,
    border: opts.border,
    indent: opts.indent,
    keepNext: opts.keepNext,
    spacing: opts.spacing || { after: 120 },
    tabStops: opts.tabStops,
    children: opts.math === false ? [textRun(text, opts)] : richTextRuns(text, opts),
  });
}

function cell(children, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: opts.columnSpan,
    margins: opts.margins || { top: 100, bottom: 100, left: 140, right: 140 },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    borders: opts.borders || {
      top: thinGreyBorder,
      bottom: thinGreyBorder,
      left: thinGreyBorder,
      right: thinGreyBorder,
    },
    verticalAlign: opts.verticalAlign || VerticalAlign.CENTER,
    children,
  });
}

function makeHeader(title, subject, year, topic) {
  const logo = loadLogoBuffer();
  const logoWidth = 154;
  const logoHeight = 61;
  const logoColumnWidth = 1800;
  const textColumnWidth = PAGE.CONTENT_WIDTH - logoColumnWidth;
  const detailParts = [
    year ? `Year ${year}` : null,
    formatSubject(subject),
    topic ? cleanText(topic) : null,
  ].filter(Boolean);

  const headerRows = [
    new TableRow({
      children: [
        cell(
          [
            new Paragraph({
              spacing: { after: 40 },
              children: [
                textRun(title || "Tenacity resource", {
                  bold: true,
                  color: BRAND.NAVY,
                  size: BRAND.FONT_SIZE_H2,
                }),
              ],
            }),
            new Paragraph({
              spacing: { after: 0 },
              children: [
                textRun(detailParts.join(" | "), {
                  color: BRAND.LIGHT_BLUE,
                  size: BRAND.FONT_SIZE_SMALL,
                }),
              ],
            }),
          ],
          textColumnWidth,
          { borders: noBorders, margins: { top: 0, bottom: 40, left: 0, right: 120 } }
        ),
        cell(
          [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { after: 0 },
              children: logo
                ? [
                    new ImageRun({
                      data: logo,
                      type: "jpg",
                      transformation: { width: logoWidth, height: logoHeight },
                    }),
                  ]
                : [],
            }),
          ],
          logoColumnWidth,
          { borders: noBorders, margins: { top: 0, bottom: 40, left: 0, right: 0 } }
        ),
      ],
    }),
  ];

  return new Header({
    children: [
      new Table({
        width: { size: PAGE.CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: [textColumnWidth, logoColumnWidth],
        rows: headerRows,
      }),
      new Paragraph({
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: BRAND.LIGHT_BLUE, space: 4 },
        },
        spacing: { after: 160 },
        children: [textRun("", { size: 2 })],
      }),
    ],
  });
}

function makeFooter(studentName) {
  const footerText = [
    cleanText(studentName),
    "Tenacity Tutoring - Determination Meets Success.",
  ]
    .filter(Boolean)
    .join(" | ");

  return new Footer({
    children: [
      new Paragraph({
        border: {
          top: { style: BorderStyle.SINGLE, size: 4, color: BRAND.LIGHT_BLUE, space: 4 },
        },
        spacing: { before: 0 },
        tabStops: [{ type: TabStopType.RIGHT, position: PAGE.CONTENT_WIDTH }],
        children: [
          textRun(footerText, { size: BRAND.FONT_SIZE_SMALL }),
          new TextRun({
            children: [
              new PositionalTab({
                alignment: PositionalTabAlignment.RIGHT,
                relativeTo: PositionalTabRelativeTo.MARGIN,
                leader: PositionalTabLeader.NONE,
              }),
            ],
          }),
          new TextRun({
            children: ["Page ", PageNumber.CURRENT],
            font: BRAND.FONT,
            size: BRAND.FONT_SIZE_SMALL,
          }),
        ],
      }),
    ],
  });
}

function makeSectionHeading(text) {
  return new Table({
    width: { size: PAGE.CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [PAGE.CONTENT_WIDTH],
    rows: [
      new TableRow({
        children: [
          cell(
            [
              new Paragraph({
                spacing: { after: 0 },
                children: [
                  textRun(text, {
                    bold: true,
                    color: BRAND.WHITE,
                    size: BRAND.FONT_SIZE_H3,
                  }),
                ],
              }),
            ],
            PAGE.CONTENT_WIDTH,
            {
              fill: BRAND.NAVY,
              borders: noBorders,
              margins: { top: 120, bottom: 120, left: 160, right: 160 },
            }
          ),
        ],
      }),
    ],
  });
}

function makeSubHeading(text) {
  return paragraph(text, {
    bold: true,
    color: BRAND.NAVY,
    size: BRAND.FONT_SIZE_H3,
    spacing: { before: 240, after: 120 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 18, color: BRAND.NAVY, space: 8 },
    },
  });
}

function formatMarks(marks) {
  if (marks === null || marks === undefined || marks === "") return "";
  const value = Number(marks);
  if (!Number.isFinite(value)) return cleanText(marks);
  return `${value} mark${value === 1 ? "" : "s"}`;
}

function makeQuestionParagraph(number, stem, marks) {
  const marksText = formatMarks(marks);
  const children = [
    rawTextRun(`${cleanText(number)}. `, { bold: true }),
    ...richTextRuns(stem),
  ];
  if (marksText) {
    children.push(new TextRun({ text: "\t", font: BRAND.FONT, size: BRAND.FONT_SIZE_BODY }));
    children.push(textRun(`[${marksText}]`, { italics: true, color: "555555" }));
  }
  return new Paragraph({
    spacing: { before: 220, after: 100 },
    keepNext: true,
    tabStops: [{ type: TabStopType.RIGHT, position: PAGE.CONTENT_WIDTH }],
    children,
  });
}

function makePartParagraph(label, stem, marks) {
  const marksText = formatMarks(marks);
  const children = [
    rawTextRun(`(${cleanText(label)}) `, { bold: true }),
    ...richTextRuns(stem),
  ];
  if (marksText) {
    children.push(new TextRun({ text: "\t", font: BRAND.FONT, size: BRAND.FONT_SIZE_BODY }));
    children.push(textRun(`[${marksText}]`, { italics: true, color: "555555" }));
  }
  return new Paragraph({
    spacing: { before: 100, after: 80 },
    indent: { left: 360 },
    keepNext: true,
    tabStops: [{ type: TabStopType.RIGHT, position: PAGE.CONTENT_WIDTH }],
    children,
  });
}

function makeWorkingLines(count) {
  const safeCount = Math.max(0, Math.min(20, Number.parseInt(count, 10) || 0));
  const lines = [];
  for (let i = 0; i < safeCount; i += 1) {
    lines.push(
      new Paragraph({
        border: {
          bottom: { style: BorderStyle.DOTTED, size: 4, color: "BBBBBB", space: 1 },
        },
        spacing: { before: 70, after: 70 },
        children: [new TextRun({ text: " ", font: BRAND.FONT, size: BRAND.FONT_SIZE_BODY })],
      })
    );
  }
  return lines;
}

function makeShadedBox(text, colour = BRAND.LIGHT_BLUE_BG) {
  return new Table({
    width: { size: PAGE.CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [PAGE.CONTENT_WIDTH],
    rows: [
      new TableRow({
        children: [
          cell([paragraph(text, { spacing: { after: 0 } })], PAGE.CONTENT_WIDTH, {
            fill: colour,
            borders: {
              top: thinGreyBorder,
              bottom: thinGreyBorder,
              left: { style: BorderStyle.SINGLE, size: 8, color: BRAND.LIGHT_BLUE },
              right: thinGreyBorder,
            },
          }),
        ],
      }),
    ],
  });
}

function makeDefinitionTable(definitions = []) {
  const termWidth = 2200;
  const definitionWidth = PAGE.CONTENT_WIDTH - termWidth;
  const rows = [
    new TableRow({
      children: [
        cell([paragraph("Term", { bold: true, color: BRAND.WHITE, spacing: { after: 0 } })], termWidth, {
          fill: BRAND.NAVY,
        }),
        cell(
          [paragraph("Definition", { bold: true, color: BRAND.WHITE, spacing: { after: 0 } })],
          definitionWidth,
          { fill: BRAND.NAVY }
        ),
      ],
    }),
  ];

  for (const definition of definitions) {
    rows.push(
      new TableRow({
        children: [
          cell([paragraph(definition.term, { bold: true, spacing: { after: 0 } })], termWidth),
          cell([paragraph(definition.definition, { spacing: { after: 0 } })], definitionWidth),
        ],
      })
    );
  }

  return new Table({
    width: { size: PAGE.CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [termWidth, definitionWidth],
    rows,
  });
}

function makeWorkedExampleTable(steps = []) {
  const workingWidth = Math.floor(PAGE.CONTENT_WIDTH * 0.58);
  const explanationWidth = PAGE.CONTENT_WIDTH - workingWidth;
  const rows = [
    new TableRow({
      children: [
        cell([paragraph("Working", { bold: true, color: BRAND.WHITE, spacing: { after: 0 } })], workingWidth, {
          fill: BRAND.NAVY,
        }),
        cell(
          [paragraph("Explanation", { bold: true, color: BRAND.WHITE, spacing: { after: 0 } })],
          explanationWidth,
          { fill: BRAND.NAVY }
        ),
      ],
    }),
  ];

  for (const step of steps) {
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          cell([paragraph(step.working, { spacing: { after: 0 } })], workingWidth, {
            fill: BRAND.LIGHT_GREY,
          }),
          cell([paragraph(step.explanation, { spacing: { after: 0 } })], explanationWidth, {
            fill: BRAND.LIGHT_GREY,
          }),
        ],
      })
    );
  }

  return new Table({
    width: { size: PAGE.CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [workingWidth, explanationWidth],
    rows,
  });
}

function makeAnswerRow(number, answer, opts = {}) {
  const numberWidth = opts.numberWidth || 1400;
  const answerWidth = PAGE.CONTENT_WIDTH - numberWidth;
  return new TableRow({
    cantSplit: true,
    children: [
      cell(
        [paragraph(number, { bold: opts.bold, color: opts.color, spacing: { after: 0 } })],
        numberWidth,
        { fill: opts.fill }
      ),
      cell(
        [paragraph(answer, { bold: opts.bold, color: opts.color, spacing: { after: 0 } })],
        answerWidth,
        { fill: opts.fill }
      ),
    ],
  });
}

function makePageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

module.exports = {
  cleanText,
  formatMarks,
  formatSubject,
  makeAnswerRow,
  makeDefinitionTable,
  makeFooter,
  makeHeader,
  makePageBreak,
  makePartParagraph,
  makeQuestionParagraph,
  makeSectionHeading,
  makeShadedBox,
  makeSubHeading,
  makeWorkedExampleTable,
  makeWorkingLines,
  paragraph,
  richTextRuns,
  textRun,
  titleCase,
};
