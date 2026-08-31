"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  assertCompleteResponse,
  buildAnthropicSystemParam,
  callAnthropicForResource,
  extractJsonBlock,
  parseAiJsonResponse,
  repairJsonBackslashes,
  responseText,
  shouldStreamResponse,
  stripJsonCodeFence,
  streamResponseText,
} = require("../../src/resources/apiClient");
const {
  GLOBAL_RULES,
  buildSystemPrompt,
  buildUserMessage,
} = require("../../src/resources/promptBuilder");
const { DISABLED_SHAPE_DIAGRAM_TYPES } = require("../../src/resources/diagramPolicy");

describe("resource prompt builder", () => {
  it("builds the worksheet system prompt from the spec schema", () => {
    const prompt = buildSystemPrompt("worksheet", { year: 8, subject: "maths" });
    assert.match(prompt, /Tenacity Tutoring/);
    assert.match(prompt, /Year 8 maths student/);
    assert.match(prompt, /Return ONLY valid JSON/);
    assert.match(prompt, /"questions"/);
    // The diagram object is no longer written during generation — the question
    // names the type it needs and a later pass builds it.
    assert.match(prompt, /"diagram": null,/);
    assert.match(prompt, /"diagramType": string \(a diagram type name from the list below, or "none"\)/);
    assert.match(prompt, /"diagramRequired": boolean/);
    assert.match(prompt, /true when the question cannot be answered correctly without seeing the diagram/);
    assert.match(prompt, /"answers"/);
    assert.ok(prompt.startsWith(GLOBAL_RULES));
  });

  it("documents allowed worksheet diagram types and excludes disabled shapes", () => {
    const prompt = buildSystemPrompt("worksheet", { year: 8, subject: "maths" });

    for (const type of ["number-line", "coordinate-plane", "function-plot", "two-way-table"]) {
      assert.match(prompt, new RegExp(`\\b${type}\\b`));
    }
    for (const type of DISABLED_SHAPE_DIAGRAM_TYPES) {
      assert.doesNotMatch(prompt, new RegExp(`- ${type}:`));
    }
    assert.match(prompt, /Do not use diagrams for pure algebra or linear equations questions/);
  });

  it("does not ask practice, topic, or diagnostic templates for instruction fields", () => {
    for (const resourceType of ["practice-paper", "topic-booklet", "diagnostic-test"]) {
      const prompt = buildSystemPrompt(resourceType, { year: 8, subject: "maths" });
      assert.doesNotMatch(prompt, /"instructions"\s*:/);
    }
  });

  it("builds user messages with optional uploaded content and tutor instructions", () => {
    const message = buildUserMessage(
      {
        resourceType: "worksheet",
        year: 8,
        subject: "maths",
        customPrompt: "Focus on simultaneous equations.",
        uploadedFileName: "notification.pdf",
      },
      "Assessment reference text."
    );

    assert.match(message, /REFERENCE DOCUMENT \(notification\.pdf\)/);
    assert.match(message, /TUTOR INSTRUCTIONS/);
    assert.match(message, /Generate a worksheet for a Year 8 maths student/);
  });

  it("labels multiple reference documents separately", () => {
    const message = buildUserMessage(
      {
        resourceType: "practice-paper",
        year: 8,
        subject: "maths",
        customPrompt: "",
      },
      [
        { fileName: "paper.pdf", content: "Past paper content." },
        { fileName: "scope.docx", content: "Assessment scope content." },
      ]
    );

    assert.match(message, /REFERENCE DOCUMENT 1 \(paper\.pdf\)/);
    assert.match(message, /Past paper content/);
    assert.match(message, /REFERENCE DOCUMENT 2 \(scope\.docx\)/);
    assert.match(message, /Assessment scope content/);
  });

  it("builds prompts for every exposed resource type", () => {
    const resourceTypes = [
      "practice-paper",
      "topic-booklet",
      "study-guide",
      "worksheet",
      "diagnostic-test",
      "mixed-review",
      "annotation-task",
      "essay-scaffold",
      "custom",
    ];

    for (const resourceType of resourceTypes) {
      const prompt = buildSystemPrompt(resourceType, {
        year: 8,
        subject: resourceType.includes("essay") || resourceType.includes("annotation") ? "english" : "maths",
      });
      assert.match(prompt, /Return JSON matching this schema exactly/);
      assert.match(prompt, /"title": string/);
    }
  });

  it("injects the human writing and authorship rules into every resource type", () => {
    const resourceTypes = [
      "practice-paper",
      "topic-booklet",
      "study-guide",
      "worksheet",
      "diagnostic-test",
      "mixed-review",
      "annotation-task",
      "essay-scaffold",
      "custom",
    ];

    for (const resourceType of resourceTypes) {
      const prompt = buildSystemPrompt(resourceType, {
        year: 8,
        subject: resourceType.includes("essay") || resourceType.includes("annotation") ? "english" : "maths",
      });
      assert.match(prompt, /NEVER use em-dashes/);
      assert.match(prompt, /\bdelve\b/);
      assert.match(prompt, /not only X but also Y/);
      assert.doesNotMatch(prompt, /Tenacity Resources/);
      assert.match(prompt, /Never write a credit, byline, attribution or source line/);
      assert.match(prompt, /public domain/i);
    }
  });

  it("lets the annotation task use a public-domain text or its own unattributed passage", () => {
    const prompt = buildSystemPrompt("annotation-task", { year: 9, subject: "english" });
    assert.match(prompt, /set "passageAuthor" to null for any passage you write yourself/);
    assert.match(prompt, /genuine public-domain text/);
    assert.match(prompt, /Do not use copyright text unless the tutor supplies it/);
  });

  it("uses marking guides instead of answer keys for English practice resources", () => {
    const resourceTypes = [
      "practice-paper",
      "topic-booklet",
      "worksheet",
      "diagnostic-test",
      "mixed-review",
      "annotation-task",
    ];

    for (const resourceType of resourceTypes) {
      const prompt = buildSystemPrompt(resourceType, { year: 8, subject: "english" });
      assert.match(prompt, /"markingGuide"/);
      assert.match(prompt, /marking guide/i);
      assert.doesNotMatch(prompt, /"workingOut"/);
    }
  });

  it("supports question-only resources without generating answer content", () => {
    const mathsPrompt = buildSystemPrompt("worksheet", {
      year: 8,
      subject: "maths",
      answerMode: "none",
    });
    assert.match(mathsPrompt, /Do not include answers or worked solutions/);
    assert.match(mathsPrompt, /"answers": \[\]/);
    assert.doesNotMatch(mathsPrompt, /"workingOut": string/);

    const englishPrompt = buildSystemPrompt("annotation-task", {
      year: 8,
      subject: "english",
      answerMode: "none",
    });
    assert.match(englishPrompt, /Do not include answers, suggested responses/);
    assert.match(englishPrompt, /"markingGuide": \[\]/);
  });

  it("supports final answers and worked answers as separate modes", () => {
    const answersPrompt = buildSystemPrompt("worksheet", {
      year: 8,
      subject: "maths",
      answerMode: "answers",
    });
    const workedPrompt = buildSystemPrompt("worksheet", {
      year: 8,
      subject: "maths",
      answerMode: "worked",
    });

    assert.match(answersPrompt, /"workingOut": null/);
    assert.match(workedPrompt, /"workingOut": string/);
  });
});

describe("resource Anthropic client", () => {
  it("adds prompt caching to the system prompt", () => {
    assert.deepEqual(
      buildAnthropicSystemParam({ systemPrompt: "SYSTEM" }),
      [{ type: "text", text: "SYSTEM", cache_control: { type: "ephemeral" } }]
    );
  });

  // Caching used to be gated on an exact match against the Sonnet 4.6 model id,
  // which meant any model change silently switched it off. It is now applied
  // regardless of model, so an upgrade cannot regress caching by accident.
  it("adds prompt caching regardless of which model is in use", () => {
    assert.deepEqual(
      buildAnthropicSystemParam({
        model: "some-future-model",
        systemPrompt: "SYSTEM",
      }),
      [{ type: "text", text: "SYSTEM", cache_control: { type: "ephemeral" } }]
    );
  });

  it("strips JSON code fences before parsing", () => {
    assert.equal(stripJsonCodeFence("```json\n{\"ok\":true}\n```"), "{\"ok\":true}");
    assert.deepEqual(parseAiJsonResponse("```json\n{\"ok\":true}\n```"), { ok: true });
  });

  it("extracts JSON from within a code fence block (extractJsonBlock)", () => {
    // Standard fence
    assert.equal(extractJsonBlock("```json\n{\"a\":1}\n```"), "{\"a\":1}");
    // Fence without language tag
    assert.equal(extractJsonBlock("```\n{\"a\":1}\n```"), "{\"a\":1}");
    // Falls back to brace extraction when no fence present
    assert.equal(extractJsonBlock("Here is the JSON: {\"a\":1} done."), "{\"a\":1}");
    // Returns original string when nothing to extract
    assert.equal(extractJsonBlock("no json here"), "no json here");
  });

  it("parses JSON even when the AI adds trailing text after the closing fence", () => {
    const withTrailing = "```json\n{\"ok\":true}\n```\n\nHere is a summary of what I generated.";
    assert.deepEqual(parseAiJsonResponse(withTrailing), { ok: true });
  });

  it("parses JSON when there is explanatory text before the fence", () => {
    const withLeading = "Sure, here is the JSON:\n```json\n{\"ok\":true}\n```";
    assert.deepEqual(parseAiJsonResponse(withLeading), { ok: true });
  });

  it("falls back to brace extraction when fence markers are absent", () => {
    const noFence = "Here is your output: {\"title\":\"Test\",\"questions\":[]} — enjoy!";
    assert.deepEqual(parseAiJsonResponse(noFence), { title: "Test", questions: [] });
  });

  it("returns parsed JSON and raw text from the SDK response", async () => {
    const calls = [];
    const result = await callAnthropicForResource({
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      systemPrompt: "SYSTEM",
      userMessage: "USER",
      createClient: () => ({
        messages: {
          async create(payload) {
            calls.push(payload);
            return { content: [{ type: "text", text: "{\"title\":\"Worksheet\"}" }] };
          },
        },
      }),
    });

    assert.deepEqual(result, {
      parsed: { title: "Worksheet" },
      raw: "{\"title\":\"Worksheet\"}",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      responseId: null,
      usage: {
        inputTokens: 0,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
      },
    });
    // No effort requested, so no thinking: small-budget callers such as the
    // public-domain text lookups must keep their whole max_tokens for output.
    assert.deepEqual(calls[0], {
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: [{ type: "text", text: "SYSTEM", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "USER" }],
    });
    assert.equal("thinking" in calls[0], false);
  });

  it("passes the requested effort level through to the API", async () => {
    const calls = [];
    await callAnthropicForResource({
      apiKey: "test-key",
      model: "claude-opus-5",
      systemPrompt: "SYSTEM",
      userMessage: "USER",
      effort: "medium",
      createClient: () => ({
        messages: {
          async create(payload) {
            calls.push(payload);
            return { content: [{ type: "text", text: "{}" }] };
          },
        },
      }),
    });

    assert.deepEqual(calls[0].output_config, { effort: "medium" });
    assert.deepEqual(calls[0].thinking, { type: "adaptive" });
  });

  it("sends a response schema as output_config.format alongside effort", async () => {
    const calls = [];
    const responseSchema = {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
      additionalProperties: false,
    };
    await callAnthropicForResource({
      apiKey: "test-key",
      model: "claude-opus-5",
      systemPrompt: "SYSTEM",
      userMessage: "USER",
      effort: "high",
      responseSchema,
      createClient: () => ({
        messages: {
          async create(payload) {
            calls.push(payload);
            return { content: [{ type: "text", text: "{\"title\":\"Ok\"}" }] };
          },
        },
      }),
    });

    // effort and format share output_config — adding the schema must not drop
    // the effort level that was already there.
    assert.deepEqual(calls[0].output_config, {
      effort: "high",
      format: { type: "json_schema", schema: responseSchema },
    });
  });

  it("sends output_config.format on its own when no effort is requested", async () => {
    const calls = [];
    const responseSchema = {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    };
    await callAnthropicForResource({
      apiKey: "test-key",
      model: "claude-opus-5",
      systemPrompt: "SYSTEM",
      userMessage: "USER",
      responseSchema,
      createClient: () => ({
        messages: {
          async create(payload) {
            calls.push(payload);
            return { content: [{ type: "text", text: "{}" }] };
          },
        },
      }),
    });

    assert.deepEqual(calls[0].output_config, {
      format: { type: "json_schema", schema: responseSchema },
    });
    assert.equal("thinking" in calls[0], false);
  });

  it("omits output_config entirely when neither effort nor schema is set", async () => {
    const calls = [];
    await callAnthropicForResource({
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      systemPrompt: "SYSTEM",
      userMessage: "USER",
      createClient: () => ({
        messages: {
          async create(payload) {
            calls.push(payload);
            return { content: [{ type: "text", text: "{}" }] };
          },
        },
      }),
    });

    assert.equal("output_config" in calls[0], false);
  });

  it("reports a refusal as a refusal rather than a missing text block", async () => {
    await assert.rejects(
      callAnthropicForResource({
        apiKey: "test-key",
        model: "claude-opus-5",
        systemPrompt: "SYSTEM",
        userMessage: "USER",
        createClient: () => ({
          messages: {
            async create() {
              // A refused response is HTTP 200 with no text content at all.
              return {
                content: [],
                stop_reason: "refusal",
                stop_details: { type: "refusal", category: "cyber" },
              };
            },
          },
        }),
      }),
      (err) => {
        assert.equal(err.refusal, true);
        assert.equal(err.refusalCategory, "cyber");
        assert.match(err.message, /declined/i);
        return true;
      }
    );
  });

  it("streams long responses while keeping the same parsed result shape", async () => {
    const calls = [];
    const result = await callAnthropicForResource({
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      systemPrompt: "SYSTEM",
      userMessage: "USER",
      maxTokens: 24000,
      createClient: () => ({
        messages: {
          async create(payload) {
            calls.push(payload);
            return [
              { type: "content_block_delta", delta: { type: "text_delta", text: "{\"title\":" } },
              { type: "content_block_delta", delta: { type: "text_delta", text: "\"Worksheet\"}" } },
              { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null } },
            ];
          },
        },
      }),
    });

    assert.deepEqual(result, {
      parsed: { title: "Worksheet" },
      raw: "{\"title\":\"Worksheet\"}",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      responseId: null,
      usage: {
        inputTokens: 0,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
      },
    });
    assert.equal(calls[0].stream, true);
    assert.equal(calls[0].max_tokens, 24000);
  });

  it("detects truncated streamed responses", async () => {
    const stream = [
      { type: "content_block_delta", delta: { type: "text_delta", text: "{\"title\":\"Worksheet\"" } },
      { type: "message_delta", delta: { stop_reason: "max_tokens", stop_sequence: null } },
    ];
    const response = await streamResponseText(stream);

    assert.throws(
      () => assertCompleteResponse(response, responseText(response), 24000),
      (err) => err.stopReason === "max_tokens" && /truncated/.test(err.message)
    );
  });

  it("streams only when the non-streaming SDK timeout guard would apply", () => {
    assert.equal(shouldStreamResponse(8000), false);
    assert.equal(shouldStreamResponse(21000), false);
    assert.equal(shouldStreamResponse(24000), true);
  });

  it("rejects responses cut off by max_tokens before JSON parsing", async () => {
    await assert.rejects(
      () =>
        callAnthropicForResource({
          apiKey: "test-key",
          model: "claude-sonnet-4-6",
          systemPrompt: "SYSTEM",
          userMessage: "USER",
          maxTokens: 12,
          createClient: () => ({
            messages: {
              async create() {
                return {
                  content: [{ type: "text", text: "{\"title\":\"Worksheet\"" }],
                  stop_reason: "max_tokens",
                };
              },
            },
          }),
        }),
      (err) =>
        err.rawAiText === "{\"title\":\"Worksheet\"" &&
        err.stopReason === "max_tokens" &&
        err.maxTokens === 12 &&
        /truncated/.test(err.message)
    );
  });

  it("passes through complete responses regardless of stop metadata", () => {
    assert.doesNotThrow(() => assertCompleteResponse({ stop_reason: "end_turn" }, "{}", 8000));
  });

  it("attaches raw text when JSON parsing fails", () => {
    assert.throws(
      () => parseAiJsonResponse("not json"),
      (err) => err.rawAiText === "not json" && /not valid JSON/.test(err.message)
    );
  });

  describe("single-backslash LaTeX in AI JSON", () => {
    // The model is asked for inline LaTeX (\frac, \beta, …) AND valid JSON, but
    // it routinely emits a single backslash. Without repair, JSON.parse turns
    // \frac into U+000C (form-feed) and \beta into U+0008 — both illegal in XML
    // 1.0, which makes the generated .docx unopenable in Word.
    const NO_XML_ILLEGAL = /^[^\x00-\x08\x0B\x0C\x0E-\x1F]*$/; // eslint-disable-line no-control-regex

    it("preserves \\frac instead of decoding it to a form-feed", () => {
      const parsed = parseAiJsonResponse('{"stem":"Simplify \\frac{x}{3} + \\frac{2x}{5}"}');
      assert.equal(parsed.stem, "Simplify \\frac{x}{3} + \\frac{2x}{5}");
      assert.match(parsed.stem, NO_XML_ILLEGAL);
    });

    it("keeps \\beta, \\times and \\neq as literal LaTeX (no control chars)", () => {
      const parsed = parseAiJsonResponse('{"stem":"If \\beta \\times 2 \\neq y"}');
      assert.equal(parsed.stem, "If \\beta \\times 2 \\neq y");
      assert.match(parsed.stem, NO_XML_ILLEGAL);
    });

    it("parses commands that are invalid JSON escapes (\\sqrt, \\cdot) without throwing", () => {
      const parsed = parseAiJsonResponse('{"stem":"\\sqrt{2} \\cdot \\pi"}');
      assert.equal(parsed.stem, "\\sqrt{2} \\cdot \\pi");
    });

    it("leaves already-escaped backslashes and other escapes untouched", () => {
      const parsed = parseAiJsonResponse('{"a":"\\\\frac{1}{2}","b":"say \\"hi\\"","c":"caf\\u00e9"}');
      assert.deepEqual(parsed, { a: "\\frac{1}{2}", b: 'say "hi"', c: "café" });
    });

    it("repairJsonBackslashes only doubles lone backslashes", () => {
      assert.equal(repairJsonBackslashes('{"t":"\\frac"}'), '{"t":"\\\\frac"}');
      assert.equal(repairJsonBackslashes('{"t":"\\\\frac"}'), '{"t":"\\\\frac"}');
      assert.equal(repairJsonBackslashes('{"t":"\\u00e9"}'), '{"t":"\\u00e9"}');
    });
  });

  describe("prose vs maths backslash vocabulary", () => {
    const LITERAL_BACKSLASH_N = "\\n"; // backslash + n, the corruption tell

    it("prose mode keeps \\n\\n as real paragraph breaks (the booklet bug)", () => {
      // Exactly what the model emitted for the English topic booklet: literal
      // \n newlines, including a single \n before a capitalised word
      // (\\nMetaphors) that a lookahead heuristic would mistake for a command.
      const raw =
        '{"content":"Every story has a structure.\\n\\nThe five stages are:\\n\\n1. Orientation introduces the setting.\\nMetaphors and similes enrich it."}';
      const parsed = parseAiJsonResponse(raw, { mathBearing: false });

      assert.ok(
        !parsed.content.includes(LITERAL_BACKSLASH_N),
        "no literal backslash-n should survive in prose"
      );
      assert.equal(
        parsed.content,
        "Every story has a structure.\n\nThe five stages are:\n\n1. Orientation introduces the setting.\nMetaphors and similes enrich it."
      );
      assert.equal(parsed.content.split("\n\n").length, 3);
    });

    it("prose mode still parses a stray non-escape backslash without throwing", () => {
      const parsed = parseAiJsonResponse('{"path":"save to C:\\Users then stop"}', {
        mathBearing: false,
      });
      assert.equal(parsed.path, "save to C:\\Users then stop");
    });

    it("maths mode preserves LaTeX commands as literal backslashes", () => {
      const raw = '{"stem":"\\frac{1}{2} \\neq \\beta \\times \\sqrt{2} \\cdot \\pi"}';
      const parsed = parseAiJsonResponse(raw, { mathBearing: true });
      assert.equal(parsed.stem, "\\frac{1}{2} \\neq \\beta \\times \\sqrt{2} \\cdot \\pi");
    });

    it("maths mode keeps real \\n\\n newlines in an explanation containing LaTeX", () => {
      // The latent corruption the blunt repair introduced for maths prose too.
      const raw =
        '{"explanation":"First isolate the term.\\n\\nThen apply \\frac{a}{b} to both sides."}';
      const parsed = parseAiJsonResponse(raw, { mathBearing: true });
      assert.ok(!parsed.explanation.includes(LITERAL_BACKSLASH_N));
      assert.equal(
        parsed.explanation,
        "First isolate the term.\n\nThen apply \\frac{a}{b} to both sides."
      );
    });

    it("defaults to maths vocabulary when no flag is given", () => {
      const parsed = parseAiJsonResponse('{"stem":"\\frac{x}{3}"}');
      assert.equal(parsed.stem, "\\frac{x}{3}");
    });
  });

  describe("backslash repair invariants", () => {
    const NO_XML_ILLEGAL = /^[^\x00-\x08\x0B\x0C\x0E-\x1F]*$/; // eslint-disable-line no-control-regex

    it("renderer LaTeX vocabulary is a subset of LATEX_COMMANDS (drift guard)", () => {
      const fs = require("node:fs");
      const path = require("node:path");
      const { LATEX_COMMANDS } = require("../../src/resources/aiJsonRepair");
      const src = fs.readFileSync(
        path.join(__dirname, "../../src/resources/builder/shared.js"),
        "utf8"
      );

      const found = new Set();
      // Single-command regexes / replacements: \\times, \\frac, "\\frac", …
      for (const m of src.matchAll(/\\\\([a-zA-Z]+)/g)) found.add(m[1]);
      // Alternation groups: \\(?:text|mathrm|mathbf|…)
      for (const m of src.matchAll(/\\\\\(\?:([a-zA-Z|]+)\)/g)) {
        for (const cmd of m[1].split("|")) if (cmd) found.add(cmd);
      }

      assert.ok(found.size > 20, `drift guard found too few commands (${found.size})`);
      const missing = [...found].filter((cmd) => !LATEX_COMMANDS.has(cmd));
      assert.deepEqual(
        missing,
        [],
        `commands rendered by shared.js but missing from LATEX_COMMANDS: ${missing.join(", ")}`
      );
    });

    // Bare LaTeX commands plus the prose-safe fragments below.
    const MATHS_FRAGMENTS = [
      "\\frac{a}{b}", "\\neq", "\\beta", "\\times", "\\sqrt{2}", "\\pi",
      "\\sqrt", "\\cdot", "\\theta", "\\rho", "\\nabla",
    ];
    // Fragments that are valid in prose: newlines, tabs, stray backslashes,
    // escaped quotes, unicode, and escaped symbols — but no bare LaTeX commands.
    const PROSE_FRAGMENTS = [
      "\\n\\n", "\\nNext", "\\tIndented", "line one\\nline two",
      "C:\\Users", "say \\\"hi\\\"", "caf\\u00e9",
      "100\\% sure", "a \\& b", "set \\{1,2\\}",
    ];

    function fuzz(pool, mathBearing, assertClean) {
      for (let n = 0; n < 300; n++) {
        let body = "";
        const count = 1 + (n % 5);
        for (let k = 0; k < count; k++) {
          body += pool[(n * 7 + k * 13) % pool.length] + " ";
        }
        const raw = `{"v":"${body.trim()}"}`;
        let parsed;
        assert.doesNotThrow(() => {
          parsed = parseAiJsonResponse(raw, { mathBearing });
        }, `threw on: ${raw} (mathBearing=${mathBearing})`);
        if (assertClean) {
          assert.match(parsed.v, NO_XML_ILLEGAL, `illegal char from: ${raw}`);
        }
      }
    }

    it("never throws on any fragment mix in either mode", () => {
      const all = [...MATHS_FRAGMENTS, ...PROSE_FRAGMENTS];
      fuzz(all, true, false);
      fuzz(all, false, false);
    });

    it("maths mode produces no XML-illegal chars for maths+prose content", () => {
      fuzz([...MATHS_FRAGMENTS, ...PROSE_FRAGMENTS], true, true);
    });

    it("prose mode produces no XML-illegal chars for prose content", () => {
      fuzz(PROSE_FRAGMENTS, false, true);
    });

    it("safety net: stripXmlIllegalChars cleans stray LaTeX that slips into prose", () => {
      // If the model wrongly emits bare \frac in an English doc, prose mode
      // decodes \f to a form-feed at the parse layer — illegal in XML 1.0 — but
      // the shared text helpers strip it so the .docx still opens.
      const { stripXmlIllegalChars } = require("../../src/resources/builder/shared");
      const parsed = parseAiJsonResponse('{"v":"a \\frac b"}', { mathBearing: false });
      assert.doesNotMatch(parsed.v, NO_XML_ILLEGAL); // raw parse contains the form-feed
      assert.match(stripXmlIllegalChars(parsed.v), NO_XML_ILLEGAL); // net removes it
    });
  });
});
