"use strict";

// The integrity of an English resource's stimulus booklet, settled in code
// after generation rather than trusted to the model:
//
//   - RES-100: every stimulus has a source line. A verified text keeps its real
//     author and source; a text the generator wrote is "Tenacity Original" and
//     can claim no author or source at all.
//   - RES-88: a booklet carries only the texts its questions use. An unused
//     text is removed and the remaining texts are renumbered everywhere they
//     are referred to.

const { UNATTRIBUTED_PASSAGE_CAPTION: TENACITY_ORIGINAL } = require("./humanStyle");
const PUBLIC_DOMAIN = "Public domain";

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const isImage = (entry) => entry?.kind === "image";

// The attribution line printed under a reading text. Never empty: a text with
// no verified author or source is the generator's own and says so.
function textSourceLine({ author, source, licence } = {}) {
  const parts = [
    clean(author) ? `Author: ${clean(author)}` : null,
    clean(source) ? `Source: ${clean(source)}` : null,
    clean(licence) || null,
  ].filter(Boolean);
  return parts.length ? parts.join("   |   ") : TENACITY_ORIGINAL;
}

// The credit printed under an image. Empty only when nothing is known, which
// validation rejects (stimulusMissingSourceLine).
function imageSourceLine({ creator, date, licence, source } = {}) {
  return [
    clean(creator) ? `Image: ${clean(creator)}` : null,
    clean(date) || null,
    clean(licence) || null,
    clean(source) || null,
  ].filter(Boolean).join("   |   ");
}

function stimulusSourceLine(entry) {
  return isImage(entry) ? imageSourceLine(entry) : textSourceLine(entry);
}

// Labels of the entries that would print without a source line. An image is
// always sourced from an archive, so one without a credit is a defect.
function stimulusMissingSourceLine(stimulus) {
  return (Array.isArray(stimulus) ? stimulus : [])
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry && typeof entry === "object" && !stimulusSourceLine(entry))
    .map(({ entry, index }) => clean(entry.label) || `Stimulus ${index + 1}`);
}

// A text the pipeline did not verify (no `verbatim` flag, which only the
// pipeline may set) is the generator's own writing. It cannot carry an author
// or source the model typed, true or not: a remembered poem is not a verified
// one. Clearing them makes it print as "Tenacity Original".
function normaliseStimulusAttribution(stimulus) {
  let originals = 0;
  for (const entry of Array.isArray(stimulus) ? stimulus : []) {
    if (!entry || typeof entry !== "object" || isImage(entry)) continue;
    if (entry.verbatim === true) {
      if (!clean(entry.licence)) entry.licence = PUBLIC_DOMAIN;
      continue;
    }
    entry.author = null;
    entry.source = null;
    entry.licence = null;
    // The source line already says it is ours; a tag the model put in the
    // title ("A green space (original speech)") would say it twice.
    if (typeof entry.title === "string") {
      entry.title = entry.title.replace(/\s*[([]\s*(?:an?\s+)?(?:tenacity\s+)?original\b[^)\]]*[)\]]\s*$/i, "").trim() || entry.title;
    }
    originals += 1;
  }
  return { originals };
}

// Every string a student or tutor reads outside the stimulus itself: question
// stems, parts and options, section text, and the marking guide or answers.
// Rewritten in place. The stimulus itself (and any image bytes) is skipped.
function rewriteReferenceStrings(node, rewrite) {
  if (Array.isArray(node)) {
    node.forEach((child, i) => {
      if (typeof child === "string") node[i] = rewrite(child);
      else rewriteReferenceStrings(child, rewrite);
    });
    return;
  }
  if (!node || typeof node !== "object" || Buffer.isBuffer(node)) return;
  for (const [key, child] of Object.entries(node)) {
    if (key === "stimulus" || key === "image") continue;
    if (typeof child === "string") node[key] = rewrite(child);
    else rewriteReferenceStrings(child, rewrite);
  }
}

function questionStrings(parsed) {
  const strings = [];
  const walk = (value) => {
    if (typeof value === "string") { strings.push(value); return; }
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (["stimulus", "markingGuide", "answers", "image"].includes(key)) continue;
      walk(child);
    }
  };
  // Every question shape (sections, questions, blocks) is reached by walking
  // the whole resource; only the stimulus and the tutor-facing answers are
  // left out, since a text a model answer mentions is not one a question uses.
  walk(parsed);
  return strings;
}

// "Text 2", "Texts 1 and 3", "Texts 1-3", "texts 2, 3 and 4". `prefix` keeps
// the word as written so a replacement preserves case and plurality.
const TEXT_REFERENCE = /\b(Texts?)(\s+)(\d+)((?:\s*(?:,|and|&|or|to|-|–)\s*\d+)*)/gi;

function referencedTextNumbers(strings) {
  const numbers = new Set();
  for (const value of strings) {
    for (const match of String(value).matchAll(TEXT_REFERENCE)) {
      const list = `${match[3]}${match[4] || ""}`;
      const range = list.match(/^(\d+)\s*(?:to|-|–)\s*(\d+)$/i);
      if (range) {
        for (let n = Number(range[1]); n <= Number(range[2]); n += 1) numbers.add(n);
      } else {
        for (const n of list.match(/\d+/g) || []) numbers.add(Number(n));
      }
    }
  }
  return numbers;
}

function titleMentioned(entry, haystack) {
  const title = clean(entry?.title).replace(/^extract from\s+/i, "").toLowerCase();
  return title.split(/\s+/).length >= 2 && haystack.includes(title);
}

/**
 * Remove reading texts that no question uses, and renumber the rest.
 *
 * Only acts when at least two texts exist and the questions refer to texts by
 * number at all: with one text, or with questions that only say "the extract",
 * nothing can be shown to be unused. Images are untouched.
 */
function removeUnusedStimulusTexts(parsed) {
  const stimulus = Array.isArray(parsed?.stimulus) ? parsed.stimulus : [];
  const texts = stimulus.filter((entry) => entry && !isImage(entry));
  if (texts.length < 2) return { removed: [] };
  const strings = questionStrings(parsed);
  const referenced = referencedTextNumbers(strings);
  if (!referenced.size) return { removed: [] };
  const haystack = strings.join("\n").toLowerCase();
  const used = texts.map((entry, i) => referenced.has(i + 1) || titleMentioned(entry, haystack));
  if (used.every(Boolean) || !used.some(Boolean)) return { removed: [] };

  const renumber = new Map();
  const removed = [];
  let next = 0;
  texts.forEach((entry, i) => {
    if (used[i]) renumber.set(i + 1, (next += 1));
    else removed.push({ label: `Text ${i + 1}`, title: clean(entry.title) });
  });
  const keep = new Set(texts.filter((_, i) => used[i]));
  parsed.stimulus = stimulus.filter((entry) => isImage(entry) || keep.has(entry));
  parsed.stimulus.filter((entry) => !isImage(entry)).forEach((entry, i) => { entry.label = `Text ${i + 1}`; });

  const changed = [...renumber].some(([from, to]) => from !== to);
  if (changed) {
    rewriteReferenceStrings(parsed, (value) => value.replace(TEXT_REFERENCE, (whole, word, space, first, rest = "") => {
      const swap = (n) => String(renumber.get(Number(n)) ?? n);
      return `${word}${space}${swap(first)}${rest.replace(/\d+/g, swap)}`;
    }));
  }
  return { removed, renumbered: changed };
}

module.exports = {
  PUBLIC_DOMAIN,
  TENACITY_ORIGINAL,
  imageSourceLine,
  normaliseStimulusAttribution,
  referencedTextNumbers,
  removeUnusedStimulusTexts,
  stimulusMissingSourceLine,
  stimulusSourceLine,
  textSourceLine,
};
