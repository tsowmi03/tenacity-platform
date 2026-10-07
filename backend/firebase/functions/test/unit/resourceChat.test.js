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
  buildChatMessages,
  buildChatSystemPrompt,
  normaliseChatReply,
  normaliseFileSummaries,
} = require("../../src/resources/chatPrompt");
const { callAnthropicForResource } = require("../../src/resources/apiClient");
const { CHAT_MODEL, providerForModel } = require("../../src/resources/modelRegistry");
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

// Stands in for callAiForResource: summary requests get summaries, chat
// requests get a canned reply. Records every request.
function fakeAi(calls, { reply = {}, fail = false } = {}) {
  return async (request) => {
    calls.push(request);
    if (fail) throw new Error("provider down");
    if (request.responseSchema?.required?.includes("summaries")) {
      return { parsed: { summaries: [{ index: 0, summary: "Covers inequalities." }, { index: 1, summary: "Two-step equations." }] } };
    }
    return {
      parsed: {
        reply: "What should it focus on?",
        proposedPrompt: "",
        suggestions: ["Propose an outline"],
        ...reply,
      },
    };
  };
}

function deps(overrides = {}) {
  return {
    db: fakeDb(),
    storage: fakeStorage(),
    extractText: async (buffer) => buffer.toString(),
    anthropicApiKey: "a-key",
    openaiApiKey: "o-key",
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

  it("requires the transcript to alternate from the assistant's opening", () => {
    assert.throws(
      () => basePayload({ messages: [{ role: "user", content: "hi" }] }),
      (err) => err instanceof HttpsError && err.code === "invalid-argument"
    );
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
  it("summarises attached files on the opening turn and returns the summaries", async () => {
    const calls = [];
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
      deps: deps({ db, storage: fakeStorage(downloads), callAi: fakeAi(calls) }),
    });

    assert.deepEqual(downloads, [FILE_A.path, FILE_B.path]);
    assert.equal(calls.length, 2);
    assert.match(calls[0].userMessage, /Document 0: Assessment notice\.pdf/);
    assert.match(calls[0].userMessage, /text of resources\/uploads\/tutor-1\/a\.pdf/);

    const chat = calls[1];
    assert.equal(chat.model, "claude-sonnet-5-5");
    assert.equal(calls[0].model, "claude-sonnet-5-5", "summaries use the chat model");
    assert.equal(chat.effort, "low");
    assert.equal(chat.mathBearing, false);
    assert.match(chat.systemPrompt, /worksheet for Mia Thompson, a Year 8 Maths student/);
    assert.match(chat.systemPrompt, /1\. Assessment notice\.pdf: Covers inequalities\./);
    assert.match(chat.systemPrompt, /2026-09-12 · worksheet .*linear-equations/);
    assert.doesNotMatch(chat.systemPrompt, /practice paper/, "only completed resources are history");
    assert.equal(chat.messages.length, 1);
    assert.equal(chat.messages[0].role, "user");

    assert.deepEqual(result, {
      reply: "What should it focus on?",
      proposedPrompt: "",
      suggestions: ["Propose an outline"],
      fileSummaries: [
        { path: FILE_A.path, summary: "Covers inequalities." },
        { path: FILE_B.path, summary: "Two-step equations." },
      ],
      pastResources: [
        { resourceType: "worksheet", topics: ["linear-equations"], createdAt: "2026-09-12T00:00:00.000Z" },
      ],
    });
  });

  it("reuses summaries the portal already holds and only reads new files", async () => {
    const calls = [];
    const downloads = [];
    await chatAboutResourceImpl({
      payload: basePayload({
        uploadedFiles: [FILE_A, FILE_B],
        fileSummaries: [
          { path: FILE_A.path, summary: "Known summary." },
          { path: "resources/uploads/tutor-1/removed.pdf", summary: "Stale." },
        ],
        messages: [
          { role: "assistant", content: "Questions?", proposedPrompt: "Draft one." },
          { role: "user", content: "Inequalities please" },
        ],
      }),
      actor,
      deps: deps({ storage: fakeStorage(downloads), callAi: fakeAi(calls) }),
    });

    assert.deepEqual(downloads, [FILE_B.path]);
    const chat = calls.at(-1);
    assert.match(chat.systemPrompt, /Known summary\./);
    assert.doesNotMatch(chat.systemPrompt, /Stale\./);
    assert.equal(chat.messages.length, 3);
    assert.deepEqual(JSON.parse(chat.messages[1].content), {
      reply: "Questions?",
      proposedPrompt: "Draft one.",
      suggestions: [],
    });
    assert.deepEqual(chat.messages[2], { role: "user", content: "Inequalities please" });
  });

  it("makes a single model call when every file is already summarised", async () => {
    const calls = [];
    const result = await chatAboutResourceImpl({
      payload: basePayload({
        uploadedFiles: [FILE_A],
        fileSummaries: [{ path: FILE_A.path, summary: "Known." }],
      }),
      actor,
      deps: deps({ storage: null, callAi: fakeAi(calls) }),
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(result.fileSummaries, []);
  });

  it("chats on Sonnet even when the tutor picked GPT for generation", async () => {
    const calls = [];
    await chatAboutResourceImpl({
      payload: basePayload({ modelChoice: "openai" }),
      actor,
      deps: deps({ callAi: fakeAi(calls) }),
    });
    assert.equal(CHAT_MODEL, "claude-sonnet-5-5");
    assert.equal(calls[0].model, CHAT_MODEL);
    assert.equal(providerForModel(CHAT_MODEL), "anthropic");
  });

  it("starts from the current custom prompt when one exists", async () => {
    const calls = [];
    await chatAboutResourceImpl({
      payload: basePayload({ customPrompt: "Focus on index laws." }),
      actor,
      deps: deps({ callAi: fakeAi(calls) }),
    });
    assert.match(calls[0].systemPrompt, /Current custom prompt: "Focus on index laws\."/);
    assert.match(calls[0].messages[0].content, /refine the current custom prompt/);
  });

  it("rejects reference files from another user's uploads", async () => {
    await assert.rejects(
      () => chatAboutResourceImpl({
        payload: basePayload({
          uploadedFiles: [{ path: "resources/uploads/other-tutor/x.pdf", name: "x.pdf" }],
        }),
        actor,
        deps: deps({ callAi: fakeAi([]) }),
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
    assert.equal(calls.length, 2);
  });

  it("rejects an unknown student", async () => {
    await assert.rejects(
      () => chatAboutResourceImpl({
        payload: basePayload(),
        actor,
        deps: deps({ db: fakeDb({ student: null }), callAi: fakeAi([]) }),
      }),
      (err) => err instanceof HttpsError && err.code === "not-found"
    );
  });

  it("reports a model failure as unavailable", async () => {
    await assert.rejects(
      () => chatAboutResourceImpl({
        payload: basePayload(),
        actor,
        deps: deps({ callAi: fakeAi([], { fail: true }) }),
      }),
      (err) => err instanceof HttpsError && err.code === "unavailable"
    );
  });

  it("reports an empty model reply as unavailable", async () => {
    await assert.rejects(
      () => chatAboutResourceImpl({
        payload: basePayload(),
        actor,
        deps: deps({ callAi: fakeAi([], { reply: { reply: "" } }) }),
      }),
      (err) => err instanceof HttpsError && err.code === "unavailable"
    );
  });

  it("reports an unreadable reference file without calling the model", async () => {
    const calls = [];
    await assert.rejects(
      () => chatAboutResourceImpl({
        payload: basePayload({ uploadedFiles: [FILE_A] }),
        actor,
        deps: deps({
          callAi: fakeAi(calls),
          extractText: async () => { throw new Error("corrupt PDF"); },
        }),
      }),
      (err) => err instanceof HttpsError && err.code === "failed-precondition"
    );
    assert.equal(calls.length, 0);
  });

  it("still replies when the student's history can't be loaded", async () => {
    const db = fakeDb();
    const original = db.collection.bind(db);
    db.collection = (name) => {
      const ref = original(name);
      ref.get = async () => { throw new Error("index missing"); };
      return ref;
    };
    const calls = [];
    const result = await chatAboutResourceImpl({
      payload: basePayload(),
      actor,
      deps: deps({ db, callAi: fakeAi(calls) }),
    });
    assert.equal(result.reply, "What should it focus on?");
    assert.match(calls[0].systemPrompt, /No completed resources yet\./);
  });
});

describe("chat prompt helpers", () => {
  it("caps the draft prompt and filters suggestions", () => {
    const result = normaliseChatReply({
      reply: "  Here you go. ",
      proposedPrompt: "p".repeat(CHAT_LIMITS.maxPromptChars + 50),
      suggestions: ["Shorter", "", "x".repeat(CHAT_LIMITS.maxSuggestionChars + 1), "Harder", "Easier", "Extra"],
    });
    assert.equal(result.reply, "Here you go.");
    assert.equal(result.proposedPrompt.length, CHAT_LIMITS.maxPromptChars);
    assert.deepEqual(result.suggestions, ["Shorter", "Harder", "Easier"]);
  });

  it("treats an empty reply as a model failure", () => {
    assert.throws(() => normaliseChatReply({ reply: "  " }), (err) => err.modelFailure === true);
  });

  it("gives a skipped file a placeholder so it isn't re-read every turn", () => {
    const result = normaliseFileSummaries({ summaries: [{ index: 1, summary: "Second." }] }, [FILE_A, FILE_B]);
    assert.deepEqual(result, [
      { path: FILE_A.path, name: FILE_A.name, summary: UNSUMMARISED_FILE },
      { path: FILE_B.path, name: FILE_B.name, summary: "Second." },
    ]);
  });

  it("opens with a user turn so the transcript can start on the assistant", () => {
    const messages = buildChatMessages({ customPrompt: "", transcript: [] });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].role, "user");
  });

  it("says when there are no files or history", () => {
    const prompt = buildChatSystemPrompt({
      form: { resourceType: "topic-booklet", year: 6, subject: "english", answerMode: "none", showMarks: false },
      studentName: "Sam",
      customPrompt: "",
      files: [],
      history: [],
    });
    assert.match(prompt, /topic booklet for Sam, a Year 6 English student/);
    assert.match(prompt, /Current custom prompt: \(empty\)/);
    assert.match(prompt, /Reference documents \(summaries\):\nNone attached\./);
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
      model: "gpt-5.6-sol",
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
