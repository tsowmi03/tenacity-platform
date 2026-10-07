"use strict";

const { afterEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_MODELS,
  LEGACY_CHOICE,
  MAIN_MODEL_CHOICES,
  MODEL_CONFIG_TTL_MS,
  applyModelConfig,
  backupModelFor,
  chatModel,
  choiceForValue,
  currentModelFor,
  defaultResourceModel,
  defaultSubmissionChoice,
  displayNameForModel,
  inferModelChoice,
  modelForChoice,
  providerForModel,
  refreshModelConfig,
  resetModelConfig,
  resolveModelConfig,
  sourcePlannerFallbackModel,
  sourcePlannerModel,
} = require("../../src/resources/modelRegistry");

// A Firestore stand-in holding just config/resourceModels.
function configDb(data, { fail = false } = {}) {
  const db = {
    reads: 0,
    collection(name) {
      assert.equal(name, "config");
      return {
        doc(id) {
          assert.equal(id, "resourceModels");
          return {
            async get() {
              db.reads += 1;
              if (fail) throw new Error("firestore unavailable");
              return { exists: data !== null, data: () => data };
            },
          };
        },
      };
    },
  };
  return db;
}

describe("resource model registry", () => {
  afterEach(() => resetModelConfig());

  it("runs on the code defaults until a config is read", () => {
    assert.equal(modelForChoice("anthropic"), "claude-opus-5-5");
    assert.equal(modelForChoice("openai"), "gpt-6.1-sol");
    assert.equal(defaultSubmissionChoice(), "openai");
    assert.equal(chatModel(), "claude-sonnet-5-5");
    assert.equal(sourcePlannerModel(), "claude-sonnet-5");
    assert.equal(sourcePlannerFallbackModel(), "gpt-5.6-terra");
    assert.equal(defaultResourceModel(), modelForChoice(LEGACY_CHOICE));
    assert.equal(displayNameForModel("gpt-6.1-sol"), "GPT-6.1 Sol");
  });

  // Guards the defaults' shape: an edit that breaks it fails here rather than
  // in a tutor's queue.
  it("keeps each choice on its own provider, backed up by the other", () => {
    for (const choice of MAIN_MODEL_CHOICES) {
      const model = modelForChoice(choice);
      assert.equal(providerForModel(model), choice);
      const backup = backupModelFor(model);
      assert.ok(backup);
      assert.notEqual(providerForModel(backup), choice);
    }
    assert.deepEqual(resolveModelConfig(DEFAULT_MODELS).ignored, []);
  });

  it("reads a model's provider from its ID prefix", () => {
    assert.equal(providerForModel("claude-anything-9"), "anthropic");
    assert.equal(providerForModel("gpt-7-sol"), "openai");
    assert.equal(providerForModel("gemini-3"), null);
    assert.equal(providerForModel(""), null);
  });

  it("resolves choices and any current or retired model ID to a choice", () => {
    assert.equal(choiceForValue("anthropic"), "anthropic");
    assert.equal(choiceForValue("claude-opus-5-5"), "anthropic");
    assert.equal(choiceForValue("claude-opus-5"), "anthropic");
    assert.equal(choiceForValue("gpt-5.6-sol"), "openai");
    assert.equal(choiceForValue("gpt-6.1-sol"), "openai");
    assert.equal(choiceForValue("mistral-large"), null);
    assert.equal(choiceForValue(""), null);
  });

  it("carries a replaced model over to its choice's current model", () => {
    assert.equal(currentModelFor("gpt-5.6-sol"), "gpt-6.1-sol");
    assert.equal(currentModelFor("claude-opus-5"), "claude-opus-5-5");
    assert.equal(currentModelFor("claude-opus-5-5"), "claude-opus-5-5");
    assert.equal(currentModelFor("mistral-large"), null);
    assert.equal(currentModelFor(""), null);
    assert.equal(backupModelFor("gpt-5.6-sol"), "claude-opus-5-5");
  });

  it("infers a stored job's choice, falling back to the legacy choice", () => {
    assert.equal(inferModelChoice({ modelChoice: "openai" }), "openai");
    assert.equal(inferModelChoice({ modelChoice: "gpt-5.6-sol" }), "openai");
    assert.equal(inferModelChoice({ requestedModel: "claude-opus-5" }), "anthropic");
    assert.equal(inferModelChoice({ model: "claude-sonnet-4-6" }), "anthropic");
    assert.equal(inferModelChoice({}), "anthropic");
  });

  describe("live config (config/resourceModels)", () => {
    it("overrides every model and the default choice", () => {
      const ignored = applyModelConfig({
        anthropic: "claude-opus-6",
        openai: "gpt-6.2-sol",
        defaultChoice: "anthropic",
        chat: "gpt-6-luna",
        sourcePlanner: "claude-sonnet-6",
        sourcePlannerFallback: "gpt-6.1-terra",
      });
      assert.deepEqual(ignored, []);
      assert.equal(modelForChoice("anthropic"), "claude-opus-6");
      assert.equal(modelForChoice("openai"), "gpt-6.2-sol");
      assert.equal(defaultSubmissionChoice(), "anthropic");
      assert.equal(chatModel(), "gpt-6-luna");
      assert.equal(sourcePlannerModel(), "claude-sonnet-6");
      assert.equal(sourcePlannerFallbackModel(), "gpt-6.1-terra");
      // Jobs that recorded the previous models follow their choice.
      assert.equal(currentModelFor("gpt-6.1-sol"), "gpt-6.2-sol");
      assert.equal(backupModelFor("claude-opus-6"), "gpt-6.2-sol");
    });

    it("keeps the default for missing and blank fields", () => {
      assert.deepEqual(applyModelConfig({ openai: "  gpt-6.2-sol ", chat: "" }), []);
      assert.equal(modelForChoice("openai"), "gpt-6.2-sol");
      assert.equal(chatModel(), DEFAULT_MODELS.chat);
      assert.equal(modelForChoice("anthropic"), DEFAULT_MODELS.anthropic);
    });

    it("ignores malformed values and models on the wrong provider", () => {
      const ignored = applyModelConfig({
        anthropic: "gpt-6.2-sol",
        openai: "GPT 6.2 Sol",
        defaultChoice: "gemini",
        chat: 42,
        sourcePlanner: "gemini-3",
        sourcePlannerFallback: "gpt-6.1-terra",
      });
      assert.deepEqual(ignored, [
        "anthropic",
        "openai",
        "defaultChoice",
        "chat",
        "sourcePlanner",
      ]);
      assert.equal(modelForChoice("anthropic"), DEFAULT_MODELS.anthropic);
      assert.equal(modelForChoice("openai"), DEFAULT_MODELS.openai);
      assert.equal(defaultSubmissionChoice(), DEFAULT_MODELS.defaultChoice);
      assert.equal(chatModel(), DEFAULT_MODELS.chat);
      assert.equal(sourcePlannerModel(), DEFAULT_MODELS.sourcePlanner);
      assert.equal(sourcePlannerFallbackModel(), "gpt-6.1-terra");
    });

    it("reads the doc at most once a minute", async () => {
      const db = configDb({ openai: "gpt-6.2-sol" });
      let at = 1000;
      const now = () => at;
      await refreshModelConfig(db, { now });
      assert.equal(modelForChoice("openai"), "gpt-6.2-sol");
      at += MODEL_CONFIG_TTL_MS - 1;
      await refreshModelConfig(db, { now });
      assert.equal(db.reads, 1);
      at += 1;
      await refreshModelConfig(db, { now });
      assert.equal(db.reads, 2);
    });

    // A cold-start burst must not let the second caller run on the defaults
    // while the first caller's read is still in flight.
    it("makes concurrent callers wait for the read in progress", async () => {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const db = configDb({ openai: "gpt-6.2-sol" });
      const slowDb = {
        collection: (name) => ({
          doc: (id) => ({
            async get() {
              await gate;
              return db.collection(name).doc(id).get();
            },
          }),
        }),
      };
      const first = refreshModelConfig(slowDb);
      const second = refreshModelConfig(slowDb);
      release();
      const [a, b] = await Promise.all([first, second]);
      assert.equal(a.openai, "gpt-6.2-sol");
      assert.equal(b.openai, "gpt-6.2-sol");
      assert.equal(db.reads, 1);
    });

    it("clears the read in progress even when Firestore throws immediately", async () => {
      let at = 0;
      const throwing = { collection() { throw new Error("no firestore"); } };
      await refreshModelConfig(throwing, { now: () => at });
      at += MODEL_CONFIG_TTL_MS;
      const db = configDb({ openai: "gpt-6.2-sol" });
      await refreshModelConfig(db, { now: () => at });
      assert.equal(db.reads, 1);
      assert.equal(modelForChoice("openai"), "gpt-6.2-sol");
    });

    it("returns to the defaults when the doc is deleted", async () => {
      let at = 0;
      await refreshModelConfig(configDb({ openai: "gpt-6.2-sol" }), { now: () => at });
      at += MODEL_CONFIG_TTL_MS;
      await refreshModelConfig(configDb(null), { now: () => at });
      assert.equal(modelForChoice("openai"), DEFAULT_MODELS.openai);
    });

    it("keeps the models in use when the doc cannot be read", async () => {
      let at = 0;
      await refreshModelConfig(configDb({ openai: "gpt-6.2-sol" }), { now: () => at });
      at += MODEL_CONFIG_TTL_MS;
      const models = await refreshModelConfig(configDb({}, { fail: true }), { now: () => at });
      assert.equal(models.openai, "gpt-6.2-sol");
      assert.equal(modelForChoice("openai"), "gpt-6.2-sol");
    });
  });
});
