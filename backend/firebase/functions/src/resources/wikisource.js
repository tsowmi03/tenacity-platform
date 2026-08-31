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
const WS_MIN_INTERVAL_MS = 350;
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
      throw err;
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// Retry once on HTTP 429 (rate limit) after a longer pause — MediaWiki throttles
// bursts, and a single backoff clears the transient case in practice.
async function wsFetch(url) {
  try {
    return await wsFetchOnce(url);
  } catch (err) {
    if (err.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return wsFetchOnce(url);
    }
    throw err;
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

function qualityPenalty(title) {
  return DRAFT_TITLE_RE.test(String(title || "")) ? 1 : 0;
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
  const links = [...String(wikitext || "").matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)].map(
    (m) => m[1].trim()
  );
  const scored = links
    .filter((t) => !NON_WORK_NS.test(t))
    .map((t) => {
      const overlap = significantTokens(t).filter((x) => wantTokens.includes(x)).length;
      return { t, overlap, score: overlap * 10 - qualityPenalty(t) };
    })
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.score - a.score);
  return [...new Set(scored.map((x) => x.t))].slice(0, 4);
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

/** Strip inline wiki markup and decode entities in a line of poem text. */
function cleanWikiMarkup(text) {
  const stripped = String(text || "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/\{\{[^{}]*\}\}/g, "") // simple templates
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
async function sourceWikisourcePoem({ title, author, maxFetches = 6 }) {
  const resolution = await resolveWikisourcePoem({ title, author });
  if (!resolution.matched) {
    return { ok: false, source: "Wikisource", resolution, passage: null, tried: [] };
  }

  const wantTokens = significantTokens(title);
  const queue = [...resolution.candidates];
  const visited = new Set();
  const tried = [];
  let fallback = null;
  let fetches = 0;

  while (queue.length && fetches < maxFetches) {
    const page = queue.shift();
    if (visited.has(page)) continue;
    visited.add(page);

    let wikitext;
    try {
      wikitext = await fetchWikisourceWikitext(page);
      fetches += 1;
    } catch (err) {
      tried.push({ page, error: err.message });
      continue;
    }

    const ex = extractPoemFromWikitext(wikitext);
    tried.push({ page, confidence: ex.confidence, words: countWords(ex.text) });

    if (ex.confidence === "high" && ex.text) {
      return buildWikisourceResult({ pageTitle: page, title, author, passage: ex.text, confidence: "high", tried });
    }
    if (/\{\{\s*(versions|similar)/i.test(wikitext)) {
      for (const link of harvestVersionLinks(wikitext, wantTokens)) {
        if (!visited.has(link)) queue.push(link);
      }
    }
    if (ex.text && !fallback) fallback = { page, passage: ex.text, confidence: ex.confidence };
  }

  if (fallback) {
    const r = buildWikisourceResult({ pageTitle: fallback.page, title, author, passage: fallback.passage, confidence: fallback.confidence, tried });
    r.ok = false; // extracted something, but not a verified <poem> block
    return r;
  }
  return { ok: false, source: "Wikisource", resolution, passage: null, tried };
}

module.exports = {
  resolveWikisourcePoem,
  fetchWikisourceWikitext,
  cleanWikiMarkup,
  decodeHtmlEntities,
  extractPoemFromWikitext,
  sourceWikisourcePoem,
  countWords,
};
