"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const mammoth = require("mammoth");

const {
  processResourceFallbackImpl,
  runGenerationPipeline,
  runQueueForTutor,
} = require("../src/resources");
const {
  DEFAULT_RESOURCE_MODEL,
  OPENAI_RESOURCE_MODEL,
  backupModelFor,
  displayNameForModel,
  providerForModel,
} = require("../src/resources/modelRegistry");

const SCENARIOS = Object.freeze({
  "sol-direct": Object.freeze({ primaryModel: OPENAI_RESOURCE_MODEL, injectPrimaryFailure: false }),
  "opus-direct": Object.freeze({ primaryModel: DEFAULT_RESOURCE_MODEL, injectPrimaryFailure: false }),
  "opus-to-sol": Object.freeze({ primaryModel: DEFAULT_RESOURCE_MODEL, injectPrimaryFailure: true }),
  "sol-to-opus": Object.freeze({ primaryModel: OPENAI_RESOURCE_MODEL, injectPrimaryFailure: true }),
});

const DEFAULT_SCENARIO = "opus-to-sol";
const SECRET_FILE = path.resolve(__dirname, "../.secret.local");
const DEFAULT_FIREBASE_PROJECT = "tenacity-tutoring-b8eb2";

function usage() {
  return `Usage:
  npm run smoke:resources:live -- --preflight [--scenario ${DEFAULT_SCENARIO}]
  npm run smoke:resources:live -- [--scenario ${DEFAULT_SCENARIO}] [--firebase-secrets] [--output DIR]

Scenarios:
  opus-to-sol  Simulate an Anthropic availability failure, then generate with GPT-5.6 Sol (default)
  sol-direct   Generate directly with GPT-5.6 Sol
  opus-direct  Generate directly with Claude Opus 5
  sol-to-opus  Simulate an OpenAI availability failure, then generate with Claude Opus 5

The runner uses synthetic data and writes only to a local temporary directory. By default it
uses shell/.secret.local keys and never connects to Firebase. --firebase-secrets reads only the
required existing Secret Manager value through the Firebase CLI and keeps it in memory.`;
}

function parseCliArgs(argv = []) {
  const options = {
    scenario: DEFAULT_SCENARIO,
    preflight: false,
    outputDir: null,
    firebaseSecrets: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--preflight") options.preflight = true;
    else if (value === "--firebase-secrets") options.firebaseSecrets = true;
    else if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--scenario") options.scenario = argv[++index];
    else if (value === "--output") options.outputDir = argv[++index];
    else throw new TypeError(`Unknown argument: ${value}`);
  }
  if (!SCENARIOS[options.scenario]) {
    throw new TypeError(`Unknown scenario: ${options.scenario}`);
  }
  if (argv.includes("--scenario") && !options.scenario) {
    throw new TypeError("--scenario requires a value");
  }
  if (argv.includes("--output") && !options.outputDir) {
    throw new TypeError("--output requires a directory");
  }
  return options;
}

function unquoteSecret(value) {
  const trimmed = String(value || "").trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseSecretFile(contents = "") {
  const secrets = {};
  for (const originalLine of String(contents).split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) continue;
    secrets[name] = unquoteSecret(line.slice(separator + 1));
  }
  return secrets;
}

function loadLocalSecrets({ env = process.env, secretFile = SECRET_FILE } = {}) {
  let fileSecrets = {};
  if (fs.existsSync(secretFile)) {
    fileSecrets = parseSecretFile(fs.readFileSync(secretFile, "utf8"));
  }
  return {
    secretFile,
    values: {
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY || fileSecrets.ANTHROPIC_API_KEY || "",
      OPENAI_API_KEY: env.OPENAI_API_KEY || fileSecrets.OPENAI_API_KEY || "",
    },
  };
}

function loadFirebaseSecrets({
  secretNames,
  projectId = DEFAULT_FIREBASE_PROJECT,
  run = execFileSync,
  env = process.env,
} = {}) {
  const values = {};
  for (const name of secretNames || []) {
    try {
      values[name] = String(run(
        "firebase",
        ["functions:secrets:access", name, "--project", projectId],
        {
          encoding: "utf8",
          env: { ...env, FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true" },
          stdio: ["ignore", "pipe", "pipe"],
        }
      ) || "").trim();
    } catch (cause) {
      const error = new Error(
        `Could not read ${name} from Firebase Secret Manager for ${projectId}. ` +
          "Check Firebase CLI authentication and secret access."
      );
      error.code = "SMOKE_FIREBASE_SECRET_ACCESS";
      error.cause = cause;
      throw error;
    }
  }
  return values;
}

function requiredSecretNames(scenarioName) {
  const scenario = SCENARIOS[scenarioName];
  const effectiveModel = scenario.injectPrimaryFailure
    ? backupModelFor(scenario.primaryModel)
    : scenario.primaryModel;
  return providerForModel(effectiveModel) === "openai"
    ? ["OPENAI_API_KEY"]
    : ["ANTHROPIC_API_KEY"];
}

function assertSecretsAvailable(scenarioName, loaded) {
  const missing = requiredSecretNames(scenarioName)
    .filter((name) => !String(loaded.values[name] || "").trim());
  if (!missing.length) return;
  const error = new Error(
    `Missing ${missing.join(", ")}. Add it to ${loaded.secretFile} or export it in the shell.`
  );
  error.code = "SMOKE_SECRET_MISSING";
  throw error;
}

function comparable(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return value;
}

function createMemoryDb(initialJobs) {
  const jobs = initialJobs.map((job) => ({ ...job }));

  function ref(id) {
    return {
      __type: "ref",
      id,
      async get() {
        const job = jobs.find((item) => item.id === id);
        return { exists: Boolean(job), data: () => ({ ...job, jobId: id }) };
      },
      async update(patch) {
        const job = jobs.find((item) => item.id === id);
        if (job) Object.assign(job, patch);
      },
    };
  }

  function docsForQuery(query) {
    let result = jobs.filter((job) =>
      query.filters.every((filter) => {
        if (filter.op === "==") return job[filter.field] === filter.value;
        if (filter.op === "<") {
          return comparable(job[filter.field]) < comparable(filter.value);
        }
        throw new Error(`Unsupported in-memory Firestore operator: ${filter.op}`);
      })
    );
    if (query.sort) {
      result = result.sort((left, right) => {
        const a = comparable(left[query.sort.field]);
        const b = comparable(right[query.sort.field]);
        return a < b ? -1 : a > b ? 1 : 0;
      });
    }
    if (query.max) result = result.slice(0, query.max);
    return result.map((job) => ({
      id: job.id,
      ref: ref(job.id),
      data: () => ({ ...job, jobId: job.id }),
    }));
  }

  function query(filters = [], sort = null, max = null) {
    return {
      __type: "query",
      filters,
      sort,
      max,
      where(field, op, value) {
        return query([...filters, { field, op, value }], sort, max);
      },
      orderBy(field) {
        return query(filters, { field }, max);
      },
      limit(value) {
        return query(filters, sort, value);
      },
      async get() {
        const docs = docsForQuery(this);
        return { empty: docs.length === 0, docs };
      },
    };
  }

  return {
    jobs,
    collection(name) {
      if (name !== "resourceJobs") {
        throw new Error(`Unexpected smoke-test collection: ${name}`);
      }
      return {
        where(field, op, value) {
          return query().where(field, op, value);
        },
        doc(id) {
          return ref(id);
        },
      };
    },
    runTransaction(callback) {
      const transaction = {
        async get(target) {
          if (target?.__type === "ref") {
            const job = jobs.find((item) => item.id === target.id);
            return { exists: Boolean(job), data: () => ({ ...job, jobId: target.id }) };
          }
          const docs = docsForQuery(target);
          return { empty: docs.length === 0, docs };
        },
        update(target, patch) {
          const job = jobs.find((item) => item.id === target.id);
          if (job) Object.assign(job, patch);
        },
      };
      return callback(transaction);
    },
  };
}

function createMemoryStorage() {
  const objects = new Map();
  return {
    objects,
    bucket() {
      return {
        async deleteFiles({ prefix }) {
          for (const objectPath of [...objects.keys()]) {
            if (objectPath.startsWith(prefix)) objects.delete(objectPath);
          }
        },
        file(objectPath) {
          return {
            async download() {
              return [Buffer.from(objects.get(objectPath) || "")];
            },
            async save(buffer, options) {
              objects.set(objectPath, Buffer.from(buffer));
              objects.set(`${objectPath}.metadata`, options || {});
            },
            async delete() {
              objects.delete(objectPath);
              objects.delete(`${objectPath}.metadata`);
            },
          };
        },
      };
    },
  };
}

function createSmokeJob(primaryModel) {
  return {
    id: "local-resource-smoke",
    jobId: "local-resource-smoke",
    createdBy: "local-smoke-tutor",
    createdByName: "Local Smoke Test",
    createdAt: new Date(),
    studentId: "synthetic-student",
    studentName: "Synthetic Student",
    subject: "maths",
    year: 8,
    resourceType: "worksheet",
    answerMode: "answers",
    showMarks: true,
    includeWorking: false,
    customPrompt:
      "Create exactly two short Year 8 linear-equation questions. Do not use diagrams. This is synthetic pre-release test data.",
    uploadedFiles: [],
    uploadedFilePath: null,
    uploadedFileName: null,
    modelChoice: primaryModel,
    requestedModel: primaryModel,
    activeModel: primaryModel,
    effectiveModel: null,
    effectiveProvider: null,
    model: primaryModel,
    attemptedModels: [],
    fallbackUsed: false,
    failover: null,
    failureAttempts: [],
    sourceSelections: [],
    sourceCanonicalUrls: [],
    usageByProvider: {},
    warnings: [],
    status: "pending",
    generatedJson: null,
    outputPath: null,
    outputFileName: null,
    previewPath: null,
    cancelRequested: false,
    attemptId: null,
    attemptCount: 0,
  };
}

function smokeWatcher() {
  const controller = new AbortController();
  return { signal: controller.signal, isCancelled: () => false, stop() {} };
}

function simulatedAvailabilityFailure(model) {
  const error = new Error(`Injected local availability failure for ${model}`);
  error.code = "529";
  error.status = 529;
  error.modelFailure = true;
  error.provider = providerForModel(model);
  error.model = model;
  error.smokeInjected = true;
  return error;
}

function safeAudit(job, scenarioName, textLength) {
  return {
    scenario: scenarioName,
    status: job.status,
    requestedModel: job.requestedModel,
    effectiveModel: job.effectiveModel,
    effectiveProvider: job.effectiveProvider,
    attemptedModels: job.attemptedModels,
    fallbackUsed: job.fallbackUsed,
    failover: job.failover,
    failureAttempts: job.failureAttempts,
    usageByProvider: job.usageByProvider,
    outputFileName: job.outputFileName,
    outputPath: job.outputPath,
    docxExtractedTextLength: textLength,
    warnings: job.warnings || [],
  };
}

async function verifyAndWriteArtifact({ job, storage, scenarioName, outputDir }) {
  const docx = storage.objects.get(job.outputPath);
  if (!Buffer.isBuffer(docx) || docx.subarray(0, 2).toString("utf8") !== "PK") {
    throw new Error("Smoke run did not produce a valid DOCX zip payload");
  }
  const extracted = await mammoth.extractRawText({ buffer: docx });
  const text = String(extracted.value || "").trim();
  if (text.length < 40) {
    throw new Error("Generated DOCX opened but did not contain enough readable text");
  }

  await fs.promises.mkdir(outputDir, { recursive: true });
  const docxPath = path.join(outputDir, job.outputFileName || `${scenarioName}.docx`);
  const auditPath = path.join(outputDir, `${scenarioName}-audit.json`);
  await fs.promises.writeFile(docxPath, docx);
  await fs.promises.writeFile(
    auditPath,
    `${JSON.stringify(safeAudit(job, scenarioName, text.length), null, 2)}\n`,
    "utf8"
  );
  return { docxPath, auditPath, textLength: text.length };
}

async function runScenario({
  scenarioName,
  secrets,
  outputDir,
  generationPipeline = runGenerationPipeline,
}) {
  const scenario = SCENARIOS[scenarioName];
  const job = createSmokeJob(scenario.primaryModel);
  const db = createMemoryDb([job]);
  const storage = createMemoryStorage();
  const clock = () => new Date();
  let attemptNumber = 0;
  let injected = false;

  const deps = {
    db,
    storage,
    clock,
    anthropicApiKey: secrets.ANTHROPIC_API_KEY,
    openaiApiKey: secrets.OPENAI_API_KEY,
    enablePdTextSourcing: false,
    enableFailover: true,
    attemptIdFactory: () => `local-attempt-${++attemptNumber}-${randomUUID().slice(0, 8)}`,
    startCancelWatcher: smokeWatcher,
    generationPipeline: async (activeJob, activeDeps) => {
      if (
        scenario.injectPrimaryFailure &&
        !injected &&
        activeJob.activeModel === scenario.primaryModel
      ) {
        injected = true;
        throw simulatedAvailabilityFailure(scenario.primaryModel);
      }
      return generationPipeline(activeJob, activeDeps);
    },
  };

  const firstOutcomes = await runQueueForTutor(job.createdBy, deps);
  if (scenario.injectPrimaryFailure) {
    if (firstOutcomes[0]?.status !== "fallback_pending") {
      throw new Error(`Expected fallback_pending, received ${firstOutcomes[0]?.status || "nothing"}`);
    }
    const fallbackJob = db.jobs[0];
    const handoff = await processResourceFallbackImpl({
      event: {
        params: { jobId: fallbackJob.id },
        data: {
          before: { data: () => ({ status: "processing" }) },
          after: { data: () => ({ ...fallbackJob }) },
        },
      },
      deps,
    });
    if (handoff?.outcomes?.[0]?.status !== "complete") {
      const failureDetail = db.jobs[0]?.errorDetail || db.jobs[0]?.error || "No detail recorded";
      throw new Error(
        `Fallback worker did not complete: ${JSON.stringify(handoff?.outcomes || handoff)} ` +
          `Detail: ${failureDetail}`
      );
    }
  } else if (firstOutcomes[0]?.status !== "complete") {
    throw new Error(`Direct generation did not complete: ${JSON.stringify(firstOutcomes)}`);
  }

  const completed = db.jobs[0];
  const expectedModel = scenario.injectPrimaryFailure
    ? backupModelFor(scenario.primaryModel)
    : scenario.primaryModel;
  if (completed.status !== "complete" || completed.effectiveModel !== expectedModel) {
    throw new Error(
      `Model audit mismatch: expected ${expectedModel}, received ${completed.effectiveModel}`
    );
  }
  if (scenario.injectPrimaryFailure && !completed.fallbackUsed) {
    throw new Error("Fallback completed without recording fallbackUsed=true");
  }

  const artifact = await verifyAndWriteArtifact({
    job: completed,
    storage,
    scenarioName,
    outputDir,
  });
  return { job: completed, artifact };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const loaded = loadLocalSecrets();
  const required = requiredSecretNames(options.scenario);
  if (options.firebaseSecrets) {
    const missingLocally = required.filter((name) => !loaded.values[name]);
    Object.assign(loaded.values, loadFirebaseSecrets({ secretNames: missingLocally }));
  }
  assertSecretsAvailable(options.scenario, loaded);
  console.log(`Scenario: ${options.scenario}`);
  console.log(
    `${options.firebaseSecrets ? "Secret Manager" : "Local secret"} preflight: ` +
      `${required.join(", ")} available`
  );
  if (options.preflight) {
    console.log("Preflight passed. No provider call was made.");
    return;
  }

  const outputDir = path.resolve(
    options.outputDir ||
      path.join(os.tmpdir(), "tenacity-resource-smoke", `${Date.now()}-${options.scenario}`)
  );
  const result = await runScenario({
    scenarioName: options.scenario,
    secrets: loaded.values,
    outputDir,
  });
  console.log(
    `Completed with ${displayNameForModel(result.job.effectiveModel)}` +
      `${result.job.fallbackUsed ? " after one injected provider failure" : ""}.`
  );
  console.log(`DOCX: ${result.artifact.docxPath}`);
  console.log(`Audit: ${result.artifact.auditPath}`);
  console.log(`Readable DOCX text: ${result.artifact.textLength} characters`);
}

if (require.main === module) {
  main().catch((error) => {
    const code = error?.code ? ` [${error.code}]` : "";
    console.error(`Resource live smoke failed${code}: ${error?.message || String(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_SCENARIO,
  SCENARIOS,
  assertSecretsAvailable,
  createMemoryDb,
  createMemoryStorage,
  createSmokeJob,
  loadFirebaseSecrets,
  loadLocalSecrets,
  parseCliArgs,
  parseSecretFile,
  requiredSecretNames,
  runScenario,
  verifyAndWriteArtifact,
};
