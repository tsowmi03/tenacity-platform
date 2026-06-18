"use strict";

/**
 * Structure-aware repair for single-backslash LaTeX in model-authored JSON.
 *
 * The model is asked for inline LaTeX (\frac, \beta, \neq, …) AND valid JSON,
 * but those conflict: a single backslash before a letter is ambiguous. For the
 * letters b, f, n, r, t and u it is *byte-identical* to a JSON control escape:
 *
 *   "\frac"   could be a literal backslash + "frac"  OR  \f (form-feed) + "rac"
 *   "\n\n"    could be two JSON newlines             OR  the start of \neq…
 *   "\nFoo"   (a real newline + the word "Foo")      OR  a LaTeX command \nFoo
 *
 * This ambiguity is undecidable from the bytes alone — no parser (strict,
 * lenient, or constrained-decoding/structured-output) can resolve it, because
 * \b \f \n \r \t are all *valid* JSON escapes the grammar happily accepts. The
 * only way to decide is external knowledge: (1) is this content maths-bearing,
 * and (2) does the run after the backslash match a known LaTeX command.
 *
 * So repair is parameterised by a command set instead of using one global rule:
 *
 *   - Prose (English) content passes an EMPTY set. Then \n \t \r \b \f \uXXXX
 *     are always left as JSON escapes (newlines survive!), and only genuinely
 *     invalid escapes (\s, \$, a stray backslash) are doubled so JSON.parse
 *     never throws. With no LaTeX in the domain there is nothing to be
 *     ambiguous about — this is provably correct for prose.
 *
 *   - Maths content passes LATEX_COMMANDS. A \b/\f/\n/\r/\t/\u followed by a
 *     letter-run that names a known command is treated as LaTeX (backslash
 *     doubled so it survives JSON.parse as literal \frac); anything else is a
 *     genuine control escape and is left intact (so real newlines in a maths
 *     explanation survive too).
 *
 * The walk is a tiny state machine that only ever rewrites backslashes *inside*
 * string values, so structural JSON is never touched. Any backslash that is not
 * a recognised JSON escape is doubled, which means the output is always valid
 * JSON regardless of what the model emitted.
 */

// Every LaTeX command the downstream renderer knows about
// (builder/shared.js → normaliseLaTeXCommands, mathFraction, mathSqrt, …) MUST
// appear here, plus a broad set of standard commands starting with the
// ambiguous escape letters (b f n r t u) so they survive as literal LaTeX
// rather than decaying into stray control characters. A drift-guard unit test
// asserts the renderer's vocabulary is a subset of this set.
const LATEX_COMMANDS = new Set([
  // --- Greek (lower) ---
  "alpha", "beta", "gamma", "delta", "epsilon", "varepsilon", "zeta", "eta",
  "theta", "vartheta", "iota", "kappa", "lambda", "mu", "nu", "xi", "pi",
  "varpi", "rho", "varrho", "sigma", "varsigma", "tau", "upsilon", "phi",
  "varphi", "chi", "psi", "omega",
  // --- Greek (upper) ---
  "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Upsilon", "Phi",
  "Psi", "Omega",
  // --- Fractions / roots / structure ---
  "frac", "dfrac", "tfrac", "cfrac", "sqrt", "binom", "tbinom", "dbinom",
  "begin", "end", "displaystyle", "limits", "nolimits",
  // --- Font / decoration wrappers ---
  "text", "textbf", "textit", "textrm", "textsf", "texttt", "mathrm",
  "mathbf", "mathit", "mathsf", "mathtt", "mathcal", "mathbb", "mathfrak",
  "operatorname", "overline", "underline", "hat", "widehat", "tilde",
  "widetilde", "vec", "bar", "dot", "ddot", "breve", "check", "acute",
  "grave", "boxed", "overbrace", "underbrace", "overrightarrow", "overleftarrow",
  // --- Spacing / punctuation ---
  "quad", "qquad", "thinspace", "negthinspace", "ldots", "cdots", "dots",
  "vdots", "ddots", "left", "right", "big", "Big", "bigg", "Bigg",
  // --- Operators / relations ---
  "pm", "mp", "times", "div", "cdot", "ast", "star", "circ", "bullet",
  "oplus", "ominus", "otimes", "oslash", "odot", "approx", "approxeq",
  "equiv", "cong", "sim", "simeq", "propto", "neq", "ne", "leq", "le",
  "geq", "ge", "ll", "gg", "leqslant", "geqslant", "doteq", "triangleq",
  "infty", "partial", "nabla", "forall", "exists", "nexists", "neg", "lnot",
  "perp", "parallel", "nparallel", "mid", "nmid", "angle", "measuredangle",
  "triangle", "square", "because", "therefore", "top", "bot",
  // --- Arrows ---
  "to", "gets", "rightarrow", "leftarrow", "leftrightarrow", "Rightarrow",
  "Leftarrow", "Leftrightarrow", "longrightarrow", "longleftarrow", "mapsto",
  "uparrow", "downarrow", "updownarrow", "nearrow", "nwarrow", "searrow",
  "swarrow", "rightleftharpoons", "hookrightarrow", "hookleftarrow",
  // --- Set theory / logic ---
  "in", "notin", "ni", "subset", "subseteq", "subsetneq", "supset",
  "supseteq", "supsetneq", "nsubseteq", "cup", "cap", "bigcup", "bigcap",
  "setminus", "emptyset", "varnothing", "complement", "land", "lor", "lnot",
  "wedge", "vee", "bigvee", "bigwedge", "models", "vdash", "dashv",
  // --- Sums / integrals / big operators ---
  "sum", "prod", "coprod", "int", "iint", "iiint", "oint", "bigoplus",
  "bigotimes", "bigodot", "biguplus", "bigsqcup",
  // --- Named functions ---
  "sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan",
  "sinh", "cosh", "tanh", "log", "ln", "lg", "exp", "lim", "limsup",
  "liminf", "max", "min", "sup", "inf", "det", "dim", "ker", "deg", "gcd",
  "arg", "Pr", "hom",
  // --- Delimiters / misc ---
  "langle", "rangle", "lceil", "rceil", "lfloor", "rfloor", "lbrace",
  "rbrace", "lbrack", "rbrack", "vert", "Vert", "backslash", "prime",
  "degree", "circledast", "flat", "sharp", "natural", "frown", "smile",
]);

const EMPTY_COMMANDS = new Set();

const HEX = /^[0-9a-fA-F]{4}$/;
const LETTER = /[a-zA-Z]/;

// JSON control-escape letters that collide with LaTeX command initials.
const AMBIGUOUS = new Set(["b", "f", "n", "r", "t", "u"]);

function repairJsonBackslashes(text, { latexCommands = LATEX_COMMANDS } = {}) {
  const s = String(text || "");
  let out = "";
  let inString = false;
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (!inString) {
      out += ch;
      if (ch === '"') inString = true;
      i += 1;
      continue;
    }

    // --- inside a string literal ---
    if (ch === '"') {
      out += ch;
      inString = false;
      i += 1;
      continue;
    }
    if (ch !== "\\") {
      out += ch;
      i += 1;
      continue;
    }

    // ch === backslash, inside a string
    const next = s[i + 1];

    // A trailing lone backslash would break JSON — double it.
    if (next === undefined) {
      out += "\\\\";
      i += 1;
      continue;
    }

    // Already-valid 2-char JSON escapes: \" \\ \/ — consume as a unit so
    // correctly-escaped content (and LaTeX line breaks \\) is left untouched.
    if (next === '"' || next === "\\" || next === "/") {
      out += ch + next;
      i += 2;
      continue;
    }

    // Valid \uXXXX unicode escape.
    if (next === "u" && HEX.test(s.slice(i + 2, i + 6))) {
      out += s.slice(i, i + 6);
      i += 6;
      continue;
    }

    // Ambiguous escape letters (b f n r t u): decide by command lookup.
    if (AMBIGUOUS.has(next)) {
      let j = i + 1;
      while (j < s.length && LETTER.test(s[j])) j += 1;
      const command = s.slice(i + 1, j); // maximal letter run, e.g. "neq", "Foo"
      if (latexCommands.has(command)) {
        // LaTeX command → double the backslash so it survives JSON.parse.
        out += "\\\\" + command;
        i = j;
      } else {
        // Genuine JSON control escape (\n newline, \t tab, …) → keep intact.
        out += ch + next;
        i += 2;
      }
      continue;
    }

    // Any other character is an invalid JSON escape (\s \c \p \{ \, \$ …):
    // it can only be LaTeX or a stray backslash, so double it.
    out += "\\\\" + next;
    i += 2;
  }

  return out;
}

module.exports = {
  LATEX_COMMANDS,
  EMPTY_COMMANDS,
  repairJsonBackslashes,
};
