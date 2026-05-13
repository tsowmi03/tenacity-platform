# Tenacity web portal backend plan

This plan maps the backend work needed for the Tenacity web portal. It is intentionally design-agnostic: the portal UI can be redesigned later, but the backend contracts should be stable, compatible with the existing Flutter app, and safe to operate against the shared Firebase project.

## Goal

Build the portal as the back-office administration surface for Tenacity Tutoring while keeping full compatibility with the existing Flutter app in `/Users/thomassowmi/Development/Tenacity`.

The portal and the app use the same Firebase project and Firestore database:

- Firebase project: `tenacity-tutoring-b8eb2`
- Portal repo: `/Users/thomassowmi/Development/tenacity-web-portal`
- App repo: `/Users/thomassowmi/Development/Tenacity`

The backend must preserve all existing Firestore collection names, field names, document references, Cloud Function side effects, Stripe/Xero integrations, FCM notifications, and app model parsing assumptions.

## Current portal baseline

The portal currently has:

- Firebase Auth login.
- Admin-gated routes using the `role: "admin"` custom claim.
- Enrolment list and enrolment detail pages.
- An `adminAcceptEnrolment` callable function wired from the enrolment detail page.
- `sendAdminEnrolmentEmail`.
- `sendCustomPasswordResetEmail`.
- A migrated Firebase Functions bundle that now owns the 42 active non-extension production functions previously deployed from the Flutter app/functions package.
- Shared backend foundation helpers, admin user/student management functions, and enrolment lifecycle functions ready for the next deploy.
- Portal code for `syncUserRoleClaim` and `purgeOldInvoices`, currently not exported or deployed because they were not active production functions at the time of handover.
- One-off scripts for old invoice purge and enrolment archive backfill.

The portal does not yet have backend APIs for class management, invoice management, reports, or attendance generation/regeneration.

## Development roadmap

### Completed

- [x] Confirm portal repo should own the Firebase Functions/backend package.
- [x] Inspect current app and portal Cloud Functions packages.
- [x] Identify that the app repo's compiled `functions/lib` contains newer notification/waitlist code not fully represented in `functions/src`.
- [x] Migrate the active production function bundle into the portal repo under `functions/lib`.
- [x] Preserve portal-specific overrides for `sendAdminEnrolmentEmail`, `sendCustomPasswordResetEmail`, and `acceptPendingEnrolment`.
- [x] Keep `syncUserRoleClaim` and `purgeOldInvoices` out of the first deploy because they were not active live functions at handover.
- [x] Compare portal deployable exports against live Firebase functions.
- [x] Confirm all 42 active non-extension production functions exist in the portal export set.
- [x] Leave Firebase extension-owned Algolia functions outside portal ownership.
- [x] Leave legacy Node 18 Xero functions untouched until Xero redirect URIs are verified.
- [x] Run a Firebase Functions dry-run from the portal repo.
- [x] Deploy the active production function set from the portal repo.
- [x] Run post-deploy verification: 42 active non-extension live functions and 42 portal deployable functions, with no missing or extra active portal functions.
- [x] Update README, PLAN, and long-term memory with the new backend ownership state.

**Phase 1 — Backend foundation (2026-05-13)**

- [x] Add `firebase.json` emulator config block (auth 9099, firestore 8080, functions 5001, UI enabled).
- [x] Add `functions/package.json` test scripts: `test` (unit), `test:emulator` (integration via `firebase emulators:exec`), `test:all`.
- [x] Add `functions/src/shared/validation.js` — `validateShape`, `assertString`, `assertEmail`, `assertEnum`, `assertHHmm`, `assertDayOfWeek`, etc.
- [x] Add `functions/src/shared/errors.js` — `toHttpsError` mapping `ValidationError` → `invalid-argument`.
- [x] Add `functions/src/shared/timestamps.js` — `now`, `fromDate`, `createdMeta`, `updatedMeta` with injectable clock.
- [x] Add `functions/src/shared/auditLog.js` — best-effort `writeAuditLog` to `adminAuditLogs` collection.
- [x] Add `functions/src/auth/requireAdmin.js` — `isAdminClaim`, `requireAdminCallable`, `requireAdminOnRequest`.
- [x] Add `functions/src/auth/authUsers.js` — `ensureAuthUser` (create or reuse Auth user).
- [x] Add `functions/src/email/sendgridSecret.js` — canonical `defineSecret("SENDGRID_API_KEY")`.
- [x] Add `functions/src/email/welcomeEmail.js` — `sendWelcomeEmailSafe` wrapper.
- [x] Add `functions/src/users/userSchemas.js` and `userFactory.js` — `buildUserDoc` writes all app-required fields.
- [x] Add `functions/src/students/studentSchemas.js` and `studentFactory.js`.
- [x] Add `functions/src/classes/classSchemas.js`, `classFactory.js`, `attendanceFactory.js` — `weekNum`, `day`, HH:mm times for app compat.
- [x] Add `functions/src/enrolments/enrolmentSchemas.js` and `enrolmentFactory.js`.
- [x] Add `functions/src/invoices/invoiceSchemas.js` and `invoiceFactory.js`.
- [x] Add `functions/src/terms/termSchemas.js` — read normaliser only (no factory to avoid a third shape).
- [x] Add `functions/test/helpers/emulator.js` — `getAdmin`, `clearCollection`.
- [x] Add unit tests for all shared helpers.

**Phase 2 — User management (2026-05-13)**

- [x] Implement `adminCreateUser` (`functions/src/users/createUser.js`) — creates Auth user, Firestore user doc, optional inline student docs, sets custom claim, sends welcome email.
- [x] Implement `adminCreateParent` (`functions/src/users/createParent.js`) — links to existing student IDs via transaction.
- [x] Implement `adminCreateStudent` (`functions/src/students/createStudent.js`) — standalone or with parent linkage; verifies parent role.
- [x] Implement `adminUpdateUser` (`functions/src/users/updateUser.js`) — transaction, guards lessonTokens for non-parents.
- [x] Implement `adminUpdateStudent` (`functions/src/students/updateStudent.js`) — validates `primaryParentId` is in existing parents array.
- [x] Implement `adminLinkStudentToParent` and `adminUnlinkStudentFromParent` (`functions/src/users/linkStudent.js`) — arrayUnion/arrayRemove both sides; unlink sets primaryParentId to next parent or null.
- [x] Implement `adminAdjustLessonTokens` (`functions/src/users/adjustLessonTokens.js`) — requires delta or set; guards balance >= 0.
- [x] Implement `adminDeleteUser` (`functions/src/users/deleteUser.js`) — blocks self-delete, requires `confirmEmail` match, cleans future attendance tutor refs, 450-op batch cap.
- [x] Implement `adminDeleteStudent` (`functions/src/students/deleteStudent.js`) — normalised name match, cascades to parent arrays + classes + future attendance, 450-op cap.
- [x] Export all 10 new functions in `functions/lib/index.js`.
- [x] Add integration tests for enrolment lifecycle in `functions/test/integration/enrolmentLifecycle.emulator.test.js`.

**Phase 3 — Enrolment lifecycle (2026-05-13)**

- [x] Implement `adminAcceptEnrolment` (`functions/src/enrolments/acceptEnrolment.js`) — idempotent (short-circuits on status === "accepted"), `ensureAuthUser`, pre-queries class targets outside txn, txn re-reads and aborts if concurrently accepted, sets `syncUserRoleClaim` claim inline, sends welcome + accepted emails, writes audit log.
- [x] Implement `adminArchiveEnrolment` and `adminUnarchiveEnrolment` (`functions/src/enrolments/archiveEnrolment.js`) — archive refuses accepted/deleted, unarchive only reverses archived.
- [x] Implement `adminDeleteEnrolment` (soft) and `adminPurgeEnrolment` (hard) (`functions/src/enrolments/deleteEnrolment.js`) — purge refuses if `createdParentId`/`createdStudentId` set, requires `confirmId === enrolmentId`.
- [x] Implement `adminUpdateEnrolment` (`functions/src/enrolments/updateEnrolment.js`) — refuses if status is accepted (frozen) or deleted.
- [x] Replace `acceptPendingEnrolment` onRequest URL with `adminAcceptEnrolment` callable — deleted from `portal/overrides.js` exports and added explicit `delete module.exports.acceptPendingEnrolment` in `lib/index.js` to remove the live URL on next deploy.
- [x] Update `src/firebaseConfig.js` to export `functions = getFunctions(app, "us-central1")`.
- [x] Migrate `src/pages/EnrolmentDetailsPage.jsx` from raw `fetch` + Bearer token to `httpsCallable(functions, "adminAcceptEnrolment")`.
- [x] Add integration tests covering archive/unarchive, soft delete, hard delete (purge), and update lifecycle.
- [x] Deploy portal hosting first, then deploy functions so the production UI calls `adminAcceptEnrolment` before the old `acceptPendingEnrolment` URL is removed.
- [x] Confirm live function list includes the Phase 1-3 admin callables and no longer includes `acceptPendingEnrolment`.

**Phase 4 — Class and attendance management (2026-05-13)**

- [x] Implement `adminCreateClass` (`functions/src/classes/createClass.js`) — creates app-compatible class docs and can generate attendance for selected active/upcoming terms.
- [x] Implement `adminUpdateClass` (`functions/src/classes/updateClass.js`) — updates class fields and optionally propagates day/time, tutor, and permanent student changes to future attendance only.
- [x] Implement `adminDeleteClass` (`functions/src/classes/deleteClass.js`) — guarded hard delete requiring `confirmClassId` and `deleteAttendance: true`; refuses enrolled students and waitlist references.
- [x] Implement `adminGenerateAttendanceForClass` and `adminRegenerateAttendanceForTerm` (`functions/src/classes/attendanceGeneration.js`) — writes deterministic `{termId}_W{weekNum}` docs with Sydney-local class dates, `weekNum`, copied tutors, and permanent enrolled students.
- [x] Export all 5 Phase 4 functions in `functions/lib/index.js`.
- [x] Add unit tests for Phase 4 validation/date helpers.
- [x] Add emulator integration tests for class creation, attendance generation, future-only propagation, term regeneration, non-overwrite generation, and guarded deletion.
- [x] Deploy Phase 4 functions and confirm the live function list includes all five class/attendance callables.

### Upcoming

- [ ] Verify Xero Developer redirect URIs for `generateXeroAuthUrl` and `xeroOAuthCallback`, then decide whether to delete, ignore, or intentionally recreate compatibility endpoints.
- [ ] Add source-controlled Firestore rules and indexes once rules are configured.
- [ ] Decide whether portal list/detail reads should remain direct Firestore reads under admin-only rules or move behind admin-only read APIs.
- [ ] Implement invoice create/update/delete functions without direct Xero mutation from portal workflows.
- [ ] Implement income, attendance, student enrolment, class utilisation, and invoice aging reports.
- [ ] Implement CSV, PDF, and spreadsheet exports.
- [ ] Upgrade off Node.js 20 before decommission on 2026-10-30.
- [ ] Migrate any remaining `functions.config()` / Runtime Config usage before March 2027.
- [ ] Hook final designed UI components into the backend API layer.

## Backend architecture direction

The chosen ownership direction is:

- The portal repo is now the authoritative Firebase Functions/backend package for the active production functions.
- The Flutter app repo should become a client of the shared Firebase backend, not the long-term owner of backend functions.
- During migration, preserve live function names so existing Flutter app callable/function URLs keep working.
- Do not deploy functions from the Flutter app repo unless the deploy target is deliberately narrowed and reviewed.

### Read model

Use direct Firestore reads from the portal frontend for low-risk read-only views:

- List users.
- List students.
- List classes.
- List attendance docs.
- List invoices.
- List enrolments.
- Load report data.

Reads should use converters or schema helpers in the portal so model assumptions are explicit and testable.

### Write model

Use admin-only Cloud Functions for all writes that:

- Create or delete Firebase Auth users.
- Set or change roles.
- Create, delete, or relink students.
- Update multiple collections in one operation.
- Touch `classes/{classId}/attendance`.
- Create invoices.
- Delete invoices and related PDF storage objects.
- Mark invoices paid.
- Trigger or suppress Xero/Stripe side effects.
- Accept/delete/archive enrolments.
- Generate reports from aggregation logic.

This prevents portal code from reimplementing business rules already depended on by the app.

### Function style

Prefer callable HTTPS functions for portal admin operations unless a public webhook or third-party redirect needs `onRequest`.

All admin functions should:

- Require Firebase Auth.
- Require `role: "admin"`.
- Validate request payloads.
- Use transactions or batched writes for multi-document changes.
- Return structured JSON, not plain text.
- Record `createdAt`, `createdBy`, `updatedAt`, `updatedBy`, and operation metadata where useful.
- Avoid deleting externally visible records unless the operation is explicit and confirmed by the UI.

## Compatibility source of truth

The existing app expects the following Firestore shapes.

### `users/{uid}`

Shared fields used by app user models:

```text
firstName: string
lastName: string
role: "admin" | "tutor" | "parent"
email: string
fcmTokens: string[]
phone: string
unreadChats: map<string, number>
activeChats: string[]
termsAccepted: boolean
acceptedTermsVersion: string | null
acceptedTermsAt: Timestamp | null
readAnnouncements: string[]
```

Parent-specific fields:

```text
students: string[]
lessonTokens: number
stripeCustomerId?: string
```

Important compatibility notes:

- The app parses parent, tutor, and admin users through `AppUser.fromFirestore`.
- Missing required user fields can crash app parsing because some fields are read without null fallback.
- Existing `syncUserRoleClaim` mirrors `users/{uid}.role` into Firebase Auth custom claims.
- The app has some legacy use of `fcm_token`, but notification code mainly uses `userTokens/{uid}/tokens`.

### `students/{studentId}`

```text
firstName: string
lastName: string
parents: string[]
grade: string
subjects: string[]
primaryParentId?: string
```

Compatibility notes:

- Parent users reference student IDs in `users/{parentId}.students`.
- Students reference parent user IDs in `students/{studentId}.parents`.
- Invoices use student IDs and sometimes derive display fields from student docs.

### `classes/{classId}`

```text
type: string
day: string
startTime: string
endTime: string
capacity: number
enrolledStudents: string[]
tutors: string[]
```

Compatibility notes:

- `day` is the Firestore field, even though the app model exposes it as `dayOfWeek`.
- `startTime` and `endTime` are strings. The app expects `HH:mm` style values in date generation code.
- Permanent enrolments are represented by `enrolledStudents`.
- Tutors are stored on both the class doc and future attendance docs.

### `classes/{classId}/attendance/{attendanceId}`

```text
date: Timestamp
termId: string
cancelled: boolean
updatedAt: Timestamp
updatedBy: string
weekNum: number
attendance: string[]
tutors: string[]
```

Compatibility notes:

- The app model reads `weekNum`, not `weekNumber`.
- Some existing Cloud Function code has used `weekNumber`; new backend code should write `weekNum` for app compatibility and may optionally include `weekNumber` only as a compatibility alias if needed.
- Attendance doc IDs follow the pattern `{termId}_W{weekNumber}`, for example `2026_T2_W3`.
- Future attendance docs are updated when students are permanently enrolled or unenrolled.

### `terms/{termId}`

Existing app reads:

```text
year: string
termNum: number
startDate: Timestamp
endDate: Timestamp
weeksNum: number
status: "active" | "inactive" or boolean in older model code
invoicesGeneratedAt?: Timestamp | null
```

Compatibility notes:

- There is inconsistency in the app model: `Term.fromMap` reads `termNum`, `weeksNum`, and `status`, while `Term.toMap` writes `termNumber`, `totalWeeks`, and `isActive`.
- The app file `/Users/thomassowmi/Development/Tenacity/lib/src/models/term_model.dart` is the current reference point.
- Portal backend should not invent a third term shape. It should either write the fields the app currently reads (`termNum`, `weeksNum`, `status`) or first fix the app model and migrate existing documents deliberately.

### `invoices/{invoiceId}`

```text
parentId: string
parentName: string
parentEmail: string
lineItems: array<map>
weeks: number
amountDue: number
amountDueComputed?: number
amountDueOverride?: number
status: "unpaid" | "paid" | "overdue"
dueDate: Timestamp
createdAt: Timestamp
studentIds: string[]
invoiceNumber?: string
xeroInvoiceId?: string
xeroInvoicePdfPath?: string
stripePaymentIntentId?: string
paidAt?: Timestamp
adminNotes?: string
createdByAdminId?: string
updatedAt?: Timestamp
```

Expected line item keys:

```text
studentName?: string
description: string
quantity: number
unitAmount: number
lineTotal: number
isAdminAdjustment?: boolean
```

Compatibility notes:

- Invoice creation increments `counters/invoices.current`.
- Creating an invoice triggers Xero invoice creation and email via the app repo function `onInvoiceCreated`.
- Marking an invoice `paid` can trigger Xero payment sync via `onInvoiceStatusChanged`.
- Stripe webhooks also mark invoices paid and add Stripe payment metadata.
- Deleting an invoice currently removes the Firestore doc and best-effort deletes the stored Xero PDF only. It does not delete Xero invoices.

### `enrolments/{enrolmentId}`

Observed fields used by portal and functions:

```text
archived: boolean
studentFirstName: string
studentLastName: string
studentYear: string
studentSubjects: string[]
classes: array<{ id: string, day?: string, startTime?: string }>
carerFirstName: string
carerLastName: string
carerEmail: string
carerPhone: string
emergencyContactFirstName: string
emergencyContactLastName: string
emergencyContactPhone: string
emergencyContactRelation: string
allergies: string
permissionToLeave: string | boolean
additionalInfo: string
```

Lifecycle fields to add:

```text
status: "pending" | "accepted" | "archived" | "deleted"
acceptedAt?: Timestamp
acceptedBy?: string
createdParentId?: string
createdStudentId?: string
archivedAt?: Timestamp
archivedBy?: string
deletedAt?: Timestamp
deletedBy?: string
deleteReason?: string
```

Compatibility notes:

- Current portal acceptance is not idempotent because it does not mark the enrolment accepted or store created IDs.
- Archive should be separate from delete.
- Delete should probably be soft-delete by default unless there is a strong reason to hard-delete.

## Proposed backend modules

The portal now starts from a migrated JavaScript function snapshot because the app repo's compiled `functions/lib` contains newer notification/waitlist code that is not fully represented in the app repo's TypeScript `functions/src`.

Current migration baseline:

```text
functions/
  lib/                    # migrated deployable function bundle from the app repo
    index.js              # Firebase deploy entrypoint
    portal/
      overrides.js        # portal-owned overrides and portal-only functions
  index.js                # compatibility bridge to lib/index.js
  purgeOldInvoices.js     # shared purge implementation for function + scripts
  scripts/
    backfillArchived.js
    dryRunPurgeOldInvoices.js
```

Important migration rule:

- `functions/lib/index.js` exports the migrated app functions first, then `functions/lib/portal/overrides.js`, then the new portal admin functions. This preserves current portal behavior for `sendAdminEnrolmentEmail` and `sendCustomPasswordResetEmail` while replacing the legacy `acceptPendingEnrolment` URL with `adminAcceptEnrolment`.
- `syncUserRoleClaim` and `purgeOldInvoices` exist in portal code/scripts but are not currently exported as deployable functions.

Longer term, create a clearer backend structure under `functions/` before adding more behavior.

```text
functions/
  index.js
  src/
    auth/
      requireAdmin.js
    shared/
      firestore.js
      validation.js
      timestamps.js
      errors.js
    users/
      userSchemas.js
      createUser.js
      updateUser.js
      deleteUser.js
      linkStudent.js
    classes/
      classSchemas.js
      createClass.js
      updateClass.js
      deleteClass.js
      attendanceGeneration.js
    enrolments/
      enrolmentSchemas.js
      acceptEnrolment.js
      archiveEnrolment.js
      deleteEnrolment.js
    invoices/
      invoiceSchemas.js
      createInvoice.js
      updateInvoice.js
      markInvoicePaid.js
      deleteInvoice.js
      invoiceDrafts.js
    reports/
      incomeReport.js
      attendanceReport.js
      studentReport.js
    maintenance/
      purgeOldInvoices.js
      backfills.js
```

This can be done in CommonJS to match the current portal functions package, or the package can be migrated to TypeScript to match the app repo. The best long-term option is TypeScript because the backend will become model-heavy.

## Portal frontend backend layer

Even while design is deferred, create a clean frontend service layer that design components can call later.

```text
src/
  firebaseConfig.js
  backend/
    callable.js
    firestoreReads.js
    usersApi.js
    classesApi.js
    enrolmentsApi.js
    invoicesApi.js
    reportsApi.js
    schemas.js
```

Responsibilities:

- `firestoreReads.js`: read-only query helpers.
- `callable.js`: wraps Firebase callable invocation, auth token refresh, and error formatting.
- `schemas.js`: shared client-side validation and normalization for forms.
- Feature API files: expose simple methods like `createUser(payload)` and `getIncomeReport(params)`.

The design layer should depend only on these API methods, not raw Firebase calls.

## Feature plan

### 1. Create users

Backend function:

```text
adminCreateUser
```

Inputs:

```text
role: "parent" | "tutor" | "admin"
firstName: string
lastName: string
email: string
phone: string
temporaryPassword?: string
sendWelcomeEmail?: boolean
students?: StudentCreateInput[]
lessonTokens?: number
```

Behavior:

- Require admin.
- Normalize and validate email.
- Create or reuse Firebase Auth user.
- Create `users/{uid}` with all required app fields.
- For parent creation, optionally create linked `students` docs.
- Set `students/{studentId}.parents` and `primaryParentId`.
- Set parent `students` array.
- Let `syncUserRoleClaim` set the custom claim, or set it directly in the same function and keep the trigger as a repair mechanism.
- Send a password reset/invite email after creating the Auth account. The existing app Cloud Functions already have SendGrid password reset/welcome-email patterns that should be reused rather than reinvented.

Default user document:

```text
firstName
lastName
role
email
phone
fcmTokens: []
unreadChats: {}
activeChats: []
termsAccepted: false
acceptedTermsVersion: null
acceptedTermsAt: null
readAnnouncements: []
students: []              // parent only
lessonTokens: 0           // parent only
createdAt
createdBy
updatedAt
updatedBy
```

Needed frontend read helpers:

- `listUsers({ role, search, limit, cursor })`
- `getUser(uid)`
- `listStudents({ parentId })`
- `listTutorsAndAdmins()`

Open decisions:

- Whether student creation should be part of parent creation or a separate flow.

Confirmed decisions:

- Portal admins may create `admin`, `tutor`, and `parent` users.
- Every portal-created user must have both a Firebase Auth account and a matching `users/{uid}` Firestore document.
- Firestore user documents must be fully populated for app compatibility, not partial placeholder records.
- Admin-created users should be sent a password reset/invite email through the existing SendGrid-backed email flow.

### 2. Manage users

Backend functions:

```text
adminUpdateUser
adminDeleteUser
adminCreateStudent
adminUpdateStudent
adminDeleteStudent
adminLinkStudentToParent
adminUnlinkStudentFromParent
adminAdjustLessonTokens
```

Delete behavior:

- Parent delete:
  - Remove all child students from parent linkage.
  - For each child student selected for deletion, remove from `classes.enrolledStudents`.
  - Remove from future attendance docs.
  - Delete or archive student docs based on chosen policy.
  - Delete `users/{parentId}`.
  - Delete Firebase Auth user.
  - Clean `userTokens/{uid}` and settings docs if present.
- Tutor/admin delete:
  - Remove UID from `classes.tutors`.
  - Remove UID from future attendance docs' `tutors`.
  - Delete `users/{uid}`.
  - Delete Firebase Auth user.
  - Clean `userTokens/{uid}`.
- Student delete:
  - Remove student from all parent `students` arrays.
  - Remove from classes and future attendance.
  - Delete or archive `students/{studentId}`.

Confirmed deletion baseline:

- Archived enrolments can be hard-deleted when explicitly deleted.
- Invoices that have synced to Xero should be soft-deleted or otherwise hidden in Firestore, because the portal will not delete or void Xero records.
- Unsynced draft/test invoices may be hard-deleted if confirmed by the admin.
- Users, students, and classes should use carefully scoped hard-delete flows for now because the current app does not filter `active: false` records. If soft-delete is later required for historical reporting, the app must first be updated to exclude inactive records from operational views.

Soft-delete fields, if introduced later:

```text
deletedAt
deletedBy
deletedReason
active: false
```

Compatibility risk:

- The existing app fetches all parents/tutors without filtering `active`. If soft deletes are introduced, the app must be updated to exclude inactive users, or the portal must hard-delete for now.

### 3. Create, update, and delete classes

Backend functions:

```text
adminCreateClass
adminUpdateClass
adminDeleteClass
adminGenerateAttendanceForClass
adminRegenerateAttendanceForTerm
```

Class create input:

```text
id?: string
type: string
day: string
startTime: string
endTime: string
capacity: number
tutors: string[]
enrolledStudents: string[]
termIds?: string[]
generateAttendance?: boolean
```

Create behavior:

- Validate `day`, `startTime`, `endTime`, and capacity.
- Create `classes/{classId}` with app-compatible fields.
- If requested, generate attendance docs for active/upcoming terms.
- Attendance generation must use:
  - doc ID `{termId}_W{week}`
  - `date` with class start time applied
  - `termId`
  - `cancelled: false`
  - `updatedAt`
  - `updatedBy`
  - `weekNum`
  - `attendance` copied from permanent `enrolledStudents`
  - `tutors` copied from class `tutors`

Update behavior:

- Update class doc.
- If tutor changes are permanent, update future attendance docs from a selected week/date where required for app compatibility.
- If enrolled students change, update future attendance docs consistently where required for app compatibility.
- If day/time changes, either:
  - keep historical attendance as-is and update future attendance dates, or
  - require explicit regeneration.
- Do not add portal workflows for marking attendance, absence handling, or session-by-session attendance modification. Those remain Flutter app workflows.

Delete behavior:

- Delete attendance subcollection first, then class doc.
- Check for future attendance, enrolled students, invoices, and waitlist entries before deletion.
- Prefer an explicit confirmation payload:

```text
confirmClassId: string
deleteAttendance: true
```

Open decisions:

- Whether classes should ever be hard-deleted once attendance history exists.
- Whether cancelled classes count in reports.
- Whether a class can be attached to specific terms, or remains global as it does in the current app.

Confirmed decisions:

- Classes should be viewable and modifiable in the portal.
- Attendance modification is not required in the portal.

### 4. Manage invoices

Backend functions:

```text
adminCreateInvoice
adminCreateInvoiceDraft
adminUpdateInvoice
adminDeleteInvoice
adminGetInvoicePdf
```

Create behavior:

- Require admin.
- Validate parent and student IDs.
- For now, do not move app-owned pricing and payment logic into the portal. The app can continue handling one-off class pricing, HSC/session-length details, sibling/second-hour discount rules, and token value flows.
- Increment `counters/invoices.current` transactionally.
- Create invoice doc with `status: "unpaid"`.
- Be careful with existing deployed Xero triggers. Even if the portal only writes Firestore, existing functions may react to invoice document changes and touch Xero.

Update behavior:

- Allow admin notes, due date, line items, amount override, and status changes.
- The portal should not mutate Xero directly. If a Firestore invoice edit requires a corresponding Xero edit, display a clear message instructing the admin to make the matching change in Xero.
- The portal should not provide parent/customer payment flows. Parent Stripe payment remains an app workflow.
- Do not add a manual payment collection flow in the portal.

Delete behavior:

- Best-effort delete stored PDF at `xeroInvoicePdfPath`.
- Do not delete, void, or edit the Xero invoice from the portal.
- If deleting or editing an invoice that has `xeroInvoiceId`, show a warning that Xero must be updated manually.
- Final hard-delete vs soft-delete behavior still depends on the deletion policy decision.

Read helpers:

- List all invoices with filters:
  - status
  - parent
  - student
  - due date
  - created date
  - Xero sync state
  - Stripe payment state
- Fetch invoice PDF through callable, not direct Xero calls from frontend.

Open decisions:

- Whether invoice deletion should be hard-delete or soft-delete when the invoice has already synced to Xero.

Confirmed decisions:

- For now, portal invoice changes should touch Firestore only.
- Xero should not be directly changed by portal functions.
- The portal should tell admins when a matching Xero edit is required.
- No parent/customer payment flow belongs in this portal.

### 5. Manage enrolments

Backend functions:

```text
adminAcceptEnrolment
adminArchiveEnrolment
adminUnarchiveEnrolment
adminDeleteEnrolment
adminUpdateEnrolment
```

Acceptance behavior:

- Replace the old plain-text `acceptPendingEnrolment` response with structured callable JSON.
- Require admin role.
- Validate enrolment status.
- Make operation idempotent:
  - if status is already `accepted`, return existing `createdParentId` and `createdStudentId`;
  - do not create a duplicate student.
- Create/reuse Firebase Auth parent user.
- Create/update parent user doc with all app-required fields.
- Create student doc.
- Link parent and student.
- Add student to selected classes.
- Add student to future attendance docs only.
- Set enrolment lifecycle fields:

```text
status: "accepted"
archived: true
acceptedAt
acceptedBy
createdParentId
createdStudentId
updatedAt
updatedBy
```

- Send parent welcome email only if a new Auth user was created.
- Send enrolment accepted email.

Archive behavior:

- Set `archived: true`, `status: "archived"` only if not accepted.
- Preserve accepted enrolments as `status: "accepted"` and `archived: true`.

Delete behavior:

- Prefer soft delete:

```text
status: "deleted"
archived: true
deletedAt
deletedBy
deleteReason
```

- Hard delete only for test/spam records and only if no student/user/class changes were created from it.

Open decisions:

- Whether the portal should support editing an enrolment before accepting it.
- Whether enrolment acceptance should ever create invoices automatically. Current preference from prior waitlist work was to keep billing separate unless explicitly requested.

Confirmed decisions:

- The portal should expose two enrolment tabs: `Active` and `Archived`.
- Archived enrolments should support individual deletion.

### 6. Reports

Reports should be generated by backend functions once they involve aggregation, date windows, or joins across collections. This keeps report logic consistent and avoids heavy client-side reads.

Backend functions:

```text
adminIncomeReport
adminAttendanceReport
adminStudentEnrolmentReport
adminClassUtilisationReport
adminInvoiceAgingReport
adminExportReport
```

#### Income report

Inputs:

```text
fromDate: date
toDate: date
basis: "created" | "due" | "paid"
status?: "unpaid" | "paid" | "overdue" | "all"
groupBy: "day" | "week" | "month" | "term" | "parent" | "student"
exportFormat?: "csv" | "pdf" | "spreadsheet"
```

Metrics:

- Total invoiced.
- Total paid.
- Total unpaid.
- Total overdue.
- Stripe payment state where available.
- Xero synced vs unsynced.
- Average invoice value.
- Count of invoices.

Data sources:

- `invoices`
- optional `invoices/{invoiceId}/payments`
- Stripe metadata fields on invoices
- Xero fields on invoices

Confirmed decision:

- Income reports should support multiple views, including invoice created date, invoice due date, paid date, and cash received views where the data supports them.
- Report exports should support CSV, PDF, and spreadsheet formats.

#### Attendance report

Inputs:

```text
fromDate: date
toDate: date
classIds?: string[]
tutorIds?: string[]
studentIds?: string[]
includeCancelled?: boolean
groupBy: "day" | "week" | "class" | "student" | "tutor"
```

Metrics:

- Sessions scheduled.
- Sessions cancelled.
- Student attendances.
- Absences based on permanent enrolment missing from attendance.
- One-off bookings where student is in attendance but not `enrolledStudents`.
- Class utilisation: attendance count / capacity.
- Tutor load by session count.

Data sources:

- `classes`
- `classes/{classId}/attendance`
- `students`
- `users` where role in `tutor`, `admin`
- `terms`

Important caveat:

- The current data model stores who was listed in attendance, not a separate explicit present/absent status. A student removed from a future attendance doc can mean absence, cancellation, reschedule, or manual edit. Reports must label this carefully unless a richer attendance event log is added.
- The portal should not modify attendance. Attendance reports are read-only aggregations over app-maintained attendance data.

#### Student enrolment report

Metrics:

- Active students.
- Students by grade.
- Students by subject.
- Students by class.
- New students from accepted enrolments.
- Students with no active class.
- Parent/student linkage issues.

Data sources:

- `students`
- `users`
- `classes`
- `enrolments`

#### Invoice aging report

Metrics:

- Unpaid invoices by days overdue.
- Parent balances.
- Oldest unpaid invoices.
- Invoices missing Xero ID.
- Invoices missing PDF path.
- Invoices with Stripe intent but unpaid status.

Data sources:

- `invoices`

### 7. Audit logging

Add an `adminAuditLogs` collection for portal backend mutations.

```text
adminAuditLogs/{logId}
actorUid: string
actorEmail: string
action: string
targetType: string
targetId: string
createdAt: Timestamp
payloadSummary: map
before?: map
after?: map
requestId?: string
```

Audit logging should be best-effort, but failures should be visible in function logs.

Retention:

- Keep six months of admin action history.

### 8. Validation and compatibility tests

Add tests before building large UI surfaces.

Test areas:

- User document factory writes all fields needed by app models.
- Parent/student linking is symmetrical.
- Tutor/admin deletion removes future attendance tutor references.
- Student deletion removes future class and attendance references.
- Class creation generates correct attendance doc IDs and `weekNum`.
- Invoice creation increments counter once and writes Xero-compatible line items.
- Enrolment acceptance is idempotent.
- Reports handle cancelled sessions, missing docs, and empty ranges.

Recommended tooling:

- Firebase Functions unit tests for pure helpers.
- Emulator-backed integration tests for Firestore/Auth workflows.
- A small fixture generator for parents, students, tutors, classes, terms, attendance, invoices, and enrolments.

## Deployment and ownership risk

The portal repo and app repo still contain overlapping Cloud Function names in source. This is risky because deploying from the app repo can overwrite live functions now owned by the portal repo.

The chosen path is Option A.

### Option A: Portal owns all admin/backend functions

- Move shared admin/business functions from the app repo into the portal repo.
- App keeps mobile frontend only, plus any app-specific client code.
- Portal functions package becomes the authoritative backend package.

Pros:

- Cleaner ownership.
- Better fit for back-office work.
- Easier to evolve reports and admin operations.

Cons:

- Requires careful migration to avoid breaking deployed app functions.

### Option B: App repo remains authoritative for backend functions

- Add portal backend functions to the app repo.
- Portal frontend calls functions deployed from app repo.

Pros:

- Avoids duplicate Firebase Functions packages.
- Lowest deployment risk in the short term.

Cons:

- Portal repo is not self-contained.
- Backend changes for portal require working in the app repo.

### Option C: Create a dedicated shared backend package

- New repo or workspace package for all Firebase Functions.
- App and portal become clients.

Pros:

- Cleanest long-term architecture.

Cons:

- More setup now.

Recommendation:

Use Option A: make the portal repo authoritative for admin/backend functions, then migrate overlapping functions deliberately so the app becomes a client of the shared Firebase backend. This matches the direction of moving back-office work out of the app and keeps portal backend work close to the portal plan.

Do not keep adding overlapping function names in both repos. During migration, choose one deployed owner for each existing function name before deploying either package.

Migration guardrails:

- Keep the same Firebase project: `tenacity-tutoring-b8eb2`.
- Keep the same functions codebase name: `default`.
- Keep existing exported function names unless intentionally replacing an app call site.
- Preserve existing function secret bindings in code through `defineSecret(...)`: `SENDGRID_API_KEY`, `STRIPE_KEY`, `STRIPE_WEBHOOK_SECRET`, `XERO_CLIENT_ID`, and `XERO_CLIENT_SECRET`.
- Do not run a functions deploy from the app repo after the portal repo takes ownership, unless deploying a function that has not yet moved or after explicitly narrowing the deploy target.
- Treat Xero and Stripe functions as compatibility functions for the app until portal-specific invoice workflows are built.

Live verification on 2026-05-13:

- `firebase functions:list --project tenacity-tutoring-b8eb2` showed 46 live functions total.
- Two live functions are Firebase extension-owned Algolia functions and should not be managed by this portal repo.
- Of the remaining 44 non-extension functions, 42 are `ACTIVE` and all 42 exist in the portal export set.
- Two non-extension functions are live but `UNKNOWN`/Node 18 and are not in the portal repo: `generateXeroAuthUrl` and `xeroOAuthCallback`. These appear to be stale legacy Xero functions and should be explicitly verified against Xero Developer redirect URIs before deletion or recreation.
- `purgeOldInvoices` and `syncUserRoleClaim` exist in the portal codebase but should not be exported in the first ownership deploy because they are not currently live. Add/deploy them later as explicit portal backend features.
- `firebase deploy --only functions --project tenacity-tutoring-b8eb2 --dry-run` completed successfully from the portal repo.
- `firebase deploy --only functions --project tenacity-tutoring-b8eb2` completed successfully from the portal repo.
- Post-deploy verification still showed 42 active non-extension live functions, 42 portal deployable functions, no missing active functions, and no extra portal deployable functions.
- Dry-run warnings to address later: Node.js 20 is deprecated as of 2026-04-30 and decommissions on 2026-10-30; `functions.config()`/Runtime Config must be migrated before March 2027 if still used.

## Firestore indexes and rules

Firestore rules have not been set in source control yet. They will be configured soon. Before implementation:

- Create source-controlled `firestore.rules` and `firestore.indexes.json` files in the repo that owns Firebase backend deployment.
- Add required composite indexes for reports and portal lists.
- Confirm whether the portal can read directly from Firestore under current rules or whether read APIs are needed.

Likely indexes:

- `users`: `role`, `lastName`, `email`
- `students`: `grade`, `lastName`
- `classes`: `day`, `startTime`
- `invoices`: `status + dueDate`, `parentId + createdAt`, `createdAt`, `paidAt`
- `enrolments`: `archived + createdAt`, `status + createdAt`
- collection group `attendance`: `date`, `termId + date`, `attendance array + date`, `tutors array + date`

## Suggested implementation sequence

### Phase 1: Backend foundation

- Cloud Functions ownership migration into the portal repo. Completed for the active production function set on 2026-05-13.
- Add shared auth/admin guard.
- Add schema validators.
- Add app-compatible document factory helpers.
- Add audit logging helper.
- Add emulator test setup and fixtures.

### Phase 2: User management

- Implement `adminCreateUser`.
- Implement student create/link/unlink helpers.
- Implement user update.
- Implement safe delete flows for parent, student, tutor, and admin.
- Add tests for app-compatible user/student shapes.

### Phase 3: Enrolment lifecycle

- Replace `acceptPendingEnrolment` with `adminAcceptEnrolment`.
- Add idempotency and lifecycle fields.
- Add archive, unarchive, delete, and update functions.
- Add tests for duplicate acceptance prevention.

### Phase 4: Class and attendance management

- Implement class create/update/delete functions.
- Implement attendance generation and regeneration helpers.
- Add tests around `weekNum`, dates, future-only updates, tutor propagation, and student propagation.

### Phase 5: Invoice management

- Implement invoice create/update/delete functions.
- Preserve counter, PDF, and notification behavior where applicable.
- Do not mutate Xero directly from portal functions.
- Add explicit admin warnings for invoices already synced to Xero.
- Add tests for invoice line items and counter transaction.

### Phase 6: Reports

- Implement income report.
- Implement attendance report.
- Implement student/class utilisation reports.
- Add CSV, PDF, and spreadsheet export.
- Add tests for date filtering and aggregation.

### Phase 7: Hook up final design

- Keep the UI layer thin.
- Connect designed components to `src/backend/*Api.js`.
- Add end-to-end smoke tests for critical flows.

## Decisions and clarification needed before coding

### Still needs clarification

1. Firestore read strategy: after rules are created, decide whether portal list/detail pages can read Firestore directly under admin-only rules or whether all reads should go through admin-only Cloud Functions.

### Answered decisions

1. Cloud Functions ownership: the portal repo is now the authoritative backend/functions repo for the active production function set.
2. Portal admins can create any user type: `admin`, `tutor`, or `parent`.
3. Every portal-created user needs both a Firebase Auth account and a fully populated `users/{uid}` Firestore document.
4. Admin-created users should get a password reset/invite email, using the existing SendGrid-backed email setup from the app functions.
5. Firestore rules are not set yet; they should be added to source control when created.
6. Deletion policy baseline: hard-delete archived enrolments; soft-delete or hide Xero-synced invoices; allow hard-delete for unsynced draft/test invoices; use carefully scoped hard-delete for users/students/classes unless app-side soft-delete filtering is added first.
7. Invoice/Xero policy: portal changes should touch Firestore only for now. If Xero also needs changing, show an admin message instructing them to edit Xero manually.
8. Payment policy: no parent/customer payment flow belongs in this portal.
9. Report definitions: income reports should support multiple views.
10. Attendance scope: attendance modification stays in the app. Portal can view and modify classes, and reports can read attendance data.
11. Term source of truth: use `/Users/thomassowmi/Development/Tenacity/lib/src/models/term_model.dart` as the current reference, noting its read/write field inconsistency.
12. Pricing source: pricing and one-off billing logic can remain in the app for now.
13. Enrolment lifecycle: use `Active` and `Archived` tabs, with individual delete available for archived enrolments.
14. Audit retention: keep six months of admin action history.
15. Report exports: support CSV, PDF, and spreadsheet formats.
16. Production data cleanup: existing documents are considered fine; no broad backfill is currently required.
17. Student creation flow: both bundled (inside `adminCreateUser` for parent role, via `students[]` input array) and standalone (`adminCreateStudent` with optional `parentIds`).
18. `acceptPendingEnrolment` migration: replace with `adminAcceptEnrolment` callable rather than keeping both. Portal UI was deployed before functions on 2026-05-13, and the live function list now has `adminAcceptEnrolment` present and `acceptPendingEnrolment` absent.
19. Enrolment delete policy: soft-delete by default (`adminDeleteEnrolment`); hard-delete only via `adminPurgeEnrolment` which guards against downstream records (`createdParentId`/`createdStudentId`) and requires `confirmId` match.
20. Enrolment update scope: pre-accept fields only; frozen once `status === "accepted"`.

## Immediate next step

Phases 1, 2, 3, and 4 are complete and deployed.

The next backend implementation step is **Phase 5: Invoice management**.
