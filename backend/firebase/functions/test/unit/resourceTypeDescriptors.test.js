"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { SCHEMA_BUILDERS } = require("../../src/resources/responseSchema");
const { RESOURCE_TYPES, ENGLISH_ONLY_RESOURCE_TYPES } = require("../../src/resources/modelMap");
const { METADATA_KEYS, RESOURCE_TYPE_DESCRIPTORS, sectionsFor } = require("../../src/resources/builder/descriptors");
const builders = require("../../src/resources/builder");

// RES-102. The resource assistant describes each type from these descriptors,
// so they must match what the builders actually render: the response schema
// each type is generated against. Add, remove or rename a schema property and
// this fails until builder/descriptors.js says what the section is.
describe("resource type descriptors", () => {
  it("describe exactly the resource types the generator builds", () => {
    assert.deepEqual(Object.keys(RESOURCE_TYPE_DESCRIPTORS).sort(), [...RESOURCE_TYPES].sort());
    assert.deepEqual(Object.keys(SCHEMA_BUILDERS).sort(), [...RESOURCE_TYPES].sort());
    assert.deepEqual(Object.keys(builders.RESOURCE_BUILDERS).sort(), [...RESOURCE_TYPES].sort());
  });

  it("offer English-only types for English only", () => {
    for (const [type, descriptor] of Object.entries(RESOURCE_TYPE_DESCRIPTORS)) {
      const englishOnly = ENGLISH_ONLY_RESOURCE_TYPES.has(type);
      assert.deepEqual(descriptor.subjects, englishOnly ? ["english"] : ["maths", "english"], type);
    }
  });

  for (const [type, descriptor] of Object.entries(RESOURCE_TYPE_DESCRIPTORS)) {
    for (const subject of descriptor.subjects) {
      it(`${type} (${subject}) covers every content property of its schema, and nothing else`, () => {
        // Sourced stimulus texts are an English feature (shouldSourceStimulusSet
        // in index.js), so maths schemas are checked without them.
        const stimulusCases = subject === "english" ? [false, true] : [false];
        const described = new Set(sectionsFor(type, subject).flatMap((section) => section.keys));
        if (descriptor.tutorCopy) {
          described.add("answers");
          described.add("markingGuide");
        }
        const seen = new Set();
        for (const hasStimulus of stimulusCases) {
          const schema = SCHEMA_BUILDERS[type]({ subject, answerMode: "worked", hasStimulus });
          const content = Object.keys(schema.properties).filter((key) => !METADATA_KEYS.has(key));
          content.forEach((key) => seen.add(key));
          const missing = content.filter((key) => !described.has(key));
          assert.deepEqual(missing, [], `undescribed ${type} properties with hasStimulus=${hasStimulus}`);
        }
        const sectionKeys = sectionsFor(type, subject).flatMap((section) => section.keys);
        assert.deepEqual(sectionKeys.filter((key) => !seen.has(key)), [], `${type} describes properties its schema doesn't have`);
        assert.equal(descriptor.tutorCopy, ["answers", "markingGuide"].some((key) => seen.has(key)), `${type} tutorCopy flag`);
      });
    }
  }
});
