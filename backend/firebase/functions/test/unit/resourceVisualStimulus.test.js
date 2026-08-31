"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  STIMULUS_IMAGE_TARGET_WIDTH,
  makeImageContent,
  makePassageContent,
} = require("../../src/resources/builder/passage");
const { renderStimulusBooklet } = require("../../src/resources/builder/common");
const { optionalStimulus } = require("../../src/resources/builder/validation");
const { applySourcedStimulus, maybeSourceStimulusSet } = require("../../src/resources/index");

// Walk a docx element tree and concatenate every Text node, the way Word does
// when it renders the runs back into a line.
function renderedText(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node.constructor?.name === "Text" && Array.isArray(node.root)) out.push(node.root[1]);
  for (const child of Array.isArray(node.root) ? node.root : Object.values(node)) {
    renderedText(child, out);
  }
  return out;
}

const textOf = (nodes) => [].concat(nodes).flatMap((n) => renderedText(n)).join("");

// docx stores the embedded size in EMU (English Metric Units), 9525 per pixel,
// on the wp:extent element inside the ImageRun.
const EMU_PER_PX = 9525;

function findExtent(node) {
  if (!node || typeof node !== "object") return null;
  if (node.rootKey === "wp:extent") return node.root[0].root;
  for (const child of Array.isArray(node.root) ? node.root : Object.values(node)) {
    const hit = findExtent(child);
    if (hit) return hit;
  }
  return null;
}

function embeddedSize(content) {
  for (const node of content) {
    for (const child of node.root || []) {
      if (child?.constructor?.name !== "ImageRun") continue;
      const extent = findExtent(child);
      if (!extent) continue;
      return {
        width: Math.round(extent.x.value / EMU_PER_PX),
        height: Math.round(extent.y.value / EMU_PER_PX),
      };
    }
  }
  return null;
}

function sourcedImage(overrides = {}) {
  return {
    ok: true,
    source: "commons",
    sourceName: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Britain_Needs_You.jpg",
    title: "Britain Needs You at Once",
    creator: "Edgar James Kealey",
    date: "1915",
    licence: "Public domain",
    cluster: "britain needs you",
    selection: { purpose: "visual-literacy", task: "Identify the persuasive techniques used." },
    image: { buffer: Buffer.from("png-bytes"), type: "png", width: 1200, height: 1600 },
    ...overrides,
  };
}

describe("source attributions survive rendering", () => {
  // Regression: the rich-text parser reads "/" as a fraction and drops what
  // surrounds it. Wikisource names a piece inside a collection with a slash, so
  // an unguarded attribution loses the very part naming the work.
  it("keeps a slash-bearing Wikisource source name intact", () => {
    const source = "Wikisource, The Complete Poems and Fragments of Wilfred Owen/Dulce et Decorum Est";
    const content = makePassageContent({
      label: "Text 1",
      title: "Dulce et Decorum Est",
      author: "Wilfred Owen",
      source,
      body: "Bent double, like old beggars under sacks",
    });
    assert.ok(textOf(content).includes(source));
  });

  it("keeps a slash-bearing source name intact in an image credit", () => {
    const source = "Wikimedia Commons/Library of Congress";
    const content = makeImageContent({
      label: "Image 1",
      title: "A poster",
      creator: "Someone",
      licence: "Public domain",
      source,
      image: { buffer: Buffer.from("bytes"), type: "png", width: 1000, height: 1200 },
    });
    assert.ok(textOf(content).includes(source));
  });

  it("names where a text came from without printing a link", () => {
    const content = makePassageContent({
      label: "Text 1",
      title: "Ozymandias",
      author: "Percy Bysshe Shelley",
      source: "Wikisource",
      body: "I met a traveller",
    });
    const text = textOf(content);
    assert.ok(text.includes("Percy Bysshe Shelley"));
    assert.ok(text.includes("Wikisource"));
    assert.ok(!text.includes("http"));
  });
});

describe("makeImageContent", () => {
  const base = {
    label: "Image 1",
    title: "Britain Needs You at Once",
    creator: "Edgar James Kealey",
    date: "1915",
    licence: "Public domain",
    source: "Wikimedia Commons",
    task: "Identify the persuasive techniques used.",
    image: { buffer: Buffer.from("bytes"), type: "png", width: 1200, height: 1600 },
  };

  it("renders the label and the full credit", () => {
    const text = textOf(makeImageContent(base));
    assert.ok(text.includes("Image 1: Britain Needs You at Once"));
    assert.ok(text.includes("Edgar James Kealey"));
    assert.ok(text.includes("1915"));
    assert.ok(text.includes("Public domain"));
    assert.ok(text.includes("Wikimedia Commons"));
  });

  it("does not put an instruction under the image - the questions ask", () => {
    // A task line here would either duplicate the questions or contradict them.
    const text = textOf(makeImageContent({ ...base, task: "Analyse the composition." }));
    assert.ok(!text.includes("Analyse the composition."));
  });

  it("does not print a link", () => {
    assert.ok(!textOf(makeImageContent(base)).includes("http"));
  });

  it("embeds the image at the target width, scaled down from a large original", () => {
    const content = makeImageContent({ ...base, image: { ...base.image, width: 4000, height: 5200 } });
    const size = embeddedSize(content);
    assert.equal(size.width, STIMULUS_IMAGE_TARGET_WIDTH);
    // Aspect ratio preserved: 5200/4000 * 400 = 520.
    assert.equal(size.height, 520);
  });

  it("never enlarges an image that is already smaller than the target", () => {
    const content = makeImageContent({ ...base, image: { ...base.image, width: 200, height: 260 } });
    assert.deepEqual(embeddedSize(content), { width: 200, height: 260 });
  });

  it("renders nothing when the bytes are missing, rather than a caption with no picture", () => {
    assert.deepEqual(makeImageContent({ ...base, image: null }), []);
    assert.deepEqual(makeImageContent({ ...base, image: { type: "png" } }), []);
  });
});

describe("stimulus booklet with images", () => {
  const imageEntry = {
    kind: "image",
    label: "Image 1",
    title: "A poster",
    creator: "Someone",
    licence: "Public domain",
    source: "Wikimedia Commons",
    task: "Analyse the composition.",
    image: { buffer: Buffer.from("bytes"), type: "png", width: 1000, height: 1200 },
  };
  const textEntry = { label: "Text 1", title: "A poem", author: "A poet", body: "A line" };

  it("says 'text(s) and image(s)' for a mixed booklet", () => {
    const text = textOf(renderStimulusBooklet({ stimulus: [textEntry, imageEntry] }, "english"));
    assert.ok(text.includes("Examine the following text(s) and image(s)"));
  });

  it("says 'image(s)' when the booklet is visual only", () => {
    const text = textOf(renderStimulusBooklet({ stimulus: [imageEntry] }, "english"));
    assert.ok(text.includes("Examine the following image(s)"));
    assert.ok(!text.includes("text(s)"));
  });

  it("says 'text(s)' when there is no image, as before", () => {
    const text = textOf(renderStimulusBooklet({ stimulus: [textEntry] }, "english"));
    assert.ok(text.includes("Examine the following text(s)"));
  });

  it("renders both entries in one booklet", () => {
    const text = textOf(renderStimulusBooklet({ stimulus: [textEntry, imageEntry] }, "english"));
    assert.ok(text.includes("Text 1: A poem"));
    assert.ok(text.includes("Image 1: A poster"));
  });

  it("skips an image whose bytes are missing instead of leaving an empty panel", () => {
    const broken = { ...imageEntry, image: null };
    const text = textOf(renderStimulusBooklet({ stimulus: [textEntry, broken] }, "english"));
    assert.ok(text.includes("Text 1: A poem"));
    assert.ok(!text.includes("Image 1"));
  });

  // A shaded panel is a single-cell Table; unboxed content is pushed as bare
  // Paragraphs. The booklet's section heading is also a Table, so these count
  // panels by difference rather than by absolute number.
  const tables = (nodes) => nodes.filter((n) => n?.constructor?.name === "Table").length;
  const booklet = (stimulus) => renderStimulusBooklet({ stimulus }, "english");

  it("boxes a reading text but not an image", () => {
    // The tint marks a block of prose to read. Behind a poster it only competes
    // with the picture, so images are rendered unboxed.
    const base = tables(booklet([imageEntry]));
    assert.equal(tables(booklet([textEntry])), base + 1);
  });

  it("boxes only the text half of a mixed booklet", () => {
    const mixed = booklet([textEntry, imageEntry]);
    assert.equal(tables(mixed), tables(booklet([imageEntry])) + 1);
    // The image still renders, just without the panel around it.
    assert.ok(textOf(mixed).includes("Image 1: A poster"));
  });

  it("still renders nothing for a maths resource", () => {
    assert.deepEqual(renderStimulusBooklet({ stimulus: [imageEntry] }, "maths"), []);
  });
});

describe("applySourcedStimulus with visuals", () => {
  const text = {
    selection: { title: "Ozymandias", author: "Percy Bysshe Shelley", type: "poem" },
    author: "Percy Bysshe Shelley",
    sourceName: "Wikisource",
    sourceUrl: "https://en.wikisource.org/wiki/Ozymandias",
    passage: "I met a traveller",
  };

  it("appends images after the sourced texts, labelled separately", () => {
    const parsed = { stimulus: [{ label: "Text 1", title: "x", body: "y" }] };
    applySourcedStimulus(parsed, [text], [sourcedImage()]);

    assert.equal(parsed.stimulus.length, 2);
    assert.equal(parsed.stimulus[0].label, "Text 1");
    assert.equal(parsed.stimulus[1].label, "Image 1");
    assert.equal(parsed.stimulus[1].kind, "image");
    assert.equal(parsed.stimulus[1].title, "Britain Needs You at Once");
    assert.equal(parsed.stimulus[1].source, "Wikimedia Commons");
  });

  it("carries the planner's task through to the booklet", () => {
    const parsed = {};
    applySourcedStimulus(parsed, [], [sourcedImage()]);
    assert.equal(parsed.stimulus[0].task, "Identify the persuasive techniques used.");
  });

  it("applies images even when no text was sourced", () => {
    const parsed = {};
    applySourcedStimulus(parsed, [], [sourcedImage()]);
    assert.equal(parsed.stimulus.length, 1);
    assert.equal(parsed.stimulus[0].kind, "image");
  });

  it("numbers multiple images independently of the texts", () => {
    const parsed = {};
    applySourcedStimulus(parsed, [text], [sourcedImage(), sourcedImage({ cluster: "other" })]);
    assert.deepEqual(parsed.stimulus.map((e) => e.label), ["Text 1", "Image 1", "Image 2"]);
  });

  it("ignores a visual that failed to source", () => {
    const parsed = {};
    applySourcedStimulus(parsed, [text], [{ ok: false, image: null }]);
    assert.equal(parsed.stimulus.length, 1);
    assert.equal(parsed.stimulus[0].label, "Text 1");
  });

  it("does nothing when there is neither text nor image", () => {
    const parsed = { stimulus: [{ label: "Text 1", title: "kept", body: "y" }] };
    applySourcedStimulus(parsed, [], []);
    assert.equal(parsed.stimulus[0].title, "kept");
  });
});

describe("maybeSourceStimulusSet with visuals", () => {
  const job = { jobId: "j1", year: 9, subject: "english", resourceType: "worksheet", createdBy: "u1" };

  it("sources the planned visuals alongside the texts", async () => {
    const result = await maybeSourceStimulusSet({
      job,
      planStimulus: async () => ({
        needed: true,
        texts: [],
        visuals: [{ purpose: "visual-literacy", searchTerms: "recruitment poster", task: "Analyse it." }],
      }),
      sourceText: async () => ({ ok: false }),
      sourceVisual: async ({ selection }) => ({ ...sourcedImage(), selection }),
    });

    assert.equal(result.used, true);
    assert.equal(result.visuals.length, 1);
    assert.equal(result.visuals[0].title, "Britain Needs You at Once");
  });

  it("passes each sourced image's cluster on, so a set cannot repeat one series", async () => {
    const seenExclusions = [];
    await maybeSourceStimulusSet({
      job,
      planStimulus: async () => ({
        needed: true,
        texts: [],
        visuals: [
          { searchTerms: "coca cola advertisement", task: "a" },
          { searchTerms: "coca cola advertisement", task: "b" },
        ],
      }),
      sourceText: async () => ({ ok: false }),
      sourceVisual: async ({ selection, excludeClusters }) => {
        seenExclusions.push([...excludeClusters]);
        return { ...sourcedImage({ cluster: "coca cola ad" }), selection };
      },
    });

    assert.deepEqual(seenExclusions[0], []);
    assert.deepEqual(seenExclusions[1], ["coca cola ad"]);
  });

  it("treats a visual-only plan as a real stimulus", async () => {
    const result = await maybeSourceStimulusSet({
      job,
      planStimulus: async () => ({
        needed: true,
        texts: [],
        visuals: [{ searchTerms: "propaganda poster", task: "Analyse it." }],
      }),
      sourceText: async () => ({ ok: false }),
      sourceVisual: async ({ selection }) => ({ ...sourcedImage(), selection }),
    });
    assert.equal(result.used, true);
    assert.equal(result.texts.length, 0);
  });

  it("carries on when an image cannot be sourced", async () => {
    const result = await maybeSourceStimulusSet({
      job,
      planStimulus: async () => ({
        needed: true,
        texts: [],
        visuals: [{ searchTerms: "nothing", task: "x" }],
      }),
      sourceText: async () => ({ ok: false }),
      sourceVisual: async () => ({ ok: false, reason: "no-usable-candidate" }),
    });
    assert.equal(result.used, false);
    assert.deepEqual(result.visuals, []);
  });

  it("does not sink the job when image sourcing throws", async () => {
    const result = await maybeSourceStimulusSet({
      job,
      planStimulus: async () => ({
        needed: true,
        texts: [],
        visuals: [{ searchTerms: "boom", task: "x" }],
      }),
      sourceText: async () => ({ ok: false }),
      sourceVisual: async () => {
        throw new Error("network down");
      },
    });
    assert.equal(result.used, false);
  });

  it("reports not-needed without sourcing anything", async () => {
    let called = false;
    const result = await maybeSourceStimulusSet({
      job,
      planStimulus: async () => ({ needed: false, texts: [], visuals: [] }),
      sourceText: async () => ({ ok: false }),
      sourceVisual: async () => {
        called = true;
        return { ok: false };
      },
    });
    assert.equal(result.skipped, true);
    assert.deepEqual(result.visuals, []);
    assert.equal(called, false);
  });
});

describe("stimulus validation with images", () => {
  const valid = {
    kind: "image",
    title: "A poster",
    image: { buffer: Buffer.from("bytes"), type: "png" },
  };

  it("accepts an image entry, which has no body", () => {
    assert.doesNotThrow(() => optionalStimulus([valid], "worksheet.stimulus"));
  });

  it("still requires a body on a text entry", () => {
    assert.throws(
      () => optionalStimulus([{ title: "A text" }], "worksheet.stimulus"),
      /body/
    );
  });

  it("rejects an image entry with no bytes", () => {
    assert.throws(
      () => optionalStimulus([{ kind: "image", title: "A poster", image: { type: "png" } }], "s"),
      /buffer/
    );
  });

  it("rejects an image entry with no type", () => {
    assert.throws(
      () => optionalStimulus([{ kind: "image", title: "A poster", image: { buffer: Buffer.from("x") } }], "s"),
      /type/
    );
  });

  it("accepts a mixed booklet", () => {
    const text = { title: "A poem", body: "A line" };
    assert.doesNotThrow(() => optionalStimulus([text, valid], "worksheet.stimulus"));
  });
});

describe("stimulus shortfall warnings", () => {
  const job = { jobId: "j1", year: 9, subject: "english", resourceType: "worksheet", createdBy: "u1" };
  const plannedText = { title: "Ozymandias", author: "Shelley", type: "poem" };

  function sourcedText() {
    return {
      ok: true,
      passage: "I met a traveller",
      selection: plannedText,
      author: "Shelley",
      sourceName: "Wikisource",
      sourceUrl: "https://en.wikisource.org/wiki/Ozymandias",
    };
  }

  it("says text was replaced only when the generator was actually given the field", async () => {
    // One of two texts verified: the generator gets the stimulus field and
    // writes its own for the other.
    let call = 0;
    const result = await maybeSourceStimulusSet({
      job,
      planStimulus: async () => ({ needed: true, texts: [plannedText, plannedText], visuals: [] }),
      sourceText: async () => (call++ === 0 ? sourcedText() : { ok: false }),
      selectAlternative: async () => plannedText,
      sourceVisual: async () => ({ ok: false }),
    });
    assert.match(result.warning, /replaced with model-written text/);
  });

  it("does not claim model-written text when no text was sourced at all", async () => {
    const result = await maybeSourceStimulusSet({
      job,
      planStimulus: async () => ({
        needed: true,
        texts: [plannedText],
        visuals: [{ searchTerms: "propaganda poster", task: "Analyse it." }],
      }),
      sourceText: async () => ({ ok: false }),
      selectAlternative: async () => plannedText,
      sourceVisual: async ({ selection }) => ({ ...sourcedImage(), selection }),
    });
    assert.equal(result.used, true);
    assert.doesNotMatch(result.warning, /model-written/);
    assert.match(result.warning, /only its sourced image/);
  });

  it("warns about nothing when everything planned was sourced", async () => {
    const result = await maybeSourceStimulusSet({
      job,
      planStimulus: async () => ({
        needed: true,
        texts: [plannedText],
        visuals: [{ searchTerms: "propaganda poster", task: "Analyse it." }],
      }),
      sourceText: async () => sourcedText(),
      selectAlternative: async () => plannedText,
      sourceVisual: async ({ selection }) => ({ ...sourcedImage(), selection }),
    });
    assert.equal(result.warning, undefined);
  });
});
