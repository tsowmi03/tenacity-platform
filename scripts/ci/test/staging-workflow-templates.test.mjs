import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const templateDirectory = ".github/workflows";
const templatePaths = {
  indexes: `${templateDirectory}/firebase-indexes-staging-rehearsal.yml`,
  rollback: `${templateDirectory}/firebase-rules-rollback-staging-rehearsal.yml`,
  rules: `${templateDirectory}/firebase-rules-staging-rehearsal.yml`,
};
const templates = Object.fromEntries(
  Object.entries(templatePaths).map(([name, path]) => [
    name,
    { path, source: readFileSync(path, "utf8") },
  ])
);

function workflowSection(source, startName, endName) {
  const start = source.indexOf(`      - name: ${startName}`);
  const end = source.indexOf(`      - name: ${endName}`, start + 1);
  assert.notEqual(start, -1, `Missing step: ${startName}`);
  assert.notEqual(end, -1, `Missing following step: ${endName}`);
  return source.slice(start, end);
}

describe("inert Firebase staging workflow templates", () => {
  for (const [name, { path, source }] of Object.entries(templates)) {
    it(`${name} is manually dispatched and bound only to reviewed staging controls`, () => {
      assert.ok(path.startsWith(`${templateDirectory}/`));
      assert.ok(source.startsWith("# ACTIVE STAGING WORKFLOW:"));
      assert.match(source, /\non:\n  workflow_dispatch:\n/);
      assert.match(source, /\nconcurrency:\n  group: tenacity-staging\n  cancel-in-progress: false\n/);
      assert.match(source, /\n  FIREBASE_TARGET: staging\n/);
      assert.match(source, /\n  FIREBASE_PROJECT_ID: tenacity-tutoring-staging\n/);
      assert.match(source, /\n  FIREBASE_DATABASE_ID: \(default\)\n/);
      assert.match(source, /\n    environment: tenacity-staging\n/);
      assert.match(source, /\[\[ "\$REHEARSALS_ENABLED" == "true" \]\]/);
      assert.match(source, /assertFirebaseDeploymentTarget\(\{/);
      assert.match(source, /\[\[ "\$GITHUB_REF" == "refs\/heads\/main" \]\]/);
      assert.match(source, /\[\[ "\$GITHUB_SHA" == "\$AUTHORIZED_SHA" \]\]/);
      assert.match(source, /gh api "repos\/\$\{GITHUB_REPOSITORY\}\/git\/ref\/heads\/main"/);
      assert.match(source, /deployment-evidence-manifest\.mjs create/);
      assert.match(source, /deployment-evidence-manifest\.mjs verify/);
      assert.match(source, /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/);
      assert.match(
        source,
        /google-github-actions\/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093 # v3/
      );
      assert.match(
        source,
        /workload_identity_provider: projects\/354428033510\/locations\/global\/workloadIdentityPools\/github\/providers\/tenacity-platform/
      );
      assert.match(source, /id-token: write/);
      assert.match(source, /token_format: access_token/);
      assert.match(source, /create_credentials_file: true/);
      assert.match(
        source,
        /GOOGLE_OAUTH_ACCESS_TOKEN: \$\{\{ steps\.configure_credentials\.outputs\.access_token \}\}/
      );

      assert.doesNotMatch(source, /tenacity-tutoring-b8eb2/);
      assert.doesNotMatch(source, /FIREBASE_TARGET: production/);
      assert.doesNotMatch(source, /environment: tenacity-production/);
      assert.doesNotMatch(source, /SERVICE_ACCOUNT_JSON/);
      assert.doesNotMatch(source, /BEGIN PRIVATE KEY/);
      assert.doesNotMatch(source, /staging-rehearsal\.mjs/);
      assert.doesNotMatch(source, /(?:^|\s)--force(?:\s|$)/m);
    });
  }

  it("Rules bootstrap records an absent initial release list before strict capture", () => {
    const source = templates.rules.source;
    assert.match(source, /service_account: tenacity-staging-rules@tenacity-tutoring-staging\.iam\.gserviceaccount\.com/);
    assert.doesNotMatch(source, /tenacity-staging-indexes@/);
    assert.match(source, /BOOTSTRAP RULES tenacity-tutoring-staging \$\{AUTHORIZED_SHA\}/);
    assert.match(source, /REHEARSE RULES tenacity-tutoring-staging \$\{AUTHORIZED_SHA\}/);

    const initialStateStep = workflowSection(
      source,
      "Capture or record initial staging Rules state",
      "Assess the captured staging Rules state"
    );
    assert.match(initialStateStep, /if \[\[ "\$SCENARIO" == "bootstrap" \]\]; then/);
    assert.match(initialStateStep, /authorizedJsonRequest/);
    assert.match(initialStateStep, /accessTokenFromEnvironment/);
    assert.match(initialStateStep, /Federated staging access token is missing\./);
    assert.match(initialStateStep, /\/releases\?pageSize=100/);
    assert.match(initialStateStep, /keys\.some\(\(key\) => key !== "releases"\)/);
    assert.match(initialStateStep, /releases\.length !== 0/);
    assert.match(initialStateStep, /tenacity\.firebase-rules-release-inventory/);
    assert.match(initialStateStep, /else\n            node scripts\/firebase\/firebase-rules-state\.mjs capture/);

    const afterStep = workflowSection(
      source,
      "Capture staging Rules after the attempted deployment",
      "Verify staging Rules after rehearsal"
    );
    assert.match(afterStep, /if: always\(\)/);
    assert.match(afterStep, /firebase-rules-state\.mjs capture/);
    assert.match(source, /No prior Rules releases exist to restore\./);
  });

  it("Rules partial rehearsal binds, deploys, verifies, and retains the exact fixture", () => {
    const source = templates.rules.source;
    const fixtureSha256 =
      "cd5089e4e5116dbb994013dc5fd5e7e411ec348935b8d06d13acd00173cca15b";
    assert.match(source, /          - partial\n/);
    assert.match(
      source,
      /APPLY DENY-ALL FIRESTORE RULES tenacity-tutoring-staging \$\{PARTIAL_RULES_FIXTURE_SHA256\} \$\{AUTHORIZED_SHA\}/
    );
    assert.match(source, new RegExp(`PARTIAL_RULES_FIXTURE_SHA256: ${fixtureSha256}`));

    const prepareStep = workflowSection(
      source,
      "Prepare the exact partial Rules deployment",
      "Run staging Rules deployment dry run"
    );
    assert.match(prepareStep, /if: inputs\.scenario == 'partial'/);
    assert.match(
      prepareStep,
      /FIXTURE_PATH="backend\/firebase\/rules\/staging\/firestore-deny-all\.rules"/
    );
    assert.match(prepareStep, /sha256\(fixture\) !== process\.env\.PARTIAL_RULES_FIXTURE_SHA256/);
    assert.match(prepareStep, /allowStatements\[0\]\[2\]\.trim\(\) !== "false"/);
    assert.match(prepareStep, /const partialConfig = \{\n                firestore: \{\n                  rules: fixturePath/);
    assert.doesNotMatch(prepareStep, /storage:/);
    assert.match(prepareStep, /priorSnapshotDigestSha256: prior\.snapshotDigestSha256/);
    assert.match(prepareStep, /partialConfigSha256: sha256\(partialConfigContent\)/);

    const dryRunStep = workflowSection(
      source,
      "Run staging Rules deployment dry run",
      "Deploy selected Rules scenario to staging"
    );
    const deployStep = workflowSection(
      source,
      "Deploy selected Rules scenario to staging",
      "Capture staging Rules after the attempted deployment"
    );
    for (const step of [dryRunStep, deployStep]) {
      assert.match(step, /if \[\[ "\$SCENARIO" == "partial" \]\]; then/);
      assert.match(step, /firebase-partial-rules\.json/);
      assert.match(step, /--only firestore:rules/);
      assert.match(step, /--only "firestore:rules,storage:\$\{FIREBASE_STORAGE_TARGET\}"/);
      assert.equal((step.match(/firebase deploy/g) ?? []).length, 1);
    }

    const verifyStep = workflowSection(
      source,
      "Verify staging Rules after rehearsal",
      "Run read-only staging rollback preflight"
    );
    assert.match(verifyStep, /beforeFirestore\.release\.rulesetName ===/);
    assert.match(verifyStep, /firestoreFiles\[0\]\.content !== fixture/);
    assert.match(verifyStep, /beforeStorage\.release\.rulesetName !== afterStorage\.release\.rulesetName/);
    assert.match(verifyStep, /\.map\(\(\{ name, content \}\) => \(\{ name, content \}\)\)/);
    assert.doesNotMatch(verifyStep, /fingerprint/);

    assert.match(source, /--file "partialConfig=\$\{evidence_dir\}\/firebase-partial-rules\.json"/);
    assert.match(source, /--file "partialInputs=\$\{evidence_dir\}\/partial-inputs\.json"/);
    assert.match(source, /--require-outcome preparePartial=success/);
    assert.match(source, /--require-outcome preparePartial=skipped/);
  });

  it("index bootstrap and no-op paths retain READY and identity checks", () => {
    const source = templates.indexes.source;
    assert.match(source, /service_account: tenacity-staging-indexes@tenacity-tutoring-staging\.iam\.gserviceaccount\.com/);
    assert.doesNotMatch(source, /tenacity-staging-rules@/);
    assert.match(source, /BOOTSTRAP INDEXES tenacity-tutoring-staging \$\{AUTHORIZED_SHA\}/);
    assert.match(source, /REHEARSE INDEXES tenacity-tutoring-staging \$\{AUTHORIZED_SHA\}/);
    assert.match(source, /Wait for every managed staging index to become READY/);
    assert.match(source, /for attempt in \$\(seq 1 180\); do/);
    assert.match(source, /--source backend\/firebase\/indexes\/firestore\.indexes\.json/);
    assert.match(source, /args\+\=\(--baseline "\$\{evidence_dir\}\/indexes-before\.json"\)/);

    const deploymentStep = workflowSection(
      source,
      "Deploy canonical indexes to staging",
      "Wait for every managed staging index to become READY"
    );
    assert.equal((deploymentStep.match(/firebase deploy/g) ?? []).length, 1);
  });

  it("Rules restore is digest-bound, accepts partial evidence, and rejects bootstrap", () => {
    const source = templates.rollback.source;
    assert.match(source, /service_account: tenacity-staging-rules@tenacity-tutoring-staging\.iam\.gserviceaccount\.com/);
    assert.doesNotMatch(source, /tenacity-staging-indexes@/);
    assert.match(source, /TENACITY STAGING DEPLOYMENTS FROZEN/);
    assert.match(source, /ROLLBACK FIREBASE RULES \$\{FIREBASE_PROJECT_ID\} FROM \$\{CURRENT_DIGEST\} TO \$\{PRIOR_DIGEST\}/);
    assert.match(source, /firebase-rules-staging-rehearsal\.yml/);
    assert.match(source, /new Set\(\["noop", "partial"\]\)\.has\(scenario\.scenario\)/);
    assert.match(source, /Only no-op or partial rehearsal evidence is eligible for restore/);
    assert.match(source, /manifest\.files\?\.partialConfig\?\.present !== true/);
    assert.match(source, /manifest\.files\?\.partialInputs\?\.present !== true/);
    assert.match(source, /Partial Firebase config is not Firestore-Rules-only/);
    assert.match(source, /Partial evidence does not contain the exact mixed Firestore state/);
    assert.match(source, /Partial evidence changed the retained Storage state/);
    assert.match(source, /--require-outcome-one-of preparePartial=success,skipped/);
    assert.match(source, /--require-file rulesAfterVerification/);
    assert.match(source, /--require-outcome verifyAfter=success/);
    assert.match(source, /--prior-snapshot "\$\{evidence_dir\}\/rehearsal\/rules-before\.json"/);
    assert.equal(
      (source.match(/--current-snapshot "\$\{evidence_dir\}\/rehearsal\/rules-after\.json"/g) ?? []).length,
      2
    );
    assert.doesNotMatch(source, /--current-snapshot "\$\{evidence_dir\}\/rules-restore-current\.json"/);
    assert.match(source, /--file "scenarioVerification=\$\{evidence_dir\}\/rehearsal-scenario-verification\.json"/);
    assert.match(source, /--require-file scenarioVerification/);
    assert.match(source, /\.map\(\(\{ name, content \}\) => \(\{ name, content \}\)\)/);
    assert.doesNotMatch(
      workflowSection(
        source,
        "Verify restored pointers and immutable Rules source",
        "Create required staging restore evidence manifest"
      ),
      /fingerprint/
    );
    assert.match(source, /--exclusive-deployment-lock/);
  });
});
