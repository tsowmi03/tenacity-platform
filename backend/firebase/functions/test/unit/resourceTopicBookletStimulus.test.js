"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  applySourcedStimulus,
  applyTopicBookletStimulusPlacement,
} = require("../../src/resources/index");
const { buildUserMessage } = require("../../src/resources/promptBuilder");
const {
  excerptStimulusBody,
  numberedStimulusBody,
} = require("../../src/resources/stimulusUnits");

const SOURCED_POEM = {
  passage: "First line\nSecond line\n\nThird line\nFourth line",
  selection: { title: "Shared Poem", author: "A Poet", type: "poem" },
  sourceName: "Wikisource",
  sourceUrl: "https://en.wikisource.org/wiki/Shared_Poem",
};

const SOURCED_SECOND_POEM = {
  passage: "Alpha\nBeta\nGamma",
  selection: { title: "Topic Poem", author: "Another Poet", type: "poem" },
  sourceName: "Wikisource",
  sourceUrl: "https://en.wikisource.org/wiki/Topic_Poem",
};

describe("topic booklet source units", () => {
  it("numbers poem lines for selection and reconstructs a verbatim cross-stanza excerpt", () => {
    assert.equal(
      numberedStimulusBody(SOURCED_POEM),
      "[Line 1] First line\n[Line 2] Second line\n\n[Line 3] Third line\n[Line 4] Fourth line"
    );
    assert.deepEqual(excerptStimulusBody(SOURCED_POEM, 2, 3), {
      body: "Second line\n\nThird line",
      startUnit: 2,
      endUnit: 3,
      unitLabel: "Line",
    });
  });

  it("uses paragraph selectors for prose and bounds a topic excerpt to three paragraphs", () => {
    const prose = {
      body: "Paragraph one.\n\nParagraph two.\n\nParagraph three.\n\nParagraph four.",
      textType: "prose",
    };
    assert.match(numberedStimulusBody(prose), /\[Paragraph 4\] Paragraph four\./);
    assert.deepEqual(excerptStimulusBody(prose, 1, 4), {
      body: "Paragraph one.\n\nParagraph two.\n\nParagraph three.",
      startUnit: 1,
      endUnit: 3,
      unitLabel: "Paragraph",
    });
  });

  it("gives the model selectors rather than asking it to reproduce source bodies", () => {
    const message = buildUserMessage(
      { resourceType: "topic-booklet", year: 9, subject: "english" },
      null,
      { texts: [SOURCED_POEM] }
    );
    assert.match(message, /VERIFIED PUBLIC-DOMAIN SOURCE LIBRARY/);
    assert.match(message, /frontStimulusSourceNumbers/);
    assert.match(message, /\[Line 2\] Second line/);
    assert.match(message, /Never copy a source body into the JSON/);
  });

  it("places a shared work at the front and exact excerpts or distinct works by topic", () => {
    const parsed = {
      frontStimulusSourceNumbers: [1],
      subTopics: [
        {
          title: "Shared close reading",
          sourceUses: [{ sourceNumber: 1, display: "excerpt", startUnit: 2, endUnit: 3 }],
        },
        {
          title: "Different poem",
          sourceUses: [{ sourceNumber: 2, display: "full", startUnit: null, endUnit: null }],
        },
        {
          title: "Return to the shared poem",
          sourceUses: [
            { sourceNumber: 1, display: "reference", startUnit: null, endUnit: null },
            { sourceNumber: 1, display: "full", startUnit: null, endUnit: null },
          ],
        },
      ],
    };
    const applied = applySourcedStimulus(parsed, [SOURCED_POEM, SOURCED_SECOND_POEM]);
    applyTopicBookletStimulusPlacement(parsed, applied.texts, applied.images);

    assert.deepEqual(parsed.stimulus.map((entry) => entry.title), ["Shared Poem"]);
    assert.equal(parsed.sourceLibrary.length, 2);
    assert.equal(parsed.subTopics[0].stimulus[0].title, "Lines 2-3 from Shared Poem");
    assert.equal(parsed.subTopics[0].stimulus[0].body, "Second line\n\nThird line");
    assert.equal(parsed.subTopics[1].stimulus[0].title, "Topic Poem");
    assert.equal(parsed.subTopics[1].stimulus[0].body, "Alpha\nBeta\nGamma");
    assert.deepEqual(parsed.subTopics[2].sourceReferences, [
      { label: "Text 1", title: "Shared Poem" },
    ]);
  });

});
