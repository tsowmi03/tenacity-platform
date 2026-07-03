"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");

const {
  AlignmentType,
  BorderStyle,
  Footer,
  Header,
  ImageRun,
  Math: DocxMath,
  MathFraction,
  MathRadical,
  MathRun,
  MathSubScript,
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
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
} = require("docx");

const { BRAND, PAGE, loadLogoBuffer } = require("./branding");
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

function cleanText(value) {
  // deAiPunctuation is the deterministic backstop for the no-em-dash rule: it
  // strips the punctuation tells of AI writing before the text is rendered, so
  // they can never reach the document even if the model ignores the prompt.
  return stripXmlIllegalChars(deAiPunctuation(value))
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
    text: stripXmlIllegalChars(text),
    font: BRAND.FONT,
    size: opts.size || BRAND.FONT_SIZE_BODY,
    bold: opts.bold,
    color: opts.color,
    italics: opts.italics,
  });
}

function stripDollarDelimiters(value) {
  // Strip $$...$$ (display math) and $...$ (inline math) delimiters, keeping
  // the inner content so the rest of the math pipeline processes it normally.
  return String(value ?? "")
    .replace(/\$\$([^$]+)\$\$/g, (_, inner) => ` ${inner.trim()} `)
    .replace(/\$([^$\n]+)\$/g, (_, inner) => ` ${inner.trim()} `);
}

function normaliseLaTeXCommands(value) {
  return String(value ?? "")
    // --- Fraction variants → canonical \frac (must run before token detection) ---
    .replace(/\\dfrac\b/g, "\\frac")
    .replace(/\\tfrac\b/g, "\\frac")
    .replace(/\\cfrac\b/g, "\\frac")
    // --- Display-mode modifier → strip ---
    .replace(/\\displaystyle\b\s*/g, "")
    // --- Font/style wrappers → extract inner content ---
    // e.g. \text{cm}, \mathrm{sin}, \mathbf{x}, \operatorname{log}
    .replace(/\\(?:text|mathrm|mathbf|mathit|mathsf|mathtt|operatorname)\s*\{([^{}]*)\}/g, "$1")
    // --- Decoration wrappers → extract inner content ---
    // e.g. \overline{AB}, \hat{x}, \vec{v}
    .replace(/\\(?:overline|underline|hat|tilde|vec|bar|widehat|widetilde)\s*\{([^{}]*)\}/g, "$1")
    // --- Spacing commands → single space ---
    .replace(/\\(?:qquad|quad)\b/g, " ")
    .replace(/\\[,;:!]\s*/g, " ")
    // --- Ellipsis variants → ... ---
    .replace(/\\(?:ldots|cdots|dots|vdots)\b/g, "...")
    // --- Size qualifiers (\left, \right) → strip keyword, keep delimiter ---
    .replace(/\\left\s*/g, "")
    .replace(/\\right\s*/g, "")
    // --- Escaped braces → parentheses for display ---
    .replace(/\\\{/g, "(")
    .replace(/\\\}/g, ")")
    // Greek letters
    .replace(/\\pi\b/g, "π")
    .replace(/\\alpha\b/g, "α")
    .replace(/\\beta\b/g, "β")
    .replace(/\\gamma\b/g, "γ")
    .replace(/\\theta\b/g, "θ")
    .replace(/\\lambda\b/g, "λ")
    .replace(/\\mu\b/g, "μ")
    .replace(/\\sigma\b/g, "σ")
    .replace(/\\phi\b/g, "φ")
    .replace(/\\Delta\b/g, "Δ")
    .replace(/\\delta\b/g, "δ")
    .replace(/\\Omega\b/g, "Ω")
    .replace(/\\omega\b/g, "ω")
    // Operators
    .replace(/\\pm\b/g, "±")
    .replace(/\\times\b/g, "×")
    .replace(/\\div\b/g, "÷")
    .replace(/\\cdot\b/g, "·")
    .replace(/\\approx\b/g, "≈")
    .replace(/\\leq\b/g, "≤")
    .replace(/\\geq\b/g, "≥")
    .replace(/\\le\b/g, "≤")
    .replace(/\\ge\b/g, "≥")
    .replace(/\\neq\b/g, "≠")
    .replace(/\\ne\b/g, "≠")
    .replace(/\\infty\b/g, "∞")
    .replace(/\\rightarrow\b/g, "→")
    .replace(/\\to\b/g, "→")
    // Named functions — render as plain text (Word handles in math context)
    .replace(/\\sin\b/g, "sin")
    .replace(/\\cos\b/g, "cos")
    .replace(/\\tan\b/g, "tan")
    .replace(/\\cot\b/g, "cot")
    .replace(/\\sec\b/g, "sec")
    .replace(/\\csc\b/g, "csc")
    .replace(/\\log\b/g, "log")
    .replace(/\\ln\b/g, "ln")
    .replace(/\\exp\b/g, "exp")
    // --- Additional relation/set operators ---
    .replace(/\\equiv\b/g, "≡")
    .replace(/\\cong\b/g, "≅")
    .replace(/\\sim\b/g, "~")
    .replace(/\\propto\b/g, "∝")
    .replace(/\\perp\b/g, "⊥")
    .replace(/\\parallel\b/g, "∥")
    .replace(/\\mid\b/g, "|")
    .replace(/\\forall\b/g, "∀")
    .replace(/\\exists\b/g, "∃")
    .replace(/\\in\b/g, "∈")
    .replace(/\\subset\b/g, "⊂")
    .replace(/\\subseteq\b/g, "⊆")
    .replace(/\\cup\b/g, "∪")
    .replace(/\\cap\b/g, "∩")
    .replace(/\\emptyset\b/g, "∅");
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

function plainMathRuns(value) {
  return [new MathRun(normaliseMathSymbols(mathText(value)))];
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

function normaliseMathSymbols(value) {
  return String(value ?? "")
    .replace(/<=/g, "≤")
    .replace(/>=/g, "≥")
    .replace(/!=/g, "≠")
    .replace(/->/g, "→")
    .replace(/\*/g, "×")
    .replace(/-/g, "−");
}

function mathFraction(numerator, denominator) {
  return new MathFraction({
    numerator: mathContentChildren(numerator),
    denominator: mathContentChildren(denominator),
  });
}

function mathSuperScript(base, exponent) {
  return new MathSuperScript({
    children: mathContentChildren(base),
    superScript: mathContentChildren(SUPERSCRIPT_DIGITS.get(exponent) || exponent),
  });
}

function mathRadical(radicand, degree) {
  return new MathRadical({
    children: mathContentChildren(radicand),
    ...(degree ? { degree: mathContentChildren(degree) } : {}),
  });
}

function mathSubScript(base, sub) {
  return new MathSubScript({
    children: mathContentChildren(base),
    subScript: mathContentChildren(sub),
  });
}

function buildMathToken(token) {
  if (token.type === "fraction") return mathFraction(token.left, token.right);
  if (token.type === "power") return mathSuperScript(token.left, token.right);
  if (token.type === "radical") return mathRadical(token.radicand, token.degree);
  if (token.type === "sub") return mathSubScript(token.left, token.right);
  return new MathRun(normaliseMathSymbols(token.text));
}

function mathContentChildren(text) {
  const source = mathText(text);
  const children = [];
  let cursor = 0;
  while (cursor < source.length) {
    const token = findMathToken(source, cursor);
    if (!token) break;
    if (token.index > cursor) {
      children.push(new MathRun(normaliseMathSymbols(source.slice(cursor, token.index))));
    }
    children.push(buildMathToken(token));
    cursor = token.index + token.text.length;
  }
  if (cursor < source.length) {
    children.push(new MathRun(normaliseMathSymbols(source.slice(cursor))));
  }
  return children.length ? children : [new MathRun(normaliseMathSymbols(source))];
}

function mathExpression(value) {
  return new DocxMath({ children: mathContentChildren(value) });
}

// Matches up to two levels of nested braces: \sqrt{2x+1}, \sqrt{x^{2}+1}, \frac{a^{\frac{5}{3}}}{b}
const BRACE_CONTENT = String.raw`[^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*`;

function findMathToken(text, start) {
  const candidates = [
    // \sqrt[n]{expr} — nth root (must come before plain sqrt)
    {
      type: "radical",
      regex: new RegExp(String.raw`\\sqrt\s*\[([^\]]+)\]\s*\{(${BRACE_CONTENT})\}`, "g"),
      extract: (m) => ({ radicand: m[2], degree: m[1] }),
    },
    // \sqrt{expr} — square root
    {
      type: "radical",
      regex: new RegExp(String.raw`\\sqrt\s*\{(${BRACE_CONTENT})\}`, "g"),
      extract: (m) => ({ radicand: m[1], degree: null }),
    },
    // \frac{num}{den} — supports nested braces (e.g. \frac{\sqrt{3}}{2})
    {
      type: "fraction",
      regex: new RegExp(String.raw`\\frac\s*\{(${BRACE_CONTENT})\}\s*\{(${BRACE_CONTENT})\}`, "g"),
    },
    {
      type: "fraction",
      regex: /\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g,
    },
    {
      type: "fraction",
      regex: /\(([^()]+)\)\s*\/\s*(\d+(?:\.\d+)?|[A-Za-z]\w*)/g,
    },
    {
      type: "fraction",
      regex: /\b([A-Za-z]\w*|\d+(?:\.\d+)?|\d+[A-Za-z]+)\s*\/\s*([A-Za-z]\w*|\d+(?:\.\d+)?|\d+[A-Za-z]+)\b/g,
    },
    // x^{n} — curly-brace exponent (supports nested braces e.g. ^{\frac{1}{4}})
    {
      type: "power",
      regex: new RegExp(String.raw`(\([^)]+\)|[A-Za-z]\w*|\d+(?:\.\d+)?)\s*\^\s*\{(${BRACE_CONTENT})\}`, "g"),
    },
    // x^n — plain exponent
    {
      type: "power",
      regex: /(\([^)]+\)|[A-Za-z]\w*|\d+(?:\.\d+)?)\s*\^\s*([A-Za-z0-9+\-]+)/g,
    },
    // Unicode superscript digits
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
      const extra = candidate.extract ? candidate.extract(match) : {};
      best = {
        ...candidate,
        index: match.index,
        text: match[0],
        left: match[1],
        right: match[2],
        ...extra,
      };
    }
  }
  return best;
}

// MATH_TERM: each alternative optionally ends with ^{n} or ^n so that expressions
// like 5t^{2} or (x+1)^{3} are captured as a single term rather than having the
// base consumed by one span and the ^{...} orphaned as a literal text run.
const MATH_TERM = String.raw`(?:\\frac\s*\{${BRACE_CONTENT}\}\s*\{${BRACE_CONTENT}\}|\\sqrt\s*(?:\[[^\]]+\])?\s*\{${BRACE_CONTENT}\}|\([^()]*[A-Za-z0-9][^()]*\)(?:\^\{${BRACE_CONTENT}\}|\^[A-Za-z0-9])?|[-−]?\$?\d+(?:\.\d+)?%?(?:\s*\/\s*[A-Za-z0-9]+)?[A-Za-z]*(?:\^\{${BRACE_CONTENT}\}|\^[A-Za-z0-9])?|[A-Za-z][A-Za-z0-9]*(?:\^\{${BRACE_CONTENT}\}|\^[A-Za-z0-9])?)`;
const MATH_OPERATOR = String.raw`(?:<=|>=|!=|->|[+\-−=<>≤≥×÷±·*/^]|→|≠|≈)`;
// The trailing lone-letter group lets a span keep a detached variable ("= 5 x"),
// but the negative lookahead stops it from biting the first letter off an
// ordinary word ("= 0 by factorising" must not become "= 0 b" + "y factorising").
const MATH_SPAN_MATCHERS = [
  // \sqrt{...} and \sqrt[n]{...} — uses 2-level BRACE_CONTENT
  { regex: new RegExp(String.raw`\\sqrt\s*(?:\[[^\]]+\])?\s*\{${BRACE_CONTENT}\}`, "g") },
  // \frac{...}{...} — uses 2-level BRACE_CONTENT to match nested expressions
  { regex: new RegExp(String.raw`\\frac\s*\{${BRACE_CONTENT}\}\s*\{${BRACE_CONTENT}\}`, "g") },
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
  { regex: new RegExp(String.raw`(\([^)]+\)|[A-Za-z]\w*|\d+(?:\.\d+)?)\s*\^\s*\{(${BRACE_CONTENT})\}`, "g") },
  { regex: /(\([^)]+\)|[A-Za-z]\w*|\d+(?:\.\d+)?)\s*\^\s*([A-Za-z0-9+\-]+)/g },
  { regex: /(\([^)]+\)|[A-Za-z]\w*|\d+(?:\.\d+)?)([⁰¹²³⁴⁵⁶⁷⁸⁹])/g },
];

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
  for (const { regex, rejectProse } of MATH_SPAN_MATCHERS) {
    regex.lastIndex = start;
    let match = regex.exec(text);
    // Skip rejected candidates one character at a time rather than jumping past
    // them wholesale, so a genuine expression later in the sentence ("the ±
    // gives x = 2") is still found by this same regex.
    while (match && (isLikelyHyphenatedWord(match[0]) || (rejectProse && isProseSpan(match[0])))) {
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

function richTextRuns(text, opts = {}) {
  // When math is disabled (e.g. English documents), emit the text verbatim so a
  // forward slash stays a slash and a hyphen stays a hyphen — no fraction,
  // subtraction, or symbol substitution. Leaves currency like "$5" untouched.
  if (!mathRenderingEnabled()) {
    return [textRun(text, opts)];
  }
  const value = mathText(stripDollarDelimiters(text));
  if (!value) return [rawTextRun("", opts)];

  const runs = [];
  let cursor = 0;
  while (cursor < value.length) {
    const span = findMathSpan(value, cursor);
    if (!span) break;
    if (span.index > cursor) {
      runs.push(rawTextRun(value.slice(cursor, span.index), opts));
    }
    runs.push(mathExpression(span.text));
    cursor = span.index + span.text.length;
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

function makeSectionHeading(text) {
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
  makeListItem,
  makePageBreak,
  makePartParagraph,
  makeQuestionParagraph,
  makeSectionHeading,
  makeShadedBox,
  makeSubHeading,
  makeWorkedExampleTable,
  makeWorkingLines,
  paragraph,
  parseListMarker,
  richTextRuns,
  runWithMathRendering,
  stripXmlIllegalChars,
  textRun,
  titleCase,
};
