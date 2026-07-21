# Phase 3 CI and deployment controls

- Date: 21 July 2026
- Branch: `migration/phase-3-ci-controls`
- Base: `870e656dcff6cc637fd7303909f95375fc6e970e`
- Status: validation implementation in review; production activation blocked

## Outcome

This phase activates monorepo validation without changing production ownership
or provider state. It adds reviewed deployment designs as inert templates, not
GitHub Actions workflows.

No Firebase deployment, Vercel rebind, preview creation, secret mutation,
environment mutation, branch-protection mutation, application release, or
production write is part of this change.

## Active validation

The root `.github/workflows/validate.yml` runs for every pull request, pushes to
`main`, and manual validation. An in-repository classifier selects affected
jobs while a stable final gate always resolves.

Controls added in this phase include:

- immutable action and exact runtime/CLI pins;
- rename-safe, path-filtered application and backend validation;
- complete mobile formatting, analysis, test, and web-build checks;
- portal, website, Functions, rules, emulator, and render-fixture checks;
- demo-only emulator project IDs;
- a source policy for exactly 83 managed Functions, three helpers, two legacy
  Xero exclusions, and two extension-managed exclusions;
- exact project and managed metadata hashes, live-record normalization, and
  external before/after comparison;
- exact root Firebase manifest and target validation;
- four reviewed Firebase source hashes;
- strict 27-index and one-field-override validation; and
- base-to-head index reporting that fails removals and same-count
  replacements.

Five inherited Dart files were mechanically formatted so the full mobile tree
can use a non-waived format gate. No Dart behavior changed.

## Deployment designs

The following files are deliberately outside `.github/workflows`:

- `firebase-functions-production.yml`
- `firebase-rules-production.yml`
- `firebase-indexes-production.yml`
- `firebase-hosting-production.yml`
- `vercel-production.yml`

They share manual-only dispatch, exact-main-SHA checks both before validation
and again after environment approval, surface-specific typed confirmation, the
`tenacity-production` environment, read-only repository permission, immutable
actions, an arming variable, and one non-cancelling production concurrency
group.

The [production-control runbook](../operations/production-deployment-controls.md)
records their activation gates, evidence, abort conditions, and rollback
boundaries.

## External constraints and remaining work

The Phase 3 exit gate is not complete:

| Requirement | State |
| --- | --- |
| Monorepo validation jobs | Implemented in this branch |
| Production environment required-reviewer enforcement | Blocked by GitHub plan for a private repository |
| Branch protection and required check | Blocked by current GitHub plan until protection is available |
| Second maintainer and independent production approver | Not yet available |
| Production secrets and scoped credentials in new repository | Intentionally not created |
| Rules read-back and source rollback helper | Not implemented |
| Live index equality/no-deletion helper | Not implemented |
| Firebase staging project or signed emulator-only decision | Not completed |
| Vercel project rebind and preview integration | Intentionally not performed |
| Firebase and Vercel production dry run | Cannot run safely before approval controls exist |

These are activation blockers, not validation exceptions. Deployment templates
remain nondiscoverable until every applicable gate closes in a separate pull
request.

## Verification evidence

The branch was checked locally before commit:

| Check | Result |
| --- | --- |
| CI-control unit suite | 28 tests passed |
| Workflow validation | Active workflow and five inert templates passed `actionlint` 1.7.12 |
| Mobile | 99 files formatted with no changes; analysis completed with 87 inherited informational findings; 30 tests passed; web build passed |
| Admin portal | Clean install; 140 Vitest tests and five payload tests passed; production build passed |
| Public website | Clean install; lint and production build passed with two inherited React Hooks warnings |
| Functions | Clean install; 564 unit tests passed; export smoke reported 83 managed endpoints plus three helpers |
| Functions emulator | 80 integration tests passed using `demo-tenacity-functions-test` |
| Rules emulator | 16 tests passed using `demo-tenacity-rules-test` |
| Render fixtures | 10 DOCX and 40 PNG fixtures rendered |
| Firebase configuration | Exact manifest and four source hashes passed; 27 indexes and one field override passed; no base-to-head removal |
| Live Function inventory | All 87 resources matched policy; four external Functions were unchanged |
| Documentation | Markdown lint passed for all changed Markdown files |
| Repository hygiene | `git diff --check` passed |

Clean npm installs reported existing dependency advisories in the unchanged
portal and Functions lockfiles. The website retains two inherited lint
warnings, and the mobile analyzer retains 87 inherited informational findings.
This phase does not waive errors or introduce `continue-on-error`; dependency
and lint remediation remain separate work.

The GitHub pull-request run is still required before merge. It is the first
execution on the pinned Node 22 Linux runners and the authoritative check of
GitHub Actions job/path semantics.

## Rollback

Revert this branch or its merge commit to remove the validation workflow,
policies, and inert templates. Because this phase performs no provider mutation
or deployment, production continues from the original repositories throughout
rollback.
