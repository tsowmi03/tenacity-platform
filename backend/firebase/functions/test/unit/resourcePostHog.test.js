"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createPostHogClient,
  posthogRequestFields,
  shutdownPostHogClient,
} = require("../../src/resources/posthogClient");
const { callAnthropicForResource } = require("../../src/resources/apiClient");
const { callOpenAiForResource } = require("../../src/resources/openaiClient");

const POSTHOG_FIELDS = {
  posthogProperties: { $ai_session_id: "resource-job:job-1" },
  posthogTraceId: "attempt-1",
  posthogDistinctId: "tutor-uid",
};

function fakePostHog() {
  return {
    shutdowns: 0,
    async shutdown() {
      this.shutdowns += 1;
    },
  };
}

function anthropicClient(calls) {
  return {
    messages: {
      async create(payload) {
        calls.push(payload);
        return { content: [{ type: "text", text: "{\"ok\":true}" }] };
      },
    },
  };
}

function openAiClient(calls) {
  return {
    responses: {
      async create(payload) {
        calls.push(payload);
        return { status: "completed", output_text: "{\"ok\":true}", output: [] };
      },
    },
  };
}

describe("PostHog LLM analytics for resource generation", () => {
  it("is off without a project token, including outside a function invocation", () => {
    assert.equal(createPostHogClient(), null);
    assert.equal(createPostHogClient({ projectToken: "" }), null);
  });

  it("creates a client that sends prompts in full and flushes per call", () => {
    let created;
    class FakePostHog {
      constructor(token, options) {
        created = { token, options };
      }
    }

    const client = createPostHogClient({
      projectToken: "phc_test",
      host: "https://us.i.posthog.com",
      PostHogClass: FakePostHog,
    });

    assert.ok(client instanceof FakePostHog);
    assert.equal(created.token, "phc_test");
    assert.equal(created.options.privacyMode, false);
    assert.equal(created.options.flushAt, 1);
  });

  it("never throws: a client that cannot be built leaves analytics off", () => {
    class Broken {
      constructor() {
        throw new Error("bad config");
      }
    }
    assert.equal(
      createPostHogClient({ projectToken: "phc_test", PostHogClass: Broken }),
      null
    );
  });

  it("swallows a failed shutdown", async () => {
    await shutdownPostHogClient({
      async shutdown() {
        throw new Error("network down");
      },
    });
    await shutdownPostHogClient(null);
  });

  it("only adds the PostHog fields for the wrapped client", () => {
    assert.deepEqual(posthogRequestFields(null, POSTHOG_FIELDS), {});
    assert.deepEqual(posthogRequestFields(fakePostHog(), POSTHOG_FIELDS), POSTHOG_FIELDS);
  });

  describe("Anthropic calls", () => {
    it("send no PostHog fields to the plain client when analytics is off", async () => {
      const calls = [];
      const result = await callAnthropicForResource({
        apiKey: "k",
        model: "claude-opus-5-5",
        systemPrompt: "S",
        userMessage: "U",
        ...POSTHOG_FIELDS,
        createClient: () => ({ client: anthropicClient(calls), posthog: null }),
      });

      assert.deepEqual(result.parsed, { ok: true });
      for (const field of Object.keys(POSTHOG_FIELDS)) {
        assert.equal(field in calls[0], false, `${field} must not reach the API`);
      }
    });

    it("pass the fields to the wrapped client and flush once", async () => {
      const calls = [];
      const posthog = fakePostHog();
      await callAnthropicForResource({
        apiKey: "k",
        model: "claude-opus-5-5",
        systemPrompt: "S",
        userMessage: "U",
        ...POSTHOG_FIELDS,
        createClient: () => ({ client: anthropicClient(calls), posthog }),
      });

      assert.equal(calls[0].posthogDistinctId, "tutor-uid");
      assert.equal(calls[0].posthogTraceId, "attempt-1");
      assert.equal(posthog.shutdowns, 1);
    });

    it("flush even when the model call fails", async () => {
      const posthog = fakePostHog();
      await assert.rejects(() =>
        callAnthropicForResource({
          apiKey: "k",
          model: "claude-opus-5-5",
          systemPrompt: "S",
          userMessage: "U",
          createClient: () => ({
            client: {
              messages: {
                async create() {
                  throw new Error("overloaded");
                },
              },
            },
            posthog,
          }),
        })
      );
      assert.equal(posthog.shutdowns, 1);
    });
  });

  describe("OpenAI calls", () => {
    it("send no PostHog fields to the plain client when analytics is off", async () => {
      const calls = [];
      const result = await callOpenAiForResource({
        apiKey: "k",
        model: "gpt-5.6-sol",
        systemPrompt: "S",
        userMessage: "U",
        ...POSTHOG_FIELDS,
        createClient: () => ({ client: openAiClient(calls), posthog: null }),
      });

      assert.deepEqual(result.parsed, { ok: true });
      for (const field of Object.keys(POSTHOG_FIELDS)) {
        assert.equal(field in calls[0], false, `${field} must not reach the API`);
      }
    });

    it("pass the fields to the wrapped client and flush once", async () => {
      const calls = [];
      const posthog = fakePostHog();
      await callOpenAiForResource({
        apiKey: "k",
        model: "gpt-5.6-sol",
        systemPrompt: "S",
        userMessage: "U",
        ...POSTHOG_FIELDS,
        createClient: () => ({ client: openAiClient(calls), posthog }),
      });

      assert.equal(calls[0].posthogDistinctId, "tutor-uid");
      assert.equal(posthog.shutdowns, 1);
    });
  });
});
