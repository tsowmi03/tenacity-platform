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
  BuilderElement,
  RunProperties,
  XmlComponent,
  Math: DocxMath,
  MathFraction,
  MathRadical,
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
  BIG_OPS,
  BRACE_CONTENT,
  ENVIRONMENTS,
  ENV_TERM,
  NUM,
  LETTER,
  PAREN,
  SCRIPTED,
  SCRIPT_TERM,
  SET_LITERAL,
  WORD_TAIL,
  getMathLocation,
  hasRawMath,
  inlineScriptSegments,
  isEmptyBase,
  normaliseLaTeXCommands,
  parseMath,
  rawMathExcerpt,
  readableFallback,
  recordMathIssue,
  restoreBraces,
  scriptSegments,
  setMathLocation,
  splitLatexLines,
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
    text: restoreBraces(guardRawMath(cleanText(text, { verbatim: opts.verbatim }), opts)),
    font: BRAND.FONT,
    size: opts.size || BRAND.FONT_SIZE_BODY,
    bold: opts.bold,
    color: opts.color,
    italics: opts.italics,
  });
}

function rawTextRun(text, opts = {}) {
  return new TextRun({
    text: restoreBraces(guardRawMath(stripXmlIllegalChars(text), opts)),
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
      text: restoreBraces(stripXmlIllegalChars(segment.text)),
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

// The prompt tells the model never to wrap maths in $ delimiters, so a $ in
// a maths resource is almost always money ("Tom has $15 and Sam has $20").
// A pair only counts as delimiters when it hugs its content the way LaTeX
// does ($x + 3$, not "$15 and Sam has $") and the content is not itself an
// amount ($5-$10). Escaped \$ is always money.
const DISPLAY_MATH = /(?<!\\)\$\$(?=\S)([^$]+?)(?<=\S)\$\$/g;
const INLINE_MATH = /(?<![\\$])\$(?!\$)(?=\S)([^$\n]+?)(?<=\S)\$(?![\d$])/g;

function looksLikeMoney(inner) {
  return /^[\d.,]/.test(inner) && !/[\\^_A-Za-z]/.test(inner);
}

function stripDollarDelimiters(value) {
  return String(value ?? "")
    .replace(DISPLAY_MATH, (_, inner) => ` ${inner.trim()} `)
    .replace(INLINE_MATH, (match, inner) => (looksLikeMoney(inner) ? match : ` ${inner.trim()} `));
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

// Formatting of the paragraph the equation sits in. Equation runs carry no
// formatting of their own, so without this they came out at the default size
// and black: small in titles and headings, invisible on a dark header band.
// Set by mathSpanRuns for the (synchronous) build of one equation.
let currentMathStyle = {};

class MathTextElement extends XmlComponent {
  constructor(text) {
    super("m:t");
    this.root.push(text);
  }
}

// An equation run in the surrounding text's size, colour and weight;
// `plain` sets it upright (function names, words, units).
function mathRun(text, { plain = false } = {}) {
  const run = new BuilderElement({ name: "m:r", children: [] });
  if (plain) run.root.push(ommlElement("m:rPr", [ommlElement("m:sty", [], "p")]));
  const { size, color, bold } = currentMathStyle;
  if (size || color || bold) run.root.push(new RunProperties({ size, color, bold }));
  run.root.push(new MathTextElement(text));
  return run;
}

// Function names and real words (sin, log, Area, distance) are upright in
// maths. Variables stay italic: single letters, products like ac or lwh, and
// point names like ABC.
const FUNCTION_NAMES = new Set(["arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "sin", "cos", "tan",
  "cot", "sec", "csc", "log", "ln", "exp", "lim", "max", "min", "det", "gcd", "deg", "Pr"]);

function isUprightWord(word) {
  if (FUNCTION_NAMES.has(word)) return true;
  return word.length >= 3 && /[aeiou]/i.test(word) && word !== word.toUpperCase();
}

function textMathRuns(value) {
  const out = [];
  let cursor = 0;
  for (const match of value.matchAll(/(?<![A-Za-z])[A-Za-z]{2,}(?![A-Za-z])/g)) {
    if (!isUprightWord(match[0])) continue;
    if (match.index > cursor) out.push(mathRun(value.slice(cursor, match.index)));
    out.push(mathRun(match[0], { plain: true }));
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) out.push(mathRun(value.slice(cursor)));
  return out;
}

const SUPERSCRIPT_CHARS = {
  0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ",
  a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ", g: "ᵍ", h: "ʰ", j: "ʲ", k: "ᵏ",
  l: "ˡ", m: "ᵐ", o: "ᵒ", p: "ᵖ", r: "ʳ", s: "ˢ", t: "ᵗ", u: "ᵘ", v: "ᵛ", w: "ʷ",
  x: "ˣ", y: "ʸ", z: "ᶻ",
};

// The Unicode superscript form of a plain script (5, n, 10), or null.
function unicodeSuperscript(nodes) {
  if (!nodes || !nodes.every((node) => node.type === "text")) return null;
  const chars = [...nodes.map((node) => node.value).join("")];
  if (!chars.length || !chars.every((ch) => SUPERSCRIPT_CHARS[ch])) return null;
  return chars.map((ch) => SUPERSCRIPT_CHARS[ch]).join("");
}

// Raw OMML element: <m:name m:val="..."> with children.
function ommlElement(name, children = [], val) {
  return new BuilderElement({
    name,
    ...(val === undefined ? {} : { attributes: { val: { key: "m:val", value: val } } }),
    children,
  });
}

// A delimiter pair around content: ( ), [ ], or a lone { for cases.
function ommlDelimited(open, close, children) {
  if (!open && !close) return children;
  return [ommlElement("m:d", [
    ommlElement("m:dPr", [ommlElement("m:begChr", [], open), ommlElement("m:endChr", [], close)]),
    ommlElement("m:e", children),
  ])];
}

// Stacked equations (cases, aligned) as an equation array; matrices and
// column vectors as a matrix.
function ommlArray(node) {
  const { layout, open, close } = ENVIRONMENTS[node.env];
  let inner;
  if (layout === "lines") {
    inner = ommlElement("m:eqArr", node.rows.map((row) => ommlElement(
      "m:e",
      row.flatMap((cell, index) => [...(index ? [mathRun("  ")] : []), ...ommlChildren(cell)])
    )));
  } else {
    const columns = Math.max(...node.rows.map((row) => row.length));
    inner = ommlElement("m:m", [
      ommlElement("m:mPr", [ommlElement("m:mcs", [ommlElement("m:mc", [ommlElement("m:mcPr", [
        ommlElement("m:count", [], String(columns)),
        ommlElement("m:mcJc", [], "center"),
      ])])])]),
      ...node.rows.map((row) => ommlElement("m:mr", Array.from({ length: columns }, (_, index) => (
        ommlElement("m:e", ommlChildren(row[index] || []))
      )))),
    ]);
  }
  return ommlDelimited(open, close, [inner]);
}

// Word equation components for a parsed node tree (see mathNotation.js).
function ommlChildren(nodes) {
  const out = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.type === "script" && isEmptyBase(node.base)) {
      // Pre-script (ⁿCᵣ): the scripts sit before the next atom.
      const next = nodes[index + 1];
      let base = [];
      if (next?.type === "text") {
        const [first, ...rest] = [...next.value];
        base = [{ type: "text", value: first }];
        if (rest.length) nodes = [...nodes.slice(0, index + 1), { type: "text", value: rest.join("") }, ...nodes.slice(index + 2)];
        else index += 1;
      } else if (next) {
        base = [next];
        index += 1;
      }
      // ⁿCᵣ: a pre-superscript that has a Unicode superscript form is written
      // as those characters. Both Word and LibreOffice (the preview) draw an
      // empty pre-subscript slot as a placeholder box, so m:sPre is only the
      // fallback, built by hand because docx writes its children out of
      // schema order (base first) and LibreOffice then drops the base.
      const flatSup = !node.sub && unicodeSuperscript(node.sup);
      if (flatSup) {
        out.push(mathRun(flatSup), ...ommlChildren(base));
      } else {
        const slot = (part) => (part ? ommlChildren(part) : []);
        out.push(ommlElement("m:sPre", [
          ommlElement("m:sub", slot(node.sub)),
          ommlElement("m:sup", slot(node.sup)),
          ommlElement("m:e", ommlChildren(base)),
        ]));
      }
      continue;
    }
    if (node.type === "array") {
      out.push(...ommlArray(node));
    } else if (node.type === "text") {
      if (node.value) out.push(...textMathRuns(restoreBraces(normaliseMathSymbols(node.value))));
    } else if (node.type === "group") {
      out.push(...ommlChildren(node.children));
    } else if (node.type === "paren") {
      out.push(mathRun(node.open), ...ommlChildren(node.children), mathRun(node.close));
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
// An equation is one unbreakable box in the LibreOffice preview, so a long
// formula in a narrow table cell ran past the cell edge. Long equations are
// cut before top-level relations and operators ("P(A ∪ B)" | " = P(A)" |
// " + P(B)"), each piece its own equation, so the line can wrap there with
// the operator starting the new line, as Word does. Word draws the pieces
// exactly as one.
const LONG_EQUATION = 28;
const CHUNK_LENGTH = 18;
const BREAK_BEFORE = /(?= [=<>≤≥≈≠⇒⇔→+−\-×÷] )/;

function nodesLength(nodes) {
  return scriptSegments(nodes).reduce((total, segment) => total + segment.text.length, 0);
}

function breakableChunks(nodes) {
  if (nodesLength(nodes) <= LONG_EQUATION) return [nodes];
  // Cut before every top-level " op ", then merge neighbours while they fit.
  const segments = [[]];
  for (const node of nodes) {
    const parts = node.type === "text"
      ? node.value.split(BREAK_BEFORE).filter(Boolean).map((value) => ({ type: "text", value }))
      : [node];
    for (const part of parts) {
      if (part.type === "text" && /^ [=<>≤≥≈≠⇒⇔→+−\-×÷] /.test(part.value)) segments.push([]);
      segments[segments.length - 1].push(part);
    }
  }
  const chunks = [];
  for (const segment of segments.filter((part) => part.length)) {
    const last = chunks[chunks.length - 1];
    if (last && nodesLength(last) + nodesLength(segment) <= CHUNK_LENGTH) last.push(...segment);
    else chunks.push([...segment]);
  }
  // The space before a piece is written between the equations instead.
  for (const chunk of chunks.slice(1)) {
    if (chunk[0].type === "text") chunk[0] = { type: "text", value: chunk[0].value.replace(/^\s+/, "") };
  }
  return chunks;
}

function mathSpanRuns(value, opts = {}) {
  const parsed = parseMath(mathText(value));
  if (parsed.ok) {
    currentMathStyle = { size: opts.size || BRAND.FONT_SIZE_BODY, color: opts.color, bold: opts.bold };
    let children;
    try {
      children = ommlChildren(parsed.nodes);
    } finally {
      currentMathStyle = {};
    }
    if (children.length) {
      return breakableChunks(parsed.nodes).flatMap((chunk, index) => {
        currentMathStyle = { size: opts.size || BRAND.FONT_SIZE_BODY, color: opts.color, bold: opts.bold };
        try {
          return [
            // The space before each piece's operator is ordinary text: it keeps
            // the operator's gap and is where the line may break.
            ...(index ? [new TextRun({ text: " ", size: opts.size || BRAND.FONT_SIZE_BODY })] : []),
            new DocxMath({ children: ommlChildren(chunk) }),
          ];
        } finally {
          currentMathStyle = {};
        }
      });
    }
  }
  const shownAs = readableFallback(value);
  recordMathIssue({ source: value, shownAs });
  return [rawTextRun(shownAs, opts)];
}

// Span grammar. An ATOM is one indivisible piece of maths; a TERM is atoms
// written side by side (2πr, \frac{1}{2}bh, (x+1)(x−2), P(A)); a span is
// terms joined by operators, or by a single space when the next piece is
// plainly maths (π r², 2bc cos A, 12 tan 35°). Every piece can carry scripts
// (SCRIPTED) so 5t^{2}, (x+1)^{3} and H_2O stay whole. Keeping an expression
// in one span matters: anything left between spans is body-font text, so
// "A = π r²" used to come out as three differently styled pieces.
const FUNCTION_WORD = String.raw`(?:arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|cot|sec|csc|log|ln|exp|lim|max|min|det|gcd)(?![A-Za-z])`;
const PREFIX = String.raw`[∠△∡∴∵¬]\s?`;
const SUFFIX = String.raw`(?:[°′″'%!]|[⁰¹²³⁴⁵⁶⁷⁸⁹⁻ⁿ]+)*`;
// 10 000, 3 456.5: NSW writes thousands with a space.
const GROUPED_NUM = String.raw`\d{1,3}(?:[  ]\d{3})+(?!\d)(?:\.\d+)?`;
// x:y, a:b:c, AB:DE, 12 : 18. Letter ratios must be tight so "Q: x" is not one.
const RATIO_PART = String.raw`(?:${NUM}|[A-Za-z]{1,2}(?![A-Za-z]))`;
// A spaced numeric ratio is spaced on both sides (12 : 18); "Step 1: 3" is a label.
const RATIO = String.raw`(?:${NUM}(?:(?: : |:)${NUM})+|${RATIO_PART}(?::${RATIO_PART})+)`;
// Intervals: (−∞, 3], [0, 1).
const INTERVAL = String.raw`[(\[]\s?[-−]?(?:∞|${NUM})\s?,\s?[-−]?(?:∞|${NUM})\s?[)\]]`;
const ATOM = String.raw`(?:${ENV_TERM}|${SET_LITERAL}|${INTERVAL}|□|_{2,}|[∅∞ℝℕℤℚℂ]|\\frac\s*\{${BRACE_CONTENT}\}\s*\{${BRACE_CONTENT}\}|\\sqrt\s*(?:\[[^\]]+\])?\s*\{${BRACE_CONTENT}\}|${PAREN}|\|[^|\n]{1,40}?\||${RATIO}|\$?(?:${GROUPED_NUM}|${NUM})|${FUNCTION_WORD}|[${BIG_OPS}]|[${LETTER}]${WORD_TAIL})${SCRIPTED}${SUFFIX}`;
const TERM = String.raw`(?:${PREFIX})?${ATOM}(?:(?:${PREFIX})?${ATOM})*`;
// What may follow a single space with no operator in between.
// Two-letter English words that would otherwise pass as a product of two
// variables ("If x = 2", "is x = −b/2a", "or x = 3").
const SHORT_WORDS = [
  "if", "is", "or", "of", "to", "in", "on", "at", "by", "be", "as", "an", "so",
  "we", "it", "no", "do", "up", "us", "my", "he", "me", "am", "go", "eg", "ie",
];
const JUXT_TERM = String.raw`(?=[${LETTER}](?![A-Za-z])|(?!(?:${SHORT_WORDS.join("|")})(?![A-Za-z]))[a-z]{2}(?![A-Za-z])|${FUNCTION_WORD}|[∠△∡∴∵¬\\${BIG_OPS}□∅∞]|\((?![^()]*[A-Za-z]{3})|\d)${TERM}`;
const MATH_OPERATOR = String.raw`(?:<=>|<=|>=|!=|->|=>|[+\-−=<>≤≥≠≈×÷±∓·*/^∪∩∈∉∋⊂⊆⊊⊃⊇∖⇒⇔⇐→↦↔⟶∝≡≅≃~∥⊥⩽⩾≰≱≮≯≪≫∘])`;
const SIGN = String.raw`(?:[±∓+\-−]\s?)`;
const MATH_SPAN = String.raw`${SIGN}?${TERM}(?:\s*${MATH_OPERATOR}\s*${SIGN}?${TERM}|\s${JUXT_TERM})*`;
// A span is only worth typesetting when it has a real operator: P(A) alone or
// a ratio or time on its own (2:3, 3:45) reads fine as text.
const HAS_OPERATOR = /[+\-−=<>≤≥≠≈×÷±∓·*/^∪∩∈∉∋⊂⊆⊊⊃⊇∖⇒⇔⇐→↦↔⟶∝≡≅≃~∥⊥⩽⩾≰≱≮≯≪≫∘]/;
const MATH_SPAN_MATCHERS = [
  // \begin{cases} ... \end{cases}, \begin{pmatrix} ... \end{pmatrix}
  { regex: new RegExp(ENV_TERM, "g") },
  // \sqrt{...} and \sqrt[n]{...}
  { regex: new RegExp(String.raw`\\sqrt\s*(?:\[[^\]]+\])?\s*\{${BRACE_CONTENT}\}${SCRIPTED}`, "g") },
  // \frac{...}{...}, including nested expressions
  { regex: new RegExp(String.raw`\\frac\s*\{${BRACE_CONTENT}\}\s*\{${BRACE_CONTENT}\}${SCRIPTED}`, "g") },
  {
    regex: new RegExp(MATH_SPAN, "g"),
    // Bare words count as terms, so prose joined by an operator ("Test - for",
    // "the ± gives") matches too — reject those instead of typesetting them.
    rejectProse: true,
    needsOperator: true,
  },
  // A function applied with no operator: log₂ 8, sin θ, tan 35°.
  { regex: new RegExp(String.raw`${FUNCTION_WORD}${SCRIPTED}(?:\s?${TERM})`, "g") },
  // A point, with its letter if it has one: (3, −4), B(4, 7).
  { regex: /(?<![A-Za-z])[A-Z]?\([-−]?\d+(?:\.\d+)?,\s*[-−]?\d+(?:\.\d+)?\)/g },
  // A negative number, with any power: -2^{2} is one term, not −2 + "^{2}".
  { regex: new RegExp(String.raw`(?<![\w])[-−]\d+(?:\.\d+)?%?\b${SCRIPTED}`, "g") },
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
  "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "lim", "max", "min", "det", "gcd",
  "true", "false",
  "frac", "sqrt",
]);

// A term-operator-term span is worth typesetting only when its alphabetic
// tokens look like algebra: single letters, short products like "ab", or known
// function names. Any longer word means the "span" is really prose that happens
// to sit around an operator ("Diagnostic Test - for tutor use", "the ± gives
// only one root") and must stay ordinary text.
const SHORT_WORD_SET = new Set(SHORT_WORDS);

function isProseSpan(value) {
  // LaTeX commands and environment names are notation, not words.
  const text = String(value)
    .replace(/\\(?:begin|end)\{[A-Za-z]+\*?\}/g, " ")
    .replace(/\\[A-Za-z]+/g, " ");
  const words = text.match(/[A-Za-z]{3,}/g) || [];
  // Capitalised point names (AOB, ABC, PQR) are geometry, not prose.
  // Capitalised point names (AOB, ABC, PQR) are geometry, and a short run with
  // no vowel is a product of variables (lwh, Prn), not a word.
  const prose = words.some((word) => !MATH_SPAN_FUNCTION_WORDS.has(word.toLowerCase())
    && !/^[A-Z]{3,4}$/.test(word)
    && !(word.length <= 4 && !/[aeiouAEIOU]/.test(word)));
  const shortWords = text.match(/(?<![A-Za-z])[A-Za-z]{2}(?![A-Za-z])/g) || [];
  return prose || shortWords.some((word) => SHORT_WORD_SET.has(word.toLowerCase()) && word !== word.toUpperCase());
}

function normaliseMathMatch(match) {
  const leadingWordBeforeNegative = /^([A-Za-z]{2,}\s+)([-−]\$?\d[\s\S]*)$/.exec(match[0]);
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
  for (const { regex, rejectProse, rejectIdentifier, needsOperator } of MATH_SPAN_MATCHERS) {
    regex.lastIndex = start;
    let match = regex.exec(text);
    // Skip rejected candidates one character at a time rather than jumping past
    // them wholesale, so a genuine expression later in the sentence ("the ±
    // gives x = 2") is still found by this same regex. The mid-word check stops
    // that walk from typesetting the tail of a rejected word: "Width = 5" is
    // prose, and re-scanning it must not accept "th = 5".
    const rejects = (m) =>
      isLikelyHyphenatedWord(m[0]) ||
      (needsOperator && !HAS_OPERATOR.test(m[0].replace(/\\[A-Za-z]+/g, "").replace(/^[±∓+\-−]\s?/, ""))) ||
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
    // At the same start the longer span wins: \frac{3}{4} + \frac{1}{6} is one
    // expression, not a fraction followed by "+ \frac{1}{6}".
    if (!best || normalised.index < best.index
      || (normalised.index === best.index && normalised.text.length > best.text.length)) {
      best = normalised;
    }
  }
  return best;
}

// **bold** is safe everywhere: no maths writes a doubled asterisk. Single
// * and _ emphasis stays opt-in, because in maths they are multiplication,
// subscripts and blanks ("{}_{n}C_{r}" must not italicise "{n}C").
const BOLD_ONLY = /(?<![\p{L}\p{N}*])(\*\*)(\S(?:.*?\S)?)\*\*(?![\p{L}\p{N}*])/gu;

function inlineMarkdownSegments(value, { boldOnly = false } = {}) {
  const text = String(value ?? "");
  // Keep this deliberately small: booklet sections only need inline emphasis,
  // while paragraph and list structure is handled by makeParagraphs. The
  // single-marker boundary checks avoid treating maths such as 2*3*4 or x_1 as
  // emphasis.
  const pattern = boldOnly ? BOLD_ONLY : /(?<![\p{L}\p{N}])(\*\*|__)(\S(?:.*?\S)?)\1(?![\p{L}\p{N}])|(?<![\p{L}\p{N}*])\*(?!\*)(\S(?:.*?\S)?)\*(?![\p{L}\p{N}*])|(?<![\p{L}\p{N}_])_(?!_)(\S(?:.*?\S)?)_(?![\p{L}\p{N}_])/gu;
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

// Units after a number (60 km/h, 25 cm², 9.8 m/s², $4.50/kg, 7.5 L/100 km)
// are ordinary upright text. They are hidden from span detection, so they are
// never set as italic variables or stacked as fractions, and their powers are
// written as superscript characters. Longest names first so "min" is not "m".
const UNIT_NAMES = ["kWh", "sec", "min", "hrs", "mm", "cm", "km", "mL", "ml", "kL", "mg", "kg", "ms", "hr", "ha", "kW",
  "°C", "°F", "m", "L", "g", "s", "h"];
const UNIT = String.raw`(?:${UNIT_NAMES.join("|")})`;
const UNIT_POWER = String.raw`(?:\s?\^\s?\{?[-−]?[123]\}?|[²³]|⁻[¹²³])?`;
const UNIT_PHRASE = new RegExp(
  String.raw`(\d\s?)(\/?${UNIT}${UNIT_POWER}(?:\/(?:\d+\s?)?${UNIT}${UNIT_POWER})?)(?![A-Za-z0-9])`,
  "g"
);
const UNIT_POWER_CHARS = { 1: "¹", 2: "²", 3: "³" };

function unitPowersAsCharacters(phrase) {
  return phrase.replace(/\s?\^\s?\{?([-−]?)([123])\}?/g, (_, sign, digit) => `${sign ? "⁻" : ""}${UNIT_POWER_CHARS[digit]}`);
}

// A rate written without a number ("speed in km/h", "Rate (km/h)"). Two
// single letters are only a unit pair as m/s; d/t and V/h are fractions.
const UNIT_RATE = new RegExp(String.raw`(?<![A-Za-z0-9])(${UNIT})\/(${UNIT})(?![A-Za-z0-9])`, "g");

function maskUnits(value) {
  const text = value.replace(UNIT_PHRASE, (_, number, phrase) => number + unitPowersAsCharacters(phrase));
  const masked = text
    .replace(UNIT_PHRASE, (_, number, phrase) => number + "\u0001".repeat(phrase.length))
    .replace(UNIT_RATE, (rate, top, bottom) => (
      top.length > 1 || bottom.length > 1 || rate === "m/s" ? "\u0001".repeat(rate.length) : rate
    ));
  return { text, masked };
}

function mathAwareTextRuns(input, opts = {}) {
  if (!input) return [rawTextRun("", opts)];
  const { text: value, masked } = maskUnits(input);

  const runs = [];
  let cursor = 0;
  while (cursor < value.length) {
    const found = findMathSpan(masked, cursor);
    const span = found && { index: found.index, text: value.slice(found.index, found.index + found.text.length) };
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

function isStyledText(opts) {
  const color = String(opts.color || "").toUpperCase();
  return (opts.size && opts.size > BRAND.FONT_SIZE_BODY) || (color && color !== "000000");
}

function richTextRuns(text, opts = {}) {
  // When math is disabled (e.g. English documents), keep prose punctuation
  // literal. Maths documents still run through the expression renderer. Clean
  // the whole value before splitting Markdown so whitespace around styled runs
  // survives rather than being trimmed from every segment independently.
  const mathEnabled = mathRenderingEnabled();
  // Headings, titles and coloured text set their maths inline (raised and
  // lowered runs in the text's own font): Word equations ignore the run's
  // size and colour in the LibreOffice preview, so a title's maths came out
  // small and black, and white header text came out black on navy.
  if (mathEnabled && !opts.verbatim && isStyledText(opts)) {
    return textRuns(text, opts);
  }
  if (mathEnabled) {
    // Stacked working ("2 × $12 = $24" over "3 × $12 = $36") and LaTeX \\
    // keep their line breaks; joining them reads 24 3 as 243.
    const lines = splitLatexLines(stripDollarDelimiters(text))
      .split(/\r\n|\r|\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 1) {
      return lines.flatMap((line, index) => [
        ...(index ? [new TextRun({ break: 1 })] : []),
        ...richTextRuns(line, opts),
      ]);
    }
  }
  const value = mathEnabled
    ? mathText(stripDollarDelimiters(text))
    : cleanText(text, { verbatim: opts.verbatim });
  const segments = inlineMarkdownSegments(value, { boldOnly: !opts.inlineMarkdown });

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

function answerLines(answer) {
  const lines = String(answer ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines : [""];
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
      // One paragraph per line: working out is one step per line, and a single
      // paragraph ran every step together into an unreadable block.
      cell(
        answerLines(answer).map((line, index, lines) =>
          paragraph(line, {
            bold: opts.bold || (lines.length > 1 && line === "Working:"),
            color: opts.color,
            spacing: { before: index && line === "Working:" ? 80 : 0, after: 0 },
          })
        ),
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
