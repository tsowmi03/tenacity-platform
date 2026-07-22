# Migration status and handoff

- Verified: 22 July 2026
- Authoritative repository: `https://github.com/tsowmi03/tenacity-platform`
- Phase 3 safeguard merge checkpoint:
  `8b25b8e953c473a5cc6a3df130c1ace76044438f`
- Phase 3 safeguard reviewed head:
  `75771fcb0147259cd2d6351875d0fdb109119992`
- Activation-preparation merge checkpoint:
  `ee01f59e3df416dd5d268367bb1da699c253cd14`
  ([PR 8](https://github.com/tsowmi03/tenacity-platform/pull/8))
- Activation-preparation reviewed head:
  `dce6ef890652974e5b9d2faba5c11afe0a03f488`
- Current stage: Stage A protection enforced; staging environment, federated
  identities, and staging workflows active; staging bootstrap and rehearsal
  pending; production activation blocked
- Production cutover: not started

## Read this first

This is the resume point for a new migration session. Repository work through
the Phase 3 validation, deployment-control design, and focused Rules and index
safeguards is merged on `main`. The staging Firebase project foundation is
complete: Firestore, billing, a scoped budget, and the default Storage bucket
all exist and are verified, and the repository staging bindings are merged on
`main`. Production deployment ownership and production provider bindings have
not moved, and the inert production templates must not be activated yet.

Use this file for current status, the individual phase records for evidence,
the [staging runbook](../operations/firebase-staging-rehearsal.md), and the
[production deployment runbook](../operations/production-deployment-controls.md).
The detailed original plan remains at
`/Users/thomassowmi/Development/Tenacity/TENACITY_PLATFORM_MONOREPO_MIGRATION_PLAN.md`
on the mobile `redesign-v3` line. Its D05 and D06 rows predate the dated
staging and solo-operation decisions below. Every related approver,
second-maintainer, staging-timing, Phase 3 exit, Phase 4 entry, tracker, and
checklist provision is superseded where it conflicts with this handoff and its
linked runbooks.

## Completed repository work

| Stage | Result | Evidence |
| --- | --- | --- |
| Phase 0 technical baseline | Complete | Source checkpoints and rollback tags created; Firebase, Hosting, Vercel, rules, and index baselines captured |
| History import | Complete | All 672 mapped commits are reachable from published refs |
| Phase 1 repository hardening | Merged | [PR 1](https://github.com/tsowmi03/tenacity-platform/pull/1), commit `399a76a120b4def59f67d34e7879c7539a13b31a` |
| Phase 2 Firebase extraction | Merged, not deployed | [PR 2](https://github.com/tsowmi03/tenacity-platform/pull/2), commit `870e656dcff6cc637fd7303909f95375fc6e970e` |
| Phase 3 validation controls | Merged and active | [PR 3](https://github.com/tsowmi03/tenacity-platform/pull/3), commit `592ed0936c80f36c1ed0021da6f8026236a69e8e`; ten GitHub checks passed |
| Phase 3 Rules and index safeguards | Merged, not activated | [PR 5](https://github.com/tsowmi03/tenacity-platform/pull/5), merge commit `8b25b8e953c473a5cc6a3df130c1ace76044438f`; all ten GitHub checks passed |
| Phase 3 activation preparation | Merged, not activated | [PR 8](https://github.com/tsowmi03/tenacity-platform/pull/8), merge commit `ee01f59e3df416dd5d268367bb1da699c253cd14`; all ten GitHub checks passed |
| D05 staging strategy | Execution surface active | Project, Firestore, billing, budget, and Storage bucket verified; Stage A enforced; protected environment, federated identities, and active staging workflows in place; bootstrap and rehearsal remain open |
| Phase 3 production activation | Blocked | Production templates are inert; authorization records, federated production credentials, staging rehearsal evidence, and provider gates remain open |
| Phase 4 no-op production cutover | Not started | Requires every applicable Phase 3 activation gate |
| Phase 5 and later contract work | Not started | Begins only after a stable no-op cutover |

## Current production boundary

| Surface | Production deployment source until cutover |
| --- | --- |
| Mobile and store releases | `tsowmi03/Tenacity` |
| Functions, rules, indexes, and admin Hosting | `tsowmi03/tenacity-web-portal` |
| Public website and Vercel | `tsowmi03/tenacity-tutoring` |

The root `.github/workflows/validate.yml` is active and validation-only. The
six production deployment and rollback designs remain under
`docs/operations/workflow-templates/`, so
GitHub cannot discover or run them. Stage A protection is now verified, but no
production credential exists yet. The Google Cloud organization blocks
service-account key creation, so before production activation the six
production templates must move from key-based secrets to the same federated
authentication model the staging workflows use, with a separate
production-scoped provider binding. Production credentials then belong only in
the protected-main production environment with the arming value false,
recorded in the solo readiness record.

## Verified staging state

- Firebase project `tenacity-tutoring-staging` exists under the same Google
  Cloud organization as production.
- Firestore `(default)` exists in Native mode, Standard edition, free tier, in
  `nam5`, with no composite index, explicit field override, or TTL policy.
- The owner-approved billing link is live: staging alone was linked to billing
  account `018F61-6FE603-9B33C7`, and the scoped monthly budget
  `Tenacity Staging Monthly` exists with AUD 10, actual-spend alerts at 50%,
  90%, and 100%, and a 100% forecast alert. Budget alerts notify; they do not
  cap charges.
- The Firebase default Storage bucket
  `tenacity-tutoring-staging.firebasestorage.app` exists in `US-CENTRAL1` with
  uniform bucket-level access, seven-day soft delete, and no public IAM grant.
- No Firestore or Storage Rules release exists, so no client Rules path has
  been made permissive.
- Firebase setup automatically created the default staging Hosting site and its
  `live` channel; the site returns HTTP 404 and has no deployed content,
  version, or release.
- Firebase created its default Admin SDK service account, with no user-managed
  key. Do not use that broad identity for rehearsal; no scoped staging
  rehearsal credential exists.
- No staging client app, Function, active deployment workflow, Rules
  deployment, or index deployment exists.
- Production Firestore and Storage geography was checked read-only; no
  production resource or API state was mutated.

The repository staging bindings are merged on `main`:
`.firebaserc` adds the `staging` alias and its `storage:primary` mapping, and
`backend/firebase/deployment-targets.json` binds the exact staging project,
bucket, and `(default)` database separately from production.

The staging execution surface is also live: Stage A protects `main`; the
`tenacity-staging` environment accepts only protected branches and holds the
six reviewed variables with arming `false`; the two scoped identities exist
with least-privilege roles and no keys; workload identity federation restricts
impersonation to jobs in that environment; and the three staging rehearsal
workflows are active under `.github/workflows/`. The
[staging runbook](../operations/firebase-staging-rehearsal.md) holds the full
provider evidence and credential model.

## Open decisions and blockers

- This is a solo-operated project. Independent review, a backup approver, and
  Stage B CODEOWNERS enforcement are deferred until a second maintainer exists.
- Keep the repository private on GitHub Pro. Stage A protection is enforced on
  `main` and must not be weakened while any deployment workflow is
  discoverable. Do not make the repository public.
- Use the two linked records in the
  [solo authorization runbook](../operations/solo-production-authorization.md):
  a pre-merge readiness record and a post-merge cutover execution record tied
  to the exact current `main` SHA. The records supplement Stage A.
- The 22 July 2026 authorization covered only the staging billing link, budget,
  and Storage bucket, which are complete. Creating service accounts, adding IAM
  roles or keys, changing the GitHub plan, creating a GitHub environment,
  activating a workflow, or arming one each requires new explicit authority.
- Stage A, the protected `tenacity-staging` environment, the two federated
  staging identities, and the three active staging workflows are complete
  under the 22 July 2026 activation authorization. No service-account key
  exists; the organization policy forbids key creation, and staging uses
  keyless workload identity federation bound to the protected environment.
- Bootstrap the fresh staging Rules and index state once, and retain complete
  provider rehearsal evidence. Arming `TENACITY_STAGING_REHEARSALS_ENABLED`
  requires an authorized window and must return to `false` afterwards.
- Before production activation, migrate the six inert production templates to
  federated authentication with a production-scoped provider binding; the
  organization policy blocks the key-based design they currently describe.
- Privileged-rehearse Rules read-back, exact-source verification, guarded
  prior-ruleset republishing, manual cross-repository deployment freeze, and
  partial-failure evidence through the separate rollback workflow.
- Privileged-rehearse raw Firestore-index capture, READY-state enforcement,
  source equality, unchanged resource identities, and TTL-policy preservation.
- Rebind only Vercel project `tenacity-tutoring-tqi9` with Root Directory
  `apps/website`; do not touch the duplicate `tenacity-tutoring` project.
- Keep the source repositories available until two stable production
  deployments have completed from the monorepo.

D05 is resolved to a dedicated project; its provider foundation and repository
preparation are complete, and only the protected-environment execution remains.
D06 is superseded by the dated solo authorization model. D07 and D11 remain
open.

## Safe next sequence

1. Update `main` and confirm the activation-preparation merge checkpoint:

   ```bash
   cd /Users/thomassowmi/Development/tenacity-platform
   git switch main
   git pull origin main
   git log -1 --format='%H %s'
   ```

2. Read this handoff, the
   [Phase 3 record](phase-3-ci-and-deployment-controls-2026.md), the
   [staging runbook](../operations/firebase-staging-rehearsal.md), the
   [solo authorization runbook](../operations/solo-production-authorization.md),
   [production deployment runbook](../operations/production-deployment-controls.md),
   and the [branch-protection runbook](../operations/github-branch-protection.md).
3. For an authorized rehearsal window: set
   `TENACITY_STAGING_REHEARSALS_ENABLED=true`, run the staging bootstrap
   (Rules, then indexes), wait for every managed index to become `READY`, run
   and retain the Rules, rollback, partial-failure, and index rehearsals, then
   return the arming variable to `false`.
4. Treat the repository-side Rules and index safeguards as merged. Do not
   repeat their implementation or treat their unit tests as provider rehearsal.
5. Migrate the six inert production templates to federated authentication with
   a production-scoped provider binding, configure the protected-main-only
   production environment with arming false, initialize a `preparing`
   readiness record, and close the Vercel gate.
6. Open the draft activation pull request with its record ID, validate the final
   reviewed head, transition readiness to `ready`, then merge with arming false.
7. Create the exact-SHA cutover execution record in `ready-to-arm` state after
   that pull request merges, then run Phase 4 with fresh baselines and rollback
   IDs.
8. Begin shared contracts and the tutor-session mutation only after the no-op
   cutover is stable.

## Activation-preparation verification

The following checks were verified for the merged activation preparation
([PR 8](https://github.com/tsowmi03/tenacity-platform/pull/8)), separate from
the historical PR 3 and PR 5 baseline below:

- all ten GitHub checks passed on reviewed head
  `dce6ef890652974e5b9d2faba5c11afe0a03f488` in
  [Actions run 29883451157](https://github.com/tsowmi03/tenacity-platform/actions/runs/29883451157)
  before merge commit `ee01f59e3df416dd5d268367bb1da699c253cd14`, including
  the full application matrix triggered by the shared control paths;
- 110 repository-control tests passed across eleven suites, including the new
  staging fixture and inert staging-template suites;
- the strict Firebase configuration validator passed with the exact production
  and staging target policy, 27 indexes, one field override, and the explicit
  Hosting target;
- `actionlint` 1.7.12 passed for the active validation workflow, all six
  modified inert production templates, and the three inert staging templates;
- `markdownlint-cli2` 0.23.1 reported zero issues across 12 selected root and
  documentation files;
- all relative Markdown links resolved across every repository Markdown file;
- `git diff --check` passed for every change; and
- `.github/workflows` and `firebase.json` are unchanged, while `.firebaserc`,
  `backend/firebase`, and `scripts` carry only the reviewed staging bindings,
  fixture, and index-state helper changes.

## Validation baseline

PR 3 passed all ten GitHub checks on the exact Phase 3 validation head
`5c08dd2ab9f7e686f5e8893402ea82fa2f933214` before squash merge. PR 5 then passed
all ten checks on safeguard head
`75771fcb0147259cd2d6351875d0fdb109119992` in
[Actions run 29821547650](https://github.com/tsowmi03/tenacity-platform/actions/runs/29821547650)
before merge commit `8b25b8e953c473a5cc6a3df130c1ace76044438f`.
Combined local evidence includes:

- 89 repository-control tests across nine suites;
- 30 Flutter tests plus formatting, analysis, and web build;
- 145 admin-portal tests and production build;
- website lint and production build;
- 564 Functions unit tests, an 86-export smoke test, and 80 emulator tests;
- 16 Rules emulator tests;
- 10 DOCX and 40 PNG renderer fixtures;
- exact Firebase configuration, 87-resource production inventory, and index
  checks; and
- action, Markdown, JSON, link, diff, and staged-secret checks.

Existing dependency advisories, two website Hooks warnings, and 87 Flutter
informational findings were inherited and remain separate remediation work.

The safeguard change expands the prior control baseline. Its provider-facing
tests use mocked responses only. The 22 July staging setup created one isolated
Firebase project with its Firestore database, authorized billing link, scoped
budget, and default Storage bucket; no production API mutation was made.

## Stop conditions

Stop before any action that would:

- move a production template into `.github/workflows/`;
- add or expose a production secret;
- change a production Firebase or Vercel project binding;
- deploy Functions, rules, indexes, Hosting, the website, or a mobile release
  to production;
- disable an old-repository deploy path; or
- begin a product/schema migration before the no-op cutover is stable.

Approved, distinct staging setup and rehearsal may proceed only through the
staging runbook. The production actions above require the separate readiness,
activation, or cutover authority defined in the production runbook.
