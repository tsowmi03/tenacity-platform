# Firebase platform source

This directory is the canonical Firebase source inside the Tenacity platform
monorepo. It owns Functions, Firestore and Storage rules, indexes, and the
Storage CORS source.

> Production deployment ownership has not moved. Until the reviewed no-op
> cutover, deploy Firebase only from the original
> `tsowmi03/tenacity-web-portal` repository. Do not deploy from this monorepo.

## Layout

| Path | Purpose |
| --- | --- |
| `functions` | Node.js 22 Cloud Functions package |
| `rules/firestore.rules` | Canonical Firestore rules |
| `rules/storage.rules` | Canonical Storage rules |
| `indexes/firestore.indexes.json` | Canonical Firestore index manifest |
| `storage.cors.json` | Reviewed Storage CORS source; Firebase deploy does not apply it |

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

Do not regenerate or replace `lib` during Phase 2. Source recovery belongs in
a separate function-by-function project after the no-op cutover.

The local entry point exposes 83 deployable endpoints and three plain helper
exports. The deployable endpoint names must match the 83 portal-managed
production endpoints. The two legacy `generateXeroAuthUrl` and
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
```

Run the rules and Functions emulator suites serially because both use Firestore
port 8080. These commands are validation only; they do not authorize a
production deployment.
