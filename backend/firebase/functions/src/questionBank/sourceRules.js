"use strict";

// RES-56. Which Drive files the question bank extracts from, and why the rest
// are skipped. Pure functions over Drive file listings, so the rules can be
// tested without Drive. Spec: docs/architecture/res-54-question-bank-spec.md.

const DOCUMENT_EXTENSIONS = new Set(["pdf", "docx", "doc", "pptx", "ppt", "pps", "ppsx"]);
// Google-native files are exported to PDF by Drive itself.
const GOOGLE_DOCUMENT_MIME_TYPES = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.presentation",
]);

// A Drive shortcut: a pointer to a file that lives somewhere else.
const SHORTCUT_MIME_TYPE = "application/vnd.google-apps.shortcut";

// Folders never walked at all.
const EXCLUDED_FOLDER = /^student docs$/i;

const SKIP_REASONS = Object.freeze({
  shortcut: "shortcut",
  notDocument: "not_document",
  belowYear5: "below_year_5",
  answerFile: "answer_file",
  teacherEdition: "teacher_edition",
  formatPair: "format_pair",
  duplicate: "duplicate",
});

function extensionOf(name) {
  const dot = String(name || "").lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
]);

// A shortcut is whatever it points to: Drive names one after its target, but
// a renamed shortcut may have no extension to go by.
function isDocument(file) {
  if (GOOGLE_DOCUMENT_MIME_TYPES.has(file.mimeType) || DOCUMENT_EXTENSIONS.has(extensionOf(file.name))) return true;
  if (file.mimeType !== SHORTCUT_MIME_TYPE) return false;
  return GOOGLE_DOCUMENT_MIME_TYPES.has(file.shortcutTargetMimeType) || DOCUMENT_MIME_TYPES.has(file.shortcutTargetMimeType);
}

function baseName(name) {
  const ext = extensionOf(name);
  return ext ? name.slice(0, -(ext.length + 1)) : name;
}

// The bank starts at Year 5. In the Subject → Year → Topic layout (TP-47)
// everything younger is under Maths/Primary (K–4). Before that move, Mathletics
// was the only material below Year 5, filed by year (Maths/Mathletics/K, 01 ...
// 12). Both rules apply until the move is finished (RES-121).
const BELOW_YEAR_5_FOLDERS = [
  /(^|\/)Primary \(K\s*[–—-]\s*4\)\//i,
  /(^|\/)Mathletics\/(K|0[1-4])\//i,
];

function isBelowYear5(path) {
  return BELOW_YEAR_5_FOLDERS.some((folder) => folder.test(path));
}

// Answer and solution files are kept for answer linking (RES-63), not the
// question pass.
function isAnswerFile(name) {
  return /\b(answers?|solutions?)\b/i.test(baseName(name).replace(/[_.-]+/g, " "));
}

function teacherTwinPath(path) {
  return /teacher/i.test(path.split("/").pop()) ? path.replace(/teacher(?=[^/]*$)/i, "student") : null;
}

// Drive's duplicate-upload pattern (" a", "a", " (1)", " copy") counts against a
// file when choosing which of several identical copies to keep.
function looksLikeCopy(name) {
  return /(\s+a|a|\s*\(\d+\)|\s+copy)$/i.test(baseName(name));
}

function canonicalOf(files) {
  return [...files].sort((a, b) =>
    Number(looksLikeCopy(a.name)) - Number(looksLikeCopy(b.name)) ||
    a.path.length - b.path.length ||
    a.path.localeCompare(b.path)
  )[0];
}

/**
 * Decides, for every file in a listing, whether the question bank extracts it.
 * Each file comes back with `status` ("pending" or "skipped"), and skipped ones
 * with `skipReason` (and `duplicateOf` for copies).
 *
 * @param {Array<{id: string, name: string, path: string, mimeType: string, md5?: string}>} files
 */
function planSources(files) {
  const plans = new Map(files.map((file) => [file.id, { ...file, status: "pending", skipReason: null, duplicateOf: null }]));
  const skip = (plan, reason, extra = {}) => Object.assign(plan, { status: "skipped", skipReason: reason, ...extra });
  const pending = () => [...plans.values()].filter((plan) => plan.status === "pending");

  for (const plan of pending()) {
    if (!isDocument(plan)) skip(plan, SKIP_REASONS.notDocument);
    else if (isBelowYear5(plan.path)) skip(plan, SKIP_REASONS.belowYear5);
    else if (isAnswerFile(plan.name)) skip(plan, SKIP_REASONS.answerFile);
  }
  skipShortcuts([...plans.values()], skip);

  // A teacher edition's diagrams have the answers drawn in, so its questions
  // come from the student edition when there is one.
  const pendingPaths = new Map(pending().map((plan) => [plan.path.toLowerCase(), plan]));
  for (const plan of pending()) {
    const twin = teacherTwinPath(plan.path);
    const student = twin && pendingPaths.get(twin.toLowerCase());
    if (student) skip(plan, SKIP_REASONS.teacherEdition, { duplicateOf: student.id });
  }

  skipCopies(pending(), skip);
  return [...plans.values()];
}

// A file skipped for one of these is skipped because of where it is filed, not
// because of what it is. A shortcut to it from a folder that is in scope is
// then the way that file gets extracted.
const FILED_ELSEWHERE = new Set(["below_year_5", "out_of_scope"]);

/**
 * Skips shortcuts that would have the same file extracted twice (RES-121). A
 * book that spans several years sits in the earliest year's folder, with
 * shortcuts to it in the later years (TP-47). A shortcut is read by fetching
 * its target, and it has no checksum for the duplicate check to match, so each
 * one used to be a source of its own.
 *
 * - A shortcut to a file that is being extracted is skipped.
 * - A shortcut to a file skipped for what it is (an answer file, not a
 *   document) is skipped too.
 * - Shortcuts to a file outside the listing, or to one skipped only for where
 *   it is filed (a Year 4-6 book kept under Primary), keep one of them.
 *
 * Run after the per-file rules, so each target's own status is known.
 */
function skipShortcuts(plans, skip) {
  const targets = new Map(plans.filter((plan) => plan.mimeType !== SHORTCUT_MIME_TYPE).map((plan) => [plan.id, plan]));
  const onlyRoute = new Map();
  for (const plan of plans) {
    if (plan.status !== "pending" || plan.mimeType !== SHORTCUT_MIME_TYPE || !plan.shortcutTargetId) continue;
    const target = targets.get(plan.shortcutTargetId);
    if (target && !(target.status === "skipped" && FILED_ELSEWHERE.has(target.skipReason))) {
      skip(plan, SKIP_REASONS.shortcut, { duplicateOf: target.id });
      continue;
    }
    if (!onlyRoute.has(plan.shortcutTargetId)) onlyRoute.set(plan.shortcutTargetId, []);
    onlyRoute.get(plan.shortcutTargetId).push(plan);
  }
  for (const group of onlyRoute.values()) {
    if (group.length < 2) continue;
    const keep = canonicalOf(group);
    for (const plan of group) {
      if (plan !== keep) skip(plan, SKIP_REASONS.shortcut, { duplicateOf: keep.id });
    }
  }
}

/**
 * Skips the copies among pending plans: the Word twin of a PDF, and
 * byte-identical files (keeping the canonical one). Shared with the English
 * bank's source rules.
 */
function skipCopies(pendingPlans, skip) {
  const pending = () => pendingPlans.filter((plan) => plan.status === "pending");

  // The same worksheet saved as PDF and as Word: keep the PDF.
  const byStem = new Map();
  for (const plan of pending()) {
    const stem = baseName(plan.path.replace(/\/(PDF|Word) version\//i, "/")).toLowerCase();
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push(plan);
  }
  for (const group of byStem.values()) {
    const pdf = group.find((plan) => extensionOf(plan.name) === "pdf");
    if (!pdf || group.length < 2) continue;
    for (const plan of group) {
      if (plan !== pdf && extensionOf(plan.name) !== "pdf") skip(plan, SKIP_REASONS.formatPair, { duplicateOf: pdf.id });
    }
  }

  // Byte-identical copies. Google-native files have no checksum and are never
  // matched here.
  const byChecksum = new Map();
  for (const plan of pending()) {
    if (!plan.md5) continue;
    if (!byChecksum.has(plan.md5)) byChecksum.set(plan.md5, []);
    byChecksum.get(plan.md5).push(plan);
  }
  for (const group of byChecksum.values()) {
    if (group.length < 2) continue;
    const keep = canonicalOf(group);
    for (const plan of group) {
      if (plan !== keep) skip(plan, SKIP_REASONS.duplicate, { duplicateOf: keep.id });
    }
  }
}

module.exports = {
  EXCLUDED_FOLDER,
  GOOGLE_DOCUMENT_MIME_TYPES,
  SHORTCUT_MIME_TYPE,
  SKIP_REASONS,
  baseName,
  canonicalOf,
  extensionOf,
  isAnswerFile,
  isBelowYear5,
  isDocument,
  planSources,
  skipCopies,
  skipShortcuts,
};
