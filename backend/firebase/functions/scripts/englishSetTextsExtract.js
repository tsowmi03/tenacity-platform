"use strict";

/*
 * RES-67: builds the set-text reference bank (englishSetTexts) from the
 * LitCharts guides in Resources/English/LitCharts. One record per text
 * studied, from its main LitChart PDF: themes, characters, symbols and key
 * quotes (src/englishBank/setTexts.js). Each guide is read as text in one
 * Haiku call; a quote not found in the guide is dropped.
 *
 * Usage:
 *   node scripts/englishSetTextsExtract.js --projectId=tenacity-tutoring-b8eb2 \
 *     --out=/tmp/set-texts [--limit=3] [--firebase-secrets] [--commit --yes]
 *
 * Without --commit --yes it lists the chosen guides and stops. With them it
 * makes the calls, writes each record to --out as JSON, and to Firestore
 * unless --local is given.
 */

process.env.POSTHOG_PROJECT_TOKEN = "";

const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");
const { PDFParse } = require("pdf-parse");
const { adminAppOptions, loadApiKeys } = require("./lib/questionBankAuth");

const { ENGLISH_FOLDER_ID, createDriveClient, createImpersonatedTokenProvider, listTree } = require("../src/questionBank/driveSource");
const { versionOf } = require("../src/questionBank/sourceStore");
const { readMessage } = require("../src/questionBank/prompts");
const { buildAnthropicSystemParam, normaliseAnthropicUsage } = require("../src/resources/apiClient");
const { SET_TEXTS_COLLECTION, SET_TEXT_SCHEMA, chooseLitChartFiles, setTextPrompt, toSetTextDoc } = require("../src/englishBank/setTexts");
const { withAdminChanges } = require("../src/questionBank/adminChanges");
const { loadFirebaseSecrets, loadLocalSecrets } = require("./liveResourceSmoke");

const MODEL = "claude-haiku-5-5";
const MAX_TOKENS = 16000;
// List prices per million tokens (direct calls, not batched).
const PRICE = { input: 1.0, output: 5.0 };

function parseArgs(argv) {
  const options = { projectId: "", out: "", limit: Infinity, firebaseSecrets: false, local: false, commit: false, yes: false };
  for (const arg of argv) {
    if (arg === "--commit") options.commit = true;
    else if (arg === "--yes") options.yes = true;
    else if (arg === "--local") options.local = true;
    else if (arg === "--firebase-secrets") options.firebaseSecrets = true;
    else if (arg.startsWith("--projectId=")) options.projectId = arg.slice(12);
    else if (arg.startsWith("--out=")) options.out = arg.slice(6);
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice(8));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.projectId) throw new Error("--projectId is required");
  if (!options.out) throw new Error("--out is required");
  return options;
}

async function pdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    return (await parser.getText()).text || "";
  } finally {
    await parser.destroy();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.out, { recursive: true });
  const drive = createDriveClient({ getAccessToken: createImpersonatedTokenProvider() });
  const files = await listTree(drive, ENGLISH_FOLDER_ID, "English");
  const guides = chooseLitChartFiles(files).slice(0, options.limit);
  console.log(`${guides.length} LitChart guides:`);
  for (const guide of guides) console.log(`  ${guide.path}`);
  if (!(options.commit && options.yes)) {
    console.log("Dry run: no calls made. Pass --commit --yes to run.");
    return;
  }

  const keys = loadLocalSecrets().values;
  if (!keys.ANTHROPIC_API_KEY && options.firebaseSecrets) Object.assign(keys, await loadApiKeys(["ANTHROPIC_API_KEY"], { loadFirebaseSecrets }));
  if (!keys.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is missing; set it locally or pass --firebase-secrets");
  const client = new (require("@anthropic-ai/sdk").default)({ apiKey: keys.ANTHROPIC_API_KEY });
  let db = null;
  if (!options.local) {
    admin.initializeApp(adminAppOptions({ projectId: options.projectId }));
    db = admin.firestore();
  }
  const runId = `st-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;

  let spent = 0;
  const failures = [];
  const written = [];
  for (const guide of guides) {
    try {
      const guideText = await pdfText(await drive.download(guide.id));
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildAnthropicSystemParam({ systemPrompt: "You build accurate reference records about literary texts from study guides, for tutors." }),
        messages: [{ role: "user", content: setTextPrompt({ path: guide.path, text: guideText }) }],
        thinking: { type: "adaptive" },
        output_config: { effort: "medium", format: { type: "json_schema", schema: SET_TEXT_SCHEMA } },
      });
      const { parsed } = readMessage(message, MAX_TOKENS);
      const usage = normaliseAnthropicUsage(message.usage);
      spent += ((usage.inputTokens || 0) * PRICE.input + (usage.outputTokens || 0) * PRICE.output) / 1e6;
      const doc = toSetTextDoc({ source: { ...guide, version: versionOf(guide) }, parsed, guideText, runId, model: MODEL });
      fs.writeFileSync(path.join(options.out, `${doc.id}.json`), JSON.stringify(doc, null, 2));
      if (db) {
        // RES-104: a re-extracted set text keeps an admin's hide and corrections.
        const [record] = await withAdminChanges(db, [{ collection: SET_TEXTS_COLLECTION, id: doc.id, data: doc.data }]);
        await db.collection(SET_TEXTS_COLLECTION).doc(doc.id).set({ ...record.data, extractedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
      written.push(doc.id);
      console.log(`${written.length}/${guides.length} ${doc.data.title}: ${doc.data.themes.length} themes, ${doc.data.characters.length} characters, ${doc.data.quotes.length} quotes (${doc.droppedQuotes} dropped) — $${spent.toFixed(3)} so far`);
    } catch (err) {
      failures.push(`${guide.path}: ${err.message.slice(0, 200)}`);
      console.log(`FAILED ${guide.path}: ${err.message.slice(0, 200)}`);
    }
  }
  console.log(`Done: ${written.length} written, ${failures.length} failed, $${spent.toFixed(3)} spent.`);
  for (const failure of failures) console.log(`  ${failure}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs };
