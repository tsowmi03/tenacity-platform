# Tenacity Web Admin Portal

Internal web administration portal for Tenacity Tutoring.

This portal is being built to move staff/admin workflows out of the existing
Flutter app in `/Users/thomassowmi/Development/Tenacity`. Both applications use
the same Firebase project and Firestore database:

- Firebase project: `tenacity-tutoring-b8eb2`
- Web portal repo: `tenacity-web-portal`
- Existing app repo: `Tenacity`

The Flutter app remains the day-to-day mobile experience for parents, tutors,
and lightweight admin actions. This web portal is the back-office surface for
review, approval, billing, reporting, and operational maintenance.

## Current Portal Functionality

### Authentication

- Staff sign in with Firebase Authentication at `/login`.
- Auth state is managed in `src/AuthProvider.jsx`.
- Protected routes require a signed-in Firebase user.
- Staff/admin routes additionally require a Firebase custom claim:

```text
role: "admin"
```

If the user is signed in but does not have the admin claim, the portal shows an
admin-only access-denied state.

### Dashboard

Route: `/`

The dashboard currently provides:

- Tenacity-branded admin shell.
- Signed-in user and role display.
- Sign-out action.
- Quick navigation to the enrolment portal.

This is currently a lightweight entry point, not a full reporting dashboard.

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

The frontend calls the `acceptPendingEnrolment` HTTPS Cloud Function with the
signed-in user's Firebase ID token.

Default function URL:

```text
https://acceptpendingenrolment-3kboe6khcq-uc.a.run.app
```

Override:

```text
VITE_ACCEPT_PENDING_ENROLMENT_URL=...
```

The function:

- Requires a valid Firebase bearer token.
- Requires `role: "admin"`.
- Reads `enrolments/{enrolmentId}`.
- Creates or reuses the parent Firebase Auth user based on carer email.
- Creates or updates the parent Firestore user document in `users`.
- Creates a student document in `students`.
- Links the student to the parent.
- Adds the student to selected class documents in `classes`.
- Adds the student to future attendance documents under
  `classes/{classId}/attendance`.
- Sends a best-effort parent welcome email for newly created parent accounts.
- Sends a best-effort parent enrolment accepted email.

Important current limitation: accepting an enrolment does not currently mark the
enrolment as archived/accepted in this portal repo. That should be fixed before
the action is treated as safely idempotent.

## Cloud Functions ownership

The portal repo is now the authoritative Firebase Functions/backend package for
the active production function set in Firebase project
`tenacity-tutoring-b8eb2`.

The first ownership deploy was completed from this repo on 2026-05-13:

- Deploy command:

```text
firebase deploy --only functions --project tenacity-tutoring-b8eb2
```

- Post-deploy verification:

```text
live active non-extension functions: 42
portal deployable functions: 42
missing from portal: 0
extra in portal: 0
```

Do not deploy functions from the Flutter app repo unless the target is
deliberately narrowed and reviewed. The app repo should now be treated as a
client of the shared Firebase backend for active production functions.

### Function package structure

The `functions/` package uses Node 20 and deploys from:

```text
functions/lib/index.js
```

That bundle was migrated from the compiled app functions output because the app
repo's compiled `functions/lib` contained newer notification and waitlist code
that was not fully represented by the app repo's TypeScript `functions/src`.

The root `functions/index.js` is only a compatibility bridge to
`functions/lib/index.js`.

Portal-owned overrides live at:

```text
functions/lib/portal/overrides.js
```

Those overrides intentionally preserve current portal behavior for:

- `sendAdminEnrolmentEmail`
- `sendCustomPasswordResetEmail`
- `acceptPendingEnrolment`

### Active deployed functions

The portal currently deploys the 42 active non-extension production functions:

- Enrolment and email:
  - `sendAdminEnrolmentEmail`
  - `sendCustomPasswordResetEmail`
  - `acceptPendingEnrolment`
- Payments and invoices:
  - `createPaymentIntent`
  - `createStripeCustomerEphemeralKey`
  - `verifyPaymentStatus`
  - `stripeWebhook`
  - `createInvoice`
  - `invoiceCreatedNotif`
  - `invoiceReminderScheduler`
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

- `syncUserRoleClaim`
- `purgeOldInvoices`

Deploy them later as explicit portal backend features after review.

### Function warnings

Firebase currently reports:

- Node.js 20 was deprecated on 2026-04-30 and decommissions on 2026-10-30.
- `firebase-functions` is flagged as outdated.
- `functions.config()` / Runtime Config must be migrated before March 2027 if
  any deployed code still depends on it.

Handle these as separate migrations after the ownership handover is stable.

## Invoice purge implementation

Local scripts:

```text
npm --prefix functions run dryrun:purge-old-invoices
npm --prefix functions run purge-old-invoices:once
```

The dry-run script supports:

- `--projectId=<id>`
- `--batchSize=<n>`
- `--logSample=<n>`
- `--commit --yes`

## One-Off Maintenance Scripts

### `backfillArchived`

Script:

```text
npm --prefix functions run backfill:archived
```

Purpose:

- One-off script for setting the `archived` field on enrolment documents.

Current warning: the script comments mention adding `archived: false`, but the
current implementation writes `archived: true`. Review this script before
running it against production data.

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

The portal repo is now the deployed owner of active production Cloud Functions
for `tenacity-tutoring-b8eb2`.

Do not run broad function deploys from `/Users/thomassowmi/Development/Tenacity`.
If the Flutter app repo needs a backend deploy later, first compare targets and
use a narrowed deploy command for the specific function.

Normal portal function deploy:

```text
firebase deploy --only functions --project tenacity-tutoring-b8eb2
```

Recommended pre-deploy checks:

```text
npm --prefix functions run smoke
firebase deploy --only functions --project tenacity-tutoring-b8eb2 --dry-run
```

## Environment Variables

Create a `.env` file in the project root:

```text
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_ACCEPT_PENDING_ENROLMENT_URL=...
```

Only these are required for Firebase initialization:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
```

Do not commit `.env`.

## Local Development

Requires Node 20+.

Install dependencies:

```text
npm install
npm --prefix functions install
```

Start the web app:

```text
npm run dev
```

Build the web app:

```text
npm run build
```

Preview the production build:

```text
npm run preview
```

## Firebase Hosting

Hosting is configured in `firebase.json`:

- Public directory: `dist`
- Single-page app rewrite: all routes serve `/index.html`

Build before deploying hosting:

```text
npm run build
firebase deploy --only hosting
```

## Project Structure

```text
tenacity-web-portal/
  assets/
    Tenacity Horizontal Logo png.png
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
  src/
    App.jsx
    AuthProvider.jsx
    ProtectedRoute.jsx
    firebaseConfig.js
    main.jsx
    pages/
      DashboardPage.jsx
      EnrolmentDetailsPage.jsx
      EnrolmentPortalPage.jsx
      LoginPage.jsx
  firebase.json
  index.html
  package.json
  vite.config.js
```

## Current Gaps

- No automated frontend test suite is configured.
- No lint script is configured.
- The enrolment acceptance flow is not yet idempotent.
- `reset_password.html` is referenced by the password reset function but is not
  present in this repo.
- The Flutter app repo still contains function source/code, but active
  production function ownership has moved to this portal repo.
- Two legacy Xero functions remain live in Firebase as `UNKNOWN` Node 18
  functions and need separate Xero redirect URI verification before cleanup.
- The portal is currently enrolment-focused; waitlist, class, attendance,
  invoice, user-management, and reporting pages still need to be built.

## License

Private, proprietary software. All rights reserved.
