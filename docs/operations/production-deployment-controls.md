# Production deployment controls

Status: validation CI is implemented on the Phase 3 branch; production
deployment remains inactive.

This runbook defines the boundary between the monorepo validation source and
the later production cutover. It does not authorize a deployment.

## Current boundary

The only discoverable root workflow is
`.github/workflows/validate.yml`. It has no production environment, deployment
credential, provider token, write permission, or deploy command.

The five deployment designs are stored under
`docs/operations/workflow-templates/`. GitHub does not discover workflows from
that directory, so they cannot be dispatched. Moving any template into
`.github/workflows/` is a separate production-control change and must not be
combined with ordinary application work.

Production ownership remains unchanged:

| Surface | Production source until cutover |
| --- | --- |
| Mobile and stores | `tsowmi03/Tenacity` |
| Functions, rules, indexes, and admin Hosting | `tsowmi03/tenacity-web-portal` |
| Public website and Vercel | `tsowmi03/tenacity-tutoring` |

The private personal repository cannot currently enforce the planned
production approval. GitHub documents required reviewers for private
repository environments as an Enterprise feature. Branch protection for this
private repository is also not available on the current plan. See the
[GitHub environments documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
and [branch-protection runbook](github-branch-protection.md).

## Activation gates

Every item must be closed in a separately reviewed activation pull request:

- [ ] Use a GitHub plan or organization that can enforce required reviewers on
  the private `tenacity-production` environment.
- [ ] Enable main-branch protection and require
  `Validate platform / Required validation gate`.
- [ ] Grant a second eligible repository maintainer access.
- [ ] Name a primary and backup production approver; prevent self-approval and
  administrator bypass.
- [ ] Add the scoped environment secrets and variables listed below.
- [ ] Implement and test Rules API read-back plus prior-ruleset republishing.
- [ ] Implement live Firestore-index canonicalization, require an empty no-op
  diff, and prohibit index deletion.
- [ ] Create a staging Firebase project, or record an approved decision for
  emulator-only validation plus production feature flags.
- [ ] Rebind only Vercel project `tenacity-tutoring-tqi9` to this repository
  with Root Directory `apps/website`; do not touch the duplicate
  `tenacity-tutoring` project.
- [ ] Capture fresh provider baselines, backups, rollback identifiers, and the
  deploy-freeze window immediately before cutover.
- [ ] Keep old-repository deploy paths available until every no-op deployment
  and smoke check passes.

The arming variable must remain `false` until the approved cutover window.
Missing secrets or a manual trigger are guardrails, not substitutes for an
enforced reviewer gate.

## Environment configuration

Create one environment named `tenacity-production`.

Required secrets:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VERCEL_TOKEN`

Required variables:

- `TENACITY_PRODUCTION_DEPLOYS_ENABLED=false`
- `FIREBASE_PROJECT_ID=tenacity-tutoring-b8eb2`
- `FIREBASE_HOSTING_SITE=tenacity-tutoring-b8eb2`
- `FIREBASE_HOSTING_TARGET=admin-portal`
- `VERCEL_ORG_ID=team_1di6uZZn3ENj9oo4Porw8yF6`
- `VERCEL_PROJECT_ID=prj_MVZzGI3naoD9yo9IrMbWQeChOWhk`

The Firebase service account must be limited to the resources required by the
activated workflows. Credentials are introduced only after validation and
environment approval, written under `RUNNER_TEMP` with restrictive
permissions, and removed on completion.

## Active validation workflow

`validate.yml` always creates the stable required gate. It classifies paths
inside the repository rather than skipping the workflow itself, so unaffected
jobs may be skipped without leaving a required check pending. Workflow and
shared-control changes run every job.

The jobs cover:

- full-tree Dart format, Flutter analysis, tests, and web build;
- portal tests, the separate enrolment-payload suite, and production build;
- website lint and production build;
- Function unit, export-smoke, emulator, and resource-render checks;
- Firestore and Storage rules emulator tests;
- exact Firebase manifest, source-hash, Function-inventory, and index controls;
  and
- one final always-run required gate that rejects failed or cancelled jobs.

Emulator commands use `demo-*` project IDs. Validation jobs receive no
production credential and cannot fall through to production.

## Template controls

All templates are manual-only designs with immutable action pins, exact tool
versions, read-only repository permission, full-SHA and typed-confirmation
guards, the `tenacity-production` environment, and one shared non-cancelling
`tenacity-production` concurrency group.

### Functions

The approved baseline is 83 managed endpoints and three nondeployable helpers.
Two legacy Xero Functions and two extension-managed Functions are explicit
external exclusions.

The template:

1. validates the exact root manifest, package, emulator suite, export set, and
   render fixtures before credentials are available;
2. captures and validates all 87 live records;
3. materializes nine deterministic batches of at most ten explicit
   `functions:default:<id>` selectors;
4. dry-runs every batch after production approval;
5. applies batches without `--force` or automatic retry;
6. captures live state after every attempted batch, including a failed deploy;
7. rejects live metadata drift and compares the complete raw records for all
   four external Functions with the original pre-deploy state; and
8. uploads selector/status records and redacted per-record digests. Raw
   inventories remain only on the ephemeral runner because they may contain
   environment-variable values.

Firebase recommends deployments of ten or fewer Functions to reduce quota
failures. A timeout or failed batch can still leave a partial deployment. The
status artifact is the resume record: stop the window, inspect the live
inventory, and never retry or broaden selectors automatically. See
[Firebase Function deployment guidance](https://firebase.google.com/docs/functions/manage-functions#deploy_functions).

### Rules

The rules template runs the exact source validator and both rules emulator
suites, then performs a privileged dry run and the explicit
`firestore:rules,storage` deployment after approval.

It must remain inert until a Rules API helper captures the current Firestore
and Storage release/ruleset IDs and source, verifies the deployed source, and
can republish the prior source. Firebase CLI has no one-command Rules rollback.

### Indexes

Pull-request CI reports additions and removals against the base commit and
fails any removal, including same-count replacements. The deployment template
captures live index output and uses only `firestore:indexes`.

It must remain inert until live definitions are canonicalized and compared
with source, all live indexes are ready, and the no-op cutover produces an
empty diff. Do not deploy an index deletion: rebuilding a deleted index is not
an immediate rollback.

### Admin portal Hosting

The template builds from `apps/admin-portal` with approved environment values,
captures the current live-channel record, and deploys only the named
`admin-portal` target to a short-lived preview channel. It uses
`--no-authorized-domains` so preview creation does not alter Firebase Auth.

Only unauthenticated, non-mutating checks run against `/`, `/terms.html`, and
`/reset_password.html`. The tested preview version is then cloned to the live
channel. Preview channels are public and use the production backend. Record the
previous Hosting version before promotion; rollback is provider-side.

### Public website

`apps/website/vercel.json` disables automatic production aliasing. The template
targets only project `tenacity-tutoring-tqi9`, creates a Production deployment
with `--skip-domain`, waits for READY, and retrieves the owner-scoped raw
deployment record. Before promotion it checks the exact deployment, owner,
project, target, approved-commit metadata, automatic-domain setting, and
absence of the production alias. It smoke-tests `/` and `/register` without
submitting data, then promotes that exact deployment and verifies the production
domain resolves to its deployment ID before live smoke checks. It captures the
previous production deployment for `vercel rollback`. The owner-visible raw
deployment response stays outside the artifact directory; only explicit
non-secret fields are retained as evidence, and the raw response is deleted. See
[Vercel staged promotion](https://vercel.com/docs/deployments/promoting-a-deployment).

## Universal abort conditions

Stop immediately if:

- the workflow commit is not the approved current main SHA, including the
  post-environment-approval recheck;
- any required validation, dry run, inventory check, or smoke check fails;
- the live Function set, project, runtime, region, generation, state, trigger,
  or deployment-tool label differs from policy;
- any external Function changes;
- a deploy proposes an unreviewed deletion;
- the Hosting target/site or Vercel project differs from the constants above;
- a preview attempts to mutate production data; or
- an approver, backup, fresh baseline, or rollback identifier is unavailable.

Do not use `firebase deploy --force`. Do not convert these workflows to push
triggers. Do not disable the old deployment paths until cutover monitoring
passes.

## Rollback and evidence

The cutover record must include the approved SHA, approver, pre/post inventory,
batch status, Rules ruleset IDs and source, index diff, Hosting version/channel,
Vercel staged and previous production URLs, smoke results, monitoring window,
and exact rollback commands.

Rollback is surface-specific:

- Functions: redeploy only affected explicit names from the approved previous
  source, then re-run the complete 87-record check.
- Rules: republish the captured prior Firestore and Storage sources.
- Indexes: avoid deletion; recreation may take time and is not immediate.
- Hosting: restore the captured previous Hosting version through provider
  release history.
- Vercel: run `vercel rollback` with the captured previous production URL.
