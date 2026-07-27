# Tenacity App V3 Redesign Roadmap

- Last updated: 28 July 2026
- Working branch: `feat/mobile/v3-foundation` (monorepo `apps/mobile`)
- Roadmap status: Active
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
| Reference screens | 2 / 16 | 5 | 9 | 0 |
| Design foundation workstreams | 3 / 8 | 4 | 1 | 0 |
| Supporting/detail workstreams | 5 / 10 | 3 | 2 | 0 |

**Every screen and modal a parent can reach is now on the V3 system.** All four
parent reference screens (P01–P04) have a V3 implementation, and the shared
inbox covers most of T06 and A05. The tutor and admin announcement flows (T04,
A03 and S03) are complete after product-owner visual acceptance, and the terms
gate (S02) is complete after on-device verification. The chat thread,
class-browse layout, profile/settings and login are on the V3 system too. The
booking sheets (the rest of S07), the new-chat contact picker (the rest of S04)
and the offline surfaces (the rest of S01) closed on 28 Jul 2026 — they were
the last legacy parent surfaces. The parent half of S09 covers the full payment
and PDF path; its admin creation/review half remains.

P01–P04 remain `[-]` on product-owner visual acceptance and the P00 card
contract, not on missing implementation.

The tutor dashboard's visual first pass, data adapter, responsive widget tests,
bundled fonts, and logo are present but parked: T01 remains in progress until
the feedback-due and authoritative roll-status contracts are implemented and a
final visual acceptance pass is completed.

### Foundation tracker

| ID | Workstream | Status | Current evidence / next action |
| --- | --- | --- | --- |
| F01 | Brand tokens | `[x]` | `design_tokens.dart` carries the brand colours, semantic status colours, radii (including the 28px sheet), shadows (including the upward sheet shadow), `AppSpacing`, `AppSizes`, `AppDurations`, and the three type families. `app_theme.dart` maps them onto `ThemeData`, replacing the `ColorScheme.fromSeed` that previously let Material defaults through. |
| F02 | Fonts and licensing | `[x]` | Bricolage Grotesque, Plus Jakarta Sans, and Newsreader are bundled; runtime font fetching is disabled; OFL licence is registered. Verified 25 Jul 2026: every `AppText` variant currently requested resolves to a bundled file. **Guardrail:** `google_fonts` matches on filename, and with runtime fetching off an unbundled weight throws and silently falls back to the default font. Only `BricolageGrotesque-Bold` (w700) is bundled, while the reference HTML loads Bricolage 500–800 — add the matching `.ttf` to `lib/assets/fonts/` before using any other display weight. Plus Jakarta has Regular/Medium/SemiBold/Bold; Newsreader has Italic only. |
| F03 | Brand assets | `[x]` | The white vertical logo used by the tutor dashboard is bundled. Audit horizontal, dark-background, app-icon, and accessibility variants before shared-shell work finishes. |
| F04 | Shared V3 components | `[-]` | `lib/src/ui/components/` holds `AppHeader`, `DetailHeader`, `MetricTile`, `ContentSheet`, `SectionLabel`, `LedgerRow`/`LedgerRowEmpty`, `AttentionList`, `StatusPill`/`PillButton`, `QuickActionTile`/`QuickActionGrid`, `SearchField`, `ConversationRow`, `SegmentedFilter`, `TimetableRow`, `WeekStrip`, `EmptyStateView`/`ErrorStateView`/`SkeletonBlock`, `AppBottomNavigation`, and — added 28 Jul 2026 — `AppBottomSheet`/`SheetActions` and `OfflineBanner`/`OfflineToast`. Covered by `test/components_test.dart`. `AppBottomSheet` measures itself from the constraints it is handed rather than from `MediaQuery`, so it behaves inside a modal route and does not collapse where the media query has been replaced rather than extended. Remaining: a pull-to-refresh wrapper and a shared destructive-confirmation surface, both still written per screen. |
| F05 | Role dashboard routing | `[-]` | `DashboardRouter` selects by role. Tutor renders `TutorDashboard` (extracted to `ui/dashboard/tutor/`); parent and admin still fall through to the legacy `HomeDashboard` until P01 and A01 replace them. |
| F06 | Role navigation shells | `[x]` | `home_navigation.dart` defines typed `AppDestination`s and per-role `destinationsForRole`; `home_screen.dart` holds selection as a destination, not an index; profile is a pushed route. The `role == 'tutor'` styling conditionals are gone — `AppBottomNavigation` styles every role. **Two latent defects removed** — both were unreachable in production, and were correct only by coincidence rather than by construction: (1) `profile` mapped to index 5 for parent and tutor against 5-element screen lists, which would have thrown, but nothing ever passed `DashboardDestination.profile`; (2) `notification_service` used `selectTab(4)` for invoice reminders, which is Invoices for a parent but Messages for a tutor or admin — safe only because `invoice_notifications.js` sends that type solely to parent tokens. Either would have become a real bug the moment a tab was added or a notification was retargeted. Covered by `test/home_navigation_test.dart`. |
| F07 | Responsive/accessibility baseline | `[-]` | Widths and text scale are exercised per screen (320 / 402 / 430 at scale 1.0 and 1.3 in the parent dashboard tests). Still to define: semantics, focus behaviour, contrast rules, and a working golden harness. **Known blocker for goldens:** a trial run rendered the parent dashboard correctly in layout but drew Plus Jakarta Medium (w500) and Newsreader Italic as block glyphs. An isolated probe rendering all six variants — with and without `AppTheme.light` — came out correct, so the fonts, the token file and the app are fine; something about that widget tree leaves those two variants unresolved at capture time. Committing such a baseline would mask real font regressions, so no goldens are checked in yet. Solve this before adopting goldens as the visual-acceptance mechanism. |
| F08 | State and telemetry baseline | `[ ]` | Standardise refresh, retry, offline, skeleton/loading, empty, and error patterns. Decide whether V3 navigation/action failures need analytics or audit events. |

### Reference-screen tracker

Delivery order is parent (P), then tutor (T), then admin (A).

| ID | Role | Reference screen | Status | Flutter target / note |
| --- | --- | --- | --- | --- |
| P01 | Parent | Dashboard | `[-]` | `ParentDashboard`, `ParentDashboardView` and `buildParentDashboardViewData` implemented with today's classes, attention rows, feedback quote, and quick actions. Covered by 21 data tests and 17 widget tests across three viewports and text scale 1.3. Remaining: visual acceptance against the reference, and the payment card brand/last4 contract (P00) before P04. **Resolved 25 Jul 2026:** parents keep five tabs. The reference design drops the Announcements tab and surfaces announcements only as a dashboard row; that was rejected because families must be able to browse announcements directly. The dashboard shows the newest unread announcement *in addition to* the tab, and both read from the same read-state so they cannot disagree. |
| P02 | Parent | Timetable | `[-]` | `ui/timetable/parent/` holds a pure adapter and view: per-child filter, week pager, week strip with day dots, day groups, and confirmed/one-off/cancelled sessions. `TimetableScreen` renders it for parents and routes every session tap into the existing `_showParentClassOptionsDialog`, so swap, absence, one-off and waitlist behaviour is unchanged rather than reimplemented. Covered by 17 data tests and 19 widget tests. **Documented exception:** the reference design lists only booked classes, so browsing and enrolling in a new class sits behind the `Book a one-off class` button, which pushes `TimetableScreen(browseOnly: true)`. That surface is now on the V3 design too — see S07. Visually accepted on device 25 Jul 2026. |
| P03 | Parent | Messages | `[-]` | `InboxScreen` rebuilt on the V3 design: navy header with unread count, search field and new-chat button, and a white sheet of conversation rows with squircle avatars, unread emphasis and count badges. The reference gives parents, tutors and admins the same inbox, so this is role-agnostic and largely covers T06 and A05 too — confirm against those references before marking them done. Search, swipe-to-delete with its offline guard, the new-chat route and thread navigation are unchanged. Timestamps now degrade time → Yesterday → weekday → date instead of always showing a clock time. Covered by 19 data tests plus component tests. Remaining: visual acceptance, and the chat thread itself (S04) is still legacy. |
| P04 | Parent | Invoices | `[-]` | `InvoicesScreen` is on the V3 design with outstanding total, due summary, pay-all, unpaid cards, PDF and limited history. The S09 payment pass adds explicit success/cancel/failure/unconfirmed states, blocks duplicate payment while a receipt is pending, reuses client secrets after cancellation, reconciles the live paid state, coalesces PDF generation/open requests, and gives loading/error/retry states. `InvoiceController` now owns one replaceable subscription rather than leaking one on every entry; scope guards prevent a payment/PDF completion from crossing accounts. Covered by 17 data tests, 9 payment/PDF/widget tests and 3 stream-lifecycle tests. Verified with the live paid-history route and a non-persisting unpaid/pay-all preview on iPhone 16 Pro. **Two deliberate deviations:** Bricolage Bold substitutes for the unavailable ExtraBold weight (F02), and history omits `Visa ····4242` because the payment record has no card brand or last four digits (P00). Remaining: product-owner visual acceptance and the card contract. |
| T01 | Tutor | Dashboard | `[-]` | `TutorDashboardView` and `buildTutorDashboardViewData` implemented; data and final visual gaps remain. Parked until the parent experience ships. |
| T02 | Tutor | Classes weekly grid | `[ ]` | Redesign `TimetableScreen` for the tutor weekly schedule and assigned-class states. |
| T03 | Tutor | Class Roll & Feedback | `[ ]` | Extract a dedicated class-session detail flow from the current attendance dialog and feedback screens. |
| T04 | Tutor | Announcements | `[x]` | Shared V3 feed implemented with audience filtering, unread/earlier sections, audience badges, relative dates, pull-to-refresh and defensive loading/error/empty states. The V3 detail keeps link handling, marks a notice read once, and clears the navigation badge reactively. Covered by adapter and widget tests at 320, 402 and 430px with text scale 1.3. Visually accepted by the product owner on 27 Jul 2026. |
| T05 | Tutor | Users | `[ ]` | Scope to students/parents relevant to the tutor where supported; preserve authorised detail access. |
| T06 | Tutor | Messages | `[ ]` | Reskin inbox/search/unread states and retain chat-thread behaviour. |
| A01 | Admin | Dashboard | `[ ]` | Build operations dashboard around exceptions, live classes, outstanding billing, and quick actions. |
| A02 | Admin | Classes | `[ ]` | Build master timetable with tutor views and all existing class-management actions. Room filtering is excluded because Tenacity operates one room. |
| A03 | Admin | Announcements | `[x]` | Admin feed implemented with All/Parents/Tutors filters, published/archived groups, audience badges, V3 create/edit form, archive/restore, and confirmed failure-safe deletion from the row or detail. Writes carry audit events; archived drafts do not notify their audience. The controller keys its cache by active/archive and audience scope, so entering admin after another role cannot reuse the wrong feed. Aggregate read counts are omitted: the contract has per-user read ids but no audience denominator or aggregate receipt query. Visually accepted by the product owner on 27 Jul 2026. |
| A04 | Admin | Users | `[ ]` | Build role filters, search, status summaries, detail navigation, and protected destructive actions. |
| A05 | Admin | Messages | `[ ]` | Reskin the admin inbox while preserving search, unread, deletion, attachments, and receipts. |
| A06 | Admin | Invoices | `[ ]` | Build the billing summary and compact ledger while retaining the full filter, sort, search, multi-select, bulk-action, create, and review console. |

### Supporting and detail-screen tracker

| ID | Workstream | Status | Scope |
| --- | --- | --- | --- |
| S01 | Login and signed-out offline state | `[-]` | `ui/auth/login_{form,view}.dart` with `login_screen.dart` as the container: the brand over a white sheet holding the form, one inline feedback panel, a loading state that keeps the button's size, and the reset link enabled on the email alone. Validation lives in one place instead of being written out per field. The offline guard on both sign-in and reset is unchanged. Covered by 13 form tests, 24 widget tests across three viewports and text scale 1.3, and 6 container tests. **No reference design exists for this screen.** The offline state closed 28 Jul 2026: `components/offline_surfaces.dart` holds the ambient `OfflineBanner` and the transient `OfflineToast`, both on brand tokens, and `OfflineAwareEmptyState` now uses `EmptyStateView` with offline-specific copy instead of bare centred text. Because the guard and the banner are app-wide, this reskins every role's offline surface, not just the signed-out one. Remaining: visual acceptance by the account owner while genuinely signed out. The offline surfaces themselves are covered by widget tests but have **not** been seen on device — the simulator shares the host's connection, so there is no way to take it offline without cutting the machine's network. |
| S02 | Terms acceptance | `[x]` | V3 markdown reader with sticky progress and acceptance controls, current-version/changelog context, safe external links, read-only Settings route, loading/retry and failed-save states. Acceptance remains locked until the document end, while a short document that already fits is treated as read. Remote Config falls back to its last activated document offline and rejects the placeholder. The gate checks every signed-in account independently, ignores superseded status reads and remains closed on lookup/write failure. Covered by 19 focused data/controller/widget/lifecycle tests, including 320px and text scale 1.3. **No reference design exists for this screen;** it extends the established V3 header and content-sheet language. Verified on iPhone 16 Pro with the real v1.0.1 document from 0% to 100%; the non-persisting gate preview confirmed the acceptance footer without changing the account record. |
| S03 | Announcement details and composer | `[x]` | Linkified V3 detail implemented with loading/not-found/retry states and one mark-read attempt per open. Admin V3 create/edit supports validated title/body, all four stored audiences and publish/archive state; edit, archive/restore and permanent delete are available from the list/detail with offline guards, confirmations and failure feedback. Archived creation no longer sends a push notification. Widget tests cover reader/admin hierarchy, narrow layout, large text, validation, actions and saving state. Visually accepted by the product owner on 27 Jul 2026. |
| S04 | Chat creation and thread | `[x]` | The thread is on the V3 palette: navy header carrying the same squircle identity as the inbox row that opens it, blue/blue-50 bubbles, tokenised date separators, read receipts, typing indicator and composer. Text, image and file sending, drafts, pending states, upload progress and offline guards are untouched. The contact picker is rebuilt as `ui/messaging/new_chat_{data,view}.dart` behind `new_chat_screen.dart`: a detail header with a live contact count, the inbox's search field, and role-grouped identity rows over a content sheet, with skeleton, retry, no-match and offline-empty states. The parent-to-parent restriction moved into the pure adapter, where it is now tested. Covered by 11 data tests and 17 widget tests at 320/402/430 and text scale 1.3. **No reference design exists for either screen** — the design files only include the inbox — so both extend the established language; revisit if a thread or picker design is produced. |
| S05 | User details and management | `[ ]` | Parent/student/tutor details, tokens, enrolments, invoice PDF, feedback links, destructive admin actions. |
| S06 | Student feedback history | `[ ]` | Parent/tutor read views and admin creation, aligned with the new class-roll feedback experience. |
| S07 | Parent booking flows | `[x]` | The browse surface behind `Book a one-off class` is on the V3 design: `ui/timetable/parent/parent_browse_{data,view}.dart` give a navy header with the week pager and day strip over day-grouped class rows, each carrying the action the options dialog will actually offer — `BOOKED`, `N SPOTS`, `WAITLIST` or `CANCELLED` — with the one-off and opening notes beneath. Eligibility stays on `TimetableController.isEligibleClass`; every tap routes into the existing `_showParentClassOptionsDialog`, so the enrolment, swap and waitlist logic is untouched. Covered by 30 data tests and 24 widget tests. **No reference design exists for this screen** — the design files show only booked classes — so it extends the established language. The sheets closed 28 Jul 2026: `booking_data.dart` derives the option list and every confirmation message as pure functions, and `booking_sheets.dart` renders the options, child-selection, class-selection and confirmation sheets on the shared `AppBottomSheet`. The action ids are unchanged, so every booking call still dispatches on the same strings; only the wording and the surface are new. Covered by 35 data tests and 25 widget tests. |
| S08 | Admin class-management flows | `[ ]` | Add/edit class, tutor assignment scope, attendance, cancellation, roster editing, waitlist promotion. |
| S09 | Invoice payment and creation details | `[-]` | Parent payment surfaces are complete: Stripe sheet orchestration, pay-now/pay-all intent reuse, success/cancel/failure/pending outcomes, paid-state reconciliation, PDF coalescing/open failures, and retryable invoice loading. The invoice creation half remains: parent/student/session selection, line-item review and finalisation, to be completed with the admin invoice work. |
| S10 | Profile, edit profile, password, settings | `[x]` | Role-aware V3 profile/settings flow complete for every role. Parent accounts receive durable notification preferences, lesson tokens, expandable students/classes and an always-available enrolment link; other roles omit parent-only controls. Edit and password forms are prefilled/validated, block duplicate writes, map Firebase failures to safe inline feedback and keep success visible. Profile/settings loads are post-frame, fenced by account and retryable; student class requests are cached per visit. Account deletion retains two confirmations and no raw backend errors. Covered by 25 focused controller/view/form tests at 320–430px and text scale 1.3. Verified on iPhone 16 Pro through profile, child expansion, settings, edit/password, read-only terms and back to Classes with no runtime exception. **No reference design exists for these screens;** they extend the established V3 detail-header and content-sheet language. |

### Current focus and next queue

Done in code: F01–F06 (tokens, theme, component library, typed navigation,
dashboard router), P01–P04 (all four parent screens), chat thread and contact
picker (S04), the class-browse screen and every booking sheet (S07), login and
the offline surfaces (S01), terms (S02), announcement feed/detail/management
(T04, A03 and S03), and profile/settings (S10). The inbox rebuild also covers
most of T06 and A05.

**The parent experience is now V3 end to end** — no screen, sheet or dialog a
parent can reach is still on the legacy design. What is left for parents is
acceptance and contracts, not implementation.

Next, in order:

1. Product-owner visual acceptance of P01–P04 and the booking sheets, and
   account-owner acceptance of login while genuinely signed out.
2. Land the two parent backend contracts once the sequencing gate in §7 clears:
   payment card brand/last4, and confirmation of the amount-due rounding rules.
3. Implement the tutor-session contract, close the T01 data gaps, and deliver
   T02–T05.
4. Deliver the remaining admin experience with its contracts.
5. Release hardening (§6 Phase 6).

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

Both are confirmed missing against the current models. Subject to the
sequencing gate in §7.

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
- [ ] Replace inferred roll status with an authoritative attendance completion
  contract.
- [x] Define feedback-due product semantics: every present student requires
  feedback, absent students are exempt, and feedback becomes due when the
  session ends.
- [ ] Implement session-linked feedback completion state and populate the
  feedback attention row.
- [ ] Verify counts around midnight, term boundaries, substitute tutors, class
  cancellations, one-off changes, and empty weeks.
- [ ] Complete side-by-side visual acceptance at target viewports.

#### T02 Tutor classes

- [ ] Implement week/date strip, term summary, day groups, time rows, student
  counts, and status pills.
- [ ] Show tutor assignments from attendance overrides for the selected week.
- [ ] Preserve visibility rules for unassigned classes.
- [ ] Route assigned class rows and `MARK ROLL` actions to T03.
- [ ] Define the `Availability` and `Request a schedule change` behaviours;
  hide or disable them with approved copy until real workflows exist.
- [ ] Cover completed, current, upcoming, cancelled, substitute, and no-class
  states.

#### T03 Tutor class roll and feedback

- [ ] Create a dedicated class-session route with class/time/student header.
- [ ] Render per-student attendance controls and progress status.
- [ ] Support Here/Away, Ahead/On track/Needs support, and feedback text.
- [ ] Require an attendance selection before accepting student feedback.
- [ ] Require feedback for present students and exempt absent students.
- [ ] Save roll state and session-linked feedback through the versioned
  `submitTutorSession` contract.
- [ ] Prevent duplicate submission and protect unsaved changes on back navigation.
- [ ] Preserve audit fields and author attribution.
- [ ] Test mixed attendance, validation, offline attempts, retry, and concurrent
  update behaviour.

#### T04–T06 Tutor lists

- [x] T04: implement the unread/earlier announcement feed, audience badges,
  date metadata, detail navigation, and mark-read behaviour. Author metadata is
  absent from legacy announcements, so the feed does not invent it.
- [ ] T05: implement Students/Parents filters, tutor-relevant scoping, search,
  class metadata, feedback shortcuts, and authorised details.
- [ ] T06: implement inbox search, unread states, admin identity treatment,
  thread navigation, deletion, new chat, and message refresh.

Exit criteria: the complete tutor reference flow works against real data and all
six tutor screens pass functional, responsive, and visual acceptance.

### Phase 4 — Admin experience

Goal: provide an operations-first console focused on exceptions, live classes,
people, communication, and billing.

#### A01 Admin dashboard

- [ ] Build a distinct admin dashboard and data adapter.
- [ ] Implement classes-today, needs-action, and outstanding metrics.
- [ ] Implement cover-needed, one-off-booking, and overdue-invoice attention rows.
- [ ] Implement happening-now class rows and roll completion summaries.
- [ ] Wire Add class, Create invoice, and New enrol quick actions.
- [ ] Define authoritative rules for every attention item before enabling it.

#### A02 Admin classes

- [ ] Implement date context, tutor filters, grouped time ledger, capacity,
  tutor, and operational states.
- [ ] Preserve add/edit class, tutor assignment scope, cancellation, attendance,
  roster editing, waitlist management, and promotion.
- [ ] Provide safe conflict handling for tutor, capacity, and concurrent edits.

#### A03 Admin announcements

- [x] Implement All/Parents/Tutors filters, published/archived sections, audience,
  dates, preview, and actions.
- [x] Preserve add and delete.
- [x] Verify edit/archive/read-count support. Firestore fields and admin Rules
  support edit and archive/restore. Aggregate read counts remain unavailable
  because there is no audience denominator or aggregate receipt query.
- [x] Add destructive confirmations and failure-safe mutations.

#### A04 Admin users

- [ ] Implement summary counts, role filters, search, identity rows, related
  students, token balance, and account status.
- [ ] Preserve parent/student/tutor details, token editing, feedback navigation,
  invoice PDF, unenrolment, and account removal.
- [ ] Keep destructive actions admin-only and require clear confirmation.

#### A05 Admin messages

- [ ] Apply the V3 inbox design with search, unread state, identities, timestamps,
  deletion, new chat, and thread behaviour.

#### A06 Admin invoices

- [ ] Implement outstanding summary, unpaid/overdue counts, reminders action,
  filter tabs, compact overdue ledger, recent payments, statuses, and new-invoice
  entry point.
- [ ] Preserve existing filter, sort, search, multi-select, bulk-action, draft,
  review, line-item editing, finalisation, and PDF behaviour.
- [ ] Verify reminder tracking and follow-up semantics before exposing those
  reference actions.

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
| Roll completion | Tutor/admin dashboards and classes | Product direction resolved: use explicit completion time and completing user. Implement and verify expected-roster and partial-roll behavior through the tutor-session backend contract. Avoid relying on `updatedBy == system` long term. |
| Feedback due/completion | Tutor dashboard and roll | Product rule resolved: every present student requires feedback, absent students are exempt, and feedback is due when the session ends. Implement session identity, completion state, and progress status through the tutor-session backend contract. |
| Tutor availability/schedule change | Tutor classes | Define whether these are requests, recurring availability, one-session changes, and who approves them. |
| Tutor-visible people scope | Tutor users | Decide whether tutors see only assigned students/parents or a wider directory; align queries and rules. |
| Cover needed/assignment | Admin dashboard/classes | Define absence source, cover request state, eligible tutors, acceptance, notification, and audit trail. |
| One-off booking approval | Admin dashboard | Confirm whether current one-off bookings require approval and which state transitions are valid. |
| Announcement edit/archive/read counts | Admin announcements | Resolved 27 Jul 2026: stored audience and archive fields plus admin Firestore Rules support edit and archive/restore. Delete remains permanent behind explicit confirmation. Per-user `readAnnouncements` supports reader state, but no audience denominator or aggregate receipt query exists, so the reference's aggregate read counts are omitted. |
| User account status | Admin users | Define active, overdue, trial, suspended, and related status sources. |
| Invoice reminders/follow-up | Admin dashboard/invoices | Define reminder timestamps, counts, delivery channel, failure state, and audit requirements. |
| Parent amount due | Parent/admin dashboards and invoices | Define currency/rounding, overdue calculation, multiple invoices, credits, and live refresh after payment. `Invoice` already carries `amountDue`, `dueDate`, and an `overdue` status, so no schema change is expected — confirm the rounding and overdue rules only. |
| Payment card brand/last4 | Parent invoices (P04) | **Confirmed missing.** `payment_model.dart` stores only `amountPaid`, `paidAt`, `method`. The design shows `Visa ····4242` in invoice history. Add brand and last4, populated from the Stripe PaymentIntent in the existing webhook. |
| Feedback-to-class link | Parent dashboard (P01) | **Confirmed missing.** `feedback_model.dart` has `tutorId` and a free-text `subject` but no class or session reference. The dashboard quote attributes feedback to a class. Either add a class reference or accept `subject` as the label — decide before building P01. |
| New enrol shortcut | Admin dashboard | Decide the intended destination and whether it creates a parent, student, enrolment, or invitation. |

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
- Changes to the marketing website or parent registration website are outside
  this mobile-app roadmap.
- Backend/schema work is in scope (see §1 *Delivery decisions*), but only when a
  verified data-contract gate in §7 shows it is required for an approved V3
  experience, and only after the sequencing gate in §7 has cleared. Design
  elements with no confirmed data source are not shipped as placeholders.
