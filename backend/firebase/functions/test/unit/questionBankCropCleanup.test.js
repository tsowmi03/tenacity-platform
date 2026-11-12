"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");

const {
  CLASSIFY_SCHEMA,
  VERIFY_SCHEMA,
  backgroundLeft,
  buildClassifyParams,
  buildVerifyParams,
  cropMetrics,
  eraseStrayItems,
  greyscaleCrop,
  greyscaleSlide,
  modelImage,
  planCleanup,
  removePageTint,
  setSlideBackground,
  verdict,
} = require("../../src/questionBank/cropCleanup");

const { chooseTestSet, finalOutcome, parseArgs, randomSource } = require("../../scripts/questionBankCropCleanupTest");

const TINT = "#fdeadf";

async function svg(body, { width = 300, height = 200, background = TINT } = {}) {
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${background}"/>${body}</svg>`)).png().toBuffer();
}

async function pixel(png, x, y) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 3;
  return [data[i], data[i + 1], data[i + 2]];
}

const clean = { background: "white", questionNamesColour: false, strayItems: [], handwriting: false, wrongSymbols: false, usable: true };

describe("planCleanup", () => {
  it("keeps a crop with nothing wrong", () => {
    assert.deepEqual(planCleanup(clean), { outcome: "keep", reason: "already_clean", steps: [] });
  });

  it("removes a tint and stray content in that order", () => {
    assert.deepEqual(planCleanup({ ...clean, background: "page_tint", strayItems: [{}] }).steps, ["untint", "erase"]);
  });

  it("tries a crop with an unclear background rather than hiding it", () => {
    assert.deepEqual(planCleanup({ ...clean, background: "other" }).steps, ["untint"]);
    assert.deepEqual(planCleanup({ ...clean, background: "other" }, { extension: "pps" }).steps, ["rerender"]);
  });

  it("re-renders a slide with a photo background", () => {
    assert.deepEqual(planCleanup({ ...clean, background: "photo_or_texture" }, { extension: "pps" }).steps, ["rerender"]);
  });

  it("tries to lift a photo background it has no source slide for, instead of hiding", () => {
    const plan = planCleanup({ ...clean, background: "photo_or_texture" }, { extension: "pdf", hasColour: true });
    assert.equal(plan.outcome, "clean");
    assert.deepEqual(plan.steps, ["untint", "grey"]);
  });

  for (const [change, reason] of [
    [{ usable: false }, "unusable"],
    [{ handwriting: true }, "handwriting"],
    [{ wrongSymbols: true }, "wrong_symbols"],
  ]) {
    it(`hides for ${reason}`, () => {
      const plan = planCleanup({ ...clean, ...change }, { extension: "pps" });
      assert.equal(plan.outcome, "hide");
      assert.equal(plan.reason, reason);
    });
  }

  it("hides a question that says a colour", () => {
    assert.equal(planCleanup({ ...clean, questionNamesColour: true }, { hasColour: true, questionText: "The yellow line has the equation y = 3" }).reason, "names_colour");
  });

  it("keeps a question that says a colour when the crop has none to lose", () => {
    assert.equal(planCleanup({ ...clean, questionNamesColour: true }, { hasColour: false, questionText: "The spinner has red, white and blue sectors." }).outcome, "keep");
  });

  it("ignores the model's colour report if the question says no colour", () => {
    assert.equal(planCleanup({ ...clean, questionNamesColour: true }, { questionText: "Calculate x to the nearest cm." }).outcome, "keep");
  });

  it("greys a coloured crop, after any other step", () => {
    assert.deepEqual(planCleanup({ ...clean, background: "page_tint" }, { hasColour: true }).steps, ["untint", "grey"]);
    assert.deepEqual(planCleanup(clean, { hasColour: true }).steps, ["grey"]);
  });

  it("doesn't grey a re-render again", () => {
    assert.deepEqual(planCleanup({ ...clean, background: "photo_or_texture" }, { extension: "pps", hasColour: true }).steps, ["rerender"]);
  });
});

describe("removePageTint", () => {
  it("whitens the tint and leaves the ink black", async () => {
    const before = await svg('<line x1="20" y1="100" x2="280" y2="100" stroke="#000" stroke-width="6"/>');
    const { image, changed } = await removePageTint(before);
    assert.equal(changed, true);
    assert.deepEqual(await pixel(image, 5, 5), [255, 255, 255]);
    assert.deepEqual(await pixel(image, 150, 100), [0, 0, 0]);
  });

  it("whitens tint inside a closed shape", async () => {
    const before = await svg('<circle cx="150" cy="100" r="70" fill="none" stroke="#000" stroke-width="4"/>');
    const { image } = await removePageTint(before, { diagramType: "circle_geometry" });
    assert.deepEqual(await pixel(image, 150, 100), [255, 255, 255]);
  });

  it("keeps a filled region in a different colour", async () => {
    const before = await svg('<rect x="80" y="50" width="140" height="100" fill="#ee2222" stroke="#000" stroke-width="3"/>');
    const { image } = await removePageTint(before);
    assert.deepEqual(await pixel(image, 150, 100), [238, 34, 34]);
  });

  it("keeps a large enclosed region of tint where shading matters", async () => {
    const before = await svg('<circle cx="150" cy="100" r="70" fill="none" stroke="#000" stroke-width="4"/>');
    const { image } = await removePageTint(before, { diagramType: "region_inequality" });
    assert.deepEqual(await pixel(image, 5, 5), [255, 255, 255]);
    assert.deepEqual(await pixel(image, 150, 100), [253, 234, 223]);
  });

  it("still clears tiny gaps where shading matters", async () => {
    const before = await svg('<circle cx="150" cy="100" r="8" fill="none" stroke="#000" stroke-width="4"/>');
    const { image } = await removePageTint(before, { diagramType: "region_inequality" });
    assert.deepEqual(await pixel(image, 150, 100), [255, 255, 255]);
  });

  it("leaves a white crop untouched", async () => {
    const before = await svg('<circle cx="150" cy="100" r="70" fill="#cccccc"/>', { background: "#ffffff" });
    const result = await removePageTint(before);
    assert.equal(result.changed, false);
    assert.equal(result.image, before);
  });

  it("leaves a crop with no uniform border untouched", async () => {
    const stripes = Array.from({ length: 30 }, (_, i) => `<rect x="${i * 10}" width="10" height="200" fill="rgb(${i * 8},${255 - i * 8},${(i * 37) % 255})"/>`).join("");
    const result = await removePageTint(await svg(stripes));
    assert.equal(result.changed, false);
    assert.equal(result.reason, "no_uniform_border");
  });
});

describe("eraseStrayItems", () => {
  const size = { width: 300, height: 200 };
  const white = { background: "#ffffff" };
  const figure = '<rect x="60" y="40" width="180" height="120" fill="none" stroke="#000" stroke-width="4"/>';
  const dot = '<rect x="6" y="6" width="14" height="14" fill="#000"/>';
  const stray = (box, extra = {}) => ({ kind: "cut_off_text", text: "Sketch", box, ...extra });

  it("erases a named mark and trims to the diagram", async () => {
    const before = await svg(figure + dot, white);
    const { image, changed, erased } = await eraseStrayItems(before, [stray({ x0: 4, y0: 4, x1: 22, y1: 22 })], size);
    const meta = await sharp(image).metadata();
    assert.equal(changed, true);
    assert.deepEqual(erased, ["Sketch"]);
    assert.ok(meta.width < 300 && meta.height < 200);
  });

  it("keeps a shape that only partly falls in the box", async () => {
    const before = await svg(figure, white);
    const result = await eraseStrayItems(before, [stray({ x0: 50, y0: 0, x1: 100, y1: 60 })], size);
    assert.equal(result.changed, false);
  });

  it("ignores a box far from the crop's edge", async () => {
    const before = await svg('<rect x="140" y="90" width="20" height="20" fill="#000"/>' + dot, white);
    const result = await eraseStrayItems(before, [stray({ x0: 135, y0: 85, x1: 165, y1: 115 })], size);
    assert.equal(result.rejected[0].reason, "not_near_edge");
    assert.equal(result.image, before);
  });

  it("ignores a box covering much of the crop", async () => {
    const result = await eraseStrayItems(await svg(figure, white), [stray({ x0: 0, y0: 0, x1: 250, y1: 150 })], size);
    assert.equal(result.rejected[0].reason, "too_large");
  });

  it("refuses to erase a number the diagram is meant to show", async () => {
    const before = await svg(figure + dot, white);
    const result = await eraseStrayItems(before, [stray({ x0: 4, y0: 4, x1: 22, y1: 22 }, { text: "15 cm" })], size, { description: "A cylinder of height 15 cm" });
    assert.equal(result.rejected[0].reason, "matches_diagram_number");
    assert.equal(result.changed, false);
  });

  it("doesn't confuse a number with part of a longer one", async () => {
    const before = await svg(figure + dot, white);
    const result = await eraseStrayItems(before, [stray({ x0: 4, y0: 4, x1: 22, y1: 22 }, { text: "5" })], size, { description: "A side of 15 cm" });
    assert.equal(result.changed, true);
  });

  it("refuses to erase a letter that labels the diagram", async () => {
    const before = await svg(figure + dot, white);
    const result = await eraseStrayItems(before, [stray({ x0: 4, y0: 4, x1: 22, y1: 22 }, { kind: "part_letter", text: "b" })], size, { description: "A triangle with side $b$" });
    assert.equal(result.rejected[0].reason, "matches_diagram_label");
  });

  it("erases a part letter the diagram doesn't use", async () => {
    const before = await svg(figure + dot, white);
    const result = await eraseStrayItems(before, [stray({ x0: 4, y0: 4, x1: 22, y1: 22 }, { kind: "part_letter", text: "(c)" })], size, { description: "A rectangle" });
    assert.equal(result.changed, true);
  });
});

describe("greyscaleCrop", () => {
  const white = { width: 600, height: 400, background: "#ffffff" };
  const triangle = '<path d="M60 40 L60 340 L500 340 Z" fill="#ffff00" stroke="#000" stroke-width="4"/>';
  const isGrey = async (png) => {
    const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 3) if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) return false;
    return true;
  };

  it("uses only greys", async () => {
    assert.equal(await isGrey(await greyscaleCrop(await svg(triangle + '<line x1="520" y1="40" x2="580" y2="300" stroke="#ee2222" stroke-width="4"/>', white))), true);
  });

  it("makes a filled area light grey and its outline black", async () => {
    const image = await greyscaleCrop(await svg(triangle, white));
    const [fill] = await pixel(image, 150, 280);
    const [line] = await pixel(image, 60, 200);
    assert.ok(fill >= 150 && fill <= 235);
    assert.ok(line < 40);
  });

  it("leaves a right-angle box open instead of filling it in", async () => {
    const box = '<rect x="60" y="310" width="30" height="30" fill="none" stroke="#000" stroke-width="3"/>';
    const image = await greyscaleCrop(await svg(triangle + box, white));
    const [inside] = await pixel(image, 75, 325);
    const [fill] = await pixel(image, 150, 280);
    assert.equal(inside, fill);
  });

  it("gives different fills different greys", async () => {
    const image = await greyscaleCrop(await svg('<rect x="40" y="40" width="200" height="300" fill="#ee2222"/><rect x="340" y="40" width="200" height="300" fill="#44cc44"/>', white));
    assert.notEqual((await pixel(image, 140, 200))[0], (await pixel(image, 440, 200))[0]);
  });

  it("matches a legend key to the area it describes", async () => {
    const image = await greyscaleCrop(await svg('<rect x="40" y="40" width="200" height="300" fill="#44cc44"/><rect x="400" y="60" width="16" height="16" fill="#44cc44"/><rect x="340" y="200" width="200" height="150" fill="#ee2222"/>', white));
    assert.equal((await pixel(image, 408, 68))[0], (await pixel(image, 140, 200))[0]);
  });

  it("keeps a pale gridline pale", async () => {
    const image = await greyscaleCrop(await svg('<line x1="20" y1="200" x2="580" y2="200" stroke="#a8dcea" stroke-width="3"/>', white));
    assert.ok((await pixel(image, 300, 200))[0] > 150);
  });

  it("keeps a medium-blue grid light but a blue curve black", async () => {
    const lines = Array.from({ length: 14 }, (_, i) => `<line x1="${40 + i * 40}" y1="20" x2="${40 + i * 40}" y2="380" stroke="#5fa8d3" stroke-width="2"/><line x1="20" y1="${30 + i * 25}" x2="580" y2="${30 + i * 25}" stroke="#5fa8d3" stroke-width="2"/>`).join("");
    const image = await greyscaleCrop(await svg(lines, white));
    assert.ok((await pixel(image, 80, 142))[0] > 150);
  });

  it("shades a smooth gradient evenly instead of in bands", async () => {
    const gradient = '<defs><linearGradient id="g"><stop offset="0" stop-color="#cc2222"/><stop offset="1" stop-color="#ffcccc"/></linearGradient></defs><rect x="20" y="20" width="560" height="360" fill="url(#g)"/>';
    const image = await greyscaleCrop(await svg(gradient, white));
    const left = (await pixel(image, 200, 200))[0];
    const right = (await pixel(image, 210, 200))[0];
    assert.ok(Math.abs(left - right) <= 6);
    assert.ok(left > 40);
  });

  it("turns a coloured line black", async () => {
    const image = await greyscaleCrop(await svg('<line x1="20" y1="200" x2="580" y2="200" stroke="#2244cc" stroke-width="3"/>', white));
    assert.ok((await pixel(image, 300, 200))[0] < 40);
  });
});

describe("greyscaleSlide", () => {
  const size = { width: 600, height: 400 };
  const onBoth = (body) => Promise.all([svg(body, { ...size, background: "#ffffff" }), svg(body, { ...size, background: "#000000" })]);

  it("recovers white writing that vanishes on white", async () => {
    const [onWhite, onBlack] = await onBoth('<path d="M100 100 L100 130 L130 130" fill="none" stroke="#ffffff" stroke-width="4"/>');
    assert.ok((await pixel(await greyscaleSlide(onWhite, onBlack), 100, 115))[0] < 40);
  });

  it("turns the background white", async () => {
    const [onWhite, onBlack] = await onBoth('<rect x="100" y="100" width="200" height="150" fill="#2244cc"/>');
    assert.deepEqual(await pixel(await greyscaleSlide(onWhite, onBlack), 20, 20), [255, 255, 255]);
  });

  it("keeps a large white frame white instead of turning it black", async () => {
    const frame = '<path fill-rule="evenodd" d="M50 50 H550 V350 H50 Z M80 80 V320 H520 V80 Z" fill="#ffffff"/>';
    const [onWhite, onBlack] = await onBoth(frame);
    assert.deepEqual(await pixel(await greyscaleSlide(onWhite, onBlack), 65, 200), [255, 255, 255]);
  });

  it("keeps an opaque white box white", async () => {
    const [onWhite, onBlack] = await onBoth('<rect x="100" y="100" width="120" height="30" fill="#ffffff"/>');
    assert.deepEqual(await pixel(await greyscaleSlide(onWhite, onBlack), 160, 115), [255, 255, 255]);
  });
});

describe("backgroundLeft", () => {
  it("is false for a white border", async () => {
    assert.equal(await backgroundLeft(await svg("", { background: "#ffffff" })), false);
  });

  it("is true for a tinted border", async () => {
    assert.equal(await backgroundLeft(await svg("")), true);
  });
});

describe("setSlideBackground", () => {
  const picture = '<p:cSld><p:bg><p:bgPr><a:blipFill><a:blip r:embed="rId1"/></a:blipFill></p:bgPr></p:bg><p:spTree>shapes</p:spTree></p:cSld>';

  it("removes a slide's own background so it inherits", () => {
    assert.equal(setSlideBackground(picture, "000000"), "<p:cSld><p:spTree>shapes</p:spTree></p:cSld>");
  });

  it("gives a master the plain colour", () => {
    const xml = setSlideBackground(picture, "000000", { isMaster: true });
    assert.ok(xml.includes('<a:srgbClr val="000000"/>'));
    assert.ok(!xml.includes("blipFill"));
    assert.ok(xml.includes("shapes"));
  });

  it("does not touch elements that only start the same way", () => {
    const xml = "<p:bgRef idx=\"1\"/><p:spTree/>";
    assert.equal(setSlideBackground(xml, "000000"), xml);
  });
});

describe("verdict", () => {
  const good = { missingLabels: [], missingShapes: [], unreadableLabels: [], wronglyFilled: [], mergedRegions: [], wrongSymbols: false };

  it("fails a wrongly filled area", () => {
    assert.deepEqual(verdict({ ...good, wronglyFilled: ["right-angle box"] }), { pass: false, failed: ["wronglyFilled"] });
  });

  it("passes when nothing is named", () => {
    assert.deepEqual(verdict(good), { pass: true, failed: [] });
  });

  it("lists each failed check", () => {
    assert.deepEqual(verdict({ ...good, missingLabels: ["15 cm"], wrongSymbols: true }), { pass: false, failed: ["missingLabels", "wrongSymbols"] });
  });

  it("fails a crop with tint left behind", () => {
    assert.deepEqual(verdict(good, { tintLeft: true }), { pass: false, failed: ["tintLeft"] });
  });
});

describe("requests", () => {
  const assertStrict = (schema) => {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
  };

  it("has schemas structured outputs accepts", () => {
    assertStrict(CLASSIFY_SCHEMA);
    assertStrict(VERIFY_SCHEMA);
  });

  it("sends one image to classify and two to verify", () => {
    const image = Buffer.from("x");
    const count = (params) => params.messages[0].content.filter((block) => block.type === "image").length;
    assert.equal(count(buildClassifyParams({ image, width: 1, height: 1 })), 1);
    assert.equal(count(buildVerifyParams({ before: image, after: image })), 2);
  });

  it("keeps crops inside the size the model reads without rescaling", async () => {
    const { width, height } = await modelImage(await svg("", { width: 3000, height: 1500 }));
    assert.equal(width, 1568);
    assert.equal(height, 784);
  });

  it("doesn't enlarge small crops", async () => {
    assert.equal((await modelImage(await svg(""))).width, 300);
  });
});

describe("test script", () => {
  const crop = (n, metrics, sourcePath = "a/b.pdf") => ({ storagePath: `p${n}`, sourcePath, metrics });

  it("never sends to the model unless told to", () => {
    const options = parseArgs(["--stage=classify", "--work-dir=/tmp/x"]);
    assert.equal(options.commit, false);
    assert.equal(options.yes, false);
    assert.equal(options.cap, 1);
  });

  it("rejects an unknown stage", () => {
    assert.throws(() => parseArgs(["--stage=write", "--work-dir=/tmp/x"]), /--stage must be/);
  });

  it("fills each group and uses a crop only once", () => {
    const colour = Array.from({ length: 5 }, (_, i) => crop(i, { white: 0.2, colour: 0.3, edgeInk: 0 }));
    const plain = Array.from({ length: 5 }, (_, i) => crop(i + 10, { white: 0.95, colour: 0, edgeInk: 0 }));
    const inked = Array.from({ length: 5 }, (_, i) => crop(i + 20, { white: 0.8, colour: 0, edgeInk: 0.4 }));
    const set = chooseTestSet({
      flagged: [{ storagePath: "p0", sourcePath: "a/b.pdf" }],
      slides: [{ storagePath: "s1", sourcePath: "a/b.pps" }],
      measured: [...colour, ...plain, ...inked],
      random: randomSource(1),
      quotas: { slides: 1, colour: 2, stray: 2, control: 2 },
    });
    const count = (group) => set.filter((c) => c.group === group).length;
    assert.deepEqual([count("flagged"), count("slides"), count("colour"), count("control")], [1, 1, 2, 2]);
    assert.equal(new Set(set.map((c) => c.storagePath)).size, set.length);
  });

  it("only calls a cleaned crop good once its check passes", () => {
    const plan = { outcome: "clean" };
    const good = { missingLabels: [], missingShapes: [], unreadableLabels: [], wrongSymbols: false };
    assert.equal(finalOutcome({ plan }), "cleaned_unchecked");
    assert.equal(finalOutcome({ plan, check: good }), "cleaned_passed");
    assert.equal(finalOutcome({ plan, check: { ...good, missingLabels: ["x"] } }), "cleaned_failed");
  });
});

describe("cropMetrics", () => {
  it("tells a white crop from a tinted one", async () => {
    assert.ok((await cropMetrics(await svg("", { background: "#ffffff" }))).white > 0.99);
    assert.ok((await cropMetrics(await svg("", { background: "#f7d774" }))).white < 0.01);
  });

  it("notices ink at the crop's edge", async () => {
    const edge = await svg('<rect x="0" y="0" width="300" height="6" fill="#000"/>', { background: "#ffffff" });
    assert.ok((await cropMetrics(edge)).edgeInk > 0.1);
  });
});
