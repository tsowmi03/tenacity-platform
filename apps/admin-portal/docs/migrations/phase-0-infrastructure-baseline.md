# Phase 0 infrastructure baseline

Captured: 21 July 2026 (Australia/Sydney)

This record captures the production infrastructure state that the Tenacity
platform monorepo must preserve. It intentionally records secret names and
access boundaries, never secret values.

## Source checkpoints

| Source | Baseline ref | Commit |
| --- | --- | --- |
| Mobile | `redesign-v3` | `1b2019d` |
| Portal | `migration/phase-0-source-sync` | `efe845b` before this record |
| Website | `migration/phase-0-website-baseline` | `fd1c5a3` |

The empty private destination is
`https://github.com/tsowmi03/tenacity-platform`. No rewritten history has been
uploaded yet.

## Firebase

- Project: `tenacity-tutoring-b8eb2`
- Region: all inspected Functions are in `us-central1`.
- Live Functions: 87 total.
  - 83 portal-managed deployable endpoints.
  - Two Functions managed by the Algolia extension.
  - Two protected legacy Xero resources, `generateXeroAuthUrl` and
    `xeroOAuthCallback`, reported as first-generation Node.js 18 `UNKNOWN`.
- Generation and runtime inventory:
  - 84 second-generation and three first-generation Functions.
  - 83 Node.js 22, two Node.js 20, and two Node.js 18 resources.
- The 83 portal-managed endpoint names exactly matched the local deployable
  export set. The canonical sorted local endpoint-name hash was
  `0c873f43bf336f4f96283c35d34177fd851132c5f226503d55d6ed2a991c4c20`.

### Rules

The intended source rules passed all 16 Firestore and Storage emulator tests
before release. Firebase release read-back then confirmed exact source matches.

| Rules surface | Previous ruleset | Phase 0 ruleset | Source match |
| --- | --- | --- | --- |
| Firestore | `29dc58a6-2314-4cf5-ad77-dbc30861631a` | `b7bbc0f2-983c-45a4-9c24-9893106be127` | Yes |
| Storage | `d28e88a0-fdbb-4ddf-98a4-2cab444f1f6d` | `7d7835b7-3e02-4650-88fa-64f6f468eb66` | Yes |

The Phase 0 release applies the already-tested source contract:

- staff can read `resourceJobs`;
- resource uploads are restricted to the owning staff user; and
- generated resource output is readable by staff only.

The rules release is independent of the structural monorepo cutover and can be
rolled back through Firebase ruleset history if required.

### Firestore indexes

- Composite indexes: 27 in source and 27 live.
- Source-only definitions: zero.
- Live-only definitions: zero.
- Field overrides: one in source and one live for the attendance date field.
- The three definitions added to source during Phase 0 cover:
  - `adminAuditLogs` by actor role and creation time;
  - resource suggestions by subject, resource type, status, extracted topic,
    and creation time; and
  - terms by descending year and term number.

The synchronized index manifest deployed without an index deletion prompt.

### Hosting and extensions

- Firebase Hosting site: `tenacity-tutoring-b8eb2`.
- Active version at capture: `d267cc1307f08045`, created 7 July 2026.
- Active custom domain: `admin.tenacitytutoring.com`.
- The release contains a wildcard rewrite to `/index.html` and 19 files.
- The portal `main` source owns `/reset_password.html` but did not own
  `/terms.html` at capture time.
- Google Play uses `https://www.tenacitytutoring.com` as the support website
  and `https://tenacity-tutoring-b8eb2.web.app/terms.html` as its legal link.
  A live request to that legal URL returned the admin portal shell because the
  missing static page fell through the wildcard rewrite. The Phase 0 portal
  branch restores the existing mobile terms page at the same URL before the
  baseline merge.
- Active extension: `algolia/firestore-algolia-search` version `1.2.10`.

Do not let the root Firebase manifest deploy Hosting through an unnamed default
target. The monorepo must use an explicit portal target, and the legal/support
routes must be resolved before changing Hosting ownership.

### Secrets, parameters, schedules, and deployment identity

Secret names present at capture:

- `ANTHROPIC_API_KEY`
- `SENDGRID_API_KEY`
- `STRIPE_KEY`
- `STRIPE_TEST_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `XERO_CLIENT_ID`
- `XERO_CLIENT_SECRET`
- `XERO_TEST_CLIENT_ID`
- `XERO_TEST_CLIENT_SECRET`
- the Algolia extension secret

Enabled scheduled Functions:

- `invoiceReminderScheduler`
- `recoverStuckResourceJobs`
- `rolloverTermData`
- `dailyLessonAndShiftReminder`

Remote Config was at version 14 and contained these parameter names:

- `one_off_class_price`
- `stripe_publishable_key`
- `terms_changelog`
- `terms_content`
- `terms_title`
- `terms_version`

The existing GitHub deployment identity is
`github-action-924100352@tenacity-tutoring-b8eb2.iam.gserviceaccount.com`.
Its inspected roles cover Cloud Functions development, Firebase Auth
administration, Firebase Hosting administration, Cloud Run viewing, and
required service usage. Reuse or replace this identity deliberately during CI
cutover; do not broaden it as part of the history import.

## Vercel

- Authenticated user at capture: `admin-9111`.
- Team scope: `tenacity-tutoring` (`Tenacity Tutoring`).
- Both Tenacity projects are linked to GitHub repository ID `1079285124`,
  `tsowmi03/tenacity-tutoring`, with production branch `main`.

### Project comparison

| Setting | `tenacity-tutoring` | `tenacity-tutoring-tqi9` |
| --- | --- | --- |
| Project ID | `prj_nOwrQ9sfkzQIF6BiF0WN2TVN96zK` | `prj_MVZzGI3naoD9yo9IrMbWQeChOWhk` |
| Framework | Other | Next.js |
| Root directory | `.` | `.` |
| Node.js | 22.x | 22.x |
| Build command | Framework default | `npm run build` or `next build` default |
| Install command | Package-manager default | Package-manager default |
| Environment variables | None | Nine named variables |
| Custom production domains | None | `tenacitytutoring.com`, `www.tenacitytutoring.com` |
| Vercel domain | `tenacity-tutoring.vercel.app` | `tenacity-tutoring-tqi9.vercel.app` |

The apex `tenacitytutoring.com` redirects to `www.tenacitytutoring.com`. Both
custom domains are verified.

The canonical production website project is `tenacity-tutoring-tqi9`. The
duplicate `tenacity-tutoring` project receives deployments from the same Git
repository but has no custom domain and no environment variables. Do not bind
the monorepo to both projects. Confirm retirement of the duplicate as a
separate post-cutover change rather than deleting it during migration.

### Environment variable names

Only `tenacity-tutoring-tqi9` had project environment variables:

| Name | Targets | Type |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Preview, production | Encrypted |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Development, preview, production | Encrypted |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Development, preview, production | Encrypted |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Development, preview, production | Encrypted |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Development, preview, production | Encrypted |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Development, preview, production | Encrypted |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Development, preview, production | Encrypted |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Preview, production | Sensitive |
| `TURNSTILE_SECRET_KEY` | Preview, production | Sensitive |

No values were retrieved or stored.

### Production deployments

Both projects last deployed production from website commit
`8a80c404a5a5aa73a5e4cccc7ddcd7325bec764f` on 22 June 2026.

| Project | Deployment | Status | Production aliases |
| --- | --- | --- | --- |
| `tenacity-tutoring` | `dpl_H47jUwxX3KnowCuXH2Ewh9v23MwJ` | Ready | Vercel aliases only |
| `tenacity-tutoring-tqi9` | `dpl_Ar5yFvGN68pyk5QEbLSALcrMSGfR` | Ready | `www.tenacitytutoring.com`, apex, and Vercel aliases |

Draft website PR 2 produced successful preview checks from both projects. This
confirms both Git integrations are still active at capture time.

## Cutover invariants

- The source-to-live Function name set must remain unchanged.
- The two legacy Xero resources and two extension resources remain outside the
  managed portal export set.
- Firestore and Storage rules must compile and match their reviewed source.
- An index deploy must not propose unexpected deletion.
- Firebase Hosting must use an explicit portal target.
- The store-linked `/terms.html` route must return the static legal page rather
  than the admin portal shell before tagging the portal baseline.
- Vercel must rebind only the canonical `tenacity-tutoring-tqi9` project to
  `apps/website` in the monorepo.
- Provider rebinds and old-repository deploy-trigger shutdown happen only in
  the controlled cutover window.
