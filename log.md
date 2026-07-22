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
| 2026-07-22 | [Staging foundation and activation preparation](#2026-07-22--staging-foundation-and-activation-preparation) |
| 2026-07-22 | [Phase 3 handoff refresh](#2026-07-22--phase-3-handoff-refresh) |
| 2026-07-21 | [Phase 3 Rules and index safeguards](#2026-07-21--phase-3-rules-and-index-safeguards) |
| 2026-07-21 | [Phase 3 CI and deployment controls](#2026-07-21--phase-3-ci-and-deployment-controls) |
| 2026-07-21 | [Phase 2 Firebase extraction](#2026-07-21--phase-2-firebase-extraction) |
| 2026-07-21 | [Phase 0–1 history import and hardening](#2026-07-21--phase-01-history-import-and-hardening) |

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
staging environment, bootstrap, and rehearsal remain open — see the backlog.

**Next steps:**

- Upgrade the repository to GitHub Pro and enforce Stage A branch protection
  (owner action, ~15 minutes).
- With new explicit authority: create the protected `tenacity-staging`
  environment, scoped service accounts, and secrets, then activate and run the
  staging bootstrap and rehearsals.

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

1. **GitHub Pro upgrade and Stage A protection** — required before any
   production credential, workflow activation, or Phase 4; owner account
   action.
2. **Staging environment, credentials, bootstrap, and rehearsal** — protected
   `tenacity-staging` environment, two scoped service accounts, template
   activation, one bootstrap, four rehearsal scenarios; each step needs new
   explicit authority.
3. **Vercel rebind** — point only project `tenacity-tutoring-tqi9` at
   `apps/website`; leave the duplicate `tenacity-tutoring` project untouched.
4. **Phase 4 no-op cutover, then Phase 5 shared contracts** — after all
   activation gates close.
5. **Rotate legacy credentials** — the old `tenacity-tutoring-2` Function
   metadata exposed plaintext Stripe test and SendGrid credentials; rotate
   both (separate from migration work).
6. **Inherited advisories** — dependency advisories, two website Hooks
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
