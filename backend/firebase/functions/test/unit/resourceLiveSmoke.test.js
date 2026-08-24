"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runGenerationPipeline } = require("../../src/resources");

const {
  assertSecretsAvailable,
  createMemoryStorage,
  loadFirebaseSecrets,
  parseCliArgs,
  parseSecretFile,
  requiredSecretNames,
  runScenario,
} = require("../../scripts/liveResourceSmoke");

describe("live resource smoke CLI", () => {
  it("defaults to the synthetic Opus-to-Sol outage rehearsal", () => {
    assert.deepEqual(parseCliArgs([]), {
      scenario: "opus-to-sol",
      preflight: false,
      outputDir: null,
      firebaseSecrets: false,
      help: false,
    });
  });

  it("parses explicit safe options and rejects unknown scenarios", () => {
    assert.deepEqual(
      parseCliArgs(["--scenario", "sol-direct", "--preflight", "--output", "/tmp/out"]),
      {
        scenario: "sol-direct",
        preflight: true,
        outputDir: "/tmp/out",
        firebaseSecrets: false,
        help: false,
      }
    );
    assert.throws(() => parseCliArgs(["--scenario", "unknown"]), /Unknown scenario/);
  });

  it("reads local secret syntax without exposing or transforming the value", () => {
    assert.deepEqual(
      parseSecretFile([
        "# local only",
        "OPENAI_API_KEY='openai-local-key'",
        'ANTHROPIC_API_KEY="anthropic-local-key"',
        "not valid",
      ].join("\n")),
      {
        OPENAI_API_KEY: "openai-local-key",
        ANTHROPIC_API_KEY: "anthropic-local-key",
      }
    );
  });

  it("requires only the provider that will actually receive the synthetic request", () => {
    assert.deepEqual(requiredSecretNames("opus-to-sol"), ["OPENAI_API_KEY"]);
    assert.deepEqual(requiredSecretNames("sol-direct"), ["OPENAI_API_KEY"]);
    assert.deepEqual(requiredSecretNames("sol-to-opus"), ["ANTHROPIC_API_KEY"]);
    assert.deepEqual(requiredSecretNames("opus-direct"), ["ANTHROPIC_API_KEY"]);
  });

  it("can read an existing Firebase secret into memory without logging it", () => {
    const calls = [];
    const values = loadFirebaseSecrets({
      secretNames: ["OPENAI_API_KEY"],
      projectId: "project-test",
      run(command, args, options) {
        calls.push({ command, args, options });
        return "firebase-secret-value\n";
      },
    });
    assert.deepEqual(values, { OPENAI_API_KEY: "firebase-secret-value" });
    assert.deepEqual(calls[0].args, [
      "functions:secrets:access",
      "OPENAI_API_KEY",
      "--project",
      "project-test",
    ]);
    assert.deepEqual(calls[0].options.stdio, ["ignore", "pipe", "pipe"]);
  });

  it("fails preflight with a path but never includes a secret value", () => {
    assert.throws(
      () => assertSecretsAvailable("opus-to-sol", {
        secretFile: "/safe/path/.secret.local",
        values: { OPENAI_API_KEY: "" },
      }),
      (error) =>
        error.code === "SMOKE_SECRET_MISSING" &&
        error.message.includes("/safe/path/.secret.local")
    );
  });

  it("keeps generated objects in memory instead of Firebase Storage", async () => {
    const storage = createMemoryStorage();
    await storage.bucket().file("resources/generated/job/attempt/test.docx")
      .save(Buffer.from("PK test"), { metadata: { contentType: "test" } });
    assert.equal(
      storage.objects.get("resources/generated/job/attempt/test.docx").toString(),
      "PK test"
    );
    await storage.bucket().deleteFiles({ prefix: "resources/generated/job/attempt/" });
    assert.equal(storage.objects.has("resources/generated/job/attempt/test.docx"), false);
  });

  it("rehearses a fresh fallback attempt and writes a readable local DOCX", async () => {
    const outputDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "tenacity-resource-smoke-test-")
    );
    try {
      const result = await runScenario({
        scenarioName: "opus-to-sol",
        secrets: { OPENAI_API_KEY: "local-test-key", ANTHROPIC_API_KEY: "" },
        outputDir,
        generationPipeline: (job, deps) => runGenerationPipeline(job, {
          ...deps,
          callAi: async () => ({
            parsed: {
              title: "Local Smoke Worksheet",
              subject: "maths",
              year: 8,
              topic: "Linear equations",
              totalMarks: 2,
              questions: [
                {
                  number: 1,
                  stem: "Solve x + 3 = 8.",
                  marks: 2,
                  workingLines: 2,
                  parts: null,
                  diagramType: "none",
                  diagramRequired: false,
                },
              ],
              answers: [{ questionNumber: 1, partLabel: null, answer: "x = 5" }],
            },
            raw: "{\"title\":\"Local Smoke Worksheet\"}",
            provider: "openai",
            model: "gpt-5.6-sol",
            responseId: "resp_local_test",
            usage: { inputTokens: 10, outputTokens: 20 },
          }),
        }),
      });

      assert.equal(result.job.status, "complete");
      assert.equal(result.job.fallbackUsed, true);
      assert.deepEqual(result.job.attemptedModels, ["claude-opus-5", "gpt-5.6-sol"]);
      assert.equal(fs.existsSync(result.artifact.docxPath), true);
      assert.equal(fs.existsSync(result.artifact.auditPath), true);
      const audit = await fs.promises.readFile(result.artifact.auditPath, "utf8");
      assert.match(audit, /\"effectiveModel\": \"gpt-5\.6-sol\"/);
      assert.doesNotMatch(audit, /local-test-key/);
    } finally {
      await fs.promises.rm(outputDir, { recursive: true, force: true });
    }
  });
});
