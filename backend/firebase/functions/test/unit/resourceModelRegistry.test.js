"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_SUBMISSION_CHOICE,
  LEGACY_CHOICE,
  MAIN_MODEL_CHOICES,
  MODEL_CHOICES,
  RETIRED_MODELS,
  backupModelFor,
  choiceForValue,
  currentModelFor,
  displayNameForModel,
  inferModelChoice,
  modelForChoice,
  providerForModel,
} = require("../../src/resources/modelRegistry");

describe("resource model registry", () => {
  // Guards the one-line upgrade: a model edit that breaks the table's shape
  // fails here rather than in a tutor's queue.
  it("keeps every choice resolvable, with a backup on the other choice", () => {
    for (const choice of MAIN_MODEL_CHOICES) {
      const entry = MODEL_CHOICES[choice];
      assert.equal(modelForChoice(choice), entry.model);
      assert.equal(providerForModel(entry.model), entry.provider);
      assert.ok(MAIN_MODEL_CHOICES.includes(entry.backupChoice));
      assert.notEqual(entry.backupChoice, choice);
      assert.equal(backupModelFor(entry.model), MODEL_CHOICES[entry.backupChoice].model);
      assert.equal(displayNameForModel(entry.model), entry.displayName);
    }
    assert.ok(MAIN_MODEL_CHOICES.includes(DEFAULT_SUBMISSION_CHOICE));
    assert.ok(MAIN_MODEL_CHOICES.includes(LEGACY_CHOICE));
  });

  it("never lists a current model as retired", () => {
    const current = new Set(MAIN_MODEL_CHOICES.map((choice) => MODEL_CHOICES[choice].model));
    for (const [model, retired] of Object.entries(RETIRED_MODELS)) {
      assert.ok(!current.has(model), `${model} is both current and retired`);
      assert.ok(MAIN_MODEL_CHOICES.includes(retired.choice));
    }
  });

  it("resolves choices, current IDs and retired IDs to a choice", () => {
    assert.equal(choiceForValue("anthropic"), "anthropic");
    assert.equal(choiceForValue("claude-opus-5-5"), "anthropic");
    assert.equal(choiceForValue("claude-opus-5"), "anthropic");
    assert.equal(choiceForValue("gpt-5.6-sol"), "openai");
    assert.equal(choiceForValue("claude-sonnet-5"), null);
    assert.equal(choiceForValue(""), null);
  });

  it("carries a retired model over to its choice's current model", () => {
    assert.equal(currentModelFor("claude-opus-5"), "claude-opus-5-5");
    assert.equal(currentModelFor("claude-opus-5-5"), "claude-opus-5-5");
    assert.equal(currentModelFor("claude-sonnet-4-6"), null);
    assert.equal(displayNameForModel("claude-opus-5"), "Claude Opus 5");
  });

  it("infers a stored job's choice, falling back to the legacy choice", () => {
    assert.equal(inferModelChoice({ modelChoice: "openai" }), "openai");
    assert.equal(inferModelChoice({ modelChoice: "gpt-5.6-sol" }), "openai");
    assert.equal(inferModelChoice({ requestedModel: "claude-opus-5" }), "anthropic");
    assert.equal(inferModelChoice({ model: "claude-sonnet-4-6" }), "anthropic");
    assert.equal(inferModelChoice({}), "anthropic");
  });
});
