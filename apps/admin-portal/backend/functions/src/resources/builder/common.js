"use strict";

const {
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  SectionType,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} = require("docx");

const { BRAND, PAGE } = require("./branding");
const { renderDiagramBlock } = require("./diagrams");
const {
  cleanText,
  formatSubject,
  makeAnswerRow,
  makeFooter,
  makeHeader,
  makePageBreak,
  makePartParagraph,
  makeQuestionParagraph,
  makeSectionHeading,
  makeShadedBox,
  makeSubHeading,
  makeWorkingLines,
  paragraph,
  textRun,
} = require("./shared");

const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
const blackBorder = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const noBorder = { style: BorderStyle.NONE, size: 0, color: BRAND.WHITE };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
const blackBorders = { top: blackBorder, bottom: blackBorder, left: blackBorder, right: blackBorder };

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : [];
}

function compact(values) {
  return values.filter((value) => value !== null && value !== undefined && value !== "");
}

function isEnglishSubject(subject) {
  return cleanText(subject).toLowerCase() === "english";
}

function splitParagraphs(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean);
}

function docStyles() {
  return {
    default: {
      document: {
        run: { font: BRAND.FONT, size: BRAND.FONT_SIZE_BODY },
      },
    },
  };
}

function pageProperties(type = SectionType.CONTINUOUS) {
  return {
    type,
    page: {
      size: { width: PAGE.WIDTH, height: PAGE.HEIGHT },
      margin: {
        top: PAGE.MARGIN_TOP,
        bottom: PAGE.MARGIN_BOTTOM,
        left: PAGE.MARGIN_LEFT,
        right: PAGE.MARGIN_RIGHT,
      },
    },
  };
}

async function packDocument({
  title,
  subject,
  year,
  topic,
  studentName,
  children,
}) {
  const doc = new Document({
    styles: docStyles(),
    sections: [
      {
        properties: pageProperties(),
        headers: {
          default: makeHeader(title, formatSubject(subject), year, topic),
        },
        footers: {
          default: makeFooter(cleanText(studentName)),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

function makeNameDateLine(studentName) {
  return new Paragraph({
    spacing: { after: 160 },
    children: [
      textRun(`Name: ${cleanText(studentName) || "________________________"}`),
      new TextRun({ text: "        ", font: BRAND.FONT, size: BRAND.FONT_SIZE_BODY }),
      textRun("Date: ____________________"),
    ],
  });
}

function makeDetailLine(parts) {
  const details = compact(parts).map(cleanText);
  if (!details.length) return new Paragraph({ spacing: { after: 220 } });
  return paragraph(details.join(" | "), {
    color: "555555",
    size: BRAND.FONT_SIZE_SMALL,
    spacing: { after: 240 },
  });
}

function makeCell(children, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: opts.verticalAlign || VerticalAlign.CENTER,
    margins: opts.margins || { top: 90, bottom: 90, left: 120, right: 120 },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    borders: opts.borders || {
      top: thinBorder,
      bottom: thinBorder,
      left: thinBorder,
      right: thinBorder,
    },
    children,
  });
}

function makeTable(headers, rows, opts = {}) {
  const widths = opts.widths || headers.map(() => Math.floor(PAGE.CONTENT_WIDTH / headers.length));
  const plain = opts.plain === true;
  const tableRows = [
    new TableRow({
      cantSplit: true,
      children: headers.map((header, index) =>
        plain
          ? makeCell(
              [paragraph(header, { bold: true, color: "000000", spacing: { after: 0 } })],
              widths[index],
              { borders: blackBorders }
            )
          : makeCell(
              [paragraph(header, { bold: true, color: BRAND.WHITE, spacing: { after: 0 } })],
              widths[index],
              { fill: "000000" }
            )
      ),
    }),
  ];

  for (const row of rows) {
    tableRows.push(
      new TableRow({
        cantSplit: true,
        children: headers.map((_, index) => {
          const parts = splitParagraphs(row[index]);
          const children = parts.length
            ? parts.map((part) => paragraph(part, { spacing: { after: 60 } }))
            : [paragraph("", { spacing: { after: 0 } })];
          return plain
            ? makeCell(children, widths[index], { borders: blackBorders })
            : makeCell(children, widths[index]);
        }),
      })
    );
  }

  return new Table({
    width: { size: PAGE.CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: tableRows,
  });
}

function isPipeTableLine(line) {
  const value = String(line || "").trim();
  return value.includes("|") && value.split("|").length >= 3;
}

function parsePipeCells(line) {
  return String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cellText) => cleanText(cellText));
}

function isMarkdownSeparator(cells) {
  return cells.length > 1 && cells.every((cellText) => /^:?-{3,}:?$/.test(cellText.replace(/\s+/g, "")));
}

function splitMarkdownTableBlocks(value) {
  const lines = String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks = [];
  let textLines = [];

  function flushText() {
    const text = textLines.join("\n");
    if (cleanText(text)) blocks.push({ type: "text", text });
    textLines = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1];
    if (isPipeTableLine(line) && isPipeTableLine(nextLine)) {
      const headers = parsePipeCells(line);
      const separator = parsePipeCells(nextLine);
      if (isMarkdownSeparator(separator)) {
        flushText();
        const rows = [];
        index += 2;
        while (index < lines.length && isPipeTableLine(lines[index])) {
          const row = parsePipeCells(lines[index]);
          if (row.length) rows.push(row);
          index += 1;
        }
        index -= 1;
        blocks.push({ type: "table", headers, rows });
        continue;
      }
    }
    textLines.push(line);
  }
  flushText();
  return blocks.length ? blocks : [{ type: "text", text: value }];
}

function renderStemBlocks(blocks, firstParagraph, opts = {}) {
  const elements = [];
  let usedFirstParagraph = false;
  for (const block of blocks) {
    if (block.type === "table") {
      elements.push(makeTable(block.headers, block.rows, {
        widths: block.headers.map(() => Math.floor(PAGE.CONTENT_WIDTH / block.headers.length)),
        plain: true,
      }));
      continue;
    }
    if (!usedFirstParagraph) {
      elements.push(firstParagraph(block.text));
      usedFirstParagraph = true;
      continue;
    }
    elements.push(...makeParagraphs(block.text, opts));
  }
  if (!usedFirstParagraph) elements.unshift(firstParagraph(""));
  return elements;
}

function renderQuestionStem(number, stem, marks, opts = {}) {
  return renderStemBlocks(
    splitMarkdownTableBlocks(stem),
    (text) => makeQuestionParagraph(number, text, marks),
    opts
  );
}

function renderPartStem(label, stem, marks, opts = {}) {
  return renderStemBlocks(
    splitMarkdownTableBlocks(stem),
    (text) => makePartParagraph(label, text, marks),
    { indent: { left: 360 }, spacing: { after: 80 }, ...opts }
  );
}

function makeBulletList(items, opts = {}) {
  return asArray(items).map((item) =>
    paragraph(`- ${item}`, {
      indent: opts.indent || { left: 280 },
      spacing: opts.spacing || { after: 80 },
    })
  );
}

function makeParagraphs(value, opts = {}) {
  return splitParagraphs(value).map((part) => paragraph(part, opts));
}

function hasParts(question) {
  return Array.isArray(question?.parts) && question.parts.length > 0;
}

function questionStem(question) {
  return question?.stem || question?.text || question?.instruction || "";
}

function answerLabel(answer) {
  const number = answer?.questionNumber ?? answer?.taskNumber ?? answer?.number ?? "";
  const partLabel = cleanText(answer?.partLabel).replace(/[()]/g, "");
  return partLabel ? `Q${number}(${partLabel})` : `Q${number}`;
}

function multipleChoiceOptions(question) {
  const options = asArray(question?.options);
  return options.map((option, index) => {
    const label = String.fromCharCode(65 + index);
    return paragraph(`${label}. ${option}`, {
      indent: { left: 360 },
      spacing: { after: 60 },
    });
  });
}

async function renderQuestion(question, opts = {}) {
  const elements = [];
  const number = question?.number ?? opts.number ?? "";
  const parts = hasParts(question) ? question.parts : [];

  if (opts.preLabel) {
    elements.push(paragraph(opts.preLabel(question), {
      italics: true,
      color: "666666",
      size: BRAND.FONT_SIZE_SMALL,
      spacing: { before: 160, after: 20 },
    }));
  }

  elements.push(...renderQuestionStem(number, questionStem(question), parts.length ? null : question?.marks));
  elements.push(...multipleChoiceOptions(question));
  elements.push(...(await renderDiagramBlock(question?.diagram, { label: `Q${number}` })));

  if (parts.length) {
    for (const part of parts) {
      elements.push(...renderPartStem(part.label, questionStem(part), part.marks));
      elements.push(...multipleChoiceOptions(part));
      elements.push(
        ...(await renderDiagramBlock(part.diagram, {
          label: `Q${number}${part.label ? `(${part.label})` : ""}`,
        }))
      );
      elements.push(...makeWorkingLines(part.workingLines ?? 3));
    }
    return elements;
  }

  elements.push(...makeWorkingLines(question?.workingLines ?? opts.defaultWorkingLines ?? 4));
  return elements;
}

async function renderQuestionList(questions, opts = {}) {
  const elements = [];
  for (const question of asArray(questions)) {
    elements.push(...(await renderQuestion(question, opts)));
  }
  return elements;
}

function makeAnswerTable(answers = [], opts = {}) {
  const rows = [
    makeAnswerRow(opts.firstHeader || "Q#", opts.secondHeader || "Answer", {
      bold: true,
      color: BRAND.WHITE,
      fill: BRAND.NAVY,
      numberWidth: opts.numberWidth || 1400,
    }),
  ];

  for (const answer of asArray(answers)) {
    const parts = [answer?.answer || answer?.suggestedResponse || ""];
    if (answer?.workingOut) parts.push(`Working: ${answer.workingOut}`);
    if (answer?.note) parts.push(`Note: ${answer.note}`);
    rows.push(makeAnswerRow(answerLabel(answer), parts.filter(Boolean).join("\n"), opts));
  }

  if (rows.length === 1) {
    rows.push(makeAnswerRow("-", "No answers supplied.", opts));
  }

  const numberWidth = opts.numberWidth || 1400;
  return new Table({
    width: { size: PAGE.CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [numberWidth, PAGE.CONTENT_WIDTH - numberWidth],
    layout: TableLayoutType.FIXED,
    rows,
  });
}

function makeSectionedAnswerTable(answers = [], sectionBy) {
  const children = [];
  const groups = new Map();
  for (const answer of asArray(answers)) {
    const key = sectionBy(answer) || "Answers";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(answer);
  }

  for (const [group, rows] of groups.entries()) {
    children.push(makeSubHeading(group));
    children.push(makeAnswerTable(rows));
    children.push(new Paragraph({ spacing: { after: 140 } }));
  }
  return children;
}

function makeMarkingGuide(tasks = [], answers = []) {
  const answerByTask = new Map(asArray(answers).map((answer) => [Number(answer.taskNumber), answer]));
  const rows = [];
  for (const task of asArray(tasks)) {
    const answer = answerByTask.get(Number(task.number)) || {};
    rows.push([
      `Task ${task.number}`,
      answer.suggestedResponse || "",
      asArray(answer.markingCriteria).join("\n"),
    ]);
  }
  return makeTable(["Task", "Suggested Response", "Marking Criteria"], rows, {
    widths: [1200, 3800, PAGE.CONTENT_WIDTH - 5000],
  });
}

function guideContext(row) {
  return row?.subTopic || row?.subTopicTitle || row?.section || row?.topic || row?.focus || "";
}

function guideCriteria(row) {
  const criteria = row?.markingCriteria || row?.criteria || row?.successCriteria || row?.note || "";
  return Array.isArray(criteria) ? criteria.join("\n") : criteria;
}

function guideResponse(row) {
  return row?.suggestedResponse || row?.sampleResponse || row?.response || row?.answer || "";
}

function makeQuestionMarkingGuide(guidance = [], opts = {}) {
  const rows = asArray(guidance);
  const includeContext = opts.includeContext ?? rows.some((row) => guideContext(row));
  const headers = includeContext
    ? ["Q#", opts.contextHeader || "Focus", "Suggested Response", "Marking Criteria"]
    : ["Q#", "Suggested Response", "Marking Criteria"];
  const widths = includeContext
    ? [900, 1800, 3300, PAGE.CONTENT_WIDTH - 6000]
    : [900, 4000, PAGE.CONTENT_WIDTH - 4900];
  const tableRows = rows.map((row) => {
    const base = [answerLabel(row), guideResponse(row), guideCriteria(row)];
    return includeContext
      ? [base[0], guideContext(row), base[1], base[2]]
      : base;
  });

  if (!tableRows.length) {
    tableRows.push(includeContext
      ? ["-", "", "No marking guide supplied.", ""]
      : ["-", "No marking guide supplied.", ""]);
  }

  return makeTable(headers, tableRows, { widths });
}

function makeSectionedMarkingGuide(guidance = [], sectionBy) {
  const children = [];
  const groups = new Map();
  for (const row of asArray(guidance)) {
    const key = sectionBy(row) || guideContext(row) || "Marking Guide";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  if (!groups.size) return [makeQuestionMarkingGuide([])];

  for (const [group, rows] of groups.entries()) {
    children.push(makeSubHeading(group));
    children.push(makeQuestionMarkingGuide(rows, { includeContext: false }));
    children.push(new Paragraph({ spacing: { after: 140 } }));
  }
  return children;
}

function makeKeyValueTable(pairs) {
  return makeTable(
    ["Field", "Details"],
    compact(pairs).map(([key, value]) => [key, Array.isArray(value) ? value.join("\n") : value]),
    { widths: [2200, PAGE.CONTENT_WIDTH - 2200] }
  );
}

function makeSpacer(after = 120) {
  return new Paragraph({ spacing: { after } });
}

module.exports = {
  asArray,
  compact,
  isEnglishSubject,
  makeAnswerTable,
  makeBulletList,
  makeDetailLine,
  makeKeyValueTable,
  makeMarkingGuide,
  makeNameDateLine,
  makePageBreak,
  makeParagraphs,
  makeQuestionMarkingGuide,
  makeSectionedAnswerTable,
  makeSectionedMarkingGuide,
  makeSpacer,
  makeTable,
  makeWorkingLines,
  packDocument,
  renderPartStem,
  renderQuestion,
  renderQuestionList,
  renderQuestionStem,
  splitParagraphs,
  makeSectionHeading,
  makeShadedBox,
  makeSubHeading,
};
