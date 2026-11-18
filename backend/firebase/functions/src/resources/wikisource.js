"use strict";

/**
 * Wikisource poem source for verifiable public-domain text.
 *
 * Project Gutenberg bundles poems inside whole collections, which makes slicing
 * a single poem unreliable (see publicDomainText.js / extractNamedPiece). English
 * Wikisource instead has one page per poem, and most poem pages wrap the verbatim
 * text in a `<poem>...</poem>` tag — so extraction is clean and the line breaks
 * survive. This module mirrors the Gutenberg path: resolve (search) -> fetch
 * (MediaWiki API) -> extract -> audit, returning the same normalised shape.
 *
 * Note on licensing: Wikisource only hosts works that are free/public-domain, so
 * (like Gutenberg) the platform is the provenance. There is no per-page
 * machine-readable copyright flag, so we assert PD by platform and surface the
 * page URL for human verification.
 */

const WS_API = "https://en.wikisource.org/w/api.php";
const WS_PAGE = "https://en.wikisource.org/wiki/";
const FETCH_TIMEOUT_MS = 20000;
const USER_AGENT = "TenacityTutoring-PDText/1.0 (English resource sourcing)";
// MediaWiki throttles bursty clients (HTTP 429). Space requests politely; the
// BFS is serial so a pre-fetch delay is enough to stay under the limit.
// RES-116: 350ms still drew HTTP 429 after a few pages; one a second doesn't.
let WS_MIN_INTERVAL_MS = 1000;
let lastWsFetchAt = 0;

async function wsFetchOnce(url) {
  const wait = WS_MIN_INTERVAL_MS - (Date.now() - lastWsFetchAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastWsFetchAt = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} fetching ${url}`);
      err.status = res.status;
      err.retryAfter = res.headers?.get?.("retry-after") || null;
      throw err;
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// On HTTP 429 (rate limit) wait as long as the server's Retry-After asks
// (default 3s, at most 10s) and try again, up to twice.
async function wsFetch(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await wsFetchOnce(url);
    } catch (err) {
      if (err.status !== 429 || attempt >= 2) throw err;
      const seconds = Math.min(10, Number(err.retryAfter) || 3);
      await new Promise((resolve) => setTimeout(resolve, WS_MIN_INTERVAL_MS ? seconds * 1000 : 0));
    }
  }
}

// Function words shared by countless titles ("and", "was", "the") would let an
// unrelated page count as overlapping — e.g. a Housman first-line title once
// matched a Blake collection purely on "and". Content words only; if a title is
// made entirely of function words, fall back to the unfiltered set rather than
// matching nothing.
const TITLE_STOPWORDS = new Set([
  "and", "the", "was", "were", "for", "with", "from", "that", "this", "when",
  "what", "who", "will", "are", "not", "you", "all", "our", "his", "her",
  "its", "into", "upon", "had", "have", "she", "him", "they", "them",
]);

function significantTokens(s) {
  const tokens = String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const content = tokens.filter((t) => !TITLE_STOPWORDS.has(t));
  return content.length ? content : tokens;
}

const NON_WORK_NS = /^(Author|Category|Portal|Wikisource|Template|Help|File|Image|Special|Talk):/i;
// Draft/manuscript/notebook versions carry editorial marks ("[or del.]"); prefer
// clean published versions when one is available.
const DRAFT_TITLE_RE = /\b(draft|manuscript|notebook)\b/i;

// Judged on the page's own name (its last path segment and any bracketed
// note), not the book it sits in: "…a new and verbatim text from the
// manuscript…/The Tyger" is a published edition. RES-116.
function isDraftTitle(title) {
  const own = String(title || "").split("/").pop();
  return DRAFT_TITLE_RE.test(own);
}

function qualityPenalty(title) {
  return isDraftTitle(title) ? 1 : 0;
}

function pageUrl(pageTitle) {
  return WS_PAGE + encodeURIComponent(pageTitle.replace(/\s/g, "_"));
}

/**
 * Rank candidate Wikisource pages for a poem via the search API. Returns an
 * ordered list of page titles (most title-relevant first), skipping obvious
 * non-work namespaces. Many top hits are `{{versions}}` landing pages — the
 * actual poem text is one hop away — so the caller follows links (see
 * harvestVersionLinks) rather than trusting the first result.
 */
async function resolveWikisourcePoem({ title, author }) {
  const query = [title, author].filter(Boolean).join(" ");
  const url =
    `${WS_API}?action=query&list=search&format=json&srlimit=8` +
    `&srsearch=${encodeURIComponent(query)}`;
  let data;
  try {
    const res = await wsFetch(url);
    data = await res.json();
  } catch (err) {
    return { matched: false, candidates: [], considered: [{ query, error: err.message }] };
  }

  const wantTokens = significantTokens(title);
  const scored = (data?.query?.search || [])
    .filter((r) => !NON_WORK_NS.test(r.title))
    .map((r) => {
      const overlap = wantTokens.filter((t) => significantTokens(r.title).includes(t)).length;
      return { pageTitle: r.title, overlap, score: overlap * 10 - qualityPenalty(r.title) };
    })
    .filter((r) => r.overlap > 0)
    .sort((a, b) => b.score - a.score);

  return {
    matched: scored.length > 0,
    candidates: scored.map((s) => s.pageTitle),
    considered: [{ query, resultCount: scored.length, top: scored[0]?.pageTitle || null }],
  };
}

/**
 * From a `{{versions}}`/`{{similar}}` landing page, harvest the internal links
 * that point at concrete versions of this poem (sharing a title token), so they
 * can be tried for a real `<poem>` block.
 */
function harvestVersionLinks(wikitext, wantTokens) {
  // The link's visible label counts as well as its target: an edition is often
  // a subpage named for its place in a book ("…(1819)/Sonnet") and labelled
  // with the poem's title ("Sonnet. Ozymandias"). RES-116.
  const links = [...String(wikitext || "").matchAll(/\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]/g)].map(
    (m) => ({ t: m[1].trim(), label: (m[2] || "").trim() })
  );
  const scored = links
    .filter(({ t }) => !NON_WORK_NS.test(t))
    .map(({ t, label }) => {
      const tokens = new Set([...significantTokens(t), ...significantTokens(label)]);
      const overlap = wantTokens.filter((x) => tokens.has(x)).length;
      return { t, overlap, score: overlap * 10 - qualityPenalty(`${t} ${label}`) };
    })
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.score - a.score);
  return [...new Set(scored.map((x) => x.t))].slice(0, 8);
}

/** Each linked page's visible label, from a page's wikitext. */
function linkLabels(wikitext) {
  const labels = new Map();
  for (const m of String(wikitext || "").matchAll(/\[\[([^\]|#]+)\|([^\]]*)\]\]/g)) {
    if (!labels.has(m[1].trim())) labels.set(m[1].trim(), m[2].trim());
  }
  return labels;
}

/**
 * Whether a page is the requested poem by name: every significant word of the
 * title must appear in the page's own name or in the label of the link that
 * led to it. Two words of three let "The Charge of the Heavy Brigade" pass for
 * "The Charge of the Light Brigade". RES-116.
 */
function pageMatchesTitle(page, title, label = "") {
  const own = String(page || "").split("/").pop();
  const have = new Set([...significantTokens(own), ...significantTokens(label)]);
  return significantTokens(title).every((t) => have.has(t));
}

/**
 * The rendered HTML of a page. Proofread editions don't carry the poem in
 * their own wikitext: they transclude scanned book pages
 * (`<pages index="….djvu" include=106 />`), which only appear once rendered.
 */
async function fetchWikisourceRenderedHtml(pageTitle) {
  const url =
    `${WS_API}?action=parse&prop=text&formatversion=2&format=json&disableeditsection=1` +
    `&page=${encodeURIComponent(pageTitle)}`;
  const res = await wsFetch(url);
  const data = await res.json();
  const html = data?.parse?.text;
  if (!html) throw new Error(`No rendered text for page "${pageTitle}"`);
  return html;
}

/**
 * The poem from rendered page HTML: MediaWiki renders every `<poem>` block as
 * `<div class="poem">`, with `<br>` line breaks and `<p>` stanzas. Page
 * numbers, footnote markers and other furniture inside the block are dropped.
 * "high" when a poem block with text was found, as for the wikitext path.
 */
// Visible text in a stretch of rendered HTML, ignoring styles, page numbers
// and other furniture.
function visibleText(html) {
  return decodeHtmlEntities(String(html || "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<span\b[^>]*\bclass="[^"]*\b(?:pagenum|ws-pagenum|ws-noexport)\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "")
    .replace(/<[^>]+>/g, " "))
    .replace(/[\s\u200b]+/g, " ")
    .trim();
}

function extractPoemFromHtml(html) {
  const source = String(html || "");
  const matches = [...source.matchAll(/<div\b[^>]*\bclass="[^"]*\bpoem\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];
  // A poem split across scanned pages renders as several blocks with only page
  // furniture between them. Any real text between two blocks (the next poem's
  // title, notes) means the page has moved on: stop there. RES-116.
  const blocks = [];
  for (const [i, m] of matches.entries()) {
    if (i > 0) {
      const prev = matches[i - 1];
      if (/[A-Za-z]/.test(visibleText(source.slice(prev.index + prev[0].length, m.index)))) break;
    }
    blocks.push(m[1]);
  }
  const cut = blocks.length < matches.length;
  const text = blocks
    .map((block) => decodeHtmlEntities(
      block
        // Line breaks in the HTML source are only whitespace; <br> and <p> carry the layout.
        .replace(/\s*\n\s*/g, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, "")
        // Line numbers printed beside the verse ("1", "9", "13").
        .replace(/<span\b[^>]*\bclass="[^"]*\b(?:wst-nr|wst-linenum|linenum|ws-linenum)\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "")
        .replace(/<span\b[^>]*\bclass="[^"]*\b(?:pagenum|ws-pagenum|ws-noexport)\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "")
        .replace(/<sup\b[^>]*\bclass="[^"]*\breference\b[^"]*"[^>]*>[\s\S]*?<\/sup>/gi, "")
        .replace(/\s*<br\s*\/?>\s*/gi, "\n")
        .replace(/<\/p>\s*<p\b[^>]*>/gi, "\n\n")
        .replace(/<[^>]+>/g, "")
    ).replace(/[ \t\u00a0]+$/gm, "").replace(/^[ \t\u00a0]+/gm, "").replace(/\n{3,}/g, "\n\n").trim())
    .filter(Boolean)
    .join("\n\n");
  return text
    ? { text, confidence: "high", cut, notes: `Extracted from ${blocks.length} of ${matches.length} rendered poem block(s).` }
    : { text: null, confidence: "none", cut, notes: "No poem block in the rendered page." };
}

async function fetchWikisourceWikitext(pageTitle) {
  const url =
    `${WS_API}?action=parse&prop=wikitext&formatversion=2&format=json` +
    `&page=${encodeURIComponent(pageTitle)}`;
  const res = await wsFetch(url);
  const data = await res.json();
  const wikitext = data?.parse?.wikitext;
  if (!wikitext) throw new Error(`No wikitext for page "${pageTitle}"`);
  return wikitext;
}

// Named HTML entities that actually turn up in Wikisource literary text:
// typographic punctuation, the XML five, and the Latin-1 accents that appear in
// 19th and 20th century English verse and prose. Numeric forms are handled
// generically below, so this list only needs the named ones. An entity that is
// not listed is left exactly as it was — visible, and so noticeable — rather
// than guessed at.
const NAMED_ENTITIES = Object.freeze({
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  nbsp: " ", ensp: " ", emsp: " ", thinsp: " ", shy: "",
  hellip: "…", mdash: "—", ndash: "–", minus: "−", horbar: "―",
  lsquo: "‘", rsquo: "’", sbquo: "‚",
  ldquo: "“", rdquo: "”", bdquo: "„",
  laquo: "«", raquo: "»", lsaquo: "‹", rsaquo: "›",
  dagger: "†", Dagger: "‡", sect: "§", para: "¶", middot: "·", bull: "•",
  prime: "′", Prime: "″", oline: "‾", frasl: "⁄",
  deg: "°", plusmn: "±", times: "×", divide: "÷", frac12: "½", frac14: "¼", frac34: "¾",
  copy: "©", reg: "®", trade: "™", pound: "£", euro: "€", cent: "¢", yen: "¥", curren: "¤",
  iexcl: "¡", iquest: "¿", brvbar: "¦", uml: "¨", macr: "¯", acute: "´", cedil: "¸",
  ordf: "ª", ordm: "º", sup1: "¹", sup2: "²", sup3: "³", micro: "µ", not: "¬",
  agrave: "à", aacute: "á", acirc: "â", atilde: "ã", auml: "ä", aring: "å", aelig: "æ",
  ccedil: "ç", egrave: "è", eacute: "é", ecirc: "ê", euml: "ë",
  igrave: "ì", iacute: "í", icirc: "î", iuml: "ï",
  ntilde: "ñ", ograve: "ò", oacute: "ó", ocirc: "ô", otilde: "õ", ouml: "ö", oslash: "ø",
  ugrave: "ù", uacute: "ú", ucirc: "û", uuml: "ü", yacute: "ý", yuml: "ÿ",
  szlig: "ß", eth: "ð", thorn: "þ",
  Agrave: "À", Aacute: "Á", Acirc: "Â", Atilde: "Ã", Auml: "Ä", Aring: "Å", AElig: "Æ",
  Ccedil: "Ç", Egrave: "È", Eacute: "É", Ecirc: "Ê", Euml: "Ë",
  Igrave: "Ì", Iacute: "Í", Icirc: "Î", Iuml: "Ï",
  Ntilde: "Ñ", Ograve: "Ò", Oacute: "Ó", Ocirc: "Ô", Otilde: "Õ", Ouml: "Ö", Oslash: "Ø",
  Ugrave: "Ù", Uacute: "Ú", Ucirc: "Û", Uuml: "Ü", Yacute: "Ý",
});

/**
 * Decode HTML entities in wikitext.
 *
 * Wikitext carries entities the renderer would resolve but a plain-text
 * extraction does not, so "&hellip;" reached the student verbatim in a sourced
 * poem — eight characters of markup in the middle of a line of Owen.
 *
 * The decode is deliberately ONE left-to-right pass. Decoding "&amp;" to "&"
 * and then rescanning would turn a literal "&amp;hellip;" — which the source
 * wrote to mean the visible text "&hellip;" — into an ellipsis, silently
 * changing the work. A single String.replace never re-examines what it has
 * already emitted, so that case survives intact.
 */
function decodeHtmlEntities(text) {
  return String(text || "").replace(
    /&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (match, body) => {
      if (body[0] === "#") {
        const code = body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
        // Reject anything outside the Unicode range, and the surrogate block,
        // which String.fromCodePoint would either throw on or emit as a lone
        // surrogate that later breaks XML serialisation of the .docx.
        if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return match;
        if (code >= 0xd800 && code <= 0xdfff) return match;
        return String.fromCodePoint(code);
      }
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)
        ? NAMED_ENTITIES[body]
        : match;
    }
  );
}

// RES-116. Formatting templates wrap words of the poem itself: Owen's
// "Gas! {{sc|Gas!}} Quick, boys!" lost its second GAS! when every template was
// deleted. These keep their text (the last positional argument; {{sic}} its
// first); {{gap}} is a space; anything else (line numbers, page furniture) is
// still removed.
const TEXT_TEMPLATES = new Set([
  "sc", "smallcaps", "small-caps", "small caps", "uc", "lc", "larger", "large", "x-larger", "xx-larger",
  "smaller", "small", "x-smaller", "em", "strong", "i", "b", "u", "nowrap", "nobr", "lang", "serif",
  "sans-serif", "fqm", "dhr", "hws", "hwe", "ls", "letter-spacing", "expanded", "spaced", "bold", "italic",
]);
function unwrapTextTemplate(match, body) {
  const parts = body.split("|").map((p) => p.trim());
  const name = parts[0].toLowerCase().replace(/_/g, " ");
  const positional = parts.slice(1).filter((p) => !/^[a-z][a-z0-9 _-]*=/i.test(p));
  if (name === "gap") return " ";
  if (name === "sic") return positional[0] ?? "";
  if (TEXT_TEMPLATES.has(name)) return positional.at(-1) ?? "";
  return "";
}

/** Strip inline wiki markup and decode entities in a line of poem text. */
function cleanWikiMarkup(text) {
  const stripped = String(text || "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/\{\{([^{}]*)\}\}/g, unwrapTextTemplate) // keep text of formatting templates, drop the rest
    .replace(/\{\{([^{}]*)\}\}/g, unwrapTextTemplate) // one level of nesting
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1") // [[a|b]] -> b, [[a]] -> a
    .replace(/'''?/g, "") // bold/italic
    .replace(/<\/?[^>]+>/g, ""); // stray tags

  // Decoding comes AFTER the tag strip on purpose: "&lt;i&gt;" in a source text
  // means the visible characters "<i>", and decoding first would turn it into a
  // tag the strip above would then silently delete.
  return decodeHtmlEntities(stripped).replace(/[ \t]+$/gm, "");
}

/**
 * Extract the poem body from page wikitext. The reliable case is a
 * `<poem>...</poem>` block; we concatenate all such blocks. Returns confidence
 * "high" for a real poem tag, lower for heuristic fallbacks.
 */
function extractPoemFromWikitext(wikitext) {
  const text = String(wikitext || "");
  const blocks = [...text.matchAll(/<poem[^>]*>([\s\S]*?)<\/poem>/gi)].map((m) =>
    m[1]
  );
  if (blocks.length) {
    const body = cleanWikiMarkup(blocks.join("\n\n")).trim();
    return {
      text: body || null,
      confidence: body ? "high" : "none",
      notes: `Extracted from ${blocks.length} <poem> block(s).`,
    };
  }

  // Fallback: drop header/footer templates and category links, keep the rest.
  const stripped = cleanWikiMarkup(
    text
      .replace(/\{\{[\s\S]*?\}\}/g, "") // multi-line templates (header/footer)
      .replace(/^\s*\[\[Category:[^\]]*\]\]\s*$/gim, "")
  ).trim();
  return {
    text: stripped || null,
    confidence: stripped ? "low" : "none",
    notes: "No <poem> tag; used heuristic markup strip — verify against the source URL.",
  };
}

function countWords(text) {
  const t = String(text || "").trim();
  return t ? t.split(/\s+/).length : 0;
}

function buildWikisourceResult({ pageTitle, title, author, passage, confidence, tried }) {
  const wordCount = countWords(passage);
  const titlePresent = significantTokens(title).some((t) =>
    String(pageTitle || "").toLowerCase().includes(t)
  );
  return {
    ok: !!passage,
    source: "Wikisource",
    title: pageTitle,
    author,
    sourceName: `Wikisource — ${pageTitle}`,
    sourceUrl: pageUrl(pageTitle),
    passage,
    wordCount,
    confidence,
    tried,
    licenseNote:
      "Hosted on Wikisource (public-domain / freely licensed works). Verify rights for your jurisdiction before distribution.",
    checks: [
      { name: "Resolved a Wikisource poem page", pass: !!pageTitle, detail: pageTitle || "none" },
      { name: "Clean <poem> text extracted", pass: confidence === "high", detail: `${wordCount} words (${confidence})` },
      { name: "Page title relates to requested title", pass: titlePresent, detail: titlePresent ? "yes" : "check manually" },
    ],
  };
}

/**
 * Full Wikisource poem path: resolve -> (bounded BFS following version links) ->
 * fetch -> extract -> normalise. Returns the same shape as the Gutenberg source
 * so the dispatcher and the generation pipeline treat sources uniformly.
 *
 * Only a `<poem>`-tag extraction (confidence "high") is treated as verified; the
 * search top hit is often a `{{versions}}` landing page, so we walk its links to
 * reach the concrete version that carries the poem. If nothing clean is found we
 * return the best low-confidence attempt with ok:false so the caller can fall
 * back rather than ship unreliable text.
 */
async function sourceWikisourcePoem({ title, author, approxWordCount = 0, maxFetches = 10 }) {
  const expected = Number(approxWordCount) || 0;
  const resolution = await resolveWikisourcePoem({ title, author });
  if (!resolution.matched) {
    return { ok: false, source: "Wikisource", resolution, passage: null, tried: [] };
  }

  const wantTokens = significantTokens(title);
  const visited = new Set();
  const tried = [];
  let fallback = null;
  let fetches = 0;
  // RES-116: drafts, manuscripts and notebooks carry editorial marks and can
  // differ from the published poem ("The Tyger (2nd draft)" was printed for a
  // request). They are tried only after every published page, and a poem
  // found in one is never treated as verified.
  const published = [];
  const drafts = [];
  const labels = new Map();
  const enqueue = (page) => {
    if (visited.has(page) || published.includes(page) || drafts.includes(page)) return;
    (isDraftTitle(page) ? drafts : published).push(page);
  };
  resolution.candidates.forEach(enqueue);

  while ((published.length || drafts.length) && fetches < maxFetches) {
    const page = published.length ? published.shift() : drafts.shift();
    if (visited.has(page)) continue;
    visited.add(page);
    const isDraft = isDraftTitle(page);

    let wikitext;
    try {
      wikitext = await fetchWikisourceWikitext(page);
      fetches += 1;
    } catch (err) {
      tried.push({ page, error: err.message });
      continue;
    }

    let ex = extractPoemFromWikitext(wikitext);
    // A proofread edition transcludes scanned pages; the poem is only in the
    // rendered page.
    if (ex.confidence !== "high" && /<pages\b[^>]*\bindex\s*=/i.test(wikitext) && fetches < maxFetches) {
      try {
        const html = await fetchWikisourceRenderedHtml(page);
        fetches += 1;
        const rendered = extractPoemFromHtml(html);
        if (rendered.text) ex = rendered;
      } catch (err) {
        tried.push({ page, error: `rendered: ${err.message}` });
      }
    }
    // RES-116: a poem cut short is never verified. Under half the planner's
    // expected length, or reading stopped early (notes or another poem came
    // next) without reaching most of it, the text is only a fallback.
    const words = countWords(ex.text);
    if (ex.confidence === "high" && ((expected && words < expected * 0.5) || (ex.cut && !(expected && words >= expected * 0.7)))) {
      ex = { ...ex, confidence: "partial" };
    }
    const named = pageMatchesTitle(page, title, labels.get(page));
    if (ex.confidence === "high" && ex.text && !named) ex = { ...ex, confidence: "title-mismatch" };
    tried.push({ page, confidence: ex.confidence, words, ...(isDraft ? { draft: true } : {}) });

    if (ex.confidence === "high" && ex.text && !isDraft) {
      return buildWikisourceResult({ pageTitle: page, title, author, passage: ex.text, confidence: "high", tried });
    }
    if (/\{\{\s*(versions|similar|other versions)/i.test(wikitext)) {
      const found = linkLabels(wikitext);
      for (const link of harvestVersionLinks(wikitext, wantTokens)) {
        if (found.has(link) && !labels.has(link)) labels.set(link, found.get(link));
        enqueue(link);
      }
    }
    if (ex.text && (!fallback || (fallback.isDraft && !isDraft))) {
      fallback = { page, passage: ex.text, confidence: isDraft ? "draft" : ex.confidence, isDraft };
    }
  }

  if (fallback) {
    const r = buildWikisourceResult({ pageTitle: fallback.page, title, author, passage: fallback.passage, confidence: fallback.confidence, tried });
    r.ok = false; // extracted something, but not a verified <poem> block
    return r;
  }
  return { ok: false, source: "Wikisource", resolution, passage: null, tried };
}

module.exports = {
  // Tests only: no spacing between requests.
  _setMinIntervalForTests: (ms) => { WS_MIN_INTERVAL_MS = ms; },
  resolveWikisourcePoem,
  fetchWikisourceWikitext,
  cleanWikiMarkup,
  decodeHtmlEntities,
  extractPoemFromWikitext,
  extractPoemFromHtml,
  fetchWikisourceRenderedHtml,
  harvestVersionLinks,
  pageMatchesTitle,
  sourceWikisourcePoem,
  countWords,
};
