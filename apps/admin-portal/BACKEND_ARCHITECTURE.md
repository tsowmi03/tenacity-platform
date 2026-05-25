# Tenacity web portal backend architecture

Last reviewed from the local repo on 2026-05-25.

This document explains what the Tenacity web portal backend is, how it is wired, and how the main backend workflows behave. It is written from the current repository state, not from older planning notes.

## What this project is

The Tenacity web portal is the internal back-office web application for Tenacity Tutoring. It runs alongside the existing Flutter app in `/Users/thomassowmi/Development/Tenacity`, but this repo owns the shared Firebase backend package that the portal and app both depend on.

The shared Firebase project is:

```text
tenacity-tutoring-b8eb2
```

The backend has three main parts:

- Firebase Cloud Functions under `backend/functions`.
- Firestore security rules at `firestore.rules`.
- Firebase Storage security rules at `storage.rules`.

The portal frontend is a Vite React app. It uses direct Firestore reads for list/detail screens and callable Cloud Functions for writes or operations with side effects.

## Backend ownership

This repo is the canonical deploy source for the active shared Firebase Functions package. The Flutter app should be treated as a client of the shared backend unless a deploy target is deliberately narrowed and reviewed.

The root Firebase config points deployments at:

```text
backend/functions
```

The function package entrypoint is:

```text
backend/functions/lib/index.js
```

The root compatibility bridge is:

```text
backend/functions/index.js
```

That bridge simply requires `./lib/index`.

## Firebase project layout

`firebase.json` defines the deploy surfaces:

```text
firestore.rules              Firestore rules
backend/firestore.indexes.json Firestore indexes
storage.rules                Storage rules
backend/functions            Cloud Functions source
dist                         Hosting output
```

Hosting rewrites all paths to `/index.html`, so React Router owns portal navigation after the static app is served.

The local emulator config uses:

```text
Auth:      9099
Firestore: 8080
Functions: 5001
```

## Function runtime and package

`backend/functions/package.json` defines:

```text
Node runtime: 20
Main:         lib/index.js
```

Important dependencies:

- `firebase-admin` and `firebase-functions` for Firebase Admin SDK and Cloud Functions.
- `stripe` for Stripe PaymentIntent and webhook handling.
- `xero-node` for Xero OAuth, invoice creation, status sync, and PDF retrieval.
- `@sendgrid/mail` for transactional email.
- `@anthropic-ai/sdk`, `docx`, `mammoth`, `pdf-parse`, `sharp`, and `pdfkit` for resource generation.
- `xlsx` for spreadsheet report exports.
- `luxon` for Sydney-local date logic.

The function package is mostly CommonJS. The active export surface is assembled in `backend/functions/lib/index.js`.

## Why there is both `lib` and `src`

The backend has two generations of code:

- `backend/functions/lib`: migrated compiled function code from the existing app backend, plus portal overrides.
- `backend/functions/src`: newer portal-owned source modules for admin operations, reports, resource generation, shared validation, audit logging, and security helpers.

`lib/index.js` imports both:

- Older migrated domains from `./email_functions`, `./payment_functions`, `./xero_functions`, `./timetable_functions`, and `./notifications/index`.
- Newer portal modules from `../src/**`.

This means a backend change may need to be made in `src` or `lib`, depending on which function owns the behavior. New portal work should normally go under `backend/functions/src/**` and be exported explicitly from `backend/functions/lib/index.js`.

## Export surface

The local smoke command lists the deployable functions:

```bash
npm --prefix backend/functions run smoke
```

Current local exports are grouped below.

### Portal admin callables

User, parent, and student management:

- `adminCreateUser`
- `adminCreateParent`
- `adminUpdateUser`
- `adminDeleteUser`
- `adminLinkStudentToParent`
- `adminUnlinkStudentFromParent`
- `adminAdjustLessonTokens`
- `adminCreateStudent`
- `adminUpdateStudent`
- `adminDeleteStudent`

Enrolment management:

- `adminAcceptEnrolment`
- `adminArchiveEnrolment`
- `adminUnarchiveEnrolment`
- `adminDeleteEnrolment`
- `adminPurgeEnrolment`
- `adminUpdateEnrolment`

Class, attendance, and terms:

- `adminCreateClass`
- `adminUpdateClass`
- `adminDeleteClass`
- `adminGenerateAttendanceForClass`
- `adminRegenerateAttendanceForTerm`
- `adminCreateTermsForYear`
- `adminUpdateTerm`

Invoices:

- `adminCreateInvoice`
- `adminCreateInvoiceDraft`
- `adminUpdateInvoice`
- `adminDeleteInvoice`
- `adminGetInvoicePdf`

Reports:

- `adminIncomeReport`
- `adminInvoiceAgingReport`
- `adminAttendanceReport`
- `adminStudentEnrolmentReport`
- `adminClassUtilisationReport`
- `adminExportReport`

Audit and resources:

- `recordAuditEvent`
- `submitResourceJob`
- `processResourceJob`
- `retryResourceJob`
- `recoverStuckResourceJobs`

### Existing app-compatible functions

Payments and Stripe:

- `createPaymentIntent`
- `createStripeCustomerEphemeralKey`
- `verifyPaymentStatus`
- `stripeWebhook`

Xero:

- `xeroAuthStart`
- `xeroAuthCallback`
- `getInvoicePdf`
- `onInvoiceCreated`
- `onInvoiceStatusChanged`
- `markInvoicePaidInXero`
- `debugXeroAccountsAndTaxTypes`

Email:

- `sendAdminEnrolmentEmail`
- `sendCustomPasswordResetEmail`
- `sendParentWelcomeEmail`
- `sendParentEnrolmentAcceptedEmail`

Timetable, attendance, classes, waitlist, announcements, chat, feedback, and reminders:

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
- `joinWaitlist`
- `promoteWaitlistEntry`
- `updateWaitlistEntryStatus`
- `onWaitlistEntryCreatedNotifyAdmins`
- `onWaitlistEntryReactivatedNotifyAdmins`
- `createAnnouncement`
- `onAnnouncementCreated`
- `sendChatMessage`
- `onMessageReceived`
- `createFeedback`
- `onFeedbackCreated`
- `createInvoice`
- `invoiceCreatedNotif`
- `invoiceReminderScheduler`
- `dailyLessonAndShiftReminder`
- `linkUsers`

The legacy `acceptPendingEnrolment` onRequest function is intentionally removed from the final export map in `lib/index.js`.

## Authentication and roles

There are two backend role systems that are kept compatible:

- Firebase Auth custom claims, mainly `role`.
- Firestore user documents in `users/{uid}`, also with `role`.

Most new portal admin callables use:

```text
backend/functions/src/auth/requireAdmin.js
```

`requireAdminCallable(request)` requires:

- A signed-in Firebase Auth user.
- `request.auth.token.role === "admin"`.

The resource generator uses its own staff guard in `backend/functions/src/resources/index.js`:

```text
role in ["admin", "tutor"]
```

Payment helpers in `backend/functions/src/payments/paymentSecurity.js` allow either:

- The parent who owns the invoice.
- An admin.

Firestore rules also allow role fallback from `users/{uid}.role` when needed, but new callable admin functions generally require the custom claim.

## Frontend to backend pattern

The frontend API wrapper is:

```text
src/backend/callable.js
```

It wraps Firebase `httpsCallable` and normalises backend errors into `BackendError`.

The portal uses direct Firestore reads for read-only screens through helpers in:

```text
src/backend/firestoreReads.js
```

Examples:

- Users list reads `users`.
- Students list reads `students`.
- Classes list reads `classes`.
- Invoices list reads `invoices` and `invoiceDrafts`.
- Audit page reads `adminAuditLogs`.
- Resource pages subscribe to `resourceJobs`.

Writes and multi-document actions go through Cloud Functions. This keeps business rules in one backend layer instead of duplicating them in React.

## Shared validation and error handling

Shared validation lives at:

```text
backend/functions/src/shared/validation.js
```

It provides:

- `ValidationError`
- `validateShape`
- `assertString`
- `assertEmail`
- `assertEnum`
- `assertNumber`
- `assertBoolean`
- `assertArray`
- `assertHHmm`
- `assertDayOfWeek`

Validation functions normalise input where useful, such as trimming strings, lowercasing emails, and deduping arrays when requested.

Error mapping lives at:

```text
backend/functions/src/shared/errors.js
```

Callables generally:

1. Require the actor.
2. Validate and normalise `request.data`.
3. Run the implementation with injectable dependencies.
4. Convert validation or business errors into `HttpsError`.
5. Log failures with `firebase-functions/logger`.

## Audit logging

Admin audit logging lives at:

```text
backend/functions/src/shared/auditLog.js
backend/functions/src/audit/recordAuditEvent.js
```

Logs are written to:

```text
adminAuditLogs/{logId}
```

Typical audit fields:

- `actorUid`
- `actorEmail`
- `actorRole`
- `action`
- `targetType`
- `targetId`
- `targetName`
- `createdAt`
- `payloadSummary`
- `before`
- `after`
- `requestId`

`writeAuditLog` is best-effort by default. If a `requestId` is supplied, the log ID is a SHA-256 hash of that request ID, which makes repeat writes idempotent.

Firestore rules allow admins to read audit logs. Clients cannot write them directly.

## Core Firestore collections

The backend works against the same Firestore database as the Flutter app. Important top-level collections include:

- `users`
- `students`
- `classes`
- `classes/{classId}/attendance`
- `terms`
- `enrolments`
- `invoices`
- `invoiceDrafts`
- `waitlistEntries`
- `announcements`
- `chats`
- `feedback`
- `resourceJobs`
- `adminAuditLogs`
- `userTokens`
- `counters`
- `paymentLogs`
- `xeroTokens`
- `payslips`

The compatibility rule is that existing app document shapes matter. Backend changes should preserve field names and types used by the Flutter app.

## Users, parents, tutors, and admins

User management source files:

```text
backend/functions/src/users
backend/functions/src/auth/authUsers.js
backend/functions/src/users/userFactory.js
backend/functions/src/users/userSchemas.js
```

The user document shape is built by `buildUserDoc`. Required app-compatible fields include:

- `firstName`
- `lastName`
- `role`
- `email`
- `phone`
- `fcmTokens`
- `unreadChats`
- `activeChats`
- `termsAccepted`
- `acceptedTermsVersion`
- `acceptedTermsAt`
- `readAnnouncements`

Parent users also have:

- `students`
- `lessonTokens`
- `stripeCustomerId` when Stripe customer mode is used.

`adminCreateUser`:

- Requires admin.
- Creates or reuses a Firebase Auth user through `ensureAuthUser`.
- Creates `users/{uid}`.
- Optionally creates bundled student documents when the role is `parent`.
- Sets a custom role claim.
- Sends a welcome email when needed.
- Writes an audit log.

`adminCreateParent`:

- Creates or reuses the Auth user for a parent.
- Links existing students to the parent inside a transaction.
- Sets parent role metadata and audit log entries.

`adminUpdateUser`:

- Updates allowed user fields.
- Guards role and token changes.
- Preserves app-compatible user fields.

`adminDeleteUser`:

- Requires `confirmEmail`.
- Blocks self-delete.
- Refuses to delete a parent with linked students.
- For tutor/admin deletion, removes that user from `classes.tutors` and future attendance docs only.
- Deletes the Firestore user document.
- Best-effort deletes the Firebase Auth user and `userTokens/{uid}`.
- Keeps historical attendance intact.

`adminAdjustLessonTokens`:

- Supports setting or changing a parent's lesson token balance.
- Refuses negative balances.
- Writes an audit log.

## Students

Student files:

```text
backend/functions/src/students
```

Student documents include:

- `firstName`
- `lastName`
- `parents`
- `grade`
- `subjects`
- `primaryParentId`

`adminCreateStudent`:

- Requires admin.
- Creates a standalone student or links it to parent IDs.
- Verifies parent role when linking.

`adminUpdateStudent`:

- Validates field updates.
- Requires `primaryParentId` to remain inside `parents`.

`adminDeleteStudent`:

- Requires `confirmFullName`.
- Removes the student ID from linked parent `students` arrays.
- Removes the student from `classes.enrolledStudents`.
- Removes the student from future attendance docs only.
- Deletes `students/{studentId}`.
- Leaves historical attendance for reports.

Parent/student link functions update both sides of the relationship:

- `users/{parentId}.students`
- `students/{studentId}.parents`
- `students/{studentId}.primaryParentId`

## Enrolments

Enrolment files:

```text
backend/functions/src/enrolments
```

Public website enrolment creation is allowed by Firestore rules when the submitted shape is valid. Admin lifecycle changes are done through callables.

`adminAcceptEnrolment`:

- Requires admin.
- Validates `enrolmentId`.
- Loads `enrolments/{enrolmentId}`.
- Short-circuits if `status === "accepted"` and `createdParentId` plus `createdStudentId` are present.
- Creates or reuses the parent Firebase Auth user.
- Creates a new student document.
- Links parent and student both ways.
- Adds the student to selected `classes/{classId}.enrolledStudents`.
- Adds the student to future attendance docs only.
- Updates enrolment lifecycle fields such as accepted status, archive state, accepted actor, and created parent/student IDs.
- Sets the parent role custom claim.
- Sends the enrolment accepted email.
- Writes an audit log.

The function pre-queries future attendance targets before the Firestore transaction because Firestore transactions cannot run collection queries inside the transaction body.

Other enrolment functions:

- `adminArchiveEnrolment` refuses accepted or deleted enrolments.
- `adminUnarchiveEnrolment` reverses `archived`.
- `adminUpdateEnrolment` refuses accepted or deleted records.
- `adminDeleteEnrolment` soft-deletes.
- `adminPurgeEnrolment` hard-deletes only when no parent/student was created and the confirm ID matches.

## Classes and attendance

Class files:

```text
backend/functions/src/classes
```

Class documents include:

- `type`
- `day`
- `startTime`
- `endTime`
- `capacity`
- `tutors`
- `enrolledStudents`

Attendance docs live under:

```text
classes/{classId}/attendance/{attendanceId}
```

Attendance doc IDs are deterministic:

```text
{termId}_W{weekNum}
```

Attendance generation uses Sydney-local dates through Luxon.

`adminCreateClass`:

- Requires admin.
- Creates the class doc.
- Optionally generates attendance docs for selected or active/upcoming terms.
- Refuses writes that would exceed the safety limit.
- Writes an audit log.

`adminUpdateClass`:

- Updates class fields.
- Can optionally propagate day/time, tutor, and permanent student changes to future attendance only.

`adminDeleteClass`:

- Requires `confirmClassId`.
- Requires `deleteAttendance: true`.
- Refuses deletion when enrolled students or waitlist references still exist.

`adminGenerateAttendanceForClass`:

- Generates missing attendance docs for one class.
- Defaults to non-overwrite behavior.

`adminRegenerateAttendanceForTerm`:

- Regenerates attendance docs for selected classes in one term.
- Defaults to overwrite behavior.

All multi-document writes keep headroom under Firestore's 500-write batch limit by refusing operations over 450 writes.

## Terms

Term files:

```text
backend/functions/src/terms
```

Terms are read by class and attendance generation code. They provide:

- `year`
- `termNum`
- `startDate`
- `endDate`
- `weeksNum`
- `status`

`adminCreateTermsForYear`:

- Creates a set of term docs for a year.
- Fails if any target term already exists.
- Uses IDs from `termIdFor(year, termNum)` when not supplied.

`adminUpdateTerm`:

- Updates allowed fields.
- Validates date order.
- Writes before/after audit metadata.

The migrated `rolloverTermData` scheduled function also updates term status and generates attendance docs when a term rolls over.

## Invoices, Stripe, and Xero

Invoice source files:

```text
backend/functions/src/invoices
backend/functions/lib/payment_functions.js
backend/functions/lib/xero_functions.js
backend/functions/src/payments/paymentSecurity.js
```

Invoice documents live in:

```text
invoices/{invoiceId}
```

Drafts live in:

```text
invoiceDrafts/{draftId}
```

Invoice statuses are kept compatible with the app:

```text
unpaid
paid
overdue
```

`adminCreateInvoice`:

- Requires admin.
- Validates parent and student references.
- Allocates the next invoice number from `counters/invoices`.
- Writes an invoice doc.
- Returns a warning that invoice creation may trigger Xero/email side effects.

`adminCreateInvoiceDraft`:

- Requires admin.
- Writes to `invoiceDrafts`.
- Does not trigger Xero.

`adminUpdateInvoice`:

- Updates allowed invoice fields.
- Returns Xero warnings for synced invoices.

`adminDeleteInvoice`:

- Hard-deletes invoices.
- Requires explicit acknowledgement when the invoice has a Xero invoice ID.

`adminGetInvoicePdf`:

- Requires admin.
- Retrieves or caches a Xero PDF for an invoice.

Payment callables in `lib/payment_functions.js`:

- `createPaymentIntent`
- `createStripeCustomerEphemeralKey`
- `verifyPaymentStatus`
- `stripeWebhook`

Payment security helpers:

- Require a parent to act only on their own invoices, unless the actor is admin.
- Normalise and dedupe invoice IDs.
- Recalculate payable amount from invoice documents.
- Reject mismatched payment amounts.
- Store Stripe PaymentIntent IDs on invoice documents.
- Use stable Stripe idempotency keys for invoice-backed payments.

Xero functions:

- Start and complete OAuth.
- Store Xero tokens in `xeroTokens/demoCompany`.
- Create/update Xero invoice state from Firestore triggers.
- Retrieve invoice PDFs and cache them in Storage.

The Xero functions use Firebase secrets:

```text
XERO_CLIENT_ID
XERO_CLIENT_SECRET
```

Stripe functions use:

```text
STRIPE_KEY
STRIPE_WEBHOOK_SECRET
```

## Reports and exports

Report files:

```text
backend/functions/src/reports
```

Report callables are admin-only:

- `adminIncomeReport`
- `adminInvoiceAgingReport`
- `adminAttendanceReport`
- `adminStudentEnrolmentReport`
- `adminClassUtilisationReport`
- `adminExportReport`

Report filters are validated in `reportSchemas.js`.

Supported income grouping:

```text
day
week
month
term
parent
student
```

Supported attendance grouping:

```text
day
week
class
student
tutor
```

Supported export formats:

```text
csv
xlsx
pdf
```

Report calls write audit logs through `reportAudit.js`, including serialised filters, row count, and export format when relevant.

## Resource generation

Resource generator files:

```text
backend/functions/src/resources
backend/functions/src/resources/builder
```

This feature is staff-scoped, not admin-only. Admins and tutors can use it.

Primary collections and storage paths:

```text
resourceJobs/{jobId}
resources/uploads/{uid}/{fileName}
resources/output/{jobId}/{fileName}
```

Supported subjects:

```text
maths
english
```

Supported resource types:

```text
practice-paper
topic-booklet
study-guide
annotation-task
essay-scaffold
custom
worksheet
diagnostic-test
mixed-review
```

`annotation-task` and `essay-scaffold` are English-only.

All resource types currently use:

```text
claude-sonnet-4-20250514
```

`submitResourceJob`:

- Requires admin or tutor.
- Validates student, subject, year, resource type, custom prompt, and optional upload metadata.
- Verifies uploads are under `resources/uploads/{actorUid}/`.
- Loads the student and actor user doc.
- Creates a `resourceJobs` doc with `status: "pending"`.

`processResourceJob`:

- Firestore `onDocumentCreated` trigger on `resourceJobs/{jobId}`.
- Only processes pending jobs.
- Claims one job per creator at a time.
- Downloads and extracts optional upload content.
- Builds system and user prompts.
- Calls Anthropic.
- Parses JSON from the model response.
- Builds a DOCX file.
- Saves the DOCX to Storage.
- Updates the job as `complete` or `failed`.

`retryResourceJob`:

- Requires admin or the tutor who created the job.
- Only retries failed jobs.
- Sets the job back to pending and runs that creator's queue.

`recoverStuckResourceJobs`:

- Runs every 10 minutes.
- Finds `processing` jobs older than 8 minutes.
- Moves them back to `pending`.
- Runs each affected creator queue.

The Anthropic secret is:

```text
ANTHROPIC_API_KEY
```

## Notifications, waitlist, chat, and feedback

Migrated notification modules are exported from:

```text
backend/functions/lib/notifications/index.js
```

That index re-exports:

- `attendance`
- `announcements`
- `chat`
- `classes`
- `feedback`
- `invoices`
- `reminders`
- `waitlist`

These functions preserve existing Flutter app behavior for:

- Parent one-off enrolments and cancellations.
- Permanent enrolments and open permanent spot notifications.
- Waitlist join, promotion, status changes, and admin notifications.
- Announcements and announcement notifications.
- Chat sends and message notifications.
- Feedback creation and notifications.
- Invoice creation notifications and daily reminders.
- Daily lesson and shift reminders.

The notification system mainly reads FCM tokens from `userTokens/{uid}/tokens`.

## Email

Email functions and helpers are split between:

```text
backend/functions/lib/email_functions.js
backend/functions/lib/portal/overrides.js
backend/functions/src/email
```

`SENDGRID_API_KEY` is the SendGrid secret.

The portal-specific overrides preserve behavior for:

- `sendAdminEnrolmentEmail`
- `sendCustomPasswordResetEmail`

The parent welcome email is sent when the website creates the enrolment document. `adminAcceptEnrolment` sends the enrolment accepted email after admin acceptance.

## Firestore rules

Firestore rules live at:

```text
firestore.rules
```

High-level access rules:

- `classes` are publicly readable because the public website reads class slots.
- `classes/{classId}/attendance` is readable by signed-in users and writable by staff.
- `terms` are readable by signed-in users and writable by admins.
- `announcements` are readable by admins or signed-in users when not archived.
- `users` are readable by admins, tutors, owners, and signed-in users reading staff records.
- `students` are readable by staff or linked parents.
- `chats` are readable by participants.
- `invoices` are readable by admins or the owning parent.
- `invoiceDrafts` are admin-only.
- `feedback` is readable by staff or linked parents.
- `waitlistEntries` are readable by staff or the owning parent.
- `resourceJobs` are readable by admins or the tutor who created the job.
- `enrolments` can be publicly created only with the valid public enrolment shape, then read/updated/deleted by admins.
- `adminAuditLogs` are admin-readable only.
- `counters`, `paymentLogs`, and `xeroTokens` are blocked from client read/write.

Client writes to `resourceJobs`, `adminAuditLogs`, `counters`, `paymentLogs`, and `xeroTokens` are blocked. Those collections are mutated through backend code.

## Storage rules

Storage rules live at:

```text
storage.rules
```

Current resource generator storage access:

- `resources/uploads/{uid}/{fileName}` can be read and written only by that signed-in user.
- `resources/output/{jobId}/{fileName}` can be read by any signed-in user.
- Clients cannot write generated output.
- Everything else is denied by default.

Invoice PDF storage is written by Cloud Functions using Admin SDK access, so it does not rely on broad client Storage rules.

## Firestore indexes

Indexes live at:

```text
backend/firestore.indexes.json
```

The current indexes support:

- Announcement filters by archived/audience/createdAt.
- Attendance collection-group queries by student, tutor, term, date, day.
- Chat participant timeline queries.
- Payslip tutor queries.
- Invoice queries by status, due date, created date, paid date, and parent.
- Enrolment status/archive list queries.
- User role and last-name queries.
- Class day/start-time ordering.
- Resource job queue and history queries.

Resource generator indexes are especially important because queue claiming uses:

```text
createdBy == uid
status == pending
orderBy createdAt asc
```

and the UI uses:

```text
createdBy == uid
orderBy createdAt desc
```

or student-specific history queries.

## Secrets and external services

Configured Firebase secrets used by the backend:

```text
SENDGRID_API_KEY
STRIPE_KEY
STRIPE_WEBHOOK_SECRET
XERO_CLIENT_ID
XERO_CLIENT_SECRET
ANTHROPIC_API_KEY
```

External services:

- SendGrid for email.
- Stripe for payments.
- Xero for invoice accounting and PDFs.
- Anthropic for generated teaching resources.
- Firebase Auth, Firestore, Storage, Hosting, and Cloud Functions.

## Testing and verification

Root frontend and rules scripts:

```bash
npm test
npm run build
npm run test:rules
```

Function package scripts:

```bash
npm --prefix backend/functions run smoke
npm --prefix backend/functions test
npm --prefix backend/functions run test:emulator
npm --prefix backend/functions run test:all
```

What they cover:

- `smoke` loads `lib/index.js` and prints deployable exports.
- Function unit tests run Node's built-in test runner against `backend/functions/test/unit`.
- Function emulator tests run Auth and Firestore integration tests in the Firebase emulator.
- Root Vitest tests cover frontend API wrappers, pages, and Firestore rules.
- `test:rules` verifies Firestore rules through the emulator.

Before committing backend code, review the diff and run the relevant generated tests. For broad backend changes, the safer bundle is:

```bash
npm --prefix backend/functions run smoke
npm --prefix backend/functions test
npm --prefix backend/functions run test:emulator
npm test
npm run build
npm run test:rules
git diff --check
```

## Deployment

Typical deploy commands:

```bash
firebase deploy --only functions --project tenacity-tutoring-b8eb2
firebase deploy --only firestore:rules,firestore:indexes --project tenacity-tutoring-b8eb2
firebase deploy --only storage --project tenacity-tutoring-b8eb2
firebase deploy --only hosting --project tenacity-tutoring-b8eb2
```

Use narrowed deploy targets when touching shared production Functions. The Flutter app depends on many of these function names and Firestore shapes.

For function deploy safety:

1. Run the smoke command to confirm the export surface.
2. Review `backend/functions/lib/index.js` for accidental extra exports.
3. Confirm no legacy or helper-only functions are being exported by mistake.
4. Deploy from this repo, not from the Flutter app repo, unless the deploy target has been deliberately narrowed.

## Common implementation rules

New admin write functions should usually:

- Live in `backend/functions/src/{domain}`.
- Export an implementation function for tests and an `onCall` handler for Firebase.
- Use `requireAdminCallable` unless the domain is deliberately staff-scoped or parent-scoped.
- Validate input through schema helpers.
- Use transactions or batches for multi-document consistency.
- Keep Firestore batch writes below 450 operations.
- Preserve app-compatible document fields.
- Write audit logs for admin actions.
- Return structured JSON.
- Avoid plain text responses except for third-party redirect or webhook endpoints.

Use direct Firestore reads for low-risk read-only portal screens only when rules already express the access boundary clearly. Use Cloud Functions for all writes that touch Auth, roles, invoices, payments, Xero, class attendance, enrolment lifecycle, student links, or any multi-document invariant.

## Known risk areas

Shared backend ownership means a portal deploy can affect the Flutter app. Review function names, request payload compatibility, and Firestore field compatibility before deploy.

The `lib` directory still contains migrated compiled code. Some older behavior lives only there. Do not assume every deployed function has a source-equivalent module under `src`.

The active Xero OAuth redirect URLs in `lib/xero_functions.js` are legacy URLs. Verify Xero Developer settings before changing them.

Payment code must keep parent/admin authorization, invoice ID normalisation, amount recomputation, and idempotency behavior intact.

Class, enrolment, user, and student deletion intentionally clean future attendance only. Historical attendance is left intact for reporting.

The resource generator depends on Firestore triggers, scheduler recovery, Storage paths, Anthropic JSON output, and DOCX builder contracts. A change in one part can break the queue end to end.

Firestore rules and callable guards are separate controls. If you loosen one, check the other.
