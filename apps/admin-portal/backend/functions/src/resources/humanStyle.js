"use strict";

// Rules and helpers for keeping generated resources free of the tells that mark
// text as AI-written. The list of tells follows Wikipedia's "Signs of AI writing"
// guidance (overused vocabulary, negative parallelisms, significance padding,
// em-dashes, curly quotes, Markdown emphasis, fabricated sources, and so on).
//
// Two layers of enforcement:
//   1. HUMAN_WRITING_RULES / AUTHORSHIP_RULES are injected into the system prompt
//      so the model avoids these patterns in the first place.
//   2. deAiPunctuation() is a deterministic backstop applied during rendering so
//      the punctuation tells (above all, em-dashes) can never reach the document
//      even if the model ignores the prompt.

const DEFAULT_RESOURCE_AUTHOR = "Tenacity Resources";

const HUMAN_WRITING_RULES = `WRITING STYLE — STRICT. Every word of generated text (titles, question stems, passages, explanations, marking guides, notes) must read as if written by an experienced human teacher. These rules are mandatory.

Punctuation:
- NEVER use em-dashes (—) or en-dashes (–) anywhere. Use commas, full stops, colons, or brackets, or rewrite the sentence. Do not use a double hyphen (--) as a substitute.
- Use straight quotation marks and apostrophes (" and '), never curly or smart ones.
- Do not use the ellipsis character; if an ellipsis is genuinely needed, type three full stops.

Banned vocabulary (these are AI tells — do not use them): delve, tapestry, testament, boasts, showcase, showcasing, underscore, underscores, pivotal, crucial, intricate, intricacies, robust, vibrant, landscape (figurative), realm, meticulous, meticulously, garner, foster, fostering, bolster, enduring, leverage (as a verb), navigate (figurative), seamless, multifaceted, nuanced, myriad, plethora, holistic, resonate, align or alignment (figurative), embark, unveil, harness, profound, vital, key (as an adjective), notably, importantly, ultimately.

Banned constructions:
- Negative parallelism: "not only X but also Y", "it is not just X, it is Y", "not X, but Y".
- Rule-of-three padding: stacking three adjectives or three parallel phrases for rhythm (for example "clear, concise, and compelling").
- Participial significance tails: ", highlighting/underscoring/reflecting/emphasising its importance", ", contributing to the broader ...".
- Significance or legacy editorialising: "stands as", "serves as a testament", "plays a vital role", "marks a turning point", "leaves a lasting impact", "in the heart of", "rich tapestry", "shaping the future of".
- Filler and essay-conclusion padding: "In conclusion", "Overall", "It is important to note that", "It is worth noting", "Despite its challenges".
- Vague attribution: "experts say", "studies show", "it is widely believed", "many argue". State only sourced facts you are certain of.

Formatting:
- Plain prose only. No Markdown emphasis (**bold** or *italic*), no Markdown headings (#), no emoji, no decorative symbols or horizontal rules.
- Do not put headings or titles in Title Case beyond normal sentence capitalisation.

General: vary sentence length and openings, write plainly and directly, and prefer simple verbs (is, has, makes, shows) over inflated ones. Do not fabricate facts, statistics, dates, quotations, sources, or citations.`;

const AUTHORSHIP_RULES = `SOURCES AND AUTHORSHIP — STRICT.
- Any passage, extract, stimulus, scenario, or text that you write yourself must be attributed to "${DEFAULT_RESOURCE_AUTHOR}" as the author. Never invent a fake author name, publication, or date for your own writing.
- You may use genuine works that are clearly in the public domain (for example Shakespeare, and classic poems or prose whose author died well over 70 years ago). When you do, attribute them accurately to the real author, name the work, and reproduce the text faithfully.
- Do not use any text that is still under copyright unless the tutor has supplied it.
- Never fabricate, guess, or approximate an author, title, date, publisher, or quotation. If you cannot recall a real source accurately enough to reproduce and attribute it correctly, write an original passage and attribute it to "${DEFAULT_RESOURCE_AUTHOR}" instead.`;

/**
 * Deterministic backstop that removes the punctuation tells of AI writing.
 * Runs on every rendered string (via cleanText) so an em-dash can never reach
 * the final document, regardless of what the model returns.
 *
 * Only punctuation that is always safe to transform globally is handled here.
 * Vocabulary and phrasing tells are left to the prompt, because blind
 * find-and-replace on real words would mangle legitimate content.
 */
function deAiPunctuation(value) {
  return String(value ?? "")
    // Curly double quotes → straight double quote.
    .replace(/[“”„‟]/g, '"')
    // Curly single quotes / apostrophes → straight apostrophe.
    .replace(/[‘’‚‛]/g, "'")
    // Numeric ranges joined by a dash (5–10, 1914—1918) → hyphen, before the
    // generic dash rule below turns them into commas.
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    // Any remaining em-dash or en-dash used as a pause or parenthetical → comma.
    .replace(/\s*[–—]\s*/g, ", ")
    // Horizontal ellipsis character → three full stops.
    .replace(/…/g, "...")
    // Tidy artefacts the dash swap can create.
    .replace(/ ,/g, ",")
    .replace(/,{2,}/g, ",")
    .replace(/^\s*,\s*/, "")
    .replace(/\s*,\s*$/, "");
}

module.exports = {
  AUTHORSHIP_RULES,
  DEFAULT_RESOURCE_AUTHOR,
  HUMAN_WRITING_RULES,
  deAiPunctuation,
};
