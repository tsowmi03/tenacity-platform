# Claude Design frontend brief for the Tenacity web portal

Last updated: 2026-05-14
Repo: `/Users/thomassowmi/Development/tenacity-web-portal`
Firebase project: `tenacity-tutoring-b8eb2`
Primary audience: Claude Design, then the engineer wiring the generated UI into this repo.

## How to use this brief in Claude Design

Claude Design works best when given the goal, audience, content needs, codebase context, and functional requirements. Anthropic's current guidance says projects can include screenshots, codebases, images, existing files, and design-system context. It also warns that very large codebases can cause lag, so attach this brief and the specific frontend files rather than the whole repo when possible.

Useful Claude Design context links:

- [Get started with Claude Design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design)
- [Introducing Claude Design by Anthropic Labs](https://www.anthropic.com/news/claude-design-anthropic-labs)
- [Using Claude Design for prototypes and UX](https://claude.com/resources/tutorials/using-claude-design-for-prototypes-and-ux)

Suggested first Claude Design prompt:

```text
Use this backend brief to design the Tenacity Tutoring admin portal.
The brief describes the product scope, backend contracts, required features,
data shapes, workflows, states, and integration constraints. You have creative
freedom over layout, visual style, component choices, and interaction design.
Make sure every feature and backend requirement in the brief has a clear
frontend path.
```

## Product role

The Tenacity web portal is the back-office administration surface for Tenacity Tutoring. It shares the same Firebase project and Firestore database as the existing Flutter app.

The Flutter app remains the mobile experience for parents, tutors, and lightweight admin work such as timetable viewing, attendance marking, announcements, messaging, waitlist handling, invoice viewing, and Stripe payment.

The web portal should handle heavier staff workflows:

- Enrolment review, edit, acceptance, archive, soft delete, and safe purge.
- User, parent, tutor, admin, and student management.
- Parent/student linking and lesson token corrections.
- Class creation, update, deletion, and future attendance generation or repair.
- Invoice draft creation, invoice creation, invoice edits, invoice deletion, and invoice PDF retrieval.
- Report views and CSV, PDF, and XLSX exports.
- Waitlist review and promotion workflows.
- Operational maintenance, warnings, and audit-aware destructive actions.

The frontend should cover all admin surfaces listed in this brief.

## Authentication and authorization

All staff sign in with Firebase Authentication. Admin-only screens require the signed-in user's Firebase custom claim:

```text
role: "admin"
```

Frontend requirements:

- Show a loading state while auth and token claims resolve.
- Show an admin-only access-denied state for signed-in users without `role: "admin"`.
- Refresh the ID token after role-sensitive changes if a user is promoted or repaired later.
- All admin write operations should call Cloud Functions, not direct Firestore writes.

## Backend architecture

Runtime and entrypoints:

- Functions runtime: Node.js 20.
- Function region for new portal callables: `us-central1`.
- Deploy entrypoint: `backend/functions/lib/index.js`.
- Frontend Functions client: `getFunctions(app, "us-central1")`.

Read/write split:

- Use direct Firestore reads for list and detail views.
- Use admin-only callable Cloud Functions for mutations, cross-document writes, auth changes, attendance generation, invoice operations, report aggregation, and anything that can affect Stripe, Xero, notifications, or app compatibility.

Audit logging:

- New admin mutation functions write best-effort entries to `adminAuditLogs`.
- The UI does not need to show audit logs in the first design unless there is room for an admin settings or activity area.

Error model:

- Callables throw standard Firebase `HttpsError` codes such as `unauthenticated`, `permission-denied`, `invalid-argument`, `failed-precondition`, `not-found`, `already-exists`, `resource-exhausted`, and `internal`.
- The UI should show field-level validation where possible and action-level errors for backend preconditions.

## External integrations and side effects

Stripe:

- Parent/customer payment remains in the Flutter app.
- Portal invoice screens should display Stripe payment metadata where available.
- Parent payment collection is out of scope for the portal.

Xero:

- Existing invoice triggers may create and email Xero invoices when new docs are written to `invoices`.
- Portal invoice functions do not directly edit or void Xero invoices.
- If an invoice already has `xeroInvoiceId`, update and delete actions may return warnings. The UI must display these warnings and require explicit acknowledgement before deleting Xero-synced invoices.
- `adminGetInvoicePdf` can fetch/cache an invoice PDF through Xero and returns a Storage path.

SendGrid:

- Parent welcome emails and enrolment accepted emails are sent by backend functions.
- Portal should show email result/warning states. Email sending stays server-side.

Notifications:

- Existing triggers send admin notifications for waitlist and enrolment events and user notifications for announcements, chat, feedback, invoices, attendance, and reminders.
- The portal does not need to manually send FCM notifications except through existing backend functions.

## Firestore collections

The portal shares these collections with the Flutter app:

- `users`
- `students`
- `classes`
- `classes/{classId}/attendance`
- `terms`
- `enrolments`
- `invoices`
- `invoiceDrafts`
- `waitlistEntries`
- `userTokens`
- `adminAuditLogs`
- `counters`
- `xeroTokens`

The UI must preserve existing field names because the Flutter app parses these documents.

## Core data shapes

### `users/{uid}`

Shared fields:

```text
firstName: string
lastName: string
role: "admin" | "tutor" | "parent"
email: string
phone: string
fcmTokens: string[]
unreadChats: map<string, number>
activeChats: string[]
termsAccepted: boolean
acceptedTermsVersion: string | null
acceptedTermsAt: Timestamp | null
readAnnouncements: string[]
createdAt, createdBy, updatedAt, updatedBy
```

Parent fields:

```text
students: string[]
lessonTokens: number
stripeCustomerId?: string
```

### `students/{studentId}`

```text
firstName: string
lastName: string
parents: string[]
grade: string
subjects: string[]
primaryParentId?: string
createdAt, createdBy, updatedAt, updatedBy
```

### `classes/{classId}`

```text
type: string
day: string
startTime: string
endTime: string
capacity: number
enrolledStudents: string[]
tutors: string[]
createdAt, createdBy, updatedAt, updatedBy
```

Compatibility notes:

- Use `day`, not `dayOfWeek`.
- Use `weekNum`, not `weekNumber`.
- Times are `HH:mm` strings.
- Permanent enrolments are `enrolledStudents`.

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

Attendance doc IDs follow:

```text
{termId}_W{weekNum}
```

### `terms/{termId}`

```text
year: string
termNum: number
startDate: Timestamp
endDate: Timestamp
weeksNum: number
status: "active" | "inactive" or older boolean shape
invoicesGeneratedAt?: Timestamp | null
```

Frontend should read terms for filters and attendance generation. Keep the existing term field names.

### `enrolments/{enrolmentId}`

Intake fields:

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

Lifecycle fields:

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

Line item shape:

```text
studentName?: string
description: string
quantity: number
unitAmount: number
lineTotal: number
isAdminAdjustment?: boolean
```

Invoice compatibility rules:

- Valid statuses are `unpaid`, `paid`, and `overdue`.
- `amountDue` is the payable amount.
- `amountDueComputed` stores the computed total when supplied.
- If `amountDueOverride` is used, final `lineItems` total must match the override, usually via an `Admin adjustment` line.
- Drafts belong in `invoiceDrafts`, not `invoices`, so they do not trigger Xero.

## Local function export set

`npm --prefix backend/functions run smoke` currently exports these portal admin callables:

```text
adminAcceptEnrolment
adminAdjustLessonTokens
adminArchiveEnrolment
adminAttendanceReport
adminClassUtilisationReport
adminCreateClass
adminCreateInvoice
adminCreateInvoiceDraft
adminCreateParent
adminCreateStudent
adminCreateUser
adminDeleteClass
adminDeleteEnrolment
adminDeleteInvoice
adminDeleteStudent
adminDeleteUser
adminExportReport
adminGenerateAttendanceForClass
adminGetInvoicePdf
adminIncomeReport
adminInvoiceAgingReport
adminLinkStudentToParent
adminPurgeEnrolment
adminRegenerateAttendanceForTerm
adminStudentEnrolmentReport
adminUnarchiveEnrolment
adminUnlinkStudentFromParent
adminUpdateClass
adminUpdateEnrolment
adminUpdateInvoice
adminUpdateStudent
adminUpdateUser
```

The migrated app/backend bundle also exports existing app callables, triggers, schedulers, and request handlers for payments, Xero, announcements, chat, feedback, timetable operations, waitlists, and reminders. For the designed portal, treat the admin callables above as the main write contract.

## Callable contracts for the UI

All functions below require an authenticated admin unless noted otherwise by the legacy app behavior. Frontend calls should use `httpsCallable(functions, "<name>")`.

### User and student management

#### `adminCreateUser`

Purpose: create an Auth user and Firestore user doc. Can create bundled student docs for a parent.

Input:

```text
role: "parent" | "tutor" | "admin"
firstName: string
lastName: string
email: string
phone: string
temporaryPassword?: string
sendWelcomeEmail?: boolean
lessonTokens?: number
students?: StudentCreateInput[]  // parent only
```

Returns:

```text
uid
role
studentIds
authUserCreated
welcomeEmail
```

Frontend requirements:

- Role selector with parent-only lesson tokens and bundled student fields.
- Conflict state if the Auth user/doc already exists.
- Confirmation after welcome email attempt.

#### `adminCreateParent`

Purpose: create a parent account linked to existing students.

Input:

```text
firstName, lastName, email, phone
temporaryPassword?: string
sendWelcomeEmail?: boolean
lessonTokens?: number
studentIds: string[]
```

Returns `uid`, `role: "parent"`, `studentIds`, `authUserCreated`, and `welcomeEmail`.

Frontend requirements:

- Search/select existing students.
- Use this for "student exists, add parent".

#### `adminUpdateUser`

Input:

```text
uid: string
firstName?: string
lastName?: string
phone?: string
lessonTokens?: number  // parent only
```

Returns `uid` and `updatedFields`.

Frontend requirements:

- Role and email changes are out of scope for this function.
- Lesson tokens should be edited through `adminAdjustLessonTokens` for correction workflows because it records before/after and reason.

#### `adminDeleteUser`

Input:

```text
uid: string
confirmEmail: string
```

Behavior:

- Blocks self-delete.
- Requires exact email confirmation.
- Refuses parent delete while `students[]` is non-empty.
- Removes tutor/admin from classes and future attendance.
- Deletes Firestore user, Auth user, and user tokens best effort.

Frontend requirements:

- Destructive user deletion flow requiring typed email.
- For parents, show linked students and require unlink/delete first.
- Display cleanup summary.

#### `adminCreateStudent`

Input:

```text
firstName: string
lastName: string
grade: string
subjects?: string[]
parentIds?: string[]
primaryParentId?: string
```

Returns `studentId` and `parentIds`.

Frontend requirements:

- Supports orphan student creation. The frontend should make that state explicit.
- If linking parents, primary parent must be one of the selected parents.

#### `adminUpdateStudent`

Input:

```text
studentId: string
firstName?: string
lastName?: string
grade?: string
subjects?: string[]
primaryParentId?: string
```

Returns `studentId` and `updatedFields`.

Frontend requirements:

- Parent linking uses separate link/unlink functions.
- Primary parent selector must come from the existing linked parents.

#### `adminDeleteStudent`

Input:

```text
studentId: string
confirmFullName: string
```

Behavior:

- Requires typed full name.
- Removes student from linked parent arrays.
- Removes student from classes and future attendance.
- Deletes `students/{studentId}`.
- Caps cleanup to 450 writes.

Frontend requirements:

- Destructive student deletion flow requiring typed full name.
- Preview linked parents, enrolled classes, and future attendance impact.

#### `adminLinkStudentToParent` and `adminUnlinkStudentFromParent`

Input:

```text
parentId: string
studentId: string
```

Returns `parentId`, `studentId`, and `mode`.

Frontend requirements:

- Parent detail page should support linked students.
- Student detail page should support linked parents.
- Unlinking can clear or move `primaryParentId`; explain this in the confirmation copy.

#### `adminAdjustLessonTokens`

Input:

```text
uid: string
reason?: string
delta?: number
set?: number
```

Exactly one of `delta` or `set` is required. Returns `uid`, `before`, and `after`.

Frontend requirements:

- Token adjustment flow with "add/subtract" and "set exact balance" modes.
- Show before and after before submitting.
- Require a reason in the UI even though the backend allows it to be optional.

### Enrolment lifecycle

#### `adminAcceptEnrolment`

Input:

```text
enrolmentId: string
```

Behavior:

- Idempotent if already accepted.
- Creates or reuses parent Auth user.
- Creates or updates parent user doc.
- Creates student doc.
- Links parent/student.
- Adds student to selected classes.
- Adds student to future attendance docs.
- Sets accepted lifecycle fields.
- Sends enrolment accepted email.

Returns created parent/student IDs and acceptance status.

Frontend requirements:

- Surface all intake fields, selected classes, and acceptance summary.
- Disable or relabel action for accepted/deleted enrolments.
- On success, link to created parent and student records.

#### `adminUpdateEnrolment`

Input:

```text
enrolmentId: string
studentFirstName?: string
studentLastName?: string
studentYear?: string
studentSubjects?: string[]
classes?: array<{ id: string, day?: string, startTime?: string }>
carerFirstName?: string
carerLastName?: string
carerEmail?: string
carerPhone?: string
emergencyContactFirstName?: string
emergencyContactLastName?: string
emergencyContactPhone?: string
emergencyContactRelation?: string
allergies?: string
permissionToLeave?: boolean
additionalInfo?: string
```

Behavior: only pending or archived enrolments can be edited. Accepted and deleted enrolments are frozen.

Frontend requirements:

- Edit mode before acceptance.
- Clear frozen state for accepted enrolments.

#### `adminArchiveEnrolment` and `adminUnarchiveEnrolment`

Input:

```text
enrolmentId: string
```

Frontend requirements:

- Separate active and archived states.
- Archive action for pending/unaccepted items.
- Accepted enrolments remain archived as accepted history.

#### `adminDeleteEnrolment`

Input:

```text
enrolmentId: string
reason?: string
```

Behavior: soft delete.

Frontend requirements:

- Reason textarea.
- Deleted state must be clearly distinguishable from archived.

#### `adminPurgeEnrolment`

Input:

```text
enrolmentId: string
confirmId: string
```

Behavior: hard delete, refused if accepted records were created.

Frontend requirements:

- Rare maintenance action.
- Require typed enrolment ID.
- Treat as an advanced/destructive operation rather than a routine action.

### Class and attendance management

#### `adminCreateClass`

Input:

```text
id?: string
type: string
day: string
startTime: "HH:mm"
endTime: "HH:mm"
capacity: number
tutors?: string[]
enrolledStudents?: string[]
termIds?: string[]
generateAttendance?: boolean
```

Returns:

```text
classId
attendance: { considered, written, skippedExisting, termIds }
```

Frontend requirements:

- Class creation requires day, time, capacity, tutors, permanent students, and optional attendance generation.
- If attendance generation is enabled, show selected terms and estimated write impact.

#### `adminUpdateClass`

Input:

```text
classId: string
type?: string
day?: string
startTime?: "HH:mm"
endTime?: "HH:mm"
capacity?: number
tutors?: string[]
enrolledStudents?: string[]
propagateAttendance?: boolean
attendanceFromDate?: date
```

Returns `classId` and `futureAttendanceUpdated`.

Frontend requirements:

- Make future attendance propagation explicit when changing day, time, tutors, or permanent students.
- Default should preserve the backend default, which propagates unless disabled.
- Show count of future attendance docs updated after success.

#### `adminDeleteClass`

Input:

```text
classId: string
confirmClassId: string
deleteAttendance: true
```

Behavior:

- Refuses classes with enrolled students.
- Refuses classes with waitlist entries.
- Deletes attendance subcollection then class doc.

Frontend requirements:

- Destructive class deletion flow requiring typed class ID and explicit `deleteAttendance: true`.
- Show blockers: enrolled students and waitlist entries.

#### `adminGenerateAttendanceForClass`

Input:

```text
classId: string
termIds?: string[]
overwrite?: boolean
fromDate: date
```

Returns `classId`, `termIds`, `considered`, `written`, and `skippedExisting`.

Frontend requirements:

- Use for repair or setup.
- Require date/term selection.
- Show overwrite toggle with warning.

#### `adminRegenerateAttendanceForTerm`

Input:

```text
termId: string
classIds?: string[]
fromDate?: date
overwrite?: boolean
```

Returns `termId`, `classIds`, `considered`, `written`, and `skippedExisting`.

Frontend requirements:

- Term-level maintenance tool.
- Support "all classes" and selected classes.
- Show write counts after completion.

### Invoice management

#### `adminCreateInvoice`

Input:

```text
parentId: string
parentName: string
parentEmail: string
studentIds: string[]
weeks: number
amountDue: number
amountDueComputed?: number
amountDueOverride?: number
dueDate: date
lineItems: InvoiceLineItem[]
adminNotes?: string
invoiceNumber?: string
```

Returns `invoiceId`, `invoiceNumber`, and warnings.

Frontend requirements:

- Invoice creation requires parent/student selection and editable line items.
- Validate that line item total equals `amountDue` or override rules.
- Show warning that creation may trigger Xero invoice creation/email.
- Parent payment collection is out of scope.

#### `adminCreateInvoiceDraft`

Same input as `adminCreateInvoice`. Returns `draftId` and warnings.

Frontend requirements:

- "Save draft" action separate from "Create invoice".
- Drafts should be shown separately from real invoices.

#### `adminUpdateInvoice`

Input:

```text
invoiceId: string
status?: "unpaid" | "paid" | "overdue"
adminNotes?: string
amountDueOverride?: number
dueDate?: date
lineItems?: InvoiceLineItem[]
```

Returns `invoiceId` and warnings.

Frontend requirements:

- Show Xero warnings returned by backend.
- If marking paid, warn that existing Xero payment sync may run for synced invoices.
- Require line-item adjustment if amount override changes the payable amount.

#### `adminDeleteInvoice`

Input:

```text
invoiceId: string
confirmInvoiceId: string
acknowledgeXeroWarning?: boolean
```

Returns `invoiceId`, `hardDeleted`, `pdfDelete`, and warnings.

Frontend requirements:

- Destructive invoice deletion flow requiring typed invoice ID.
- If `xeroInvoiceId` exists, require explicit acknowledgement that Xero is unchanged.
- Display PDF delete result if present.

#### `adminGetInvoicePdf`

Input:

```text
invoiceId: string
```

Returns:

```text
invoiceId
pdfPath
source: "cache" | "xero"
```

Frontend requirements:

- Use for admin PDF retrieval.
- If there is no Xero invoice ID yet, show "PDF unavailable until Xero sync completes".
- The returned path is a Storage path, so the frontend needs a Storage download URL helper.

### Reports and exports

#### `adminIncomeReport`

Input:

```text
fromDate: date
toDate: date
basis?: "created" | "due" | "paid"
status?: "unpaid" | "paid" | "overdue" | "all"
groupBy?: "day" | "week" | "month" | "term" | "parent" | "student"
```

Returns `reportType`, `generatedAt`, `filters`, `summary`, and `rows`.

Metrics include invoice count, total invoiced, total paid, total unpaid, total overdue, average invoice value, Xero synced/unsynced, and Stripe payment intent count.

#### `adminInvoiceAgingReport`

Input:

```text
asOfDate?: date
```

Returns `summary`, `buckets`, `parentBalances`, and `invoices`.

Metrics include unpaid balances, aging buckets, oldest balances, missing Xero IDs, missing PDF paths, and unpaid invoices with Stripe payment intents.

#### `adminAttendanceReport`

Input:

```text
fromDate: date
toDate: date
classIds?: string[]
tutorIds?: string[]
studentIds?: string[]
includeCancelled?: boolean
groupBy?: "day" | "week" | "class" | "student" | "tutor"
```

Returns attendance summary and grouped rows.

Caveat for UI copy: current attendance data stores listed students, not an explicit present/absent event log. Use labels such as "students not present in attendance list" rather than definite absence language.

#### `adminStudentEnrolmentReport`

Input: none.

Returns summary, students by grade, students by subject, students by class, accepted enrolment-created students, students with no class, and linkage issues.

#### `adminClassUtilisationReport`

Input:

```text
fromDate: date
toDate: date
classIds?: string[]
```

Returns class-level attendance rows plus utilisation summary.

#### `adminExportReport`

Input:

```text
reportType: "income" | "invoiceAging" | "attendance" | "studentEnrolment"
format?: "csv" | "xlsx" | "pdf"
fileName?: string
report?: object  // nested report filters for the chosen type
```

Returns:

```text
reportType
format
fileName
contentType
rowCount
csv?: string
data?: base64 string
```

Frontend requirements:

- CSV returns text in `csv`.
- XLSX and PDF return base64 in `data`; frontend must convert to Blob before download.
- Export actions must respect the active report filters.

## Existing migrated app/backend functions

These are live backend capabilities from the migrated app bundle. Use them carefully in the portal because some are parent/tutor app workflows.

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
- `debugXeroAccountsAndTaxTypes`

Timetable and enrolment operations:

- `rolloverTermData`
- `deleteUserByUidV2`
- `dryRunCurrentTermInvoices`
- `enrollStudentOneOff`
- `cancelStudentForWeek`
- `rescheduleStudentToDifferentClass`
- `notifyStudentAbsence`
- `enrollStudentPermanentForParent`
- `enrollStudentPermanent`
- `unenrollStudentPermanent`

Waitlist:

- `joinWaitlist`
- `promoteWaitlistEntry`
- `updateWaitlistEntryStatus`
- `onWaitlistEntryCreatedNotifyAdmins`
- `onWaitlistEntryReactivatedNotifyAdmins`

Announcements, chat, and feedback:

- `createAnnouncement`
- `onAnnouncementCreated`
- `sendChatMessage`
- `onMessageReceived`
- `createFeedback`
- `onFeedbackCreated`

Notifications and reminders:

- `onAttendanceChangeNotifyAdmins`
- `onPermanentSpotOpened`
- `onPermanentEnrolmentNotifyAdmins`
- `dailyLessonAndShiftReminder`

Utility:

- `linkUsers`

## Required feature areas

The sections below describe feature coverage and required information. They are not layout instructions.

### App shell

Required capabilities:

- Access to Dashboard, Enrolments, People, Classes, Attendance, Waitlist, Invoices, Reports, and Settings.
- Display signed-in user, role, environment/project indicator, and sign-out.
- Global loading, empty, error, and access-denied states.

### Dashboard

Purpose: operational snapshot and fast routing.

Content:

- Pending enrolments.
- Classes needing setup or attendance generation.
- Overdue/unpaid invoice summary.
- Waitlist count and offered/active counts if available.
- Recent admin actions or warnings if audit log is included.
- Quick actions: create user, create class, create invoice, generate report.

### Enrolments

Required list capabilities:

- Separate active, archived, and deleted states if deleted enrolments are exposed.
- Search by student, carer, email.
- Filters by status, year, subject, class, created date.
- Operations: view, edit, accept, archive, delete.

Required detail capabilities:

- Intake summary.
- Student and carer fields.
- Class selections.
- Emergency/allergy/permission notes.
- Lifecycle status, accepted links, created parent/student.
- Actions: edit pending, accept, archive, unarchive, soft delete, purge only when allowed.

### People

User list capabilities:

- Filter by role: parent, tutor, admin.
- Search by name/email/phone.
- Show linked students and lesson token balance for parents.
- Operations: view, edit, token adjustment, delete.

User detail capabilities:

- Profile fields.
- Role and custom claim display.
- Parent students list.
- Tutor/admin class references if available.
- Action history if audit log is shown.

Student capabilities:

- Search by name, grade, subject, parent.
- Linked parent management.
- Primary parent selection.
- Class enrolments.
- Delete with impact preview.

### Classes

Required list capabilities:

- Filter by day, type, tutor, capacity, available spots.
- Show day/time, tutors, permanent enrolments, capacity, and waitlist count if available.

Required detail capabilities:

- Class fields.
- Permanent students.
- Tutors.
- Attendance subcollection summary by term.
- Future attendance propagation controls.
- Actions: edit, generate attendance, regenerate term, delete.

Class create/edit capabilities:

- Day selection.
- Time inputs in `HH:mm`.
- Capacity input.
- Tutor selection.
- Student selection.
- Optional attendance generation by term.

### Attendance maintenance

This is maintenance, not daily attendance marking.

Required capabilities:

- Generate attendance for a class.
- Regenerate attendance for a term.
- Preview selected term/classes/from date/overwrite.
- Show result counts: considered, written, skipped existing.

Daily attendance marking should remain in the Flutter app.

### Waitlist

Use direct Firestore reads from `waitlistEntries` plus the existing callables where appropriate.

Known states:

- `active`
- `offered`
- `accepted`
- `declined`
- `expired`
- `cancelled`

Required capabilities:

- Waitlist queue by class.
- Entry detail with parent/student/class reason.
- Promote entry to permanent enrolment through `promoteWaitlistEntry`.
- Update entry status through `updateWaitlistEntryStatus`.

Frontend requirement:

- Make promotion impact clear because it can add students to class enrolment and future attendance.

### Invoices

Required list capabilities:

- Filters: status, parent, student, due date, created date, Xero sync, Stripe payment state.
- Data fields: invoice number, parent, students, amount, status, due date, Xero, Stripe, PDF.

Required detail capabilities:

- Invoice fields.
- Line items.
- Xero ID and PDF path.
- Stripe payment metadata.
- Warnings for synced invoices.
- Actions: edit, get PDF, delete.

Create/edit capabilities:

- Parent/student selectors.
- Due date.
- Weeks.
- Line items with quantity, unit amount, line total.
- Admin adjustment line support.
- Draft and create actions.

### Reports

Required report types:

- Income.
- Invoice aging.
- Attendance.
- Student enrolment.
- Class utilisation.

Each report requires:

- Filters.
- Summary metrics.
- Data rows.
- Export actions for CSV, PDF, and XLSX where supported.
- Empty state for no matching rows.
- Generated timestamp and filter summary.

### Settings and maintenance

Useful first-version settings/maintenance data:

- Firebase project display.
- Runtime/deployment warnings.
- Xero connection status if readable.
- Legacy function notes.
- Index/rules status notes if maintained manually.

Broad function deploy controls are out of scope.

## Frontend implementation requirements

Create a backend service layer before wiring designed components:

```text
src/backend/
  callable.js
  firestoreReads.js
  usersApi.js
  studentsApi.js
  enrolmentsApi.js
  classesApi.js
  invoicesApi.js
  reportsApi.js
  waitlistApi.js
  schemas.js
```

Responsibilities:

- `callable.js`: wrap `httpsCallable`, normalize errors, and expose a typed-ish response shape.
- `firestoreReads.js`: shared query helpers, pagination, date conversion, and converters.
- Feature API files: expose simple methods such as `createUser(payload)`, `updateClass(payload)`, and `getIncomeReport(params)`.
- `schemas.js`: client-side validators that mirror backend constraints.

UI state requirements:

- Every mutation needs pending, success, validation error, permission error, and unknown error states.
- Destructive actions require typed confirmation where backend requires it.
- Xero warnings must be shown before and after invoice updates/deletes.
- Long-running operations should show progress-style loading copy even if the backend only returns at completion.
- Report exports should handle file generation and download locally.

Read-query requirements:

- Add pagination to large Firestore lists.
- Use indexes already source-controlled in `backend/firestore.indexes.json` where needed.
- Prefer stable sort orders: created date, name, due date, class day/time.
- Avoid broad unfiltered collection reads on screens that can grow large, except where current report functions intentionally aggregate server-side.

Responsive requirements:

- The same backend workflows must have a usable path on desktop, tablet, and mobile.
- Claude Design can choose the responsive structure.

Accessibility requirements:

- Clear keyboard focus.
- Safe focus handling for overlays or confirmation flows.
- Visible disabled states for unavailable actions.
- Form errors tied to fields.
- Color should not be the only status indicator.

## Brand context

Tenacity Tutoring brand context:

- Primary navy: `#1B3A6B`
- Accent light blue: `#4A90C4`
- Font reference: Calibri
- Business tagline: "Determination Meets Success"

Claude Design has freedom over visual direction, layout, typography treatment, component choices, and interaction patterns.

## Open product decisions

These are not blockers for Claude Design. Account for them in the design handoff:

- Whether audit logs appear in the first UI or remain backend-only.
- Whether deleted enrolments get their own tab or are hidden behind an advanced filter.
- Whether terms management is part of the first portal UI or only used as a filter/source for class attendance generation.
- Whether waitlist management should be a full section immediately or included under class detail first.
- Whether the dashboard should read live Firestore counts directly or wait for dedicated summary APIs later.

## Current technical gaps to respect

- No frontend test suite is configured.
- No lint script is configured.
- Firestore rules are not source-controlled yet.
- The visible UI has not yet been wired to most backend callables.
- Two legacy Xero functions remain in Firebase as `UNKNOWN` Node 18 functions: `generateXeroAuthUrl` and `xeroOAuthCallback`. A cleanup flow is out of scope until Xero redirect URIs are verified.
- Node.js 20 decommissions on 2026-10-30, so the backend runtime needs a later migration.
- Any remaining Runtime Config usage must migrate before March 2027.

## Verification evidence

Local smoke verification run on 2026-05-14:

```text
npm --prefix backend/functions run smoke
```

Result: all admin callables listed in this brief were exported locally from `backend/functions/lib/index.js`.

Repo docs state that Phases 1 to 6 are implemented and deployed, including user/student management, enrolment lifecycle, class/attendance management, invoice management, and reports. If a design depends on exact live deployment state, re-run `firebase functions:list --project tenacity-tutoring-b8eb2` before implementation.
