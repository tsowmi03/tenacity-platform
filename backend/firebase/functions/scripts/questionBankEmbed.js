#!/usr/bin/env node
"use strict";

/**
 * RES-59. Gives every question in the bank an OpenAI embedding and its school
 * years, so searchQuestions can find it. Safe to rerun: a question is embedded
 * again only when the text it is embedded from has changed.
 *
 *   node scripts/questionBankEmbed.js --projectId=tenacity-tutoring-staging [--firebase-secrets] [--commit --yes]
 *
 * Without --commit --yes it only counts what would be embedded. The OpenAI key
 * comes from OPENAI_API_KEY or, with --firebase-secrets, from production's
 * Functions secrets. text-embedding-3-small costs $0.02 per million tokens:
 * the whole bank is a few cents.
 */

const crypto = require("node:crypto");
const admin = require("firebase-admin");
const { adminAppOptions, loadApiKeys } = require("./lib/questionBankAuth");

const { loadFirebaseSecrets, loadLocalSecrets } = require("./liveResourceSmoke");
const { QUESTIONS_COLLECTION } = require("../src/questionBank/extraction");
const { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, createEmbedder, embeddingText, yearsOf } = require("../src/questionBank/search");

const CHUNK = 500;

function parseArgs(argv) {
  const options = { projectId: "", firebaseSecrets: false, commit: false, yes: false };
  for (const arg of argv) {
    if (arg.startsWith("--projectId=")) options.projectId = arg.slice("--projectId=".length);
    else if (arg === "--firebase-secrets") options.firebaseSecrets = true;
    else if (arg === "--commit") options.commit = true;
    else if (arg === "--yes") options.yes = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.projectId) throw new Error("--projectId is required");
  return options;
}

function embeddingHash(text) {
  return crypto.createHash("sha256").update(`${EMBEDDING_MODEL}:${EMBEDDING_DIMENSIONS}:${text}`).digest("hex").slice(0, 32);
}

/** What each question needs written: an embedding when its text changed, its years when they differ. */
function planEmbeddings(questions) {
  const plan = [];
  for (const question of questions) {
    const text = embeddingText(question);
    const hash = embeddingHash(text);
    const years = yearsOf(question.yearLevel, question.sourcePath);
    const needsEmbedding = question.embeddingHash !== hash;
    const needsYears = JSON.stringify(question.years || null) !== JSON.stringify(years);
    if (needsEmbedding || needsYears) plan.push({ id: question.id, text, hash, years, needsEmbedding });
  }
  return plan;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  admin.initializeApp(adminAppOptions({ projectId: options.projectId }));
  const db = admin.firestore();

  const snapshot = await db
    .collection(QUESTIONS_COLLECTION)
    .select("topic", "description", "diagramType", "skill", "stem", "text", "figures", "yearLevel", "sourcePath", "years", "embeddingHash")
    .get();
  const questions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const plan = planEmbeddings(questions);
  const toEmbed = plan.filter((item) => item.needsEmbedding);
  const roughTokens = toEmbed.reduce((sum, item) => sum + Math.ceil(item.text.length / 4), 0);
  console.log(`${questions.length} questions; ${toEmbed.length} to embed (about ${roughTokens} tokens, $${((roughTokens / 1e6) * 0.02).toFixed(3)}), ${plan.length - toEmbed.length} only need their years.`);
  if (!(options.commit && options.yes)) {
    console.log("Dry run. Pass --commit --yes to write.");
    return;
  }

  const keys = loadLocalSecrets().values;
  if (!keys.OPENAI_API_KEY && options.firebaseSecrets) Object.assign(keys, await loadApiKeys(["OPENAI_API_KEY"], { loadFirebaseSecrets }));
  if (!keys.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing; set it locally or pass --firebase-secrets");
  const embed = createEmbedder({ client: new (require("openai").default)({ apiKey: keys.OPENAI_API_KEY }) });

  const writer = db.bulkWriter();
  let written = 0;
  for (let start = 0; start < plan.length; start += CHUNK) {
    const chunk = plan.slice(start, start + CHUNK);
    const embedding = chunk.filter((item) => item.needsEmbedding);
    const vectors = embedding.length ? await embed(embedding.map((item) => item.text)) : [];
    const byId = new Map(embedding.map((item, index) => [item.id, vectors[index]]));
    for (const item of chunk) {
      const data = { years: item.years };
      if (item.needsEmbedding) {
        data.embedding = admin.firestore.FieldValue.vector(byId.get(item.id));
        data.embeddingHash = item.hash;
        data.embeddingModel = `${EMBEDDING_MODEL}@${EMBEDDING_DIMENSIONS}`;
      }
      writer.update(db.collection(QUESTIONS_COLLECTION).doc(item.id), data);
    }
    await writer.flush();
    written += chunk.length;
    console.log(`Wrote ${written}/${plan.length} (${embed.tokens || 0} tokens so far).`);
  }
  await writer.close();
  console.log(`Done: ${written} questions updated, ${embed.tokens || 0} tokens, $${(((embed.tokens || 0) / 1e6) * 0.02).toFixed(3)}.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { embeddingHash, parseArgs, planEmbeddings };
