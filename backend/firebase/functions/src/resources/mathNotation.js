"use strict";

// One reader for the maths notation the resource model writes: a LaTeX subset
// (^, _, braces, \frac, \sqrt) plus the loose forms models actually produce
// (x^-1, x^12, 2^(x+1)). Every place that shows maths — Word equations, Word
// headings, diagram labels — parses through here, so a notation either works
// everywhere or is reported everywhere. The old approach was a stack of
// regexes, one per notation, and anything they didn't anticipate came out as
// raw text or, worse, as different maths (m^3n^4 rendered as m^(3n) then ^4).
//
// Binding follows LaTeX: a script without braces takes one token. The two
// deliberate exceptions are digit runs (x^12 means x¹², not x¹2) and a
// bracketed exponent (2^(x+1) means 2 to the x+1), because that is what the
// model means every time it writes them.
//
// When something can't be parsed (unbalanced braces, a dangling ^, a LaTeX
// command we don't know), callers show a readable plain-text version and
// record a math issue, which becomes a MATH_FALLBACK warning on the job so
// the tutor knows to check it before printing.

const { AsyncLocalStorage } = require("node:async_hooks");

const MATH_FALLBACK = "MATH_FALLBACK";

// Up to three levels of nested braces: ^{\frac{a^{2}}{b}} and deeper.
const BRACE_CONTENT = String.raw`[^{}]*(?:\{[^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*\}[^{}]*)*`;
// Up to three levels of nested parentheses: ((x+1)^2)^3, (2(x+1))^2.
const PAREN = String.raw`\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)`;
const LETTER = "A-Za-zα-ωΑ-Ω";
// A script argument may follow a space only when it is a number, a braced
// group or a bracket: "x^ 2" is x², but "x^ when" is a dangling caret before
// a word, not x to the power w followed by "hen".
const SPACED_SCRIPT_ARG = String.raw`(?:\{${BRACE_CONTENT}\}|${PAREN}|[-−+]?\d+(?:\.\d+)?)`;
const ADJACENT_SCRIPT_ARG = String.raw`(?:[-−+]?[${LETTER}]|\\[A-Za-z]+(?:\s*\{${BRACE_CONTENT}\}){0,2})`;
// One ^ or _ with its argument.
const SCRIPT = String.raw`(?:\s*[\^_](?:\s*${SPACED_SCRIPT_ARG}|${ADJACENT_SCRIPT_ARG}))`;
// Scripts interleaved with the letters that follow them, so m^3n^4 and H_2SO_4
// are one term rather than a term plus orphaned scripts.
const SCRIPTED = String.raw`(?:${SCRIPT}[A-Za-z0-9]*)*`;
// A base carrying at least one script: x^2, (x+1)^{3}, H_2O, 10^{-3}.
const SCRIPT_TERM = String.raw`(?:${PAREN}|[${LETTER}][A-Za-z0-9]*|\d+(?:\.\d+)?)(?:${SCRIPT}[A-Za-z0-9]*)+`;

// Anything that should have become maths but is still raw: a script between
// two tokens, a dangling script with nothing after it ("x^", "x_ ="), or a
// LaTeX command. Blanks ("x = ____", "x____") are not matched: a dangling
// underscore must touch its base and not be followed by another underscore.
// The readable fallback form x^(n+1) is not matched either.
const RAW_MATH_MARKER = /\\[A-Za-z]+|[A-Za-z0-9α-ωΑ-Ω)\]}]\s*[\^_](?:\s*[{\d]|\s*[-−+]\d|[A-Za-zα-ωΑ-Ω\-−+\\])|[A-Za-z0-9α-ωΑ-Ω)\]}]\s*\^(?=\s*(?:$|[\s.,;:!?=<>)\]]))|[A-Za-z0-9α-ωΑ-Ω)\]}]_(?=$|[\s.,;:!?=<>)\]])/;

// Identifiers such as file_name are prose, not a subscript.
const SNAKE_CASE_IDENTIFIER = /\b[A-Za-z]{3,}(?:_[A-Za-z0-9]+)+\b/g;

// True when text still holds notation that should have been typeset.
function hasRawMath(value) {
  return RAW_MATH_MARKER.test(String(value ?? "").replace(SNAKE_CASE_IDENTIFIER, ""));
}

// The whitespace-delimited token holding the first raw notation in `value`
// ("x^{2" out of "Simplify x^{2 + 1"), so a warning can quote just that.
function rawMathExcerpt(value) {
  const text = String(value ?? "");
  const masked = text.replace(SNAKE_CASE_IDENTIFIER, (m) => " ".repeat(m.length));
  const match = RAW_MATH_MARKER.exec(masked);
  if (!match) return text.trim();
  const start = text.lastIndexOf(" ", match.index) + 1;
  const endSpace = text.indexOf(" ", match.index + match[0].length);
  return text.slice(start, endSpace < 0 ? text.length : endSpace).trim();
}

// ---------------------------------------------------------------------------
// LaTeX command normalisation
// ---------------------------------------------------------------------------

const SYMBOL_COMMANDS = {
  // Greek
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε",
  zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ",
  lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ",
  tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π",
  Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  // Operators and relations
  pm: "±", mp: "∓", times: "×", div: "÷", cdot: "·", ast: "*",
  approx: "≈", leq: "≤", geq: "≥", le: "≤", ge: "≥", neq: "≠", ne: "≠",
  lt: "<", gt: ">", equiv: "≡", cong: "≅", sim: "~", simeq: "≃",
  propto: "∝", perp: "⊥", parallel: "∥", mid: "|",
  infty: "∞", partial: "∂", nabla: "∇", circ: "∘", degree: "°", prime: "′",
  angle: "∠", triangle: "△", square: "□",
  sum: "Σ", prod: "Π", int: "∫",
  // Arrows and logic
  rightarrow: "→", to: "→", leftarrow: "←", gets: "←", Rightarrow: "⇒",
  Leftarrow: "⇐", Leftrightarrow: "⇔", leftrightarrow: "↔", implies: "⇒",
  iff: "⇔", therefore: "∴", because: "∵", neg: "¬", land: "∧", lor: "∨",
  forall: "∀", exists: "∃",
  // Sets
  in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", supset: "⊃",
  supseteq: "⊇", cup: "∪", cap: "∩", emptyset: "∅", varnothing: "∅",
  setminus: "∖",
  // Brackets
  langle: "⟨", rangle: "⟩", lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉",
  vert: "|", lvert: "|", rvert: "|",
  // Dots
  ldots: "...", cdots: "...", dots: "...", vdots: "...",
  // Named functions render as their plain names
  sin: "sin", cos: "cos", tan: "tan", cot: "cot", sec: "sec", csc: "csc",
  arcsin: "arcsin", arccos: "arccos", arctan: "arctan",
  sinh: "sinh", cosh: "cosh", tanh: "tanh",
  log: "log", ln: "ln", exp: "exp", lim: "lim", min: "min", max: "max",
  det: "det", gcd: "gcd",
};

const BLACKBOARD = { R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ" };

// Every command name the renderer understands. aiJsonRepair's LATEX_COMMANDS
// must contain all of these (a drift-guard test checks), or JSON repair can
// turn \theta into a tab plus "heta" before the text ever reaches here.
const LATEX_VOCABULARY = Object.keys(SYMBOL_COMMANDS);

function normaliseLaTeXCommands(value) {
  return String(value ?? "")
    // --- Fraction variants → canonical \frac (must run before token detection) ---
    .replace(/\\[dtc]frac\b/g, "\\frac")
    // --- Display-mode modifier → strip ---
    .replace(/\\displaystyle\b\s*/g, "")
    // --- Degrees: 90^\circ, 90^{\circ}, 90\degree → 90° (must run before \circ) ---
    .replace(/\s*\^\s*\{\s*\\circ\s*\}/g, "°")
    .replace(/\s*\^\s*\\circ\b/g, "°")
    // --- Number sets: \mathbb{R} → ℝ ---
    .replace(/\\mathbb\s*\{\s*([RNZQC])\s*\}/g, (_, letter) => BLACKBOARD[letter])
    // --- Font/style wrappers → extract inner content ---
    // e.g. \text{cm}, \mathrm{sin}, \mathbf{x}, \operatorname{log}
    .replace(/\\(?:text|textrm|textit|textbf|mathrm|mathbf|mathit|mathsf|mathtt|mathcal|operatorname|boxed)\s*\{([^{}]*)\}/g, "$1")
    // --- Decoration wrappers → extract inner content ---
    // e.g. \overline{AB}, \hat{x}, \vec{v}, \overrightarrow{AB}
    .replace(/\\(?:overline|underline|overrightarrow|overleftarrow|hat|tilde|vec|bar|dot|ddot|widehat|widetilde)\s*\{([^{}]*)\}/g, "$1")
    // --- Spacing commands → single space ---
    .replace(/\\(?:qquad|quad)\b/g, " ")
    .replace(/\\[,;:!]\s*/g, " ")
    // --- Size qualifiers → strip keyword, keep delimiter ---
    .replace(/\\(?:left|right|big|Big|bigg|Bigg)\b\s*/g, "")
    // --- Escaped characters → the character itself ---
    .replace(/\\\{/g, "(")
    .replace(/\\\}/g, ")")
    .replace(/\\([%$#&])/g, "$1")
    // --- Named symbols ---
    .replace(/\\([A-Za-z]+)\b/g, (match, name) => (
      Object.prototype.hasOwnProperty.call(SYMBOL_COMMANDS, name) ? SYMBOL_COMMANDS[name] : match
    ));
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const UNICODE_SUPERSCRIPTS = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "−",
};

const SINGLE_CHAR_SCRIPT = /[\p{L}\p{N}°′*∞]/u;
const TRAILING_ATOM = /(\d+(?:\.\d+)?|\p{L}[′']*)$/u;
// Operands of a slash fraction, matching what the span detector accepts.
const SLASH_ATOM_END = /(?:\d+[A-Za-z]+|\d+(?:\.\d+)?|[A-Za-zα-ωΑ-Ω][A-Za-z0-9]*)$/;
const SLASH_ATOM_START = /^(?:\d+[A-Za-z]+|\d+(?:\.\d+)?|[A-Za-zα-ωΑ-Ω][A-Za-z0-9]*)/;

class MathParseError extends Error {}

/**
 * Parses a maths string into a node tree. Returns { ok: true, nodes } or
 * { ok: false, error }. Node shapes:
 *   { type: "text", value }
 *   { type: "group", children }            — braces; invisible
 *   { type: "paren", open, close, children }
 *   { type: "script", base, sup, sub }     — base/sup/sub are node arrays (sup/sub may be null)
 *   { type: "frac", num, den }
 *   { type: "sqrt", body, index }          — index may be null
 */
function parseMath(source) {
  const text = String(source ?? "");
  let pos = 0;

  function fail(message) {
    throw new MathParseError(`${message} at position ${pos}`);
  }

  function pushText(nodes, value) {
    const last = nodes[nodes.length - 1];
    if (last && last.type === "text") last.value += value;
    else nodes.push({ type: "text", value });
  }

  function skipSpaces() {
    while (text[pos] === " " || text[pos] === "\t") pos += 1;
  }

  // True when the bracket at `start` closes before the enclosing brace group
  // ends, so "(a)" is a bracket group but a stray "(" stays literal text.
  function hasMatchingClose(start, open, close) {
    let depth = 0;
    let braceDepth = 0;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === "{") braceDepth += 1;
      else if (ch === "}") {
        braceDepth -= 1;
        if (braceDepth < 0) return false;
      } else if (braceDepth === 0 && ch === open) depth += 1;
      else if (braceDepth === 0 && ch === close) {
        depth -= 1;
        if (depth === 0) return true;
      }
    }
    return false;
  }

  function parseBraced() {
    pos += 1; // {
    const children = parseRow("}");
    if (text[pos] !== "}") fail("missing }");
    pos += 1;
    return children;
  }

  function parseBracketed(open, close) {
    pos += 1;
    const children = parseRow(close);
    pos += 1; // hasMatchingClose guaranteed it is there
    return { type: "paren", open, close, children };
  }

  // Argument of \frac or \sqrt: a braced group or a single token (\frac12).
  function parseCommandArgument() {
    skipSpaces();
    const ch = text[pos];
    if (ch === "{") return parseBraced();
    if (ch === "\\") {
      const nodes = [];
      parseCommand(nodes);
      if (!nodes.length) fail("empty argument");
      return nodes;
    }
    if (ch && SINGLE_CHAR_SCRIPT.test(ch)) {
      pos += 1;
      return [{ type: "text", value: ch }];
    }
    return fail("missing argument");
  }

  function parseCommand(nodes) {
    pos += 1; // backslash
    const name = /^[A-Za-z]+/.exec(text.slice(pos))?.[0];
    if (!name) {
      // Escaped punctuation (\_ \^ \\): keep the character, or a space for \\.
      const ch = text[pos];
      if (ch === undefined) fail("trailing backslash");
      pos += 1;
      pushText(nodes, ch === "\\" ? " " : ch);
      return;
    }
    pos += name.length;
    if (name === "frac") {
      const num = parseCommandArgument();
      const den = parseCommandArgument();
      nodes.push({ type: "frac", num, den });
      return;
    }
    if (name === "sqrt") {
      skipSpaces();
      let index = null;
      if (text[pos] === "[") {
        pos += 1;
        index = parseRow("]");
        if (text[pos] !== "]") fail("missing ]");
        pos += 1;
      }
      nodes.push({ type: "sqrt", body: parseCommandArgument(), index });
      return;
    }
    fail(`unknown command \\${name}`);
  }

  function parseScriptArgument() {
    const before = pos;
    skipSpaces();
    const spaced = pos > before;
    const ch = text[pos];
    if (ch === "{") {
      const children = parseBraced();
      if (!children.length) fail("empty script");
      return children;
    }
    if (ch === "(" && hasMatchingClose(pos, "(", ")")) {
      // Loose exponent: 2^(x+1) means 2 to the power x+1, brackets dropped.
      const { children } = parseBracketed("(", ")");
      if (!children.length) fail("empty script");
      return children;
    }
    if (ch === "\\") {
      const nodes = [];
      parseCommand(nodes);
      if (!nodes.length) fail("empty script");
      return nodes;
    }
    const signed = /^[-−+]?\d+(?:\.\d+)?/.exec(text.slice(pos));
    if (signed) {
      pos += signed[0].length;
      return [{ type: "text", value: signed[0] }];
    }
    // Past a space only a number, braces or brackets can be the argument.
    if (spaced) return fail("script separated from its argument");
    const signedLetter = /^[-−+]\p{L}/u.exec(text.slice(pos));
    if (signedLetter) {
      pos += signedLetter[0].length;
      return [{ type: "text", value: signedLetter[0] }];
    }
    if (ch && SINGLE_CHAR_SCRIPT.test(ch)) {
      pos += 1;
      return [{ type: "text", value: ch }];
    }
    return fail("script has no argument");
  }

  // Detaches the base a script applies to from the end of `nodes`.
  function takeBase(nodes) {
    let last = nodes[nodes.length - 1];
    if (last && last.type === "text") {
      last.value = last.value.replace(/\s+$/, "");
      if (!last.value) {
        nodes.pop();
        last = nodes[nodes.length - 1];
      }
    }
    if (!last) return null;
    if (last.type === "text") {
      const atom = TRAILING_ATOM.exec(last.value);
      if (!atom) return null;
      last.value = last.value.slice(0, atom.index);
      if (!last.value) nodes.pop();
      return [{ type: "text", value: atom[1] }];
    }
    nodes.pop();
    return [last];
  }

  function attachScript(nodes, kind, argument) {
    const last = nodes[nodes.length - 1];
    // x_1^2: the second script joins the first on the same base.
    if (last && last.type === "script" && !last[kind]) {
      last[kind] = argument;
      return true;
    }
    const base = takeBase(nodes);
    if (!base) return false;
    nodes.push({
      type: "script",
      base,
      sup: kind === "sup" ? argument : null,
      sub: kind === "sub" ? argument : null,
    });
    return true;
  }

  // Operand after "/": a bracket group (brackets dropped) or one atom, with
  // any scripts that follow it, so m/s^2 is m over s², not (m/s)².
  function parseSlashDenominator() {
    const start = pos;
    skipSpaces();
    let operand = null;
    if (text[pos] === "(" && hasMatchingClose(pos, "(", ")")) {
      operand = parseBracketed("(", ")").children;
    } else {
      const atom = SLASH_ATOM_START.exec(text.slice(pos));
      if (atom) {
        pos += atom[0].length;
        operand = [{ type: "text", value: atom[0] }];
      }
    }
    if (!operand || !operand.length) {
      pos = start;
      return null;
    }
    while (text[pos] === "^" || text[pos] === "_") {
      const kind = text[pos] === "^" ? "sup" : "sub";
      pos += 1;
      const argument = parseScriptArgument();
      const base = operand.length === 1 ? operand : [{ type: "group", children: operand }];
      const existing = base.length === 1 && base[0].type === "script" && !base[0][kind] ? base[0] : null;
      if (existing) existing[kind] = argument;
      else operand = [{ type: "script", base, sup: kind === "sup" ? argument : null, sub: kind === "sub" ? argument : null }];
    }
    return operand;
  }

  // Detaches the numerator before "/": a bracket group (brackets dropped), a
  // scripted term, or a trailing number/word/coefficient term (3x, 12, ab).
  function takeSlashNumerator(nodes) {
    let last = nodes[nodes.length - 1];
    let trimmed = "";
    if (last && last.type === "text") {
      const match = /\s+$/.exec(last.value);
      if (match) {
        trimmed = match[0];
        last.value = last.value.slice(0, match.index);
        if (!last.value) {
          nodes.pop();
          last = nodes[nodes.length - 1];
        }
      }
    }
    const restore = () => {
      if (trimmed) pushText(nodes, trimmed);
      return null;
    };
    if (!last) return restore();
    if (last.type === "text") {
      const atom = SLASH_ATOM_END.exec(last.value);
      if (!atom) return restore();
      last.value = last.value.slice(0, atom.index);
      if (!last.value) nodes.pop();
      return [{ type: "text", value: atom[0] }];
    }
    if (last.type === "paren" && last.open === "(") {
      nodes.pop();
      return last.children;
    }
    if (last.type === "script" || last.type === "sqrt") {
      nodes.pop();
      return [last];
    }
    return restore();
  }

  // a/b, (x+1)/(x-1), 3x/4 → a stacked fraction. Returns false (consuming
  // nothing) when either side is missing, so a lone "/" stays literal.
  function parseSlashFraction(nodes) {
    const start = pos;
    pos += 1; // "/"
    const den = parseSlashDenominator();
    if (!den) {
      pos = start;
      return false;
    }
    const num = takeSlashNumerator(nodes);
    if (!num) {
      pos = start;
      return false;
    }
    nodes.push({ type: "frac", num, den });
    return true;
  }

  function parseRow(closer) {
    const nodes = [];
    while (pos < text.length) {
      const ch = text[pos];
      if (closer && ch === closer) return nodes;
      if (ch === "}") fail("unmatched }");
      if (ch === "{") {
        nodes.push({ type: "group", children: parseBraced() });
      } else if ((ch === "(" || ch === "[") && hasMatchingClose(pos, ch, ch === "(" ? ")" : "]")) {
        nodes.push(parseBracketed(ch, ch === "(" ? ")" : "]"));
      } else if (ch === "^" || ch === "_") {
        pos += 1;
        const argument = parseScriptArgument();
        if (!attachScript(nodes, ch === "^" ? "sup" : "sub", argument)) {
          fail("script has no base");
        }
      } else if (ch === "\\") {
        parseCommand(nodes);
      } else if (ch === "/") {
        if (!parseSlashFraction(nodes)) {
          pushText(nodes, ch);
          pos += 1;
        }
      } else if (UNICODE_SUPERSCRIPTS[ch]) {
        let raw = "";
        let digits = "";
        while (UNICODE_SUPERSCRIPTS[text[pos]]) {
          raw += text[pos];
          digits += UNICODE_SUPERSCRIPTS[text[pos]];
          pos += 1;
        }
        // Already displayable on its own, so a missing base is not an error.
        if (!attachScript(nodes, "sup", [{ type: "text", value: digits }])) pushText(nodes, raw);
      } else {
        pushText(nodes, ch);
        pos += 1;
      }
    }
    if (closer) fail(`missing ${closer}`);
    return nodes;
  }

  try {
    const nodes = parseRow(null);
    return { ok: true, nodes };
  } catch (err) {
    if (err instanceof MathParseError) return { ok: false, error: err.message };
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Plain-text fallback
// ---------------------------------------------------------------------------

function replaceUntilStable(value, pattern, replacement) {
  let previous;
  let current = value;
  do {
    previous = current;
    current = current.replace(pattern, replacement);
  } while (current !== previous);
  return current;
}

/**
 * Readable plain text for maths that could not be parsed: x^{n+1} → x^(n+1),
 * \frac{a}{b} → (a)/(b), leftover braces → brackets, command backslashes
 * dropped. The ^( form is deliberately not something RAW_MATH_MARKER flags,
 * so the post-build scan does not report the same expression twice.
 */
function readableFallback(source) {
  let value = normaliseLaTeXCommands(source);
  value = replaceUntilStable(value, /\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)");
  value = replaceUntilStable(value, /\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
  value = replaceUntilStable(value, /([\^_])\s*\{([^{}]*)\}/g, "$1($2)");
  return value
    .replace(/([\^_])([-−+]?[A-Za-z0-9α-ωΑ-Ω]+)/g, "$1($2)")
    .replace(/\\([A-Za-z]+)/g, "$1")
    .replace(/\\(.)/g, "$1")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")");
}

// ---------------------------------------------------------------------------
// Flat script segments (Word headings, SVG labels)
// ---------------------------------------------------------------------------

function isSimple(nodes) {
  return nodes.length === 1 && nodes[0].type === "text" && /^[\p{L}\p{N}.]+$/u.test(nodes[0].value);
}

/**
 * Flattens a node tree into [{ text, level }] where level is the list of
 * script kinds enclosing the text ([] for the baseline, ["sup"], ["sup",
 * "sub"] ...). Fractions and roots become inline a/b and √x, which is what a
 * single line of heading or label text can show.
 */
function scriptSegments(nodes, level = []) {
  const out = [];
  const push = (text, lvl) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.level.join() === lvl.join()) last.text += text;
    else out.push({ text, level: lvl });
  };
  const walk = (list, lvl) => {
    for (const node of list) {
      if (node.type === "text") {
        push(lvl.length ? node.value.replace(/-/g, "−") : node.value, lvl);
      } else if (node.type === "group") {
        walk(node.children, lvl);
      } else if (node.type === "paren") {
        push(node.open, lvl);
        walk(node.children, lvl);
        push(node.close, lvl);
      } else if (node.type === "script") {
        walk(node.base, lvl);
        if (node.sub) walk(node.sub, [...lvl, "sub"]);
        if (node.sup) walk(node.sup, [...lvl, "sup"]);
      } else if (node.type === "frac") {
        const wrap = (part) => (isSimple(part) ? part : [{ type: "paren", open: "(", close: ")", children: part }]);
        walk(wrap(node.num), lvl);
        push("/", lvl);
        walk(wrap(node.den), lvl);
      } else if (node.type === "sqrt") {
        if (node.index) walk(node.index, [...lvl, "sup"]);
        push("√", lvl);
        walk(isSimple(node.body) ? node.body : [{ type: "paren", open: "(", close: ")", children: node.body }], lvl);
      }
    }
  };
  walk(nodes, level);
  return out;
}

const SCRIPT_TERM_PATTERN = new RegExp(
  String.raw`\\frac\s*\{${BRACE_CONTENT}\}\s*\{${BRACE_CONTENT}\}${SCRIPTED}|\\sqrt\s*(?:\[[^\]]+\])?\s*\{${BRACE_CONTENT}\}${SCRIPTED}|${SCRIPT_TERM}`,
  "g"
);

/**
 * Splits a line of prose into flat segments, typesetting only the maths
 * terms in it (x^2, H_2O, \frac{1}{2}) and leaving everything else — blanks,
 * punctuation, ordinary words — exactly as written. Unparseable terms come
 * back as their readable fallback and are recorded as math issues.
 */
function inlineScriptSegments(value) {
  const text = normaliseLaTeXCommands(value);
  const out = [];
  let cursor = 0;
  SCRIPT_TERM_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(SCRIPT_TERM_PATTERN)) {
    // file_name is an identifier, not file with subscript n.
    if (/^[A-Za-z]{3,}_[A-Za-z]{2,}/.test(match[0])) continue;
    if (match.index > cursor) out.push({ text: text.slice(cursor, match.index), level: [] });
    const parsed = parseMath(match[0]);
    if (parsed.ok) {
      out.push(...scriptSegments(parsed.nodes));
    } else {
      const shownAs = readableFallback(match[0]);
      recordMathIssue({ source: match[0], shownAs });
      out.push({ text: shownAs, level: [] });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), level: [] });

  // Anything the term pattern did not reach but still looks like raw maths
  // (a dangling \command, say) is shown readable and reported.
  const guarded = out.map((segment) => {
    if (segment.level.length || !hasRawMath(segment.text)) return segment;
    const excerpt = rawMathExcerpt(segment.text);
    recordMathIssue({ source: excerpt, shownAs: readableFallback(excerpt) });
    return { ...segment, text: readableFallback(segment.text) };
  });

  // Adjacent pieces at the same level become one run.
  return guarded.reduce((merged, segment) => {
    const last = merged[merged.length - 1];
    if (last && last.level.join() === segment.level.join()) last.text += segment.text;
    else merged.push({ ...segment });
    return merged;
  }, []);
}

// ---------------------------------------------------------------------------
// SVG labels
// ---------------------------------------------------------------------------

const SCRIPT_SCALE = 0.7;

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The inner content of an SVG <text> element: plain escaped text when the
 * label has no maths, otherwise <tspan>s that raise and shrink superscripts
 * and lower subscripts. Offsets are relative (dy) so text-anchor still
 * centres the whole label as one chunk.
 */
function svgTextContent(value, fontSize) {
  const segments = inlineScriptSegments(value);
  if (segments.every((segment) => !segment.level.length)) {
    return escapeXml(segments.map((segment) => segment.text).join(""));
  }
  let offset = 0;
  const round = (n) => Math.round(n * 100) / 100;
  const spans = segments.map((segment) => {
    let size = fontSize;
    let target = 0;
    for (const kind of segment.level) {
      target += kind === "sup" ? -0.4 * size : 0.25 * size;
      size *= SCRIPT_SCALE;
    }
    const dy = round(target - offset);
    offset = target;
    const dyAttr = dy ? ` dy="${dy}"` : "";
    return `<tspan${dyAttr} font-size="${round(size)}">${escapeXml(segment.text)}</tspan>`;
  });
  return spans.join("");
}

/**
 * Width of a label in character units once scripts are typeset (a script
 * character is narrower than a baseline one). Layout code sizes label boxes
 * from this instead of the raw string length, so "e^{2x}" is measured as the
 * three characters it shows, not the six it is written with.
 */
function displayTextLength(value) {
  const segments = inlineScriptSegments.withoutRecording(value);
  return segments.reduce(
    (total, segment) => total + [...segment.text].length * SCRIPT_SCALE ** segment.level.length,
    0
  );
}

// ---------------------------------------------------------------------------
// Issue collection
// ---------------------------------------------------------------------------

const issueStore = new AsyncLocalStorage();

function currentStore() {
  return issueStore.getStore() || null;
}

/**
 * Runs `fn` with a fresh issue list. Resolves to { value, issues }.
 */
async function collectMathIssues(fn) {
  const store = { issues: [], location: null, silent: false };
  const value = await issueStore.run(store, fn);
  return { value, issues: store.issues };
}

// Where the text being rendered sits in the resource ("Q6", "Q6(b)",
// "Answer Q6"). Builders render questions synchronously in order, so a
// mutable location on the store is enough for them; diagram rendering is
// async and uses withMathLocation instead.
function setMathLocation(location) {
  const store = currentStore();
  if (store) store.location = location ? String(location).slice(0, 80) : null;
}

function getMathLocation() {
  return currentStore()?.location || null;
}

function withMathLocation(location, fn) {
  const store = currentStore();
  if (!store) return fn();
  return issueStore.run({ ...store, location: location ? String(location) : store.location }, fn);
}

function recordMathIssue({ source, shownAs }) {
  const store = currentStore();
  if (!store || store.silent) return;
  const issue = {
    location: store.location,
    source: String(source).trim(),
    shownAs: String(shownAs).trim(),
  };
  const duplicate = store.issues.some(
    (existing) => existing.location === issue.location && existing.source === issue.source
  );
  if (!duplicate) store.issues.push(issue);
}

inlineScriptSegments.withoutRecording = (value) => {
  const store = currentStore();
  if (!store) return inlineScriptSegments(value);
  return issueStore.run({ ...store, silent: true }, () => inlineScriptSegments(value));
};

const MAX_WARNING_ITEMS = 20;
const MAX_MESSAGE_ITEMS = 5;

/**
 * The tutor-facing job warning for maths shown as plain text. The resource
 * portal reads warnings off the job document by code, like
 * OPTIONAL_DIAGRAM_OMITTED.
 */
function mathFallbackWarning(issues) {
  const items = issues.slice(0, MAX_WARNING_ITEMS).map((issue) => ({
    location: issue.location || null,
    source: issue.source.slice(0, 200),
    shownAs: issue.shownAs.slice(0, 200),
  }));
  const listed = items
    .slice(0, MAX_MESSAGE_ITEMS)
    .map((item) => (item.location ? `${item.location} "${item.shownAs}"` : `"${item.shownAs}"`));
  const more = issues.length > MAX_MESSAGE_ITEMS ? ` and ${issues.length - MAX_MESSAGE_ITEMS} more` : "";
  return {
    code: MATH_FALLBACK,
    items,
    message:
      `Some maths could not be formatted and is shown as plain text. ` +
      `Check before printing: ${listed.join(", ")}${more}.`,
  };
}

module.exports = {
  BRACE_CONTENT,
  LATEX_VOCABULARY,
  MATH_FALLBACK,
  PAREN,
  RAW_MATH_MARKER,
  SCRIPT,
  SCRIPTED,
  SCRIPT_TERM,
  collectMathIssues,
  displayTextLength,
  getMathLocation,
  hasRawMath,
  inlineScriptSegments,
  mathFallbackWarning,
  normaliseLaTeXCommands,
  parseMath,
  rawMathExcerpt,
  readableFallback,
  recordMathIssue,
  scriptSegments,
  setMathLocation,
  svgTextContent,
  withMathLocation,
};
