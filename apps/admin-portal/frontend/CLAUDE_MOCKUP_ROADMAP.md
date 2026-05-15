# Claude mockup conversion roadmap

This roadmap converts Claude Design's static prototype into the production Tenacity web portal UI.

The mockup is a design source, not an implementation source. Treat its layout, component shapes, workflow coverage, and visual language as the reference. Do not copy its runtime architecture into the app.

## Current inputs

- Live frontend: `../src`, `../index.html`, root `package.json`, root `vite.config.js`.
- Firebase backend: `../backend/functions`.
- Firebase config: `../firebase.json`, with functions source `backend/functions`.
- Firestore indexes: `../backend/firestore.indexes.json`.
- Backend plan: `../backend/PLAN.md`.
- Claude prototype: `../Tenacity Web Portal UI Design/`.
- Prototype screenshots: `../Tenacity Web Portal UI Design/screenshots/`.
- Prototype design tokens: `../Tenacity Web Portal UI Design/styles/tokens.css`.
- Prototype app styles: `../Tenacity Web Portal UI Design/styles/app.css`.
- Prototype component globals: `../Tenacity Web Portal UI Design/js/ui.jsx`.
- Prototype mock data: `../Tenacity Web Portal UI Design/js/mock.jsx`.
- Prototype views: `../Tenacity Web Portal UI Design/js/views/*.jsx`.

## Directory decision

The live Vite frontend currently remains at the repo root. This `frontend/` directory is the planning area for the UI conversion until the frontend code itself is deliberately moved.

Do not move `src/`, `index.html`, root `package.json`, or `vite.config.js` into `frontend/` until the hosting, build, deploy, and local development commands are updated in the same change. Firebase Hosting currently serves root `dist`.

## Product target

Build the portal as the staff back-office surface for Tenacity Tutoring:

- Enrolment review and lifecycle management.
- User, parent, tutor, admin, and student management.
- Class setup, roster maintenance, and attendance generation.
- Waitlist review and promotion.
- Invoice draft, invoice, PDF, Xero-warning, and delete flows.
- Reports and exports.
- Settings, audit visibility, integration status, and maintenance entry points where backed by real data.

The Flutter app remains the parent, tutor, and lightweight admin mobile workflow. The portal should not duplicate daily tutor attendance marking, parent payment collection, messaging, or app profile flows unless a backend contract explicitly supports that portal action.

## Non-negotiable implementation rules

- Keep Firebase Auth as the auth source.
- Keep admin gating based on Firebase custom claim `role: "admin"`.
- Use direct Firestore reads for low-risk list/detail reads.
- Use callable Cloud Functions for writes, multi-document updates, Auth changes, invoice actions, report generation, and destructive operations.
- Do not write directly to Firestore for mutations that already have backend callables.
- Do not fake success states. Every submit action must await the real backend or be disabled as not implemented.
- Do not keep mock arrays in production views.
- Do not use the prototype hash router.
- Do not use Babel-in-browser or globals from `window.*`.
- Keep backend field names exactly compatible with the Flutter app.
- Keep destructive actions typed or otherwise explicit where backend requires confirmation.
- Show backend warnings, especially Xero warnings, before final destructive or externally visible actions.
- Keep text dense and operational. Avoid marketing-style copy in the app shell.

## Prototype parts to keep

Keep these from Claude's mockup:

- Left navigation groups: Overview, Operations, Finance, System.
- Dense dashboard with term, enrolment, waitlist, finance, and operational queue summaries.
- Shared shell: sidebar, topbar, search placeholder, user menu, badges, and environment marker.
- Page header pattern with crumbs, title, status, and primary actions.
- Table, filter bar, tabs, badge, stat card, empty state, modal, slide-over panel, toast, and typed-confirm components.
- Feature coverage across enrolments, people, classes, attendance, waitlist, invoices, reports, and settings.
- Xero warning banners on invoice edit and delete.
- Attendance maintenance as a repair/generation screen, not a daily marking screen.
- Report export controls for CSV, XLSX, and PDF.

## Prototype parts to replace

Replace these before production wiring:

- `app.html` and `index.html` static shell.
- `<script type="text/babel">` loading.
- `window.Views`, `window.App`, `window.navigate`, and other globals.
- Hash routes such as `#/enrolments/e_001`.
- Mock arrays in `js/mock.jsx`.
- `setTimeout` fake backend outcomes.
- Static system health claims.
- Demo credentials and Google sign-in shortcut in the mock login.
- In-app feature explainer copy that exists only because it is a prototype.
- Manual enrolment creation button unless a real backend create-enrolment path is added.

## Target frontend architecture

Create a clear frontend service and feature structure before porting every screen:

```text
src/
  app/
    App.jsx
    routes.jsx
  backend/
    callable.js
    firestoreReads.js
    storage.js
    enrolmentsApi.js
    usersApi.js
    studentsApi.js
    classesApi.js
    attendanceApi.js
    waitlistApi.js
    invoicesApi.js
    reportsApi.js
    settingsApi.js
    schemas.js
  components/
    Badge.jsx
    Banner.jsx
    Button.jsx
    EmptyState.jsx
    Field.jsx
    Modal.jsx
    PageHeader.jsx
    Panel.jsx
    SearchInput.jsx
    StatCard.jsx
    Table.jsx
    Tabs.jsx
    ToastProvider.jsx
    TypedConfirm.jsx
  layout/
    AppShell.jsx
    Sidebar.jsx
    Topbar.jsx
  features/
    dashboard/
    enrolments/
    people/
    classes/
    attendance/
    waitlist/
    invoices/
    reports/
    settings/
  styles/
    tokens.css
    app.css
```

Use this as a destination shape. It does not all need to land in one change.

## Route map

Use React Router routes, not hash routes:

| Route | Screen | Data source |
| --- | --- | --- |
| `/login` | Staff login | Firebase Auth |
| `/` | Dashboard | Firestore reads and report summaries |
| `/enrolments` | Enrolment list | `enrolments` |
| `/enrolments/:enrolmentId` | Enrolment detail | `enrolments/{id}` plus callables |
| `/people` | People tabs | `users`, `students`, `classes` |
| `/people/:kind/:id` | Parent/tutor/admin/student detail | `users/{uid}` or `students/{id}` |
| `/classes` | Class list | `classes`, `users`, `waitlistEntries` |
| `/classes/:classId` | Class detail | `classes/{id}`, attendance subcollection |
| `/attendance` | Attendance maintenance | `classes`, `terms`, attendance callables |
| `/waitlist` | Waitlist list | `waitlistEntries`, `classes`, `users`, `students` |
| `/invoices` | Invoice list | `invoices`, `invoiceDrafts`, `users`, `students` |
| `/invoices/:invoiceId` | Invoice detail | `invoices/{id}` or `invoiceDrafts/{id}` |
| `/reports` | Reports | report callables |
| `/settings` | Settings and audit | config reads, `adminAuditLogs`, `terms` |

## Backend API layer

Create the API layer before building the full UI. Every feature component should depend on these methods rather than raw Firebase calls.

### `callable.js`

Responsibilities:

- Wrap `httpsCallable(functions, name)`.
- Normalize Firebase callable errors into `{ code, message, details }`.
- Preserve warning arrays returned by backend functions.
- Expose a simple `callFunction(name, payload)` helper.
- Keep region `us-central1` through existing `functions` export.

### `firestoreReads.js`

Responsibilities:

- Shared helpers for `getDoc`, `getDocs`, `query`, `where`, `orderBy`, `limit`, cursors, and timestamp formatting.
- Explicit collection names only.
- One normalization function per document type.
- Never mutate Firestore.

### Feature API methods

Create methods with stable names:

```text
enrolmentsApi:
  listEnrolments(filters)
  getEnrolment(id)
  acceptEnrolment(id)
  archiveEnrolment(id)
  unarchiveEnrolment(id)
  updateEnrolment(id, updates)
  deleteEnrolment(id, reason)
  purgeEnrolment(id, confirmId, reason)

usersApi:
  listUsers(filters)
  getUser(uid)
  createUser(payload)
  updateUser(uid, updates)
  deleteUser(uid, confirmEmail)
  adjustLessonTokens(uid, mode, value, reason)

studentsApi:
  listStudents(filters)
  getStudent(id)
  createStudent(payload)
  updateStudent(id, updates)
  deleteStudent(id, confirmFullName)
  linkStudentToParent(parentId, studentId)
  unlinkStudentFromParent(parentId, studentId)

classesApi:
  listClasses(filters)
  getClass(id)
  createClass(payload)
  updateClass(id, updates, propagationOptions)
  deleteClass(id, confirmClassId, deleteAttendance)

attendanceApi:
  listAttendance(classId, filters)
  generateAttendanceForClass(payload)
  regenerateAttendanceForTerm(payload)

waitlistApi:
  listWaitlist(filters)
  promoteWaitlistEntry(entryId)
  updateWaitlistEntryStatus(entryId, status, note)

invoicesApi:
  listInvoices(filters)
  listInvoiceDrafts(filters)
  getInvoice(id)
  createInvoice(payload)
  createInvoiceDraft(payload)
  updateInvoice(id, updates)
  deleteInvoice(id, confirmInvoiceId, acknowledgeXeroWarning)
  getInvoicePdf(id)

reportsApi:
  incomeReport(filters)
  invoiceAgingReport(filters)
  attendanceReport(filters)
  studentEnrolmentReport(filters)
  classUtilisationReport(filters)
  exportReport(reportType, format, rows, fileName)
```

## Data model corrections from the mockup

Apply these corrections while wiring:

- User creation requires `phone`; the mock makes phone look optional.
- Role changes are not part of `adminUpdateUser`; do not build role edit UI until there is a backend role-change flow.
- Email changes are not part of `adminUpdateUser`; avoid editable email fields unless backed by Auth update logic.
- Student parent arrays are changed through link/unlink functions, not direct student update.
- Parent lesson token corrections should use `adminAdjustLessonTokens`, not `adminUpdateUser`, when recording a reason matters.
- Enrolment edit is allowed only before acceptance and not after deletion.
- Enrolment purge requires `confirmId`.
- Enrolment archive refuses accepted and deleted records.
- Class deletion requires `confirmClassId` and `deleteAttendance: true`, and backend refuses enrolled students or waitlist references.
- Class update propagation needs explicit UI controls because it can affect future attendance.
- Attendance class generation uses `classId`, `termIds`, `fromDate`, and `overwrite`.
- Attendance term regeneration uses `termId`, optional `classIds`, `fromDate`, and `overwrite`.
- Invoice drafts belong in `invoiceDrafts`, not `invoices`.
- Invoice statuses are only `unpaid`, `paid`, and `overdue`.
- Invoice update payload must wrap changes as fields accepted by `adminUpdateInvoice`.
- Invoice delete requires `confirmInvoiceId` and `acknowledgeXeroWarning` when `xeroInvoiceId` exists.
- Invoice PDF returns a Storage path; frontend must turn it into a downloadable URL with Firebase Storage.
- Report exports can return base64 for XLSX/PDF; frontend must convert base64 to a Blob and trigger a download.
- Settings health must not claim live system state unless it comes from a real check.

## Implementation phases

### Phase 0: Repository and planning baseline

Status: started.

- [x] Move backend package under `../backend/functions`.
- [x] Move Firestore indexes under `../backend/firestore.indexes.json`.
- [x] Move backend plan under `../backend/PLAN.md`.
- [x] Point `../firebase.json` at the new backend paths.
- [x] Create this frontend roadmap.
- [ ] Decide whether the live Vite app should later move from root into `frontend/`.
- [ ] If moving the live Vite app later, update Vite, npm, Firebase Hosting, README, and deployment commands in the same change.

Acceptance:

- `npm --prefix ../backend/functions run smoke` works from this roadmap directory.
- Root `npm run build` still builds the current frontend.
- Firebase Functions source resolves to `backend/functions`.

### Phase 1: Shared design system and shell

Goal: replace the current lightweight dashboard shell with the prototype shell.

Status: in progress. The production app shell and first shared components are now in the live root Vite app. Real Firebase Auth gating has been restored after local UI verification.

Tasks:

- [x] Move prototype tokens into `src/styles/tokens.css`.
- [x] Move only the reusable app CSS into `src/styles/app.css`.
- [x] Convert prototype `Icon` usage to a production icon strategy for the current shell.
- [ ] Prefer `lucide-react` if adding an icon dependency is acceptable.
- [x] Build first shared components: `Button`, `Badge`, `PageHeader`, `StatCard`, `EmptyState`, `Table`, and `ConfirmDialog`.
- [ ] Build remaining shared components: `Banner`, `Modal`, `Panel`, `ToastProvider`, `TypedConfirm`, `Tabs`, and `SearchInput`.
- [x] Build `AppShell` with grouped sidebar, topbar, user area, and environment marker.
- [x] Restore current `AuthProvider` and `ProtectedRoute` behavior after UI verification.
- [x] Add temporary admin auth bypass in `AuthProvider` for local UI verification.
- [ ] Show signed-in email and admin claim state from real auth after bypass removal.
- [ ] Add responsive sidebar behavior that works on mobile.

Acceptance:

- [x] `/` uses the new shell.
- [x] `/enrolments` and `/enrolments/:id` render inside the new shell.
- [x] Login remains separate from the app shell after real auth is restored.
- [x] Build succeeds.

### Phase 2: Frontend backend layer

Goal: give every view a real data contract before porting the full mockup.

Status: in progress. The API layer exists and the enrolment views now consume it; remaining work is to harden shared UI error/loading primitives as more feature pages are wired.

Tasks:

- [x] Create `src/backend/callable.js`.
- [x] Create `src/backend/firestoreReads.js`.
- [x] Create API modules for enrolments, people, students, classes, attendance, waitlist, invoices, reports, and settings.
- [x] Add timestamp normalization helpers.
- [x] Add Firebase Storage download helper for invoice PDFs.
- [ ] Add consistent loading, empty, permission, validation, and backend-error UI primitives across all features.
- [x] Add lightweight client validators that mirror backend constraints.

Acceptance:

- [x] Existing enrolment accept flow uses `enrolmentsApi.acceptEnrolment`.
- [x] Existing enrolment list uses `enrolmentsApi.listEnrolments`.
- [x] Enrolment backend errors render with actionable messages.

### Phase 3: Enrolments

Goal: replace the current enrolment list/detail with the prototype workflow using live data.

Status: in progress. List and detail are wired to live Firestore/callables and visually verified under the temporary auth bypass. Pending/archived edit mode is implemented and covered by frontend payload tests plus backend emulator tests. No production enrolment was modified during verification.

Tasks:

- [x] Implement tabs for active queue, accepted, archived, deleted, and all.
- [x] Use `status` when present and preserve support for older `archived` booleans.
- [x] Add search by student, carer, email, and enrolment ID.
- [x] Add filters for year and status.
- [x] Build detail sections for student, carer, emergency contact, classes, notes, and lifecycle.
- [x] Wire accept to `adminAcceptEnrolment`.
- [x] Wire archive and unarchive.
- [x] Wire update for editable pending/archived fields.
- [x] Wire soft delete with a required UI reason.
- [x] Wire purge with typed `confirmId`.
- [x] Disable edit/accept flows when backend status forbids them.

Acceptance:

- [x] Existing accepted enrolments show frozen state.
- [x] Accepted enrolment responses show created parent and student IDs.
- [x] Archive/delete/purge backend failures are visible.
- [x] No mock enrolment data remains.
- [x] Verify edit-save against an emulator fixture.

### Phase 4: People and students

Goal: implement parent, tutor, admin, and student management.

Status: started. The read-only `/people` list and `/people/:kind/:id` detail routes are wired into the shell and use live `users`, `students`, `classes`, `invoices`, and `invoiceDrafts` reads for role tabs, search, local pagination, relationship summaries, invoice summaries, and class assignments. Create, edit, link, token, and delete actions remain intentionally unavailable.

Tasks:

- [x] List users by role with search and pagination.
- [x] List students with grade, subjects, parent links, and class counts.
- [ ] Create parent/tutor/admin through `adminCreateUser`.
- [ ] Create student through `adminCreateStudent`.
- [x] Build parent detail: linked students, invoices, lesson tokens, contact details.
- [x] Build tutor/admin detail: assigned classes, account details.
- [ ] Build student detail: parents, primary parent, classes, invoices, delete preview. Current slice covers parents, primary parent, classes, and invoices; delete preview remains.
- [ ] Wire `adminUpdateUser` only for supported fields.
- [ ] Wire `adminUpdateStudent` only for supported fields.
- [ ] Wire link and unlink parent/student actions.
- [ ] Wire lesson token adjustments with reason.
- [ ] Wire delete user and delete student typed confirmations.

Acceptance:

- UI never offers unsupported email or role edits.
- Parent/student links remain symmetric through backend functions.
- Deletion blockers and cleanup previews match backend preconditions.

### Phase 5: Classes and attendance maintenance

Goal: implement class setup and attendance generation.

Tasks:

- [ ] List classes with day, time, capacity, tutor, waitlist, and setup state.
- [ ] Build class detail with roster, tutors, waitlist summary, and attendance docs.
- [ ] Wire create class to `adminCreateClass`.
- [ ] Wire update class to `adminUpdateClass`.
- [ ] Add propagation controls for future attendance updates.
- [ ] Wire delete class with blockers, typed `confirmClassId`, and `deleteAttendance`.
- [ ] Build attendance maintenance screen for class and term scopes.
- [ ] Wire `adminGenerateAttendanceForClass`.
- [ ] Wire `adminRegenerateAttendanceForTerm`.
- [ ] Display run result: considered, written, skipped existing.

Acceptance:

- UI writes `day`, `startTime`, `endTime`, `capacity`, `tutors`, and `enrolledStudents`.
- UI never writes `dayOfWeek` or `weekNumber`.
- Attendance maintenance is clearly separate from daily attendance marking.

### Phase 6: Waitlist

Goal: implement waitlist review and promotion.

Tasks:

- [ ] Read `waitlistEntries` and join display data from users, students, and classes.
- [ ] Add tabs for active, offered, accepted, and history.
- [ ] Add filters by class and search by parent/student.
- [ ] Wire `promoteWaitlistEntry`.
- [ ] Wire `updateWaitlistEntryStatus`.
- [ ] Show promotion preview: roster update, future attendance update, status transition.
- [ ] Preserve app-owned waitlist semantics.

Acceptance:

- Promote action uses the existing callable rather than direct Firestore writes.
- Status changes show backend errors and do not mutate UI optimistically without confirmation.

### Phase 7: Invoices

Goal: implement invoice and draft workflows safely.

Tasks:

- [ ] List invoices by status, parent, Xero sync state, and search.
- [ ] List drafts from `invoiceDrafts`.
- [ ] Build invoice detail with line items, totals, status, Xero/Stripe metadata, PDF state, and admin notes.
- [ ] Build invoice create and draft create form.
- [ ] Add line item total validation.
- [ ] Add admin adjustment handling for overrides.
- [ ] Wire `adminCreateInvoice`.
- [ ] Wire `adminCreateInvoiceDraft`.
- [ ] Wire `adminUpdateInvoice`.
- [ ] Surface warnings returned by update.
- [ ] Wire `adminGetInvoicePdf` and Storage download URL.
- [ ] Wire `adminDeleteInvoice` with Xero acknowledgement and typed invoice ID.

Acceptance:

- Creating a real invoice warns that Xero/on-create side effects may run.
- Draft creation never writes to `invoices`.
- Xero-synced invoice delete cannot proceed without acknowledgement.
- PDF download works from Storage path returned by backend.

### Phase 8: Reports and exports

Goal: implement real report screens over backend report functions.

Tasks:

- [ ] Build report selector for income, invoice aging, attendance, student enrolment, and class utilisation.
- [ ] Wire `adminIncomeReport`.
- [ ] Wire `adminInvoiceAgingReport`.
- [ ] Wire `adminAttendanceReport`.
- [ ] Wire `adminStudentEnrolmentReport`.
- [ ] Wire `adminClassUtilisationReport`.
- [ ] Wire `adminExportReport`.
- [ ] Convert CSV text responses to downloads.
- [ ] Convert XLSX/PDF base64 responses to Blob downloads.
- [ ] Keep filters synchronized with generated report output.

Acceptance:

- Reports are generated from backend functions, not client aggregation of large collections.
- Export filenames and file types are correct.
- Date filters use valid date ranges before calling the backend.

### Phase 9: Settings, audit, and maintenance

Goal: keep settings useful without inventing health data.

Tasks:

- [ ] Show static Firebase project configuration from env/config.
- [ ] Show Node runtime warning from docs or a real backend source.
- [ ] Read recent `adminAuditLogs`.
- [ ] Read `terms`.
- [ ] Hide or disable unsupported term editing until backend exists.
- [ ] Hide live integration health claims unless backed by real checks.
- [ ] Add maintenance shortcuts only where a callable exists and the action is safe from the portal.

Acceptance:

- Settings does not claim SendGrid, Stripe, Xero, or Cloud Functions health unless verified.
- Audit table reads real audit records.
- Maintenance buttons require confirmation and real backend calls.

### Phase 10: Testing and hardening

Goal: stop treating the UI as manually verified only.

Tasks:

- [ ] Add a frontend test stack, preferably Vitest plus React Testing Library.
- [ ] Add tests for API payload builders and error normalization.
- [ ] Add smoke tests for auth routing and protected routes.
- [ ] Add component tests for destructive confirmation flows.
- [ ] Add Playwright or equivalent browser checks for main routes.
- [ ] Add responsive checks for desktop and mobile widths.
- [ ] Add build and test commands to package scripts.
- [ ] Run backend smoke after frontend API changes that depend on callables.

Acceptance:

- `npm run build` passes.
- Frontend tests pass.
- `npm --prefix backend/functions run smoke` passes.
- Critical flows have coverage: login redirect, enrolment accept, class create payload, invoice delete acknowledgement, report export Blob.

## Slice order

Use small slices in this order:

1. Shell and shared components.
2. Backend API layer.
3. Enrolments.
4. People and students.
5. Classes.
6. Attendance maintenance.
7. Waitlist.
8. Invoices.
9. Reports.
10. Settings and audit.
11. Frontend tests.
12. Optional move of live Vite frontend into `frontend/`.

Each slice should include:

- Updated UI code.
- Backend/API wiring for that slice.
- Loading, empty, error, and permission states.
- Review against backend payload schemas.
- Build verification.
- Tests proportional to risk.

## Open decisions

- Whether to keep the live Vite frontend at the repo root or move it into `frontend/`.
- Whether to add `lucide-react` for production icons or convert the prototype icons into local components.
- Whether audit logs should ship in the first settings version.
- Whether manual enrolment creation should be added to backend or removed from the UI.
- Whether term editing belongs in this portal now or after a dedicated term backend slice.
- Whether global search should be implemented immediately or shown only when backed by route-specific search.
- Whether Firestore list reads should remain direct reads for all large collections or move selected list screens behind backend read APIs later.

## Final readiness checklist

- [x] No prototype files are imported directly from `../Tenacity Web Portal UI Design/`.
- [ ] No mock arrays are used in production views.
- [ ] No hash routing remains.
- [ ] No fake timeout success states remain.
- [ ] All writes go through callables.
- [ ] Direct Firestore reads are read-only.
- [ ] Backend warnings are visible before final action.
- [ ] Destructive actions require the same confirmations the backend expects.
- [ ] App-compatible Firestore field names are preserved.
- [ ] Build passes.
- [ ] Frontend tests pass.
- [ ] Backend smoke passes.
- [ ] README commands match the final directory structure.
