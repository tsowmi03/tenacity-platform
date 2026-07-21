#!/usr/bin/env node
/**
 * SPIKE — verifiable public-domain text sourcing.
 *
 * Demonstrates the "model curates, backend fetches" architecture for sourcing
 * REAL, verifiable full-text passages for English resources:
 *   1. the model picks a public-domain work for a brief (no transcription);
 *   2. we route by type — poem -> Wikisource, prose -> Project Gutenberg;
 *   3. we deterministically download + extract the text;
 *   4. we print the passage, the citation trail, and pass/fail checks.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/spikePublicDomainText.js \
 *     --year=8 --type=short-story --length=900 --skill="inference and tone" --theme="suspense"
 *   ANTHROPIC_API_KEY=sk-... node scripts/spikePublicDomainText.js --type=poem --year=9 --theme="nature"
 *
 *   # No API key needed — exercises the fetch/extract/audit half with fixed picks:
 *   node scripts/spikePublicDomainText.js --mock              # standalone prose (Gutenberg)
 *   node scripts/spikePublicDomainText.js --mock=collection   # piece inside a collection
 *   node scripts/spikePublicDomainText.js --mock=poem         # poem (Wikisource)
 *
 *   --out   also write the full passage to /tmp for inspection
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { sourceVerifiedText } = require("../src/resources/sourcedText");

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    const m = token.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] === undefined ? true : m[2];
  }
  return args;
}

// Fixed picks so the deterministic half (route -> fetch -> extract -> audit) can
// run without spending an API call.
const MOCK_SELECTIONS = {
  standalone: {
    title: "The Cask of Amontillado",
    author: "Edgar Allan Poe",
    type: "short-story",
    standaloneOnGutenberg: true,
    collectionHint: null,
    pieceTitle: "The Cask of Amontillado",
    publicDomainBasis: "Poe died 1849; published 1846.",
    yearLevelFit: "Accessible gothic narrative suited to Years 8–10.",
    rationale: "Strong for inference, tone and unreliable narration.",
  },
  collection: {
    title: "The Tell-Tale Heart",
    author: "Edgar Allan Poe",
    type: "short-story",
    standaloneOnGutenberg: false,
    collectionHint: "The Works of Edgar Allan Poe",
    pieceTitle: "The Tell-Tale Heart",
    publicDomainBasis: "Poe died 1849; published 1843.",
    yearLevelFit: "Accessible gothic narrative suited to Years 8–10.",
    rationale: "Strong for inference and unreliable narration.",
  },
  poem: {
    title: "The Road Not Taken",
    author: "Robert Frost",
    type: "poem",
    standaloneOnGutenberg: false,
    collectionHint: "Mountain Interval",
    pieceTitle: "The Road Not Taken",
    publicDomainBasis: "Published 1916; public domain in the US.",
    yearLevelFit: "Widely taught; accessible for Years 7–10.",
    rationale: "Rich for tone, metaphor and theme analysis.",
  },
};

function tick(pass) {
  return pass ? "✓" : "✗";
}

function printReport(result) {
  const { brief, selection } = result;

  console.log("\n=== BRIEF ===");
  console.log(JSON.stringify(brief, null, 2));

  console.log("\n=== MODEL SELECTION (curation only — not the text) ===");
  console.log(`  Title    : ${selection.title}`);
  console.log(`  Author   : ${selection.author}`);
  console.log(`  Type     : ${selection.type}`);
  console.log(`  PD basis : ${selection.publicDomainBasis || "n/a"}`);
  console.log(`  Rationale: ${selection.rationale || "n/a"}`);

  console.log(`\n=== SOURCE: ${result.source} ===`);
  console.log(`  Accepted (ok): ${result.ok}`);
  if (result.sourceName) console.log(`  Resolved : ${result.sourceName}`);
  if (result.sourceUrl) console.log(`  URL      : ${result.sourceUrl}`);
  if (result.confidence) console.log(`  Confidence: ${result.confidence}`);
  if (result.extraction) console.log(`  Method   : ${result.extraction.method} — ${result.extraction.notes}`);
  if (result.tried) console.log(`  Pages tried: ${JSON.stringify(result.tried.map((t) => `${t.page}(${t.confidence || t.error})`))}`);

  if (result.passage) {
    console.log(`\n=== PASSAGE (${result.wordCount} words; first 600 chars) ===`);
    console.log(result.passage.slice(0, 600));
    if (result.passage.length > 600) console.log("  …");
  } else {
    console.log("\n=== PASSAGE === (none — would fall back to model-written text)");
  }

  if (result.licenseNote) {
    console.log("\n=== CITATION ===");
    console.log(`  ${result.source}: ${result.sourceUrl || "n/a"}`);
    console.log(`  ${result.licenseNote}`);
  }

  if (Array.isArray(result.checks)) {
    console.log("\n=== VERIFICATION CHECKS ===");
    for (const c of result.checks) console.log(`  ${tick(c.pass)} ${c.name} — ${c.detail}`);
  }
  console.log(`\n  ${result.ok ? "✓ VERIFIED PASSAGE READY" : "✗ NO VERIFIED PASSAGE — pipeline would fall back"}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const useMock = !!args.mock;
  const mockSelection =
    args.mock === "collection"
      ? MOCK_SELECTIONS.collection
      : args.mock === "poem"
        ? MOCK_SELECTIONS.poem
        : MOCK_SELECTIONS.standalone;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!useMock && !apiKey) {
    console.error(
      "ANTHROPIC_API_KEY not set. Set it, or run with --mock[=collection|poem] to\n" +
        "exercise the deterministic fetch/extract/audit half with fixed picks."
    );
    process.exit(1);
  }

  const brief = {
    year: args.year ? Number(args.year) : 8,
    textType: args.type || "short-story",
    lengthWords: args.length ? Number(args.length) : 900,
    skillFocus: args.skill || "inference, tone and characterisation",
    theme: args.theme || null,
  };

  console.log(useMock ? "Running in MOCK mode (no API call)…" : "Selecting via model…");
  const result = await sourceVerifiedText({
    apiKey,
    brief,
    selection: useMock ? mockSelection : undefined,
  });

  printReport(result);

  if (args.out && result.passage) {
    const outPath = path.join("/tmp", "public-domain-passage.txt");
    fs.writeFileSync(outPath, result.passage);
    console.log(`Full passage written to: ${outPath}\n`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
