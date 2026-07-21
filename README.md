# Tenacity platform

This private monorepo contains the Tenacity Tutoring mobile app, admin portal,
public website, and the platform-owned Firebase source.

## Migration status

The history import completed on 21 July 2026. The imported histories are under
`apps/`, and all 672 commits mapped during the import are reachable from the
published main, feature, tag, or archive refs. See the
[import record](docs/migrations/monorepo-import-2026.md) for the exact mapping
and verification evidence. The
[Phase 1 hardening record](docs/migrations/phase-1-hardening-2026.md) records
the imported-path validation and remaining external gates. The
[Phase 2 extraction record](docs/migrations/phase-2-firebase-extraction-2026.md)
tracks the behavior-preserving Firebase move.

> This repository is not yet a production deployment source. Until the
> reviewed no-op cutover, do not deploy Firebase, move a deployment workflow to
> the root, or rebind Vercel from this repository.

Production ownership remains with the original repositories:

| Surface | Current production owner |
| --- | --- |
| Mobile and store releases | [`tsowmi03/Tenacity`](https://github.com/tsowmi03/Tenacity) |
| Cloud Functions, Firebase rules and indexes, and admin Hosting | [`tsowmi03/tenacity-web-portal`](https://github.com/tsowmi03/tenacity-web-portal) |
| Public website and Vercel | [`tsowmi03/tenacity-tutoring`](https://github.com/tsowmi03/tenacity-tutoring) |

There is deliberately no root deployment workflow. The imported portal
workflows remain nested under `apps/admin-portal/.github/workflows/`, where
GitHub does not discover or run them in this repository.

The root `firebase.json` is the only deployable Firebase manifest. It maps the
existing Hosting site to the explicit `admin-portal` target. The root
`.firebaserc` selects the production project, so its presence does not make
this repository an approved deployment source. `apps/mobile/firebase.json`
contains FlutterFire client metadata only.

## Current repository layout

| Path | Contents | Runtime and package manager |
| --- | --- | --- |
| `apps/mobile` | Flutter client for parents, tutors, students, and mobile admin workflows | Flutter 3.x, Dart `^3.5.3`, pub |
| `apps/admin-portal` | React/Vite back-office UI | Node.js, npm lockfile |
| `apps/website` | Next.js public website, enrolment flow, and application-specific server routes | Next.js 15, Yarn 1 |
| `backend/firebase` | Functions, rules, indexes, Storage CORS source, and platform operations | Node.js 22 for Functions, npm lockfile |
| `docs/migrations` | Import and cutover records | Markdown |

The following planned paths do not exist yet:

- `contracts`, created after the no-op production cutover; and
- root validation and deployment workflows, created during Phase 3.

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

Vercel binding is provider-side because no `vercel.json` is tracked. The
canonical production project is `tenacity-tutoring-tqi9`; the similarly named
`tenacity-tutoring` project has Vercel aliases only. Do not rebind either before
the reviewed cutover.

## Validation commands

Run the checks for every affected area. Emulator checks also require the
Firebase CLI and its emulator prerequisites.

| Area | Commands |
| --- | --- |
| Mobile | From `apps/mobile`: `dart format --output=none --set-exit-if-changed lib test`; `flutter analyze`; `flutter test`; `flutter build web` |
| Admin portal | From the root: `npm --prefix apps/admin-portal test`; `npm --prefix apps/admin-portal run build`; `npm --prefix apps/admin-portal run test:rules` when rules are affected |
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

Private-repository branch protection is currently unavailable on the GitHub
plan used by this personal repository. The desired settings and activation gate
are recorded in
[the branch-protection runbook](docs/operations/github-branch-protection.md).

## Migration safety rules

- Keep structural moves separate from behavior and schema changes.
- Run local Firebase validation commands from the repository root with the
  reviewed root manifest. Production deployment remains prohibited until the
  reviewed cutover.
- Any future authorized Hosting deploy must target `hosting:admin-portal`;
  never use a bare Hosting deploy.
- Do not use `firebase deploy --force` during the migration.
- Preserve `generateXeroAuthUrl` and `xeroOAuthCallback`; their source is not in
  the managed portal export set.
- Keep application readers tolerant and data changes additive until released
  clients have adopted a new contract.
- Treat the original repositories and the three pre-monorepo tags as rollback
  references until the archive gate is passed.
