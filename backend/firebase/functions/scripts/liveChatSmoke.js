"use strict";

// RES-24 live check: runs the pre-generation chat against real models with
// synthetic data, and compares model line-ups on the same conversation.
// Nothing touches Firestore or Storage; keys stay in memory and are never
// printed.
//
//   npm run smoke:chat:live -- --firebase-secrets [--configs sonnet,opus,sol,luna] [--output DIR]
//
// By default it runs the default chat model (chatModel() in modelRegistry.js).
// Add the comparison line-ups to weigh a model change.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { chatAboutResourceImpl, validateChatAboutResourcePayload } = require("../src/resources");
const { callAnthropicForResource } = require("../src/resources/apiClient");
const { callOpenAiForResource } = require("../src/resources/openaiClient");
const { chatModel } = require("../src/resources/modelRegistry");
const { loadFirebaseSecrets, parseSecretFile } = require("./liveResourceSmoke");

// Each line-up names the model for the chat reply and for file summaries.
// sonnet is what production runs; the rest are comparisons.
const lineUp = (model) => ({ chat: model, summary: model });
const CONFIGS = Object.freeze({
  sonnet: lineUp(chatModel()),
  opus: lineUp("claude-opus-5-5"),
  sol: lineUp("gpt-6.1-sol"),
  luna: lineUp("gpt-6-luna"),
});
const DEFAULT_CONFIGS = ["sonnet"];

const ASSESSMENT_NOTICE = `Year 8 Mathematics — Term 3 Assessment Notification
Task: Algebra topic test (Week 6, Tuesday period 2). Weighting: 20%.
Duration: 45 minutes. Calculators are NOT permitted.
Content: solving linear equations (including with brackets and pronumerals on both sides);
expanding and factorising algebraic expressions; solving simple linear inequalities and
representing solutions on a number line; writing and solving equations from worded problems.
Format: Section A — 10 short-answer questions (1–2 marks each). Section B — 3 extended
worded problems (4–5 marks each). Show all working.`;

const MARCH_TEST = `Year 8 Algebra Class Test (March)
1. Solve 3x + 5 = 20. (1 mark)
2. Solve 2(x - 4) = 10. (2 marks)
3. Solve 5x - 7 = 2x + 8. (2 marks)
4. Expand 4(2a + 3). (1 mark)
5. Factorise 6m + 9. (1 mark)
6. Solve x/3 + 2 = 7. (2 marks)
7. A number is doubled and 7 is added. The result is 31. Find the number. (3 marks)
... 18 questions in total, all short answer, 1–3 marks each. No inequalities.`;

const FILES = [
  { path: "resources/uploads/smoke-tutor/notice.txt", name: "Y8 Term 3 Assessment Notification.txt", text: ASSESSMENT_NOTICE },
  { path: "resources/uploads/smoke-tutor/march-test.txt", name: "Algebra test - March.txt", text: MARCH_TEST },
];

const HISTORY = [
  { status: "complete", resourceType: "worksheet", subject: "maths", year: 8, extractedTopics: ["linear-equations"], customPrompt: "Two-step linear equations, core level, 10 questions.", createdAt: new Date("2026-09-12T00:00:00Z") },
  { status: "complete", resourceType: "topic-booklet", subject: "maths", year: 8, extractedTopics: ["expanding-brackets", "factorising"], customPrompt: "", createdAt: new Date("2026-08-29T00:00:00Z") },
  { status: "complete", resourceType: "practice-paper", subject: "maths", year: 8, extractedTopics: ["algebra", "linear-equations"], customPrompt: "Mixed algebra, mirror the March test.", createdAt: new Date("2026-08-15T00:00:00Z") },
];

const TUTOR_TURNS = [
  "Focus on inequalities since they're new, but a bit harder than her last worksheet. Include some worded problems like the test.",
  "Make it 10 questions and drop the number line questions.",
];

function fakeDb() {
  return {
    collection(name) {
      const query = {
        where() { return query; },
        orderBy() { return query; },
        limit() { return query; },
        async get() { return { docs: HISTORY.map((data) => ({ data: () => data })) }; },
        doc() {
          return {
            async get() {
              const data = name === "students" ? { firstName: "Mia", lastName: "Thompson" } : null;
              return { exists: Boolean(data), data: () => data };
            },
          };
        },
      };
      return query;
    },
  };
}

function fakeStorage() {
  const byPath = new Map(FILES.map((file) => [file.path, Buffer.from(file.text)]));
  return {
    bucket() {
      return { file: (p) => ({ async download() { return [byPath.get(p)]; } }) };
    },
  };
}

// Routes each request to the line-up's model and times it. Summary requests
// are recognised by their schema.
function timedCaller(config, keys, calls) {
  return async (request) => {
    const kind = request.responseSchema?.required?.includes("summaries") ? "summary" : "chat";
    const model = config[kind];
    const anthropic = model.startsWith("claude");
    const started = Date.now();
    try {
      const result = anthropic
        ? await callAnthropicForResource({ ...request, model, apiKey: keys.ANTHROPIC_API_KEY })
        : await callOpenAiForResource({ ...request, model, apiKey: keys.OPENAI_API_KEY });
      calls.push({ kind, model, ms: Date.now() - started, usage: result.usage });
      return result;
    } catch (err) {
      calls.push({ kind, model, ms: Date.now() - started, error: err?.message });
      throw err;
    }
  };
}

async function runConfig(name, keys) {
  const config = CONFIGS[name];
  const calls = [];
  const deps = {
    db: fakeDb(),
    storage: fakeStorage(),
    extractText: async (buffer) => buffer.toString("utf8"),
    callAi: timedCaller(config, keys, calls),
  };
  const actor = { uid: "smoke-tutor", role: "tutor", claims: {} };
  const summaries = {};
  const transcript = [];
  const turns = [];

  for (let turn = 0; turn <= TUTOR_TURNS.length; turn += 1) {
    if (turn > 0) transcript.push({ role: "user", content: TUTOR_TURNS[turn - 1] });
    const payload = validateChatAboutResourcePayload({
      studentId: "student-smoke",
      subject: "maths",
      year: 8,
      resourceType: "worksheet",
      answerMode: "worked",
      uploadedFiles: FILES.map(({ path: p, name: n }) => ({ path: p, name: n })),
      fileSummaries: Object.entries(summaries).map(([p, summary]) => ({ path: p, summary })),
      messages: transcript,
    });
    const before = calls.length;
    const started = Date.now();
    try {
      const result = await chatAboutResourceImpl({ payload, actor, deps });
      for (const entry of result.fileSummaries) summaries[entry.path] = entry.summary;
      transcript.push({ role: "assistant", content: result.reply, proposedPrompt: result.proposedPrompt || null });
      turns.push({ turn, ms: Date.now() - started, calls: calls.slice(before), ...result });
    } catch (err) {
      turns.push({ turn, ms: Date.now() - started, calls: calls.slice(before), error: err?.message });
      break;
    }
  }
  return { name, config, summaries, turns };
}

function report(results) {
  const lines = ["# RES-24 chat model comparison", ""];
  lines.push("| Line-up | Chat model | Summary model | Turn 1 (with summaries) | Turn 2 | Turn 3 | Draft length |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of results) {
    const t = (i) => {
      const turn = r.turns[i];
      if (!turn) return "—";
      if (turn.error) return `failed (${turn.ms} ms)`;
      const parts = turn.calls.map((c) => `${c.kind} ${(c.ms / 1000).toFixed(1)}s`).join(" + ");
      return `${(turn.ms / 1000).toFixed(1)}s (${parts})`;
    };
    const lastDraft = [...r.turns].reverse().find((turn) => turn.proposedPrompt)?.proposedPrompt || "";
    lines.push(`| ${r.name} | ${r.config.chat} | ${r.config.summary} | ${t(0)} | ${t(1)} | ${t(2)} | ${lastDraft.length} |`);
  }
  for (const r of results) {
    lines.push("", `## ${r.name}`, "", "### File summaries", "");
    for (const [p, summary] of Object.entries(r.summaries)) lines.push(`- **${path.basename(p)}**: ${summary}`);
    r.turns.forEach((turn) => {
      lines.push("", `### Turn ${turn.turn + 1}${turn.turn > 0 ? ` — tutor: "${TUTOR_TURNS[turn.turn - 1]}"` : " — opening"}`, "");
      if (turn.error) {
        lines.push(`**Error:** ${turn.error}`);
        return;
      }
      lines.push(turn.reply.split("\n").map((l) => `> ${l}`).join("\n"));
      if (turn.proposedPrompt) lines.push("", `**Draft prompt (${turn.proposedPrompt.length} chars):** ${turn.proposedPrompt}`);
      if (turn.suggestions?.length) lines.push("", `**Suggestions:** ${turn.suggestions.join(" · ")}`);
    });
  }
  return lines.join("\n");
}

async function main(argv = process.argv.slice(2)) {
  const arg = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  const names = (arg("--configs") || DEFAULT_CONFIGS.join(",")).split(",").map((s) => s.trim());
  for (const name of names) {
    if (!CONFIGS[name]) throw new Error(`Unknown config "${name}". Choose from: ${Object.keys(CONFIGS).join(", ")}`);
  }
  const needed = [...new Set(names.flatMap((n) => [CONFIGS[n].chat, CONFIGS[n].summary]))]
    .map((model) => (model.startsWith("claude") ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"));
  const secretNames = [...new Set(needed)];
  const keys = argv.includes("--firebase-secrets")
    ? loadFirebaseSecrets({ secretNames })
    : { ...parseSecretFile(fs.existsSync(path.resolve(__dirname, "../.secret.local")) ? fs.readFileSync(path.resolve(__dirname, "../.secret.local"), "utf8") : ""), ...process.env };

  // Line-ups run in parallel; turns within one run in order.
  const results = await Promise.all(names.map((name) => runConfig(name, keys)));
  const outputDir = arg("--output") || fs.mkdtempSync(path.join(os.tmpdir(), "res24-chat-"));
  fs.mkdirSync(outputDir, { recursive: true });
  const markdown = report(results);
  fs.writeFileSync(path.join(outputDir, "chat-comparison.md"), markdown);
  fs.writeFileSync(path.join(outputDir, "chat-comparison.json"), JSON.stringify(results, null, 2));
  process.stdout.write(`${markdown.split("\n## ")[0]}\n\nFull report: ${path.join(outputDir, "chat-comparison.md")}\n`);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${err.code ? `${err.code}: ` : ""}${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { CONFIGS, main };
