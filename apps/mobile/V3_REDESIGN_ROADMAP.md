# Tenacity App V3 Redesign Roadmap

- Last updated: 28 July 2026
- Working branch: `feat/mobile/v3-foundation` (monorepo `apps/mobile`)
- Roadmap status: Active — Phase 4 (admin experience)
- Primary design source: `/Users/thomassowmi/Desktop/Tenacity app redesign`

## 1. Purpose

This document is the delivery plan and active progress record for rebuilding the
Tenacity Flutter app to match the proposed V3 HTML designs while preserving the
existing production behaviour documented in `UI_REQUIREMENTS.md`.

The redesign covers three role experiences, delivered in this order:

- Parent: Dashboard, Timetable, Messages, Invoices.
- Tutor: Dashboard, Classes, Class Roll & Feedback, Announcements, Users,
  Messages.
- Admin: Dashboard, Classes, Announcements, Users, Messages, Invoices.

It also covers the shared and detail screens needed to make those reference
screens fully functional: authentication, terms, profiles, chat threads,
announcement details, user details, feedback, class-management flows, invoice
creation/payment, offline states, loading states, empty states, and errors.

### Delivery decisions (25 July 2026)

| Decision | Choice |
| --- | --- |
| Repository | Monorepo `apps/mobile`, for development **and** store releases. `tsowmi03/Tenacity` is the pre-migration repository and is legacy — it is not a release source. Neither repository has mobile release automation (no Fastlane, no release workflow), so releases are built locally and this is a change of working directory, not a pipeline migration. |
| Role order | **Parent → Tutor → Admin.** Supersedes the original tutor-first sequence. |
| Design-vs-data gaps | Backend contracts are **in scope**. New Firestore fields and Cloud Functions are part of this project, not deferred. |

Parent-first and backend-in-scope combine well: nearly all the heavy schema work
(tutor-session contract, roll completion, cover-needed, announcement read counts,
invoice reminders) sits behind tutor and admin screens. The parent screens need
only two small additions, so parent UI delivery is not blocked on contract design.

The tutor dashboard (T01) was built first under the original sequence. It stays
in the tree as the reference implementation the shared component library is
extracted from, and is completed in its own phase after the parent experience
ships.

## 2. Sources of truth

Use the sources below in this order when implementing or reviewing V3 work:

1. The role HTML files define the intended visual hierarchy, information
   density, terminology, navigation, and interaction entry points.
2. `UI_REQUIREMENTS.md` defines existing behaviour that must survive the
   redesign.
3. Current Flutter controllers, services, models, Firestore data, and security
   rules define what the app actually supports today.
4. The design-system README and CSS define brand tokens.
5. Product decisions recorded in this roadmap resolve gaps between the design
   and existing data.

### Reference snapshot

The hashes make changes to the external design folder detectable. Recalculate
them whenever the reference files change:

```bash
cd "/Users/thomassowmi/Desktop/Tenacity app redesign" && shasum -a 1 *.dc.html
```

All four hashes were re-verified on 25 July 2026 and are unchanged since the
20 July review — the reference designs have not moved.

| Reference | Purpose | SHA-1 at last review |
| --- | --- | --- |
| `Tenacity Tutor App.dc.html` | Six tutor reference screens | `11aa5b708c00ca2549af64b1ff4b0a00666a75be` |
| `Tenacity Parent App.dc.html` | Four parent reference screens | `9ebc557702ba3ab1a90168551309e53e4cde7709` |
| `Tenacity Admin App.dc.html` | Six admin reference screens | `dec2fbf8b889f613a31b4b043008c9f9db5bb93b` |
| `Tenacity Tutor App-print.dc.html` | Combined printable cross-check | `b8ed2e03dc89578301704e135a8a0279ff87e4c6` |
| `uploads/UI_REQUIREMENTS.md` | Behaviour-preservation inventory | Matches repository copy as of 20 July 2026 |
| `_ds/.../README.md` and `styles.css` | Brand and component guidance | Review when tokens change |
| `assets/` and `screenshots/` | Logos and visual validation references | Review per screen |

`Tenacity Tutor App-print.dc.html` repeats the tutor, parent, and admin layouts
in a printable wrapper. Treat the three role HTML files as the primary screen
specifications and the print file as a visual cross-check.

## 3. Definition of done

A V3 screen is complete only when all of the following are true:

- The layout, hierarchy, spacing, colour, typography, shape, and icon treatment
  closely match the applicable HTML reference.
- All existing role permissions and user flows from `UI_REQUIREMENTS.md` still
  work.
- Every visible value comes from real app data or an explicitly approved empty
  state. Reference placeholders are never shipped as fake production data.
- Loading, offline, empty, error, long-content, and narrow-screen states are
  designed and tested.
- Interactive controls have accessible labels, usable touch targets, sensible
  focus order, and adequate contrast.
- Widget tests cover the primary hierarchy and actions; controller/data tests
  cover non-trivial derivation.
- The screen has been manually compared with the source design at representative
  phone sizes.
- `dart format`, `flutter analyze`, the full Flutter test suite, and
  `git diff --check` pass at the end of its delivery phase.
- Any new backend contract has been verified against the real data path before
  implementation and documented here.

## 4. Active progress tracker

### Status key

- `[x]` Complete and accepted against the definition of done.
- `[-]` In progress or implemented with known acceptance gaps.
- `[ ]` Not started.
- `[!]` Blocked by an unresolved product, data, or backend decision.

### Overall snapshot

| Area | Complete | In progress | Not started | Blocked |
| --- | ---: | ---: | ---: | ---: |
| Reference screens | 10 / 16 | 5 | 1 | 0 |
| Design foundation workstreams | 4 / 8 | 3 | 1 | 0 |
| Supporting/detail workstreams | 7 / 10 | 2 | 1 | 0 |

**The parent experience is complete and accepted.** All four parent reference
screens (P01–P04) are visually accepted, along with the booking sheets (S07),
login and the offline surfaces (S01), and the contact picker and chat thread
(S04) — confirmed by the product owner on 28 Jul 2026. The shared inbox also
covers most of T06 and A05. The tutor and admin announcement flows (T04, A03
and S03) are complete after product-owner visual acceptance, and the terms
gate (S02) is complete after on-device verification. Profile/settings (S10) is
also done. The parent half of S09 covers the full payment and PDF path and is
accepted; its admin creation/review half remains, and the two P00 backend
contracts (payment card brand/last4, amount-due rounding) are deliberately
deferred to the end of the redesign rather than blocking this — see §7.

**The tutor experience is complete and accepted.** All six tutor screens
(T01–T06) were visually accepted by the product owner on 28 Jul 2026. T01 alone
remains `[-]`, for a single non-visual reason: its feedback-due attention row
needs a per-session feedback query the dashboard does not yet make. Everything
else in Phase 3 is closed.

### Foundation tracker

| ID | Workstream | Status | Current evidence / next action |
| --- | --- | --- | --- |
| F01 | Brand tokens | `[x]` | `design_tokens.dart` carries the brand colours, semantic status colours, radii (including the 28px sheet), shadows (including the upward sheet shadow), `AppSpacing`, `AppSizes`, `AppDurations`, and the three type families. `app_theme.dart` maps them onto `ThemeData`, replacing the `ColorScheme.fromSeed` that previously let Material defaults through. |
| F02 | Fonts and licensing | `[x]` | Bricolage Grotesque, Plus Jakarta Sans, and Newsreader are bundled; runtime font fetching is disabled; OFL licence is registered. Verified 25 Jul 2026: every `AppText` variant currently requested resolves to a bundled file. **Guardrail:** `google_fonts` matches on filename, and with runtime fetching off an unbundled weight throws and silently falls back to the default font. Only `BricolageGrotesque-Bold` (w700) is bundled, while the reference HTML loads Bricolage 500–800 — add the matching `.ttf` to `lib/assets/fonts/` before using any other display weight. Plus Jakarta has Regular/Medium/SemiBold/Bold; Newsreader has Italic only. |
| F03 | Brand assets | `[x]` | The white vertical logo used by the tutor dashboard is bundled. Audit horizontal, dark-background, app-icon, and accessibility variants before shared-shell work finishes. |
| F04 | Shared V3 components | `[-]` | `lib/src/ui/components/` holds `AppHeader`, `DetailHeader`, `MetricTile`, `ContentSheet`, `SectionLabel`, `LedgerRow`/`LedgerRowEmpty`, `AttentionList`, `StatusPill`/`PillButton`, `QuickActionTile`/`QuickActionGrid`, `SearchField`, `ConversationRow`, `SegmentedFilter`, `TimetableRow`, `WeekStrip`, `EmptyStateView`/`ErrorStateView`/`SkeletonBlock`, `AppBottomNavigation`, and — added 28 Jul 2026 — `AppBottomSheet`/`SheetActions` and `OfflineBanner`/`OfflineToast`. `QuickActionGrid` gained a `columns` parameter on 28 Jul 2026: it was hard-coded to two per row, which drew the admin reference's three-up action grid as two tiles plus a half-width orphan. Covered by `test/components_test.dart`. `AppBottomSheet` measures itself from the constraints it is handed rather than from `MediaQuery`, so it behaves inside a modal route and does not collapse where the media query has been replaced rather than extended. Remaining: a pull-to-refresh wrapper and a shared destructive-confirmation surface, both still written per screen. |
| F05 | Role dashboard routing | `[x]` | `DashboardRouter` selects by role, and all three roles now render their own V3 dashboard: `ParentDashboard`, `TutorDashboard` and — from 28 Jul 2026 — `AdminDashboard`. The legacy `HomeDashboard` remains only as the fallback for an unrecognised role, and is removed once role parity is proven in Phase 6. |
| F06 | Role navigation shells | `[x]` | `home_navigation.dart` defines typed `AppDestination`s and per-role `destinationsForRole`; `home_screen.dart` holds selection as a destination, not an index; profile is a pushed route. The `role == 'tutor'` styling conditionals are gone — `AppBottomNavigation` styles every role. **Two latent defects removed** — both were unreachable in production, and were correct only by coincidence rather than by construction: (1) `profile` mapped to index 5 for parent and tutor against 5-element screen lists, which would have thrown, but nothing ever passed `DashboardDestination.profile`; (2) `notification_service` used `selectTab(4)` for invoice reminders, which is Invoices for a parent but Messages for a tutor or admin — safe only because `invoice_notifications.js` sends that type solely to parent tokens. Either would have become a real bug the moment a tab was added or a notification was retargeted. Covered by `test/home_navigation_test.dart`. |
| F07 | Responsive/accessibility baseline | `[-]` | Widths and text scale are exercised per screen (320 / 402 / 430 at scale 1.0 and 1.3 in the parent dashboard tests). Still to define: semantics, focus behaviour, contrast rules, and a working golden harness. **Known blocker for goldens:** a trial run rendered the parent dashboard correctly in layout but drew Plus Jakarta Medium (w500) and Newsreader Italic as block glyphs. An isolated probe rendering all six variants — with and without `AppTheme.light` — came out correct, so the fonts, the token file and the app are fine; something about that widget tree leaves those two variants unresolved at capture time. Committing such a baseline would mask real font regressions, so no goldens are checked in yet. Solve this before adopting goldens as the visual-acceptance mechanism. |
| F08 | State and telemetry baseline | `[ ]` | Standardise refresh, retry, offline, skeleton/loading, empty, and error patterns. Decide whether V3 navigation/action failures need analytics or audit events. |

### Reference-screen tracker

Delivery order is parent (P), then tutor (T), then admin (A).

| ID | Role | Reference screen | Status | Flutter target / note |
| --- | --- | --- | --- | --- |
| P01 | Parent | Dashboard | `[x]` | `ParentDashboard`, `ParentDashboardView` and `buildParentDashboardViewData` implemented with today's classes, attention rows, feedback quote, and quick actions. Covered by 21 data tests and 17 widget tests across three viewports and text scale 1.3. Visually accepted by the product owner on 28 Jul 2026. **Resolved 25 Jul 2026:** parents keep five tabs. The reference design drops the Announcements tab and surfaces announcements only as a dashboard row; that was rejected because families must be able to browse announcements directly. The dashboard shows the newest unread announcement *in addition to* the tab, and both read from the same read-state so they cannot disagree. |
| P02 | Parent | Timetable | `[x]` | `ui/timetable/parent/` holds a pure adapter and view: per-child filter, week pager, week strip with day dots, day groups, and confirmed/one-off/cancelled sessions. `TimetableScreen` renders it for parents and routes every session tap into the existing `_showParentClassOptionsDialog`, so swap, absence, one-off and waitlist behaviour is unchanged rather than reimplemented. Covered by 17 data tests and 19 widget tests. **Documented exception:** the reference design lists only booked classes, so browsing and enrolling in a new class sits behind the `Book a one-off class` button, which pushes `TimetableScreen(browseOnly: true)`. That surface is now on the V3 design too — see S07. Visually accepted on device 25 Jul 2026, reconfirmed with the booking sheets on 28 Jul 2026. |
| P03 | Parent | Messages | `[x]` | `InboxScreen` rebuilt on the V3 design: navy header with unread count, search field and new-chat button, and a white sheet of conversation rows with squircle avatars, unread emphasis and count badges. The reference gives parents, tutors and admins the same inbox, so this is role-agnostic and largely covers T06 and A05 too — confirm against those references before marking them done. Search, swipe-to-delete with its offline guard, the new-chat route and thread navigation are unchanged. Timestamps now degrade time → Yesterday → weekday → date instead of always showing a clock time. Covered by 19 data tests plus component tests. Visually accepted by the product owner on 28 Jul 2026, alongside the now-complete chat thread and contact picker (S04). |
| P04 | Parent | Invoices | `[x]` | `InvoicesScreen` is on the V3 design with outstanding total, due summary, pay-all, unpaid cards, PDF and limited history. The S09 payment pass adds explicit success/cancel/failure/unconfirmed states, blocks duplicate payment while a receipt is pending, reuses client secrets after cancellation, reconciles the live paid state, coalesces PDF generation/open requests, and gives loading/error/retry states. `InvoiceController` now owns one replaceable subscription rather than leaking one on every entry; scope guards prevent a payment/PDF completion from crossing accounts. Covered by 17 data tests, 9 payment/PDF/widget tests and 3 stream-lifecycle tests. Verified with the live paid-history route and a non-persisting unpaid/pay-all preview on iPhone 16 Pro. Visually accepted by the product owner on 28 Jul 2026. **One deliberate deviation:** Bricolage Bold substitutes for the unavailable ExtraBold weight (F02). **Two accepted, deferred deviations (P00):** history omits `Visa ····4242` because the payment record has no card brand or last four digits, and the amount-due rounding/overdue rules are unconfirmed. Both are deliberately deferred to the end of the redesign — see §7. |
| T01 | Tutor | Dashboard | `[-]` | `TutorDashboardView` and `buildTutorDashboardViewData` implemented on the shared component library. The `rolls to mark` count and attention rows now read `Attendance.isRollComplete` rather than inferring from `updatedBy == 'system'`, so an admin editing a session no longer clears a tutor's outstanding roll. Visually accepted by the product owner on 28 Jul 2026. Remaining, and the only reason this is not `[x]`: the feedback-due attention row, which needs a per-session feedback query the dashboard does not yet make. |
| T02 | Tutor | Classes weekly grid | `[x]` | `ui/timetable/tutor/tutor_classes_{data,view}.dart` give the assigned week: week pager, day strip, day groups, and per-session `DONE` / `MARK ROLL` / `UPCOMING` / `CONFIRMED` / `CANCELLED` with an outstanding-rolls count in the header. Assignment takes the week's attendance document over the standing one, so a substitute sees the session and the usual tutor does not. Rows with a generated attendance document route into T03. Covered by 20 data tests. **Documented omission:** the reference's `Availability` and `Request a schedule change` controls are not shipped — see §7 and §11. Visually accepted by the product owner on 28 Jul 2026. |
| T03 | Tutor | Class Roll & Feedback | `[x]` | `ui/classes/tutor/class_roll_{data,view,screen}.dart` replace the shared `Edit Students & Attendance` sheet for tutors: per-student Here/Away, Ahead/On track/Needs support, and feedback, over the roster plus this week's visitors. Feedback is blocked until attendance is marked, required of present students and exempt for absent ones. `TutorSessionService.submitSession` writes feedback first and stamps the roll last, so a session is never marked complete while families are owed notes; the stamp is applied only once everyone is marked, so a partial roll saves without claiming to be finished. Re-submitting skips feedback already sent for the session. Unsaved changes are confirmed before leaving. Covered by 24 data tests. Visually accepted by the product owner on 28 Jul 2026. **Residual risk:** a live save has still not been run, because the test account writes to real families — the roll was driven end to end without submitting. |
| T04 | Tutor | Announcements | `[x]` | Shared V3 feed implemented with audience filtering, unread/earlier sections, audience badges, relative dates, pull-to-refresh and defensive loading/error/empty states. The V3 detail keeps link handling, marks a notice read once, and clears the navigation badge reactively. Covered by adapter and widget tests at 320, 402 and 430px with text scale 1.3. Visually accepted by the product owner on 27 Jul 2026. |
| T05 | Tutor | Users | `[x]` | `ui/users/tutor/tutor_users_{data,view}.dart` behind `UsersScreen` for tutors. Three tabs: **This week** (default) lists the students in the tutor's own sessions this week; **Students** and **Parents** are the full directory. Search covers names, years and children's names; each student row carries a `Feedback` shortcut, and in the full lists the tutor's own people are marked `YOURS` and sorted first. `This week` reads the **current calendar week's** attendance, fetched directly rather than from `TimetableController.attendanceByClass` — that cache holds whichever week the Classes pager was last left on, which made the directory change with unrelated navigation. Admins keep the legacy list until A04. Covered by 27 data tests. Visually accepted by the product owner on 28 Jul 2026. |
| T06 | Tutor | Messages | `[x]` | Covered by the P03 inbox rebuild: the `t-messages` reference is the same navy header, search field and conversation rows as the parent design, and `InboxScreen` is role-agnostic. The contact picker and chat thread (S04) are shared too. Verified on device signed in as a tutor on 28 Jul 2026. |
| A01 | Admin | Dashboard | `[-]` | `ui/dashboard/admin/admin_dashboard_{data,view}.dart` behind `AdminDashboard`, routed by `DashboardRouter` — admin no longer falls through to the legacy `HomeDashboard`. Header carries classes-today, need-action and outstanding metrics; the sheet carries NEEDS ACTION, HAPPENING NOW (falling back to the rest of the day when nothing is running) and the three quick actions. **Roll status is honest about what it knows:** `ROLL 5/6` only once the roll is stamped complete, `NO ROLL` before that — the stored attendance list holds present students only, so an unmarked roll and an all-absent one are indistinguishable and any earlier fraction would be a guess. The roster denominator is the union of the standing roster and whoever was marked present, so a one-off visitor cannot produce `ROLL 7/6`. Per §7: no cover row, no `Approve` on the one-off row, and no room on session rows. Covered by 16 data tests and 9 widget tests at 320/402/430 and text scale 1.3. Inspected on iPhone 16 Pro at 402 × 874 via a temporary preview entrypoint — the simulator is signed in as a parent and must not be signed out, so the screen was rendered against stub models pushed through the real adapter. **Fixed there:** the assigned tutor was appended to the row title, but a real class name plus the roll pill already fills the title, so the tutor fell past the ellipsis and was invisible on every row; it now sits on the subtitle, which room would have occupied had room not been excluded. Regression-tested. **Known cosmetic limit:** long class types still truncate in the title (`Year 11 Advanced Mat…`) — the same `LedgerRow` behaviour already accepted on the parent and tutor dashboards, so it is left alone rather than restyled a shared component unilaterally; raise at acceptance if it should change. **Remaining:** the New enrol student → class picker (currently routes to Classes, where enrolment lives), a per-class route for session and roll rows (arrives with A02), the sheet/bottom-navigation seam (the preview renders the view outside `HomeScreen`, so the nav bar was not in frame), and product-owner visual acceptance. |
| A02 | Admin | Classes | `[-]` | `ui/timetable/admin/admin_classes_{data,view}.dart`, rendered by `TimetableScreen` for admins — the legacy timetable body is now reachable only by an unrecognised role. A day pager over a time-grouped ledger, with `RUNNING` / `NO ROLL` / `DONE` / `FULL` / `N SEATS` / `CANCELLED`, seats counted against the roster **plus** this week's visitors, and the slot containing the current moment marked `Now`. **Every action routes into the existing admin dialogs** — `_showAdminClassOptionsDialog` for students, tutors, waitlist and cancellation, `_showAddClassDialog` behind `Add a class` — so class management keeps the behaviour it already had rather than being reimplemented. The reference's `Rooms` half of the toggle is excluded (one room), replaced by a `Tutors` grouping that lists a co-taught class under each tutor and sorts an `Unassigned` bucket last. Covered by 22 data tests and 10 widget tests at 320/402/430 and text scale 1.3. Inspected on iPhone 16 Pro through a temporary preview entrypoint. **Fixed there:** liveness was carried per time group, so in the tutor grouping — which has no time slots — a `NO ROLL` class running right now looked identical to one that finished that morning, since the one status covers both; `AdminSession.isLiveNow` now carries it per session and both groupings highlight it. **Remaining:** product-owner visual acceptance, the sheet/bottom-navigation seam, and conflict handling for concurrent tutor and capacity edits (S08). |
| A03 | Admin | Announcements | `[x]` | Admin feed implemented with All/Parents/Tutors filters, published/archived groups, audience badges, V3 create/edit form, archive/restore, and confirmed failure-safe deletion from the row or detail. Writes carry audit events; archived drafts do not notify their audience. The controller keys its cache by active/archive and audience scope, so entering admin after another role cannot reuse the wrong feed. Aggregate read counts are omitted: the contract has per-user read ids but no audience denominator or aggregate receipt query. Visually accepted by the product owner on 27 Jul 2026. |
| A04 | Admin | Users | `[-]` | `ui/users/admin/admin_users_{data,view}.dart` behind `UsersScreen` for admins — the legacy list is now reachable only by an unrecognised role. Parents/Students/Tutors tabs over a searchable directory: parents carry their children and token balance, students their year and subjects, tutors their role. Search matches name **and** subtitle, so a parent is findable by their child's name. Counts describe the whole directory rather than the filtered tab, so searching does not look like people have disappeared. **Status is overdue-only**, derived from the family's own unpaid invoices past their due date — the reference's `ACTIVE` and `TRIAL` have no source anywhere in the data and are not invented, and the `+` account-creation button is out of scope (§7/§11). The invoice read is best-effort: if it fails nobody is marked, rather than families being wrongly accused. Opening a person routes into the existing `UserDetailScreen`, so lesson tokens, enrolments, invoice PDF, unenrolment and account removal keep their behaviour and confirmations. Students carry no account, so nothing admin-only can be opened from their row. Covered by 16 data tests and 11 widget tests at 320/402/430 and text scale 1.3. Inspected on iPhone 16 Pro across the Parents and Students tabs. **Remaining:** product-owner visual acceptance, and the S05 admin detail screen is still the legacy one. |
| A05 | Admin | Messages | `[ ]` | Reskin the admin inbox while preserving search, unread, deletion, attachments, and receipts. |
| A06 | Admin | Invoices | `[-]` | `ui/invoices/admin/admin_billing_{data,view}.dart` behind `AdminBillingScreen`, now the admin `invoices` destination. Outstanding headline, unpaid/overdue counts, All/Overdue/Unpaid/Paid filters, an overdue ledger graded red past a week and amber before it, and recent payments. **The full console is retained, not replaced:** `AdminInvoiceView` keeps filter, sort, search, multi-select and bulk actions and is reached through `View all invoices` and any invoice row; its own reskin is S09. **Four reference elements are excluded** (§7/§11): `Send N reminders`, the per-row `Follow up`/`Remind` actions and the `reminded ×N` count — reminders are automatic and record nothing, so none could report what they did — and `Visa ····4242`, whose contract is the deferred P00 gate. In their place each overdue row shows **when the next automatic reminder falls**, derived from `invoiceReminderScheduler`'s own rule (due−7d, due date, then every 7 days) and pinned by tests that fail first if that schedule changes. Covered by 24 data tests and 10 widget tests at 320/402/430 and text scale 1.3. Inspected on iPhone 16 Pro. **Fixed there:** the reference's `border-left: 4px` accent was written as a non-uniform `Border` with a `borderRadius`, which Flutter rejects outright — the accent is now a sibling bar inside an evenly bordered card. **Remaining:** product-owner visual acceptance. |

### Supporting and detail-screen tracker

| ID | Workstream | Status | Scope |
| --- | --- | --- | --- |
| S01 | Login and signed-out offline state | `[x]` | `ui/auth/login_{form,view}.dart` with `login_screen.dart` as the container: the brand over a white sheet holding the form, one inline feedback panel, a loading state that keeps the button's size, and the reset link enabled on the email alone. Validation lives in one place instead of being written out per field. The offline guard on both sign-in and reset is unchanged. Covered by 13 form tests, 24 widget tests across three viewports and text scale 1.3, and 6 container tests. **No reference design exists for this screen.** The offline state closed 28 Jul 2026: `components/offline_surfaces.dart` holds the ambient `OfflineBanner` and the transient `OfflineToast`, both on brand tokens, and `OfflineAwareEmptyState` now uses `EmptyStateView` with offline-specific copy instead of bare centred text. Because the guard and the banner are app-wide, this reskins every role's offline surface, not just the signed-out one. Visually accepted by the account owner on 28 Jul 2026, including while genuinely signed out. **Known gap:** the offline surfaces themselves are covered by widget tests but have not been separately seen on device — the simulator shares the host's connection, so there is no way to take it offline without cutting the machine's network. Accepted as a residual risk rather than blocking sign-off, since the surfaces reuse the same tokens and layout primitives already verified elsewhere. |
| S02 | Terms acceptance | `[x]` | V3 markdown reader with sticky progress and acceptance controls, current-version/changelog context, safe external links, read-only Settings route, loading/retry and failed-save states. Acceptance remains locked until the document end, while a short document that already fits is treated as read. Remote Config falls back to its last activated document offline and rejects the placeholder. The gate checks every signed-in account independently, ignores superseded status reads and remains closed on lookup/write failure. Covered by 19 focused data/controller/widget/lifecycle tests, including 320px and text scale 1.3. **No reference design exists for this screen;** it extends the established V3 header and content-sheet language. Verified on iPhone 16 Pro with the real v1.0.1 document from 0% to 100%; the non-persisting gate preview confirmed the acceptance footer without changing the account record. |
| S03 | Announcement details and composer | `[x]` | Linkified V3 detail implemented with loading/not-found/retry states and one mark-read attempt per open. Admin V3 create/edit supports validated title/body, all four stored audiences and publish/archive state; edit, archive/restore and permanent delete are available from the list/detail with offline guards, confirmations and failure feedback. Archived creation no longer sends a push notification. Widget tests cover reader/admin hierarchy, narrow layout, large text, validation, actions and saving state. Visually accepted by the product owner on 27 Jul 2026. |
| S04 | Chat creation and thread | `[x]` | The thread is on the V3 palette: navy header carrying the same squircle identity as the inbox row that opens it, blue/blue-50 bubbles, tokenised date separators, read receipts, typing indicator and composer. Text, image and file sending, drafts, pending states, upload progress and offline guards are untouched. The contact picker is rebuilt as `ui/messaging/new_chat_{data,view}.dart` behind `new_chat_screen.dart`: a detail header with a live contact count, the inbox's search field, and role-grouped identity rows over a content sheet, with skeleton, retry, no-match and offline-empty states. The parent-to-parent restriction moved into the pure adapter, where it is now tested. Covered by 11 data tests and 17 widget tests at 320/402/430 and text scale 1.3. **No reference design exists for either screen** — the design files only include the inbox — so both extend the established language; revisit if a thread or picker design is produced. |
| S05 | User details and management | `[-]` | Tutor-facing halves done: `ui/users/tutor/student_detail_{data,view,screen}.dart` gives a student's record — a **DETAILS** block (year, subjects, latest progress status), latest feedback in full with the history one tap away, their classes with the viewing tutor's own marked `YOURS`, and their family with the primary contact marked and sorted first, routing into the parent. `parent_detail_{view,screen}.dart` gives a parent's record — contact details with copy, children routing into the student, and a message shortcut. **Deliberately narrower than the admin screen:** no lesson tokens, no invoice and no account removal. Tutors cannot read invoices at all (the rules allow admins and the parent only), so the legacy screen's billing section could only ever render empty for a tutor while still issuing the denied read. **Navigation is bounded:** `person_routes.dart`'s `pushPersonRoute` keeps one open instance per person, so the student ↔ parent link cannot be used to stack the same two records repeatedly — linking to someone already open returns to them instead. Covered by 27 data tests plus a dedicated navigation-depth suite. The admin half landed 28 Jul 2026: `ui/users/admin/admin_person_{data,view,screen}.dart` replaces the legacy `UserDetailScreen` behind A04 — contact details with a message shortcut, the lesson-token balance with an edit action, children expanding to their enrolments with per-student unenrol, this family's invoices with PDF entry, and a danger zone. **Every mutation calls the same service the legacy screen called, behind the same `OfflineActionGuard`, and every destructive action still confirms first**; only the surface is new. The removal warning is written per role — removing a parent says in as many words that it takes their children too. Invoices are filtered to this person, since the controller holds whatever was last loaded. Covered by 13 data tests. Verified on iPhone 16 Pro. **Fixed there:** the invoice rows used `LedgerRow`, which reserves a leading time column an invoice has nothing to fill, leaving an empty gutter. Remaining: `[-]` until product-owner visual acceptance, and the legacy screen stays in the tree until Phase 6 removes it. |
| S06 | Student feedback history | `[x]` | `ui/feedback/feedback_history_{data,view}.dart` behind `feedback_screen.dart`, shared by every role and reached from the parent dashboard, the tutor directory, a student's record and a push notification. Notes are newest-first with `<tutor> · <class>` attribution — now in brand blue rather than uniform grey, via the shared `FeedbackAttribution` widget also used on the student record — plus relative dates, an unread emphasis, and the progress status now that the tutor-session contract records one. Mark-as-read is skipped offline rather than queued, and is not re-issued on rebuild. Admin creation moved onto the V3 sheet with the same validation, trimming and busy-state guarantees. Covered by 15 data tests plus the existing screen tests. |
| S07 | Parent booking flows | `[x]` | The browse surface behind `Book a one-off class` is on the V3 design: `ui/timetable/parent/parent_browse_{data,view}.dart` give a navy header with the week pager and day strip over day-grouped class rows, each carrying the action the options dialog will actually offer — `BOOKED`, `N SPOTS`, `WAITLIST` or `CANCELLED` — with the one-off and opening notes beneath. Eligibility stays on `TimetableController.isEligibleClass`; every tap routes into the existing `_showParentClassOptionsDialog`, so the enrolment, swap and waitlist logic is untouched. Covered by 30 data tests and 24 widget tests. **No reference design exists for this screen** — the design files show only booked classes — so it extends the established language. The sheets closed 28 Jul 2026: `booking_data.dart` derives the option list and every confirmation message as pure functions, and `booking_sheets.dart` renders the options, child-selection, class-selection and confirmation sheets on the shared `AppBottomSheet`. The action ids are unchanged, so every booking call still dispatches on the same strings; only the wording and the surface are new. Covered by 35 data tests and 25 widget tests. Visually accepted by the product owner on 28 Jul 2026. |
| S08 | Admin class-management flows | `[-]` | The class options sheet — the entry point every timetable row taps into — is rebuilt as `ui/timetable/admin/admin_class_options_{data,sheet}.dart` on the shared `AppBottomSheet`, with each option stating what it commits to and both writing actions confirming first. See the 28 Jul progress-log entry for the two safety defects this fixed. The destructive path inside the students editor — removing a student — is also rebuilt on that sheet. Marking a roll now uses T03's `ClassRollScreen` for admins too, so the reference screen for that job is no longer duplicated by a legacy dialog. **Remaining, all still legacy:** the roster half of the students editor (`Add Student` and its list), the tutor-assignment editor, the waitlist dialog, and the add-class form, plus conflict handling for concurrent tutor and capacity edits carried from A02. |
| S09 | Invoice payment and creation details | `[-]` | Parent payment surfaces are complete and visually accepted: Stripe sheet orchestration, pay-now/pay-all intent reuse, success/cancel/failure/pending outcomes, paid-state reconciliation, PDF coalescing/open failures, and retryable invoice loading. The invoice creation half remains: parent/student/session selection, line-item review and finalisation, to be completed with the admin invoice work. The P00 card-brand/last4 contract is deliberately deferred to the end of the redesign (product decision, 28 Jul 2026) rather than blocking this row — see §7. |
| S10 | Profile, edit profile, password, settings | `[x]` | Role-aware V3 profile/settings flow complete for every role. Parent accounts receive durable notification preferences, lesson tokens, expandable students/classes and an always-available enrolment link; other roles omit parent-only controls. Edit and password forms are prefilled/validated, block duplicate writes, map Firebase failures to safe inline feedback and keep success visible. Profile/settings loads are post-frame, fenced by account and retryable; student class requests are cached per visit. Account deletion retains two confirmations and no raw backend errors. Covered by 25 focused controller/view/form tests at 320–430px and text scale 1.3. Verified on iPhone 16 Pro through profile, child expansion, settings, edit/password, read-only terms and back to Classes with no runtime exception. **No reference design exists for these screens;** they extend the established V3 detail-header and content-sheet language. |

### Current focus and next queue

Done and accepted: F01–F06 (tokens, theme, component library, typed
navigation, dashboard router), P01–P04 (all four parent screens), chat thread
and contact picker (S04), the class-browse screen and every booking sheet
(S07), login and the offline surfaces (S01), terms (S02), announcement
feed/detail/management (T04, A03 and S03), and profile/settings (S10).

Also done and accepted: the whole tutor experience — the teaching week (T02),
class roll and feedback (T03), directory (T05), announcements (T04) and the
inbox (T06), on the tutor-session contract. The inbox rebuild also covers most
of A05.

**The parent experience is complete: implemented, tested, and visually
accepted by the product owner (28 Jul 2026).** Nothing further is required for
parent UX except the two deferred P00 backend contracts, which are
deliberately out of scope until later in the redesign.

**Phase 4, the admin experience, is the active phase from 28 Jul 2026.** All six
admin reference screens now exist: A03 is complete, A05 is largely covered by
the shared inbox, and A01, A02, A04 and A06 are built and awaiting product-owner
visual acceptance. **Every legacy role surface has been retired** — parent, tutor
and admin each render V3 for the dashboard, classes, users and billing, and the
legacy screens are reachable only by an unrecognised role.

Next, in order:

1. ~~Resolve the admin §7 gates.~~ **Done 28 Jul 2026.** All five — cover-needed,
   one-off approval, account status, invoice reminders and new enrol — are
   audited and decided. Four narrowed the design against the data: cover is
   excluded outright, account status is overdue-only, the reminders button is
   dropped for a next-reminder date, and New enrol enrols an existing student.
2. Product-owner visual acceptance of A01, A02, A04 and A06, ideally in one
   pass inside `HomeScreen` — none of the four has been seen with the bottom
   navigation in frame, since each was inspected through a preview entrypoint.
3. Deliver the admin halves of S05 (user detail), S08 (class-management flows,
   including concurrent-edit conflict handling carried from A02) and S09
   (invoice creation/review, plus the full-console reskin). A01 also needs the
   New enrol picker.
4. Confirm A05 against the admin reference on device — expected to need no work.
5. Land the two parent backend contracts when picked back up: payment card
   brand/last4, and confirmation of the amount-due rounding rules. Deferred to
   the end of the redesign by product decision — not currently scheduled.
6. Close T01's feedback-due attention row, which needs a per-session feedback
   query the dashboard does not yet make.
7. Release hardening (§6 Phase 6), including the **release-blocking Firestore
   rules deployment**.

### Picking this up in a new session

Everything needed to continue is in this file plus `UI_REQUIREMENTS.md`. The
practical details that are not obvious from the code:

**Branch.** `feat/mobile/v3-foundation`, off `main`. Not pushed. The older
`redesign-v3` branches in this repo and in `tsowmi03/Tenacity` are superseded —
do not build on them.

**Design references.** The three role HTML files at
`/Users/thomassowmi/Desktop/Tenacity app redesign` are the visual spec. They are
bundled React, so read the markup rather than rendering it — every value is an
inline style. To pull one screen:

```bash
python3 -c "s=open('/Users/thomassowmi/Desktop/Tenacity app redesign/Tenacity Parent App.dc.html',encoding='utf-8',errors='replace').read(); i=s.find('id=\"1b-home\"'); print(s[i:i+7000])"
```

Screen ids are `1b-*` for parent, `t-*` for tutor, `a-*` for admin.

**Checks before any commit** — this mirrors the CI Mobile job in
`.github/workflows/validate.yml`:

```bash
cd apps/mobile && flutter pub get && dart format --output=none --set-exit-if-changed lib test && flutter analyze --no-fatal-infos && flutter test && flutter build web
```

`flutter analyze` reports informational findings only; there should be **zero**
errors or warnings. Count them with
`flutter analyze --no-fatal-infos 2>&1 | grep -cE '(error|warning) •'` — note
that warnings are not indented, so a `^\s+` anchor silently matches nothing.

**Seeing a screen on a device.** Widget tests have repeatedly passed while the
real screen was wrong, so look at every screen before calling it done:

```bash
xcrun simctl boot 722261B0-A4C3-4B1F-BAE7-AE120C8E9B5A   # iPhone 16 Pro
cd apps/mobile && flutter build ios --simulator --debug
```

then launch `build/ios/iphonesimulator/Runner.app`. That device reports
**402 × 874 points**, the exact viewport the designs were drawn at, so
comparison needs no scaling. Tap coordinates are in points, not screenshot
pixels.

**Test-account limits.** The simulator is signed in as a parent with two
children. It has classes in term 3 week 1 and no outstanding invoices, so the
unpaid invoice card, Pay now and PDF buttons have never been seen with real
data. Signing in as another role needs the account owner.

**Do not sign out.** The session cannot be restored without the account owner's
credentials. A second simulator does not help: only the first device's App Check
debug token is registered with Firebase, so on any other device every Firestore
read returns `permission-denied` and the app never gets past a blank screen. To
inspect a signed-out screen, add a temporary entrypoint that renders it against
a stub controller and build with `-t`:

```bash
cd apps/mobile && flutter build ios --simulator --debug -t lib/dev_login_preview.dart
```

That gives a true on-device render — real fonts, real theme, 402 × 874 — with no
Firebase in the way. Delete the file afterwards; it is a harness, not code.

**Defects this work has found so far**, as a guide to what tends to break:
non-uniform border colours with a border radius (Flutter rejects it), widgets
sized to their content where the design expects them to fill, status rules that
disagree with the dialog they open, availability shown as a raw count rather
than as what the user may actually do with it, async work started concurrently
in `initState` where one call depends on another's result, success messages
carried on an error channel and therefore shown in red, `MediaQuery` read below
a widget that has already consumed the value, and test helpers where
`override ?? default` silently discards a deliberate null.

**One thing to know about the week pager.** `TimetableController.currentWeek` is
global, so paging the browse screen also moves the timetable behind it. That is
pre-existing — the legacy browse shared the same controller — and it is not
obviously wrong, but it does surprise. Fixing it means giving the browse route
its own week, which is a controller change rather than a presentation one.

### Progress log

Add one dated line whenever a roadmap item changes status. Include evidence such
as tests, screenshots, or the main changed files.

| Date | Change | Evidence / follow-up |
| --- | --- | --- |
| 28 Jul 2026 | Routed admins to the V3 roll screen, which the reference already specified. | **Correcting an approach mistake.** The `Tutor Class Roll` reference (`t-class`) is already implemented as T03's `ClassRollScreen`, and it is role-agnostic in substance — it stamps whoever marked the roll. Admins were still being sent to the legacy `Edit Students & Attendance` dialog, and the previous two entries had been improving that dialog rather than replacing it. The dialog bundles two jobs the reference keeps apart: marking the roll, and managing the roster. The options sheet now separates them — **Mark the roll** opens `ClassRollScreen`, and **Enrolments** keeps the roster work. `AdminClassOption` gained `enabled`/`disabledHint` so the roll states its reason inline when there is no session document or the week is cancelled, rather than looking tappable. Covered by 4 further tests. Verified on device: an admin now sees the reference roll screen with Here/Away, progress and feedback, and its save disabled until the roll is marked. Suite 741 → 745. |
| 28 Jul 2026 | Collapsed the student-removal flow to one confirmation and labelled its trigger. | Opening the students editor as a real admin showed two unlabelled icon buttons per row, one of them a red bin. It led to a menu that only ever offered a **single** real option — a permanent student could only `Remove permanently`, a visitor only `Remove one-off` — and then asked again, so it was a confirmation wearing two hats; its `Cancel` was also the only red item, making the way out look more dangerous than the removal. Replaced by one `AdminClassConfirmSheet` whose wording comes from `studentRemovalConfirmation`, which states whether the removal applies from now on or to this week only. The trigger is now a labelled `person_remove` icon with a tooltip naming which it is. `_showConfirmDialog` is removed with its last caller. Covered by 3 further tests. Verified on device to the confirmation, then backed out. Suite 738 → 741. |
| 28 Jul 2026 | Rebuilt the admin class options sheet, and fixed two safety defects in it. | `ui/timetable/admin/admin_class_options_{data,sheet}.dart` replace the legacy `showModalBottomSheet` of five bare `ListTile`s. Each option now states what it commits to, following the S07 booking-sheet treatment. **Two defects fixed, both found by opening the sheet as a real admin:** (1) `Cancel Class` called `deleteClass` — a permanent delete of the class and every enrolment — while sitting directly beneath `Cancel This Session`, a reversible weekly toggle, in the same red, distinguished only by a parenthetical "(delete)" in its confirm text and a success toast reading "Class cancelled." It is now `Delete this class`, toned destructive, naming how many students it unenrols, confirming with `Delete class`, and reporting `Class deleted.` (2) `Cancel This Session` **had no confirmation at all** and fired straight from the tap, so one mistap dropped the session for every family booked into it; it now confirms, and is toned caution rather than destructive since it is reversible. Covered by 12 tests including one asserting the two actions no longer share a leading verb. Verified on device up to the confirmation, then backed out without writing. Suite 726 → 738. |
| 28 Jul 2026 | First pass through the admin screens signed in as a real admin; four defects fixed. | The first time A01/A02/A04/A06 were driven inside `HomeScreen` against production data rather than a preview entrypoint, which is what surfaced all four. **A01:** the `need action` metric read 8 while the list showed 3 rows — the cap was silent, and the other five rolls were unreachable from the dashboard. `outstandingRollTotal` is now carried and an overflow row (`5 more rolls outstanding`) routes to Classes. **A02:** two assigned tutors plus the seat count overflowed a 402pt row and cut `seats` in half; the seat label is now the compact `4/4 seats` and the subtitle wraps to a second line only when it must, so nothing is truncated. **A06:** `_familyLabel` took the last whitespace token, so a stored name ending in an initial rendered `I family`, naming nobody — a trailing single letter now falls back to the name as stored (`Monica I`). **A06:** invoice numbers are stored bare (`375`) and sat beside a dollar amount reading like one; a purely numeric reference is now prefixed `INV-`. All four are regression-tested. The same overflow defect exists on the tutor dashboard (`rollsToMark` metric vs `.take(2)` rows) and is tracked separately rather than changed mid-review. Suite 719 → 726. |
| 28 Jul 2026 | Rebuilt the admin person record, closing the seam behind A04. | `ui/users/admin/admin_person_{data,view,screen}.dart` replaces the legacy `UserDetailScreen`, which A04 had been opening into. Contact, lesson tokens with edit, children expanding to their enrolments with per-student unenrol, this family's invoices with PDF entry, and a danger zone. Every mutation calls the same service behind the same `OfflineActionGuard`, and every destructive action still confirms — the removal warning is now written per role, so removing a parent states plainly that it takes their children with it. The token count is tracked locally after an edit, because the `AppUser` handed in goes stale the moment it is changed. Invoices are filtered to this person, since `InvoiceController.invoices` holds whatever was last loaded and would otherwise show another family's billing. **Fixed on device:** the invoice rows used `LedgerRow`, which reserves a leading time column an invoice has nothing to put in, leaving an empty gutter down the left of every row. Suite 707 → 719. |
| 28 Jul 2026 | Built A06, the admin billing console — the last admin reference screen. | `ui/invoices/admin/admin_billing_{data,view}.dart` behind `AdminBillingScreen`, now the admin `invoices` destination. The full console (`AdminInvoiceView`) is retained behind `View all invoices` rather than replaced, so filter, sort, search, multi-select and bulk actions are untouched; its reskin is S09. Four reference elements are excluded per §7: the `Send N reminders` button, the per-row `Follow up`/`Remind` actions, the `reminded ×N` count, and `Visa ····4242`. Each overdue row instead shows **when the next automatic reminder falls**, derived from `invoiceReminderScheduler`'s rule and pinned by tests that fail first if that schedule changes. **Fixed on device:** the reference's `border-left: 4px` accent was written as a non-uniform `Border` alongside a `borderRadius`, which Flutter rejects outright — the very first defect listed in §4's *Defects this work has found*. It is now a sibling bar inside an evenly bordered card. `BrandLogo` was made public so a screen that does not use `AppHeader` can still lead with the wordmark without duplicating the asset path. Suite 677 → 707. |
| 28 Jul 2026 | Built A04, the admin people directory, and retired the legacy user list. | `ui/users/admin/admin_users_{data,view}.dart` behind `UsersScreen`. Parents/Students/Tutors tabs, searchable on name and subtitle so a parent is findable by their child. **Status is overdue-only** per the §7 resolution: derived from the family's unpaid invoices past their due date, with `ACTIVE` and `TRIAL` dropped as sourceless and the `+` account-creation button not shipped. The invoice read is best-effort and failing it marks nobody, rather than wrongly accusing families of being behind — regression-tested. Counts describe the whole directory, not the filtered tab. Opening a person routes into the existing `UserDetailScreen`, so tokens, enrolments, invoice PDF, unenrolment and account removal keep their behaviour and confirmations; students carry no account and open nothing. Suite 650 → 677. Verified on iPhone 16 Pro across the Parents and Students tabs. |
| 28 Jul 2026 | Built A02, the admin master timetable, and retired the legacy timetable body. | `ui/timetable/admin/admin_classes_{data,view}.dart` behind `TimetableScreen`, following the T02 extraction pattern rather than rewriting the 3,932-line screen. Every class-management action routes into the existing admin dialogs, so students, tutors, waitlist, cancellation and creation keep their current behaviour. The admin pages by **day** where tutors page by week, which needed `TimetableController.setWeek` — stepping across a Monday must pull the loaded week along or the new day is read against the previous week's attendance. The week is derived with the exact inverse of `startOfTermWeek`, deliberately not `currentTermWeek`: that counts seven-day blocks from the term start date, so for a term beginning mid-week the Monday opening week 2 comes back as week 1 and would load the wrong attendance. `Rooms` is excluded (one room) and replaced by a `Tutors` grouping; `SectionLabel` gained a `highlighted` state for the `Now` slot. **Found on device:** liveness was per time group, so in the tutor grouping a `NO ROLL` class running now and one that finished that morning were indistinguishable — `AdminSession.isLiveNow` now carries it per session. Suite 618 → 650. Full gate passes. |
| 28 Jul 2026 | Inspected A01 on device and fixed the tutor being invisible on session rows. | Rendered on iPhone 16 Pro at 402 × 874 through a temporary preview entrypoint, since the simulator is signed in as a parent and must not be signed out. The row title was built as `<class> · <tutor>`, but a real class name plus the roll pill already fills a 402pt title, so the tutor was always cut by the ellipsis — an admin could not see who was teaching any session. Moved to the subtitle, which held only the student count once room was excluded. **Widget tests did not catch it:** they asserted the pills and section labels, not that the tutor was readable, and the fixtures used short names. Two regression tests added, including the no-tutor-assigned case. Suite 616 → 618. Long class types still truncate in the title, which is the accepted `LedgerRow` behaviour shared with the parent and tutor dashboards. |
| 28 Jul 2026 | Built A01, the admin dashboard; admin left the legacy dashboard. | `ui/dashboard/admin/admin_dashboard_{data,view}.dart` plus the container, wired into `DashboardRouter` — which closes F05, since all three roles now render their own V3 dashboard. **The roll pill withholds what it cannot know:** `ROLL 5/6` appears only once `rollCompletedAt` is stamped, because the stored attendance list holds present students only and an unmarked roll is indistinguishable from an all-absent one; before the stamp the pill reads `NO ROLL`. The denominator is the union of the standing roster and everyone marked present, so a one-off visitor cannot render `ROLL 7/6` — both rules are regression-tested. Rolls are chased only after a session has ended, so a class still running is not flagged. **Shared component fix:** `QuickActionGrid` was hard-coded to two tiles per row and drew the admin three-up grid as two plus a half-width orphan; it now takes `columns`. Suite 593 → 616 tests; `dart format`, `flutter analyze` (0 errors, 0 warnings, 57 info), and `flutter build web` all pass. Remaining before `[x]`: the New enrol picker, per-class routes with A02, and visual acceptance. |
| 28 Jul 2026 | Resolved all five admin §7 gates by product decision; Phase 4 unblocked. | Four of the five narrowed the design to fit the data. **Cover needed: excluded outright** — a read-only "no tutor assigned" signal was offered and declined, so V3 ships no cover state, row or metric; reassigning a week's tutor is unaffected and stays in A02 as an ordinary edit. **Account status: overdue only**, derived from the parent's invoices; `active`/`trial`/`suspended` dropped as sourceless. **Invoice reminders: control dropped**, reminders stay automatic, and A06 shows the next scheduled reminder derived from the scheduler's own due−7d/due/weekly rule. **New enrol: existing student only**; family onboarding stays out of scope. **One-off: informational count**, since no approval state exists to queue. All recorded in §7 and §11. |
| 28 Jul 2026 | Audited the four admin §7 gates against the data layer before starting Phase 4. | Findings recorded in §7; all four need a product decision. **Cover needed:** the substitute mechanism exists (`Attendance.tutors` overrides `ClassModel.tutors` per week, already used by T02) but no cover *workflow* does — no absence record, request document, eligible-tutor list, acceptance step or notification. **One-off approval:** none exists; `OneOffEnrollmentResult` has only `added`/`alreadyEnrolled` and `enrollStudentOneOff` books immediately. **Account status:** confirmed absent from `AppUser`, `Parent` and `Student` — no active/trial/suspended/overdue field anywhere. **Invoice reminders:** `invoiceReminderScheduler` already sends them automatically at 10:00 daily (7 days before due, on due, weekly overdue) but writes nothing back and has no manual trigger. **New enrol:** the callables only enrol existing students; nothing creates a parent or student account. |
| 28 Jul 2026 | Product owner visually accepted the tutor experience; Phase 3 closed. | T02, T03 and T05 moved `[-]` → `[x]`, joining T04 and T06. T01 stays `[-]` for one non-visual reason only — its feedback-due attention row still needs a per-session feedback query — and its visual-acceptance item is now checked. Reference screens 7/16 → 10/16 complete, 4 → 1 in progress. Phase 4 (admin) is now the active phase. |
| 28 Jul 2026 | Added the student DETAILS block, coloured feedback attribution, and bounded person-to-person navigation depth. | Product feedback on the screens above: the student record showed only feedback and classes, so a **DETAILS** section (year, subjects, latest progress) was added, and the primary contact is now marked and sorted first in **FAMILY** — both previously-loaded fields that were being discarded. Feedback attribution was uniform grey; the author is now brand blue via a shared `FeedbackAttribution` widget used by both the history and the student record. Student and parent records link to each other, so bouncing between them stacked the same two people indefinitely; `pushPersonRoute` now keeps one open instance per person. **Caught by its own test:** the first version used `popUntil` with an always-true predicate to inspect the stack, which silently never worked — `popUntil` stops at the first route its predicate accepts, so it only ever saw the top route. Fixed by threading the open-route chain through the screens explicitly instead of inspecting the stack. Suite 581 → 593 tests. Verified on device: four hops around the student ↔ parent loop, one back press lands on the directory. |
| 28 Jul 2026 | Replaced the legacy screens behind the tutor directory: student and parent detail, and feedback history. | A student row now opens their record rather than jumping straight to feedback; the latest note is shown in full there with `All N` into the history, and the `Feedback` button on the row still skips straight to it. Parent rows open a V3 record with contact, children and a message shortcut — no billing, since tutors cannot read invoices. Feedback history is rebuilt for every role and now shows the progress status. Suite 558 → 581 tests. **Fixed while testing:** both new screens built their Firestore stream inside `build`, which resubscribed every frame and left the view stuck showing skeletons over data that had already arrived. |
| 28 Jul 2026 | Widened the tutor directory to everyone and added a `This week` tab. | Product decision: restricting tutors to their own students was too limiting. All students and parents are now listed — no rules change was needed, since staff reads were already permitted. A `This week` tab holds the working set and is the default; in the full lists the tutor's own people are marked `YOURS` and sorted first. `This week` fetches the current calendar week's attendance directly rather than reading `TimetableController.attendanceByClass`, which holds whichever week the Classes pager was last left on — that had made the directory change with unrelated navigation. Also fixed day ordering, which read `Tue & Mon`. Suite 548 → 558 tests. Verified on device: 44 students, 45 parents. |
| 28 Jul 2026 | Delivered the tutor experience: T02, T03, T05, and T06 confirmed. | Added `tutor_classes_{data,view}`, `class_roll_{data,view,screen}`, `tutor_users_{data,view}` and `TutorSessionService`. T06 needed no work — the `t-messages` reference is the parent inbox, and `InboxScreen` is already role-agnostic. Suite 530 → 548 tests. Verified each screen on iPhone 16 Pro against real data; the roll was driven end to end without saving, since the test account writes to real families. |
| 28 Jul 2026 | Landed the tutor-session contract and closed three §7 gates. | Roll completion and tutor-visible people scope are resolved and implemented; feedback due/completion is partly implemented and now depends on the rules deployment. `updateAttendanceDoc` also stopped swallowing write failures — a roll Firestore rejected had been reporting success to the tutor who marked it. |
| 28 Jul 2026 | Recorded the undeployed rules change as release-blocking. | `docs/operations/pending-rules-deployment.md`, referenced from the Firebase README and the Phase 6 checklist. `validFeedbackCreate()` uses `hasOnly()`, so the deployed rules reject the new feedback keys; the new keys are optional, so rules-first is safe. The stale hash in `source-baseline.json` is deliberately left as the divergence signal. |
| 28 Jul 2026 | Product owner visually accepted the full parent experience; P00 deferred to end of redesign. | Confirmed P01–P04, the booking sheets (S07), login and the offline surfaces (S01), and the contact picker/chat thread (S04) all on device. Product decision: the two P00 backend contracts (payment card brand/last4, amount-due rounding) are deliberately deferred to the end of the redesign rather than blocking parent sign-off — recorded against P04, S09 and the §7 gate table. The parent phase (Phase 2) is functionally complete pending only those two deferred contracts. |
| 28 Jul 2026 | Fixed the new-chat search outliving its screen. | `buildContactSections` deferred filtering to `UsersController.filterUsers`, which mutates a list held on the app-scoped controller. Closing the picker reset its search box but not the filter behind it, so reopening showed the previous query's results under an empty box — after searching "mar", the picker came back listing one tutor instead of all eight contacts. The adapter now owns the query itself, matching on name, role and a parent's children; the controller is untouched for the admin user list. Suite 484 → 491 tests. Verified on iPhone 16 Pro: search "mar", back out, reopen — 8 contacts, not 1. |
| 28 Jul 2026 | Closed the last legacy parent surfaces: booking sheets (S07), contact picker (S04) and offline states (S01). | Added `booking_{data,sheets}.dart`, `new_chat_{data,view}.dart`, and the shared `AppBottomSheet` and `OfflineBanner`/`OfflineToast` components. The confirmation copy that turns lesson tokens into money is now a pure function with 35 tests behind it; it was previously built inline inside the sheet and could not be tested at all. Suite 385 → 484 tests; analysis has no errors or warnings (55 info findings, down from 57). Verified on iPhone 16 Pro: the options, child-selection, class-selection and confirmation sheets against a real class with places, a full class, and a live one-off booking, plus the contact picker and its search. No booking was confirmed — the account is the owner's. |
| 28 Jul 2026 | Fixed parents being unable to start a conversation at all. | `UsersController.fetchAllUsers` awaited `fetchAllParents()` before `fetchAllTutors()` inside one `try`. Firestore Rules let any signed-in user read staff but only staff list parents, so for a parent the first query was always denied and threw before the staff query ran — leaving the contact list empty. The two queries now run independently and only a total failure is fatal; a per-parent student lookup failure is likewise no longer fatal, since students only widen the search. On device the picker went from 0 contacts to 8. The rebuilt screen also stopped showing the raw `[cloud_firestore/permission-denied]` string to families. |
| 28 Jul 2026 | Fixed two latent crashes and a refetch loop found while extracting the booking logic. | (1) The options builder force-unwrapped `attendance!` to check capacity, which throws for a family with children in a class during a week whose attendance document does not exist yet; it now reads an empty list. (2) `AppBottomSheet` sized itself from `MediaQuery.sizeOf`, which a widget test caught by rendering the sheet 264pt off-screen — it now measures the constraints it is handed. (3) The child-selection list built a `FutureBuilder` per child inside the list, so every checkbox tap refetched all of them and flashed "Loading..." over the names; names are resolved once above the sheet. |
| 28 Jul 2026 | Reworded the booking flow and moved disabled reasons onto the option. | The sheets showed internal action ids verbatim — `Swap (This Week)`, `Enrol permanent`, `Confirm 'Notify of absence'`. Each action now carries a label, a one-line description of what it commits to, and a confirm button named for the action. A disabled option shows its reason inline with a lock instead of looking tappable and answering with a snackbar. The ids themselves are unchanged, so every branch that performs a booking still dispatches on the same strings. |
| 27 Jul 2026 | Completed S10 profile, settings and account forms. | Rebuilt the role-aware V3 profile/settings route, parent student/class/token/preferences surfaces, validated edit/password forms, and confirmed account deletion. Added account-scoped async fencing, duplicate-write guards, retryable errors, cached class reads and lifecycle-safe completions. All 385 Flutter tests pass; focused analysis is clean and full analysis has no errors or warnings (57 remaining info findings). Verified profile → settings → edit/password/terms → Classes on iPhone 16 Pro without a runtime exception. |
| 27 Jul 2026 | Completed the parent payment half of S09 and progressed P04. | Added durable payment outcomes, duplicate-payment lockout, paid-state reconciliation, account-switch guards, coalesced PDF loading, retryable invoice errors and replaceable controller subscriptions. All 360 Flutter tests pass; focused analysis is clean and full analysis has no errors or warnings (73 existing info findings). Verified the live paid-history route and a non-persisting unpaid/pay-all/pending preview on iPhone 16 Pro. S09 remains in progress until invoice creation/review/finalisation is rebuilt. |
| 27 Jul 2026 | Completed S02 terms acceptance and closed T04, A03 and S03 visual acceptance. | Rebuilt the terms reader/gate, fixed per-account and overlapping acceptance checks, added cached-offline loading and failure-safe writes, and covered the scroll lock, short documents, retries, account switching and responsive states. All 348 Flutter tests pass; the production web build succeeds; analysis has no errors or warnings. The real v1.0.1 document was verified on iPhone 16 Pro from 0% to 100% with no runtime exception. The product owner visually accepted the announcement surfaces. |
| 27 Jul 2026 | Rebuilt T04, A03 and S03 announcement surfaces. | Added the shared reader/admin feed, linkified detail, V3 create/edit form, archive/restore and confirmed deletion. Fixed query-cache scope, write failure handling, sticky unread navigation badges, repeated mark-read scheduling and archived-draft notifications. Aggregate admin read counts are explicitly omitted because the current contract has no audience denominator or aggregate receipt query. |
| 20 Jul 2026 | Created the V3 roadmap and baseline tracker. | Audited all three role HTML files, the print cross-check, design-system guidance, `UI_REQUIREMENTS.md`, and the current Flutter UI inventory. |
| 20 Jul 2026 | Tutor dashboard moved to in progress. | Added `tutor_dashboard_view.dart`, `tutor_dashboard_data.dart`, exact fonts/logo, role integration, and responsive data/widget tests. Full suite: 34 tests passed at this checkpoint. |
| 20 Jul 2026 | Resolved the tutor-dashboard data audit decisions. | Room/location removed from scope because Tenacity operates one room. Present students require feedback, absent students are exempt, and feedback becomes due when the session ends. Explicit roll completion and session-linked feedback still require backend implementation. |
| 20 Jul 2026 | Added the platform monorepo migration plan. | Defined backend ownership, preserved-history import, protected cutover, shared contracts, rollback, and the tutor-session contract sequence. Superseded on 25 Jul 2026 — see below. |
| 25 Jul 2026 | Landed the V3 foundation on current `main`. | Re-applied the 23-file `redesign-v3` work onto `feat/mobile/v3-foundation` (conflict-free; no overlap with main's changes since merge-base `addf7ca`). The stale `redesign-v3` branches in this repo and in `tsowmi03/Tenacity` are superseded by this branch. |
| 25 Jul 2026 | Re-sequenced delivery to parent-first and brought backend contracts in scope. | Recorded in §1 *Delivery decisions*. Tutor dashboard (T01) parked as the component-extraction reference. Reference-design hashes re-verified and unchanged. |
| 25 Jul 2026 | Removed the superseded migration plan from `apps/mobile`. | The monorepo migration completed on 24 Jul 2026 (Phase 4 no-op cutover); the platform-level `docs/migrations/` records supersede it. `ADR-001` moved to `docs/architecture/` — it is a platform decision, not a mobile one. |
| 25 Jul 2026 | Completed F01 and F06; F04 and F05 progressed. | Added `app_theme.dart` and extended `design_tokens.dart`; built `lib/src/ui/components/`; replaced the integer navigation maps with typed destinations and added `DashboardRouter`. Fixed the out-of-range profile destination and the role-dependent `selectTab(4)` invoice-reminder misroute. Suite grew 34 → 70 tests; `flutter analyze` down to 85 informational findings with no errors or warnings. |
| 25 Jul 2026 | Confirmed the reference viewport matches the simulator. | The iOS simulator panel reports 402 × 874 points for iPhone 16 Pro, the same viewport the reference designs were drawn at, so visual comparison needs no scaling. Verified the six-tab admin bar renders every label and that all six destinations resolve on device. |
| 25 Jul 2026 | Resolved the parent tab-count question: five tabs, not four. | Parents keep the Announcements tab against the reference design, because families must be able to browse announcements directly rather than only catching one on the dashboard. The dashboard row is additive and shares the tab's read-state. |
| 25 Jul 2026 | Delivered P01, the parent dashboard. | `ui/dashboard/parent/` holds the container, view and pure adapter; `dashboard_formatting.dart` now holds the greeting, duration, relative-date, currency and class-type helpers shared with the tutor dashboard. Added `fetchInvoicesForParent` so a dashboard load can await invoices rather than race the live stream. Suite 70 → 108 tests. |
| 25 Jul 2026 | Recorded the feedback attribution decision. | The feedback document still has no class reference, so the dashboard quote is attributed as `<tutor> · <subject>` using the existing free-text `subject`. No schema change; if a class reference is added later, prefer it. This closes the P00 feedback-to-class item for P01's purposes. |
| 25 Jul 2026 | Trialled and rejected golden images as the visual-acceptance mechanism, for now. | The parent dashboard's layout rendered correctly, but two font variants drew as block glyphs while an isolated six-variant probe rendered all of them correctly — so the app is fine and the harness is not. No golden baseline was committed, because one containing block glyphs would hide genuine font regressions. Recorded under F07. |
| 25 Jul 2026 | Completed the first on-device pass of the parent dashboard. | Ran signed in as a parent on iPhone 16 Pro. Confirms the golden's block glyphs were harness-only: Newsreader Italic and Plus Jakarta Medium both render correctly on device. Header, metric strip, content sheet, section labels, empty next-class row, attention list, feedback quote, quick actions and the five-tab bar all match the reference. Also confirms the dashboard's announcement row and the Notices tab badge agree, which was the argument for keeping five tabs. |
| 25 Jul 2026 | Fixed two visual defects found only on device. | Metric tiles took their own intrinsic heights, so the shorter third tile floated centred once the first two labels wrapped — now wrapped in `IntrinsicHeight` with a stretched row. The latest-feedback card sized to its content, shrinking to a fraction of the sheet for a short note — now stretched. Both are regression-tested. Neither was visible in the widget tests, which had only long-label fixtures. |
| 26 Jul 2026 | Delivered P03, the inbox, for every role. | The reference designs give parents, tutors and admins the same message list, so `InboxScreen` was rebuilt once rather than per role. Added `SearchField` and `ConversationRow` to the shared library and `inbox_data.dart` for the ordering, naming and timestamp rules. Fixed a listener leak: the old inbox added a `ChatController` listener in `initState` and never removed it. |
| 26 Jul 2026 | Delivered P04, parent invoices — the last of the four parent screens. | All four parent reference screens now have a V3 implementation. Payment logic was extracted verbatim rather than rewritten. Pay-all is shown only when it settles more than one invoice, since with a single invoice it duplicates that invoice's own Pay now. |
| 26 Jul 2026 | Fixed `ContentSheet` collapsing around content that does not expand. | Found on device: searching the inbox for something with no matches shrank the white sheet to the width of its empty-state text, showing navy down both sides. The sheet now always fills what it is given. This affected every empty state on every V3 screen, but only showed where the surrounding screen was already built — the dashboards fill their sheet with a scroll view. |
| 27 Jul 2026 | Rebuilt the login screen (S01). | `ui/auth/login_{form,view}.dart` plus the container. Three defects fixed — see the three rows below. Suite 249 → 291 tests. |
| 27 Jul 2026 | Fixed a sent password-reset email being shown to families as an error. | `AuthController.resetPassword` set its success text on `_errorMessage`, the channel the UI paints red, so "Sent! Please check your inbox" appeared as a failure. Added a separate `statusMessage`, and the screen now shows one feedback panel that is green for a completed action and red for a failure. |
| 27 Jul 2026 | Fixed the form faulting a field the user had not reached. | `AutovalidateMode.onUserInteraction` validates the whole form as soon as anything is typed, so entering an email drew a red "Please enter your password" beneath an untouched field. Now `onUnfocus`, which checks each field when it is left. Found on device, not by the widget tests. |
| 27 Jul 2026 | Fixed a keyboard check that could never fire. | The compact header read `MediaQuery.viewInsetsOf` inside the view, but a `Scaffold` removes the bottom view inset from its body's `MediaQuery`, so it was always zero. The container reads it above its own Scaffold and passes it down. Caught by a widget test before it ever ran on a device; there is now a container test driving `tester.view.viewInsets` through the real `MaterialApp` → `Scaffold` path. |
| 27 Jul 2026 | Recorded how to inspect a signed-out screen without signing out. | The simulator's session cannot be restored without the account owner's credentials, and a second simulator fails App Check — its debug token is not registered, so every Firestore read returns permission-denied and the app never gets past a blank screen. A temporary entrypoint rendering the screen against a stub controller gives a true on-device render with real fonts at 402 × 874, and is deleted afterwards. |
| 27 Jul 2026 | Rebuilt the class-browse surface (S07), the last legacy screen a parent could reach. | `ui/timetable/parent/parent_browse_{data,view}.dart`, wired through `TimetableScreen(browseOnly: true)`. Each row now states the action its dialog will offer rather than a raw spot count; verified on device against both a class with places and a full one. Suite 191 → 249 tests. |
| 27 Jul 2026 | Fixed the browse surface advertising one-off spots that could not be booked. | The legacy layout printed `One-off: N` straight from `capacity − attendance`, ignoring the rule in `ParentClassAvailability.canBookOneOff` that also requires other attendees and either a cancelled spot or a week within the booking window. A parent could tap a class showing free spots and be refused. The V3 row claims `One-off spot this week` only when the dialog will accept it. |
| 27 Jul 2026 | Fixed tutor names missing from the parent timetable until a manual refresh. | `initState` started `_initData` and `_loadParentContext` concurrently, so the latter derived its tutor ids from a class list that was usually still empty. It now awaits the class load first. A race, so it appeared intermittently — the browse screen made it obvious, since every row there carries tutor names. |
| 25 Jul 2026 | Delivered P02, the parent timetable, and inspected it with real bookings. | Header, week pager, week strip with day dots, day groups, session rows and the booking route all render correctly. Fixed the one-off rule while checking a live session against its own options dialog: it classified a session as one-off when *any* attending child was off the class roster, whereas the dialog does so only when *no* child of that family is on it. A family with one child enrolled and another visiting would have seen a ONE-OFF pill above the permanent swap and enrol actions. The rule now mirrors the dialog and is judged against the whole family, so the child filter cannot flip it either. |

## 5. Target implementation architecture

### 5.1 Role-aware app shell

Keep authentication and terms gating in `AuthWrapper`. After that, use one
`HomeScreen` shell with explicit role configuration:

- A typed destination list per role.
- A screen builder per destination.
- A bottom-navigation item per destination from the same configuration.
- A safe destination-selection method instead of hard-coded role-specific tab
  indexes.
- Profile/settings opened through the navigator, not represented as hidden tab
  indexes.
- Selected destination reset or reconciled when the authenticated role changes.

The dashboard destination should render through an explicit role switch:

```text
DashboardRouter
├── ParentDashboard
├── TutorDashboard
└── AdminDashboard
```

This keeps role data loaders, empty states, tests, and visual acceptance separate
while retaining the common navigation shell.

### 5.2 Flutter organisation

```text
lib/src/ui/
├── theme/
│   └── design_tokens.dart        # colours, radii, shadows, type, spacing, motion
├── components/                   # the shared V3 vocabulary
│   ├── app_header.dart
│   ├── bottom_navigation.dart
│   ├── content_sheet.dart
│   ├── empty_state.dart
│   ├── ledger_row.dart
│   ├── metric_tile.dart
│   ├── quick_action_tile.dart
│   ├── search_field.dart
│   ├── section_label.dart
│   └── status_pill.dart
├── dashboard/
│   ├── dashboard_router.dart
│   ├── parent/
│   ├── tutor/
│   └── admin/
└── <existing screens reskinned in place>
```

An earlier draft proposed a parallel `lib/src/ui/v3/` tree. That is not used: the
name expires the moment V3 becomes the only design, and it would force a large
move commit at the end of the project. Screens are reskinned where they live.

The exception is screens too large to reskin in place —
`timetable_screen.dart` is 3,932 lines and serves all three roles. Extract each
role's presentation into `dashboard/<role>/` or a sibling feature folder
incrementally; do not attempt a rewrite.

The exact folder migration can be incremental. Existing controllers and services
should remain the source of behaviour unless a reviewed data-contract change is
required.

### 5.3 Shared component inventory

Build shared widgets from repeated patterns in the reference designs:

- Navy safe-area header with display title, contextual subtitle, avatar/action.
- White or cream rounded content sheet layered over the navy background.
- Compact uppercase section label with optional trailing action.
- Metric tile row with responsive sizing and overflow behaviour.
- Time-ledger row for class schedules.
- Person/message/invoice ledger row with leading identity, main content,
  metadata, status, and trailing action.
- Status pills for confirmed, running, done, roll required, paid, overdue,
  one-off, active, trial, and related states.
- Segmented role/filter controls and date/week selectors.
- Search field with clear action and accessible label.
- Quick-action tiles/buttons.
- Pull-to-refresh wrapper and consistent skeleton/loading surface.
- Standard empty, offline, retry, permission-denied, and destructive-confirmation
  components.
- Role-aware bottom navigation with badges and six-item admin handling.

Avoid turning one-off layouts into overly generic widgets. Share components when
two or more screens have the same structure and interaction contract.

## 6. Delivery phases

### Phase 0 — Baseline and design foundation

Goal: establish a measurable reference and prevent visual drift.

- [x] Inventory the role HTML files and V3 behaviour requirements.
- [x] Port the core brand colours, radii, shadows, and type families.
- [x] Bundle the required fonts and licence for offline/release builds.
- [x] Bundle the tutor-dashboard logo asset.
- [ ] Add semantic colours for success, warning, danger, information, disabled,
  focus, overlay, and skeleton states.
- [ ] Add spacing, control-size, divider, animation-duration, and motion tokens.
- [ ] Create an app-level V3 `ThemeData` and component themes where they reduce
  repeated styling.
- [ ] Define the screenshot/golden viewport matrix and text-scale matrix.
- [ ] Capture a legacy behaviour baseline for each live workflow before it is
  reskinned.

Exit criteria: every new V3 widget can be composed without reintroducing
hard-coded brand values, and reviewers have a stable visual/test baseline.

### Phase 1 — Shared shell, routing, and components

Goal: make role navigation explicit and establish the reusable V3 vocabulary.

- [ ] Replace integer destination maps with role-specific typed navigation
  configuration.
- [ ] Add explicit parent, tutor, and admin dashboard routing.
- [ ] Remove out-of-range profile destination mappings.
- [ ] Build the shared header, content sheet, section label, metric tile, ledger
  row, status pill, search field, filter control, quick action, and state widgets.
- [ ] Apply the V3 navigation shell to tutor, parent, and admin configurations.
- [ ] Preserve unread announcement/message and unpaid-invoice indicators.
- [ ] Decide and implement the admin six-destination narrow-width treatment.
- [ ] Add navigation tests for every role and every dashboard quick action.
- [ ] Add invalid/missing-role and role-change tests.

Exit criteria: each role reaches the correct destinations through a tested,
index-safe shell, and new screens use the shared V3 primitives.

### Phase 2 — Parent experience

Goal: give families a concise view of today's classes, attention items,
feedback, bookings, conversations, and billing.

This phase ships first. Reference: `Tenacity Parent App.dc.html`, screens
`1b-home`, `1b-classes`, `1b-messages`, `1b-invoices`. Behaviour to preserve:
`UI_REQUIREMENTS.md` §2.3, 2.4, 2.6, 2.9.

#### P00 Parent backend contracts

**Deferred to the end of the redesign (product decision, 28 Jul 2026).**
Neither blocks parent visual acceptance, which is complete — see P01–P04.
Revisit both once the tutor and admin phases ship, alongside the heavier
backend contracts in §7 they were already sequenced behind.

- [ ] Add card brand and last4 to the payment record, populated from the Stripe
  PaymentIntent in the existing webhook. Needed for P04 invoice history.
- [x] Decide and implement feedback-to-class attribution. Resolved 25 Jul 2026:
  the existing free-text `subject` is the label, giving `<tutor> · <subject>`.
  No schema change. If a class reference is added later, prefer it over the
  subject in `_feedbackAttribution`.
- [ ] Confirm the rounding and overdue rules for parent amount due. No schema
  change expected.

#### P01 Parent dashboard

- [ ] Build a distinct parent dashboard and data adapter.
- [ ] Implement classes-this-week, unread-message, and amount-due metrics.
- [ ] Implement today's class card with child and tutor details.
- [ ] Implement invoice and announcement attention rows.
- [ ] Implement latest-feedback quotation treatment with Newsreader.
- [ ] Wire one-off booking and message-a-tutor quick actions.
- [ ] Support multiple children, no classes, no feedback, no invoice, and no
  announcement states.

#### P02 Parent timetable

- [ ] Implement All/child filters, week strip, term/class summary, grouped class
  ledger, and confirmed/one-off/cancelled states.
- [ ] Preserve permanent enrolment, one-off booking, waitlist, leave waitlist,
  and class-swap behaviour.
- [ ] Keep class capacity and opening-state rules intact.
- [ ] Add clear confirmations, payment/token implications, and safe retry states.

#### P03 Parent messages

- [ ] Implement parent-specific inbox copy, search, unread count, and tutor/team
  identities.
- [ ] Preserve the restriction that parents cannot start chats with parents.
- [ ] Preserve thread deletion, attachments, typing, and read receipts.

#### P04 Parent invoices

- [x] Implement total outstanding summary, due metadata, pay-all action, payment
  method copy, unpaid ledger, history, PDF, and status pills.
- [x] Preserve Stripe payment-sheet behaviour and paid-state refresh.
- [x] Handle no outstanding balance, payment cancelled, payment failed, stale
  invoice, missing PDF, and mixed paid/unpaid states.

Exit criteria: all four parent reference screens preserve the full booking,
feedback, messaging, invoice, and payment behaviour and pass visual acceptance.

### Phase 3 — Tutor experience

Goal: complete the tutor's daily loop: understand today, open a class, mark the
roll, record feedback, and communicate.

T01 was built first under the original tutor-first sequence and its completed
items below predate the shared component library. When this phase resumes, first
re-point `TutorDashboardView` at the shared components extracted from it in F04,
then close the remaining data gaps.

#### T01 Tutor dashboard

- [x] Implement navy header, greeting, logo/avatar, metric row, next class,
  attention list, announcement, quick actions, and V3 tutor navigation styling.
- [x] Add a pure dashboard data adapter and responsive widget tests.
- [x] Add refresh, loading, and retry surfaces.
- [x] Remove room/location from the dashboard scope because Tenacity operates
  one room.
- [x] Replace inferred roll status with an authoritative attendance completion
  contract. `Attendance.rollCompletedAt`/`rollCompletedBy`, 28 Jul 2026.
- [x] Define feedback-due product semantics: every present student requires
  feedback, absent students are exempt, and feedback becomes due when the
  session ends.
- [-] Implement session-linked feedback completion state and populate the
  feedback attention row. Session identity and progress are stored and used by
  the roll (T03); the dashboard's attention row still needs a per-session
  feedback query.
- [ ] Verify counts around midnight, term boundaries, substitute tutors, class
  cancellations, one-off changes, and empty weeks.
- [x] Complete side-by-side visual acceptance at target viewports. Accepted by
  the product owner on 28 Jul 2026.

#### T02 Tutor classes

- [x] Implement week/date strip, term summary, day groups, time rows, student
  counts, and status pills.
- [x] Show tutor assignments from attendance overrides for the selected week.
- [x] Preserve visibility rules for unassigned classes.
- [x] Route assigned class rows and `MARK ROLL` actions to T03.
- [x] Define the `Availability` and `Request a schedule change` behaviours;
  hide or disable them with approved copy until real workflows exist. Resolved
  by exclusion, 28 Jul 2026 — see §7 and §11.
- [x] Cover completed, current, upcoming, cancelled, substitute, and no-class
  states.

#### T03 Tutor class roll and feedback

- [x] Create a dedicated class-session route with class/time/student header.
- [x] Render per-student attendance controls and progress status.
- [x] Support Here/Away, Ahead/On track/Needs support, and feedback text.
- [x] Require an attendance selection before accepting student feedback.
- [x] Require feedback for present students and exempt absent students.
- [x] Save roll state and session-linked feedback through the versioned
  `submitTutorSession` contract.
- [x] Prevent duplicate submission and protect unsaved changes on back navigation.
- [x] Preserve audit fields and author attribution.
- [x] Test mixed attendance, validation, offline attempts, retry, and concurrent
  update behaviour.

#### T04–T06 Tutor lists

- [x] T04: implement the unread/earlier announcement feed, audience badges,
  date metadata, detail navigation, and mark-read behaviour. Author metadata is
  absent from legacy announcements, so the feed does not invent it.
- [x] T05: implement Students/Parents filters, tutor-relevant scoping, search,
  class metadata, feedback shortcuts, and authorised details. Scoping resolved
  as a default `This week` tab rather than a restriction — see §7.
- [x] T06: implement inbox search, unread states, admin identity treatment,
  thread navigation, deletion, new chat, and message refresh. Covered by the
  role-agnostic P03 inbox rebuild.

Exit criteria: the complete tutor reference flow works against real data and all
six tutor screens pass functional, responsive, and visual acceptance.
**Met on 28 Jul 2026**, with one carried item: T01's feedback-due attention row
(tracked in §7, not a visual gap).

### Phase 4 — Admin experience

Goal: provide an operations-first console focused on exceptions, live classes,
people, communication, and billing.

#### A01 Admin dashboard

Scope settled by the §7 gate resolutions of 28 Jul 2026: no cover-needed row,
one-off bookings informational only, New enrol means an existing student.

- [x] Build a distinct admin dashboard and data adapter.
- [x] Implement classes-today, needs-action, and outstanding metrics.
  `needs-action` counts outstanding rolls off `Attendance.isRollComplete`;
  cover is excluded, so it does not contribute.
- [x] Implement the overdue-invoice and outstanding-roll attention rows, plus an
  informational one-off-booking row. **Cover-needed is excluded** — see §7/§11.
- [x] Implement happening-now class rows and roll completion summaries.
- [-] Wire Add class, Create invoice, and New enrol quick actions. Create
  invoice opens `AdminCreateInvoiceScreen` directly. Add class and New enrol
  route to Classes, where the add-class dialog and enrolment already live;
  New enrol's student → class picker over the existing callables arrives with
  A02/S08.
- [x] Define authoritative rules for every attention item before enabling it.
  All five gates resolved 28 Jul 2026 — see §7.

#### A02 Admin classes

- [x] Implement date context, tutor filters, grouped time ledger, capacity,
  tutor, and operational states. **No cover-needed state** — see §7/§11.
  Reassigning a week's tutor stays available as an ordinary edit.
- [x] Preserve add/edit class, tutor assignment scope, cancellation, attendance,
  roster editing, waitlist management, and promotion. All routed into the
  existing dialogs rather than reimplemented.
- [ ] Provide safe conflict handling for tutor, capacity, and concurrent edits.
  Carried to S08 with the rest of the class-management flows.

#### A03 Admin announcements

- [x] Implement All/Parents/Tutors filters, published/archived sections, audience,
  dates, preview, and actions.
- [x] Preserve add and delete.
- [x] Verify edit/archive/read-count support. Firestore fields and admin Rules
  support edit and archive/restore. Aggregate read counts remain unavailable
  because there is no audience denominator or aggregate receipt query.
- [x] Add destructive confirmations and failure-safe mutations.

#### A04 Admin users

- [x] Implement summary counts, role filters, search, identity rows, related
  students, token balance, and account status. **Status is overdue-only**,
  derived from the parent's invoices — see §7/§11.
- [x] Preserve parent/student/tutor details, token editing, feedback navigation,
  invoice PDF, unenrolment, and account removal. All routed into the existing
  `UserDetailScreen` rather than reimplemented.
- [x] Keep destructive actions admin-only and require clear confirmation.
  Unchanged: they stay behind the existing detail screen's own confirmations.

#### A05 Admin messages

- [ ] Apply the V3 inbox design with search, unread state, identities, timestamps,
  deletion, new chat, and thread behaviour.

#### A06 Admin invoices

- [x] Implement outstanding summary, unpaid/overdue counts, filter tabs, compact
  overdue ledger, recent payments, statuses, and new-invoice entry point.
  **The reminders action is excluded**; the next automatic reminder date is
  shown instead — see §7/§11.
- [x] Preserve existing filter, sort, search, multi-select, bulk-action, draft,
  review, line-item editing, finalisation, and PDF behaviour. Retained in
  `AdminInvoiceView` behind `View all invoices`; its reskin is S09.
- [x] Verify reminder tracking and follow-up semantics before exposing those
  reference actions. Verified 28 Jul 2026: reminders are automatic, untracked
  and have no manual trigger, so the action is not exposed — see §7.

Exit criteria: all six admin reference screens work as a coherent operational
console, preserve current admin authority boundaries, and pass visual acceptance.

### Phase 5 — Shared and detail flows

Goal: remove legacy visual seams reached from redesigned top-level screens.

- [ ] Reskin login and password-reset states.
- [x] Reskin terms acceptance without weakening the scroll/acceptance rule.
- [x] Reskin announcement detail and admin composer/edit flows.
- [x] Reskin new chat and chat thread, including all attachment states.
- [ ] Reskin user details and admin people-management sheets/dialogs.
- [ ] Align feedback history and add-feedback screens with T03.
- [x] Reskin parent booking, swap, waitlist, and confirmation flows.
- [ ] Reskin admin class editor, tutor assignment, cancellation, roster, and
  waitlist flows.
- [ ] Reskin invoice payment, creation, review, and PDF-entry surfaces.
- [ ] Reskin profile, edit profile, password, settings, and sign-out flows.
- [ ] Decide whether payslips remain excluded. If restored, add navigation,
  permissions, V3 designs, and tests as a separately approved scope item.

Exit criteria: every route reachable from a V3 screen uses the V3 system or has
an explicitly documented temporary exception.

### Phase 6 — Quality, migration, and release

Goal: ship V3 without functional regressions or incomplete role experiences.

- [ ] Run a legacy-behaviour regression pass against every item in
  `UI_REQUIREMENTS.md`.
- [ ] Run role-permission tests for parent, tutor, admin, signed-out, and invalid
  user states.
- [ ] Test narrow and representative phone widths, safe areas, notches, keyboard,
  landscape policy, and text scaling.
- [ ] Test offline launch, cached data, reconnect, interrupted writes, retry, and
  stale-data states.
- [ ] Test long names, long announcements, many children, large class rosters,
  long invoice lists, and zero-data accounts.
- [ ] Test semantics, focus order, screen-reader labels, contrast, and minimum
  touch targets.
- [ ] Profile dashboard and list rebuilds, image memory, scroll performance, and
  network request duplication.
- [ ] Complete visual comparisons for all 16 reference screens.
- [ ] Remove obsolete legacy dashboard code only after role parity is proven.
- [ ] Update README/release notes and document any backend migrations.
- [ ] **Deploy the Firestore rules change before the build that depends on it.**
  `validFeedbackCreate()` uses `hasOnly()`, so the deployed rules reject the
  `classId`/`sessionId`/`progress` keys the tutor roll writes, and every roll
  submission would fail. The new keys are optional, so deploying rules first is
  safe and has no client dependency. Full note:
  [`docs/operations/pending-rules-deployment.md`](../../docs/operations/pending-rules-deployment.md).
  **This is release-blocking.**
- [ ] Re-capture `backend/firebase/inventory/source-baseline.json` once those
  rules are deployed. Its hash is deliberately stale until then.
- [ ] Run formatting, analysis, the full test suite, and final code review.
- [ ] Release through a controlled internal build, role-based smoke test, and
  monitored production rollout.

Exit criteria: all tracker items are complete or explicitly deferred, all three
roles pass end-to-end smoke tests, and no unresolved high-severity accessibility,
data-integrity, permission, or payment issue remains.

## 7. Data-contract and product-decision gates

The HTML designs contain concepts that are absent, ambiguous, or not yet proven
in the current Flutter data layer. Audit the exact model, Firestore document,
controller, security rule, and deployed backend behaviour before adding fields
or inferring production status.

| Gate | Used by | Decision required |
| --- | --- | --- |
| Room/location | Tutor dashboard/classes/roll; admin dashboard/classes | Resolved: omit room/location from V3 because Tenacity operates one room. |
| Roll completion | Tutor/admin dashboards and classes | **Resolved and implemented 28 Jul 2026.** `Attendance.rollCompletedAt` / `rollCompletedBy` carry an explicit stamp; `isRollComplete` treats an unstamped document as unknown, never as complete. The `updatedBy == 'system'` inference is gone from the tutor dashboard and the classes screen. Partial rolls are handled: the stamp is written only when every student is marked, and reopening a finished roll clears it. No rules change was needed — staff already hold write access to attendance. |
| Feedback due/completion | Tutor dashboard and roll | **Partly implemented 28 Jul 2026.** `StudentFeedback` now carries `classId`, `sessionId` and `progress`, so feedback is session-identified and the roll screen shows `N of M complete` and what is outstanding. **Requires the rules deployment** — see `docs/operations/pending-rules-deployment.md`. Remaining: the tutor dashboard's feedback-due attention row, which needs a per-session feedback query the dashboard does not yet make. |
| Tutor availability/schedule change | Tutor classes | **Resolved 28 Jul 2026: excluded from V3** by product decision. The reference design's `Availability` header action and `Request a schedule change` button are not shipped — there is no availability record, request document, approver or notification path behind either. Gate closed; reopen only if the workflow is actually built. |
| Tutor-visible people scope | Tutor users | **Resolved 28 Jul 2026: tutors see everyone.** Product decision — a tutor may need to look up any family, so the directory is not restricted. The Firestore rules already allowed this (`students` and `users` both grant staff reads), so no rules change was needed and nothing had to be relaxed. Attention is ordered instead of access being limited: a `This week` tab defaults to the students the tutor is actually teaching, and their own people are marked and sorted first in the full lists. The reference design's narrower "Students in your classes" framing was rejected as too restrictive in practice. |
| Cover needed/assignment | Admin dashboard/classes | **Resolved 28 Jul 2026: excluded from V3** by product decision, on the same grounds as tutor availability. Audit findings: a substitute *mechanism* exists and is already used by T02 (`Attendance.tutors` overrides `ClassModel.tutors` for that week, so an admin can reassign a single session), but no cover *workflow* does — no absence record, no cover-request document, no eligible-tutor list, no acceptance step, no notification path, no audit trail. A read-only "no tutor assigned" signal was offered and declined: reassignment stays available through A02, but V3 ships no cover-needed state, attention row or metric. Gate closed; reopen only if the workflow is actually built. See §11. |
| One-off booking approval | Admin dashboard | **Resolved 28 Jul 2026: no approval exists, so none is shown.** `OneOffEnrollmentResult` carries only `added` and `alreadyEnrolled`, and `enrollStudentOneOff` books immediately — there is no pending state and no approval transition. The reference's admin one-off row is therefore **informational only**: a count of one-off bookings in the displayed week, with no accept/reject affordance. Confirm the row earns its place during A01 visual acceptance; drop it if it does not. |
| Announcement edit/archive/read counts | Admin announcements | Resolved 27 Jul 2026: stored audience and archive fields plus admin Firestore Rules support edit and archive/restore. Delete remains permanent behind explicit confirmation. Per-user `readAnnouncements` supports reader state, but no audience denominator or aggregate receipt query exists, so the reference's aggregate read counts are omitted. |
| User account status | Admin users | **Resolved 28 Jul 2026: derive overdue only.** Audit confirmed no status field exists on any relevant model — `AppUser` carries uid/name/role/email/phone/tokens/terms/chats, `Parent` carries only `students` and `lessonTokens`, `Student` carries name/parents/grade/subjects/`primaryParentId`. Product decision: A04 shows a single **overdue** marker computed from the parent's own unpaid/overdue invoices — real data A06 needs regardless — and omits `active`, `trial` and `suspended`, which have no source. No schema change. A stored status field was offered and declined. |
| Invoice reminders/follow-up | Admin dashboard/invoices | **Audited 28 Jul 2026; product decision required.** Reminders already exist and are **fully automatic**: `invoiceReminderScheduler` (`backend/firebase/functions/lib/notifications/invoice_notifications.js`) runs daily at 10:00 Sydney over every `unpaid`/`overdue` invoice and pushes to the parent 7 days before the due date, on the due date, and every 7 days once overdue. It **writes nothing back** — no reminder timestamp, count, delivery record or failure state on the invoice — and there is **no manual admin trigger**. So the reference's `Reminders` action and any reminder tracking have no data source today. **Resolved 28 Jul 2026: reminders stay automatic and the control is dropped.** Instead of a button that cannot report what it did, A06 shows **when the next automatic reminder is due**, derived from `dueDate` against the scheduler's own rule (due−7d, due date, then every 7 days overdue). No schema change, no callable, and no risk of a manual send double-notifying a family alongside the 10:00 job. A manual trigger plus a reminder record was offered and declined. **Constraint for implementation:** the displayed next-reminder date must be derived from the same rule the scheduler uses, so if that schedule changes the UI must change with it. |
| Parent amount due | Parent/admin dashboards and invoices | **Deferred to the end of the redesign** (product decision, 28 Jul 2026) — does not block P04 acceptance. Define currency/rounding, overdue calculation, multiple invoices, credits, and live refresh after payment. `Invoice` already carries `amountDue`, `dueDate`, and an `overdue` status, so no schema change is expected — confirm the rounding and overdue rules only. |
| Payment card brand/last4 | Parent invoices (P04) | **Confirmed missing. Deferred to the end of the redesign** (product decision, 28 Jul 2026) — does not block P04 acceptance; invoice history omits `Visa ····4242` in the interim. `payment_model.dart` stores only `amountPaid`, `paidAt`, `method`. Add brand and last4, populated from the Stripe PaymentIntent in the existing webhook. |
| Feedback-to-class link | Parent dashboard (P01) | **Confirmed missing.** `feedback_model.dart` has `tutorId` and a free-text `subject` but no class or session reference. The dashboard quote attributes feedback to a class. Either add a class reference or accept `subject` as the label — decide before building P01. |
| New enrol shortcut | Admin dashboard | **Audited 28 Jul 2026; product decision required.** No admin-facing enrolment entry point exists. What exists is the callable layer — `enrollStudentPermanent`, `enrollStudentPermanentForParent`, `enrollStudentOneOff`, `unenrollStudentPermanent` in `timetable_service.dart` — all of which enrol an *existing* student into a class. Nothing in the app creates a parent or student account. **Resolved 28 Jul 2026: enrol an existing student.** The quick action opens a student picker, then a class picker, and enrols through the existing callables. Family onboarding — creating parent and student accounts from the admin app — was offered and declined; it stays out of V3 scope. |

Record each resolved gate in the progress log and add tests around the agreed
contract before marking dependent screens complete.

### Sequencing gate for backend work

Backend contracts are in scope for this project, but
`docs/migrations/current-status-and-handoff-2026.md` forbids beginning a
product or schema migration before the Phase 4 cutover is observed stable. That
cutover completed on **24 July 2026**. All V3 UI work proceeds unblocked;
confirm the stability window before starting the first schema change.

The parent screens are deliberately first in part because they need only the two
small contracts above. The heavy contracts — tutor-session, roll completion,
cover-needed, announcement read counts, invoice reminders — sit behind the tutor
and admin phases, which buys time for the gate to clear.

## 8. Functional preservation checklist

Use this checklist during phase acceptance. It supplements the visual screen
tracker and prevents V3 from dropping existing capabilities.

### Authentication and account

- [ ] Email/password sign-in, password reset, offline guard, and logout.
- [x] Required terms check and acceptance.
- [ ] Profile display/edit, password change, and parent settings.
- [ ] Parent child/enrolment details and external enrol-another-student link.

### Classes and attendance

- [ ] Weekly timetable and active term/week handling.
- [ ] Parent permanent enrolment, one-off booking, waitlist, and swap.
- [ ] Tutor assigned-class and attendance workflows.
- [ ] Admin class CRUD, tutor assignment scope, cancellation, roster editing,
  waitlist management, and promotion.

### Communication

- [x] Role/audience-filtered announcements and read state.
- [x] Admin announcement creation, edit, archive/restore and deletion.
- [ ] Inbox search, unread counts, deletion, and new chat.
- [ ] Text, image/file attachment, typing indicator, and read receipts.
- [ ] Parent-to-parent contact restriction.

### People and feedback

- [ ] Searchable user list for authorised roles.
- [ ] Parent/student/tutor detail data and admin-only mutations.
- [ ] Parent/tutor feedback history and admin feedback creation.
- [ ] Correct attribution for active and former tutors.

### Billing

- [ ] Parent invoice list, pay one, pay all, Stripe sheet, paid refresh, and PDF.
- [ ] Admin filters, sorting, search, selection, bulk actions, draft/review,
  line-item editing, and finalisation.
- [ ] Unpaid/overdue indicators remain accurate after payment or admin changes.

## 9. Test and visual-review matrix

### Automated tests expected per feature

- Pure data-derivation tests for dashboard metrics, grouping, statuses, and
  attention rules.
- Widget tests for primary hierarchy, role visibility, navigation actions,
  loading, empty, error, and narrow-screen rendering.
- Controller/service tests for mutations, retries, partial failures, permissions,
  and concurrency-sensitive workflows.
- Regression tests for each bug found during the redesign.
- Full-suite execution before each phase is accepted.

### Representative visual widths

- 320 logical pixels: minimum compact layout and overflow check.
- 390 × 844: compact modern phone reference.
- 402 × 874: current tutor-dashboard test reference.
- A larger supported phone width: spacing and maximum-content-width check.
- Text scale 1.0 and at least 1.3; test higher accessibility scales on critical
  forms and ledgers.

### Manual review for every reference screen

- Header height, safe area, logo/avatar, title baseline, and subtitle.
- Content-sheet overlap, radius, background, and bottom-navigation seam.
- Typography family, size, weight, line height, truncation, and quotation style.
- Section spacing, ledger density, dividers, card radius, shadow, and status pill.
- Icon meaning, alignment, selected/unselected navigation state, and badges.
- Tap targets, pressed/disabled/loading states, keyboard behaviour, scrolling,
  pull-to-refresh, and back navigation.
- Real-data extremes and all standard system states.

## 10. Roadmap maintenance protocol

This file is the active redesign record. Update it in the same change whenever
V3 implementation status changes.

1. Change the applicable tracker status.
2. Check completed acceptance items only after tests and review pass.
3. Update the overall snapshot counts.
4. Add a dated progress-log entry with evidence and remaining gaps.
5. Add newly discovered data/product gates to section 7.
6. Recalculate source hashes if the Desktop redesign files change.
7. Record intentional design deviations and their reason before acceptance.
8. Keep `UI_REQUIREMENTS.md` as the behaviour inventory; do not duplicate or
   silently weaken its requirements here.

When an item is partially implemented, keep it `[-]` and name the remaining
acceptance gaps. A visual first pass alone is not sufficient for `[x]`.

## 11. Explicit exclusions

- `debug_log_screen.dart` remains a developer utility outside the V3 visual
  scope.
- Payslips remain outside the live V3 navigation until product scope explicitly
  restores them.
- Room/location UI, filters, and conflict handling are excluded because Tenacity
  operates one room.
- Tutor availability and schedule-change requests are excluded (28 Jul 2026).
  The reference design shows both on the tutor classes screen; neither has a
  backing workflow, and a control that does nothing is worse than its absence.
- Cover-needed states, attention rows and metrics are excluded (28 Jul 2026),
  on the same grounds. The admin dashboard and classes references show a cover
  workflow — absence, request, eligible tutors, acceptance — none of which
  exists. Reassigning a single week's tutor is unaffected and remains available
  through A02, because it is an ordinary edit rather than a cover workflow.
- Account status pills other than overdue are excluded (28 Jul 2026). `active`,
  `trial` and `suspended` appear in the admin users reference but exist nowhere
  in the data; overdue is derived from the parent's invoices instead.
- A manual "send reminder" control is excluded (28 Jul 2026). Invoice reminders
  are already automatic and record nothing, so A06 shows the next scheduled
  reminder rather than a button that cannot report its outcome.
- Creating parent or student accounts from the admin app is excluded
  (28 Jul 2026). The dashboard's New enrol action enrols an existing student.
- Changes to the marketing website or parent registration website are outside
  this mobile-app roadmap.
- Backend/schema work is in scope (see §1 *Delivery decisions*), but only when a
  verified data-contract gate in §7 shows it is required for an approved V3
  experience, and only after the sequencing gate in §7 has cleared. Design
  elements with no confirmed data source are not shipped as placeholders.
