"use strict";

// RES-57. Message Batches API plumbing for the question bank: split requests
// into batches under the size limit, submit, wait, read results, and price
// what came back so a run can stop at its spending cap.

// List prices (USD per million tokens) for prompts under 100K tokens. Batches
// are billed at half of these.
const PRICES_PER_MTOK = Object.freeze({
  "claude-haiku-5-5": { input: 0.1, cachedInput: 0.01, cacheWrite: 0.125, output: 0.5 },
});
const BATCH_DISCOUNT = 0.5;
// The API accepts up to 256 MB per batch; page images are the bulk of it, and
// this leaves headroom for the JSON around them.
const MAX_BATCH_BYTES = 150 * 1024 * 1024;
const MAX_BATCH_REQUESTS = 100000;
const POLL_MS = 60 * 1000;

function batchCostOf(usage, model) {
  const price = PRICES_PER_MTOK[model];
  if (!price) throw new Error(`No price for ${model}; add it to PRICES_PER_MTOK`);
  return BATCH_DISCOUNT * (
    (usage.inputTokens || 0) * price.input +
    (usage.cachedInputTokens || 0) * price.cachedInput +
    (usage.cacheWriteTokens || 0) * price.cacheWrite +
    (usage.outputTokens || 0) * price.output
  ) / 1e6;
}

/**
 * Splits `{custom_id, params}` requests into groups that each fit in one batch.
 */
function chunkRequests(requests, { maxBytes = MAX_BATCH_BYTES, maxRequests = MAX_BATCH_REQUESTS } = {}) {
  const chunks = [];
  let current = [];
  let bytes = 0;
  for (const request of requests) {
    const size = Buffer.byteLength(JSON.stringify(request));
    if (size > maxBytes) throw new Error(`Request ${request.custom_id} alone is ${size} bytes, over the batch limit`);
    if (current.length && (bytes + size > maxBytes || current.length >= maxRequests)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(request);
    bytes += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

async function submitBatch(client, requests) {
  const batch = await client.messages.batches.create({ requests });
  return batch.id;
}

async function waitForBatch(client, batchId, { pollMs = POLL_MS, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), onPoll = () => {} } = {}) {
  for (;;) {
    const batch = await client.messages.batches.retrieve(batchId);
    if (batch.processing_status === "ended") return batch;
    onPoll(batch);
    await sleep(pollMs);
  }
}

/**
 * Every result of an ended batch as `{customId, type, message, error}`, where
 * type is succeeded, errored, canceled or expired.
 */
async function collectResults(client, batchId) {
  const results = [];
  for await (const entry of await client.messages.batches.results(batchId)) {
    results.push({
      customId: entry.custom_id,
      type: entry.result.type,
      message: entry.result.type === "succeeded" ? entry.result.message : null,
      error: entry.result.type === "errored" ? entry.result.error : null,
    });
  }
  return results;
}

module.exports = {
  BATCH_DISCOUNT,
  MAX_BATCH_BYTES,
  PRICES_PER_MTOK,
  batchCostOf,
  chunkRequests,
  collectResults,
  submitBatch,
  waitForBatch,
};
