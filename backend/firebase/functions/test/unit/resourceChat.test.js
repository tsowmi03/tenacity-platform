"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { HttpsError } = require("firebase-functions/v2/https");
const {
  chatAboutResourceImpl,
  validateChatAboutResourcePayload,
} = require("../../src/resources");
const {
  CHAT_LIMITS,
  UNSUMMARISED_FILE,
  normaliseFileSummaries,
} = require("../../src/resources/chatPrompt");
const { callAnthropicForResource } = require("../../src/resources/apiClient");
const { chatModel, providerForModel } = require("../../src/resources/modelRegistry");
const { callOpenAiForResource } = require("../../src/resources/openaiClient");

const actor = {
  uid: "tutor-1",
  email: "tutor@example.com",
  role: "tutor",
  claims: { role: "tutor" },
};

const FILE_A = { path: "resources/uploads/tutor-1/a.pdf", name: "Assessment notice.pdf" };
const FILE_B = { path: "resources/uploads/tutor-1/b.pdf", name: "March test.pdf" };

function basePayload(overrides = {}) {
  return validateChatAboutResourcePayload({
    studentId: "student-1",
    subject: "maths",
    year: 8,
    resourceType: "worksheet",
    answerMode: "worked",
    ...overrides,
  });
}

function snap(data) {
  return { exists: Boolean(data), data: () => data };
}

function fakeDb({ student = { firstName: "Mia", lastName: "Thompson" }, history = [], sourceJob = null } = {}) {
  const queries = [];
  return {
    queries,
    collection(name) {
      const query = {
        filters: [],
        where(field, op, value) {
          this.filters.push([field, op, value]);
          return this;
        },
        orderBy() { return this; },
        limit() { return this; },
        async get() {
          queries.push({ name, filters: this.filters });
          return { docs: history.map((data) => ({ data: () => data })) };
        },
        doc(id) {
          return {
            id,
            async get() {
              if (name === "students") return snap(student);
              if (name === "resourceJobs") return snap(sourceJob);
              return snap(null);
            },
          };
        },
      };
      return query;
    },
  };
}

function fakeStorage(downloads = []) {
  return {
    bucket() {
      return {
        file(path) {
          return {
            async download() {
              downloads.push(path);
              return [Buffer.from(`text of ${path}`)];
            },
          };
        },
      };
    },
  };
}

// Stands in for callAiForResource, which now only summarises reference files.
function fakeAi(calls, { fail = false } = {}) {
  return async (request) => {
    calls.push(request);
    if (fail) throw new Error("provider down");
    return { parsed: { summaries: [{ index: 0, summary: "Covers inequalities." }, { index: 1, summary: "Two-step equations." }] } };
  };
}

const respond = (input) => ({ type: "tool_use", id: "respond-1", name: "respond", input });

// A scripted Anthropic client for the assistant's tool loop. Each create()
// returns the next scripted response and records the request.
function fakeAnthropic(requests, script = [{ content: [respond({ reply: "What should it focus on?", proposal: null, suggestions: ["Propose an outline"] })] }]) {
  let turn = 0;
  return () => ({
    client: {
      messages: {
        async create(payload) {
          requests.push(JSON.parse(JSON.stringify(payload)));
          const next = script[Math.min(turn, script.length - 1)];
          turn += 1;
          if (next instanceof Error) throw next;
          return { stop_reason: "tool_use", ...next };
        },
      },
    },
    posthog: null,
  });
}

function deps(overrides = {}) {
  return {
    db: fakeDb(),
    storage: fakeStorage(),
    extractText: async (buffer) => buffer.toString(),
    anthropicApiKey: "a-key",
    openaiApiKey: "o-key",
    callAi: fakeAi([]),
    createAnthropicClient: fakeAnthropic([]),
    loadCoverage: async () => null,
    ...overrides,
  };
}

describe("validateChatAboutResourcePayload", () => {
  it("fills defaults for an opening turn", () => {
    const payload = validateChatAboutResourcePayload({
      studentId: "student-1",
      subject: "maths",
      year: 8,
      resourceType: "worksheet",
    });
    assert.equal(payload.answerMode, "none");
    assert.equal(payload.showMarks, false);
    assert.equal(payload.customPrompt, "");
    assert.deepEqual(payload.messages, []);
    assert.deepEqual(payload.fileSummaries, []);
  });

  it("accepts a form with no year or resource type yet (RES-102)", () => {
    const payload = validateChatAboutResourcePayload({ studentId: "student-1", subject: "maths", year: null, resourceType: "" });
    assert.equal(payload.year, null);
    assert.equal(payload.resourceType, null);
  });

  it("lets the transcript start with the tutor, but requires it to alternate", () => {
    const payload = basePayload({ messages: [{ role: "user", content: "hi" }] });
    assert.equal(payload.messages.length, 1);
    assert.throws(
      () => basePayload({
        messages: [
          { role: "assistant", content: "Questions?" },
          { role: "assistant", content: "Again?" },
        ],
      }),
      (err) => err instanceof HttpsError && err.code === "invalid-argument"
    );
  });

  it("requires a non-empty transcript to end on the tutor's message", () => {
    assert.throws(
      () => basePayload({ messages: [{ role: "assistant", content: "Questions?" }] }),
      (err) => err instanceof HttpsError && err.code === "invalid-argument"
    );
  });

  it("re-checks an earlier proposal instead of trusting it", () => {
    const payload = basePayload({
      messages: [
        { role: "user", content: "Help" },
        { role: "assistant", content: "Here", proposal: { resourceType: "study-guide", subject: "maths", answerMode: "worked", showMarks: true, sections: [], brief: "B" } },
        { role: "user", content: "Thanks" },
      ],
    });
    assert.deepEqual(payload.messages[1].proposal, {
      subject: "maths", resourceType: "study-guide", answerMode: "none", showMarks: false, sections: [], brief: "B",
    });
    assert.equal(payload.messages[0].proposal, null);
  });

  it("rejects over-long messages and English-only types for maths", () => {
    assert.throws(() => basePayload({
      messages: [
        { role: "assistant", content: "Questions?" },
        { role: "user", content: "x".repeat(CHAT_LIMITS.maxMessageChars + 1) },
      ],
    }));
    assert.throws(
      () => basePayload({ resourceType: "annotation-task" }),
      (err) => err instanceof HttpsError && err.code === "invalid-argument"
    );
  });
});

describe("chatAboutResourceImpl", () => {
  it("summarises attached files, then answers with the resource assistant", async () => {
    const calls = [];
    const requests = [];
    const downloads = [];
    const db = fakeDb({
      history: [
        { status: "complete", resourceType: "worksheet", year: 8, subject: "maths", extractedTopics: ["linear-equations"], customPrompt: "Linear equations", createdAt: new Date("2026-09-12T00:00:00Z") },
        { status: "failed", resourceType: "practice-paper", year: 8, subject: "maths", createdAt: new Date("2026-09-10T00:00:00Z") },
      ],
    });

    const result = await chatAboutResourceImpl({
      payload: basePayload({ uploadedFiles: [FILE_A, FILE_B] }),
      actor,
      deps: deps({ db, storage: fakeStorage(downloads), callAi: fakeAi(calls), createAnthropicClient: fakeAnthropic(requests) }),
    });

    assert.deepEqual(downloads, [FILE_A.path, FILE_B.path]);
    assert.equal(calls.length, 1, "only the file summaries use callAi");
    assert.match(calls[0].userMessage, /Document 0: Assessment notice\.pdf/);
    assert.equal(calls[0].model, "claude-sonnet-5-5", "summaries use the chat model");

    assert.equal(requests.length, 1);
    const chat = requests[0];
    assert.equal(chat.model, "claude-sonnet-5-5");
    assert.deepEqual(chat.thinking, { type: "between_tools" });
    assert.deepEqual(chat.output_config, { effort: "low" });
    assert.deepEqual(chat.tool_choice, { type: "auto" });
    assert.equal(chat.tools.at(-1).strict, true);
    assert.deepEqual(
      chat.tools.map((tool) => tool.name),
      ["get_resource_types", "get_bank_coverage", "get_diagram_types", "get_english_stimuli", "respond"]
    );
    const system = chat.system[0].text;
    assert.match(system, /Mia Thompson, a Year 8 Maths student/);
    assert.match(system, /type Worksheet, fully worked solutions, marks hidden/);
    assert.match(system, /1\. Assessment notice\.pdf: Covers inequalities\./);
    assert.match(system, /2026-09-12 · Worksheet .*linear-equations/);
    assert.doesNotMatch(system, /Practice Paper \(Year 8/, "only completed resources are history");
    assert.match(system, /What the generator can make for Maths/);
    assert.equal(chat.messages.length, 1);
    assert.equal(chat.messages[0].role, "user");

    assert.deepEqual(result, {
      reply: "What should it focus on?",
      proposal: null,
      proposedPrompt: "",
      suggestions: ["Propose an outline"],
      activity: [],
      fileSummaries: [
        { path: FILE_A.path, summary: "Covers inequalities." },
        { path: FILE_B.path, summary: "Two-step equations." },
      ],
      pastResources: [
        { resourceType: "worksheet", topics: ["linear-equations"], createdAt: "2026-09-12T00:00:00.000Z" },
      ],
    });
  });

  it("runs lookup tools, then returns the proposal and what it checked", async () => {
    const requests = [];
    const script = [
      {
        content: [
          { type: "text", text: "Let me check." },
          { type: "tool_use", id: "t1", name: "get_resource_types", input: { subject: "maths" } },
          { type: "tool_use", id: "t2", name: "get_bank_coverage", input: { subject: "maths", year: 8, topic: "simultaneous equations" } },
        ],
      },
      {
        content: [respond({
          reply: "A topic booklet fits better.",
          proposal: { subject: "maths", resourceType: "topic-booklet", answerMode: "worked", showMarks: false, sections: ["Worked examples", "Practice", "Quiz"], brief: "Focus on elimination." },
          suggestions: ["Make it shorter"],
        })],
      },
    ];
    const coverage = { maths: { total: 3, byCategory: { straight_line: { total: 3, byYear: { 8: 3 } } } }, english: { total: 0, byType: {} } };
    const result = await chatAboutResourceImpl({
      payload: basePayload({ messages: [{ role: "user", content: "Sam struggles with simultaneous equations" }] }),
      actor,
      deps: deps({ createAnthropicClient: fakeAnthropic(requests, script), loadCoverage: async () => coverage }),
    });

    assert.equal(requests.length, 2);
    const followUp = requests[1].messages;
    assert.equal(followUp.at(-2).role, "assistant");
    const results = followUp.at(-1).content;
    assert.deepEqual(results.map((r) => r.tool_use_id), ["t1", "t2"]);
    assert.match(results[0].content, /topic-booklet \(Topic Booklet\)/);
    assert.match(results[1].content, /straight-line graphs, simultaneous equations shown graphically.*: 3/);

    assert.deepEqual(result.proposal, {
      subject: "maths",
      resourceType: "topic-booklet",
      answerMode: "worked",
      showMarks: false,
      sections: ["Worked examples", "Practice", "Quiz"],
      brief: "Focus on elimination.",
    });
    assert.equal(result.proposedPrompt, "Focus on elimination.");
    assert.deepEqual(result.activity, ["Checked maths resource types", "Checked the maths bank for Year 8: simultaneous equations"]);
  });

  it("tells the model to reply on the last round, without forcing a tool", async () => {
    const requests = [];
    const lookup = { content: [{ type: "tool_use", id: "t", name: "get_diagram_types", input: {} }] };
    const script = [lookup, lookup, lookup, lookup, { content: [respond({ reply: "Done.", proposal: null, suggestions: [] })] }];
    const result = await chatAboutResourceImpl({
      payload: basePayload(),
      actor,
      deps: deps({ createAnthropicClient: fakeAnthropic(requests, script) }),
    });
    assert.equal(requests.length, 5);
    assert.ok(requests.every((r) => r.tool_choice.type === "auto"), "Sonnet 5.5 rejects a forced tool");
    assert.deepEqual(requests[4].messages.at(-1), { role: "system", content: requests[4].messages.at(-1).content });
    assert.match(requests[4].messages.at(-1).content, /Reply now by calling respond/);
    assert.notEqual(requests[3].messages.at(-1).role, "system");
    assert.equal(result.reply, "Done.");
    assert.deepEqual(result.activity, ["Checked diagram types"]);
  });

  it("reports a turn that never replies as unavailable", async () => {
    const lookup = { content: [{ type: "tool_use", id: "t", name: "get_diagram_types", input: {} }] };
    await assert.rejects(
      () => chatAboutResourceImpl({ payload: basePayload(), actor, deps: deps({ createAnthropicClient: fakeAnthropic([], [lookup]) }) }),
      (err) => err instanceof HttpsError && err.code === "unavailable"
    );
  });

  it("passes thinking blocks back unchanged between rounds", async () => {
    const requests = [];
    const thinking = { type: "thinking", thinking: "", signature: "sig-1" };
    const script = [
      { content: [thinking, { type: "tool_use", id: "t", name: "get_diagram_types", input: {} }] },
      { content: [respond({ reply: "Done.", proposal: null, suggestions: [] })] },
    ];
    await chatAboutResourceImpl({ payload: basePayload(), actor, deps: deps({ createAnthropicClient: fakeAnthropic(requests, script) }) });
    assert.deepEqual(requests[1].messages.at(-2).content[0], thinking);
  });

  it("keeps a plain-text answer when the model skips the respond tool", async () => {
    const result = await chatAboutResourceImpl({
      payload: basePayload(),
      actor,
      deps: deps({ createAnthropicClient: fakeAnthropic([], [{ content: [{ type: "text", text: "Which topic?" }], stop_reason: "end_turn" }]) }),
    });
    assert.equal(result.reply, "Which topic?");
    assert.equal(result.proposal, null);
  });

  it("drops a proposal the generator couldn't accept", async () => {
    const script = [{ content: [respond({ reply: "Try this.", proposal: { subject: "maths", resourceType: "podcast", answerMode: "none", showMarks: false, sections: [], brief: "x" }, suggestions: [] })] }];
    const result = await chatAboutResourceImpl({
      payload: basePayload(),
      actor,
      deps: deps({ createAnthropicClient: fakeAnthropic([], script) }),
    });
    assert.equal(result.proposal, null);
  });

  it("works before a year or resource type is chosen", async () => {
    const requests = [];
    await chatAboutResourceImpl({
      payload: basePayload({ year: null, resourceType: null, messages: [{ role: "user", content: "Ideas?" }] }),
      actor,
      deps: deps({ createAnthropicClient: fakeAnthropic(requests) }),
    });
    assert.match(requests[0].system[0].text, /year not set, no resource type chosen yet/);
    assert.deepEqual(requests[0].messages, [{ role: "user", content: "Ideas?" }]);
  });

  it("replays earlier proposals so the model sees what it suggested", async () => {
    const requests = [];
    await chatAboutResourceImpl({
      payload: basePayload({
        messages: [
          { role: "user", content: "Revision for Sam" },
          { role: "assistant", content: "How about this?", proposal: { subject: "maths", resourceType: "mixed-review", answerMode: "answers", showMarks: true, sections: ["Algebra"], brief: "Mix it up." } },
          { role: "user", content: "Shorter please" },
        ],
      }),
      actor,
      deps: deps({ createAnthropicClient: fakeAnthropic(requests) }),
    });
    const [first, second, third] = requests[0].messages;
    assert.deepEqual(first, { role: "user", content: "Revision for Sam" });
    assert.match(second.content, /How about this\?\n\n\[My proposal: Mixed Review, Maths, final answers only, marks shown; sections: Algebra\. Brief: "Mix it up\."\]/);
    assert.deepEqual(third, { role: "user", content: "Shorter please" });
  });

  it("still understands a RES-24 transcript with a draft prompt", async () => {
    const requests = [];
    await chatAboutResourceImpl({
      payload: basePayload({
        messages: [
          { role: "assistant", content: "Questions?", proposedPrompt: "Draft one." },
          { role: "user", content: "Inequalities please" },
        ],
      }),
      actor,
      deps: deps({ createAnthropicClient: fakeAnthropic(requests) }),
    });
    const messages = requests[0].messages;
    assert.equal(messages.length, 3);
    assert.equal(messages[0].role, "user", "an opening user turn comes first");
    assert.match(messages[1].content, /Questions\?\n\n\[My draft brief: "Draft one\."\]/);
  });

  it("reuses summaries the portal already holds and only reads new files", async () => {
    const downloads = [];
    const requests = [];
    await chatAboutResourceImpl({
      payload: basePayload({
        uploadedFiles: [FILE_A, FILE_B],
        fileSummaries: [
          { path: FILE_A.path, summary: "Known summary." },
          { path: "resources/uploads/tutor-1/removed.pdf", summary: "Stale." },
        ],
      }),
      actor,
      deps: deps({ storage: fakeStorage(downloads), createAnthropicClient: fakeAnthropic(requests) }),
    });
    assert.deepEqual(downloads, [FILE_B.path]);
    assert.match(requests[0].system[0].text, /Known summary\./);
    assert.doesNotMatch(requests[0].system[0].text, /Stale\./);
  });

  it("doesn't summarise when every file is already summarised", async () => {
    const calls = [];
    const result = await chatAboutResourceImpl({
      payload: basePayload({
        uploadedFiles: [FILE_A],
        fileSummaries: [{ path: FILE_A.path, summary: "Known." }],
      }),
      actor,
      deps: deps({ storage: null, callAi: fakeAi(calls) }),
    });
    assert.equal(calls.length, 0);
    assert.deepEqual(result.fileSummaries, []);
  });

  it("chats on Sonnet even when the tutor picked GPT for generation", async () => {
    const requests = [];
    await chatAboutResourceImpl({
      payload: basePayload({ modelChoice: "openai" }),
      actor,
      deps: deps({ createAnthropicClient: fakeAnthropic(requests) }),
    });
    assert.equal(chatModel(), "claude-sonnet-5-5");
    assert.equal(requests[0].model, chatModel());
    assert.equal(providerForModel(chatModel()), "anthropic");
  });

  it("starts from the current custom prompt when one exists", async () => {
    const requests = [];
    await chatAboutResourceImpl({
      payload: basePayload({ customPrompt: "Focus on index laws." }),
      actor,
      deps: deps({ createAnthropicClient: fakeAnthropic(requests) }),
    });
    assert.match(requests[0].system[0].text, /Current custom prompt: "Focus on index laws\."/);
    assert.match(requests[0].messages[0].content, /refine the current custom prompt/);
  });

  it("rejects reference files from another user's uploads", async () => {
    await assert.rejects(
      () => chatAboutResourceImpl({
        payload: basePayload({
          uploadedFiles: [{ path: "resources/uploads/other-tutor/x.pdf", name: "x.pdf" }],
        }),
        actor,
        deps: deps(),
      }),
      (err) => err instanceof HttpsError && err.code === "permission-denied"
    );
  });

  it("allows a source job's files when building on that job", async () => {
    const other = { path: "resources/uploads/other-tutor/x.pdf", name: "x.pdf" };
    const calls = [];
    await chatAboutResourceImpl({
      payload: basePayload({ uploadedFiles: [other], sourceJobId: "job-9" }),
      actor: { ...actor, role: "admin" },
      deps: deps({
        db: fakeDb({ sourceJob: { createdBy: "other-tutor", uploadedFiles: [other] } }),
        callAi: fakeAi(calls),
      }),
    });
    assert.equal(calls.length, 1);
  });

  it("rejects an unknown student", async () => {
    await assert.rejects(
      () => chatAboutResourceImpl({
        payload: basePayload(),
        actor,
        deps: deps({ db: fakeDb({ student: null }) }),
      }),
      (err) => err instanceof HttpsError && err.code === "not-found"
    );
  });

  it("reports a model failure as unavailable", async () => {
    await assert.rejects(
      () => chatAboutResourceImpl({
        payload: basePayload(),
        actor,
        deps: deps({ createAnthropicClient: fakeAnthropic([], [new Error("provider down")]) }),
      }),
      (err) => err instanceof HttpsError && err.code === "unavailable"
    );
  });

  it("reports an empty model reply as unavailable", async () => {
    await assert.rejects(
      () => chatAboutResourceImpl({
        payload: basePayload(),
        actor,
        deps: deps({ createAnthropicClient: fakeAnthropic([], [{ content: [respond({ reply: "", proposal: null, suggestions: [] })] }]) }),
      }),
      (err) => err instanceof HttpsError && err.code === "unavailable"
    );
  });

  it("reports a failed file summary as unavailable", async () => {
    await assert.rejects(
      () => chatAboutResourceImpl({
        payload: basePayload({ uploadedFiles: [FILE_A] }),
        actor,
        deps: deps({ callAi: fakeAi([], { fail: true }) }),
      }),
      (err) => err instanceof HttpsError && err.code === "unavailable"
    );
  });

  it("reports an unreadable reference file without calling the model", async () => {
    const calls = [];
    const requests = [];
    await assert.rejects(
      () => chatAboutResourceImpl({
        payload: basePayload({ uploadedFiles: [FILE_A] }),
        actor,
        deps: deps({
          callAi: fakeAi(calls),
          createAnthropicClient: fakeAnthropic(requests),
          extractText: async () => { throw new Error("corrupt PDF"); },
        }),
      }),
      (err) => err instanceof HttpsError && err.code === "failed-precondition"
    );
    assert.equal(calls.length, 0);
    assert.equal(requests.length, 0);
  });

  it("still replies when the student's history can't be loaded", async () => {
    const db = fakeDb();
    const original = db.collection.bind(db);
    db.collection = (name) => {
      const ref = original(name);
      ref.get = async () => { throw new Error("index missing"); };
      return ref;
    };
    const requests = [];
    const result = await chatAboutResourceImpl({
      payload: basePayload(),
      actor,
      deps: deps({ db, createAnthropicClient: fakeAnthropic(requests) }),
    });
    assert.equal(result.reply, "What should it focus on?");
    assert.match(requests[0].system[0].text, /No completed resources yet\./);
  });
});

describe("file summaries", () => {
  it("gives a skipped file a placeholder so it isn't re-read every turn", () => {
    const result = normaliseFileSummaries({ summaries: [{ index: 1, summary: "Second." }] }, [FILE_A, FILE_B]);
    assert.deepEqual(result, [
      { path: FILE_A.path, name: FILE_A.name, summary: UNSUMMARISED_FILE },
      { path: FILE_B.path, name: FILE_B.name, summary: "Second." },
    ]);
  });
});

describe("AI clients with a conversation", () => {
  const conversation = [
    { role: "user", content: "Start" },
    { role: "assistant", content: "{\"reply\":\"Q?\"}" },
    { role: "user", content: "Answer", proposedPrompt: "ignored" },
  ];

  it("sends the whole conversation to Anthropic", async () => {
    const calls = [];
    await callAnthropicForResource({
      apiKey: "k",
      model: "claude-opus-5-5",
      systemPrompt: "SYSTEM",
      messages: conversation,
      createClient: () => ({
        messages: {
          async create(payload) {
            calls.push(payload);
            return { content: [{ type: "text", text: "{\"ok\":true}" }] };
          },
        },
      }),
    });
    assert.deepEqual(calls[0].messages, [
      { role: "user", content: "Start" },
      { role: "assistant", content: "{\"reply\":\"Q?\"}" },
      { role: "user", content: "Answer" },
    ]);
  });

  it("sends the whole conversation to OpenAI as input items", async () => {
    const calls = [];
    await callOpenAiForResource({
      apiKey: "k",
      model: "gpt-6.1-sol",
      systemPrompt: "SYSTEM",
      messages: conversation,
      createClient: () => ({
        responses: {
          async create(payload) {
            calls.push(payload);
            return { status: "completed", output_text: "{\"ok\":true}", output: [] };
          },
        },
      }),
    });
    assert.equal(calls[0].instructions, "SYSTEM");
    assert.deepEqual(calls[0].input, [
      { role: "user", content: "Start" },
      { role: "assistant", content: "{\"reply\":\"Q?\"}" },
      { role: "user", content: "Answer" },
    ]);
  });

  it("still requires a message of some kind", async () => {
    await assert.rejects(
      () => callAnthropicForResource({ apiKey: "k", model: "m", systemPrompt: "S", messages: [] }),
      /requires userMessage or messages/
    );
  });
});
