# Tenacity platform

This private monorepo contains the Tenacity Tutoring mobile app, admin portal,
public website, and the platform-owned Firebase source.

## Migration status

Start a new migration session with the
[current status and handoff](docs/migrations/current-status-and-handoff-2026.md).
It records the merged phase commits, the production boundary, the remaining
activation blockers, and the exact safe next sequence.

The history import completed on 21 July 2026. The imported histories are under
`apps/`, and all 672 commits mapped during the import are reachable from the
published main, feature, tag, or archive refs. See the
[import record](docs/migrations/monorepo-import-2026.md) for the exact mapping
and verification evidence. The
[Phase 1 hardening record](docs/migrations/phase-1-hardening-2026.md) records
the imported-path validation and remaining external gates. The
[Phase 2 extraction record](docs/migrations/phase-2-firebase-extraction-2026.md)
tracks the behavior-preserving Firebase move. The
[Phase 3 controls record](docs/migrations/phase-3-ci-and-deployment-controls-2026.md)
tracks active monorepo validation. The
[Phase 3 activation-safeguards record](docs/migrations/phase-3-activation-safeguards-2026.md)
tracks the repository-side Rules and index read-back controls and the remaining
production-control gates, including evidence manifests and the separate Rules
rollback design.

The Phase 4 no-op production cutover is complete for the Firebase backend,
admin Hosting, and public website. Those surfaces now release independently
from this monorepo through guarded root workflows. Mobile and store releases
were outside that cutover and remain owned by the existing mobile repository.
The current state, completed execution records, and remaining cleanup work are
maintained in the
[current status and handoff](docs/migrations/current-status-and-handoff-2026.md).

Production ownership is:

| Surface | Current production owner |
| --- | --- |
| Mobile and store releases | [`tsowmi03/Tenacity`](https://github.com/tsowmi03/Tenacity) |
| Cloud Functions, Firebase rules and indexes, and admin Hosting | This monorepo (`backend/firebase` and `apps/admin-portal`) |
| Public website and Vercel | This monorepo (`apps/website`) |

The root `validate.yml` workflow is validation-only. Production releases use
the manual, exact-SHA workflows under `.github/workflows/`; each requires a
deployment execution record, typed confirmation, successful validation, and a
temporarily armed production environment. Deploy one surface at a time and
restore its arming value to false after every attempt.

The root `firebase.json` is the only deployable Firebase manifest. It maps the
existing Hosting site to the explicit `admin-portal` target. The root
`.firebaserc` keeps production as the default project and now includes an exact
staging alias. `apps/mobile/firebase.json` contains FlutterFire client metadata
only.

`backend/firebase/deployment-targets.json` is the reviewed provider-identity
policy for privileged Rules and index helpers. It contains separate exact
production and staging project, Storage-bucket, and database bindings. The
staging project, billing guardrail, Firestore database, and Firebase default
Storage bucket are provisioned, and the three staging rehearsal workflows are
active with federated identities; bootstrap and privileged rehearsal remain
pending. See the
[staging runbook](docs/operations/firebase-staging-rehearsal.md). The root
Firebase files bind each project's `primary` Storage deploy target to its exact
bucket so future CLI writes and Rules API read-back agree.

## Current repository layout

| Path | Contents | Runtime and package manager |
| --- | --- | --- |
| `apps/mobile` | Flutter client for parents, tutors, students, and mobile admin workflows | Flutter 3.x, Dart `^3.5.3`, pub |
| `apps/admin-portal` | React/Vite back-office UI | Node.js, npm lockfile |
| `apps/website` | Next.js public website, enrolment flow, and application-specific server routes | Next.js 15, Yarn 1 |
| `backend/firebase` | Functions, rules, indexes, Storage CORS source, and platform operations | Node.js 22 for Functions, npm lockfile |
| `docs/migrations` | Import and cutover records | Markdown |

Production workflow gates and rollback requirements are defined in the
[deployment-control runbook](docs/operations/production-deployment-controls.md).

## Local development

There is no root workspace manifest or root orchestration command. Run commands
inside the relevant application and keep its current package manager.

> Local runtime safety: the tracked clients target the production Firebase
> project, and the applications do not automatically connect to emulators.
> Running a mutating flow with production configuration can write Firestore,
> call production Functions, submit an enrolment, send email, or start a payment
> flow. Use emulators or an explicitly approved test method before exercising a
> mutation.

### Mobile

```bash
cd apps/mobile
flutter pub get
flutter run
```

The tracked FlutterFire configuration already targets
`tenacity-tutoring-b8eb2`. Do not rerun `flutterfire configure` unless the
Firebase client configuration is intentionally changing.

### Admin portal and Firebase Functions

Use Node.js 22 for backend work.

```bash
npm ci --prefix apps/admin-portal
npm ci --prefix backend/firebase/functions
npm --prefix apps/admin-portal run dev
```

The portal requires an ignored local `.env` with its `VITE_FIREBASE_*` client
configuration. Required names are `VITE_FIREBASE_API_KEY`,
`VITE_FIREBASE_AUTH_DOMAIN`, and `VITE_FIREBASE_PROJECT_ID`. The storage bucket,
messaging sender ID, and app ID variants are optional in the current source.
Secret values must remain outside Git.

The portal and Functions packages retain separate npm lockfiles. The Functions
runtime and lock metadata require Node.js 22. Package-manager consolidation is
outside the structural migration.

### Public website

```bash
cd apps/website
yarn install --frozen-lockfile
yarn dev
```

The local development server uses port 3003. The website requires an ignored
`.env.local`. Current source may require the six `NEXT_PUBLIC_FIREBASE_*` client
values, `FIREBASE_SERVICE_ACCOUNT_JSON` or Application Default Credentials,
`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `SENDGRID_API_KEY`,
`SENDER_EMAIL`, and the source-spelled `RECIEVER_EMAIL`. Secret values must
remain outside Git.

The tracked `apps/website/vercel.json` disables automatic production aliasing,
but it does not change the provider-side binding. The canonical production
project is `tenacity-tutoring-tqi9`; the similarly named
`tenacity-tutoring` project has Vercel aliases only. Do not rebind either before
the reviewed cutover.

## Validation commands

Run the checks for every affected area. Emulator checks also require the
Firebase CLI and its emulator prerequisites.

| Area | Commands |
| --- | --- |
| CI controls | From the root: `node --test scripts/ci/test/*.test.mjs`; `node scripts/ci/check-functions-inventory.mjs`; `node scripts/ci/validate-firebase-config.mjs` |
| Mobile | From `apps/mobile`: `dart format --output=none --set-exit-if-changed lib test`; `flutter analyze --no-fatal-infos`; `flutter test`; `flutter build web` |
| Admin portal | From the root: `npm --prefix apps/admin-portal test`; `node --test apps/admin-portal/test/enrolmentEditPayload.test.mjs`; `npm --prefix apps/admin-portal run build`; `npm --prefix apps/admin-portal run test:rules` when rules are affected |
| Firebase Functions | From the root: `npm --prefix backend/firebase/functions test`; `npm --prefix backend/firebase/functions run smoke`; `npm --prefix backend/firebase/functions run test:emulator` when integration behavior is affected |
| Public website | From `apps/website`: `yarn lint`; `yarn build` |

The portal currently has no lint script. The website currently has no automated
test script. Preserve those facts during the structural migration; tooling
changes belong in separate reviewed work.

## Contribution and ownership

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing shared platform paths.
Ownership is declared in [`.github/CODEOWNERS`](.github/CODEOWNERS), and every
change to `main` is PR-only by repository policy.

On the current GitHub plan, CODEOWNERS is ownership documentation only. GitHub
automatic review requests and required code-owner review become available only
after private-repository protection is supported and this file exists on the
pull request's base branch.

The repository uses GitHub Pro with solo Stage A protection enforced on
`main`, and the protected `tenacity-staging` environment restricts deployments
to protected branches. Staging authentication is keyless workload identity
federation; no service-account key exists, and the organization policy forbids
creating one. Independent review is deferred until a second maintainer exists.
The active settings and gates are recorded in the
[branch-protection runbook](docs/operations/github-branch-protection.md) and
[deployment-control runbook](docs/operations/production-deployment-controls.md).

## Migration safety rules

- Keep structural moves separate from behavior and schema changes.
- Run local Firebase validation commands from the repository root with the
  reviewed root manifest.
- Any authorized Hosting deploy must use the guarded admin Hosting workflow,
  which targets `hosting:admin-portal`; never use a bare Hosting deploy.
- Do not use `firebase deploy --force` during the migration.
- Preserve `generateXeroAuthUrl` and `xeroOAuthCallback`; their source is not in
  the managed portal export set.
- Keep application readers tolerant and data changes additive until released
  clients have adopted a new contract.
- Treat the original repositories and the three pre-monorepo tags as rollback
  references until the archive gate is passed.
