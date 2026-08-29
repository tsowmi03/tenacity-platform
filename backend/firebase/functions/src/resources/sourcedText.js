"use strict";

/**
 * Verified public-domain text sourcing — the production entry point.
 *
 * The model curates (selectPublicDomainText) but never supplies the passage;
 * the text is fetched deterministically from a canonical source and is therefore
 * auditable against a citation URL. Routing by work type:
 *   - poem        -> Wikisource (one clean <poem> page per poem)
 *   - short-story -> Project Gutenberg (standalone ebook, or sliced from a
 *                    collection)
 *
 * Every path returns the same normalised shape: { ok, source, title, author,
 * sourceName, sourceUrl, passage, wordCount, confidence, checks, ... }. `ok`
 * means the passage cleared the source's confidence bar; callers treat ok:false
 * as "no verified text — fall back" rather than shipping unreliable content.
 */

const {
  planStimulusSelections,
  selectAlternativePublicDomainText,
  selectPublicDomainText,
  sourceGutenbergWork,
} = require("./publicDomainText");
const { sourceWikisourcePoem } = require("./wikisource");
const { sourceCommonsImage } = require("./commonsImage");

function isPoem(selection) {
  return String(selection?.type || "").toLowerCase() === "poem";
}

/**
 * Select (unless a selection is supplied) and source a verified passage.
 * `select`/`gutenberg`/`wikisource` are injectable for tests.
 */
async function sourceVerifiedText({
  apiKey,
  anthropicApiKey,
  openaiApiKey,
  brief,
  selection: presetSelection,
  signal,
  safetyIdentifier,
  select = selectPublicDomainText,
  gutenberg = sourceGutenbergWork,
  wikisource = sourceWikisourcePoem,
} = {}) {
  const selection = presetSelection || (await select({
    apiKey,
    anthropicApiKey,
    openaiApiKey,
    brief,
    signal,
    safetyIdentifier,
  }));

  let sourced;
  if (isPoem(selection)) {
    // Wikisource first (one clean page per poem). When its search misses —
    // common for poems known by first line or numbered inside a collection —
    // fall back to slicing the named piece out of the Gutenberg collection.
    sourced = await wikisource({ title: selection.title, author: selection.author });
    if (!sourced.ok) {
      const fromGutenberg = await gutenberg({ selection, brief });
      if (fromGutenberg.ok) sourced = fromGutenberg;
    }
  } else {
    sourced = await gutenberg({ selection, brief });
  }

  return { brief, selection, ...sourced };
}

/**
 * Source one planned visual stimulus. The counterpart of sourceVerifiedText for
 * images: the planner said what kind of image the resource needs, and this
 * resolves it to real, openly-licensed bytes from Wikimedia Commons.
 *
 * `excludeClusters` carries the near-duplicate keys already used by this
 * resource, so a stimulus set cannot be filled from a single scanned series.
 * `commons` is injectable for tests.
 */
async function sourceVisualStimulus({
  selection,
  excludeClusters,
  commons = sourceCommonsImage,
} = {}) {
  const sourced = await commons({ selection, excludeClusters });
  return { selection, ...sourced };
}

module.exports = {
  isPoem,
  planStimulusSelections,
  selectAlternativePublicDomainText,
  sourceVerifiedText,
  sourceVisualStimulus,
};
