"use strict";
const { it, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const ws = require("../../src/resources/wikisource");
const F = require("../fixtures/wikisource/pages");

// Serves the recorded pages by URL, so the whole lookup runs offline.
function stubWikisource(routes) {
  const requested = [];
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const page = u.searchParams.get("page");
    const key = u.searchParams.get("list") === "search" ? "search" : `${u.searchParams.get("prop")}:${page}`;
    requested.push(key);
    const body = routes[key];
    if (body === undefined) return { ok: false, status: 404, headers: { get: () => null } };
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => JSON.parse(body) };
  };
  return requested;
}
const wikitext = (text) => JSON.stringify({ parse: { wikitext: text } });
const rendered = (html) => JSON.stringify({ parse: { text: html } });

describe("Wikisource poems on transcluded pages (RES-116)", () => {
  let realFetch;
  before(() => { realFetch = globalThis.fetch; ws._setMinIntervalForTests(0); });
  after(() => { globalThis.fetch = realFetch; ws._setMinIntervalForTests(1000); });

  it("extracts a poem from rendered HTML, dropping page numbers and footnote markers", () => {
    const { text, confidence } = ws.extractPoemFromHtml(F.rosalindSonnetHtml);
    assert.equal(confidence, "high");
    const lines = text.split("\n");
    assert.equal(lines.length, 14, "a sonnet: fourteen lines");
    assert.equal(lines[0], "I met a traveller from an antique land,");
    assert.match(text, /king of kings/);
    assert.doesNotMatch(text, /\[1\]|OZYMANDIAS\.|106/);
  });

  it("matches an edition by its link label, and lists drafts last", () => {
    const links = ws.harvestVersionLinks(F.ozymandiasVersions, ["ozymandias"]);
    assert.ok(links.includes("Rosalind and Helen, A Modern Eclogue (1819)/Sonnet"), "found through its label 'Sonnet. Ozymandias'");
    assert.equal(links.at(-1), "Ozymandias (draft manuscript)");
  });

  it("sources Ozymandias from a transcluded edition and never settles for the draft", async () => {
    const requested = stubWikisource({
      search: F.searchResult(["Ozymandias (Shelley)", "Ozymandias (draft manuscript)"]),
      "wikitext:Ozymandias (Shelley)": wikitext(F.ozymandiasVersions),
      "wikitext:Ozymandias (draft manuscript)": wikitext(F.ozymandiasDraft),
      "wikitext:Rosalind and Helen, A Modern Eclogue (1819)/Sonnet": wikitext(F.rosalindSonnet),
      "text:Rosalind and Helen, A Modern Eclogue (1819)/Sonnet": rendered(F.rosalindSonnetHtml),
    });
    const r = await ws.sourceWikisourcePoem({ title: "Ozymandias", author: "Percy Bysshe Shelley" });
    assert.equal(r.ok, true);
    assert.equal(r.confidence, "high");
    assert.equal(r.title, "Rosalind and Helen, A Modern Eclogue (1819)/Sonnet");
    assert.match(r.passage, /Look on my works, ye mighty, and despair!/);
    assert.ok(!requested.includes("wikitext:Ozymandias (draft manuscript)"), "the draft is never fetched when a published edition works");
  });

  it("returns a draft only as an unverified fallback", async () => {
    stubWikisource({
      search: F.searchResult(["Ozymandias (draft manuscript)"]),
      "wikitext:Ozymandias (draft manuscript)": wikitext(F.ozymandiasDraft),
    });
    const r = await ws.sourceWikisourcePoem({ title: "Ozymandias", author: "Percy Bysshe Shelley" });
    assert.equal(r.ok, false);
    assert.equal(r.confidence, "draft");
  });
});

describe("formatting templates keep their words (RES-116)", () => {
  it("keeps small capitals in Owen and drops line-number templates", () => {
    const { text } = ws.extractPoemFromWikitext("<poem>Gas! {{sc|Gas!}} Quick, boys!–An ecstasy of fumbling,\n{{pline|10|l}}Fitting the clumsy helmets just in time;</poem>");
    assert.equal(text, "Gas! Gas! Quick, boys!–An ecstasy of fumbling,\nFitting the clumsy helmets just in time;");
  });
  it("unwraps size, language and nested templates, keeps {{sic}}'s text and turns {{gap}} into a space", () => {
    assert.equal(ws.cleanWikiMarkup("{{larger|{{sc|The}}}} end"), "The end");
    assert.equal(ws.cleanWikiMarkup("{{lang|fr|mon ami}}"), "mon ami");
    assert.equal(ws.cleanWikiMarkup("{{sic|desart|desert}}"), "desart");
    assert.equal(ws.cleanWikiMarkup("one{{gap}}two"), "one two");
    assert.equal(ws.cleanWikiMarkup("text{{PD/US|1918}}"), "text");
  });
});

describe("rendered editions spanning several pages (RES-116)", () => {
  const page = (n) => `<span class="pagenum ws-pagenum" id="${n}">&#8203;</span>`;
  it("joins a poem split across scanned pages", () => {
    const html = `<div class="prp-pages-output">${page(1)}<div class="poem"><p>Line one,<br>line two,</p></div>${page(2)}<div class="poem"><p>line three.</p></div></div>`;
    assert.equal(ws.extractPoemFromHtml(html).text, "Line one,\nline two,\n\nline three.");
  });
  it("stops at the next poem's title", () => {
    const html = `<div class="poem"><p>Tyger Tyger, burning bright,</p></div><style>.x{color:red}</style><div class="wst-center"><b>THE LITTLE GIRL LOST.</b></div><div class="poem"><p>In futurity</p></div>`;
    assert.equal(ws.extractPoemFromHtml(html).text, "Tyger Tyger, burning bright,");
  });
  it("judges drafts by the page's own name", () => {
    const links = ws.harvestVersionLinks("{{versions}}\n[[The poetical works of William Blake; a new and verbatim text from the manuscript engraved and letterpress originals/The Tyger|The Tyger]]\n[[The Tyger (2nd draft)]]", ["tyger"]);
    assert.equal(links[0], "The poetical works of William Blake; a new and verbatim text from the manuscript engraved and letterpress originals/The Tyger");
  });
});

describe("cut-short poems are never verified (RES-116)", () => {
  let realFetch;
  before(() => { realFetch = globalThis.fetch; ws._setMinIntervalForTests(0); });
  after(() => { globalThis.fetch = realFetch; ws._setMinIntervalForTests(1000); });
  const edition = "Poetical Works/The Tyger";
  const editionWikitext = `{{header | title = [[../]] }}\n<pages index="Works.djvu" from=152 fromsection="Tyger" to=157 />`;
  // Stanzas 1–2 on one scanned page, editor's notes, then the rest.
  const html = `<div class="poem"><style>.wst-nr{float:right}</style><p><span class="wst-nr">1</span>Tyger! Tyger! burning bright<br>In the forests of the night,<br>What immortal hand or eye<br>Could frame thy fearful symmetry?</p><p>In what distant deeps or skies<br>Burnt the fire of thine eyes?<br>On what wings dare he aspire?<br>What the hand dare seize the fire?</p></div><div class="wst-smaller-block"><p>Engraved on a single plate from the first draft.</p></div><div class="poem"><p>And what shoulder, &amp; what art,</p></div>`;
  const routes = {
    search: F.searchResult([edition]),
    [`wikitext:${edition}`]: JSON.stringify({ parse: { wikitext: editionWikitext } }),
    [`text:${edition}`]: JSON.stringify({ parse: { text: html } }),
  };
  function stub() {
    globalThis.fetch = async (url) => {
      const u = new URL(url);
      const key = u.searchParams.get("list") === "search" ? "search" : `${u.searchParams.get("prop")}:${u.searchParams.get("page")}`;
      return routes[key] ? { ok: true, status: 200, headers: { get: () => null }, json: async () => JSON.parse(routes[key]) } : { ok: false, status: 404, headers: { get: () => null } };
    };
  }

  it("drops page CSS and line numbers from the text", () => {
    const { text, cut } = ws.extractPoemFromHtml(html);
    assert.equal(cut, true);
    assert.ok(text.startsWith("Tyger! Tyger! burning bright"), text);
    assert.doesNotMatch(text, /wst-nr|float/);
  });

  it("treats a poem cut short by notes as unverified", async () => {
    stub();
    const r = await ws.sourceWikisourcePoem({ title: "The Tyger", author: "William Blake", approxWordCount: 140 });
    assert.equal(r.ok, false);
    assert.equal(r.confidence, "partial");
  });

  it("accepts a page that moves on to another poem once the poem itself is complete", async () => {
    stub();
    const r = await ws.sourceWikisourcePoem({ title: "The Tyger", author: "William Blake", approxWordCount: 40 });
    assert.equal(r.ok, true);
  });
});

describe("the page must be the requested poem by name (RES-116)", () => {
  it("rejects a page that shares only some title words", () => {
    assert.equal(ws.pageMatchesTitle("Tiresias, and Other Poems/The Charge of the Heavy Brigade at Balaclava", "The Charge of the Light Brigade"), false);
    assert.equal(ws.pageMatchesTitle("Poems That Every Child Should Know/The Charge of the Light Brigade", "The Charge of the Light Brigade"), true);
  });
  it("accepts an edition named only in its link label", () => {
    assert.equal(ws.pageMatchesTitle("Rosalind and Helen, A Modern Eclogue (1819)/Sonnet", "Ozymandias"), false);
    assert.equal(ws.pageMatchesTitle("Rosalind and Helen, A Modern Eclogue (1819)/Sonnet", "Ozymandias", "Sonnet. Ozymandias"), true);
  });
  it("judges by the page's own name, not the book it is in", () => {
    assert.equal(ws.pageMatchesTitle("Poems by Ozymandias Smith/Spring", "Ozymandias"), false);
  });
});
