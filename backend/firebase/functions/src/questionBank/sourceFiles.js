"use strict";

// RES-57. Each source as a PDF: PDFs are downloaded as they are, Google Docs
// and Slides are exported by Drive, and Word and PowerPoint files are converted
// with LibreOffice.

const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const { GOOGLE_DOCUMENT_MIME_TYPES, extensionOf } = require("./sourceRules");

const CONVERT_TIMEOUT_MS = 120 * 1000;

// Runs headless LibreOffice with its own profile, so it neither collides with
// a LibreOffice window the operator has open nor with a parallel conversion.
async function convertWithLibreOffice(buffer, name, { run = promisify(execFile), soffice = "soffice" } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "question-bank-convert-"));
  try {
    const input = path.join(dir, `source.${extensionOf(name) || "docx"}`);
    await fs.writeFile(input, buffer);
    await run(soffice, [
      `-env:UserInstallation=file://${path.join(dir, "profile")}`,
      "--headless", "--convert-to", "pdf", "--outdir", dir, input,
    ], { timeout: CONVERT_TIMEOUT_MS });
    const output = path.join(dir, "source.pdf");
    return await fs.readFile(output).catch(() => {
      throw new Error(`LibreOffice could not convert ${name}`);
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const SHORTCUT_MIME_TYPE = "application/vnd.google-apps.shortcut";

async function fetchSourcePdf({ drive, source, convert = convertWithLibreOffice }) {
  // A Drive shortcut has no content of its own; fetch the file it points to
  // (RES-58: "Advanced Year 11/12 NSM.pdf" was one).
  if (source.mimeType === SHORTCUT_MIME_TYPE) {
    const file = await drive.getFile(source.id);
    const target = file.shortcutDetails;
    if (!target?.targetId) throw new Error(`Shortcut ${source.name} has no target`);
    return fetchSourcePdf({ drive, source: { ...source, id: target.targetId, mimeType: target.targetMimeType }, convert });
  }
  if (GOOGLE_DOCUMENT_MIME_TYPES.has(source.mimeType)) return drive.exportPdf(source.id);
  const buffer = await drive.download(source.id);
  if (extensionOf(source.name) === "pdf") return buffer;
  return convert(buffer, source.name);
}

module.exports = { SHORTCUT_MIME_TYPE, convertWithLibreOffice, fetchSourcePdf };
