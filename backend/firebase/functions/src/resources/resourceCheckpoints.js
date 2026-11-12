"use strict";

const { createHash } = require("node:crypto");
const { resourceEvent } = require("./resourceLog");

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Named stages opt in with a version and the data they actually consume.
// Bump the version when changing the meaning of a stage's instructions.
// Request-based identities remain available for historical and unnamed stages.
function checkpointFor({ bucket, job, stageId, request, contract }) {
  const legacyKey = hash(request);
  const base = `resources/checkpoints/${job.jobId}/`;
  const legacy = bucket.file(`${base}${legacyKey}.json`);
  const compatible = job.generationVersion === 1 && stageId && contract;
  const version = compatible ? contract.version : undefined;
  const key = compatible
    ? hash({ request: { ...request, systemPrompt: undefined, userMessage: undefined }, contract })
    : legacyKey;
  const file = compatible ? bucket.file(`${base}${key}.json`) : legacy;
  const index = compatible ? bucket.file(`${base}stage-${hash(stageId)}.json`) : null;
  const fields = { stageId: stageId || key, checkpointVersion: version };
  const event = (name, extra) => resourceEvent(job, name, { ...fields, ...extra });

  async function download(object, outcome) {
    const started = Date.now();
    try {
      const [bytes] = await object.download();
      event("checkpoint.lookup", { outcome, durationMs: Date.now() - started });
      return bytes;
    } catch (err) {
      if (Number(err.code) !== 404) throw err;
      event("checkpoint.lookup", { outcome: "miss", durationMs: Date.now() - started });
      return null;
    }
  }

  async function save(result) {
    const started = Date.now();
    const options = { resumable: false, metadata: { contentType: "application/json" } };
    await file.save(JSON.stringify(result), options);
    if (index) {
      // The marker is diagnostic. Only content-addressed responses are read as
      // checkpoints, so a late marker can never make an incompatible result usable.
      try {
        await index.save(JSON.stringify({ key, version }), options);
      } catch {
        event("checkpoint.index_unavailable", { outcome: "write_failed" });
      }
    }
    return Date.now() - started;
  }

  async function read(validate, beforeMigrate) {
    let bytes = await download(file, "hit");
    let migrate = false;
    if (!bytes && version === 1) {
      bytes = await download(legacy, "legacy_hit");
      migrate = Boolean(bytes);
    }
    if (!bytes) {
      if (index) {
        try {
          const [marker] = await index.download();
          const previous = JSON.parse(marker.toString("utf8"));
          if (previous.key !== key) {
            event("checkpoint.invalidated", { reason: previous.version === version ? "inputs_changed" : "contract_changed" });
          }
        } catch (err) {
          if (Number(err.code) !== 404) event("checkpoint.index_unavailable", { outcome: "read_failed" });
        }
      }
      return null;
    }

    let result;
    try {
      result = JSON.parse(bytes.toString("utf8"));
      validate?.(result);
    } catch (err) {
      if (!compatible) throw err;
      event("checkpoint.invalidated", { reason: "cached_validation_failed" });
      return null;
    }
    if (migrate) {
      await beforeMigrate();
      event("checkpoint.migrated", { durationMs: await save(result) });
    }
    return result;
  }

  return { key, legacyKey: version === 1 ? legacyKey : key, read, save };
}

module.exports = { checkpointFor };
