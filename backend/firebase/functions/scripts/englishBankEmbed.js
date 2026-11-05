#!/usr/bin/env node
"use strict";

/**
 * RES-77. Gives every live stimulus in the English bank an OpenAI embedding,
 * so searchStimuli (src/englishBank/search.js) can find it. Safe to rerun: a
 * stimulus is embedded again only when the text it is embedded from has
 * changed. The weekly bank update runs it after the maths embed.
 *
 *   node scripts/englishBankEmbed.js --projectId=tenacity-tutoring-staging [--firebase-secrets] [--commit --yes]
 *
 * Without --commit --yes it only counts what would be embedded. The OpenAI key
 * comes from OPENAI_API_KEY or, with --firebase-secrets, from production's
 * Functions secrets. text-embedding-3-small costs $0.02 per million tokens:
 * the whole English bank is a few cents.
 */

const admin = require("firebase-admin");
const { adminAppOptions, loadApiKeys } = require("./lib/questionBankAuth");

const { loadFirebaseSecrets, loadLocalSecrets } = require("./liveResourceSmoke");
const { embeddingHash } = require("./questionBankEmbed");
const { STIMULI_COLLECTION } = require("../src/englishBank/records");
const { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, createEmbedder, embeddingText } = require("../src/englishBank/search");

const CHUNK = 500;
const EMBED_FIELDS = ["status", "type", "title", "author", "themes", "techniqueIds", "visualDescription", "text", "embeddingHash"];

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

/** The live stimuli whose embedding is missing or was made from different text. */
function planEmbeddings(stimuli) {
  const plan = [];
  for (const stimulus of stimuli) {
    if (stimulus.status !== "live") continue;
    const text = embeddingText(stimulus);
    if (!text) continue;
    const hash = embeddingHash(text);
    if (stimulus.embeddingHash !== hash) plan.push({ id: stimulus.id, text, hash });
  }
  return plan;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  admin.initializeApp(adminAppOptions({ projectId: options.projectId }));
  const db = admin.firestore();

  const snapshot = await db.collection(STIMULI_COLLECTION).select(...EMBED_FIELDS).get();
  const stimuli = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const plan = planEmbeddings(stimuli);
  const roughTokens = plan.reduce((sum, item) => sum + Math.ceil(item.text.length / 4), 0);
  console.log(`${stimuli.length} stimuli; ${plan.length} to embed (about ${roughTokens} tokens, $${((roughTokens / 1e6) * 0.02).toFixed(3)}).`);
  if (!(options.commit && options.yes)) {
    console.log("Dry run. Pass --commit --yes to write.");
    return;
  }
  if (!plan.length) return;

  const keys = loadLocalSecrets().values;
  if (!keys.OPENAI_API_KEY && options.firebaseSecrets) Object.assign(keys, await loadApiKeys(["OPENAI_API_KEY"], { loadFirebaseSecrets }));
  if (!keys.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing; set it locally or pass --firebase-secrets");
  const embed = createEmbedder({ client: new (require("openai").default)({ apiKey: keys.OPENAI_API_KEY }) });

  const writer = db.bulkWriter();
  let written = 0;
  for (let start = 0; start < plan.length; start += CHUNK) {
    const chunk = plan.slice(start, start + CHUNK);
    const vectors = await embed(chunk.map((item) => item.text));
    chunk.forEach((item, index) => {
      writer.update(db.collection(STIMULI_COLLECTION).doc(item.id), {
        embedding: admin.firestore.FieldValue.vector(vectors[index]),
        embeddingHash: item.hash,
        embeddingModel: `${EMBEDDING_MODEL}@${EMBEDDING_DIMENSIONS}`,
      });
    });
    await writer.flush();
    written += chunk.length;
    console.log(`Wrote ${written}/${plan.length} (${embed.tokens || 0} tokens so far).`);
  }
  await writer.close();
  console.log(`Done: ${written} stimuli embedded, ${embed.tokens || 0} tokens, $${(((embed.tokens || 0) / 1e6) * 0.02).toFixed(3)}.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, planEmbeddings };
