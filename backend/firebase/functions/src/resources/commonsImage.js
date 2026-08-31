"use strict";

/**
 * Wikimedia Commons image source for verifiable, openly-licensed visual stimuli.
 *
 * This mirrors the text sourcing path (publicDomainText.js / wikisource.js): the
 * model curates — it says what KIND of image the resource needs — and never
 * supplies or describes the image itself. The picture handed to the booklet is
 * provably the fetched bytes, with a Commons page URL a human can click.
 *
 * Where Wikisource asserts public domain by platform, Commons cannot: it hosts
 * freely-licensed AND non-free content side by side. So the licence verdict here
 * is computed per file from the `extmetadata` block rather than assumed, and a
 * file is used only when that verdict is commercial-safe. Tenacity charges for
 * tutoring, so NonCommercial and NoDerivatives material is unusable however
 * pedagogically apt.
 *
 * Selection is deterministic once the search returns: candidates are filtered
 * (licence, restrictions, resolution, decodable format), then ranked, then the
 * winner's bytes are downloaded. Nothing about which image is chosen depends on
 * a second model call.
 */

const sharp = require("sharp");

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const COMMONS_PAGE = "https://commons.wikimedia.org/wiki/";
const FETCH_TIMEOUT_MS = 20000;
const USER_AGENT = "TenacityTutoring-VisualStimulus/1.0 (English resource sourcing)";
// MediaWiki throttles bursty clients (HTTP 429). Sourcing is serial, so a
// pre-fetch delay is enough to stay under the limit — same approach as
// wikisource.js, which shares the upstream rate limiter.
const COMMONS_MIN_INTERVAL_MS = 350;
let lastCommonsFetchAt = 0;

// Below this the image is too coarse to analyse — a student cannot read the
// small print of an advertisement, or see composition detail in a poster.
// Commons will happily serve a 1200px *thumbnail* of a 149x108 original, so the
// gate must be applied to the NATIVE size, never the thumbnail's.
const MIN_LONG_EDGE = 800;
// Width to request from Commons' thumbnailer. Wide enough for a full-page
// stimulus, small enough that three of them do not bloat the .docx.
const TARGET_WIDTH = 1200;
const SEARCH_LIMIT = 50;

// docx's ImageRun accepts these directly; anything else is transcoded to png.
const EMBEDDABLE = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
]);

async function commonsFetchOnce(url, { accept } = {}) {
  const wait = COMMONS_MIN_INTERVAL_MS - (Date.now() - lastCommonsFetchAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCommonsFetchAt = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, ...(accept ? { Accept: accept } : {}) },
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} fetching ${url}`);
      err.status = res.status;
      const retryAfter = Number(res.headers.get("retry-after"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) err.retryAfterMs = retryAfter * 1000;
      throw err;
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

const RETRYABLE_STATUS = new Set([429, 503]);
const MAX_BACKOFF_MS = 8000;

/**
 * Retry MediaWiki's throttle with exponential backoff, honouring Retry-After
 * when it sends one. A single short retry is not enough: once a client is
 * sustained-throttled, 429s keep coming for several seconds, and a stimulus set
 * makes a handful of calls back to back.
 */
async function commonsFetch(url, opts) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await commonsFetchOnce(url, opts);
    } catch (err) {
      lastErr = err;
      if (!RETRYABLE_STATUS.has(err.status)) throw err;
      const backoff = err.retryAfterMs || 1000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, Math.min(backoff, MAX_BACKOFF_MS)));
    }
  }
  throw lastErr;
}

function apiUrl(params) {
  return `${COMMONS_API}?${new URLSearchParams({ format: "json", ...params })}`;
}

function stripMarkup(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Commons splits the licence across two fields with different vocabularies:
 * `License` is a machine code ("pd", "cc-by-sa-4.0") and `LicenseShortName` is
 * the human label ("Public domain", "CC BY-SA 4.0"). They must be tested
 * SEPARATELY — concatenating them and matching with an anchored pattern rejects
 * almost every public-domain file, because the blob starts with "pd " and never
 * matches "public domain".
 */
function licenceFor(extmetadata) {
  const meta = extmetadata || {};
  const code = String(meta.License?.value || "").toLowerCase().trim();
  const short = stripMarkup(meta.LicenseShortName?.value);
  const blob = `${code} ${short.toLowerCase()}`;

  const restricted = /\bnc\b|non-?commercial|\bnd\b|no-?deriv/.test(blob)
    || /fair use|non-?free|with permission/.test(blob);
  const permitted = /^(pd|cc0|cc-by(-sa)?(-|$)|attribution)/.test(code)
    || /^(public domain|cc0|cc by|attribution|no restrictions)/.test(short.toLowerCase());

  return {
    safe: permitted && !restricted,
    name: short || (code ? code.toUpperCase() : "Unknown licence"),
    url: stripMarkup(meta.LicenseUrl?.value) || null,
    // Commons flags trademark and personality-rights encumbrances here. They do
    // not affect the copyright licence but do affect whether we should reprint
    // the image in a commercial product, so they are treated as disqualifying.
    restrictions: stripMarkup(meta.Restrictions?.value) || null,
  };
}

function creatorFor(extmetadata) {
  const meta = extmetadata || {};
  const artist = stripMarkup(meta.Artist?.value);
  if (artist && !/^unknown( author)?$/i.test(artist)) return artist;
  const credit = stripMarkup(meta.Credit?.value);
  return credit || "Unknown";
}

/**
 * A caption-worthy title. Commons filenames are often archival identifiers
 * ("...HAER RI,5-NESH,1-21.tif"), so the curated ObjectName is preferred when
 * present and the filename stem is the fallback.
 */
function titleFor(extmetadata, pageTitle) {
  const curated = stripMarkup(extmetadata?.ObjectName?.value);
  const stem = String(pageTitle || "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "");
  if (curated && curated.length <= 120 && !/^file:/i.test(curated)) return curated;
  return stem;
}

function dateFor(extmetadata) {
  const raw = stripMarkup(extmetadata?.DateTimeOriginal?.value);
  // Commons dates carry Wikidata qualifier junk ("1915date QS:P571,+1915-...").
  // A bare year is all the caption needs.
  const year = raw.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
  return year ? year[1] : null;
}

/**
 * Near-duplicate key. Commons hosts scanned series — "Coca-Cola ad 1923-09",
 * "Coca-Cola ad 1923-10" — and a stimulus set filled from one series gives the
 * student three variations of the same image. Stripping digits and punctuation
 * from the filename stem collapses a series to one key.
 */
function clusterKey(title) {
  return String(title || "")
    .replace(/^File:/, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase()
    .replace(/[\d._\-–—(),'"]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 4)
    .join(" ");
}

function candidateFrom(page) {
  const info = page?.imageinfo?.[0];
  if (!info) return null;
  const licence = licenceFor(info.extmetadata);
  return {
    title: page.title,
    displayTitle: titleFor(info.extmetadata, page.title),
    pageUrl: info.descriptionurl || `${COMMONS_PAGE}${encodeURIComponent(page.title)}`,
    width: info.width,
    height: info.height,
    mime: info.mime,
    url: info.url,
    thumbUrl: info.thumburl || null,
    thumbWidth: info.thumbwidth || null,
    thumbMime: info.thumbmime || null,
    licence,
    creator: creatorFor(info.extmetadata),
    date: dateFor(info.extmetadata),
    cluster: clusterKey(page.title),
  };
}

/**
 * Why a candidate cannot be used, or null when it can. Ordered so the returned
 * reason is the most informative one — a tiny non-free image reports its licence
 * problem, which is the one that will never be fixable.
 */
function rejectionReason(candidate, { excludeClusters }) {
  if (!candidate.licence.safe) return "licence";
  if (candidate.licence.restrictions) return "restricted";
  if (Math.max(candidate.width || 0, candidate.height || 0) < MIN_LONG_EDGE) return "too-small";
  if (!candidate.mime || !/^image\/(jpeg|png|gif|webp|tiff)$/.test(candidate.mime)) return "format";
  if (excludeClusters?.has(candidate.cluster)) return "duplicate";
  return null;
}

// Prefer bigger, and prefer an attributable creator — an image credited to a
// named artist or institution makes a better citation than "Unknown".
function scoreCandidate(candidate) {
  const pixels = (candidate.width || 0) * (candidate.height || 0);
  const attributable = /^unknown$/i.test(candidate.creator) ? 0 : 1;
  return attributable * 1e12 + pixels;
}

/**
 * Search queries to try, in order, for one planned visual.
 *
 * Commons ANDs every term, so a specific phrase can match nothing at all —
 * "abandoned house fog atmospheric" returns zero files while "abandoned house"
 * returns 180,000. Dropping trailing qualifiers turns a too-narrow brief into a
 * hit rather than an empty stimulus slot.
 *
 * The region-qualified query leads when a region was asked for, and the plain
 * one follows: Australian-specific visual texts are scarce on Commons, and an
 * international poster beats no poster.
 */
function queryVariants(terms, region) {
  const words = terms.split(/\s+/).filter(Boolean);
  const variants = [];
  if (region) variants.push({ query: `${region} ${terms}`, isRegional: true });
  variants.push({ query: terms, isRegional: false });
  for (let n = words.length - 1; n >= 2; n -= 1) {
    variants.push({ query: words.slice(0, n).join(" "), isRegional: false });
  }
  const seen = new Set();
  return variants.filter(({ query }) => {
    const key = query.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchCommons(query, { limit = SEARCH_LIMIT } = {}) {
  const res = await commonsFetch(
    apiUrl({
      action: "query",
      list: "search",
      srsearch: `${query} filetype:bitmap`,
      srnamespace: "6",
      srlimit: String(limit),
    }),
    { accept: "application/json" }
  );
  const data = await res.json();
  return (data?.query?.search || []).map((hit) => hit.title);
}

async function imageInfoFor(titles) {
  if (!titles.length) return [];
  const pages = [];
  // The API accepts 50 titles per call; searches are capped at 50 so this is a
  // single round trip in practice, but the loop keeps it correct if that grows.
  for (let i = 0; i < titles.length; i += 50) {
    const res = await commonsFetch(
      apiUrl({
        action: "query",
        prop: "imageinfo",
        titles: titles.slice(i, i + 50).join("|"),
        iiprop: "url|extmetadata|size|mime",
        iiurlwidth: String(TARGET_WIDTH),
        iiextmetadatafilter:
          "LicenseShortName|License|LicenseUrl|Artist|Credit|DateTimeOriginal|Restrictions|ObjectName",
      }),
      { accept: "application/json" }
    );
    const data = await res.json();
    pages.push(...Object.values(data?.query?.pages || {}));
  }
  return pages.map(candidateFrom).filter(Boolean);
}

/**
 * Download the chosen image and hand back bytes docx can embed.
 *
 * Two traps, both measured: Commons upscales, so a 1200px thumbnail of a small
 * original is mush and the full-size file must be used instead; and re-encoding
 * a photographic JPEG as PNG quadruples it (892KB -> 3.8MB), so formats docx
 * already accepts pass through untouched.
 */
async function downloadImage(candidate) {
  const upscaled = candidate.thumbWidth && candidate.thumbWidth > candidate.width;
  const url = !upscaled && candidate.thumbUrl ? candidate.thumbUrl : candidate.url;
  const mime = !upscaled && candidate.thumbUrl
    ? candidate.thumbMime || candidate.mime
    : candidate.mime;

  const res = await commonsFetch(url);
  const original = Buffer.from(await res.arrayBuffer());

  const embeddable = EMBEDDABLE.get(mime);
  if (embeddable) {
    const meta = await sharp(original).metadata();
    return { buffer: original, type: embeddable, width: meta.width, height: meta.height };
  }

  // webp and tiff are both served by Commons and neither is accepted by
  // ImageRun; sharp is already a dependency for maths diagrams.
  const converted = await sharp(original)
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .png()
    .toBuffer();
  const meta = await sharp(converted).metadata();
  return { buffer: converted, type: "png", width: meta.width, height: meta.height };
}

/**
 * Source one visual stimulus.
 *
 * `selection.searchTerms` is what the planner asked for. `selection.region`, when
 * present, is a locale preference rather than a requirement: Australian-specific
 * visual texts are genuinely scarce on Commons (single-digit hit counts for
 * several themes), so a region-qualified search that finds nothing usable falls
 * back to the same search without the region. An international poster is a
 * better resource than no poster.
 *
 * Returns the normalised sourcing shape used across this pipeline. `ok: false`
 * means "no verified image — carry on without one", never a placeholder.
 */
async function sourceCommonsImage({
  selection,
  excludeClusters = new Set(),
  search = searchCommons,
  info = imageInfoFor,
  download = downloadImage,
} = {}) {
  const terms = String(selection?.searchTerms || selection?.title || "").trim();
  if (!terms) {
    return { ok: false, source: "commons", reason: "no-search-terms", checks: {} };
  }

  const region = String(selection?.region || "").trim();
  const queries = queryVariants(terms, region);

  const checks = { queries: [], rejected: {} };
  let regionFallbackUsed = false;

  for (const { query, isRegional } of queries) {
    let candidates;
    try {
      const titles = await search(query);
      candidates = await info(titles);
    } catch (err) {
      checks.queries.push({ query, error: err.message });
      continue;
    }

    const usable = [];
    for (const candidate of candidates) {
      const reason = rejectionReason(candidate, { excludeClusters });
      if (reason) {
        checks.rejected[reason] = (checks.rejected[reason] || 0) + 1;
        continue;
      }
      usable.push(candidate);
    }
    checks.queries.push({ query, found: candidates.length, usable: usable.length });

    if (!usable.length) continue;
    if (region && !isRegional) regionFallbackUsed = true;

    const chosen = usable.sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0];
    let image;
    try {
      image = await download(chosen);
    } catch (err) {
      checks.downloadError = err.message;
      continue;
    }

    return {
      ok: true,
      source: "commons",
      sourceName: "Wikimedia Commons",
      sourceUrl: chosen.pageUrl,
      title: chosen.displayTitle,
      creator: chosen.creator,
      date: chosen.date,
      licence: chosen.licence.name,
      licenceUrl: chosen.licence.url,
      cluster: chosen.cluster,
      image,
      regionFallbackUsed,
      checks,
    };
  }

  return { ok: false, source: "commons", reason: "no-usable-candidate", checks };
}

module.exports = {
  COMMONS_API,
  MIN_LONG_EDGE,
  TARGET_WIDTH,
  clusterKey,
  queryVariants,
  titleFor,
  licenceFor,
  rejectionReason,
  scoreCandidate,
  searchCommons,
  imageInfoFor,
  downloadImage,
  sourceCommonsImage,
};
