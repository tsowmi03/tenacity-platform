"use strict";

// RES-114. Notes about how a resource was made (an answer check that didn't
// agree, a source that turned out to be a different text, "the request")
// must never reach the student's copy. The prompt forbids them; this is the
// deterministic backstop run on every resource before it is built: any
// sentence that matches is removed, and what was removed is reported so the
// pipeline can log it.
//
// The patterns are deliberately narrow, phrases a student-facing sentence has
// no reason to contain, so ordinary teaching text is never touched.

const NOTE_PATTERNS = Object.freeze([
  /\bnot confirmed:/i,
  /\bcheck (?:it |this )?before (?:use|printing|you print)\b/i,
  /\b(?:two )?independent solves?\b/i,
  /\bthe book'?s answer\b/i,
  /\bthe supplied (?:poem|text|extract|passage|story|source|document|stimulus)\b/i,
  /\bis a different (?:text|poem|story|extract|work)\b/i,
  /\b(?:this|the) (?:scaffold|resource|worksheet|booklet|paper|guide) follows the request(?:ed)?\b/i,
  /\bthe (?:requested|tutor'?s?) (?:essay|text|poem|instructions|request)\b/i,
  /\b(?:the )?question bank\b/i,
  /\bthe generator\b/i,
]);

// Verified public-domain texts and images are printed exactly as sourced, and
// diagram specs aren't prose: none of them is scanned.
const SKIP_KEYS = new Set(["diagram", "diagrams", "figure", "figures", "image", "images", "imageBase64", "svg", "spec"]);

function isVerbatimSource(node) {
  return Boolean(node && typeof node === "object" && (node.sourceUrl || node.verbatim === true));
}

function hasNote(text) {
  return NOTE_PATTERNS.some((pattern) => pattern.test(text));
}

// Sentence ends: a full stop, question or exclamation mark followed by space
// and a capital, quote or digit, or a line break. Decimal points don't split.
function splitSentences(text) {
  return String(text).split(/(?<=[.!?])\s+(?=["'(A-Z0-9])|\n+/);
}

/** The text with every note sentence removed, and the sentences removed. */
function stripNoteSentences(text) {
  if (!hasNote(text)) return { text, removed: [] };
  const kept = [];
  const removed = [];
  for (const sentence of splitSentences(text)) {
    if (hasNote(sentence)) removed.push(sentence.trim());
    else kept.push(sentence);
  }
  // Keep line structure where the original had it (worked solutions).
  const joiner = /\n/.test(text) ? "\n" : " ";
  return { text: kept.join(joiner).trim(), removed };
}

/**
 * Removes note sentences from every student-facing string in the resource,
 * in place. Array items left empty are dropped. Returns what was removed,
 * as [{ path, sentence }].
 */
function stripPipelineNotes(resource) {
  const removed = [];
  const visit = (node, path) => {
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        const value = node[i];
        if (typeof value === "string") {
          const out = stripNoteSentences(value);
          if (!out.removed.length) continue;
          out.removed.forEach((sentence) => removed.push({ path: `${path}[${i}]`, sentence }));
          if (out.text) node[i] = out.text; else node.splice(i, 1);
        } else {
          visit(value, `${path}[${i}]`);
        }
      }
      return;
    }
    if (!node || typeof node !== "object" || isVerbatimSource(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (SKIP_KEYS.has(key)) continue;
      const here = path ? `${path}.${key}` : key;
      if (typeof value === "string") {
        const out = stripNoteSentences(value);
        if (!out.removed.length) continue;
        out.removed.forEach((sentence) => removed.push({ path: here, sentence }));
        node[key] = out.text;
      } else {
        visit(value, here);
      }
    }
  };
  visit(resource, "");
  return removed;
}

module.exports = { NOTE_PATTERNS, hasNote, stripNoteSentences, stripPipelineNotes };
