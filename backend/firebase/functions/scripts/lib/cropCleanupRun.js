"use strict";

// RES-107. The parts of the crop clean-up shared by the test script
// (questionBankCropCleanupTest.js) and the bank-wide run
// (questionBankCropCleanup.js): the model client and its billing, the slide
// re-render, and cleaning one crop from its classify report.

const { execFile } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const sharp = require("sharp");

const {
  backgroundLeft,
  cropMetrics,
  eraseStrayItems,
  greyscaleCrop,
  greyscaleSlide,
  planCleanup,
  removePageTint,
  setSlideBackground,
} = require("../../src/questionBank/cropCleanup");

const PRODUCTION_PROJECT = "tenacity-tutoring-b8eb2";
const SLIDE_EXTENSIONS = new Set(["pps", "ppt", "pptx"]);
const RENDER_TIMEOUT_MS = 180 * 1000;
// Share of a crop that has to be coloured for it to need greying.
const HAS_COLOUR_SHARE = 0.001;
const run = promisify(execFile);

const extensionOfPath = (sourcePath) => (sourcePath || "").split(".").pop().toLowerCase();

async function mapWithConcurrency(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await fn(items[index], index);
    }
  }));
}

function firebase(projectId) {
  const admin = require("firebase-admin");
  const { adminAppOptions } = require("./questionBankAuth");
  if (!admin.apps.length) admin.initializeApp(adminAppOptions({ projectId, storageBucket: `${projectId}.firebasestorage.app` }));
  return { admin, db: admin.firestore(), bucket: admin.storage().bucket() };
}

async function anthropicClient({ firebaseSecrets }) {
  const { loadApiKeys } = require("./questionBankAuth");
  const { loadFirebaseSecrets, loadLocalSecrets } = require("../liveResourceSmoke");
  const keys = loadLocalSecrets().values;
  if (!keys.ANTHROPIC_API_KEY && firebaseSecrets) Object.assign(keys, await loadApiKeys(["ANTHROPIC_API_KEY"], { loadFirebaseSecrets }));
  if (!keys.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is missing; set it locally or pass --firebase-secrets");
  return new (require("@anthropic-ai/sdk").default)({ apiKey: keys.ANTHROPIC_API_KEY });
}

function usageOf(message) {
  const usage = message.usage || {};
  return {
    inputTokens: usage.input_tokens || 0,
    cachedInputTokens: usage.cache_read_input_tokens || 0,
    cacheWriteTokens: usage.cache_creation_input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
  };
}

async function soffice(args, dir) {
  await run("soffice", [`-env:UserInstallation=file://${path.join(dir, "profile")}`, "--headless", ...args], { timeout: RENDER_TIMEOUT_MS });
}

/**
 * The source deck as two PDFs, one with every slide on white and one on black:
 * PowerPoint to PPTX, swap the backgrounds in its XML, PPTX to PDF.
 */
async function slidesOnPlainBackgrounds(buffer, extension) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "qb-slides-"));
  try {
    const input = path.join(dir, `source.${extension}`);
    await fsp.writeFile(input, buffer);
    await soffice(["--convert-to", "pptx", "--outdir", path.join(dir, "pptx"), input], dir);
    const render = async (name, hexColour) => {
      const unpacked = path.join(dir, `unpacked-${name}`);
      await run("unzip", ["-q", "-o", path.join(dir, "pptx", "source.pptx"), "-d", unpacked]);
      for (const part of ["slides", "slideLayouts", "slideMasters"]) {
        const folder = path.join(unpacked, "ppt", part);
        for (const file of fs.existsSync(folder) ? await fsp.readdir(folder) : []) {
          if (!file.endsWith(".xml")) continue;
          const xmlPath = path.join(folder, file);
          await fsp.writeFile(xmlPath, setSlideBackground(await fsp.readFile(xmlPath, "utf8"), hexColour, { isMaster: part === "slideMasters" }));
        }
      }
      const deck = path.join(dir, `${name}.pptx`);
      await run("zip", ["-q", "-X", "-r", deck, "."], { cwd: unpacked });
      await soffice(["--convert-to", "pdf", "--outdir", path.join(dir, "pdf"), deck], dir);
      return fsp.readFile(path.join(dir, "pdf", `${name}.pdf`));
    };
    return { white: await render("white", "FFFFFF"), black: await render("black", "000000") };
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

/**
 * Slide pages rendered on white and on black, from Drive, with both PDFs kept
 * in sourcesDir so a rerun skips LibreOffice. closeSource frees one deck once
 * its crops are done, so a bank-wide run does not hold every deck open.
 */
function slideSources(sourcesDir) {
  const { createDriveClient, createImpersonatedTokenProvider } = require("../../src/questionBank/driveSource");
  const { openPdf } = require("../../src/questionBank/pages");
  const drive = createDriveClient({ getAccessToken: createImpersonatedTokenProvider() });
  fs.mkdirSync(sourcesDir, { recursive: true });
  const sources = new Map();
  const open = (crop) => {
    if (!sources.has(crop.sourceId)) {
      sources.set(crop.sourceId, (async () => {
        const base = path.join(sourcesDir, crop.sourceId);
        if (!fs.existsSync(`${base}.white.pdf`) || !fs.existsSync(`${base}.black.pdf`)) {
          const { white, black } = await slidesOnPlainBackgrounds(await drive.download(crop.sourceId), extensionOfPath(crop.sourcePath));
          fs.writeFileSync(`${base}.white.pdf`, white);
          fs.writeFileSync(`${base}.black.pdf`, black);
        }
        return { white: await openPdf(fs.readFileSync(`${base}.white.pdf`)), black: await openPdf(fs.readFileSync(`${base}.black.pdf`)) };
      })());
    }
    return sources.get(crop.sourceId);
  };
  const closeSource = async (sourceId) => {
    const source = sources.get(sourceId);
    if (!source) return;
    sources.delete(sourceId);
    const { white, black } = await source.catch(() => ({}));
    await white?.close();
    await black?.close();
  };
  return {
    async pageImages(crop) {
      const { white, black } = await open(crop);
      return { onWhite: await white.renderHiResPage(crop.pageNumber), onBlack: await black.renderHiResPage(crop.pageNumber) };
    },
    closeSource,
    async close() {
      for (const sourceId of [...sources.keys()]) await closeSource(sourceId);
    },
  };
}

/** The clean-up plan for a classified crop, from its report alone. */
function planFor(crop, { hasColour } = {}) {
  return planCleanup(crop.report, { extension: extensionOfPath(crop.sourcePath), hasColour, questionText: crop.questionText });
}

/**
 * Cleans one classified crop. Returns the plan and, when the plan is to clean,
 * the cleaned PNG and what each step did. crop needs report and modelSize from
 * classify, and box, pageWidth, sourceId and pageNumber for a slide re-render.
 */
async function cleanImage(crop, original, slides) {
  const { extractFigure } = require("../../src/questionBank/pages");
  const hasColour = (await cropMetrics(original)).colour > HAS_COLOUR_SHARE;
  const plan = planFor(crop, { hasColour });
  const result = { plan, image: null, applied: [] };
  if (plan.outcome !== "clean") return result;
  let image = original;
  for (const step of plan.steps) {
    if (step === "untint") {
      const untinted = await removePageTint(image, { diagramType: crop.diagramType });
      image = untinted.image;
      result.applied.push(`untint:${untinted.reason}`);
      result.tintLeft = await backgroundLeft(image);
    } else if (step === "rerender") {
      if (!crop.box || !crop.pageWidth) throw new Error("no stored box to re-render from");
      if (!slides) throw new Error("no slide sources to re-render from");
      const { onWhite, onBlack } = await slides.pageImages(crop);
      image = await greyscaleSlide(
        await extractFigure(onWhite, crop.box, crop.pageWidth),
        await extractFigure(onBlack, crop.box, crop.pageWidth),
      );
      result.applied.push("rerender:done");
    } else if (step === "erase") {
      // Boxes from the original only fit a re-render of the same proportions.
      const [was, now] = await Promise.all([sharp(original).metadata(), sharp(image).metadata()]);
      if (Math.abs(was.width / was.height - now.width / now.height) > 0.03 * (was.width / was.height)) {
        result.applied.push("erase:proportions_changed");
        continue;
      }
      const erased = await eraseStrayItems(image, crop.report.strayItems, crop.modelSize, { description: `${crop.description} ${crop.questionText}` });
      image = erased.image;
      result.erased = erased.erased;
      result.eraseRejected = erased.rejected;
      result.applied.push(`erase:${erased.reason}`);
    } else if (step === "grey") {
      image = await greyscaleCrop(image);
      result.applied.push("grey:done");
    }
  }
  result.image = image;
  return result;
}

module.exports = {
  HAS_COLOUR_SHARE,
  PRODUCTION_PROJECT,
  SLIDE_EXTENSIONS,
  anthropicClient,
  cleanImage,
  extensionOfPath,
  firebase,
  mapWithConcurrency,
  planFor,
  slideSources,
  usageOf,
};
