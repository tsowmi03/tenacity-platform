# Tenacity Platform — Change Log

A curated, human-readable record of what changed in this monorepo migration
and why. Unlike `git log`, entries are grouped by task, trivial commits are
omitted, and open follow-ups are tracked at the bottom.

## How to use / update this log

- Newest entries go at the top, directly under this section.
- One entry per task or piece of work, not per commit or file.
- Each entry: date, what changed (a few bullets, plain language), status,
  and Next steps only when there is a specific, real follow-up (not a
  generic "could be improved").
- Pull recurring open items into Open items / backlog rather than repeating
  them in every entry.

---

## Index

| Date | Entry |
| --- | --- |
| 2026-07-22 | [Migrate production templates to federated auth](#2026-07-22--migrate-production-templates-to-federated-auth) |
| 2026-07-22 | [Staging bootstrap and full rehearsal matrix](#2026-07-22--staging-bootstrap-and-full-rehearsal-matrix) |
| 2026-07-22 | [Stage A protection and staging workflow activation](#2026-07-22--stage-a-protection-and-staging-workflow-activation) |
| 2026-07-22 | [Staging foundation and activation preparation](#2026-07-22--staging-foundation-and-activation-preparation) |
| 2026-07-22 | [Phase 3 handoff refresh](#2026-07-22--phase-3-handoff-refresh) |
| 2026-07-21 | [Phase 3 Rules and index safeguards](#2026-07-21--phase-3-rules-and-index-safeguards) |
| 2026-07-21 | [Phase 3 CI and deployment controls](#2026-07-21--phase-3-ci-and-deployment-controls) |
| 2026-07-21 | [Phase 2 Firebase extraction](#2026-07-21--phase-2-firebase-extraction) |
| 2026-07-21 | [Phase 0–1 history import and hardening](#2026-07-21--phase-01-history-import-and-hardening) |

---

## 2026-07-22 — Migrate production templates to federated auth

**What changed:**

- Rewrote the five inert Firebase production workflow templates
  (`functions`, `hosting`, `indexes`, `rules`, `rules-rollback`) under
  `docs/operations/workflow-templates/` to authenticate with keyless workload
  identity federation instead of a `FIREBASE_SERVICE_ACCOUNT_JSON` key secret,
  matching the model the staging rehearsal proved. Each deployment job now
  carries `id-token: write`, mints a short-lived token via the pinned
  `google-github-actions/auth` action against a production-scoped provider
  (project number `398065992407`), threads `GOOGLE_OAUTH_ACCESS_TOKEN` into
  every state-helper call, and cleans up `GOOGLE_GHA_CREDS_PATH`. The four
  surfaces bind four separate least-privilege service accounts.
- Left the Vercel template unchanged: it uses a Vercel platform token, not a
  Google credential.
- Documented the production federation model (pool, provider, four scoped
  service accounts, environment-restricted impersonation) in the production
  deployment runbook, dropped `FIREBASE_SERVICE_ACCOUNT_JSON` from required
  secrets, marked the completed staging/Stage A gates, and refreshed the
  canonical handoff and staging runbook accordingly.
- Added `scripts/ci/test/production-workflow-templates.test.mjs` (14 cases)
  asserting the federated design, per-surface identity isolation, no
  key-based references, and the untouched Vercel token path.

**Why:** The Google Cloud organization blocks service-account key creation, so
the key-based design the production templates previously described could never
run. This is the first production-control preparation gate in the safe
activation sequence; the templates stay inert in `docs/` until the production
federation resources are created under separate authority.

**Status:** In progress — changes staged on a branch for a PR into `main`. The
templates remain inert and no production resource, credential, or environment
was created.

**Next steps:**

- Create the production federation resources (pool, provider, service
  accounts, impersonation bindings) under new explicit authority, then the
  `tenacity-production` environment with arming `false`, the `preparing`
  readiness record, and the Vercel rebind — the remaining preparation gates
  before the activation PR.

---

## 2026-07-22 — Staging bootstrap and full rehearsal matrix

**What changed:**

- Ran the complete Phase 3 staging rehearsal against the real
  `tenacity-tutoring-staging` project through the activated workflows: Rules
  bootstrap, index bootstrap (27 indexes + 1 field override to `READY`),
  Rules no-op, Rules partial failure (deny-all fixture), digest-bound Rules
  rollback restore, and index no-op — all successful with evidence artifacts
  and manifest hashes recorded in the staging runbook.
- Four failed attempts each stopped without touching provider state and
  exposed real defects, now fixed: a federation binding gap (fixed with an
  environment principal-set), the live Firestore Admin API rejecting explicit
  `pageSize` on index listings
  ([PR #11](https://github.com/tsowmi03/tenacity-platform/pull/11)), a
  missing `firebaserules.rulesets.test` permission for index deploys (new
  single-permission custom role), and an unpassable mis-sorted key check in
  the restore gate
  ([PR #12](https://github.com/tsowmi03/tenacity-platform/pull/12)).
- Disarmed `TENACITY_STAGING_REHEARSALS_ENABLED` after the window and
  refreshed the canonical handoff. D05 is closed.

**Why:** The staging rehearsal is the last technical gate before production
activation work; it exists precisely to surface provider-behaviour mismatches
mocked tests cannot, and it did.

**Status:** Complete. Staging ends the day on canonical Rules and fully READY
indexes with source equality proven.

---

## 2026-07-22 — Stage A protection and staging workflow activation

**What changed:**

- Enforced Stage A branch protection on `main` after the GitHub Pro upgrade:
  PR-only (zero approvals, admins included), strict required validation gate,
  linear history, no force pushes or deletions.
- Created the protected `tenacity-staging` GitHub environment (protected
  branches only) with the six reviewed variables and the arming flag `false`.
- Created two least-privilege staging service accounts (Rules and indexes)
  with documented roles and a single-permission custom role instead of the
  data-read-bundling `firebase.viewer`.
- The Google Cloud org forbids service-account keys, so the planned key-based
  workflow credentials were replaced with keyless workload identity
  federation: a GitHub OIDC pool/provider restricted to this repository, with
  impersonation bound to the exact `tenacity-staging` environment subject.
- Reworked the three staging rehearsal workflows for federated auth, added a
  token path to the Firebase state helpers, and activated the workflows by
  moving them into `.github/workflows/`. Production templates stay inert and
  must be migrated to federated auth before their own activation.

**Why:** These were the remaining gates between the merged staging
preparation and the actual staging bootstrap/rehearsal. The federation switch
was forced by the org's key-creation ban and is strictly better security: no
long-lived credential exists anywhere.

**Status:** Merged via
[PR #10](https://github.com/tsowmi03/tenacity-platform/pull/10) (`fc27928`);
all ten checks passed before merge.

---

## 2026-07-22 — Staging foundation and activation preparation

**What changed:**

- Adopted a solo-operator governance model: no second maintainer or reviewer
  is a migration blocker; a documented two-record authorization process
  replaces GitHub environment reviewers for production activation.
- Provisioned the dedicated staging Firebase project
  `tenacity-tutoring-staging` (Firestore in `nam5`, billing linked with an
  AUD 10 monthly budget and alerts, default Storage bucket in `US-CENTRAL1`).
  No production resource was touched.
- Wired staging into the repository: `.firebaserc` alias, deployment-target
  mapping, validator and test coverage, a deny-all partial-failure Rules
  fixture, and three inert staging rehearsal workflow templates.
- Attempted, then deliberately removed, a 1,100-line local rehearsal driver in
  favour of a single protected-GitHub-environment execution path.
- Corrected the canonical handoff and runbooks to match the verified provider
  state, and added the staging rehearsal and solo authorization runbooks.

**Why:** The Phase 3 production-activation gates require a rehearsed Firebase
staging path and an honest governance model for a one-engineer project before
any production workflow can be activated.

**Status:** Merged via
[PR #8](https://github.com/tsowmi03/tenacity-platform/pull/8)
(merge commit `ee01f59`); all ten GitHub checks passed before merge. The
follow-on activation and rehearsal work is covered by the two entries above.

---

## 2026-07-22 — Phase 3 handoff refresh

**What changed:**

- Refreshed the Phase 3 migration handoff after the safeguard merge and
  stabilized its checkpoint labels (PRs #6 and #7).

**Status:** Merged.

---

## 2026-07-21 — Phase 3 Rules and index safeguards

**What changed:**

- Added focused Firebase Rules capture/verify/rollback and Firestore index
  state safeguards with mocked-provider test coverage (PR #5, merged as
  `8b25b8e`).
- All ten GitHub checks passed on the reviewed head before merge.

**Why:** Production Rules and index deployments need capture, verification,
and rollback machinery proven before any workflow that uses them is activated.

**Status:** Merged, not activated — the templates that use these safeguards
remain inert outside `.github/workflows/`.

---

## 2026-07-21 — Phase 3 CI and deployment controls

**What changed:**

- Added the active validation-only workflow, migration CI controls, and the
  six inert production deployment/rollback workflow templates under
  `docs/operations/workflow-templates/` (PR #3).
- Documented current migration status and handoff (PR #4).

**Status:** Merged and active (validation workflow); production templates
inert by design.

---

## 2026-07-21 — Phase 2 Firebase extraction

**What changed:**

- Extracted Firebase source (Functions, rules, indexes) from
  `tsowmi03/tenacity-web-portal` into `backend/firebase/` (PR #2).

**Status:** Merged, not deployed — production deployments still run from the
three original repositories.

---

## 2026-07-21 — Phase 0–1 history import and hardening

**What changed:**

- Captured Phase 0 baselines and rollback tags for Firebase, Hosting, Vercel,
  rules, and indexes.
- Imported full history from the mobile, web-portal, and website repositories
  (672 mapped commits reachable from published refs).
- Completed Phase 1 repository hardening (PR #1).

**Status:** Merged.

---

## Open items / backlog

1. **Production template federation migration** — the six inert production
   templates still describe key-based credentials; the org key-creation ban
   means they must move to workload identity federation (production-scoped
   binding) before production activation.
2. **Vercel rebind** — point only project `tenacity-tutoring-tqi9` at
   `apps/website`; leave the duplicate `tenacity-tutoring` project untouched.
3. **Phase 4 no-op cutover, then Phase 5 shared contracts** — after all
   activation gates close.
4. **Rotate legacy credentials** — the old `tenacity-tutoring-2` Function
   metadata exposed plaintext Stripe test and SendGrid credentials; rotate
   both (separate from migration work).
5. **Inherited advisories** — dependency advisories, two website Hooks
   warnings, and 87 Flutter informational findings remain separate
   remediation work.

---

## Reference docs

- [`docs/migrations/current-status-and-handoff-2026.md`](docs/migrations/current-status-and-handoff-2026.md)
  — canonical migration status and resume point.
- [`docs/operations/firebase-staging-rehearsal.md`](docs/operations/firebase-staging-rehearsal.md)
  — staging provider state and rehearsal plan.
- [`docs/operations/solo-production-authorization.md`](docs/operations/solo-production-authorization.md)
  — solo two-record production authorization model.
- [`docs/operations/production-deployment-controls.md`](docs/operations/production-deployment-controls.md)
  — production activation gates.
- [`docs/operations/github-branch-protection.md`](docs/operations/github-branch-protection.md)
  — Stage A/B branch-protection plan.
