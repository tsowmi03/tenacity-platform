# Production deployment controls

Status: validation CI and repository-side Rules and index safeguards are merged
on `main` at `8b25b8e`; production deployment remains inactive. The safeguards
still require privileged rehearsal.

This runbook defines the boundary between the monorepo validation source and
the later production cutover. It does not authorize a deployment.

## Current boundary

The only discoverable root workflow is
`.github/workflows/validate.yml`. It has no production environment, deployment
credential, provider token, write permission, or deploy command.

The six deployment and rollback designs are stored under
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

This is currently a solo-operated project. Independent production review is
deferred until a second maintainer exists. Before any production credential is
added or any production workflow becomes discoverable, the private personal
repository must use GitHub Pro and Stage A protection must be enforced on
`main`. The written solo authorization record supplements those controls; it
does not replace branch protection. See the
[GitHub environments documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
and the [solo authorization runbook](solo-production-authorization.md).

## Staging and rehearsal gates

Provider setup, repository preparation, and emulator gates can close before
GitHub Pro because they are isolated from production. Privileged rehearsal
must use the protected staging-environment path in the staging runbook. The
project does not maintain a separate local deployment driver.

- [x] Implement and unit-test Rules API read-back plus guarded prior-ruleset
  republishing.
- [x] Implement and unit-test live Firestore-index canonicalization, an empty
  no-op diff, READY-state checks, and deletion prevention.
- [x] Merge the safeguard branch after the active validation workflow passes;
  [PR 5](https://github.com/tsowmi03/tenacity-platform/pull/5) merged as
  `8b25b8e953c473a5cc6a3df130c1ace76044438f` after all ten checks passed.
- [ ] Privileged-rehearse Rules capture, exact-content verification, rollback
  preflight, applied rollback, and partial-failure evidence outside production.
- [ ] Privileged-rehearse Firestore-index capture, source equality, READY-state
  enforcement, unchanged resource identities, and TTL-policy preservation.
- [x] Select a dedicated staging Firebase project and create
  `tenacity-tutoring-staging` with a `(default)` Firestore database in `nam5`.
- [x] Link only staging to the authorized billing account, configure the
  AUD 10 monthly budget alerts, create and verify the default Firebase Storage
  bucket, and finish the exact staging target policy.
- [ ] Upgrade to GitHub Pro, enforce Stage A, create the protected
  `tenacity-staging` environment, add the two scoped staging credentials with
  arming false, and activate only the inert staging templates.
- [ ] Bootstrap and privileged-rehearse staging under separate explicit
  mutation authority. Follow the
  [staging runbook](firebase-staging-rehearsal.md).

## Production-control preparation gates

Close these before opening the draft activation pull request:

- [ ] Upgrade the private repository to GitHub Pro and verify Stage A
  protection on `main`, including the strict
  `Validate platform / Required validation gate` and no administrator bypass.
- [ ] Create `tenacity-production`, restrict it to protected `main`, add the
  scoped secrets and variables below, and keep the arming value `false`.
- [ ] Create a stable private issue, assign its record ID, and initialize the
  readiness record in `preparing` state as defined in the
  [authorization runbook](solo-production-authorization.md).
- [ ] Rebind only Vercel project `tenacity-tutoring-tqi9` to this repository
  with Root Directory `apps/website`; do not touch the duplicate
  `tenacity-tutoring` project.

## Activation pull-request gates

- [ ] Open a focused draft pull request that adds an authorization-record ID or
  digest input and copies the six reviewed production templates into
  `.github/workflows/`.
- [ ] Run every required validation check on the final reviewed head, add the
  pull request, head SHA, validation run, owner self-review, and risk acceptance
  to the readiness record, then transition it to `ready`.
- [ ] Merge with `TENACITY_PRODUCTION_DEPLOYS_ENABLED=false`; a merged inert
  workflow does not authorize a provider mutation.

## Cutover entry and exit gates

After the activation pull request merges:

- [ ] Create the linked cutover execution record with the exact current `main`
  SHA and successful validation run.
- [ ] Capture fresh provider baselines, backups, rollback identifiers, and the
  deploy-freeze window immediately before cutover.
- [ ] Arm only for the recorded window, run the no-op deployments and smoke
  checks, then reset the arming value to `false` after completion, failure,
  cancellation, or timeout.
- [ ] Keep old-repository deploy paths available until every no-op deployment
  and smoke check passes, and until two stable monorepo production deployments
  satisfy the source-repository archive gate.

Missing secrets or a manual trigger are guardrails, not substitutes for Stage A,
the environment boundary, and the two linked solo records.

## Environment configuration

After GitHub Pro and Stage A are active, create one environment named
`tenacity-production`. Restrict deployments to protected `main`. The
environment scopes variables and secrets; it is not an independent reviewer
gate on the selected private personal account model.

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
- `FIREBASE_DEPLOYMENT_TARGET=production`
- `FIREBASE_PROJECT_ID=tenacity-tutoring-b8eb2`
- `FIREBASE_STORAGE_BUCKET=tenacity-tutoring-b8eb2.firebasestorage.app`
- `FIREBASE_STORAGE_TARGET=primary`
- `FIREBASE_DATABASE_ID=(default)`
- `FIREBASE_HOSTING_SITE=tenacity-tutoring-b8eb2`
- `FIREBASE_HOSTING_TARGET=admin-portal`
- `VERCEL_ORG_ID=team_1di6uZZn3ENj9oo4Porw8yF6`
- `VERCEL_PROJECT_ID=prj_MVZzGI3naoD9yo9IrMbWQeChOWhk`

The Firebase service account must be limited to the resources required by the
activated workflows. Credentials are introduced only after Stage A and
environment-policy verification, written under `RUNNER_TEMP` with restrictive
permissions, and removed on completion.

The Rules and index workflows bind production to the static project, Storage
bucket, and database above. The Rules workflow also selects only
`storage:primary`; `firebase.json` and `.firebaserc` bind that deploy target to
the same exact bucket. Their arming step checks the constants against
`backend/firebase/deployment-targets.json` and the protected environment
variables. Rules evidence must never derive the bucket from the
`VITE_FIREBASE_STORAGE_BUCKET` client secret.

`deployment-targets.json` contains separate exact `production` and `staging`
bindings. Staging uses project `tenacity-tutoring-staging`, bucket
`tenacity-tutoring-staging.firebasestorage.app`, and database `(default)`.
`.firebaserc` maps only that project's `storage:primary` target and adds no
staging Hosting target. Validation rejects identifier drift and any project or
bucket reuse between environments. See the
[staging runbook](firebase-staging-rehearsal.md).

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
4. dry-runs every batch after the production arming gate;
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
`firestore:rules,storage` deployment after the production arming gate.

The Rules API helper now:

1. captures the exact Firestore and Storage release pointers and follows them
   to the full immutable ruleset sources;
2. binds every source byte and pointer into a canonical SHA-256 snapshot;
3. requires byte-for-byte equality with the extracted source before the dry
   run;
4. attempts a state capture after the deployment step returns and requires the
   configured source names and exact content on success;
5. performs a read-only rollback preflight that checks the observed release
   bindings and immutable sources; and
6. uploads snapshots, verification reports, deploy logs and status, a required
   evidence manifest, and the rollback preflight for 90 days.

The current live rules use source names `firestore.rules` and `storage.rules`.
The extracted root manifest uses `backend/firebase/rules/firestore.rules` and
`backend/firebase/rules/storage.rules`. Pre-deployment verification permits
that known name transition while requiring exact content. The first monorepo
deployment is expected to create new immutable ruleset IDs, so both prior
release pointers are required even though behavior is unchanged.

The deployment workflow never applies rollback. The supported production
procedure is the separate `firebase-rules-rollback-production.yml` workflow,
not a workstation command. It shares the `tenacity-production` environment and
concurrency group, requires the exact authorized current-main SHA, downloads the
unique artifact from one completed deployment run and attempt, verifies the run
and manifest provenance, checks every recorded file hash, and requires the
digest-bound confirmation before applying rollback. A completed failed run is
eligible because a partial Rules deployment is a primary rollback case.
Rollback eligibility requires the captured before and after snapshots,
pre-deployment verification, capture outcomes, and rollback preflight. A hard
timeout can mutate a release before the shell writes its deploy log or status,
so those records are checked and hashed when present but are not required for
recovery.

The rollback-code SHA and source deployment SHA are independent. Rollback code
must be the authorized current `main`; the source SHA comes from the GitHub run
record and must match the downloaded manifest. Applied rollback does not
compare the artifact's current Rules source with the rollback checkout's local
Rules files. Main may have advanced, and a partial deployment may contain one
old and one new surface. Safety instead comes from the validated snapshot
schema and digests, exact run-artifact provenance and hashes, immutable ruleset
API read-back, live release-pointer checks, target binding, typed confirmation,
and the external deployment freeze.

Before dispatch, freeze every Firebase deployment route in the monorepo, the
three original repositories, and the Firebase console. Name the person holding
that manual freeze in the cutover record. The rollback workflow's concurrency
group serializes only workflows in this repository; it cannot lock the old
repositories or provider console.

The Rules Releases PATCH endpoint has no atomic conditional-update precondition.
The helper checks both observed bindings and both immutable rulesets before any
PATCH and checks the relevant binding again before each service, but another
actor can still change a release after a check. Firestore and Storage are
updated serially, so a failure can leave partial rollback. The workflow records
command output, helper status, and final read-back; stop and inspect both live
releases after any error. Firebase CLI has no one-command Rules rollback.

The template remains inert until the governance and privileged-rehearsal gates
are closed.

### Indexes

Pull-request CI reports additions and removals against the base commit and
fails any removal, including same-count replacements. The deployment template
uses only `firestore:indexes`.

The Firestore Admin API helper captures raw composite-index and field resources
with project, database, names, and states intact. It expands source with the
implicit `__name__` suffix, normalizes documented Standard-edition defaults,
separates TTL-only fields, and compares individual field-override modes.

Before the dry run it requires exact source equality and every managed index to
be `READY`. After every attempted deployment it checks source equality again
and compares the observed composite resource names, field resource names,
READY states, and external TTL policies with the prior snapshot. A failed
Firebase CLI step is retained long enough to attempt this read-back, then still
fails the job. The raw and canonical snapshots, deploy logs and status, and
required evidence manifest remain in the 90-day artifact.

These before-and-after observations can detect drift visible in either
snapshot. They do not establish that no intermediate provider action occurred,
so the same cross-repository and console deployment freeze applies.

The template remains inert until the privileged rehearsal exercises those checks
against the authorized target. Do not deploy an index deletion: rebuilding a
deleted index is not an immediate rollback.

### Admin portal Hosting

The template builds from `apps/admin-portal` with authorized environment values,
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
project, target, authorized-commit metadata, automatic-domain setting, and
absence of the production alias. It smoke-tests `/` and `/register` without
submitting data, then promotes that exact deployment and verifies the production
domain resolves to its deployment ID before live smoke checks. It captures the
previous production deployment for `vercel rollback`. The owner-visible raw
deployment response stays outside the artifact directory; only explicit
non-secret fields are retained as evidence, and the raw response is deleted. See
[Vercel staged promotion](https://vercel.com/docs/deployments/promoting-a-deployment).

## Universal abort conditions

Stop immediately if:

- the workflow commit is not the authorized current `main` SHA, including the
  post-environment-gate recheck;
- any required validation, dry run, inventory check, or smoke check fails;
- Rules source content differs, a current release pointer moves after capture,
  or an immutable ruleset cannot be read back;
- any Firestore index is not `READY`, the source-to-live diff is non-empty, or
  an index resource or external TTL policy changes during the no-op attempt;
- the live Function set, project, runtime, region, generation, state, trigger,
  or deployment-tool label differs from policy;
- any external Function changes;
- a deploy proposes an unreviewed deletion;
- the Hosting target/site or Vercel project differs from the constants above;
- a preview attempts to mutate production data; or
- the readiness record, cutover execution record, fresh baseline, rollback
  identifier, or confirmed cross-repository deployment freeze is unavailable.

Do not use `firebase deploy --force`. Do not convert these workflows to push
triggers. Do not disable the old deployment paths until cutover monitoring
passes.

## Rollback and evidence

The cutover record must include the authorized SHA, solo readiness record,
workflow run ID and attempt, pre/post inventory, batch status, Rules ruleset IDs
and source, index diff, Hosting version/channel, Vercel staged and previous
production URLs, smoke results, monitoring window, deployment-freeze owner, and
exact rollback procedure.

Rules and index artifacts require an evidence manifest. It records the Git
SHA, workflow run ID and attempt, deployment and read-back step outcomes, and
the presence, size, and SHA-256 hash of each expected file. The workflow still
fails if evidence is incomplete, and the always-run upload uses
`if-no-files-found: error` so a missing evidence directory is not accepted.

Rollback is surface-specific:

- Functions: redeploy only affected explicit names from the authorized previous
  source, then re-run the complete 87-record check.
- Rules: dispatch the separately authorized rollback workflow against the exact
  completed deployment artifact while the manual deployment freeze is held;
  retain its status, logs, manifest, and final pointer read-back.
- Indexes: avoid deletion; recreation may take time and is not immediate.
- Hosting: restore the captured previous Hosting version through provider
  release history.
- Vercel: run `vercel rollback` with the captured previous production URL.
