# Tenacity Web Admin Portal

Internal web administration portal for Tenacity Tutoring.

> Monorepo path note: canonical Firebase source lives at `backend/firebase`
> from the platform repository root, and this monorepo is the production
> deployment source. Deployment commands and old `backend/functions` paths
> later in this imported document record the pre-extraction repository and
> must not be used. Use the root README and `backend/firebase/README.md` for
> current commands.

This portal moves staff/admin workflows out of the Flutter app. Both
applications live in this monorepo and use the same Firebase project and
Firestore database:

- Firebase project: `tenacity-tutoring-b8eb2`
- Web portal: `apps/admin-portal`
- Flutter app: `apps/mobile`

The Flutter app remains the day-to-day mobile experience for parents, tutors,
and lightweight admin actions. This web portal is the back-office surface for
review, approval, billing, reporting, and operational maintenance.

## Current Portal Functionality

### Authentication

- Staff sign in with Firebase Authentication at `/login`.
- Auth state is managed in `src/AuthProvider.jsx`.
- Protected routes require a signed-in Firebase user.
- Admin routes require a Firebase custom claim:

```text
role: "admin"
```

This application is admin-only. An account without an `admin` claim — a tutor
included — is signed out on this origin before any protected screen renders,
and the login page explains why. This is an application boundary, not a data
boundary: tutor role claims still carry the Firestore and Storage access the
mobile app depends on.

### Teaching resources

Not here. Resource generation is a separate application,
[`apps/resource-portal`](../resource-portal), on its own Hosting site and
custom domain, with its own session. There is no route, link, or redirect from
this application to it, and `/resources` here renders the admin 404.

### Dashboard

Route: `/`

The dashboard currently provides:

- Tenacity-branded admin shell.
- Signed-in user and role display.
- Sign-out action.
- Quick navigation to the enrolment portal.

This is currently a lightweight entry point, not a full reporting dashboard.

### Announcement Readership

Routes: `/announcements` and `/announcements/:announcementId`

Admins can review published and archived announcements and compare each one
with current eligible user accounts. The report shows which users have opened
the announcement detail in the mobile app, based on each user's existing
`readAnnouncements` array. List data is reused when opening a detail page and
is refreshed after 60 seconds or when the admin selects Refresh.

This is a current-account report: it does not preserve the audience as it was
at publication time and does not record when an announcement was opened.

### Enrolment List

Route: `/enrolments`

The enrolment portal reads from Firestore:

```text
enrolments
```

It currently provides:

- Admin-only list of enrolment documents.
- Tabs for `Unarchived` and `Archived` enrolments.
- Display of student name and carer email.
- Navigation to each enrolment detail page.
- Backwards-compatible redirect from `/enrolments?enrolmentId=<id>` to
  `/enrolments/<id>`.

The list expects enrolment documents to include an `archived` boolean. Documents
missing that field may not behave consistently with the tabbed list.

### Enrolment Details

Route: `/enrolments/:enrolmentId`

The enrolment detail page reads a single Firestore document:

```text
enrolments/{enrolmentId}
```

It displays:

- Enrolment ID.
- Student name.
- Student year.
- Selected classes.
- Selected subjects.
- Carer name, phone, and email.
- Emergency contact name, phone, and relation.
- Allergies.
- Permission to leave.
- Additional information.

The page includes an `Accept Enrolment` action.

### Accept Enrolment

The frontend calls the `adminAcceptEnrolment` callable Cloud Function through
Firebase Functions in `us-central1`.

The function:

- Requires a signed-in Firebase user.
- Requires `role: "admin"`.
- Reads `enrolments/{enrolmentId}`.
- Returns existing `createdParentId` and `createdStudentId` without creating
  duplicates when the enrolment is already accepted.
- Creates or reuses the parent Firebase Auth user based on carer email.
- Creates or updates the parent Firestore user document in `users`.
- Creates a student document in `students`.
- Links the student to the parent.
- Adds the student to selected class documents in `classes`.
- Adds the student to future attendance documents under
  `classes/{classId}/attendance`.
- Sends a best-effort parent enrolment accepted email. The parent welcome email
  is sent when the website registration creates the enrolment document.
- Writes audit metadata and marks the enrolment accepted.

The legacy `acceptPendingEnrolment` HTTPS URL was removed from the live
function set after hosting was deployed with the callable-based UI.

## Cloud Functions ownership

The platform monorepo is the authoritative production source for the active
function set in Firebase project `tenacity-tutoring-b8eb2`.

The first ownership deploy was completed from the original portal repository
on 2026-05-13. Its broad deploy command is intentionally omitted here because
it must not be run from the monorepo.

- Post-deploy verification:

```text
live active non-extension functions: 42
portal deployable functions: 42
missing from portal: 0
extra in portal: 0
```

Treat every application as a client of the shared backend. Production Function
changes must use the guarded root workflow and its exact-SHA controls.

### Function package structure

The platform-owned `backend/firebase/functions/` package uses Node.js 22 and
will deploy from:

```text
backend/firebase/functions/lib/index.js
```

That bundle was migrated from the compiled app functions output because the app
repo's compiled `functions/lib` contained newer notification and waitlist code
that was not fully represented by the app repo's TypeScript `functions/src`.

The root `backend/firebase/functions/index.js` is only a compatibility bridge
to `backend/firebase/functions/lib/index.js`.

Portal-owned overrides live at:

```text
backend/firebase/functions/lib/portal/overrides.js
```

Those overrides intentionally preserve current portal behavior for:

- `sendAdminEnrolmentEmail`
- `sendCustomPasswordResetEmail`

The old `acceptPendingEnrolment` override remains in source for reference but
is not exported. It is no longer present in the live function list.

### Active function set

The first portal ownership deploy matched the 42 active non-extension
production functions. The Phase 1-3 deploy was completed from this repo on
2026-05-13 after hosting was deployed first. It kept those active functions,
added the new portal admin callables, and removed the old
`acceptPendingEnrolment` HTTPS URL.

- Enrolment and email:
  - `sendAdminEnrolmentEmail`
  - `sendCustomPasswordResetEmail`
  - `adminAcceptEnrolment`
- Payments and invoices:
  - `createPaymentIntent`
  - `createStripeCustomerEphemeralKey`
  - `verifyPaymentStatus`
  - `stripeWebhook`
  - `createInvoice`
  - `invoiceCreatedNotif`
  - `invoiceReminderScheduler`
  - `adminCreateInvoice`
  - `adminCreateInvoiceDraft`
  - `adminUpdateInvoice`
  - `adminDeleteInvoice`
  - `adminGetInvoicePdf`
- Reports:
  - `adminIncomeReport`
  - `adminInvoiceAgingReport`
  - `adminExportReport`
- Xero:
  - `xeroAuthStart`
  - `xeroAuthCallback`
  - `getInvoicePdf`
  - `onInvoiceCreated`
  - `onInvoiceStatusChanged`
  - `debugXeroAccountsAndTaxTypes`
- Timetable, attendance, and class operations:
  - `rolloverTermData`
  - `deleteUserByUidV2`
  - `dryRunCurrentTermInvoices`
  - `enrollStudentOneOff`
  - `cancelStudentForWeek`
  - `rescheduleStudentToDifferentClass`
  - `notifyStudentAbsence`
  - `onAttendanceChangeNotifyAdmins`
  - `enrollStudentPermanentForParent`
  - `enrollStudentPermanent`
  - `unenrollStudentPermanent`
  - `onPermanentSpotOpened`
  - `onPermanentEnrolmentNotifyAdmins`
- Announcements, chat, and feedback:
  - `createAnnouncement`
  - `onAnnouncementCreated`
  - `sendChatMessage`
  - `onMessageReceived`
  - `createFeedback`
  - `onFeedbackCreated`
- Waitlist:
  - `joinWaitlist`
  - `promoteWaitlistEntry`
  - `updateWaitlistEntryStatus`
  - `onWaitlistEntryCreatedNotifyAdmins`
  - `onWaitlistEntryReactivatedNotifyAdmins`
- Utility:
  - `linkUsers`
  - `dailyLessonAndShiftReminder`

Helper exports also exist in the module for internal reuse, but are not
deployable Cloud Functions:

```text
markInvoicePaidInXero
sendParentEnrolmentAcceptedEmail
sendParentWelcomeEmail
```

### Functions intentionally not deployed from this repo

The Firebase project still contains two legacy Node 18 Xero functions in
`UNKNOWN` state:

```text
generateXeroAuthUrl
xeroOAuthCallback
```

They are not referenced by the app or portal repos, and recent
`firebase functions:log` checks returned no entries. They were left untouched
during the handover deploy because their source is not present in either repo
and Xero redirect URIs must be verified before deleting or recreating them.

The Firebase project also contains two Firebase extension-owned Algolia
functions. They should not be managed by this repo:

```text
ext-firestore-algolia-search-executeFullIndexOperation
ext-firestore-algolia-search-executeIndexOperation
```

### Portal functions staged for later

These functions exist in portal code or scripts, but are not currently exported
as deployable Cloud Functions because they were not part of the active
production function set during handover:

- `purgeOldInvoices`

Deploy them later as explicit portal backend features after review.

`syncUserRoleClaim` is now exported as a deployable function. It is a
`users/{uid}` `onWrite` trigger that reconciles each user's auth custom claim
with their Firestore `role`, keeping Firestore the single source of truth for
RBAC. Creation callables (`adminCreateUser`, `adminCreateParent`) still set the
claim directly, but this trigger also covers role changes/corrections made
outside those callables (scripts, console, backfills) and is idempotent. Note
that on first deploy it only fires on subsequent writes; it does not backfill
claims for existing users whose Firestore role already differs from their claim.

### Function warnings

Firebase currently reports:

- The Functions runtime is now pinned to Node.js 22
  (`backend/firebase/functions`
  `engines.node`). Node.js 20 was deprecated on 2026-04-30 and decommissions on
  2026-10-30; the next functions deploy will move the live runtime to nodejs22.
- `firebase-functions` is flagged as outdated.
- `functions.config()` / Runtime Config must be migrated before March 2027 if
  any deployed code still depends on it.

Handle the remaining migrations as separate work after the ownership handover is
stable.

## Invoice purge implementation

Local scripts:

```text
npm --prefix backend/firebase/functions run dryrun:purge-old-invoices
```

The package also contains a mutating one-off purge command. Do not run it
without a separate production-change approval.

The dry-run script supports:

- `--projectId=<id>`
- `--batchSize=<n>`
- `--logSample=<n>`
- `--commit --yes`

## One-Off Maintenance Scripts

### `backfillArchived`

Purpose:

- One-off script for setting the `archived` field on enrolment documents.

Current warning: the script comments mention adding `archived: false`, but the
current implementation writes `archived: true`. Review this script before
running it against production data. Its executable command is intentionally
omitted because it requires a separate production-change approval and runbook.

## Shared Firestore Collections

This portal works against the same Firestore database as the Flutter app.
Relevant collections include:

- `users`
- `students`
- `classes`
- `classes/{classId}/attendance`
- `enrolments`
- `invoices`
- `waitlistEntries`
- `userTokens`

The portal should prefer direct Firestore reads for list/detail screens and
server-side Cloud Functions for writes that affect business rules, counters,
notifications, attendance sync, billing, or external systems.

## Portal Vs App Responsibility Boundary

### Belongs In The Web Portal

The web portal should own heavier back-office workflows:

- Enrolment review and acceptance.
- Full user, parent, student, tutor, and admin management, including creating accounts.
- Creating, editing, and deleting class definitions.
- Creating and editing terms.
- Generating or repairing attendance structures.
- Full invoice creation, review, deletion, payment reconciliation, and PDF
  workflows.
- Xero and Stripe operational/debug workflows.
- Reports and exports.
- Data repair and backfill tooling.
- Role and permission management.
- Business configuration.

### Belongs In The Flutter App

The Flutter app should keep day-to-day mobile workflows:

- Parent timetable viewing.
- Parent one-off bookings.
- Parent attendance cancellation/rescheduling.
- Parent absence notifications.
- Parent invoice viewing and payment.
- Parent waitlist joins/leaves.
- Tutor class and attendance workflow.
- Tutor feedback workflow.
- Messaging.
- Reading announcements.
- Profile, password, and terms flows.

Admins should still have lightweight operational tools in the app:

- View class timetables.
- Assign or change tutors.
- Mark and edit attendance.
- Manage class waitlists.
- Write announcements.
- Respond to messages.
- Handle time-sensitive class-level tasks.

The app should avoid heavy setup, billing, destructive data actions, broad
reporting, and bulk maintenance workflows.

## Deployment boundary

Admin Hosting production releases run only through the guarded root
`firebase-hosting-production.yml` workflow. The workflow deploys the explicit
`admin-portal` target from an exact `main` SHA, builds with protected Vite
configuration, verifies a preview, promotes that exact preview, and captures
rollback evidence. Follow the platform deployment-control runbook; do not run
a broad or direct production Firebase deployment from this directory.

## Environment Variables

Create a `.env` file in the project root:

```text
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Only these are required for Firebase initialization:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
```

Do not commit `.env`.

## Local Development

Use Node.js 22 for Functions work. Run these commands from the platform root.

Install dependencies:

```text
npm ci --prefix apps/admin-portal
npm ci --prefix backend/firebase/functions
```

Start the web app:

```text
npm --prefix apps/admin-portal run dev
```

Build the web app:

```text
npm --prefix apps/admin-portal run build
```

Run the frontend test suite:

```text
npm --prefix apps/admin-portal test
```

Preview the production build:

```text
npm --prefix apps/admin-portal run preview
```

Run the backend export smoke check from the repo root:

```text
npm --prefix backend/firebase/functions run smoke
```

## Firebase Hosting

Hosting is configured in the root `firebase.json`:

- Named target: `admin-portal`
- Public directory: `apps/admin-portal/dist`
- Single-page app rewrite: all routes serve `/index.html`

This application serves `admin.tenacitytutoring.com` only, and admits only
accounts with an `admin` role claim. Teaching resources are a separate
application — `apps/resource-portal`, on its own Hosting site and custom
domain — with no route, link, or host detection connecting the two. `/resources`
here renders the admin 404.

Build locally with:

```text
npm --prefix apps/admin-portal run build
```

Deploy Hosting only through the guarded root workflow. It targets the explicit
`admin-portal` Hosting target; never deploy bare Hosting.

## Project Structure

```text
tenacity-web-portal/
  assets/
    Tenacity Horizontal Logo png.png
  backend/
    PLAN.md
    firestore.indexes.json
    functions/
      index.js
      lib/
        index.js
        portal/
          overrides.js
        notifications/
        events/
      purgeOldInvoices.js
      scripts/
        backfillArchived.js
        dryRunPurgeOldInvoices.js
  frontend/
    CLAUDE_MOCKUP_ROADMAP.md
  src/
    App.jsx
    AuthProvider.jsx
    ProtectedRoute.jsx
    backend/
      callable.js
      firestoreReads.js
      *Api.js
    components/
    firebaseConfig.js
    main.jsx
    pages/
      AuditPage.jsx
      ClassesPage.jsx
      ClassDetailPage.jsx
      DashboardPage.jsx
      EnrolmentDetailsPage.jsx
      EnrolmentPortalPage.jsx
      InvoicesPage.jsx
      InvoiceDetailPage.jsx
      LoginPage.jsx
      PeoplePage.jsx
      PeopleDetailPage.jsx
      ReportsPage.jsx
      TermsPage.jsx
      WaitlistPage.jsx
  firebase.json
  index.html
  package.json
  vite.config.js
```

## Current Gaps

- No lint script is configured.
- `reset_password.html` is served as a static Firebase Hosting page for parent
  password reset links.
- Imported application history still contains older function source, but
  canonical source now lives under root `backend/firebase`.
- Two legacy Xero functions remain live in Firebase as `UNKNOWN` Node 18
  functions and need separate Xero redirect URI verification before cleanup.
- Frontend coverage is configured with Vitest and React Testing Library, but no
  Playwright browser runner is installed.
- Final readiness is tracked in `frontend/CLAUDE_MOCKUP_ROADMAP.md`; remaining
  open items should be checked there before deployment.
- Firestore indexes and rules are source-controlled under root
  `backend/firebase`.

## License

Private, proprietary software. All rights reserved.
