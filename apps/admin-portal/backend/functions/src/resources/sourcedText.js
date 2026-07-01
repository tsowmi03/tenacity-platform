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
  selectPublicDomainText,
  sourceGutenbergWork,
} = require("./publicDomainText");
const { sourceWikisourcePoem } = require("./wikisource");

function isPoem(selection) {
  return String(selection?.type || "").toLowerCase() === "poem";
}

/**
 * Select (unless a selection is supplied) and source a verified passage.
 * `select`/`gutenberg`/`wikisource` are injectable for tests.
 */
async function sourceVerifiedText({
  apiKey,
  brief,
  selection: presetSelection,
  signal,
  select = selectPublicDomainText,
  gutenberg = sourceGutenbergWork,
  wikisource = sourceWikisourcePoem,
} = {}) {
  const selection = presetSelection || (await select({ apiKey, brief, signal }));

  const sourced = isPoem(selection)
    ? await wikisource({ title: selection.title, author: selection.author })
    : await gutenberg({ selection, brief });

  return { brief, selection, ...sourced };
}

module.exports = { isPoem, planStimulusSelections, sourceVerifiedText };
