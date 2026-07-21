# Phase 2 Firebase extraction, 21 July 2026

## Status

Phase 2 implementation and validation are complete on
`migration/phase-2-firebase-extraction`, based on merged `main` at
`399a76a120b4def59f67d34e7879c7539a13b31a`. The branch has not been deployed.

This phase changes repository paths and ownership only. The original portal
repository remains the production deployment source until the separately
reviewed no-op cutover. No Firebase resource, provider binding, active workflow
behavior, secret, released client, or production deployment may change in
Phase 2. No deployment workflow is added or activated.

## Entry-gate interpretation

The repository owner authorized this no-deploy structural extraction while the
external Phase 1 governance gates remain open. That authorization does not
waive those gates. Private-repository branch protection, second-maintainer
access, production-approver confirmation, and the deploy freeze remain required
before any production deployment workflow is activated or the no-op cutover
begins.

## Structural map

| Previous path | Platform path |
| --- | --- |
| `apps/admin-portal/backend/functions` | `backend/firebase/functions` |
| `apps/admin-portal/firestore.rules` | `backend/firebase/rules/firestore.rules` |
| `apps/admin-portal/storage.rules` | `backend/firebase/rules/storage.rules` |
| `apps/admin-portal/backend/firestore.indexes.json` | `backend/firebase/indexes/firestore.indexes.json` |
| `apps/admin-portal/storage.cors.json` | `backend/firebase/storage.cors.json` |
| `apps/admin-portal/firebase.json` | root `firebase.json` |
| `apps/mobile/.firebaserc` | root `.firebaserc` |

`apps/mobile/firebase.json` retains FlutterFire client metadata but no
deployable Hosting configuration.

## Baseline invariants

- Production contains 87 Functions: 83 portal-managed endpoints, two extension
  endpoints, and the excluded legacy `generateXeroAuthUrl` and
  `xeroOAuthCallback` resources.
- The local entry point has 86 exports: the same 83 deployable endpoints plus
  three plain helpers.
- Firestore rules SHA-256:
  `f9e80792232fd95a6dee9e9c5b730f889e0ecd0fbdd5be20fc578ee4467690cb`.
- Storage rules SHA-256:
  `03d59a6817ef741e5c226de574602017c97f7968681fa2bdecd96a80a9b5701f`.
- Index manifest SHA-256:
  `8301ed95a448b99b3f9b2c9d5d1dc661a1cee9c4ae63d0f16fc054d37da82c22`.
- The index manifest contains 27 composite indexes and one field override.
- Firebase Hosting has one site, `tenacity-tutoring-b8eb2`.

Rules, indexes, the tracked Functions parameter file, and Storage CORS source
must remain byte-identical during the move.

## Hosting decision

The existing site maps only to the explicit `admin-portal` target. Phase 2
does not create `mobile-support` because:

- the mobile `public` directory is not an active release;
- the portal already serves the released `/terms.html` and
  `/reset_password.html` routes;
- the public website owns the current mobile support destination; and
- no unique tracked mobile asset requires a second Hosting site.

The mobile static files remain as nondeployable application history. A later
review may remove or relocate them, but that is not part of the structural
extraction.

## Verification gate

Completed before review:

- [x] moved rules, indexes, Functions parameters, and Storage CORS source match
  their pre-move hashes;
- [x] the portal unit suite and production build pass;
- [x] the separate enrolment payload test passes;
- [x] the rules emulator suite passes;
- [x] Functions unit, smoke, and emulator suites pass under Node.js 22;
- [x] the 83 local deployable endpoint names match the managed live inventory;
- [x] the three plain helper exports remain nondeployable;
- [x] the two excluded legacy Xero resources remain outside the managed set;
- [x] root Firebase configuration resolves every source path and the named
  Hosting target;
- [x] no active root deployment workflow exists; and
- [x] the final diff contains no application behavior change.

## Validation results

Validation ran with Node.js 22.23.1 and npm 10.9.2:

- portal Vitest: 28 files and 140 tests passed;
- separate enrolment payload suite: five tests passed;
- portal production build: passed, with the existing large-chunk warning;
- Functions unit suite: 133 suites and 564 tests passed;
- Firestore and Storage rules emulators: 16 tests passed;
- Functions emulator integration suite: 80 tests passed;
- resource fixture render: 10 DOCX files generated;
- diagram fixture render: 40 PNG files generated;
- renderer spike: the custom SVG cases and DOCX embedding passed; optional
  JSXGraph and Asymptote cases skipped because their tools are not installed;
- export comparison: all 86 local exports were preserved, with exactly 83
  deployable endpoints matching the managed production inventory; and
- `git diff --check`, JSON parsing, path resolution, and byte-equivalence checks
  passed; Markdown lint passed for the current root and migration documents.

Fresh installs reported existing npm audit findings in both packages. No audit
fix or dependency update was included because Phase 2 is structural only.

The GitHub-plan limitation, second-maintainer access, production approver, and
deploy freeze remain external gates before production cutover.
