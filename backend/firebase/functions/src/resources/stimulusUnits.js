"use strict";

const POEM_EXCERPT_MAX_LINES = 24;
const PROSE_EXCERPT_MAX_PARAGRAPHS = 3;

function isPoemText(text) {
  return String(text?.textType || text?.selection?.type || "").toLowerCase() === "poem";
}

/**
 * Split a verified source into stable, one-based units that the model may
 * reference without copying the source text. Poetry uses lines and preserves
 * stanza membership; prose uses paragraphs. The renderer later reconstructs
 * an excerpt from these exact units, so generated punctuation can never leak
 * into a sourced quotation.
 */
function stimulusUnits(text) {
  const body = String(text?.body ?? text?.passage ?? "").replace(/\r\n?/g, "\n");
  if (!body.trim()) return [];

  if (isPoemText(text)) {
    const units = [];
    let stanza = 1;
    let sawContent = false;
    let pendingStanzaBreak = false;
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trimEnd();
      if (!line.trim()) {
        if (sawContent) pendingStanzaBreak = true;
        continue;
      }
      if (pendingStanzaBreak) stanza += 1;
      pendingStanzaBreak = false;
      sawContent = true;
      units.push({ number: units.length + 1, group: stanza, text: line });
    }
    return units;
  }

  return body
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((textValue, index) => ({
      number: index + 1,
      group: index + 1,
      text: textValue,
    }));
}

function numberedStimulusBody(text) {
  const poem = isPoemText(text);
  const units = stimulusUnits(text);
  const lines = [];
  let previousGroup = null;
  for (const unit of units) {
    if (poem && previousGroup !== null && unit.group !== previousGroup) lines.push("");
    lines.push(`[${poem ? "Line" : "Paragraph"} ${unit.number}] ${unit.text}`);
    previousGroup = unit.group;
  }
  return lines.join(poem ? "\n" : "\n\n");
}

function excerptStimulusBody(text, startUnit, endUnit) {
  const poem = isPoemText(text);
  const units = stimulusUnits(text);
  if (!units.length) return null;

  let start = Number.isInteger(startUnit) ? startUnit : 1;
  let end = Number.isInteger(endUnit) ? endUnit : start;
  start = Math.min(Math.max(start, 1), units.length);
  end = Math.min(Math.max(end, start), units.length);

  const maxUnits = poem ? POEM_EXCERPT_MAX_LINES : PROSE_EXCERPT_MAX_PARAGRAPHS;
  end = Math.min(end, start + maxUnits - 1);
  const selected = units.slice(start - 1, end);
  const parts = [];
  let previousGroup = null;
  for (const unit of selected) {
    if (poem && previousGroup !== null && unit.group !== previousGroup) parts.push("");
    parts.push(unit.text);
    previousGroup = unit.group;
  }

  return {
    body: parts.join(poem ? "\n" : "\n\n"),
    startUnit: start,
    endUnit: end,
    unitLabel: poem ? "Line" : "Paragraph",
  };
}

module.exports = {
  POEM_EXCERPT_MAX_LINES,
  PROSE_EXCERPT_MAX_PARAGRAPHS,
  excerptStimulusBody,
  isPoemText,
  numberedStimulusBody,
  stimulusUnits,
};
