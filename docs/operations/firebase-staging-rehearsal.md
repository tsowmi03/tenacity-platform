# Firebase staging setup and rehearsal

- Selected strategy: dedicated Firebase staging project
- Project ID: `tenacity-tutoring-staging`
- Checked: 22 July 2026
- Status: complete. Provider foundation, Stage A protection, protected
  environment, federated scoped identities, workflow activation, bootstrap,
  and all four privileged rehearsal scenarios are done, with evidence
  recorded below. D05 is closed.

This runbook is the resume point for D05 and the non-production provider
rehearsal. It authorizes no additional provider mutation and no production
change.

## Verified provider state

Firebase project `tenacity-tutoring-staging` exists under Google Cloud
organization `987882812522`. Its `(default)` Firestore database is Firestore
Native, Standard edition, in `nam5`. The database reports `freeTier: true`, has
no composite indexes, no explicit non-default field override, and no TTL
policy. Its inherited `__default__` field configuration is expected unmanaged
state and must be preserved during index bootstrap.

The owner authorized the staging billing link on 22 July 2026. Only the
staging project was linked to billing account `018F61-6FE603-9B33C7`. Budget
`Tenacity Staging Monthly` was then created with these controls:

- budget resource:
  `billingAccounts/018F61-6FE603-9B33C7/budgets/36dc1a53-84eb-4edc-8955-f59f7f35e2ef`;
- monthly amount: AUD 10;
- project filter: `projects/354428033510`;
- actual-spend thresholds: 50%, 90%, and 100%;
- forecast-spend threshold: 100%; and
- notifications: default billing-account IAM recipients.

Budget alerts notify; they do not cap charges. See the
[Firebase guidance on avoiding surprise bills](https://firebase.google.com/docs/projects/billing/avoid-surprise-bills).

The Firebase default Storage bucket is
`tenacity-tutoring-staging.firebasestorage.app`. It is a Standard bucket in
`US-CENTRAL1` with uniform bucket-level access and seven-day soft delete. Its
IAM policy has no `allUsers` or other public grant. Firebase Rules has no
release for either Firestore or Storage, so no client Rules path has been made
permissive.

The project has no Firebase client app. The Cloud Functions API remains
disabled. Firebase setup previously created the default Hosting site and its
`live` channel, but no release or content was deployed. The budget and Firebase
Storage APIs were enabled only as required for the approved setup.

No production project, billing link, bucket, database, Rules release, index,
Function, Hosting release, client app, IAM binding, or credential was changed.

## Repository preparation

The current preparation branch contains these staging-only controls:

- `.firebaserc` adds alias `staging` and maps `storage:primary` only to
  `tenacity-tutoring-staging.firebasestorage.app`; it adds no staging Hosting
  target and leaves every production mapping unchanged.
- `backend/firebase/deployment-targets.json` binds the exact staging project,
  bucket, and `(default)` database separately from production.
- `scripts/ci/validate-firebase-config.mjs` and its tests require that exact
  policy, reject drift, and reject production/staging project or bucket reuse.
- `backend/firebase/rules/staging/firestore-deny-all.rules` is the restrictive
  partial-failure fixture. Its reviewed SHA-256 is
  `cd5089e4e5116dbb994013dc5fd5e7e411ec348935b8d06d13acd00173cca15b`.
  Static tests require literal deny-all behavior and prove the root
  `firebase.json` does not reference it.
- Separate Rules, Rules rollback, and index rehearsal workflows are active
  under `.github/workflows/`. Each is manual-dispatch only and cannot deploy
  unless the protected `tenacity-staging` environment arms
  `TENACITY_STAGING_REHEARSALS_ENABLED=true`.
- The Firestore index state helper handles the actual staging Admin API field
  response, preserves inherited `__default__` state, distinguishes a fresh
  bootstrap baseline from a no-op baseline, and rejects terminal index states.

The root validation workflow remains validation-only. No credential of any
kind is stored in the repository or in GitHub secrets; staging authentication
is exclusively short-lived federated tokens minted inside the protected
environment.

## Selected execution path

Use only a protected GitHub environment for privileged staging work. Do not
create or restore a local rehearsal driver. Maintaining a second deployment
system would add credential lifecycle, locking, partial-failure, and evidence
logic that a solo engineer would then have to keep equivalent to the reviewed
workflow path.

The following controls were implemented and verified on 22 July 2026 under
the owner's activation authorization:

1. The private repository uses GitHub Pro, and Stage A protection from
   `github-branch-protection.md` is enforced on `main`: PR-only with zero
   required approvals, admins included, strict required
   `Required validation gate` check, required conversation resolution,
   required linear history, and no force push, deletion, or bypass actor.
2. Environment `tenacity-staging` exists and accepts deployments only from
   protected branches.
3. Two separate least-privilege staging identities exist with exactly these
   project-level roles on `tenacity-tutoring-staging` and no others:
   - `tenacity-staging-rules@tenacity-tutoring-staging.iam.gserviceaccount.com`:
     `roles/firebaserules.admin` (its only mutation surface: rulesets and
     releases for Firestore and Storage), read-only
     `roles/firebasestorage.viewer` for bucket resolution, the custom
     single-permission project role `tenacityStagingProjectGet`
     (`firebase.projects.get`) for CLI project resolution, and
     `roles/serviceusage.serviceUsageConsumer` for quota attribution.
   - `tenacity-staging-indexes@tenacity-tutoring-staging.iam.gserviceaccount.com`:
     `roles/datastore.indexAdmin` (its only mutation surface: composite
     indexes and field configuration), the same custom
     `tenacityStagingProjectGet` role,
     `roles/serviceusage.serviceUsageConsumer`, and the custom
     single-permission role `tenacityStagingRulesetTest`
     (`firebaserules.rulesets.test`), added after run 29885973927 because
     `firebase deploy --only firestore:indexes` pre-compiles the Rules file
     through the Rules `:test` RPC. That permission validates submitted
     source only; it cannot create rulesets or move releases.

   Do not use `roles/firebase.viewer` for these identities: it bundles
   `datastore.entities.get/list` and `storage.objects.get/list`, which are
   data reads. Neither identity may hold a role that can deploy Functions or
   Hosting, read or write Firestore documents or Storage objects, or
   administer IAM.
   If a rehearsal run fails with a named missing permission, record the run,
   add only that permission after review, and never broaden to an owner or
   editor role.
4. No service-account key exists anywhere. The Google Cloud organization
   enforces `constraints/iam.disableServiceAccountKeyCreation`, so the
   workflows authenticate with keyless workload identity federation instead:
   - pool `github`, provider `tenacity-platform` in project number
     `354428033510`, issuer `https://token.actions.githubusercontent.com`,
     with the provider condition
     `assertion.repository == 'tsowmi03/tenacity-platform'`; and
   - each identity grants `roles/iam.workloadIdentityUser` to the exact
     subject principal
     `.../subject/repo:tsowmi03/tenacity-platform:environment:tenacity-staging`
     and to the equivalent
     `.../attribute.environment/tenacity-staging` principal set (added after
     run 29885146590 was denied impersonation), so only a workflow job
     running in the protected `tenacity-staging` environment can impersonate
     it.

   In each workflow, the pinned `google-github-actions/auth` step mints a
   short-lived access token and an external-account credential file. The
   Firebase CLI uses the credential file through
   `GOOGLE_APPLICATION_CREDENTIALS`; the state helpers receive the token
   through `GOOGLE_OAUTH_ACCESS_TOKEN` and fall back to key-based
   authentication only where a key is explicitly provided.
5. The `tenacity-staging` environment defines exactly these variables:
   `FIREBASE_DEPLOYMENT_TARGET=staging`,
   `FIREBASE_PROJECT_ID=tenacity-tutoring-staging`,
   `FIREBASE_STORAGE_BUCKET=tenacity-tutoring-staging.firebasestorage.app`,
   `FIREBASE_STORAGE_TARGET=primary`,
   `FIREBASE_DATABASE_ID=(default)`, and
   `TENACITY_STAGING_REHEARSALS_ENABLED=false`.
6. The three staging workflows are active under `.github/workflows/` through
   one focused pull request. All six production templates remain inert under
   `docs/operations/workflow-templates/`.
7. The active workflows still require protected `main`, an exact current-main
   SHA, scenario-bound typed confirmation, the shared non-cancelling
   `tenacity-staging` concurrency group, and the exact scoped identity.

Set `TENACITY_STAGING_REHEARSALS_ENABLED=true` only for an authorized
bootstrap or rehearsal window, then return it to `false`. Changing IAM,
the federation pool or provider, the GitHub plan, environment policy, or any
production surface requires new explicit authority. The five inert Firebase
production templates now describe the same keyless federated model against a
separate production-scoped pool and provider, because the organization policy
blocks key creation there too; those production federation resources were
created 22 July 2026 under separate authority. See the
[production deployment runbook](production-deployment-controls.md).

## Bootstrap

The fresh project requires one separately authorized bootstrap before no-op
rehearsal.

Rules bootstrap must:

1. record that no Firestore or Storage Rules release exists;
2. dry-run and deploy only the canonical Firestore and Storage Rules without
   `--force`;
3. capture both release pointers and immutable source content after the
   attempt, including when the CLI reports failure; and
4. require both deployed sources to equal the reviewed repository files.

Index bootstrap must:

1. capture the database, composite indexes, field configurations, inherited
   `__default__` resources, and TTL policies;
2. require zero managed composite indexes, zero explicit non-default field
   overrides, and zero TTL policies before the deploy;
3. dry-run and deploy the 27 composite indexes and one field override exactly
   once, without `--force` or automatic mutation retry;
4. poll only while an index is `CREATING`, with a per-attempt timeout, and stop
   immediately on `NEEDS_REPAIR`, an unknown state, reversion, or API failure;
5. wait until every managed index is `READY`; and
6. prove exact source equality while preserving database metadata, inherited
   `__default__` resources, and TTL state from the initial capture.

Bootstrap evidence must bind the target, exact main SHA, scenario, typed
confirmation, command outcomes, and before/after state. Bootstrap is a staging
mutation, not a no-op rehearsal.

## Privileged rehearsal

After successful bootstrap, run and retain these scenarios separately:

- Rules no-op: capture and verify the exact source, run the combined dry run
  and deploy, read back both releases, and complete read-only rollback
  preflight.
- Rules partial failure: bind the exact main SHA and fixture hash, generate a
  temporary manifest that selects only the restrictive fixture, and deploy
  only `firestore:rules` once. Require the Firestore source to move to the
  fixture while the Storage release name and immutable source remain
  unchanged.
- Rules rollback: accept eligible no-op or partial-scenario evidence, verify
  the prior immutable source before mutation, require the external deployment
  freeze and digest-bound confirmation, restore the captured pointers, and
  verify the final state. Bootstrap evidence is not rollback input because no
  prior releases existed.
- Index no-op: require source equality and every index `READY` before deploy,
  deploy once, then require unchanged resource identities, inherited default
  configuration, and TTL policy afterward.

Never automatically retry a provider mutation. A failed mutation still
requires post-attempt read-back and retained evidence before deciding how to
resume.

The rehearsal closes only when the canonical handoff records the workflow run
IDs and attempts, evidence-manifest hashes, snapshot digests, mutation
outcomes, final provider state, and rollback result.

## Rehearsal evidence (22 July 2026)

All scenarios completed on 22 July 2026, dispatched by `@tsowmi03` under the
activation authorization. Every run is attempt 1 of its listed run ID, with
its evidence artifact retained for 90 days; the SHA-256 of each run's
`evidence-manifest.json` is recorded here.

Successful runs:

| Scenario | Run ID | Authorized SHA | Manifest SHA-256 |
| --- | --- | --- | --- |
| Rules bootstrap | 29885521415 | `fc27928` | `d1bd67ee7c885ede1e59b7bf743e367d07287ecf2a6306bf4bc8f87a03f94cc4` |
| Index bootstrap | 29886154601 | `9f56637` | `6745e966569ad7b60c2ff4a13de34d12669c3d201d5f6813f250d8ae74f0a737` |
| Rules no-op | 29886629686 | `9f56637` | `69e4db56cfdc3b8c7a3dc73d34ce3fd15ea857e276b843c75ff510dc59900108` |
| Rules partial failure | 29887001068 | `9f56637` | `38f687b10bc88774f8f04c2cd26ad35b73a5fcc5a3a1dca208cf01da612d5fb7` |
| Rules rollback restore | 29889050184 | `77b7a3c` | `010da2a4ac7778cbef634a9b47a400ab904caf18f3bd04644f4e5cd4a345bafc` |
| Index no-op | 29889080675 | `77b7a3c` | `14abd00816473e24a634f4c336b4e9a7d43f067e34a8cf6bb1ac604966c86c66` |

The partial scenario moved only the Firestore release to the reviewed
deny-all fixture (prior snapshot digest
`f4b2dad7235172f9c13d2c6c32863eb6f80d2d53e753bf7455562b2474545141`, mixed
snapshot digest
`3016c02b9bab9371b7b42ac59f1d61ae1681b0aa6b185257ee2e3eee1b14b427`). The
restore returned the Firestore release to the exact prior ruleset
`25f3b73c-1dfe-4c38-a353-260f1fea7de2` and left Storage ruleset
`26db07a7-82d9-4a1d-a3e7-a9a9bbebc8ef` untouched throughout; the verified
post-restore snapshot digest is
`fa7a9a619e2675a5fe3bb0aeb57c7f59a426d2821804b54abf8ff69e34545412`. Final
provider state: canonical Rules on both surfaces and all 27 managed indexes
plus the one field override `READY` with source equality proven.

Failed attempts, each stopped before or during a single bounded mutation and
each with retained evidence:

- Run 29885146590 (Rules bootstrap): federated impersonation denied; fixed by
  the environment principal-set binding. No provider mutation.
- Run 29885702153 (index bootstrap): the live Admin API rejects an explicit
  `pageSize` on the indexes listing; fixed in
  [PR 11](https://github.com/tsowmi03/tenacity-platform/pull/11). Failed at
  read-only capture; no provider mutation.
- Run 29885973927 (index bootstrap): missing `firebaserules.rulesets.test`
  for the CLI's Rules pre-compilation during an indexes-only deploy; fixed by
  the `tenacityStagingRulesetTest` custom role. Failed at dry run; no
  provider mutation.
- Run 29888583865 (Rules restore): the workflow's expected-keys literal for
  the retained partial verification report was not in sorted order, so the
  gate could never pass; fixed in
  [PR 12](https://github.com/tsowmi03/tenacity-platform/pull/12). Failed
  closed during read-only verification; no provider mutation.

`TENACITY_STAGING_REHEARSALS_ENABLED` was returned to `false` when the
window closed.

## Rollback and stop conditions

Keep `TENACITY_STAGING_REHEARSALS_ENABLED=false` outside an authorized window.
If a scenario differs from its expected state, freeze every staging deployment
path, retain the evidence, and use only the reviewed rollback workflow when its
preconditions are satisfied.

Reverting the focused repository preparation removes local staging bindings
and inert designs but does not undo provider resources. Deleting the staging
project, unlinking billing, deleting the budget or bucket, changing IAM, or
changing any production resource requires separate explicit authority.
