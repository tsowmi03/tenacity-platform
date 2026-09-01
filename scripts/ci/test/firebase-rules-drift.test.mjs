import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  RULES_DRIFT_EXIT_CODE,
  checkRulesDrift,
  formatDriftSummary,
} from "../../firebase/firebase-rules-drift.mjs";
import { expectedReleaseName } from "../../firebase/firebase-rules-state.mjs";

const projectId = "tenacity-tutoring-staging";
const storageBucket = "tenacity-tutoring-staging.firebasestorage.app";
const surfaces = ["firestore", "storage"];
const repositoryContent = {
  firestore: readFileSync("backend/firebase/rules/firestore.rules", "utf8"),
  storage: readFileSync("backend/firebase/rules/storage.rules", "utf8"),
};
const configuredNames = {
  firestore: "backend/firebase/rules/firestore.rules",
  storage: "backend/firebase/rules/storage.rules",
};
const checkedAt = Date.parse("2026-09-02T00:00:00Z");

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (payload === null ? "" : JSON.stringify(payload)),
  };
}

function resourceNameFromUrl(url) {
  return new URL(url).pathname
    .slice("/v1/".length)
    .split("/")
    .map(decodeURIComponent)
    .join("/");
}

/**
 * A live project as the Rules API would describe it: one release per surface,
 * each bound to an immutable ruleset holding a single source file.
 */
function liveProject({
  contents = repositoryContent,
  names = configuredNames,
  neverReleased = [],
  failures = {},
} = {}) {
  const releases = {};
  const rulesets = {};
  for (const [index, surface] of surfaces.entries()) {
    if (neverReleased.includes(surface)) continue;
    const service = surface === "firestore" ? "cloud.firestore" : "firebase.storage";
    const releaseName = expectedReleaseName(projectId, surface, storageBucket);
    const rulesetName = `projects/${projectId}/rulesets/live-${surface}`;
    releases[releaseName] = {
      name: releaseName,
      rulesetName,
      createTime: "2026-07-22T00:00:00Z",
      updateTime: `2026-09-0${index + 1}T12:30:00Z`,
    };
    rulesets[rulesetName] = {
      name: rulesetName,
      createTime: `2026-09-0${index + 1}T12:29:00Z`,
      metadata: { services: [service] },
      source: {
        files: [{ name: names[surface], content: contents[surface] }],
      },
    };
  }
  const fetchImpl = async (url, init) => {
    const name = resourceNameFromUrl(url);
    assert.equal(init.method, "GET");
    for (const [surface, status] of Object.entries(failures)) {
      if (name === expectedReleaseName(projectId, surface, storageBucket)) {
        return jsonResponse({ error: { message: `${surface} is not readable` } }, status);
      }
    }
    if (releases[name]) return jsonResponse(releases[name]);
    if (rulesets[name]) return jsonResponse(rulesets[name]);
    return jsonResponse({ error: { message: `${name} does not exist` } }, 404);
  };
  return { fetchImpl, releases, rulesets };
}

function runCheck(options) {
  return checkRulesDrift({
    target: "staging",
    projectId,
    storageBucket,
    accessToken: "test-token",
    fetchImpl: liveProject(options).fetchImpl,
    now: () => checkedAt,
  });
}

describe("Firebase rules drift check", () => {
  it("reports every surface in sync when the deployed source matches the repository", async () => {
    const report = await runCheck();

    assert.equal(report.kind, "tenacity.firebase-rules-drift-report");
    assert.equal(report.inSync, true);
    assert.deepEqual(report.driftedSurfaces, []);
    assert.equal(report.projectId, projectId);
    assert.equal(report.checkedAt, "2026-09-02T00:00:00.000Z");
    for (const surface of surfaces) {
      const entry = report.surfaces[surface];
      assert.equal(entry.state, "in-sync");
      assert.equal(entry.liveContentSha256, entry.localContentSha256);
      assert.equal(entry.rulesetName, `projects/${projectId}/rulesets/live-${surface}`);
    }
  });

  it("reports the surface whose deployed source has fallen behind", async () => {
    const report = await runCheck({
      contents: {
        ...repositoryContent,
        firestore: repositoryContent.firestore.replace("rules_version", "// stale\nrules_version"),
      },
    });

    assert.equal(report.inSync, false);
    assert.deepEqual(report.driftedSurfaces, ["firestore"]);
    assert.equal(report.surfaces.firestore.state, "content-drift");
    assert.notEqual(
      report.surfaces.firestore.liveContentSha256,
      report.surfaces.firestore.localContentSha256
    );
    assert.equal(report.surfaces.firestore.releaseUpdateTime, "2026-09-01T12:30:00Z");
    assert.equal(report.surfaces.storage.state, "in-sync");
  });

  it("reports a surface deployed under an unconfigured source file name", async () => {
    const report = await runCheck({ names: { ...configuredNames, storage: "storage.rules" } });

    assert.equal(report.inSync, false);
    assert.deepEqual(report.driftedSurfaces, ["storage"]);
    assert.equal(report.surfaces.storage.state, "source-name-drift");
    assert.equal(report.surfaces.storage.capturedName, "storage.rules");
    assert.equal(report.surfaces.storage.configuredName, configuredNames.storage);
  });

  // Staging is in exactly this state: Storage rules have never been released
  // there, so a check that aborted on the 404 would report nothing at all -
  // including nothing about Firestore, which is the surface that drifted.
  it("keeps the other surface's verdict when one has never been released", async () => {
    const report = await runCheck({
      neverReleased: ["storage"],
      contents: {
        ...repositoryContent,
        firestore: `${repositoryContent.firestore}\n// deployed by hand\n`,
      },
    });

    assert.equal(report.inSync, false);
    assert.deepEqual(report.driftedSurfaces, ["firestore", "storage"]);
    assert.equal(report.surfaces.storage.state, "never-released");
    assert.equal(report.surfaces.storage.rulesetName, null);
    assert.equal(report.surfaces.storage.liveContentSha256, null);
    assert.match(report.surfaces.storage.localContentSha256, /^[a-f0-9]{64}$/);
    assert.equal(report.surfaces.firestore.state, "content-drift");
  });

  it("fails rather than reporting drift when a surface cannot be read", async () => {
    await assert.rejects(
      () => runCheck({ failures: { storage: 403 } }),
      /Google API request failed with HTTP 403/
    );
  });

  it("never sends a mutating request", async () => {
    const methods = [];
    const project = liveProject();
    await checkRulesDrift({
      target: "staging",
      projectId,
      storageBucket,
      accessToken: "test-token",
      now: () => checkedAt,
      fetchImpl: async (url, init) => {
        methods.push(init.method);
        return project.fetchImpl(url, init);
      },
    });

    assert.ok(methods.length > 0);
    assert.deepEqual([...new Set(methods)], ["GET"]);
  });
});

describe("Firebase rules drift summary", () => {
  it("states the verdict and every surface", async () => {
    const drifted = formatDriftSummary(await runCheck({ neverReleased: ["storage"] }));

    assert.match(drifted, /Drift detected\*\* on storage/);
    assert.match(drifted, /\| firestore \| matches the repository \|/);
    assert.match(drifted, /\| storage \| never released to this project \|/);

    const clean = formatDriftSummary(await runCheck());
    assert.match(clean, /\*\*In sync\.\*\*/);
    assert.doesNotMatch(clean, /Drift detected/);
  });

  it("exits with a code that separates drift from a broken check", () => {
    assert.equal(RULES_DRIFT_EXIT_CODE, 20);
    assert.notEqual(RULES_DRIFT_EXIT_CODE, 0);
    assert.notEqual(RULES_DRIFT_EXIT_CODE, 1);
  });
});

describe("Firebase rules drift workflow", () => {
  const path = ".github/workflows/firebase-rules-drift-check.yml";
  const source = readFileSync(path, "utf8");

  it("runs unattended, on a schedule and after every merge that touches rules", () => {
    assert.ok(source.startsWith("# ACTIVE READ-ONLY WORKFLOW:"));
    assert.match(source, /\non:\n {2}schedule:\n/);
    assert.match(source, /- cron: "15 20 \* \* \*"/);
    assert.match(source, /\n {2}push:\n {4}branches:\n {6}- main\n {4}paths:\n/);
    assert.match(source, /- backend\/firebase\/rules\/\*\*/);
    assert.match(source, /- firebase\.json/);
    assert.match(source, /\n {2}workflow_dispatch:\n/);
  });

  // The rehearsal workflows gate on this flag because they can change staging.
  // This one only reads, and the weeks when the flag is off - between
  // rehearsal windows - are exactly when drift goes unnoticed. TP-19.
  it("is not gated on the rehearsal window", () => {
    assert.doesNotMatch(source, /vars\.TENACITY_STAGING_REHEARSALS_ENABLED/);
    assert.doesNotMatch(source, /REHEARSALS_ENABLED" == "true"/);
    assert.match(source, /It deliberately does not consult TENACITY_STAGING_REHEARSALS_ENABLED/);
  });

  it("cannot deploy anything", () => {
    assert.match(source, /\npermissions:\n {2}contents: read\n/);
    assert.match(source, /access_token_scopes: https:\/\/www\.googleapis\.com\/auth\/firebase\.readonly/);
    assert.match(source, /create_credentials_file: false/);
    assert.doesNotMatch(source, /firebase deploy/);
    assert.doesNotMatch(source, /firebase-tools/);
    assert.doesNotMatch(source, /(?:^|\s)--force(?:\s|$)/m);
    assert.doesNotMatch(source, /contents: write/);
    assert.doesNotMatch(source, /firebase-rules-state\.mjs (?:rollback|capture) [^\n]*--apply/);
  });

  it("checks both targets with their own scoped identity and environment", () => {
    for (const [target, environment, account, project] of [
      ["staging", "tenacity-staging", "tenacity-staging-rules", "tenacity-tutoring-staging"],
      ["production", "tenacity-production", "tenacity-production-rules", "tenacity-tutoring-b8eb2"],
    ]) {
      assert.match(source, new RegExp(`- target: ${target}\\n {12}environment: ${environment}\\n`));
      assert.match(source, new RegExp(`project_id: ${project}\\n`));
      assert.match(source, new RegExp(`service_account: ${account}@${project}\\.iam\\.gserviceaccount\\.com\\n`));
    }
    assert.doesNotMatch(source, /tenacity-(?:staging|production)-(?:indexes|functions|hosting)@/);
    assert.match(source, /environment: \$\{\{ matrix\.environment \}\}/);
    assert.match(source, /google-github-actions\/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093 # v3/);
    assert.match(source, /id-token: write/);
    assert.match(source, /fail-fast: false/);
  });

  // A check that reads a project mid-deploy would report the half-applied
  // state as drift, so it queues behind deploys instead of racing them.
  it("shares each target's deploy concurrency group", () => {
    assert.match(source, /concurrency:\n {6}group: \$\{\{ matrix\.environment \}\}\n {6}cancel-in-progress: false/);
  });

  it("distinguishes drift from a check that could not run", () => {
    assert.match(source, /node scripts\/firebase\/firebase-rules-drift\.mjs/);
    assert.match(source, new RegExp(`if \\[\\[ "\\$status" == "${RULES_DRIFT_EXIT_CODE}" \\]\\]; then`));
    assert.match(source, /::error title=Firebase rules drift::/);
    assert.match(source, /exit "\$status"/);
    assert.match(source, /cat "\$\{DRIFT_DIR\}\/summary\.md" >> "\$GITHUB_STEP_SUMMARY"/);
  });
});
