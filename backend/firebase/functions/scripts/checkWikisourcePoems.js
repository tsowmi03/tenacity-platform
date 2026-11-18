"use strict";

// RES-116. Live check that common school poems source from Wikisource as
// verified text. Not part of `npm test`: it calls Wikisource, one request at
// a time, and takes about a minute.
//
//   node scripts/checkWikisourcePoems.js
//   node scripts/checkWikisourcePoems.js --show "Ozymandias"   (print the text)

const { sourceWikisourcePoem } = require("../src/resources/wikisource");

// Each poem with a line it must contain, so a wrong page or a different
// version can't pass.
const POEMS = [
  // approxWordCount is what the planner would estimate; the lines are from
  // the end of each poem where possible, so a cut-short text fails.
  { title: "Ozymandias", author: "Percy Bysshe Shelley", approxWordCount: 111, mustContain: "lone and level sands" },
  { title: "The Tyger", author: "William Blake", approxWordCount: 140, mustContain: "Dare frame thy fearful symmetry" },
  { title: "Dulce et Decorum Est", author: "Wilfred Owen", approxWordCount: 250, mustContain: "Pro patria mori" },
  { title: "The Road Not Taken", author: "Robert Frost", approxWordCount: 144, mustContain: "made all the difference" },
  // Wikisource carries the 1807 text (three stanzas, "dancing Daffodils").
  { title: "I Wandered Lonely as a Cloud", author: "William Wordsworth", approxWordCount: 150, mustContain: "dances with the Daffodils" },
  { title: "The Charge of the Light Brigade", author: "Alfred Tennyson", approxWordCount: 300, mustContain: "Noble six hundred" },
];

const normalise = (text) => String(text || "").toLowerCase().replace(/[^a-z]+/g, " ");

async function main(argv) {
  const show = argv[0] === "--show" ? argv[1] : null;
  let failures = 0;
  for (const poem of POEMS) {
    if (show && poem.title !== show) continue;
    const r = await sourceWikisourcePoem({ title: poem.title, author: poem.author, approxWordCount: poem.approxWordCount });
    const hasLine = normalise(r.passage).includes(normalise(poem.mustContain));
    const pass = r.ok && hasLine;
    if (!pass) failures++;
    console.log(`${pass ? "PASS" : "FAIL"}  ${poem.title}: ok=${r.ok} confidence=${r.confidence} words=${r.wordCount ?? 0} line=${hasLine} page="${r.title || "-"}"`);
    if (!pass || show) console.log(`      tried: ${JSON.stringify(r.tried || [])}`);
    if (show) console.log(`\n${r.passage}\n`);
  }
  return failures;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((failures) => { process.exitCode = failures ? 1 : 0; })
    .catch((err) => { console.error(err.message); process.exitCode = 1; });
}

module.exports = { POEMS };
