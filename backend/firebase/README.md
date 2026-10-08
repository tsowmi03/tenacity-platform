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
> two-stable-deployment archive gate closes. Mobile store releases also ship
> from this monorepo (`apps/mobile`).

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
command must be reviewed carefully. Hosting uses two explicit targets —
`admin-portal` and `resource-portal`, one per front-end application — and a
bare Hosting deploy is not allowed during the migration.

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

## Local live resource-generation smoke test

The resource worker has a synthetic live-provider rehearsal that does not use
Firestore, Cloud Storage, uploaded files, or real student data. Add the relevant
provider keys to the git-ignored
`functions/.secret.local` file:

```dotenv
ANTHROPIC_API_KEY=your-local-anthropic-key
OPENAI_API_KEY=your-local-openai-key
```

From `functions`, check the local secret without making an API
request, then run the default Anthropic-outage rehearsal. The runner injects one
529-style Opus failure, sends the complete synthetic job to GPT-5.6 Sol in a
fresh attempt, opens the resulting DOCX through Mammoth, and writes the DOCX and
a sanitized audit JSON file under the operating system's temporary directory.

```sh
npm run smoke:resources:live:preflight
npm run smoke:resources:live
```

If the key is already provisioned in production Secret Manager, use the
explicit option below instead of making a local copy. It reads only the
required secret through the authenticated Firebase CLI, keeps it in memory,
and does not print it:

```sh
npm run smoke:resources:live -- --firebase-secrets
```

Use `-- --scenario sol-direct`, `opus-direct`, or `sol-to-opus` to exercise the
other routes. These commands call the real provider APIs and incur normal API
usage, but they do not connect to any Firebase project.

## Switching resource AI models (no deploy)

Resource generation, the pre-generation chat and the public-domain source
planner read their models from the Firestore doc `config/resourceModels`, with
the code defaults in
[`modelRegistry.js`](functions/src/resources/modelRegistry.js)
for any field it doesn't set. To switch, create or edit that doc in the
Firebase console (staging first). It takes effect within about a minute.

| Field | Default | Must start with |
|---|---|---|
| `anthropic` | `claude-opus-5-5` | `claude-` (the "Claude" choice) |
| `openai` | `gpt-6.1-sol` | `gpt-` (the "GPT" choice) |
| `defaultChoice` | `openai` | `anthropic` or `openai` |
| `chat` | `claude-sonnet-5-5` | `claude-` or `gpt-` |
| `sourcePlanner` | `claude-sonnet-5` | `claude-` or `gpt-` |
| `sourcePlannerFallback` | `gpt-5.6-terra` | `claude-` or `gpt-` |

- A malformed value, or a choice set to a model from the other provider, is
  ignored and logged (`[modelRegistry] ignored unusable model config fields`).
- Queued and retried jobs pick up the new model; a resource already being
  generated finishes on the model it started with. Each job records the exact
  model it ran on.
- To roll back, delete the field (or the whole doc).
- To change the code defaults, edit `DEFAULT_MODELS` and redeploy.
