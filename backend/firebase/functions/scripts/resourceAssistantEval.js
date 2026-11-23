#!/usr/bin/env node
"use strict";

/**
 * RES-102. Runs the resource assistant against live Claude and writes a report
 * for a person to review:
 *
 *   - 5 requests per subject the generator can't do: the assistant should say
 *     so and offer the closest thing it can;
 *   - 10 sample chats (5 per subject): the proposal should be valid and suit
 *     the request.
 *
 * Each case is checked automatically, and the report shows the full reply and
 * proposal so the judgement calls can be made by eye.
 *
 *   node scripts/resourceAssistantEval.js --out=/tmp/assistant-eval.md \
 *     [--projectId=tenacity-tutoring-b8eb2] [--firebase-secrets] [--only=maths-unsupported-1] [--commit --yes]
 *
 * Without --commit --yes it lists the cases and makes no calls. The key comes
 * from ANTHROPIC_API_KEY or, with --firebase-secrets, production's Functions
 * secrets (the staging key is a placeholder). --projectId reads the bank
 * coverage summary from that project (read only); without it the assistant
 * is told coverage isn't available.
 */

const fs = require("node:fs");
const { runAssistantTurn, buildAssistantMessages, buildAssistantSystemPrompt } = require("../src/resources/resourceAssistant");
const { descriptorFor } = require("../src/resources/builder/descriptors");
const { DEFAULT_MODELS } = require("../src/resources/modelRegistry");

const UNSUPPORTED = /\b(can't|cannot|can not|isn't|is not|aren't|are not|doesn't|does not|won't|unable|only covers|not (something|able|supported|possible|available))\b/i;
const ALTERNATIVE = /\b(instead|closest|alternatives?|could|how about|what (I|it) can|I can make|options?)\b/i;

const form = (subject, year, resourceType = null) => ({ subject, year, resourceType, answerMode: "none", showMarks: false });

const CASES = [
  // Requests the generator can't do.
  { id: "maths-unsupported-1", kind: "unsupported", form: form("maths", 8), message: "Can you make an interactive online quiz that marks itself?" },
  { id: "maths-unsupported-2", kind: "unsupported", form: form("maths", 10), message: "I need a Year 12 Extension 2 complex numbers past paper." },
  { id: "maths-unsupported-3", kind: "unsupported", form: form("maths", 7), message: "Make a short video explaining fractions." },
  { id: "maths-unsupported-4", kind: "unsupported", form: form("maths", 9), message: "Copy pages 40 to 45 of the Cambridge Year 9 textbook exactly." },
  { id: "maths-unsupported-5", kind: "unsupported", form: form("maths", 8), message: "Include a 3D rotating hologram of a cube and a Gantt chart." },
  { id: "english-unsupported-1", kind: "unsupported", form: form("english", 10), message: "Print the full first chapter of The Hunger Games for an annotation task." },
  { id: "english-unsupported-2", kind: "unsupported", form: form("english", 9), message: "Make a podcast episode about persuasive techniques." },
  { id: "english-unsupported-3", kind: "unsupported", form: form("english", 8), message: "Set up an online discussion board for the class novel." },
  { id: "english-unsupported-4", kind: "unsupported", form: form("english", 6), message: "I want a slideshow presentation about poetry." },
  { id: "english-unsupported-5", kind: "unsupported", form: form("english", 10), message: "Can it make a Year 11 Module A comparative study for HSC?" },
  // Sample chats: what a tutor would really ask.
  { id: "maths-chat-1", kind: "chat", form: form("maths", 8), message: "Sam is struggling with simultaneous equations and has a test in two weeks. What should I make?", expect: ["topic-booklet", "worksheet", "practice-paper", "mixed-review"] },
  { id: "maths-chat-2", kind: "chat", form: form("maths", 7, "worksheet"), message: "Ten questions on adding and subtracting fractions with unlike denominators, getting harder.", expect: ["worksheet"] },
  { id: "maths-chat-3", kind: "chat", form: form("maths", 9), message: "I want to find out what she doesn't know across the whole Year 9 measurement unit.", expect: ["diagnostic-test"] },
  { id: "maths-chat-4", kind: "chat", form: form("maths", 10), message: "Revision across everything from Term 1 and 2: algebra, linear graphs and trigonometry.", expect: ["mixed-review", "practice-paper"] },
  { id: "maths-chat-5", kind: "chat", form: form("maths", 6), message: "Summary notes on area and perimeter he can read the night before his test.", expect: ["study-guide"] },
  { id: "english-chat-1", kind: "chat", form: form("english", 9), message: "Help her practise analysing language techniques in a persuasive speech.", expect: ["annotation-task", "worksheet", "topic-booklet"] },
  { id: "english-chat-2", kind: "chat", form: form("english", 10), message: "He has to write an analytical essay on belonging next week and doesn't know how to structure it.", expect: ["essay-scaffold"] },
  { id: "english-chat-3", kind: "chat", form: form("english", 7), message: "A practice reading comprehension paper like the school's half-yearly exam.", expect: ["practice-paper"] },
  { id: "english-chat-4", kind: "chat", form: form("english", 5), message: "Teach poetry techniques from scratch: simile, metaphor, personification, with practice.", expect: ["topic-booklet", "worksheet"] },
  { id: "english-chat-5", kind: "chat", form: form("english", 8), message: "Can you write a short narrative writing task with a visual stimulus?", expect: ["worksheet", "custom", "practice-paper", "topic-booklet"] },
];

function parseArgs(argv) {
  const options = { out: "", projectId: "", firebaseSecrets: false, only: "", commit: false, yes: false };
  for (const arg of argv) {
    if (arg.startsWith("--out=")) options.out = arg.slice(6);
    else if (arg.startsWith("--projectId=")) options.projectId = arg.slice(12);
    else if (arg.startsWith("--only=")) options.only = arg.slice(7);
    else if (arg === "--firebase-secrets") options.firebaseSecrets = true;
    else if (arg === "--commit") options.commit = true;
    else if (arg === "--yes") options.yes = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.out) throw new Error("--out is required");
  return options;
}

/** The automatic checks for one result. Returns a list of problems. */
function checkResult(testCase, result) {
  if (result.failed) return [`call failed: ${result.reply}`];
  const problems = [];
  const { proposal, reply } = result;
  if (proposal) {
    const descriptor = descriptorFor(proposal.resourceType);
    if (!descriptor) problems.push(`unknown type ${proposal.resourceType}`);
    else if (!descriptor.subjects.includes(proposal.subject)) problems.push(`${proposal.resourceType} isn't offered for ${proposal.subject}`);
    if (proposal.subject !== testCase.form.subject) problems.push(`switched subject to ${proposal.subject}`);
    if (proposal.brief.length > 1500) problems.push(`brief is ${proposal.brief.length} characters (aim under 1500)`);
  }
  if (testCase.kind === "unsupported") {
    if (!UNSUPPORTED.test(reply)) problems.push("doesn't say it can't");
    if (!proposal && !ALTERNATIVE.test(reply)) problems.push("offers no alternative");
  } else {
    if (!proposal) problems.push("no proposal");
    else {
      if (!proposal.brief) problems.push("empty brief");
      if (!testCase.expect.includes(proposal.resourceType)) problems.push(`proposed ${proposal.resourceType}; expected one of ${testCase.expect.join(", ")}`);
      if (!proposal.sections.length) problems.push("no sections");
    }
  }
  return problems;
}

function reportSection(testCase, result, problems) {
  const proposal = result.proposal
    ? [
        `- Type: ${result.proposal.resourceType} (${result.proposal.subject}), answers: ${result.proposal.answerMode}, marks: ${result.proposal.showMarks ? "shown" : "hidden"}`,
        `- Sections: ${result.proposal.sections.join(" · ") || "(none)"}`,
        `- Brief (${result.proposal.brief.length} chars): ${result.proposal.brief}`,
      ].join("\n")
    : "_No proposal._";
  return [
    `### ${problems.length ? "✗" : "✓"} ${testCase.id}`,
    "",
    `**Form:** ${testCase.form.subject}, Year ${testCase.form.year}${testCase.form.resourceType ? `, ${testCase.form.resourceType}` : ""}`,
    `**Tutor:** ${testCase.message}`,
    "",
    `**Checked:** ${result.activity.join("; ") || "nothing"}`,
    "",
    `**Reply:** ${result.reply}`,
    "",
    proposal,
    "",
    problems.length ? `**Problems:** ${problems.join("; ")}` : "**Automatic checks passed.**",
    "",
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cases = CASES.filter((testCase) => !options.only || testCase.id === options.only);
  console.log(`${cases.length} cases:`);
  for (const testCase of cases) console.log(`  ${testCase.id}`);
  if (!(options.commit && options.yes)) {
    console.log("Dry run: no calls made. Pass --commit --yes to run.");
    return;
  }

  const { loadFirebaseSecrets, loadLocalSecrets } = require("./liveResourceSmoke");
  const { adminAppOptions, loadApiKeys } = require("./lib/questionBankAuth");
  const keys = loadLocalSecrets().values;
  if (!keys.ANTHROPIC_API_KEY && options.firebaseSecrets) Object.assign(keys, await loadApiKeys(["ANTHROPIC_API_KEY"], { loadFirebaseSecrets }));
  if (!keys.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is missing; set it locally or pass --firebase-secrets");
  const client = new (require("@anthropic-ai/sdk").default)({ apiKey: keys.ANTHROPIC_API_KEY, maxRetries: 2 });

  let coverage = null;
  if (options.projectId) {
    const admin = require("firebase-admin");
    admin.initializeApp(adminAppOptions({ projectId: options.projectId }));
    const { loadBankCoverage } = require("../src/resources/bankCoverage");
    coverage = await loadBankCoverage(admin.firestore());
    console.log(coverage ? "Bank coverage loaded." : "No bank coverage summary yet.");
  }

  const sections = [];
  let passed = 0;
  for (const testCase of cases) {
    const transcript = [{ role: "user", content: testCase.message }];
    let result;
    try {
      result = await runAssistantTurn({
        client,
        model: DEFAULT_MODELS.chat,
        form: testCase.form,
        systemPrompt: buildAssistantSystemPrompt({ form: testCase.form, studentName: "the student", customPrompt: "", files: [], history: [] }),
        messages: buildAssistantMessages({ customPrompt: "", transcript }),
        loadCoverage: async () => coverage,
      });
    } catch (err) {
      result = { reply: err.message, proposal: null, activity: [], failed: true };
    }
    const problems = checkResult(testCase, result);
    if (!problems.length) passed += 1;
    console.log(`${problems.length ? "✗" : "✓"} ${testCase.id}${problems.length ? `: ${problems.join("; ")}` : ""}`);
    sections.push(reportSection(testCase, result, problems));
  }

  const report = [
    "# Resource assistant eval (RES-102)",
    "",
    `${new Date().toISOString().slice(0, 10)} · model ${DEFAULT_MODELS.chat} · ${passed}/${cases.length} passed the automatic checks.`,
    "",
    "The automatic checks catch the obvious misses. Read each reply too: is the type a tutor would pick, and is the brief usable?",
    "",
    ...sections,
  ].join("\n");
  fs.writeFileSync(options.out, report);
  console.log(`\n${passed}/${cases.length} passed. Report: ${options.out}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { CASES, checkResult, parseArgs };
