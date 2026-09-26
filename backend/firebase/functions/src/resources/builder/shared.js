"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");

const {
  AlignmentType,
  BorderStyle,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LineRuleType,
  Math: DocxMath,
  MathFraction,
  MathRadical,
  MathRun,
  MathSubScript,
  MathSubSuperScript,
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
  TableLayoutType,
  TableOfContents,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
} = require("docx");

const { BRAND, PAGE, loadLogoBuffer } = require("./branding");
const {
  BRACE_CONTENT,
  PAREN,
  SCRIPTED,
  SCRIPT_TERM,
  getMathLocation,
  hasRawMath,
  inlineScriptSegments,
  normaliseLaTeXCommands,
  parseMath,
  rawMathExcerpt,
  readableFallback,
  recordMathIssue,
  setMathLocation,
} = require("../mathNotation");
const { deAiPunctuation } = require("../humanStyle");

const noBorder = { style: BorderStyle.NONE, size: 0, color: BRAND.WHITE };
const noBorders = {
  top: noBorder,
  bottom: noBorder,
  left: noBorder,
  right: noBorder,
};
const thinGreyBorder = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };

// Ambient flag controlling whether the math-typesetting pipeline runs while a
// document is being built. English (prose) resources turn it off so ordinary
// text — "and/or", "cause/effect", "well-structured" — is never reinterpreted
// as a fraction or a subtraction. AsyncLocalStorage keeps the flag isolated per
// build, so concurrent maths and English builds in the same process can't leak
// into each other. Defaults to enabled when no context is set (e.g. unit tests
// that call a builder directly), preserving prior behaviour.
const mathRenderStore = new AsyncLocalStorage();

function runWithMathRendering(enabled, fn) {
  return mathRenderStore.run({ enabled: enabled !== false }, fn);
}

function mathRenderingEnabled() {
  const store = mathRenderStore.getStore();
  return store ? store.enabled : true;
}

// Control characters that XML 1.0 forbids in element content: everything below
// U+0020 except tab (U+0009), line feed (U+000A) and carriage return (U+000D).
// The `docx` library XML-escapes &, < and > but does NOT strip these, so a stray
// control char (e.g. a U+000C the model smuggled in via an unescaped \frac)
// flows straight into word/document.xml and makes Word reject the file as
// corrupt. This is the last-line safety net: parseAiJsonResponse should already
// prevent these upstream, but stripping here guarantees every resource opens
// regardless of how the text arrived.
// eslint-disable-next-line no-control-regex
const XML_ILLEGAL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

function stripXmlIllegalChars(value) {
  return String(value ?? "").replace(XML_ILLEGAL_CHARS, "");
}

function cleanText(value, opts = {}) {
  // deAiPunctuation is the deterministic backstop for the no-em-dash rule: it
  // strips the punctuation tells of AI writing before the text is rendered, so
  // they can never reach the document even if the model ignores the prompt.
  // opts.verbatim skips that backstop: a verified public-domain text must keep
  // its original punctuation (Frost's em-dash is Frost's, not an AI tell).
  const base = opts.verbatim ? String(value ?? "") : deAiPunctuation(value);
  return stripXmlIllegalChars(base)
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

// Last line of defence for maths documents: text that reaches a plain run
// still holding ^, _ or a LaTeX command is shown in readable form and
// reported, so the tutor is warned instead of the raw notation shipping.
function guardRawMath(value, opts = {}) {
  if (opts.verbatim || opts.math === false || !mathRenderingEnabled() || !hasRawMath(value)) {
    return value;
  }
  const excerpt = rawMathExcerpt(value);
  recordMathIssue({ source: excerpt, shownAs: readableFallback(excerpt) });
  return readableFallback(value);
}

function textRun(text, opts = {}) {
  return new TextRun({
    text: guardRawMath(cleanText(text, { verbatim: opts.verbatim }), opts),
    font: BRAND.FONT,
    size: opts.size || BRAND.FONT_SIZE_BODY,
    bold: opts.bold,
    color: opts.color,
    italics: opts.italics,
  });
}

function rawTextRun(text, opts = {}) {
  return new TextRun({
    text: guardRawMath(stripXmlIllegalChars(text), opts),
    font: BRAND.FONT,
    size: opts.size || BRAND.FONT_SIZE_BODY,
    bold: opts.bold,
    color: opts.color,
    italics: opts.italics,
  });
}

// Runs for single-line text that can't hold a Word equation without losing
// its styling (white heading text, the page header): superscripts and
// subscripts become Word's own raised/lowered formatting on ordinary runs.
function textRuns(text, opts = {}) {
  if (opts.verbatim || opts.math === false || !mathRenderingEnabled()) {
    return [textRun(text, opts)];
  }
  const segments = inlineScriptSegments(stripDollarDelimiters(cleanText(text)));
  if (!segments.length) return [textRun("", opts)];
  return segments.map((segment) => {
    const kind = segment.level[segment.level.length - 1];
    return new TextRun({
      text: stripXmlIllegalChars(segment.text),
      font: BRAND.FONT,
      size: opts.size || BRAND.FONT_SIZE_BODY,
      bold: opts.bold,
      color: opts.color,
      italics: opts.italics,
      superScript: kind === "sup" || undefined,
      subScript: kind === "sub" || undefined,
    });
  });
}

function stripDollarDelimiters(value) {
  // Strip $$...$$ (display math) and $...$ (inline math) delimiters, keeping
  // the inner content so the rest of the math pipeline processes it normally.
  return String(value ?? "")
    .replace(/\$\$([^$]+)\$\$/g, (_, inner) => ` ${inner.trim()} `)
    .replace(/\$([^$\n]+)\$/g, (_, inner) => ` ${inner.trim()} `);
}

function mathText(value) {
  return normaliseLaTeXCommands(
    stripXmlIllegalChars(value)
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
  );
}

// Word equation components for a parsed node tree (see mathNotation.js).
function ommlChildren(nodes) {
  const out = [];
  for (const node of nodes) {
    if (node.type === "text") {
      if (node.value) out.push(new MathRun(normaliseMathSymbols(node.value)));
    } else if (node.type === "group") {
      out.push(...ommlChildren(node.children));
    } else if (node.type === "paren") {
      out.push(new MathRun(node.open), ...ommlChildren(node.children), new MathRun(node.close));
    } else if (node.type === "script") {
      const children = ommlChildren(node.base);
      if (node.sup && node.sub) {
        out.push(new MathSubSuperScript({
          children,
          subScript: ommlChildren(node.sub),
          superScript: ommlChildren(node.sup),
        }));
      } else if (node.sup) {
        out.push(new MathSuperScript({ children, superScript: ommlChildren(node.sup) }));
      } else {
        out.push(new MathSubScript({ children, subScript: ommlChildren(node.sub) }));
      }
    } else if (node.type === "frac") {
      out.push(new MathFraction({
        numerator: ommlChildren(node.num),
        denominator: ommlChildren(node.den),
      }));
    } else if (node.type === "sqrt") {
      out.push(new MathRadical({
        children: ommlChildren(node.body),
        ...(node.index ? { degree: ommlChildren(node.index) } : {}),
      }));
    }
  }
  return out;
}

function normaliseMathSymbols(value) {
  return String(value ?? "")
    .replace(/<=/g, "≤")
    .replace(/>=/g, "≥")
    .replace(/!=/g, "≠")
    .replace(/->/g, "→")
    .replace(/\*/g, "×")
    .replace(/-/g, "−");
}

// One inline maths span as runs: a Word equation when it parses, otherwise
// its readable plain-text form plus a recorded issue (→ MATH_FALLBACK warning).
function mathSpanRuns(value, opts = {}) {
  const parsed = parseMath(mathText(value));
  if (parsed.ok) {
    const children = ommlChildren(parsed.nodes);
    if (children.length) return [new DocxMath({ children })];
  }
  const shownAs = readableFallback(value);
  recordMathIssue({ source: value, shownAs });
  return [rawTextRun(shownAs, opts)];
}

// MATH_TERM: every alternative can carry scripts (SCRIPTED), interleaved with
// the letters that follow them, so 5t^{2}, (x+1)^{3}, m^3n^4 and H_2O are each
// captured as one term rather than having a base consumed by one span and its
// ^{...} or _{...} orphaned as a literal text run.
const MATH_TERM = String.raw`(?:\\frac\s*\{${BRACE_CONTENT}\}\s*\{${BRACE_CONTENT}\}${SCRIPTED}|\\sqrt\s*(?:\[[^\]]+\])?\s*\{${BRACE_CONTENT}\}${SCRIPTED}|${PAREN}${SCRIPTED}|[-−]?\$?\d+(?:\.\d+)?%?(?:\s*\/\s*[A-Za-z0-9]+)?[A-Za-z]*${SCRIPTED}|[A-Za-z][A-Za-z0-9]*${SCRIPTED})`;
const MATH_OPERATOR = String.raw`(?:<=|>=|!=|->|[+\-−=<>≤≥×÷±·*/^]|→|≠|≈)`;
// The trailing lone-letter group lets a span keep a detached variable ("= 5 x"),
// but the negative lookahead stops it from biting the first letter off an
// ordinary word ("= 0 by factorising" must not become "= 0 b" + "y factorising").
const MATH_SPAN_MATCHERS = [
  // \sqrt{...} and \sqrt[n]{...}
  { regex: new RegExp(String.raw`\\sqrt\s*(?:\[[^\]]+\])?\s*\{${BRACE_CONTENT}\}${SCRIPTED}`, "g") },
  // \frac{...}{...}, including nested expressions
  { regex: new RegExp(String.raw`\\frac\s*\{${BRACE_CONTENT}\}\s*\{${BRACE_CONTENT}\}${SCRIPTED}`, "g") },
  {
    regex: new RegExp(
      String.raw`${MATH_TERM}(?:\s*${MATH_OPERATOR}\s*${MATH_TERM})+(?:\s*[A-Za-z](?![A-Za-z0-9]))?`,
      "g"
    ),
    // Bare words count as terms, so prose joined by an operator ("Test - for",
    // "the ± gives") matches too — reject those instead of typesetting them.
    rejectProse: true,
  },
  { regex: /\([-−]?\d+(?:\.\d+)?,\s*[-−]?\d+(?:\.\d+)?\)/g },
  { regex: /(?<![\w])[-−]\d+(?:\.\d+)?%?\b/g },
  { regex: /\b([A-Za-z]\w*|\d+(?:\.\d+)?|\d+[A-Za-z]+)\s*\/\s*([A-Za-z]\w*|\d+(?:\.\d+)?|\d+[A-Za-z]+)\b/g },
  // A single scripted term: x^2, x_1, (x+1)^{3}, 10^{-3}, H_2O. Identifiers
  // like file_name are prose, not a subscript, and are rejected.
  { regex: new RegExp(SCRIPT_TERM, "g"), rejectIdentifier: true },
  { regex: /(\([^)]+\)|[A-Za-z]\w*|\d+(?:\.\d+)?)([⁰¹²³⁴⁵⁶⁷⁸⁹])/g },
];

function isSnakeCaseIdentifier(value) {
  return /^[A-Za-z]{3,}_[A-Za-z]{2,}/.test(value);
}

function isLikelyHyphenatedWord(value) {
  return /^[A-Za-z]+-[A-Za-z]+$/.test(value);
}

// Function names plus the logic literals, which legitimately appear inside
// expressions ("2×3 ≠ 5 → true"), plus the two LaTeX commands that survive
// normaliseLaTeXCommands ("x = \frac{1}{2}" must stay one span).
const MATH_SPAN_FUNCTION_WORDS = new Set([
  "sin", "cos", "tan", "cot", "sec", "csc", "log", "ln", "exp",
  "true", "false",
  "frac", "sqrt",
]);

// A term-operator-term span is worth typesetting only when its alphabetic
// tokens look like algebra: single letters, short products like "ab", or known
// function names. Any longer word means the "span" is really prose that happens
// to sit around an operator ("Diagnostic Test - for tutor use", "the ± gives
// only one root") and must stay ordinary text.
function isProseSpan(value) {
  const words = String(value).match(/[A-Za-z]{3,}/g) || [];
  return words.some((word) => !MATH_SPAN_FUNCTION_WORDS.has(word.toLowerCase()));
}

function normaliseMathMatch(match) {
  const leadingWordBeforeNegative = /^([A-Za-z]{2,}\s+)([-−]\d[\s\S]*)$/.exec(match[0]);
  if (leadingWordBeforeNegative) {
    return {
      index: match.index + leadingWordBeforeNegative[1].length,
      text: leadingWordBeforeNegative[2],
    };
  }
  return { index: match.index, text: match[0] };
}

function findMathSpan(text, start) {
  let best = null;
  for (const { regex, rejectProse, rejectIdentifier } of MATH_SPAN_MATCHERS) {
    regex.lastIndex = start;
    let match = regex.exec(text);
    // Skip rejected candidates one character at a time rather than jumping past
    // them wholesale, so a genuine expression later in the sentence ("the ±
    // gives x = 2") is still found by this same regex. The mid-word check stops
    // that walk from typesetting the tail of a rejected word: "Width = 5" is
    // prose, and re-scanning it must not accept "th = 5".
    const rejects = (m) =>
      isLikelyHyphenatedWord(m[0]) ||
      (rejectIdentifier && isSnakeCaseIdentifier(m[0])) ||
      (rejectProse &&
        (isProseSpan(m[0]) ||
          (m.index > 0 && /[A-Za-z0-9]/.test(text[m.index - 1]))));
    while (match && rejects(match)) {
      regex.lastIndex = match.index + 1;
      match = regex.exec(text);
    }
    if (!match) continue;
    const normalised = normaliseMathMatch(match);
    if (!best || normalised.index < best.index) {
      best = normalised;
    }
  }
  return best;
}

function inlineMarkdownSegments(value) {
  const text = String(value ?? "");
  // Keep this deliberately small: booklet sections only need inline emphasis,
  // while paragraph and list structure is handled by makeParagraphs. The
  // single-marker boundary checks avoid treating maths such as 2*3*4 or x_1 as
  // emphasis.
  const pattern = /(?<![\p{L}\p{N}])(\*\*|__)(\S(?:.*?\S)?)\1(?![\p{L}\p{N}])|(?<![\p{L}\p{N}*])\*(?!\*)(\S(?:.*?\S)?)\*(?![\p{L}\p{N}*])|(?<![\p{L}\p{N}_])_(?!_)(\S(?:.*?\S)?)_(?![\p{L}\p{N}_])/gu;
  const segments = [];
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index) });
    }
    segments.push({
      text: match[2] || match[3] || match[4],
      bold: match[1] ? true : undefined,
      italics: match[3] || match[4] ? true : undefined,
    });
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments.length ? segments : [{ text }];
}

function mathAwareTextRuns(value, opts = {}) {
  if (!value) return [rawTextRun("", opts)];

  const runs = [];
  let cursor = 0;
  while (cursor < value.length) {
    const span = findMathSpan(value, cursor);
    if (!span) break;
    if (span.index > cursor) {
      runs.push(rawTextRun(value.slice(cursor, span.index), opts));
    }
    runs.push(...mathSpanRuns(span.text, opts));
    cursor = span.index + span.text.length;
  }

  if (cursor < value.length) {
    runs.push(rawTextRun(value.slice(cursor), opts));
  }
  return runs.length ? runs : [rawTextRun(value, opts)];
}

function richTextRuns(text, opts = {}) {
  // When math is disabled (e.g. English documents), keep prose punctuation
  // literal. Maths documents still run through the expression renderer. Clean
  // the whole value before splitting Markdown so whitespace around styled runs
  // survives rather than being trimmed from every segment independently.
  const mathEnabled = mathRenderingEnabled();
  const value = mathEnabled
    ? mathText(stripDollarDelimiters(text))
    : cleanText(text, { verbatim: opts.verbatim });
  const segments = opts.inlineMarkdown
    ? inlineMarkdownSegments(value)
    : [{ text: value }];

  return segments.flatMap((segment) => {
    const runOpts = {
      ...opts,
      bold: opts.bold || segment.bold || undefined,
      italics: opts.italics || segment.italics || undefined,
    };
    return mathEnabled
      ? mathAwareTextRuns(segment.text, runOpts)
      : [rawTextRun(segment.text, runOpts)];
  });
}

function paragraph(text, opts = {}) {
  return new Paragraph({
    alignment: opts.alignment,
    border: opts.border,
    heading: opts.heading,
    indent: opts.indent,
    keepLines: opts.keepLines,
    keepNext: opts.keepNext,
    spacing: opts.spacing || { after: 120 },
    tabStops: opts.tabStops,
    children: opts.math === false ? [textRun(text, opts)] : richTextRuns(text, opts),
  });
}

function makeContentsHeading(text, opts = {}) {
  setMathLocation(`${cleanText(text)} section`);
  const heading = opts.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1;
  if (opts.section === true) {
    return makeSectionHeading(text, { heading });
  }
  return paragraph(text, {
    heading,
    bold: true,
    color: BRAND.NAVY,
    size: BRAND.FONT_SIZE_H3,
    spacing: { before: 240, after: 120 },
    keepLines: true,
    keepNext: true,
    border: {
      left: { style: BorderStyle.SINGLE, size: 18, color: BRAND.NAVY, space: 8 },
    },
  });
}

function makeTableOfContents(entries = []) {
  const contentChildren = entries
    .map((entry) => ({
      title: cleanText(entry?.title),
      level: entry?.level === 2 ? 2 : 1,
    }))
    .filter((entry) => entry.title)
    .map((entry) => new Paragraph({
      indent: entry.level === 2 ? { left: 360 } : undefined,
      spacing: { after: 80 },
      children: textRuns(entry.title),
    }));

  return [
    makeSectionHeading("Contents"),
    new TableOfContents("Table of Contents", {
      hyperlink: true,
      headingStyleRange: "1-2",
      contentChildren,
      beginDirty: true,
    }),
    makePageBreak(),
  ];
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
  const logoWidth = 120;
  const logoHeight = 47;
  const logoColumnWidth = 2000;
  const textColumnWidth = PAGE.CONTENT_WIDTH - logoColumnWidth;
  const detailParts = [formatSubject(subject)].filter(Boolean);

  const headerRows = [
    new TableRow({
      children: [
        cell(
          [
            new Paragraph({
              spacing: { after: 40 },
              children: textRuns(title || "Tenacity resource", {
                bold: true,
                color: BRAND.NAVY,
                size: BRAND.FONT_SIZE_H2,
              }),
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
        layout: TableLayoutType.FIXED,
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

function makeSectionHeading(text, opts = {}) {
  setMathLocation(`${cleanText(text)} section`);
  return new Table({
    width: { size: PAGE.CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [PAGE.CONTENT_WIDTH],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          cell(
            [
              new Paragraph({
                heading: opts.heading,
                spacing: { after: 0 },
                children: textRuns(text, {
                  bold: true,
                  color: BRAND.WHITE,
                  size: BRAND.FONT_SIZE_H3,
                }),
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
  setMathLocation(`${cleanText(text)} section`);
  return paragraph(text, {
    bold: true,
    color: BRAND.NAVY,
    size: BRAND.FONT_SIZE_H3,
    keepLines: true,
    keepNext: true,
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
  setMathLocation(`Q${cleanText(number)}`);
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
  const question = /^Q[^(]+/.exec(getMathLocation() || "")?.[0];
  const partLabel = cleanText(label).replace(/[()]/g, "");
  setMathLocation(question ? `${question}(${partLabel})` : `Part (${partLabel})`);
  const marksText = formatMarks(marks);
  const children = [
    rawTextRun(`(${cleanText(label).replace(/[()]/g, "")}) `, { bold: true }),
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

function makeRuledLines(count, border) {
  // Twenty-mark extended responses need 60 lines under the marks policy. The
  // upper bound is only a defensive guard against malformed direct callers;
  // normal resource questions are validated before they reach this function.
  const safeCount = Math.max(0, Math.min(120, Number.parseInt(count, 10) || 0));
  if (!safeCount) return [];

  const baseColor = String(border.color || "AEB6BF").toUpperCase();
  const lastNibble = Number.parseInt(baseColor.slice(-1), 16);
  const alternateColor = Number.isFinite(lastNibble)
    ? `${baseColor.slice(0, -1)}${((lastNibble + 15) % 16).toString(16).toUpperCase()}`
    : baseColor;
  const lines = [];
  for (let i = 0; i < safeCount; i += 1) {
    lines.push(new Paragraph({
      border: {
        // Alternating by one imperceptible colour step prevents Word and
        // LibreOffice from merging consecutive borders into one outer box.
        bottom: { ...border, color: i % 2 ? alternateColor : baseColor, space: 0 },
      },
      spacing: {
        before: 0,
        after: 0,
        line: 400,
        lineRule: LineRuleType.EXACT,
      },
      // A non-breaking space keeps the ruled paragraph in normal page flow;
      // truly empty bordered paragraphs can collapse into the header margin.
      children: [new TextRun({ text: "\u00A0", font: BRAND.FONT, size: 2 })],
    }));
  }
  return lines;
}

function makeWorkingLines(count) {
  return makeRuledLines(count, {
    style: BorderStyle.DOTTED,
    size: 4,
    color: "BBBBBB",
  });
}

// English responses need familiar ruled writing space rather than the dotted
// working area used for maths calculations. Keep this separate so changing an
// English layout cannot silently alter maths worksheets and papers.
function makeResponseLines(count) {
  return makeRuledLines(count, {
    style: BorderStyle.SINGLE,
    size: 4,
    color: "AEB6BF",
  });
}

// Writing space is derived from assessment weight, not a second model guess.
// The agreed policy starts at two lines per mark and adds a 50% allowance,
// giving three lines per mark. Multiple-choice questions need no ruled space.
function responseLineCount(question) {
  if (Array.isArray(question?.options) && question.options.length > 0) return 0;
  const marks = Number(question?.marks);
  if (!Number.isFinite(marks) || marks <= 0) return 0;
  return Math.round(marks * 2 * 1.5);
}

// A consistent bullet glyph plus generous hanging indent so every list across
// every resource lines up the same way and wrapped lines sit under the text,
// not under the marker.
const LIST_TEXT_INDENT = 560;
const LIST_MARKER_INDENT = 280;
const UNORDERED_LIST_MARKER = /^\s*[-*•·▪‣◦–—]\s+/;
const ORDERED_LIST_MARKER = /^\s*\(?(\d{1,2}|[a-zA-Z]|[ivxIVX]{1,4})[.)]\s+/;

// Detects whether a line is a markdown-style list item and, if so, returns the
// normalised marker plus the text with the marker stripped. Returns null for
// ordinary prose so callers can fall back to a plain paragraph. Keeping the
// detection here means bullet/numbered lists render identically whether they
// arrive as a string array (makeBulletList) or embedded in a prose field
// (makeParagraphs), instead of one rendering as indented bullets and the other
// as flat paragraphs with a literal "-" still showing.
function parseListMarker(line) {
  const value = String(line ?? "");
  const ordered = ORDERED_LIST_MARKER.exec(value);
  if (ordered) {
    return { ordered: true, marker: `${ordered[1]}.`, text: value.slice(ordered[0].length) };
  }
  if (UNORDERED_LIST_MARKER.test(value)) {
    return { ordered: false, marker: "•", text: value.replace(UNORDERED_LIST_MARKER, "") };
  }
  return null;
}

function makeListItem(text, opts = {}) {
  const parsed = parseListMarker(text);
  const marker = opts.marker || parsed?.marker || "•";
  const content = parsed ? parsed.text : String(text ?? "");
  const left = opts.indent?.left ?? LIST_TEXT_INDENT;
  const markerIndent = Math.min(opts.markerIndent ?? LIST_MARKER_INDENT, left);
  const size = opts.size || BRAND.FONT_SIZE_BODY;
  return new Paragraph({
    spacing: opts.spacing || { after: 80 },
    indent: { left, hanging: left - markerIndent },
    tabStops: [{ type: TabStopType.LEFT, position: left }],
    children: [
      rawTextRun(marker, { color: opts.color, size, bold: opts.bold }),
      new TextRun({ text: "\t", font: BRAND.FONT, size }),
      ...richTextRuns(content, opts),
    ],
  });
}

// Splits a string for a shaded box into one paragraph per line, rendering any
// list lines as bullets, so multi-paragraph content keeps its breaks instead of
// collapsing into a single run-on line (the previous behaviour, since paragraph
// text has its newlines flattened to spaces).
function shadedBoxParagraphs(content, opts = {}) {
  const lines = String(content ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [paragraph("", { spacing: { after: 0 } })];
  return lines.map((line, index) => {
    const spacing = { after: index === lines.length - 1 ? 0 : (opts.paragraphSpacing ?? 120) };
    if (parseListMarker(line)) return makeListItem(line, { ...opts, spacing });
    return paragraph(line, { ...opts, spacing });
  });
}

function makeShadedBox(content, colour = BRAND.LIGHT_BLUE_BG, opts = {}) {
  const children = Array.isArray(content) ? content : shadedBoxParagraphs(content, opts);
  const safeChildren = children.length ? children : [paragraph("", { spacing: { after: 0 } })];
  return new Table({
    width: { size: PAGE.CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [PAGE.CONTENT_WIDTH],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          cell(safeChildren, PAGE.CONTENT_WIDTH, {
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
    layout: TableLayoutType.FIXED,
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
    layout: TableLayoutType.FIXED,
    rows,
  });
}

function makeAnswerRow(number, answer, opts = {}) {
  setMathLocation(`Answer ${cleanText(number)}`);
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
  makeContentsHeading,
  makeDefinitionTable,
  makeFooter,
  makeHeader,
  makeListItem,
  makePageBreak,
  makePartParagraph,
  makeQuestionParagraph,
  makeResponseLines,
  makeSectionHeading,
  makeShadedBox,
  makeSubHeading,
  makeTableOfContents,
  makeWorkedExampleTable,
  makeWorkingLines,
  paragraph,
  parseListMarker,
  richTextRuns,
  responseLineCount,
  runWithMathRendering,
  stripXmlIllegalChars,
  textRun,
  textRuns,
  titleCase,
};
