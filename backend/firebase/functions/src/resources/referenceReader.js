"use strict";

// RES-122. Reads a tutor's reference file into text the generator can use.
//
// Text-based PDFs, DOCX and plain text are read locally, as before. Images,
// and PDF pages with no text layer (scans), are read by Claude: each page is
// rendered to an image and transcribed, with diagrams and tables described
// rather than dropped. Other Office files (PowerPoint, older Word and Excel,
// RTF, ODT, XLSX) are converted to PDF by the Gotenberg service and then read
// the same way; every slide goes to Claude, since slides are mostly visual. The file's real contents decide how it is read, not its
// name, and a file that is unsupported, damaged, password-protected or not
// what its name claims fails with a message the tutor can act on.

const crypto = require("crypto");
const path = require("path");
const { lazyRequire } = require("../shared/lazyRequire");
const { extractDocxText, normalizeExtractedText } = require("./fileExtractor");

const loadPdfParse = lazyRequire(() => require("pdf-parse"));
const loadSharp = lazyRequire(() => require("sharp"));
const loadHeicDecode = lazyRequire(() => require("heic-decode"));

// Limits shown to tutors in the upload panel (ResourceJobBuilder) and enforced
// by storage rules. Keep the three in step.
const MAX_REFERENCE_BYTES = 50 * 1024 * 1024;
const MAX_REFERENCE_PAGES = 100;
// An animated GIF is mostly near-identical frames; a spread of them is enough.
const MAX_GIF_FRAMES = 10;
// A PDF page with less text than this has no real text layer: it is a scan.
const SCANNED_PAGE_MIN_CHARS = 40;
// Claude reads images up to this long edge without resizing them itself.
const VISION_LONG_EDGE = 1568;
const VISION_PAGES_PER_CALL = 5;
const VISION_CONCURRENCY = 4;
const VISION_MAX_TOKENS = 32000;
// Bump when the reading changes, so cached reads made the old way are ignored.
const READER_VERSION = 1;
const CACHE_PREFIX = "resources/reference-reads";

// Office files go to the converter (Cloud Run), whose requests are capped at
// 32 MiB; a little is kept back for the form around the file.
const MAX_CONVERTED_BYTES = 30 * 1024 * 1024;

// For each extension: what it is called, and which real contents (sniffKind)
// it may hold. A .doc is often RTF or a DOCX saved under the old name.
const EXTENSION_RULES = Object.freeze({
  ".pdf": { label: "a PDF", accepts: ["pdf"] },
  ".docx": { label: "a Word document", accepts: ["docx"] },
  ".doc": { label: "a Word document", accepts: ["ole", "rtf", "docx"] },
  ".odt": { label: "an OpenDocument text file", accepts: ["odt"] },
  ".rtf": { label: "an RTF document", accepts: ["rtf"] },
  ".pptx": { label: "a PowerPoint file", accepts: ["pptx"], family: "slides" },
  ".ppsx": { label: "a PowerPoint file", accepts: ["pptx"], family: "slides" },
  ".ppt": { label: "a PowerPoint file", accepts: ["ole"], family: "slides" },
  ".pps": { label: "a PowerPoint file", accepts: ["ole"], family: "slides" },
  ".xlsx": { label: "an Excel file", accepts: ["xlsx"], family: "sheets" },
  ".xls": { label: "an Excel file", accepts: ["ole"], family: "sheets" },
  ".md": { label: "a text file", accepts: ["text"] },
  ".markdown": { label: "a text file", accepts: ["text"] },
  ".txt": { label: "a text file", accepts: ["text"] },
  ".csv": { label: "a CSV file", accepts: ["text"] },
  ".json": { label: "a text file", accepts: ["text"] },
  ".jpg": { label: "an image", accepts: ["image"] },
  ".jpeg": { label: "an image", accepts: ["image"] },
  ".png": { label: "an image", accepts: ["image"] },
  ".heic": { label: "an image", accepts: ["image"] },
  ".heif": { label: "an image", accepts: ["image"] },
  ".webp": { label: "an image", accepts: ["image"] },
  ".gif": { label: "an image", accepts: ["image"] },
  ".bmp": { label: "an image", accepts: ["image"] },
  ".tif": { label: "an image", accepts: ["image"] },
  ".tiff": { label: "an image", accepts: ["image"] },
});
const SUPPORTED_EXTENSIONS = Object.freeze(Object.keys(EXTENSION_RULES));
// Real contents read by converting to PDF first.
const CONVERTED_KINDS = new Set(["ole", "rtf", "pptx", "xlsx", "odt"]);
// Office files that are always encrypted when they arrive as a Compound File.
const OOXML_EXTENSIONS = new Set([".docx", ".pptx", ".ppsx", ".xlsx"]);

const KIND_LABELS = Object.freeze({
  pdf: "a PDF",
  docx: "a Word document",
  text: "a text file",
  image: "an image",
  zip: "a ZIP archive",
  pptx: "a PowerPoint file",
  xlsx: "an Excel file",
  odt: "an OpenDocument text file",
  odf: "an OpenDocument file",
  ole: "an older Office file",
  rtf: "an RTF document",
  unknown: "a file type we don't recognise",
});

class ReferenceFileError extends Error {
  constructor(code, tutorMessage, detail = null) {
    super(tutorMessage);
    this.name = "ReferenceFileError";
    this.code = code;
    this.tutorMessage = tutorMessage;
    this.detail = detail;
    // Not a model fault: never offered to the backup model.
    this.resourceInfrastructure = "upload";
  }
}

function startsWith(buffer, bytes, offset = 0) {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, i) => buffer[offset + i] === byte);
}

function ascii(buffer, start, end) {
  return buffer.subarray(start, Math.min(end, buffer.length)).toString("latin1");
}

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

// Names inside a ZIP, from its central directory at the end of the file
// (local headers can't be walked when sizes follow the data, as Office and
// LibreOffice write them). Enough to tell DOCX, PPTX and XLSX apart without
// unpacking anything.
function zipEntryNames(buffer, limit = 2000) {
  const names = [];
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 22 - 65535); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) return names;
  const count = Math.min(buffer.readUInt16LE(eocd + 10), limit);
  let cursor = buffer.readUInt32LE(eocd + 16);
  for (let i = 0; i < count && cursor + 46 <= buffer.length; i += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) break;
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    names.push(buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8"));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

function isUtf8Text(buffer) {
  const sample = buffer.subarray(0, 64 * 1024);
  if (sample.includes(0)) return false;
  try {
    // Streaming mode holds back a character the sample cut through instead of
    // calling it invalid; a whole file is decoded to the end.
    new TextDecoder("utf-8", { fatal: true }).decode(sample, { stream: sample.length < buffer.length });
    return true;
  } catch {
    return false;
  }
}

/** What a file really is, from its first bytes. */
function sniffKind(buffer) {
  if (!buffer.length) return "empty";
  if (ascii(buffer, 0, 1024).includes("%PDF-")) return "pdf";
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47])) return "image";
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return "image";
  if (ascii(buffer, 0, 6) === "GIF87a" || ascii(buffer, 0, 6) === "GIF89a") return "image";
  if (ascii(buffer, 0, 4) === "RIFF" && ascii(buffer, 8, 12) === "WEBP") return "image";
  if (ascii(buffer, 0, 2) === "BM" && buffer.length > 26) return "image";
  if (startsWith(buffer, [0x49, 0x49, 0x2a, 0x00]) || startsWith(buffer, [0x4d, 0x4d, 0x00, 0x2a])) return "image";
  if (ascii(buffer, 4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(buffer, 8, 12))) return "image";
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    // OpenDocument stores its type, uncompressed, as the first entry.
    if (ascii(buffer, 30, 38) === "mimetype") {
      const type = ascii(buffer, 38, 38 + 60);
      return type.startsWith("application/vnd.oasis.opendocument.text") ? "odt" : "odf";
    }
    const names = zipEntryNames(buffer);
    if (names.some((n) => n.startsWith("word/"))) return "docx";
    if (names.some((n) => n.startsWith("ppt/"))) return "pptx";
    if (names.some((n) => n.startsWith("xl/"))) return "xlsx";
    if (names.includes("[Content_Types].xml")) return "docx";
    return "zip";
  }
  // Compound File: legacy DOC/XLS/PPT, and also any password-protected
  // DOCX/PPTX/XLSX, which Office wraps in one.
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole";
  if (ascii(buffer, 0, 5) === "{\\rtf") return "rtf";
  if (isUtf8Text(buffer)) return "text";
  return "unknown";
}

function extensionOf(fileName) {
  return path.extname(String(fileName || "")).toLowerCase();
}

function supportedFormatsLine() {
  return "PDF, Word (DOCX, DOC, ODT, RTF), PowerPoint (PPTX, PPT, PPSX, PPS), Excel (XLSX, XLS, CSV), text, Markdown, and images (JPG, PNG, HEIC, WebP, GIF, BMP, TIFF)";
}

/**
 * Decide how to read a file, or throw a ReferenceFileError saying why it
 * can't be. Returns { kind, family }: `kind` is what the file really holds and
 * decides how it is read; `family` ("slides" or "sheets") changes how its pages
 * are counted and read. A file whose contents its name doesn't allow is
 * refused, except that any image is read by its real format (a HEIC photo
 * saved as .jpg is still a photo).
 */
function classifyReference(buffer, fileName) {
  const name = String(fileName || "reference file");
  if (buffer.length > MAX_REFERENCE_BYTES) {
    throw new ReferenceFileError(
      "REFERENCE_TOO_LARGE",
      `“${name}” is ${Math.ceil(buffer.length / (1024 * 1024))} MB. Reference files can be up to ${MAX_REFERENCE_BYTES / (1024 * 1024)} MB.`
    );
  }
  const sniffed = sniffKind(buffer);
  if (sniffed === "empty") {
    throw new ReferenceFileError("REFERENCE_EMPTY", `“${name}” is empty. Re-upload it.`);
  }
  const extension = extensionOf(name);
  const rule = EXTENSION_RULES[extension] || null;

  if (sniffed === "ole" && OOXML_EXTENSIONS.has(extension)) {
    throw new ReferenceFileError(
      "REFERENCE_ENCRYPTED",
      `“${name}” is password-protected. Remove the password, save it again and re-upload it.`
    );
  }
  if (!rule) {
    const readable = ["pdf", "docx", "text", "image"].includes(sniffed) || CONVERTED_KINDS.has(sniffed);
    if (extension || !readable) {
      throw new ReferenceFileError(
        "REFERENCE_UNSUPPORTED",
        `“${name}” isn't a supported file type. Use ${supportedFormatsLine()}.`
      );
    }
    // No extension at all: go by the contents.
    return { kind: sniffed, family: sniffed === "pptx" ? "slides" : sniffed === "xlsx" ? "sheets" : null };
  }
  if (!rule.accepts.includes(sniffed)) {
    throw new ReferenceFileError(
      "REFERENCE_TYPE_MISMATCH",
      `“${name}” is named as ${rule.label} but its contents are ${KIND_LABELS[sniffed] || KIND_LABELS.unknown}. Save it in the right format and re-upload it.`
    );
  }
  if (CONVERTED_KINDS.has(sniffed) && buffer.length > MAX_CONVERTED_BYTES) {
    throw new ReferenceFileError(
      "REFERENCE_TOO_LARGE",
      `“${name}” is ${Math.ceil(buffer.length / (1024 * 1024))} MB. Office files can be up to ${MAX_CONVERTED_BYTES / (1024 * 1024)} MB: save a larger one as a PDF and upload that instead.`
    );
  }
  return { kind: sniffed, family: rule.family || null };
}

function unreadable(name, detail) {
  return new ReferenceFileError(
    "REFERENCE_UNREADABLE",
    `“${name}” couldn't be opened. It may be damaged: save or export it again and re-upload it.`,
    detail
  );
}

// ---- Images ---------------------------------------------------------------

async function toVisionJpeg(input, sharpOptions = {}) {
  return loadSharp()(input, { failOn: "error", limitInputPixels: 268_402_689, ...sharpOptions })
    .rotate()
    .resize({ width: VISION_LONG_EDGE, height: VISION_LONG_EDGE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 85 })
    .toBuffer();
}

function isHeif(buffer) {
  return ascii(buffer, 4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(buffer, 8, 12));
}

// Evenly spread `count` indexes over `total`, first and last included.
function spread(total, count) {
  if (total <= count) return Array.from({ length: total }, (_, i) => i);
  return Array.from({ length: count }, (_, i) => Math.round((i * (total - 1)) / (count - 1)));
}

const MAX_BMP_PIXELS = 100_000_000;

// Sharp's prebuilt binaries can't read BMP either. Uncompressed BMPs (1, 4 and
// 8-bit palette, 24 and 32-bit), which is what scanners and Paint save, are
// decoded here to RGB; anything else is refused as unreadable.
function decodeBmp(buffer) {
  const fail = (why) => { throw new Error(`Unsupported BMP: ${why}`); };
  if (buffer.length < 54) fail("too short");
  const dataOffset = buffer.readUInt32LE(10);
  const headerSize = buffer.readUInt32LE(14);
  if (headerSize < 40) fail("old header");
  const width = buffer.readInt32LE(18);
  const rawHeight = buffer.readInt32LE(22);
  const bits = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);
  const height = Math.abs(rawHeight);
  const topDown = rawHeight < 0;
  if (width <= 0 || height <= 0 || width * height > MAX_BMP_PIXELS) fail("bad size");
  if (!(compression === 0 || (compression === 3 && bits === 32))) fail(`compression ${compression}`);
  if (![1, 4, 8, 24, 32].includes(bits)) fail(`${bits}-bit`);
  let palette = null;
  if (bits <= 8) {
    const colours = buffer.readUInt32LE(46) || 2 ** bits;
    const start = 14 + headerSize;
    if (start + colours * 4 > buffer.length) fail("palette");
    palette = Array.from({ length: colours }, (_, i) => [buffer[start + i * 4 + 2], buffer[start + i * 4 + 1], buffer[start + i * 4]]);
  }
  const rowSize = Math.ceil((bits * width) / 32) * 4;
  if (dataOffset + rowSize * height > buffer.length) fail("truncated");
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    const row = dataOffset + (topDown ? y : height - 1 - y) * rowSize;
    for (let x = 0; x < width; x += 1) {
      const out = (y * width + x) * 3;
      if (bits === 24 || bits === 32) {
        const at = row + x * (bits / 8);
        rgb[out] = buffer[at + 2]; rgb[out + 1] = buffer[at + 1]; rgb[out + 2] = buffer[at];
      } else {
        const bitOffset = x * bits;
        const byte = buffer[row + (bitOffset >> 3)];
        const index = (byte >> (8 - bits - (bitOffset & 7))) & ((1 << bits) - 1);
        const colour = palette[index] || [0, 0, 0];
        rgb[out] = colour[0]; rgb[out + 1] = colour[1]; rgb[out + 2] = colour[2];
      }
    }
  }
  return { data: rgb, width, height };
}

/** The pages of an image file as vision-ready JPEGs, with what was skipped. */
async function imagePages(buffer, name) {
  try {
    if (ascii(buffer, 0, 2) === "BM") {
      const bmp = decodeBmp(buffer);
      const jpeg = await toVisionJpeg(bmp.data, { raw: { width: bmp.width, height: bmp.height, channels: 3 } });
      return { pages: [{ page: 1, image: jpeg }], totalPages: 1, skipped: 0 };
    }
    if (isHeif(buffer)) {
      // Sharp's prebuilt binaries can't decode HEVC, so HEIC goes through libheif.
      const decoded = await loadHeicDecode()({ buffer });
      const jpeg = await toVisionJpeg(Buffer.from(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength), {
        raw: { width: decoded.width, height: decoded.height, channels: 4 },
      });
      return { pages: [{ page: 1, image: jpeg }], totalPages: 1, skipped: 0 };
    }
    const meta = await loadSharp()(buffer, { failOn: "error" }).metadata();
    const total = Math.max(1, Number(meta.pages) || 1);
    const isGif = meta.format === "gif";
    const indexes = isGif ? spread(total, MAX_GIF_FRAMES) : spread(Math.min(total, MAX_REFERENCE_PAGES), Math.min(total, MAX_REFERENCE_PAGES));
    const pages = [];
    for (const index of indexes) {
      pages.push({ page: index + 1, image: await toVisionJpeg(buffer, total > 1 ? { page: index } : {}) });
    }
    return { pages, totalPages: total, skipped: total - indexes.length, gif: isGif };
  } catch (err) {
    if (err instanceof ReferenceFileError) throw err;
    throw unreadable(name, err?.message);
  }
}

// ---- PDFs -----------------------------------------------------------------

function isPasswordError(err) {
  return err?.name === "PasswordException" || /password/i.test(String(err?.message || ""));
}

async function readPdfText(buffer, name) {
  const { PDFParse } = loadPdfParse();
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ first: MAX_REFERENCE_PAGES });
    return { parser, result };
  } catch (err) {
    await parser.destroy().catch(() => {});
    if (isPasswordError(err)) {
      throw new ReferenceFileError(
        "REFERENCE_ENCRYPTED",
        `“${name}” is password-protected. Remove the password, save it again and re-upload it.`
      );
    }
    throw unreadable(name, err?.message);
  }
}

async function renderPdfPages(parser, pageNumbers) {
  const rendered = [];
  // A handful at a time: each page is a full-resolution bitmap in memory.
  for (let i = 0; i < pageNumbers.length; i += 5) {
    const batch = pageNumbers.slice(i, i + 5);
    const shot = await parser.getScreenshot({ partial: batch, desiredWidth: VISION_LONG_EDGE * 1.5, imageBuffer: true, imageDataUrl: false });
    for (const page of shot.pages || []) {
      rendered.push({ page: page.pageNumber, image: await toVisionJpeg(Buffer.from(page.data)) });
    }
  }
  return rendered;
}

// ---- Vision ---------------------------------------------------------------

const VISION_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["pages"],
  properties: {
    pages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["page", "text", "legibility"],
        properties: {
          page: { type: "integer" },
          text: { type: "string" },
          legibility: { type: "string", enum: ["full", "partial", "none"] },
        },
      },
    },
  },
});

function visionSystemPrompt() {
  return `You transcribe pages of a tutor's reference material (past papers, worksheets, textbook pages, notes, photos of a whiteboard) so another model can write a new resource from them.

For each page:
- Transcribe every piece of readable text, in reading order, exactly as written. Keep question numbers, part labels, marks and units.
- Write maths in LaTeX between $ signs, e.g. $\\frac{3}{4}x^2$.
- Write tables as Markdown tables.
- Describe each diagram, graph, chart or picture in square brackets, with every label, value and axis it shows, e.g. [Diagram: right-angled triangle, legs 3 cm and 4 cm, hypotenuse x].
- Where something can't be read, write [illegible] in its place. Never guess or fill in missing words.
- Set legibility to "full" when everything was readable, "partial" when some of it wasn't, "none" when nothing on the page could be read.

Return one entry per page, using the page numbers given.`;
}

async function transcribePages({ pages, fileName, callAi, model, signal }) {
  const results = new Map();
  const batches = [];
  for (let i = 0; i < pages.length; i += VISION_PAGES_PER_CALL) batches.push(pages.slice(i, i + VISION_PAGES_PER_CALL));
  const readBatch = async (batch) => {
    const content = [];
    for (const { page, image } of batch) {
      content.push({ type: "text", text: `Page ${page}:` });
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: image.toString("base64") } });
    }
    content.push({ type: "text", text: `File: ${fileName}\nTranscribe pages ${batch.map((p) => p.page).join(", ")}.` });
    const result = await callAi({
      model,
      maxTokens: VISION_MAX_TOKENS,
      thinkingDisabled: true,
      mathBearing: false,
      systemPrompt: visionSystemPrompt(),
      messages: [{ role: "user", content }],
      responseSchema: VISION_SCHEMA,
      signal,
      stageId: "references.read",
      stageLabel: "Reading your reference files",
      progressPhase: "plan",
      concurrent: true,
    });
    for (const entry of Array.isArray(result?.parsed?.pages) ? result.parsed.pages : []) {
      const page = Number(entry?.page);
      if (batch.some((p) => p.page === page)) {
        results.set(page, {
          text: normalizeExtractedText(entry.text),
          legibility: ["full", "partial", "none"].includes(entry.legibility) ? entry.legibility : "partial",
        });
      }
    }
  };
  // A few calls at once, so a 100-page scan takes minutes, not ten.
  let next = 0;
  const worker = async () => {
    while (next < batches.length) await readBatch(batches[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(VISION_CONCURRENCY, batches.length) }, worker));
  // A page the model left out counts as unread, never as blank.
  return pages.map(({ page }) => ({ page, ...(results.get(page) || { text: "", legibility: "none" }) }));
}

function pageList(numbers) {
  return numbers.length > 8 ? `${numbers.slice(0, 8).join(", ")} and ${numbers.length - 8} more` : numbers.join(", ");
}

function legibilityWarnings(fileName, transcribed, unit = "page") {
  const warnings = [];
  const none = transcribed.filter((p) => p.legibility === "none").map((p) => p.page);
  const partial = transcribed.filter((p) => p.legibility === "partial").map((p) => p.page);
  if (none.length) {
    warnings.push({
      code: "REFERENCE_PARTLY_READ",
      fileName,
      message: `Nothing could be read on ${unit} ${pageList(none)} of “${fileName}”, so the resource was made without it.`,
    });
  }
  if (partial.length) {
    warnings.push({
      code: "REFERENCE_PARTLY_READ",
      fileName,
      message: `Parts of ${unit} ${pageList(partial)} of “${fileName}” couldn't be read clearly. Check the resource against the original.`,
    });
  }
  return warnings;
}

function requireVision({ callAi, model, fileName, what }) {
  if (typeof callAi === "function" && model) return;
  throw new ReferenceFileError(
    "REFERENCE_VISION_UNAVAILABLE",
    `“${fileName}” is ${what}, and reading those isn't available right now. Upload a text-based PDF or Word document, or try again later.`
  );
}

// ---- Cache ----------------------------------------------------------------

function cachePath(buffer) {
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  return `${CACHE_PREFIX}/${hash}-v${READER_VERSION}.json`;
}

async function readCache(bucket, key) {
  if (!bucket) return null;
  try {
    const [data] = await bucket.file(key).download();
    const parsed = JSON.parse(data.toString("utf8"));
    return typeof parsed?.content === "string" ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCache(bucket, key, value) {
  if (!bucket) return;
  try {
    await bucket.file(key).save(JSON.stringify(value), { contentType: "application/json", resumable: false });
  } catch {
    // A missed cache write only costs a second read.
  }
}

// The cached warnings name the file it was first read as; a later upload of
// the same bytes may have another name.
function renameWarnings(warnings, fromName, toName) {
  if (fromName === toName) return warnings;
  return warnings.map((w) => ({ ...w, fileName: toName, message: String(w.message).split(`“${fromName}”`).join(`“${toName}”`) }));
}

// ---- Office conversion ----------------------------------------------------

const UNIT = Object.freeze({ slides: ["slide", "Slide", "slides"], sheets: ["sheet", "Sheet", "sheets"], pages: ["page", "Page", "pages"] });

async function convertOfficeFile(buffer, name, family, convertToPdf) {
  if (typeof convertToPdf !== "function") {
    throw new ReferenceFileError(
      "REFERENCE_CONVERTER_UNAVAILABLE",
      `“${name}” can't be read right now. Save it as a PDF and upload that instead.`
    );
  }
  try {
    // Each sheet as one page, so a wide sheet isn't cut into strips and the
    // page limit counts sheets.
    return await convertToPdf({ buffer, fileName: name, singlePageSheets: family === "sheets" });
  } catch (err) {
    const message = String(err?.message || "");
    if (/password|encrypt/i.test(message)) {
      throw new ReferenceFileError(
        "REFERENCE_ENCRYPTED",
        `“${name}” is password-protected. Remove the password, save it again and re-upload it.`
      );
    }
    // The converter refusing the file means the file; anything else (a
    // timeout, a cold start, a 5xx) is worth a retry.
    if (/responded 4\d\d/.test(message)) throw unreadable(name, message);
    throw Object.assign(new ReferenceFileError(
      "REFERENCE_CONVERTER_UNAVAILABLE",
      `“${name}” couldn't be converted just now. Press Retry, or save it as a PDF and upload that instead.`,
      message
    ), { resourceInfrastructure: "converter" });
  }
}

// ---- PDFs (uploaded or converted) -------------------------------------------

async function readPdfReference(buffer, name, { callAi, model, signal, bucket, key, family = null, converted = false }) {
  const [unit, Unit, units] = UNIT[family] || UNIT.pages;
  const { parser, result } = await readPdfText(buffer, name);
  try {
    const totalPages = Number(result?.total) || (result?.pages || []).length;
    const parsedPages = (result?.pages || []).map((p) => ({ page: Number(p.num), text: normalizeExtractedText(p.text) }));
    // Slides are read as pictures: their diagrams, charts and layout carry as
    // much as their words. Other pages only when they have no text layer.
    const toRead = family === "slides"
      ? parsedPages.map((p) => p.page)
      : parsedPages.filter((p) => p.text.replace(/\s+/g, "").length < SCANNED_PAGE_MIN_CHARS).map((p) => p.page);
    const limitWarning = totalPages > MAX_REFERENCE_PAGES
      ? [{ code: "REFERENCE_PAGE_LIMIT", fileName: name, message: `“${name}” has ${totalPages} ${units}; only the first ${MAX_REFERENCE_PAGES} were read.` }]
      : [];
    const labelled = (texts) => normalizeExtractedText(parsedPages
      .map((p) => (texts.get(p.page) ? `[${Unit} ${p.page}]\n${texts.get(p.page)}` : ""))
      .filter(Boolean)
      .join("\n\n"));
    const localText = () => (converted || family
      ? labelled(new Map(parsedPages.map((p) => [p.page, p.text])))
      : normalizeExtractedText(result?.text));
    const noContent = () => new ReferenceFileError("REFERENCE_NO_CONTENT", `Nothing could be read in “${name}”. Check it's the right file, or upload a clearer scan.`);

    // A text PDF reads exactly as it always has.
    if (!toRead.length) {
      const content = localText();
      if (!content) throw noContent();
      const value = { content, warnings: limitWarning, fileName: name };
      if (converted) await writeCache(bucket, key, value);
      return { content, warnings: limitWarning, visionPages: 0 };
    }

    if (typeof callAi !== "function" || !model) {
      const unreadPages = toRead.filter((page) => !parsedPages.find((p) => p.page === page)?.text);
      if (unreadPages.length === parsedPages.length) {
        requireVision({ callAi, model, fileName: name, what: family === "slides" ? "a presentation made of pictures" : "a scanned PDF" });
      }
      const content = localText();
      const warning = family === "slides"
        ? `Pictures and diagrams on the slides of “${name}” couldn't be read, only their text.`
        : `Scanned ${unit} ${pageList(unreadPages)} of “${name}” couldn't be read, so the resource was made from its other ${units}.`;
      return { content, warnings: [...limitWarning, { code: "REFERENCE_PARTLY_READ", fileName: name, message: warning }], visionPages: 0 };
    }

    let rendered;
    try {
      rendered = await renderPdfPages(parser, toRead);
    } catch (err) {
      throw unreadable(name, err?.message);
    }
    const transcribed = await transcribePages({ pages: rendered, fileName: name, callAi, model, signal });
    const texts = new Map(parsedPages.map((p) => [p.page, p.text]));
    for (const page of transcribed) {
      // An unreadable picture of a slide still has the slide's own text.
      if (page.text || family !== "slides") texts.set(page.page, page.text);
    }
    const content = labelled(texts);
    if (!content) throw noContent();
    const legibility = family === "slides"
      ? transcribed.map((p) => (p.legibility === "none" && texts.get(p.page) ? { ...p, legibility: "partial" } : p))
      : transcribed;
    const warnings = [...limitWarning, ...legibilityWarnings(name, legibility, unit)];
    await writeCache(bucket, key, { content, warnings, fileName: name });
    return { content, warnings, visionPages: rendered.length };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

// ---- Entry point ----------------------------------------------------------

/**
 * Read one reference file. Returns { content, warnings, kind, visionPages }.
 * `callAi` and `model` are needed only for images, slides and scanned pages,
 * and `convertToPdf` only for Office files other than DOCX. `bucket` caches
 * what was converted or read by Claude, by file contents, so a resumed or
 * repeated job doesn't pay for the same file twice.
 */
async function readReferenceFile(buffer, { fileName } = {}, { callAi = null, model = null, signal = null, bucket = null, convertToPdf = null } = {}) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError("readReferenceFile requires a Buffer");
  const name = String(fileName || "reference file");
  const { kind, family } = classifyReference(buffer, name);

  if (kind === "text") {
    const content = normalizeExtractedText(buffer.toString("utf8"));
    if (!content) throw new ReferenceFileError("REFERENCE_EMPTY", `“${name}” has no text in it. Check it's the right file.`);
    return { content, warnings: [], kind, visionPages: 0 };
  }

  if (kind === "docx") {
    let content;
    try {
      content = normalizeExtractedText(await extractDocxText(buffer));
    } catch (err) {
      throw unreadable(name, err?.message);
    }
    if (!content) throw new ReferenceFileError("REFERENCE_EMPTY", `“${name}” has no text in it. If it's a scan pasted into Word, upload the scan as a PDF or image instead.`);
    return { content, warnings: [], kind, visionPages: 0 };
  }

  const key = cachePath(buffer);
  const cachedResult = async () => {
    const cached = await readCache(bucket, key);
    return cached ? { content: cached.content, warnings: renameWarnings(cached.warnings || [], cached.fileName, name), kind, visionPages: 0 } : null;
  };

  if (kind === "image") {
    requireVision({ callAi, model, fileName: name, what: "an image" });
    const cached = await cachedResult();
    if (cached) return cached;
    const { pages, totalPages, skipped, gif } = await imagePages(buffer, name);
    const transcribed = await transcribePages({ pages, fileName: name, callAi, model, signal });
    const multi = totalPages > 1;
    const content = normalizeExtractedText(transcribed
      .filter((p) => p.text)
      .map((p) => (multi ? `[${gif ? "Frame" : "Page"} ${p.page}]\n${p.text}` : p.text))
      .join("\n\n"));
    const unit = gif ? "frame" : "page";
    const warnings = multi ? legibilityWarnings(name, transcribed, unit) : [];
    if (!multi && transcribed[0]?.legibility === "partial") {
      warnings.push({ code: "REFERENCE_PARTLY_READ", fileName: name, message: `Parts of “${name}” couldn't be read clearly. Check the resource against the original.` });
    }
    if (skipped > 0) {
      warnings.push({
        code: "REFERENCE_PAGE_LIMIT",
        fileName: name,
        message: gif
          ? `“${name}” has ${totalPages} frames; ${pages.length} spread through it were read.`
          : `“${name}” has ${totalPages} pages; only the first ${MAX_REFERENCE_PAGES} were read.`,
      });
    }
    if (!content) {
      throw new ReferenceFileError("REFERENCE_NO_CONTENT", `Nothing could be read in “${name}”. Upload a clearer photo or scan.`);
    }
    await writeCache(bucket, key, { content, warnings, fileName: name });
    return { content, warnings, kind, visionPages: pages.length };
  }

  if (CONVERTED_KINDS.has(kind)) {
    const cached = await cachedResult();
    if (cached) return cached;
    const pdf = await convertOfficeFile(buffer, name, family, convertToPdf);
    const read = await readPdfReference(pdf, name, { callAi, model, signal, bucket, key, family, converted: true });
    return { ...read, kind };
  }

  // An uploaded PDF. A text PDF is cheap to read again, so only what Claude
  // read is cached.
  const cached = await cachedResult();
  if (cached) return cached;
  const read = await readPdfReference(buffer, name, { callAi, model, signal, bucket, key });
  return { ...read, kind };
}

module.exports = {
  EXTENSION_RULES,
  MAX_CONVERTED_BYTES,
  MAX_GIF_FRAMES,
  MAX_REFERENCE_BYTES,
  MAX_REFERENCE_PAGES,
  READER_VERSION,
  ReferenceFileError,
  SUPPORTED_EXTENSIONS,
  VISION_SCHEMA,
  classifyReference,
  readReferenceFile,
  sniffKind,
  visionSystemPrompt,
};
