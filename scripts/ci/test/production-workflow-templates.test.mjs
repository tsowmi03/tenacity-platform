import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const templateDirectory = ".github/workflows";
const templatePaths = {
  functions: `${templateDirectory}/firebase-functions-production.yml`,
  hosting: `${templateDirectory}/firebase-hosting-production.yml`,
  indexes: `${templateDirectory}/firebase-indexes-production.yml`,
  rollback: `${templateDirectory}/firebase-rules-rollback-production.yml`,
  rules: `${templateDirectory}/firebase-rules-production.yml`,
};
const templates = Object.fromEntries(
  Object.entries(templatePaths).map(([name, path]) => [
    name,
    { path, source: readFileSync(path, "utf8") },
  ])
);

const productionProviderPattern =
  /workload_identity_provider: projects\/398065992407\/locations\/global\/workloadIdentityPools\/github\/providers\/tenacity-platform/;
const serviceAccounts = {
  functions:
    "tenacity-production-functions@tenacity-tutoring-b8eb2.iam.gserviceaccount.com",
  hosting:
    "tenacity-production-hosting@tenacity-tutoring-b8eb2.iam.gserviceaccount.com",
  indexes:
    "tenacity-production-indexes@tenacity-tutoring-b8eb2.iam.gserviceaccount.com",
  rollback:
    "tenacity-production-rules@tenacity-tutoring-b8eb2.iam.gserviceaccount.com",
  rules:
    "tenacity-production-rules@tenacity-tutoring-b8eb2.iam.gserviceaccount.com",
};

describe("active Firebase production workflows", () => {
  for (const [name, { path, source }] of Object.entries(templates)) {
    it(`${name} is active, environment-gated, and bound to production controls`, () => {
      assert.ok(path.startsWith(`${templateDirectory}/`));
      assert.ok(source.startsWith("# ACTIVE PRODUCTION WORKFLOW:"));
      assert.match(source, /\non:\n  workflow_dispatch:\n/);
      // Manual dispatch only: no push/pull_request/schedule trigger.
      assert.doesNotMatch(source, /\n  (?:push|pull_request|schedule):/);
      // Each dispatch is tied to the cutover execution record.
      assert.match(source, /authorization_record:/);
      assert.match(source, /\[\[ "\$AUTHORIZATION_RECORD" =~ \^\[1-9\]\[0-9\]\*\$ \]\]/);
      assert.match(
        source,
        /\nconcurrency:\n  group: tenacity-production\n  cancel-in-progress: false\n/
      );
      assert.match(source, /\n  FIREBASE_PROJECT_ID: tenacity-tutoring-b8eb2\n/);
      assert.match(source, /\n    environment: tenacity-production\n/);
      assert.match(source, /\[\[ "\$DEPLOYS_ENABLED" == "true" \]\]/);
      assert.match(source, /\[\[ "\$GITHUB_REF" == "refs\/heads\/main" \]\]/);
      assert.match(source, /\[\[ "\$GITHUB_SHA" == "\$AUTHORIZED_SHA" \]\]/);
      assert.match(
        source,
        /gh api "repos\/\$\{GITHUB_REPOSITORY\}\/git\/ref\/heads\/main"/
      );

      assert.doesNotMatch(source, /SERVICE_ACCOUNT_JSON/);
      assert.doesNotMatch(source, /BEGIN PRIVATE KEY/);
      assert.doesNotMatch(source, /firebase-service-account\.json/);
      assert.doesNotMatch(source, /tenacity-tutoring-staging/);
      assert.doesNotMatch(source, /environment: tenacity-staging/);
      assert.doesNotMatch(source, /354428033510/);
      assert.doesNotMatch(source, /(?:^|\s)--force(?:\s|$)/m);
    });

    it(`${name} authenticates only through the production federation binding`, () => {
      assert.equal(
        (source.match(/google-github-actions\/auth@/g) ?? []).length,
        1
      );
      assert.match(
        source,
        /google-github-actions\/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093 # v3/
      );
      assert.match(source, productionProviderPattern);
      assert.match(source, /id-token: write/);
      assert.match(source, /token_format: access_token/);
      assert.match(
        source,
        /access_token_scopes: https:\/\/www\.googleapis\.com\/auth\/cloud-platform/
      );
      assert.match(source, /create_credentials_file: true/);
      assert.match(source, /if \[\[ -n "\$\{GOOGLE_GHA_CREDS_PATH:-\}" \]\]; then/);
      assert.match(source, /rm -f "\$GOOGLE_GHA_CREDS_PATH"/);

      const expectedAccount = serviceAccounts[name];
      assert.match(
        source,
        new RegExp(`service_account: ${expectedAccount.replace(/[.@]/g, "\\$&")}`)
      );
      for (const [otherName, otherAccount] of Object.entries(serviceAccounts)) {
        if (otherAccount === expectedAccount) continue;
        assert.doesNotMatch(
          source,
          new RegExp(otherAccount.replace(/[.@]/g, "\\$&")),
          `${name} must not reference the ${otherName} identity`
        );
      }
    });
  }

  it("state-helper templates thread the federated token into every helper call", () => {
    for (const name of ["indexes", "rollback", "rules"]) {
      const source = templates[name].source;
      assert.match(
        source,
        /GOOGLE_OAUTH_ACCESS_TOKEN: \$\{\{ steps\.configure_credentials\.outputs\.access_token \}\}/
      );
      assert.match(source, /deployment-evidence-manifest\.mjs create/);
      assert.match(source, /deployment-evidence-manifest\.mjs verify/);
      assert.match(source, /assertFirebaseDeploymentTarget\(\{/);
    }
  });

  it("rollback keeps artifact read access alongside the federation grant", () => {
    const source = templates.rollback.source;
    assert.match(
      source,
      /\n    permissions:\n      actions: read\n      contents: read\n      id-token: write\n/
    );
    assert.match(source, /TENACITY DEPLOYMENTS FROZEN/);
    assert.match(
      source,
      /ROLLBACK FIREBASE RULES \$\{FIREBASE_PROJECT_ID\} FROM \$\{CURRENT_DIGEST\} TO \$\{PRIOR_DIGEST\}/
    );
  });

  it("hosting build reproduces the no-op client config (three VITE vars empty)", () => {
    const source = templates.hosting.source;
    // The live production portal ships these three empty; the no-op cutover
    // must not require them non-empty.
    assert.match(source, /\[\[ -n "\$VITE_FIREBASE_API_KEY" \]\]/);
    assert.match(source, /\[\[ -n "\$VITE_FIREBASE_AUTH_DOMAIN" \]\]/);
    assert.match(
      source,
      /\[\[ "\$VITE_FIREBASE_PROJECT_ID" == "\$FIREBASE_PROJECT_ID" \]\]/
    );
    assert.doesNotMatch(source, /\[\[ -n "\$VITE_FIREBASE_STORAGE_BUCKET" \]\]/);
    assert.doesNotMatch(
      source,
      /\[\[ -n "\$VITE_FIREBASE_MESSAGING_SENDER_ID" \]\]/
    );
    assert.doesNotMatch(source, /\[\[ -n "\$VITE_FIREBASE_APP_ID" \]\]/);
  });

  it("surface confirmations remain exact and production-bound", () => {
    assert.match(
      templates.functions.source,
      /DEPLOY FUNCTIONS tenacity-tutoring-b8eb2/
    );
    assert.match(
      templates.hosting.source,
      /DEPLOY HOSTING tenacity-tutoring-b8eb2/
    );
    assert.match(
      templates.indexes.source,
      /DEPLOY INDEXES tenacity-tutoring-b8eb2/
    );
    assert.match(templates.rules.source, /DEPLOY RULES tenacity-tutoring-b8eb2/);
  });
});
