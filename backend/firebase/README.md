# Firebase platform source

This directory is the canonical Firebase source inside the Tenacity platform
monorepo. It owns Functions, Firestore and Storage rules, indexes, and the
Storage CORS source.

> **Rules are current.** The feedback-document change the mobile V3 tutor build
> depends on was deployed to `tenacity-tutoring-b8eb2` on 29 July 2026, and
> `inventory/source-baseline.json` was re-captured against it the same day.

> **This monorepo is the canonical, production-deploying repository.** The
> Phase 4 no-op cutover completed 24 July 2026: every Firebase and Vercel
> production surface deploys from here (see the
> [migration handoff](../../docs/migrations/current-status-and-handoff-2026.md)
> and the
> [production deployment runbook](../../docs/operations/production-deployment-controls.md)).
> `tsowmi03/tenacity-web-portal` and `tsowmi03/tenacity-tutoring` no longer
> serve production and are redundant; they stay available only until the
> two-stable-deployment archive gate closes. Mobile releases are the one
> exception and continue from `tsowmi03/Tenacity`.

## Layout

| Path | Purpose |
| --- | --- |
| `functions` | Node.js 22 Cloud Functions package |
| `rules/firestore.rules` | Canonical Firestore rules |
| `rules/storage.rules` | Canonical Storage rules |
| `indexes/firestore.indexes.json` | Canonical Firestore index manifest |
| `storage.cors.json` | Reviewed Storage CORS source; Firebase deploy does not apply it |
| `inventory/production-functions.json` | Approved managed and protected production Function policy |
| `inventory/source-baseline.json` | Reviewed rules, index, and CORS source hashes |

The repository root `firebase.json` is the only deployable Firebase manifest.
The root `.firebaserc` selects `tenacity-tutoring-b8eb2`, so every Firebase
command must be reviewed carefully. Hosting uses the explicit
`admin-portal` target. A bare Hosting deploy is not allowed during the
migration.

## Functions package

The package uses Node.js 22 and exports through `lib/index.js`. The mixed
`lib` and `src` layout is intentional during the structural migration:

- `lib` contains compiled and later hand-edited production behavior;
- several source maps refer to TypeScript sources that are not present; and
- newer modules under `src` are loaded by the compiled entry point.

Do not regenerate or replace `lib` during the migration or no-op cutover.
Source recovery belongs in a separate function-by-function project after the
cutover is complete.

The local entry point exposes 85 deployable endpoints and three plain helper
exports. The deployable endpoint names must match the reviewed managed
Function policy. The two legacy `generateXeroAuthUrl` and
`xeroOAuthCallback` resources are not owned by this package and must never be
included in a deletion plan.

## Validation

Run commands from the repository root with Node.js 22:

```bash
npm ci --prefix backend/firebase/functions
npm --prefix backend/firebase/functions test
npm --prefix backend/firebase/functions run smoke
npm --prefix apps/admin-portal run test:rules
npm --prefix backend/firebase/functions run test:emulator
node scripts/ci/check-functions-inventory.mjs
node scripts/ci/validate-firebase-config.mjs
node --test scripts/ci/test/*.test.mjs
```

Run the rules and Functions emulator suites serially because both use Firestore
port 8080. Their package scripts use isolated `demo-*` project IDs so emulator
validation cannot fall through to the production project. These commands are
validation only; they do not authorize a production deployment.

The Function policy contains exactly 87 managed endpoints, three local helper
exports, two protected legacy Xero Functions, and two extension-managed
Functions. The workflow reports endpoints that are not yet live during the
batches and requires the exact 91-resource inventory after the final batch.

A Function deploying for the first time needs no special handling: the
pre-deploy comparison reports it as not-yet-live and the strict post-batch
check still requires it to be live when the run finishes. See
[Introducing a new Function](../../docs/operations/production-deployment-controls.md#functions).
