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
| 2026-07-25 | [Parent timetable on the V3 design](#2026-07-25--parent-timetable-on-the-v3-design) |
| 2026-07-25 | [Parent dashboard on the V3 design](#2026-07-25--parent-dashboard-on-the-v3-design) |
| 2026-07-25 | [Mobile V3 design system and navigation shell](#2026-07-25--mobile-v3-design-system-and-navigation-shell) |
| 2026-07-25 | [Land the mobile V3 redesign foundation](#2026-07-25--land-the-mobile-v3-redesign-foundation) |
| 2026-07-24 | [Disconnect automatic Xero payment sync](#2026-07-24--disconnect-automatic-xero-payment-sync) |
| 2026-07-24 | [Phase 4 no-op production cutover complete](#2026-07-24--phase-4-no-op-production-cutover-complete) |
| 2026-07-22 | [Activate production workflows (arming disabled)](#2026-07-22--activate-production-workflows-arming-disabled) |
| 2026-07-22 | [Production environment and no-op client config](#2026-07-22--production-environment-and-no-op-client-config) |
| 2026-07-22 | [Provision production federation resources](#2026-07-22--provision-production-federation-resources) |
| 2026-07-22 | [Migrate production templates to federated auth](#2026-07-22--migrate-production-templates-to-federated-auth) |
| 2026-07-22 | [Staging bootstrap and full rehearsal matrix](#2026-07-22--staging-bootstrap-and-full-rehearsal-matrix) |
| 2026-07-22 | [Stage A protection and staging workflow activation](#2026-07-22--stage-a-protection-and-staging-workflow-activation) |
| 2026-07-22 | [Staging foundation and activation preparation](#2026-07-22--staging-foundation-and-activation-preparation) |
| 2026-07-22 | [Phase 3 handoff refresh](#2026-07-22--phase-3-handoff-refresh) |
| 2026-07-21 | [Phase 3 Rules and index safeguards](#2026-07-21--phase-3-rules-and-index-safeguards) |
| 2026-07-21 | [Phase 3 CI and deployment controls](#2026-07-21--phase-3-ci-and-deployment-controls) |
| 2026-07-21 | [Phase 2 Firebase extraction](#2026-07-21--phase-2-firebase-extraction) |
| 2026-07-21 | [Phase 0–1 history import and hardening](#2026-07-21--phase-01-history-import-and-hardening) |

---

## 2026-07-25 — Parent timetable on the V3 design

**What changed:**

- Built the parent timetable (`lib/src/ui/timetable/parent/`) against the
  reference design: a per-child filter and week pager in the navy header, a
  Monday-to-Sunday strip that dots the days with classes, and the week's
  bookings grouped by day with confirmed, one-off and cancelled states.
- Added the components it needed to the shared library — a segmented filter, a
  week strip and week pager, a timetable row with a coloured leading edge, and
  a dashed action button — so the tutor and admin timetables can reuse them.
- Left every booking flow exactly where it was. `TimetableScreen` renders the
  new view for parents and routes each session tap straight into the existing
  options dialog, so swap, notify-absence, one-off booking and waitlist
  behaviour is unchanged rather than reimplemented against a 3,932-line file.

**A behaviour gap the design would have introduced.** The reference timetable
lists only classes a family has already booked, but the current screen also
lists every class they could join, and that is how parents enrol. Shipping the
design as drawn would have removed the only route to booking. Browsing now sits
behind the design's own "Book a one-off class" button, which opens the legacy
layout as a pushed screen. That surface keeps the eligibility, capacity and
waitlist rules intact and is recorded as a temporary exception under P02/S07 —
it has not been redesigned.

**Inspected on device with real bookings.** The header, week pager, week strip
and its day dots, day groups, session rows and the booking route all render
correctly, and the empty and day-filtered states behave.

**One defect found and fixed while inspecting.** Comparing a live session
against the options dialog it opens showed the two disagreed about what counts
as a one-off. The timetable treated a session as one-off when *any* attending
child was off the class roster; the dialog does so only when *no* child of that
family is on it. A family with one child permanently enrolled and another
visiting for the week would have seen a ONE-OFF pill sitting above the
permanent swap and enrol actions. The timetable now mirrors the dialog, and
judges status against the whole family so the per-child filter cannot flip it
either. Both cases are regression-tested.

**Status:** In progress on `feat/mobile/v3-foundation`. Passes the CI Mobile
job locally: format clean, `flutter analyze` with 85 informational findings and
no errors or warnings, 148 tests passing (up from 110). New coverage is 19 data
tests and 19 widget tests across three viewports and text scale 1.3.

**Next steps**

- Redesign the browse surface so the legacy exception can be removed.
- P03 (messages) and P04 (invoices) complete the parent experience.

---

## 2026-07-25 — Parent dashboard on the V3 design

**What changed:**

- Built the parent dashboard (`lib/src/ui/dashboard/parent/`) against the
  reference design: a navy header with classes-this-week, unread-messages and
  amount-due metrics, today's classes, a "needs attention" list carrying the
  next unpaid invoice and the newest unread announcement, the most recent
  progress note as a pull quote, and shortcuts to book a one-off class or
  message a tutor. It is composed entirely from the shared component library —
  no new one-off styling.
- Split it into a pure data adapter and a presentational view, the same shape
  as the tutor dashboard, so the whole screen is testable without Firestore.
- Moved the greeting, duration, relative-date, currency and class-type
  formatting into `dashboard_formatting.dart`, shared with the tutor dashboard
  rather than duplicated.
- Added `InvoiceController.fetchInvoicesForParent`. The existing method sets up
  a live stream, which a screen that stays open wants but a dashboard load
  cannot await — reading the list straight after subscribing raced the first
  emission and usually saw nothing.
- Routed parents to the new dashboard. Admin still renders the legacy one.

**Decisions recorded:**

- **Parents keep five tabs.** The reference design gives them four and surfaces
  announcements only as a dashboard row. Rejected: families need to browse
  announcements directly, not just catch whichever one happens to be newest.
  The dashboard row is additive, and it reads the same read-state as the tab
  badge so the two cannot disagree.
- **Feedback attribution uses the existing subject field.** Feedback documents
  still carry no class reference, so a note is attributed as
  `Jordan Lee · Year 9 Maths` from the tutor name and the free-text subject. No
  schema change was needed, and a class reference can supersede it later.

**Why:** Parents are the largest group of users and the commercial surface of
the app, so they were sequenced first. The dashboard is also the screen that
proves the component library works for a second role.

**Status:** In progress on `feat/mobile/v3-foundation`. Passes the CI Mobile
job locally: format clean, `flutter analyze` with 85 informational findings and
no errors or warnings, 108 tests passing (up from 70), `flutter build web`
succeeding. New coverage is 21 data tests and 17 widget tests, the latter
across 320/402/430-wide viewports and at text scale 1.3.

**Verified on device.** Run signed in as a parent on an iPhone 16 Pro, whose
viewport is the same 402x874 the designs were drawn at. Header, metric strip,
content sheet, section labels, empty next-class row, attention list, feedback
quote, quick actions and the five-tab bar all match the reference. This also
settles an earlier doubt: both fonts that had rendered as block glyphs in a
golden-image trial render correctly on device, so that was a test-harness
artifact and no golden baseline was committed. The dashboard's announcement row
and the Notices tab badge were seen agreeing, which was the argument for
keeping five tabs.

**Two defects the widget tests had missed**, both found only by looking at the
real screen with real data, and both now regression-tested:

- The three metric tiles each took their own height, so once the first two
  labels wrapped to two lines the shorter third tile floated centred against
  them. The tests only had fixtures where every label wrapped.
- The latest-feedback card sized to its content, so a one-word note shrank it
  to a fraction of the sheet width. The test fixture used a full sentence.

**Next steps**

- P04 needs the card brand and last4 on the payment record before invoice
  history can show `Visa ····4242`. Still gated on the post-cutover stability
  window.
- P02, the parent timetable, is next and is the largest risk in this phase: the
  behaviour lives in a 3,932-line `timetable_screen.dart` shared by all three
  roles, so the parent presentation should be extracted incrementally rather
  than that file rewritten.

---

## 2026-07-25 — Mobile V3 design system and navigation shell

**What changed:**

- Extended `design_tokens.dart` with semantic status colours, a spacing scale,
  control sizes, motion durations, and the sheet radius and shadow, then added
  `app_theme.dart` to map them onto `ThemeData`. The app previously themed
  itself from `ColorScheme.fromSeed` on a single blue, so Material's own
  defaults showed through anywhere a screen had not hardcoded a brand colour.
- Added a shared component library at `lib/src/ui/components/` — header,
  content sheet, section label, metric tile, ledger row, attention list, status
  pill, pill button, quick-action tile and grid, empty/error/skeleton surfaces,
  and the bottom navigation bar. These were extracted from the private widgets
  inside the tutor dashboard rather than written fresh, and the tutor
  dashboard's existing tests still pass unchanged against them.
- Replaced the bottom navigation's per-role integer index maps with typed
  destinations (`home_navigation.dart`), added a `DashboardRouter` that selects
  a dashboard by role, and made profile a pushed route rather than a tab.
- Removed the `role == 'tutor'` styling conditionals from `home_screen.dart`;
  one styled bar now serves all three roles.

**Why:** Every screen in the redesign is built from the same small set of
repeating parts. Extracting them once, and fixing the navigation shell before
any screen depends on it, avoids re-deriving both fifteen more times.

**Two latent navigation defects removed on the way.** Neither could fire in
production today, but both were correct by coincidence rather than by
construction, and either would have become a real bug on the next change:

- The destination maps sent `profile` to index 5 for both parents and tutors,
  each of which had only five screens. That would have thrown a range error,
  but nothing ever passed the profile destination, so it was unreachable.
- `notification_service.dart` handled invoice reminders with `selectTab(4)`.
  Index 4 is Invoices for a parent but Messages for a tutor or admin. It worked
  only because `invoice_notifications.js` sends that notification type solely
  to parent tokens — retargeting it, or adding a tab, would have broken it.

Both now resolve by name, and a destination a role does not have is a no-op.

**Status:** In progress on `feat/mobile/v3-foundation`. Passes the CI Mobile
job locally: `dart format` clean, `flutter analyze` with 85 informational
findings and no errors or warnings (down from the 87 baseline, having fixed two
pre-existing async-context findings), 70 tests passing (up from 34), and
`flutter build web` succeeding. Parent and admin dashboards still render the
legacy design behind the new router.

**Next steps**

- Build the parent experience (P01–P04), starting with the dashboard.
- Decide whether parents keep an Announcements tab. The reference design gives
  them four tabs and moves announcements onto the dashboard; the live app has
  five. The tab is kept until the redesigned parent dashboard can carry the
  entry point and its unread badge.
- Add search fields, filter controls, and the week/date strip to the component
  library when P02 needs them.

---

## 2026-07-25 — Land the mobile V3 redesign foundation

**What changed:**

- Re-applied the stalled `redesign-v3` work onto current `main` as
  `feat/mobile/v3-foundation`. The 23 changed files are confined to
  `apps/mobile` and do not overlap anything `main` changed since the
  merge-base, so the patch applied with no conflicts. This brings in the brand
  tokens (`lib/src/ui/theme/design_tokens.dart`), the bundled Bricolage
  Grotesque / Plus Jakarta Sans / Newsreader fonts and OFL licence, the white
  vertical logo, and the tutor dashboard (`lib/src/ui/dashboard/`) with its two
  test files.
- Re-sequenced `apps/mobile/V3_REDESIGN_ROADMAP.md` to deliver **parent first**,
  then tutor, then admin — the reverse of the original tutor-first order — and
  recorded that backend contracts are in scope rather than deferred.
- Removed `apps/mobile/TENACITY_PLATFORM_MONOREPO_MIGRATION_PLAN.md`. The
  migration it describes completed with the Phase 4 cutover on 24 July, and the
  records under `docs/migrations/` supersede it.
- Moved `ADR-001 Monorepo and backend ownership` from `apps/mobile/docs/` to
  `docs/architecture/`. It is a platform-wide decision and had no equivalent at
  the repository root.
- Added two newly confirmed data gaps to the roadmap's contract table: the
  payment record stores no card brand or last4 (the design shows these in
  invoice history), and feedback documents have no class or session reference
  (the parent dashboard attributes a feedback quote to a class).

**Why:** The redesign had stalled on a branch that was 26 commits behind `main`,
with a second copy in the old `tsowmi03/Tenacity` repo. Neither could be built
on. Landing it on current `main` gives the redesign one home and a working
baseline, and re-sequencing puts the largest audience — parents — first.

**Status:** In progress. The foundation is on `feat/mobile/v3-foundation` and
passes the full CI Mobile job locally: `dart format` clean across 104 files,
`flutter analyze` with 87 informational findings and no errors or warnings
(these are the pre-existing findings already tracked as backlog item 5), all 34
tests passing, and `flutter build web` succeeding. No screen has been
redesigned yet.

**Next steps**

- Settle mobile release ownership before any redesigned screen ships. Store
  releases still come from `tsowmi03/Tenacity`, so work landing here currently
  has no path to users.
- Build the shared component library and fix the role navigation shell. The
  destination maps in `home_screen.dart` send `profile` to index 5 for both
  parent and tutor against 5-element screen lists, so that destination throws
  if reached.
- Confirm the post-cutover stability window before starting the two parent
  schema changes; `docs/migrations/current-status-and-handoff-2026.md` gates
  product and schema migrations on it.

---

## 2026-07-24 — Disconnect automatic Xero payment sync

**What changed:**

- Added a code-default-OFF feature flag `XERO_PAYMENT_SYNC`
  (`backend/firebase/functions/lib/xero_sync_flag.js`) and guarded
  `markInvoicePaidInXero` on it. While off, a payment made in the app is
  recorded in Firestore as before but is no longer pushed to Xero — the
  guard sits at the single function so it covers all four call paths (both
  Stripe webhook branches, the already-paid one-off booking case, and the
  `onInvoiceStatusChanged` trigger that fires on manual admin edits).
- On the skip path the invoice is stamped `xeroPaymentSyncStatus: "manual"`
  (best-effort) so the payments handled by hand during this window can be
  identified later.
- Added `onInvoicePaidNotifyAdmins`, an `onDocumentUpdated` trigger on
  `invoices/{invoiceId}` that fires when status flips to `paid` and notifies
  admins by FCM push and by email to `admin@tenacitytutoring.com`. It hangs
  off the invoice doc (not the Stripe webhook) so it catches every paid path,
  and it is permanent — while the sync is off the copy tells the admin to
  enter the payment in Xero manually; once reconnected that wording drops.
- Reworded the now-inverted admin warning in `updateInvoice.js` (marking a
  Xero-synced invoice paid will NOT reach Xero) and added unit tests for the
  new notification helpers.
- Invoice *creation* → Xero is untouched: new invoices are still pushed to and
  emailed from Xero.

**Why:** Tom wants payments marked off in Xero by hand for now, while keeping
the in-app paid state and giving admins a prompt to action it.

**Status:** In progress — implemented on branch
`feat/disconnect-xero-payment-sync`, all 573 unit tests pass; not yet
committed or deployed.

**Next steps**

- Deploy the affected functions (they all bundle `markInvoicePaidInXero`):
  `firebase deploy --only functions:stripeWebhook,functions:onInvoiceCreated,functions:onInvoiceStatusChanged,functions:onInvoicePaidNotifyAdmins`.
- Before ever re-enabling (`XERO_PAYMENT_SYNC=true`), fix the pre-existing
  double-payment bug (see Open items) or reconnecting will resume
  double-recording payments in Xero.

---

## 2026-07-24 — Phase 4 no-op production cutover complete

**What changed:**

- Deployed all five Firebase and Vercel production surfaces from this monorepo
  for the first time, in a recorded arming window: Firestore indexes
  (run 29907295581), Rules (29908639248), admin portal Hosting (29910053168),
  the public website on Vercel (30054268981), and Functions (30058129547).
  Each was armed, dispatched with its typed confirmation, verified, and the
  arming variable returned to `false`.
- Verified the no-op: the live Function inventory came back at 87, identical to
  the pre-cutover baseline; the index diff was empty; Rules source equality
  held; Hosting and Vercel both promoted and passed live smoke tests.
- Fixed four real defects surfaced only by running against production, none of
  which staging could have caught (three of the five surfaces were never
  rehearsed):
  - `firebase-admin` 12.7.0 cannot parse the federated `external_account`
    credential file, breaking Function export introspection
    ([PR #21](https://github.com/tsowmi03/tenacity-platform/pull/21));
  - the Vercel deploy passed `--cwd apps/website` while the project's Root
    Directory was also `apps/website`, doubling the path
    ([PR #22](https://github.com/tsowmi03/tenacity-platform/pull/22));
  - the Functions identity lacked Secret Manager metadata access, then Firestore
    database metadata access, resolved by adding only the named permissions;
  - the Firestore Admin database call checks `datastore.databases.getMetadata`,
    not `datastore.databases.get` — diagnosed by comparing against the indexes
    identity, which already read the same database successfully.
- Recorded the completed permission set, the concurrency-group lesson, and the
  updated production boundary across the handoff and production runbook.

**Why:** This is the step that makes the monorepo the real production
deployment source rather than just holding the code.

**Status:** Live. All five surfaces deploy from this repository; arming is
`false`. Every failure during the cutover aborted before mutating a provider,
so nothing was ever partially deployed. Mobile releases were never in Phase 4
scope and still ship from `tsowmi03/Tenacity`.

**Next steps:**

- Keep `tsowmi03/tenacity-web-portal` and `tsowmi03/tenacity-tutoring`
  available: the archive gate needs two stable monorepo production deployments
  and this was the first.
- Dispatch one surface at a time in future windows. The shared non-cancelling
  `tenacity-production` concurrency group caused GitHub to cancel three queued
  runs when several were dispatched together.
- Consider a staging Functions rehearsal before relying on that path for a real
  change; its role set was derived by iterating against production.

---

## 2026-07-22 — Activate production workflows (arming disabled)

**What changed:**

- Moved the six production workflows (`functions`, `hosting`, `indexes`,
  `rules`, `rules-rollback`, `vercel`) from `docs/operations/workflow-templates/`
  into `.github/workflows/`, making them discoverable and manually
  dispatchable. Flipped each header from inert to
  `# ACTIVE PRODUCTION WORKFLOW`.
- Added a required `authorization_record` input to every workflow, validated as
  a positive integer in the reject step, so each dispatch is tied to the cutover
  execution record issue.
- Updated `production-workflow-templates.test.mjs` to assert the new location,
  the active header, manual-dispatch-only triggers, and the
  `authorization_record` input/validation; refreshed the runbook, handoff, and
  staging runbook to describe the active-but-arming-disabled boundary and the
  updated stop conditions.

**Why:** This is the activation step of the two-record model — the workflows
must be discoverable to be dispatchable, but arming stays `false` so no
deployment can run until a separately recorded cutover window sets
`TENACITY_PRODUCTION_DEPLOYS_ENABLED=true`.

**Status:** In progress — opened as a **draft** PR. `TENACITY_PRODUCTION_DEPLOYS_ENABLED`
is `false`; merging makes the workflows dispatchable but arms nothing. Per the
two-record model, the reviewed-head SHA is added to readiness record #17 and the
record moved to `ready` only when the PR reaches its final head, before merge.

**Next steps:**

- Move readiness record #17 to `ready` with the final head SHA and validation
  run, merge with arming `false`, then create the `ready-to-arm` cutover
  execution record and run Phase 4 (no-op deploys) in a recorded window.

---

## 2026-07-22 — Production environment and no-op client config

**What changed:**

- Created the `tenacity-production` GitHub environment (protected `main` only)
  with its ten non-secret variables and `TENACITY_PRODUCTION_DEPLOYS_ENABLED=false`,
  via the reviewed, `RUN`-gated `scripts/ci/provision-production-environment.sh`.
  Secrets are set separately by the operator; the script never handles them.
- Verified the current production admin portal's actual build config from its
  deployed bundle. It ships only three populated `VITE_FIREBASE_*` values —
  `API_KEY` (a custom browser key, not the Firebase-canonical one),
  `AUTH_DOMAIN`, `PROJECT_ID` — and leaves `STORAGE_BUCKET`,
  `MESSAGING_SENDER_ID`, and `APP_ID` empty.
- To keep Phase 4 a true no-op, relaxed the hosting production template so it no
  longer requires those three non-empty, documented the exact secret set and
  the custom-key rationale in the production runbook, and added a template test
  asserting the three empties are tolerated while the three populated values
  stay checked.

**Why:** A no-op cutover must reproduce the live client config exactly. The old
build's empty values and custom API key would otherwise conflict with the new
template's stricter assertions, or silently change the deployed config.

**Status:** Live (environment) / merged-pending (template + docs on a PR). The
environment arming stays `false`; nothing is deployed. Populating the three
empty values or adopting the canonical key is deferred to a post-cutover change.

**Next steps:**

- Operator sets the three populated `VITE_FIREBASE_*` secrets plus
  `VERCEL_TOKEN`, initializes the `preparing` readiness record, and rebinds
  Vercel project `tenacity-tutoring-tqi9` to root `apps/website`.

---

## 2026-07-22 — Provision production federation resources

**What changed:**

- Created the keyless workload-identity-federation resources the migrated
  Firebase production templates reference, in the production project
  `tenacity-tutoring-b8eb2` (number `398065992407`): the `github` pool, the
  `tenacity-platform` OIDC provider (issuer
  `token.actions.githubusercontent.com`, condition
  `assertion.repository == 'tsowmi03/tenacity-platform'`, `attribute.environment`
  mapping — mirroring staging exactly), two custom single-permission roles
  (`tenacityProductionProjectGet`, `tenacityProductionRulesetTest`), and four
  least-privilege service accounts (`tenacity-production-{rules,indexes,
  functions,hosting}`). Each identity's `roles/iam.workloadIdentityUser`
  impersonation is bound only to the `tenacity-production` GitHub environment
  (subject principal plus `attribute.environment` principal set).
- Added the reviewed, `RUN`-gated provisioning script
  `scripts/firebase/provision-production-federation.sh` and recorded the
  completed gate in the production runbook, handoff, and staging runbook.

**Why:** These resources are the first production-control preparation gate;
the migrated templates cannot authenticate without them, and the organization
policy blocks the key-based alternative.

**Status:** Live. Provider is ACTIVE and all bindings verified read-only. The
rules and indexes role sets mirror the staging-proven model; the functions and
hosting role sets are provisional and will need the
add-only-the-named-missing-permission loop on their first activated run.
Nothing is armed and no workflow moved into `.github/workflows/`.

**Next steps:**

- Create the `tenacity-production` GitHub environment (protected `main` only)
  with `TENACITY_PRODUCTION_DEPLOYS_ENABLED=false` and the scoped
  variables/secrets, initialize the `preparing` readiness record, and rebind
  Vercel project `tenacity-tutoring-tqi9` to root `apps/website`.

---

## 2026-07-22 — Migrate production templates to federated auth

**What changed:**

- Rewrote the five inert Firebase production workflow templates
  (`functions`, `hosting`, `indexes`, `rules`, `rules-rollback`) under
  `docs/operations/workflow-templates/` to authenticate with keyless workload
  identity federation instead of a `FIREBASE_SERVICE_ACCOUNT_JSON` key secret,
  matching the model the staging rehearsal proved. Each deployment job now
  carries `id-token: write`, mints a short-lived token via the pinned
  `google-github-actions/auth` action against a production-scoped provider
  (project number `398065992407`), threads `GOOGLE_OAUTH_ACCESS_TOKEN` into
  every state-helper call, and cleans up `GOOGLE_GHA_CREDS_PATH`. The four
  surfaces bind four separate least-privilege service accounts.
- Left the Vercel template unchanged: it uses a Vercel platform token, not a
  Google credential.
- Documented the production federation model (pool, provider, four scoped
  service accounts, environment-restricted impersonation) in the production
  deployment runbook, dropped `FIREBASE_SERVICE_ACCOUNT_JSON` from required
  secrets, marked the completed staging/Stage A gates, and refreshed the
  canonical handoff and staging runbook accordingly.
- Added `scripts/ci/test/production-workflow-templates.test.mjs` (14 cases)
  asserting the federated design, per-surface identity isolation, no
  key-based references, and the untouched Vercel token path.

**Why:** The Google Cloud organization blocks service-account key creation, so
the key-based design the production templates previously described could never
run. This is the first production-control preparation gate in the safe
activation sequence; the templates stay inert in `docs/` until the production
federation resources are created under separate authority.

**Status:** Merged via
[PR #14](https://github.com/tsowmi03/tenacity-platform/pull/14) (`1514fbf`);
all checks passed before merge. The templates remain inert. The federation
resources they reference were then provisioned (see the entry above).

---

## 2026-07-22 — Staging bootstrap and full rehearsal matrix

**What changed:**

- Ran the complete Phase 3 staging rehearsal against the real
  `tenacity-tutoring-staging` project through the activated workflows: Rules
  bootstrap, index bootstrap (27 indexes + 1 field override to `READY`),
  Rules no-op, Rules partial failure (deny-all fixture), digest-bound Rules
  rollback restore, and index no-op — all successful with evidence artifacts
  and manifest hashes recorded in the staging runbook.
- Four failed attempts each stopped without touching provider state and
  exposed real defects, now fixed: a federation binding gap (fixed with an
  environment principal-set), the live Firestore Admin API rejecting explicit
  `pageSize` on index listings
  ([PR #11](https://github.com/tsowmi03/tenacity-platform/pull/11)), a
  missing `firebaserules.rulesets.test` permission for index deploys (new
  single-permission custom role), and an unpassable mis-sorted key check in
  the restore gate
  ([PR #12](https://github.com/tsowmi03/tenacity-platform/pull/12)).
- Disarmed `TENACITY_STAGING_REHEARSALS_ENABLED` after the window and
  refreshed the canonical handoff. D05 is closed.

**Why:** The staging rehearsal is the last technical gate before production
activation work; it exists precisely to surface provider-behaviour mismatches
mocked tests cannot, and it did.

**Status:** Complete. Staging ends the day on canonical Rules and fully READY
indexes with source equality proven.

---

## 2026-07-22 — Stage A protection and staging workflow activation

**What changed:**

- Enforced Stage A branch protection on `main` after the GitHub Pro upgrade:
  PR-only (zero approvals, admins included), strict required validation gate,
  linear history, no force pushes or deletions.
- Created the protected `tenacity-staging` GitHub environment (protected
  branches only) with the six reviewed variables and the arming flag `false`.
- Created two least-privilege staging service accounts (Rules and indexes)
  with documented roles and a single-permission custom role instead of the
  data-read-bundling `firebase.viewer`.
- The Google Cloud org forbids service-account keys, so the planned key-based
  workflow credentials were replaced with keyless workload identity
  federation: a GitHub OIDC pool/provider restricted to this repository, with
  impersonation bound to the exact `tenacity-staging` environment subject.
- Reworked the three staging rehearsal workflows for federated auth, added a
  token path to the Firebase state helpers, and activated the workflows by
  moving them into `.github/workflows/`. Production templates stay inert and
  must be migrated to federated auth before their own activation.

**Why:** These were the remaining gates between the merged staging
preparation and the actual staging bootstrap/rehearsal. The federation switch
was forced by the org's key-creation ban and is strictly better security: no
long-lived credential exists anywhere.

**Status:** Merged via
[PR #10](https://github.com/tsowmi03/tenacity-platform/pull/10) (`fc27928`);
all ten checks passed before merge.

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
follow-on activation and rehearsal work is covered by the two entries above.

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

1. **Production template federation migration** — the six inert production
   templates still describe key-based credentials; the org key-creation ban
   means they must move to workload identity federation (production-scoped
   binding) before production activation.
2. **Vercel rebind** — point only project `tenacity-tutoring-tqi9` at
   `apps/website`; leave the duplicate `tenacity-tutoring` project untouched.
3. **Phase 4 no-op cutover, then Phase 5 shared contracts** — after all
   activation gates close.
4. **Rotate legacy credentials** — the old `tenacity-tutoring-2` Function
   metadata exposed plaintext Stripe test and SendGrid credentials; rotate
   both (separate from migration work).
5. **Inherited advisories** — dependency advisories, two website Hooks
   warnings, and 87 Flutter informational findings remain separate
   remediation work.
6. **Xero double-payment on paid sync** — for a single Stripe payment,
   `markInvoicePaidInXero` fires twice (directly from `stripe_webhooks.js`
   and again via the `onInvoiceStatusChanged` trigger, since the invoice is
   set to `paid` just before), and `xero_functions.js` explicitly skips the
   duplicate check. Xero may hold duplicate payments against invoices. Must
   be fixed before re-enabling `XERO_PAYMENT_SYNC`; while the flag is off the
   bug is dormant. Check Xero for existing overpaid invoices.

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
