# Tenacity portal v2 roadmap

This roadmap turns the current admin portal notes into a v2 release plan focused mainly on UI and operational usability.

The v2 goal is not to rebuild the backend. The backend is already broad enough for the main admin workflows. v2 should make the existing portal usable, remove internal implementation details from the interface, and shape each page around the decisions admins actually need to make.

## Release goal

Ship a cleaner admin portal that is useful for day-to-day back-office work:

- A dashboard that shows useful business and operational information.
- Navigation that works clearly on desktop and remains readable on mobile for emergency access.
- List and detail pages that show names, dates, states, and actions instead of backend IDs.
- Class detail pages that become the primary place for waitlist and attendance-document context.
- Invoice and report pages that focus on revenue visibility.
- Settings reduced to audit visibility unless another setting is backed by a real admin need.

## Scope decisions

- v2 is mainly a UI/UX release.
- Backend work should be included only when needed to make a UI concern real, such as invoice PDF download repair or audit-log reads.
- The dashboard should include revenue, overdue invoices, pending enrolments, upcoming classes, and recent audit activity.
- The dashboard does not need waitlist or attendance-gap summaries in v2.
- Waitlist management should be embedded inside class detail pages, not treated as a standalone primary page.
- Enrolment UI should use archived as the record-keeping state. Deleted enrolments should not be a normal visible concept in v2.
- Mobile support is for readable emergency access, not full phone-first administration.
- Reports should include revenue graphs for v2. Broader report types can remain future discovery work.

## Non-goals

- Do not move daily tutor attendance marking into the web portal.
- Do not duplicate parent payment flows from the app.
- Do not add search unless there is a specific high-value search target.
- Do not expose Firestore document IDs, user IDs, class IDs, invoice IDs, or enrolment IDs as primary UI content.
- Do not keep prototype or developer explanation text in the production UI.
- Do not build report categories beyond revenue graphs unless Josh confirms their usefulness.

## Phase 1: Shell, login, and navigation cleanup

Status: completed in v2 Phase 1 shell cleanup.

Purpose: make the portal feel like a production admin tool before deeper workflow work starts.

### Tasks

- [x] Remove the `prod tenacity tutoring b8eb2` environment text from the login page and sidebar.
- [x] Redesign or simplify the login layout so there is no large unused empty region.
- [x] Remove or repurpose the alert icon in the top bar. If notifications are not actionable, remove it.
- [x] Remove global search unless a real implementation is added for specific collections.
- [x] Review the sidebar labels and route groups so page names match what admins use.
- [x] Add a mobile navigation pattern for emergency access, such as a collapsible menu or drawer.
- [x] Confirm every protected route remains admin-gated through the existing Firebase custom claim flow.

### Completed implementation

- Removed visible Firebase project/environment labels from login and sidebar.
- Replaced the two-column login layout with a focused login panel.
- Removed placeholder global search and disabled notification controls from the top bar.
- Added mobile drawer navigation with overlay, close button, and route-selection close behaviour.
- Added focused shell and login regression tests.

### Acceptance criteria

- [x] Login screen has no obvious dead space or internal environment label.
- [x] Sidebar does not show Firebase project implementation details.
- [x] Top bar contains only useful controls.
- [x] Mobile viewport provides a readable way to move between pages.
- [x] No production UI control suggests a feature that is not implemented.

## Phase 2: Dashboard v2

Status: completed in v2 Phase 2 dashboard replacement.

Purpose: replace the current placeholder dashboard with a useful operational landing page.

### Proposed dashboard sections

- [x] Revenue overview:
  - [x] Current month revenue.
  - [ ] Previous term comparison where the data is available.
  - [x] Unpaid and overdue invoice totals.
  - [x] Simple revenue trend graph.
- [x] Pending work:
  - [x] Pending enrolments needing review.
  - [x] Recent actions from the audit log.
- [x] Upcoming operations:
  - [x] Upcoming classes for the next day.
  - [x] Current term summary if term data is reliable.
- [x] Quick actions:
  - [x] Review enrolments.
  - [x] Open classes.
  - [x] Open invoices.
  - [x] Open audit log.

### Data sources

- [x] Use existing report callables for revenue and invoice totals where possible.
- [x] Use direct Firestore reads for low-risk summaries such as pending enrolments and upcoming classes.
- [x] Use `adminAuditLogs` if the audit log read path is available under the final admin read strategy.

### Completed implementation

- Replaced the placeholder dashboard with live-loading operational summaries.
- Added current-month paid revenue from `adminIncomeReport`.
- Added overdue and unpaid invoice totals from direct invoice reads.
- Added pending enrolment, invoice draft, and recent audit action quick links.
- Added tomorrow's class schedule and current active term summary.
- Added a simple revenue trend chart using backend report rows.
- Added partial-failure handling so available dashboard sections still render when one source fails.
- Added a focused dashboard regression test using mocked backend API responses.

### Acceptance criteria

- [x] Dashboard gives admins a useful first screen without needing to open every page.
- [x] Revenue graph is based on real data, not mock data.
- [x] Pending-work counts link to the relevant filtered page or route.
- [x] Empty states explain the current state without developer-oriented wording.

### Deferred item

- Previous term comparison remains deferred because the current dashboard does not yet have a confirmed term-comparison contract.

## Phase 3: Enrolments cleanup

Status: completed in v2 Phase 3 enrolment cleanup.

Purpose: make enrolment review clearer and remove backend-facing details.

### Tasks

- [x] Remove enrolment ID from normal list and detail UI.
- [x] Remove explanatory text such as `Loaded directly from the shared Firestore enrolments collection`.
- [x] Replace archived/deleted framing with an archived-only record-keeping model in the visible UI.
- [x] Keep destructive or purge-level operations out of the main v2 flow unless required for staff operations.
- [x] Make accepted, pending, and archived states visually distinct.
- [x] Ensure archived enrolments can be hidden by default and accessed through a clear filter or tab.
- [x] Review detail page field order so student, parent, selected classes, and acceptance action are the main content.

### Completed implementation

- Removed enrolment IDs from list row subtitles, detail breadcrumbs, and detail card subtitles.
- Removed the shared-Firestore implementation note from the enrolment list.
- Removed deleted/all tabs from the enrolment list and filtered deleted records out of the normal list view.
- Removed soft delete and permanent purge actions from the normal detail action panel.
- Standardised visible states to Pending, Accepted, and Archived.
- Kept archive/restore available as the visible record-keeping path.
- Kept student, parent/carer, selected class, subject, emergency, and additional intake details in the main detail panel.
- Added focused tests for list/detail behaviour and backend-ID/destructive-action removal.

### Acceptance criteria

- [x] Admins can review and accept an enrolment without seeing backend IDs or storage explanations.
- [x] Archived enrolments are still accessible but do not compete with active work.
- [x] There is no normal UI path that presents deleted enrolments as an everyday state.

## Phase 4: People cleanup

Status: completed in v2 Phase 4 people cleanup.

Purpose: make parent, student, tutor, and admin records readable by humans rather than by database shape.

### Tasks

- [x] Remove user IDs and student IDs from primary list and detail UI.
- [x] Sort people alphabetically by last name by default.
- [x] Review whether `created` and `updated` fields are useful. If retained, move them to a compact metadata area.
- [x] For students, show primary parent by name, not ID. If this requires a backend modification then indicate that *before* starting this phase.
- [x] Keep student subject create/edit inputs constrained to exact supported values rather than free text.
- [x] Move invoice information higher in the person detail layout.
- [x] Reduce the vertical space taken by action panels.
- [x] Keep backend IDs available only in a developer/debug copy control if there is a real support need.

### Completed implementation

- Removed backend IDs from normal People list row subtitles and detail card subtitles.
- Removed backend IDs from normal student primary-parent display by resolving parent names from already-loaded user records.
- Sorted parent, tutor, admin, and student list rows by last name, then first name.
- Removed user/student IDs from list search inputs so search reflects visible human-facing fields.
- Moved created/updated values into compact metadata rows inside the detail panel.
- Moved invoice information into the upper right detail column for parents with paid and outstanding totals only.
- Stacked parent invoice and action cards in the right detail column so Actions sits directly below the compact invoice summary.
- Removed the invoice card from student detail pages.
- Removed role subtitles under People detail names and removed Firestore implementation copy from class assignment sections.
- Replaced invoice ID fallback labels with generic invoice labels when no invoice number is available.
- Reduced action-panel copy and spacing so actions take less vertical space.
- Replaced free-typed student subject fields with fixed `Maths` / `English` options on create and edit.
- Added backend student validation so direct callable use rejects unsupported subject strings or casing.
- Added focused People list/detail tests for sort order, primary-parent names, invoice placement, backend-ID removal, parent invoice balance labels, student invoice-card removal, and tutor copy cleanup.
- Added focused student subject modal tests for fixed-option payloads.

### Backend note

- Showing primary parent by name did not require a backend change because the People detail page already loads user records alongside the student record.

### Acceptance criteria

- [x] People lists scan by name first.
- [x] Parent/student relationships are readable without copying IDs.
- [x] Student subjects use exact supported values (`Maths`, `English`) in both UI and backend validation.
- [x] The invoice summary is visible without excessive scrolling.
- [x] Metadata does not dominate the person detail page.

## Phase 5: Classes, waitlist, and attendance-document details

Purpose: make class detail pages the main operational view for class state, waitlist, roster, and generated attendance documents.

Status: completed in v2 Phase 5 class detail restructure.

### List page tasks

- [x] Confirm term creation is now supported by backend term-management callables; keep term setup out of the classes area and expose it through a dedicated Terms page.
- [x] Add the dedicated Terms page under System navigation with real `terms` reads and `adminCreateTermsForYear` / `adminUpdateTerm` actions.
- [x] Rename class state to focus on capacity: full or not full.
- [x] Remove misleading labels such as `active` versus `full` where those are being mixed.
- [x] Remove `setup needed` unless it maps to a specific actionable setup problem.
- [x] Remove class ID from normal UI.
- [x] Move the `Class` field, such as `5-10`, near the state column rather than first.
- [x] Group class rows by day with day dividers and show class times in 12-hour format.

### Class detail tasks

- [x] Move attendance documents higher on the class detail page.
- [x] Reduce the space taken by the permanent roster when it is not the main task.
- [x] Embed waitlist entries inside class details.
- [x] Remove the normal `generate attendance` action from the class detail page.
- [x] Make attendance documents clickable.
- [x] Add an attendance-document detail view or panel showing:
  - [x] attendance date and week.
  - [x] class details.
  - [x] tutor or tutors.
  - [x] students currently included in that attendance document.
  - [x] any relevant attendance status fields already present in the data.

### Completed implementation

- Reordered the class detail grid so attendance documents are the first card in the main column, followed by the embedded waitlist, then the permanent roster.
- Replaced the table-based roster with compact student name chips that link to the student detail page.
- Embedded a Waitlist card that always renders, with an empty state and a Manage link when entries exist.
- Removed the page-header "Generate attendance" action and the inline "Generate" button on the attendance card; generation lives in Attendance maintenance.
- Made attendance rows clickable and added an attendance-document modal showing date, week, term, tutors by name, students by name, cancelled status, and last-updated metadata.
- Replaced the backend class ID on the detail card and breadcrumb with the human class label; sorted attendance docs by date descending and resolved term IDs to readable labels.
- Reused 12-hour time formatting from the classes list across the detail page and modal.
- Fixed `listAttendance` to order by `date` instead of `weekNum`; Firestore's `orderBy` silently excludes documents missing the ordered field, so newer attendance docs using the `weekNumber` field were never returned.
- Filtered the attendance document list to show only past docs and the current week's doc; future pre-generated docs are hidden until their week arrives.
- Fixed `weekNum` references in the class detail page to use the correct Firestore field name `weekNumber`.

### Acceptance criteria

- [x] Class pages show capacity and roster state without backend IDs.
- [x] Waitlist is visible in the relevant class context.
- [x] Attendance documents are discoverable and inspectable from class detail.
- [x] Manual attendance generation is not presented as a routine class-detail action.

### Deferred item

- Local dummy waitlist data during design review was not added because the live waitlist data was already sufficient to verify the embedded card behaviour, and the roadmap explicitly forbids shipping dummy waitlist data.

## Phase 6: Invoices and PDF download

Purpose: make invoice work cleaner and expose only operationally useful Xero state.

Status: completed in v2 Phase 6 invoice cleanup and PDF repair.

### Tasks

- [x] Remove invoice ID from normal invoice list and detail UI.
- [x] Sort invoices by due date from soonest to latest by default.
- [x] Within the same due date, sort by amount.
- [x] In invoice details, reduce the Xero banner to the useful state: synced to Xero or not synced to Xero.
- [x] Keep detailed Xero warning text only where it affects an edit or delete action.
- [x] Repair storage bucket or storage-path handling so invoice PDF download works.
- [x] Make PDF download failure states explicit and actionable.

### Completed implementation

- Removed the doc-ID secondary line from the Invoices list, dropped the parent-ID and Xero-ID fields from search, and updated the search placeholder accordingly.
- Sorted invoices by due date ascending (rows without a due date go last), then by amount descending so the most-urgent / highest-value rows surface first.
- Removed `Parent ID` from the invoice detail card and the doc-ID secondary line under each linked student.
- Replaced the long "Synced to Xero" info banner with a compact `Synced to Xero` / `Not synced to Xero` badge above the invoice summary.
- Reworded the delete-invoice modal to plain language, dropped the developer-style `acknowledgeXeroWarning: true` literal, and switched the confirmation field to the user-facing invoice number while still passing the doc ID to the backend callable.
- Replaced the legacy "stored at … but no download URL" toast with a thrown `not-found` `BackendError` so PDF failure modes are categorical.
- Surfaced the failure category in the toast title (`PDF not found`, `Access denied`, `Storage unreachable`, generic `PDF unavailable`) using error codes mapped from Firebase Storage errors in `getDownloadUrlForPath`.
- Added a derived `storageBucket` default of `${projectId}.firebasestorage.app` in `firebaseConfig` so PDF downloads work when `VITE_FIREBASE_STORAGE_BUCKET` is not set; this matches the backend's storage bucket.
- Updated and expanded `invoicesApi.getInvoicePdf` tests for the direct-`downloadUrl` path, the storage-fallback path, and the `not-found` throw.

### Acceptance criteria

- [x] Invoice list defaults to the order staff are most likely to act on.
- [x] Invoice detail shows Xero sync status without noisy implementation detail.
- [x] PDF download works for invoices with generated PDFs.
- [x] PDF download failures identify whether the issue is missing file, permission, or backend retrieval failure.

## Phase 7: Revenue reports

Purpose: give admins a useful finance reporting view without overbuilding speculative reporting.

### Tasks

- Add interactive revenue graph or graphs using real report data.
- Include date-range controls suitable for weekly, monthly, term, and custom views if supported by the report API.
- Include invoice totals that match dashboard finance figures.
- Keep CSV, spreadsheet, or PDF exports only where already supported and useful.
- Add a future discovery note for attendance, utilisation, and enrolment reporting after speaking with Josh.

### Acceptance criteria

- Reports page answers basic revenue questions visually.
- Dashboard revenue numbers and reports revenue numbers use the same source or explain any intentional difference.
- Non-revenue reports are not presented as finished v2 features.

## Phase 8: Audit log

Status: completed in the dedicated audit-page slice.

Purpose: remove low-value settings and make the page useful for admin accountability.

### Tasks

- [x] Replace the current settings page with an audit-focused page.
- [x] Show recent admin actions from `adminAuditLogs`.
- [x] Provide filters by actor/search, target type, action, and row limit where the data supports them.
- [x] Keep integration/status information out of the page because it is not the purpose of the audit workflow.
- [x] Remove settings controls that do not change real portal behavior.

### Completed implementation

- Removed the Settings page from the sidebar and routed System navigation to `/audit`.
- Added a dedicated Audit page with action, user, target, timestamp, row-limit, action, target, and search controls.
- Preserved `/settings` as a redirect to `/audit` for old links.
- Kept reads backed by the Firestore `adminAuditLogs` collection.
- Added expandable rows for before/after snapshots, payload summaries, actor UID, request ID, and audit document ID.

### Acceptance criteria

- [x] Settings no longer feels like a placeholder page.
- [x] Audit log is readable and useful for tracing admin changes.
- [x] Any remaining settings/status cards are backed by real data.

## Mobile emergency-access standard

v2 does not need a phone-first admin workflow, but it must remain usable when an admin needs to check something from a phone.

Status: completed in the shared responsive layout pass.

### Requirements

- [x] Navigation must be available on small screens.
- [x] Tables should degrade into readable rows, cards, or horizontally scrollable regions without hiding critical fields.
- [x] Detail pages should keep primary identity and status fields near the top.
- [x] Primary actions should remain reachable without relying on hover.
- [x] Modals must fit within the viewport.

### Completed implementation

- Kept the mobile sidebar and backdrop behavior in the shared app shell.
- Made page headers and page actions stack cleanly on phone widths.
- Added touch-friendly horizontal table scrolling with a stable table minimum width.
- Tightened mobile modal sizing and stacked modal footer actions.
- Made filter bars, cards, pagination, hero sections, and invoice line-item rows degrade cleanly on narrow screens.
- Fixed the login summary pills so `Enrolments`, `Classes`, and `Invoices` remain readable at phone width.
- Browser-checked the login page at 390 × 844 with no horizontal overflow; protected route checks are covered through shared shell/page tests until Playwright main-route auth setup is added.

### Acceptance criteria

- [x] Admin can sign in, open enrolments, open classes, inspect a class detail page, and inspect invoices from a phone viewport.
- [x] Mobile does not need to be the fastest way to complete complex edits.

## Implementation order

1. Shell, login, navigation cleanup.
2. Dashboard v2 data and layout.
3. Enrolments and people cleanup.
4. Classes detail page restructure, including embedded waitlist and attendance-document details.
5. Invoice list/detail cleanup and PDF repair.
6. Revenue reports.
7. Audit page.
8. Mobile emergency-access pass across all v2 routes. ✓

This order front-loads the global visual and navigation issues, then works through the highest-traffic operational pages before ending with cross-page mobile verification.

## Verification plan

For each implementation slice:

- Run the relevant unit tests.
- Run `npm run build`.
- Run `git diff --check`.
- Review affected pages manually in desktop and mobile viewports.
- Confirm no page displays mock data unless it is explicitly a local development fixture and cannot reach production.
- Confirm no backend IDs are displayed as normal user-facing labels unless the page is a deliberate debug or audit view.

For invoice PDF repair:

- Verify a real or emulator-backed invoice PDF download path.
- Confirm permission failures and missing-file failures are distinguishable.

For dashboard and reports:

- Confirm graph totals match the backend report response.
- Confirm empty, loading, and error states render clearly.

## Future discovery

These items should not block v2, but should be decided before a later reporting or operations release:

- Which reports Josh actually wants beyond revenue.
- Whether attendance and utilisation reporting should be summary-only or drillable.
- Whether term edits need extra guardrails once historical attendance/reporting policy is finalised.
- Whether global search has enough value to justify proper implementation.
- Whether deleted enrolment records need a separate admin recovery or audit-only path.
