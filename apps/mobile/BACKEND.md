# Backend ownership

Canonical Firebase source now belongs to the platform monorepo. The Flutter app
is a client of that shared backend.

Production deployment ownership has not moved. Until the reviewed no-op
cutover, the original `tsowmi03/tenacity-web-portal` repository remains the
only approved Firebase deployment source.

## Canonical backend paths

- Cloud Functions: `../../backend/firebase/functions`
- Firestore rules: `../../backend/firebase/rules/firestore.rules`
- Storage rules: `../../backend/firebase/rules/storage.rules`
- Firestore indexes: `../../backend/firebase/indexes/firestore.indexes.json`
- Firebase manifest and project alias: repository root

## Deployment boundary

Do not run a Firebase deployment from this application directory or from the
monorepo before cutover approval. `apps/mobile/firebase.json` contains
FlutterFire client metadata only. The legacy files under `public` are retained
as nondeployable history.

The Flutter app continues to call deployed Firebase Functions by name. Phase 2
changes their source location only.
