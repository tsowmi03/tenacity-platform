# Phase 3 activation safeguards

- Date: 21 July 2026
- Implementation branch: `migration/phase-3-activation-gates`
- Base: `660edb58a2ff5d3959c5069def3d0e0ec5a0ed71`
- Merge: [pull request 5](https://github.com/tsowmi03/tenacity-platform/pull/5),
  reviewed head `75771fcb0147259cd2d6351875d0fdb109119992`, merge commit
  `8b25b8e953c473a5cc6a3df130c1ace76044438f`
- Status: repository safeguards merged; production activation remains blocked

## Outcome

This follow-up closes the two repository implementation gaps for Firebase
Rules and Firestore indexes. It does not activate a workflow, add a credential,
call a live provider, change a provider binding, or authorize Phase 4.

The production workflow designs remain inert under
`docs/operations/workflow-templates/`. Their new steps cannot run in GitHub
until a separate reviewed change moves them into `.github/workflows/`.

## Shared authenticated API boundary

`scripts/firebase/google-api.mjs` provides dependency-free service-account
OAuth for the two read-back helpers. It:

- signs a one-hour assertion for an explicit Google OAuth scope;
- accepts only the approved Google token endpoints;
- sends bearer tokens only to `firebaserules.googleapis.com` and
  `firestore.googleapis.com`;
- rejects credentials, scopes, methods, and origins that do not match policy;
  and
- reports bounded API errors without including the bearer token.

No credential is stored in the repository. The inert templates continue to
materialize the future environment secret under `RUNNER_TEMP` and remove it in
an always-run cleanup step.

At the PR 5 checkpoint, `backend/firebase/deployment-targets.json` bound
`production` to project `tenacity-tutoring-b8eb2`, Storage bucket
`tenacity-tutoring-b8eb2.firebasestorage.app`, and database `(default)`. Every
helper invocation names `--target production` and the applicable explicit
identifiers. The workflow arming steps compare that reviewed policy with their
static constants and protected environment variables. The tracked
`storage:primary` deploy target binds the Firebase CLI write to that same exact
bucket. Rules capture does not read a `VITE_*` client secret.

There was no staging target at that merge checkpoint. The 22 July preparation
described below adds the now-verified, distinct project and Storage-bucket pair
plus database ID to the reviewed policy file and a matching per-project
`storage:primary` mapping in `.firebaserc`.

## Firebase Rules safeguards

`scripts/firebase/firebase-rules-state.mjs` adds three commands:

- `capture` reads the exact Firestore and Storage release pointers, follows
  each pointer to its immutable ruleset, records every source byte, and binds
  the evidence with a canonical SHA-256 digest;
- `verify` checks the snapshot project, Storage bucket, release names,
  ruleset names, service metadata, digest, and local source content; and
- `rollback` performs a read-only preflight by default, then requires
  `--apply`, `--exclusive-deployment-lock`, a digest-bound typed confirmation,
  and a private status output before it can repoint either existing release.

Applied rollback verifies both captured rulesets and both current release
bindings before any write. It repeats the current-binding comparison before
each PATCH, never creates a ruleset, reads both release pointers back, and
records partial progress if the two-service operation stops between writes.
The exclusive-lock flag asserts that an operator already holds a manual freeze;
it does not create a provider lock.

The Rules Releases PATCH call has no atomic conditional-update precondition.
An actor can move a release after a helper check, and Firestore and Storage are
updated serially. Production rollback therefore requires a freeze across this
repository, all original deployment repositories, and the Firebase console.

The Phase 0 live rules were uploaded as `firestore.rules` and `storage.rules`.
The extracted root manifest uploads the same content under
`backend/firebase/rules/firestore.rules` and
`backend/firebase/rules/storage.rules`. The pre-deployment gate therefore
requires exact content while explicitly allowing the old source names. The
post-deployment gate requires both the configured names and exact content.
New ruleset IDs are expected on the first monorepo deployment even though rule
behavior is unchanged, which makes the captured rollback pointers mandatory.

The Rules deployment template now captures and verifies prior state before its
dry run, attempts a state capture after the deployment step returns, verifies
the observed deployed source, runs the rollback preflight, and retains the
evidence for 90 days. It does not invoke applied rollback.

A separate inert rollback template uses the same protected environment and
concurrency group. It verifies a completed deployment run and its exact
run-attempt artifact, accepts successful or failed deploy outcomes so partial
deployments remain recoverable, checks snapshot digests and the manual-freeze
confirmation, then captures and verifies rollback state. The rollback-code SHA
must be the approved current `main`; the source deployment SHA is read from the
GitHub run and independently matched to its evidence manifest.

Rollback eligibility requires captured before and after snapshots,
pre-deployment verification, capture outcomes, and rollback preflight. A hard
timeout may prevent deploy-log or status creation after a provider mutation;
those records remain hashed when present but are not required for recovery.

Applied rollback does not require the source deployment's current snapshot to
match the rollback checkout's local Rules files. Main may have advanced, and a
partial deployment may leave the two surfaces on different source versions.
The safety chain is the validated snapshot schema and digests, exact run and
artifact provenance, evidence file hashes, immutable ruleset API read-back,
live pointer checks, target policy, digest confirmation, and external freeze.

## Firestore index safeguards

`scripts/firebase/firestore-index-state.mjs` reads the raw Firestore Admin API
instead of relying on the Firebase CLI's source-shaped index output. It:

- pages both composite-index and field-configuration resources;
- requires the exact project and database, Firestore Native mode, and Standard
  edition;
- requires every composite and single-field index to be `READY` and rejects a
  reverting field configuration;
- expands source definitions with Firestore's implicit `__name__` suffix while
  preserving an explicitly different suffix direction;
- normalizes only documented Standard-edition defaults;
- keeps explicit `__default__` field resources outside the source-shaped
  manifest while preserving them in baseline equality, and separates TTL-only
  policy records from index equality;
- compares field-override modes individually, including valid empty overrides;
  and
- retains raw API records, canonical definitions, resource identities, READY
  states, and external TTL policies in one evidence snapshot.

The pre-deployment check requires an empty source-to-live diff. The
post-deployment check requires another empty source-to-live diff and equality
with the observed resource identities and external TTL policies captured
before deployment. It rejects additions, removals, same-count replacements,
field-mode removal, and observed delete/recreate changes. These two snapshots
cannot establish the absence of an intermediate provider action, so the manual
deployment freeze remains required.

The index template now uses those controls before and after its dry run and
deployment attempt. A failed Firebase CLI command is retained long enough to
attempt post-deployment capture, then still fails the job. Evidence is retained
for 90 days.

Both deployment templates always create a required evidence manifest. It binds
the Git SHA, workflow run ID and attempt, deploy and read-back outcomes, and the
presence, size, and SHA-256 hash of every expected evidence file. Deploy logs
and exit status are retained, the artifact name includes the run and attempt,
and a missing evidence directory fails upload.

## Verification evidence

The repository-side control suite passed locally and all ten GitHub checks
passed on the reviewed pull-request head. The new coverage includes:

- service-account assertion and approved-origin enforcement;
- release/ruleset response validation, source-name transition, exact content,
  snapshot tamper detection, and cross-project rejection;
- read-only rollback preflight, digest-bound confirmation, current-binding
  drift, immutable-source drift, successful republishing, unchanged bindings,
  and partial republishing;
- raw Firestore pagination, project/database enforcement, Standard default
  normalization, implicit and explicit `__name__` handling, READY-state
  enforcement, TTL separation, source equality, field-mode removal,
  same-count replacement, and resource-identity changes; and
- shared-path classification for every `scripts/firebase/` change; and
- deployment-evidence provenance, outcome, missing-file, hash-tamper,
  overwrite, duplicate-path, and CLI-argument checks.

The actual production APIs were not called. A privileged rehearsal remains an
activation gate and must use scoped staging credentials, the exact reviewed
staging target, and the evidence requirements in the production runbook.

## Current policy update, 22 July 2026

This file records the state when PR 5 merged. The later solo-operation decision
defers independent review, a backup approver, and Stage B until a second
maintainer exists. It does not waive GitHub Pro and Stage A before production
credentials, discoverable production workflows, or Phase 4. Production uses
the two linked records in the
[solo authorization runbook](../operations/solo-production-authorization.md).

D05 now selects a dedicated staging project. Firebase project
`tenacity-tutoring-staging`, its `(default)` Firestore database in `nam5`, the
authorized billing link and AUD 10 monthly budget alerts, and default bucket
`tenacity-tutoring-staging.firebasestorage.app` in `US-CENTRAL1` exist. The
current preparation branch adds the exact staging target, restrictive
partial-failure fixture, and three inert staging workflow designs. Protected
credentials, activation, bootstrap, and privileged rehearsal remain blocked.
Resume from the
[staging runbook](../operations/firebase-staging-rehearsal.md).

## Remaining Phase 3 gates

| Requirement | State after this change |
| --- | --- |
| Rules capture, verification, and prior-ruleset republishing code | Implemented and unit-tested; privileged rehearsal pending |
| Live index canonicalization, empty-diff, READY, and no-deletion code | Implemented and unit-tested; privileged rehearsal pending |
| Production authorization | Solo readiness and post-merge exact-SHA cutover records selected; not yet created |
| Protected `main` and required validation check | GitHub Pro and Stage A pending; mandatory before staging workflow activation, privileged rehearsal, or production activation |
| Second maintainer and independent approvers | Deferred while solo-maintained |
| Firebase staging | Project, billing budget, Firestore, Storage, repository binding, fixture, and inert designs prepared; protected credentials, activation, bootstrap, and rehearsal pending |
| Reviewed exact production and staging target policy | Implemented on the current preparation branch; production binding unchanged |
| Scoped environment credentials and armed-variable procedure | Not configured |
| Vercel project rebind and preview rehearsal | Not performed |
| Phase 4 no-op production cutover | Not authorized |

## Rollback

Revert merge commit `8b25b8e953c473a5cc6a3df130c1ace76044438f` to remove
the helpers, tests, and inert template changes. Because this work performs no
provider mutation and activates no workflow, production continues from the
original repositories throughout a repository rollback.
