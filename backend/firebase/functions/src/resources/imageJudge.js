"use strict";

// RES-97. A look at candidate stimulus images before one is printed.
//
// Commons search plus licence and size filters cannot tell a poster a Year 7
// student can argue about from a scan of both sides of a map ("Ecoregions of
// New York") or an Arabic-language event flyer, and both reached real papers.
// So the strongest few candidates are shown to a vision model together, with
// the student's year and the task, and it says which (if any) are fit to
// print. It also writes the caption and a one-line description, since it is
// the only step that has actually seen the picture.

const { lazyRequire } = require("../shared/lazyRequire");
const { chatModel, providerForModel, sourcePlannerModel } = require("./modelRegistry");

const loadSharp = lazyRequire(() => require("sharp"));
const sharp = (...args) => loadSharp()(...args);

const PREVIEW_LONG_EDGE = 768;

const JUDGE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "suitable", "fit", "reason", "title", "description"],
        properties: {
          index: { type: "integer" },
          suitable: { type: "boolean" },
          fit: { type: "integer" },
          reason: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
        },
      },
    },
  },
});

function judgeSystemPrompt() {
  return `You choose images for an Australian English tutoring resource. You are shown numbered candidate images and judge each one.

An image is suitable only if ALL of these hold:
- It is one clear picture: a photograph, painting, illustration, poster or advertisement. Not a multi-panel sheet, a contact sheet, both sides of a document, a page of a book or newspaper, or a collage of small images.
- It is not a map, chart, graph, table, diagram, form or text-heavy document.
- It has no handwriting, pen marks or student annotations on it, and is not a blank box.
- Any words in it are in English and large enough to read when the image is printed about 16 cm wide.
- It suits a student of the stated year level: nothing graphic, sexual or demeaning.
- It clearly serves the stated purpose and task. For a writing prompt, it must evoke a scene, a moment or an issue a student can write about. For visual analysis, it must have composition, symbolism or persuasive design worth analysing.

For each image give: index (as numbered), suitable, fit (1 = poor to 5 = ideal for this task), reason (one short sentence), title (a clean caption of at most 8 words naming what the image is, with no file names, catalogue numbers or dates in brackets), and description (one plain sentence of what the image shows and any words in it).`;
}

// A small JPEG for the judge: enough to see composition and whether text is
// legible, at a fraction of the tokens of the print-size file.
async function previewOf(buffer) {
  return sharp(buffer)
    .resize({ width: PREVIEW_LONG_EDGE, height: PREVIEW_LONG_EDGE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 80 })
    .toBuffer();
}

// The vision call goes to an Anthropic model: the live source planner when it
// is one, else the chat model. With neither, there is no judge and selection
// falls back to the deterministic ranking.
function judgeModel() {
  for (const model of [sourcePlannerModel(), chatModel()]) {
    if (providerForModel(model) === "anthropic") return model;
  }
  return null;
}

/**
 * Judge up to a handful of candidate images. Returns, for each, the verdict
 * ({ index, suitable, fit, reason, title, description }), in the order given.
 * Throws when no judge is available or the call fails; the caller then falls
 * back to the deterministic ranking.
 */
async function judgeStimulusImages({
  images,
  year,
  purpose,
  task,
  anthropicApiKey,
  callAi,
  signal,
  model = judgeModel(),
  preview = previewOf,
}) {
  if (!model) throw Object.assign(new Error("No Anthropic model available to judge images"), { code: "IMAGE_JUDGE_UNAVAILABLE" });
  if (!anthropicApiKey) throw Object.assign(new Error("No Anthropic key to judge images"), { code: "IMAGE_JUDGE_UNAVAILABLE" });
  if (typeof callAi !== "function") throw new TypeError("judgeStimulusImages requires callAi");
  const content = [];
  for (const [i, image] of images.entries()) {
    const data = (await preview(image.buffer)).toString("base64");
    content.push({ type: "text", text: `Image ${i + 1}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
  }
  const purposeText = purpose === "visual-literacy"
    ? "visual analysis: the student analyses the image itself"
    : "writing prompt: the student writes from the image";
  content.push({
    type: "text",
    text: `Year level: ${year || "unspecified"}\nPurpose: ${purposeText}\nTask: ${task || "(none given)"}\n\nJudge all ${images.length} images.`,
  });
  const result = await callAi({
    anthropicApiKey,
    model,
    maxTokens: 2000,
    thinkingDisabled: true,
    mathBearing: false,
    systemPrompt: judgeSystemPrompt(),
    messages: [{ role: "user", content }],
    responseSchema: JUDGE_SCHEMA,
    signal,
  });
  const verdicts = Array.isArray(result?.parsed?.candidates) ? result.parsed.candidates : [];
  return images.map((_, i) => {
    const verdict = verdicts.find((v) => Number(v?.index) === i + 1) || {};
    return {
      index: i + 1,
      suitable: verdict.suitable === true,
      fit: Number.isFinite(Number(verdict.fit)) ? Number(verdict.fit) : 0,
      reason: String(verdict.reason || ""),
      title: String(verdict.title || "").trim(),
      description: String(verdict.description || "").trim(),
    };
  });
}

// The best suitable verdict: highest fit, then the earlier (better-ranked)
// candidate. Null when none is suitable.
function bestVerdict(verdicts) {
  return (verdicts || [])
    .filter((v) => v.suitable)
    .sort((a, b) => b.fit - a.fit || a.index - b.index)[0] || null;
}

module.exports = {
  JUDGE_SCHEMA,
  bestVerdict,
  judgeModel,
  judgeStimulusImages,
  judgeSystemPrompt,
  previewOf,
};
