"use strict";

// RES-107. What the bank-wide crop clean-up writes to a question record, and
// how it is undone. Pure functions: the script that runs the clean-up reads
// each record, asks these for the update, and writes it in a transaction.
//
// A cleaned crop goes to a new file beside the original, and every figure that
// pointed at the original is pointed at the new one, keeping the old path in
// originalStoragePath. Originals are never overwritten, because resources built
// earlier still point at them (see extraction.cropPath). A crop that cannot be
// used hides its questions, stamped so that only this clean-up's hides are
// restored on rollback; admins can also restore them one by one as usual.

const CLEANUP_ACTOR = "res-107-crop-cleanup";
const CLEANUP_VERSION = 1;

/** The cleaned file's path: questionBank/diagrams/x_1.png becomes x_1_bw1.png. */
function cleanedPathOf(storagePath, version = CLEANUP_VERSION) {
  if (!/\.png$/i.test(storagePath)) throw new Error(`Not a PNG crop: ${storagePath}`);
  return storagePath.replace(/\.png$/i, `_bw${version}.png`);
}

/**
 * The update for one question record, or null when it needs none.
 *
 *   replacements  Map of original storagePath to cleaned storagePath
 *   hides         Map of storagePath to the reason its crop cannot be used
 *
 * A figure already pointing elsewhere (re-extracted since the run was planned)
 * is left alone. A question is hidden only while it is live and one of its
 * figures is in hides.
 */
function planQuestionWrite(data, { replacements = new Map(), hides = new Map(), at, version = CLEANUP_VERSION }) {
  const update = {};
  const figures = data.figures || [];
  let changed = false;
  const nextFigures = figures.map((figure) => {
    const cleaned = figure.storagePath && replacements.get(figure.storagePath);
    if (!cleaned) return figure;
    changed = true;
    return { ...figure, storagePath: cleaned, originalStoragePath: figure.storagePath, cleanupVersion: version };
  });
  if (changed) update.figures = nextFigures;
  const hideReason = figures.map((figure) => hides.get(figure.storagePath)).find(Boolean);
  if (hideReason && data.status === "live") {
    Object.assign(update, { status: "hidden", hiddenBy: CLEANUP_ACTOR, hiddenAt: at, hiddenWith: null, hiddenReason: hideReason });
  }
  return Object.keys(update).length ? update : null;
}

/**
 * The update that undoes this clean-up on one record, or null. Figures go back
 * to their originals; a question this clean-up hid goes back to live, unless an
 * admin has changed its status since.
 */
function planRollback(data) {
  const update = {};
  const figures = data.figures || [];
  if (figures.some((figure) => figure.originalStoragePath)) {
    update.figures = figures.map((figure) => {
      if (!figure.originalStoragePath) return figure;
      const { originalStoragePath, cleanupVersion, ...rest } = figure;
      return { ...rest, storagePath: originalStoragePath };
    });
  }
  if (data.status === "hidden" && data.hiddenBy === CLEANUP_ACTOR) {
    Object.assign(update, { status: "live", hiddenBy: null, hiddenAt: null, hiddenWith: null, hiddenReason: null });
  }
  return Object.keys(update).length ? update : null;
}

module.exports = { CLEANUP_ACTOR, CLEANUP_VERSION, cleanedPathOf, planQuestionWrite, planRollback };
