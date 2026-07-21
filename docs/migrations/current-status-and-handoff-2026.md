# Migration status and handoff

- Verified: 22 July 2026
- Authoritative repository: `https://github.com/tsowmi03/tenacity-platform`
- Current platform `main`:
  `8b25b8e953c473a5cc6a3df130c1ace76044438f`
- Phase 3 safeguard reviewed head:
  `75771fcb0147259cd2d6351875d0fdb109119992`
- Current stage: repository implementation through Phase 3 merged; production
  activation blocked
- Production cutover: not started

## Read this first

This is the resume point for a new migration session. Repository work through
the Phase 3 validation, deployment-control design, and focused Rules and index
safeguards is merged on `main`. Production deployment ownership has not moved
to this repository, provider bindings have not changed, and the inert
deployment templates must not be activated yet.

Use this file for current status, the individual phase records for evidence,
and the [production deployment runbook](../operations/production-deployment-controls.md)
for activation gates. The detailed original plan remains at
`/Users/thomassowmi/Development/Tenacity/TENACITY_PLATFORM_MONOREPO_MIGRATION_PLAN.md`
on the mobile `redesign-v3` line.

## Completed repository work

| Stage | Result | Evidence |
| --- | --- | --- |
| Phase 0 technical baseline | Complete | Source checkpoints and rollback tags created; Firebase, Hosting, Vercel, rules, and index baselines captured |
| History import | Complete | All 672 mapped commits are reachable from published refs |
| Phase 1 repository hardening | Merged | [PR 1](https://github.com/tsowmi03/tenacity-platform/pull/1), commit `399a76a120b4def59f67d34e7879c7539a13b31a` |
| Phase 2 Firebase extraction | Merged, not deployed | [PR 2](https://github.com/tsowmi03/tenacity-platform/pull/2), commit `870e656dcff6cc637fd7303909f95375fc6e970e` |
| Phase 3 validation controls | Merged and active | [PR 3](https://github.com/tsowmi03/tenacity-platform/pull/3), commit `592ed0936c80f36c1ed0021da6f8026236a69e8e`; ten GitHub checks passed |
| Phase 3 Rules and index safeguards | Merged, not activated | [PR 5](https://github.com/tsowmi03/tenacity-platform/pull/5), merge commit `8b25b8e953c473a5cc6a3df130c1ace76044438f`; all ten GitHub checks passed |
| Phase 3 production activation | Blocked | Templates are inert; environment, approval, credential, staging, privileged-rehearsal, and provider gates remain open |
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
GitHub cannot discover or run them. No production credentials belong in this
repository before the protected environment is approved.

## Open decisions and blockers

- Choose a GitHub plan or organisation that supports protection and required
  reviewers for this private repository.
- Grant a second eligible maintainer write access.
- Name a primary and backup production approver and prevent self-approval and
  administrator bypass.
- Create the `tenacity-production` environment only after those controls can be
  enforced, then add scoped credentials and keep
  `TENACITY_PRODUCTION_DEPLOYS_ENABLED=false`.
- Decide whether to create a staging Firebase project or formally approve the
  emulator-only and production-feature-flag interim strategy.
- Keep staging absent from `backend/firebase/deployment-targets.json` until
  that decision is closed; then review its exact project and Storage-bucket
  pair plus database ID.
- Privileged-rehearse Rules read-back, exact-source verification, guarded
  prior-ruleset republishing, manual cross-repository deployment freeze, and
  partial-failure evidence through the separate rollback workflow.
- Privileged-rehearse raw Firestore-index capture, READY-state enforcement,
  source equality, unchanged resource identities, and TTL-policy preservation.
- Rebind only Vercel project `tenacity-tutoring-tqi9` with Root Directory
  `apps/website`; do not touch the duplicate `tenacity-tutoring` project.
- Keep the source repositories available until two stable production
  deployments have completed from the monorepo.

These correspond to open plan decisions D05, D06, D07, and D11 plus the
external governance gates carried forward from Phases 0 and 1.

## Safe next sequence

1. Start from a clean, current platform checkout:

   ```bash
   cd /Users/thomassowmi/Development/tenacity-platform
   git switch main
   git pull --ff-only
   git status --short --branch
   ```

2. Read this handoff, the
   [Phase 3 record](phase-3-ci-and-deployment-controls-2026.md), the
   [production deployment runbook](../operations/production-deployment-controls.md),
   and the [branch-protection runbook](../operations/github-branch-protection.md).
3. Verify the current remote `main` and open pull requests before relying on the
   current commit above. Documentation and later reviewed work may have
   advanced `main`; inspect the intervening changes first.
4. Treat the repository-side Rules and index safeguards as merged. Do not
   repeat their implementation or treat their unit tests as provider rehearsal.
5. Close the governance, approver, staging, privileged-rehearsal, and provider
   gates on focused branches.
6. Prepare a separate activation pull request only after every applicable
   runbook checkbox is closed. Keep the production arming variable false during
   setup and rehearsal.
7. Run the Phase 4 no-op cutover only with an approved window, fresh baselines,
   explicit rollback identifiers, and the named approver present.
8. Begin shared contracts and the tutor-session mutation only after the no-op
   cutover is stable.

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
tests use mocked responses only; no Firebase production API was called.

## Stop conditions

Stop before any action that would:

- move a production template into `.github/workflows/`;
- add or expose a production secret;
- change a Firebase or Vercel project binding;
- deploy Functions, rules, indexes, Hosting, the website, or a mobile release;
- disable an old-repository deploy path; or
- begin a product/schema migration before the no-op cutover is stable.

Those actions require the separately reviewed activation or cutover authority
defined in the production runbook.
