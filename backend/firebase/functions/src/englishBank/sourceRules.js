"use strict";

// RES-65. Which Drive files under Resources/English the English bank extracts,
// what each one is (a paper, a marking guide, or an image), and which paper
// each guide belongs to. Pure functions over Drive listings, like the maths
// rules in src/questionBank/sourceRules.js, whose copy handling it shares.

const { SKIP_REASONS, baseName, extensionOf, isDocument, skipCopies } = require("../questionBank/sourceRules");

// Top-level folders under English that hold stimuli. LitCharts has its own
// reference bank (RES-67); Grammar Spelling, Essay, Writing, Examples and
// Misc. are out of scope.
const IN_SCOPE_FOLDERS = new Set(["past papers", "practice papers", "comprehension", "creative"]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

const ENGLISH_SKIP_REASONS = Object.freeze({
  ...SKIP_REASONS,
  outOfScope: "out_of_scope",
});

const ROLES = Object.freeze({ paper: "paper", guide: "guide", image: "image" });

// Marking guidelines, sample answers, answer keys, marking feedback and NESA's
// sample writing booklets all go with a paper rather than being one.
const GUIDE_NAME = /\b(marking\s+(guidelines?|guide|criteria|feedback)|sample\s+(answers?|responses?|writing\s+booklet)|answers?|solutions?|mg)\b/i;

// Words that differ between a paper's name and its guide's, or that every
// name shares, dropped before matching.
const PAIRING_NOISE = new Set([
  "marking", "guidelines", "guideline", "guide", "criteria", "feedback", "sample", "answers", "answer", "responses",
  "response", "solutions", "solution", "writing", "booklet", "mg", "exam", "paper", "english", "hsc", "trial", "year",
  "12", "w", "sol", "pdf", "the", "and", "of",
]);

function topFolder(path) {
  return String(path).split("/")[1]?.toLowerCase() ?? "";
}

function isImage(file) {
  return IMAGE_EXTENSIONS.has(extensionOf(file.name)) || /^image\//.test(file.mimeType || "");
}

function roleOf(file) {
  if (isImage(file)) return ROLES.image;
  return GUIDE_NAME.test(baseName(file.name).replace(/[_.-]+/g, " ")) ? ROLES.guide : ROLES.paper;
}

/**
 * The words a paper and its guide share: "Abbotsleigh 2025 Paper1 Sample
 * Answers" and "Abbotsleigh 2025 English Trial Paper 1" both become
 * "1 2025 abbotsleigh". Order is ignored, since NESA puts the year in
 * different places.
 */
function pairingKey(name) {
  const words = baseName(name)
    .toLowerCase()
    .replace(/paper\s*(\d)/g, "paper $1")
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !PAIRING_NOISE.has(word));
  return [...new Set(words)].sort().join(" ");
}

function folderOf(path) {
  return String(path).split("/").slice(0, -1).join("/");
}

/**
 * Plans every file in a listing of Resources/English. Each comes back with
 * `status` ("pending" or "skipped") and `skipReason` as in the maths bank,
 * plus `role` and, for a guide, `pairedWith` (its paper's Drive ID, or null
 * when no single paper matches).
 */
function planEnglishSources(files) {
  const plans = new Map(files.map((file) => [file.id, { ...file, status: "pending", skipReason: null, duplicateOf: null, role: null, pairedWith: null }]));
  const skip = (plan, reason, extra = {}) => Object.assign(plan, { status: "skipped", skipReason: reason, ...extra });
  const pending = () => [...plans.values()].filter((plan) => plan.status === "pending");

  for (const plan of pending()) {
    if (!IN_SCOPE_FOLDERS.has(topFolder(plan.path))) skip(plan, ENGLISH_SKIP_REASONS.outOfScope);
    else if (!isDocument(plan) && !isImage(plan)) skip(plan, ENGLISH_SKIP_REASONS.notDocument);
  }
  skipCopies(pending(), skip);
  for (const plan of pending()) plan.role = roleOf(plan);

  const papersByKey = new Map();
  for (const plan of pending().filter((p) => p.role === ROLES.paper)) {
    const key = pairingKey(plan.name);
    if (!papersByKey.has(key)) papersByKey.set(key, []);
    papersByKey.get(key).push(plan);
  }
  for (const guide of pending().filter((p) => p.role === ROLES.guide)) {
    const candidates = papersByKey.get(pairingKey(guide.name)) || [];
    const sameFolder = candidates.filter((paper) => folderOf(paper.path) === folderOf(guide.path));
    const match = sameFolder.length === 1 ? sameFolder[0] : candidates.length === 1 ? candidates[0] : null;
    guide.pairedWith = match ? match.id : null;
  }

  return [...plans.values()];
}

module.exports = {
  ENGLISH_SKIP_REASONS,
  IN_SCOPE_FOLDERS,
  ROLES,
  isImage,
  pairingKey,
  planEnglishSources,
  roleOf,
};
