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
| 2026-07-28 | [Admin people directory on the V3 design](#2026-07-28--admin-people-directory-on-the-v3-design) |
| 2026-07-28 | [Admin class timetable on the V3 design](#2026-07-28--admin-class-timetable-on-the-v3-design) |
| 2026-07-28 | [Admin dashboard on the V3 design](#2026-07-28--admin-dashboard-on-the-v3-design) |
| 2026-07-28 | [Tutor experience accepted; admin phase opened](#2026-07-28--tutor-experience-accepted-admin-phase-opened) |
| 2026-07-28 | [Student details, feedback colour, and bounded navigation](#2026-07-28--student-details-feedback-colour-and-bounded-navigation) |
| 2026-07-28 | [Legacy student, parent and feedback screens replaced](#2026-07-28--legacy-student-parent-and-feedback-screens-replaced) |
| 2026-07-28 | [Tutor experience and the tutor-session contract](#2026-07-28--tutor-experience-and-the-tutor-session-contract) |
| 2026-07-28 | [Parent UX accepted; payment card work deferred](#2026-07-28--parent-ux-accepted-payment-card-work-deferred) |
| 2026-07-28 | [Last legacy parent surfaces moved to V3](#2026-07-28--last-legacy-parent-surfaces-moved-to-v3) |
| 2026-07-27 | [V3 profile, settings and account forms](#2026-07-27--v3-profile-settings-and-account-forms) |
| 2026-07-27 | [V3 parent invoice payment surfaces](#2026-07-27--v3-parent-invoice-payment-surfaces) |
| 2026-07-27 | [V3 terms acceptance and announcement sign-off](#2026-07-27--v3-terms-acceptance-and-announcement-sign-off) |
| 2026-07-27 | [Defer the Classes auth refresh until after build](#2026-07-27--defer-the-classes-auth-refresh-until-after-build) |
| 2026-07-27 | [Defer dashboard loads until after build](#2026-07-27--defer-dashboard-loads-until-after-build) |
| 2026-07-27 | [V3 announcement detail and admin management](#2026-07-27--v3-announcement-detail-and-admin-management) |
| 2026-07-27 | [V3 announcement feeds](#2026-07-27--v3-announcement-feeds) |
| 2026-07-27 | [Login screen on the V3 design](#2026-07-27--login-screen-on-the-v3-design) |
| 2026-07-27 | [Class-browse screen on the V3 design](#2026-07-27--class-browse-screen-on-the-v3-design) |
| 2026-07-26 | [Chat thread reskin and handoff notes](#2026-07-26--chat-thread-reskin-and-handoff-notes) |
| 2026-07-26 | [Parent invoices on the V3 design](#2026-07-26--parent-invoices-on-the-v3-design) |
| 2026-07-26 | [Message inbox on the V3 design](#2026-07-26--message-inbox-on-the-v3-design) |
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

## 2026-07-28 — Admin people directory on the V3 design

**What changed**

- Rebuilt the admin list of everyone in the system, with separate tabs for
  parents, students and tutors. Parents show their children and how many lesson
  credits they hold; students show their year and subjects.
- Searching matches a person's details as well as their name, so a parent can
  be found by typing their child's name.
- **The only badge shown is "overdue"**, worked out from a family's own unpaid
  invoices. The original design also had "active" and "trial" badges; nothing in
  the system records either, so they were dropped rather than faked. The design
  also had a button to create a new account, which the app cannot do.
- If the invoice check fails, nobody is marked overdue rather than everybody —
  a wrong accusation about money is worse than a missing badge.
- Tapping someone opens the same account screen as before, so editing credits,
  enrolments, invoices and account deletion all behave exactly as they did,
  including their confirmation prompts.

**Why:** This is how admins find a family when a parent calls. It is also the
last people-facing screen on the old design.

**Status:** Built on `feat/mobile/v3-foundation`, not merged. 677 tests pass
(up from 650), and the full check passes. Seen on a phone but not signed off.

**Next steps**

- Sign it off.
- The account screen behind a person is still on the old design; it is rebuilt
  with the remaining admin work.

---

## 2026-07-28 — Admin class timetable on the V3 design

**What changed**

- Rebuilt the admin class timetable, the last screen still on the old design
  for any of the three roles. It shows one day at a time, with classes grouped
  by the time they start, and marks whichever group is running right now.
- Each class shows its tutor, how many of its seats are taken, and its state:
  running, no roll marked, done, full, seats left, or cancelled. Seats count
  visiting students, not just the regulars.
- **Nothing about how classes are managed changed.** Tapping a class opens the
  same menu as before — students, tutors, waitlist, cancel — and "Add a class"
  opens the same form. Only the screen around them is new, which is deliberate:
  rewriting that behaviour is where a redesign breaks things.
- Added a second way to read the day: by tutor instead of by time, which
  answers "who is teaching what today". This replaces a Rooms view in the
  original design that Tenacity has no use for, since it has one room.
- Checked on a phone, which again caught something the tests did not: in the
  by-tutor view there was no way to tell a class happening right now from one
  that finished earlier that morning, because both are labelled "no roll" and
  that view has no clock times to read from. Live classes are now highlighted
  in both views.

**Why:** The admin timetable is the busiest screen in the app — every class,
every day. Getting it onto the new design finishes the visual work for all
three roles.

**Status:** Built on `feat/mobile/v3-foundation`, not merged. 650 tests pass
(up from 618), and the full check passes. Seen on a phone but not signed off.

**Next steps**

- Sign it off.
- Handling two admins editing the same class at once is still to do; it comes
  with the rest of the class-management work.

---

## 2026-07-28 — Admin dashboard on the V3 design

**What changed**

- Admins now get their own dashboard instead of the old shared one — the last
  role still looking at the pre-redesign home screen. It leads with how many
  classes run today, how many things need action, and how much money is
  outstanding, then lists what needs doing, what is running right now, and the
  three jobs admins start most often.
- **The roll indicator only claims what it can prove.** A class shows a figure
  like "5 of 6 here" once a tutor has actually confirmed the roll. Until then it
  says "no roll" rather than a number, because a session where nobody has been
  marked yet and one where every student was away look identical in the stored
  data — printing "0 of 6" for both would state a guess as a fact.
- A class is only chased for a missing roll once it has finished, so a lesson
  still in progress is never flagged.
- A visiting student can no longer produce a nonsense figure like "7 of 6": the
  total counts everyone the tutor actually saw, not just the regulars.
- Fixed a shared layout component that could only lay out buttons two per row,
  which drew the admin design's row of three as two plus a stray half-width one.
- Checked it on a phone, which caught something the automated tests missed: the
  name of the tutor taking each class was being cut off the end of every row, so
  an admin could not see who was teaching. It now sits on the second line, which
  had spare space. The tests had only checked short, made-up class names.

**Why:** The admin experience is the last of the three to be redesigned, and the
dashboard is where it starts. The roll indicator is called out because it was
the one place the design asked for a number the system cannot honestly produce.

**Status:** Built on `feat/mobile/v3-foundation`, not merged. 618 tests pass
(up from 593), formatting, analysis and the production web build are all clean.
Checked on an iPhone 16 Pro at the exact size the designs were drawn at, but not
yet signed off.

**Next steps**

- Sign it off. Worth deciding one thing while looking: longer class names are
  cut short on the class rows, the same as on the parent and tutor screens.
- Two shortcuts are interim: "Add class" and "New enrol" open the classes screen,
  where both jobs are done today. They get direct entry points when the admin
  classes screen is rebuilt.
- The screen was viewed on its own, so the join between it and the row of tabs
  at the bottom has not been seen yet. Worth a glance when signing off.

---

## 2026-07-28 — Tutor experience accepted; admin phase opened

**What changed**

- The product owner signed off on all six tutor screens. The redesign tracker
  now shows ten of sixteen screens finished: every parent screen, every tutor
  screen, and admin announcements.
- The tutor dashboard is the one screen still marked unfinished, and only for
  a reason nothing on screen shows: it cannot yet tell which classes are still
  owed written feedback, because that needs a query the dashboard does not make.
- Before starting admin work, audited the five open questions the admin designs
  depend on, checking each against what the system actually stores today rather
  than what the design assumes. Four of the five turned out to be designs for
  features that do not exist, and all five are now decided:
  - **Cover for an absent tutor** — an admin can already swap the tutor on a
    single week's class, but there is no way for a tutor to report an absence,
    no request for cover, and nobody notified. *Decision: dropped from the
    redesign.* Swapping a tutor stays exactly as it is; the app simply will not
    claim to manage cover.
  - **One-off booking approval** — there is none. A one-off booking takes effect
    immediately, so the design's approval queue has nothing to queue. *Decision:
    show the count for information only, with nothing to approve.*
  - **Account status** — the design shows pills like active, trial and
    suspended. No such field exists on any account. *Decision: show only whether
    a family is behind on payment, worked out from their invoices. The other
    three are dropped.*
  - **Invoice reminders** — these already go out automatically every morning:
    a week before the due date, on the day, and weekly once overdue. Nothing is
    recorded about them afterwards, and an admin cannot trigger one by hand.
    *Decision: no send button — it could not report whether it worked, and would
    risk chasing a family twice. The screen shows when the next reminder is due
    instead.*
  - **New enrol shortcut** — the app can enrol an existing student into a class,
    but nothing in it creates a new family. *Decision: it enrols an existing
    student. Signing up a new family stays outside this project.*

**Why:** The redesign has a standing rule that a control with no real data
behind it is not shipped — an earlier tutor feature was dropped for exactly this
reason. Checking first means the admin screens get built once, against what the
system can actually support.

**Status:** Tutor phase complete and accepted. Admin phase open and unblocked —
all five questions decided, no admin screens built yet.

**Next steps**

- Build the four remaining admin screens: dashboard, classes, users, invoices.
- Confirm the admin message list needs no work. It shares the design the
  parents and tutors already use, so it is expected to be finished already.

---

## 2026-07-28 — Student details, feedback colour, and bounded navigation

**What changed**

- The student record only showed feedback and classes. It now leads with a
  details section: year, subjects, and the most recent progress a tutor
  recorded. The subjects field was already on the student record and had
  never been shown anywhere; the primary parent is now marked and listed
  first among the family, for the same reason.
- Feedback notes were entirely grey — a wall of cards with no way for the eye
  to land anywhere. The tutor's name is now shown in brand blue, both in the
  full feedback history and on the student record.
- Tapping a student's parent, then that parent's child, and so on, used to
  stack the same two people over and over — a tutor bouncing between a
  student and their parent a few times needed a dozen back-taps to get out.
  Reopening someone already on screen now returns to them instead of adding
  another copy.

**Why:** Direct feedback after the previous release — the student screen was
missing information that was already being loaded and thrown away, the
feedback cards were visually flat, and the back-navigation problem made the
new screens tedious to use in practice.

**Fixed along the way:** the first version of the navigation fix looked
correct but silently did nothing — it checked what was already open using a
method that can only ever see the most recent screen, not the full stack. The
test written for it caught this before it shipped.

**Status:** Complete on `feat/mobile/v3-foundation`, not yet merged. 593 tests
pass. Verified on device: four hops around the student/parent loop, then one
back press returns to the list.

---

## 2026-07-28 — Legacy student, parent and feedback screens replaced

**What changed**

- Tapping a student in the tutor directory used to jump straight to their
  feedback list. It now opens a proper student record — latest feedback
  shown in full, their classes, and their family — with a direct shortcut
  into the full feedback history still available.
- Tapping a parent used to open the old screen shared with admins, which
  included a billing section that could never actually load for a tutor
  (tutors are not allowed to read invoices, so it silently failed every
  time). The new parent screen drops billing entirely and shows contact
  details, children, and a message shortcut.
- The feedback history screen itself was rebuilt to match the rest of the
  app, for every role that uses it — parents, tutors, admins, and the push
  notification that links into it.

**Why:** The last two screens in the tutor experience still on the old
design, and one of them (parent details) was quietly trying to load data
tutors were never allowed to see.

**Fixed while testing:** both new screens loaded their data in a way that
resubscribed every time the screen redrew, which left them stuck showing
placeholders even after the real data had arrived.

**Status:** Complete on `feat/mobile/v3-foundation`, not yet merged. 581 tests
pass. Verified on device against real student and parent records.

---

## 2026-07-28 — Last legacy parent surfaces moved to V3

**What changed**

- Rebuilt the parent booking flow — choosing an action on a class, choosing
  which children it applies to, choosing a class to swap into, and confirming
  what it costs — as four sheets on the V3 design, over a new shared
  `AppBottomSheet`.
- Pulled the booking rules out of the screen into pure functions: which options
  a class offers, and the confirmation wording that turns lesson tokens into
  money. That wording was previously built inline inside the sheet and could
  not be tested at all; it now has 35 tests behind it.
- Reworded the flow. The sheets used to show internal names — "Swap (This
  Week)", "Enrol permanent", "Confirm 'Notify of absence'". Each option now has
  a plain label, a line saying what it commits to, and a confirm button named
  for the action. An unavailable option shows its reason inline instead of
  looking tappable and answering with a pop-up message.
- Rebuilt the "new message" contact picker, which was the last screen a parent
  could reach that still used the old design.
- Replaced the two app-wide offline notices — the red pop-up when an action
  needs a connection, and the brown "offline mode" bar — with brand-styled
  ones, and gave offline empty sections copy that says the data could not be
  reached rather than that there is none.

**Why:** These were the last parts of the parent experience still on the old
design. Every screen and dialog a family can reach now looks like one app.

**Fixed along the way**

- **Parents could not start a conversation at all.** Loading contacts fetched
  the parent list before the staff list in one step, and the security rules
  correctly refuse to let a parent list other parents — so the whole fetch
  failed and the picker was always empty. The two lists now load independently.
  On device this went from 0 contacts to 8.
- A crash when a family opened a class in a week whose attendance record did
  not exist yet.
- The child-selection list refetched every child's name on each tap, flashing
  "Loading..." over the names.
- A swap that failed silently closed its sheet and looked like it had worked.

**Status:** Complete on `feat/mobile/v3-foundation`, not yet merged. 484 tests
pass, analysis has no errors or warnings. Verified on an iPhone 16 Pro
simulator against real bookings; no booking was actually confirmed, since the
test account belongs to the business. Visually accepted 2026-07-28 — see the
entry below.

---

## 2026-07-28 — Tutor experience and the tutor-session contract

**What changed**

- Built the tutor's teaching week: the classes they are assigned to, grouped by
  day, each showing whether its roll still needs marking, with a count of
  outstanding rolls in the header.
- Built the class roll: mark each student here or away, record how they went,
  and write a note home — all in one screen, replacing a shared checkbox sheet.
- Built the tutor's directory. Tutors can look up every student and parent;
  a "This week" tab holds the people they are actually teaching right now and
  opens by default, and in the full lists their own students are marked and
  sorted to the top. Each student row has a shortcut into their feedback.
- Added the data the above needed. Attendance records now say explicitly who
  confirmed a roll and when. Feedback records now say which class and session
  they came from, and how the student went.
- The messages screen needed no work: the tutor design is the same inbox the
  parent rebuild already produced.

**Why:** Tutors were still on the old design for everything except
announcements, and the app had no reliable way to tell whether a roll had
actually been marked.

**Fixed along the way**

- **A roll that failed to save reported success.** The write swallowed its
  error, so a tutor could mark a class, see no complaint, and have nothing
  saved.
- **"Roll marked" was a guess.** It was inferred from who last touched the
  record, so an admin adding a student silently marked the roll done on the
  tutor's behalf — and a tutor who saved a roll unchanged was still chased for
  it.
- Two found on device: student year levels are stored inconsistently and came
  out as "Year Year 7"; and a class row said 2 students while the roll it
  opened showed 3.

**Status:** Complete on `feat/mobile/v3-foundation`, not yet merged. 548 tests
pass, plus the rules suite. Every screen checked on an iPhone 16 Pro against
real data. The roll was driven end to end but never saved — the test account
writes real feedback to real families.

**Next steps**

- **Deploy the Firestore rules before this ships.** Without it every roll a
  tutor saves fails. See
  [`docs/operations/pending-rules-deployment.md`](docs/operations/pending-rules-deployment.md).
- Product-owner visual sign-off on the six tutor screens.
- The tutor dashboard still cannot show which feedback is outstanding; that
  needs a query it does not yet make.

**Excluded by decision:** the reference design's tutor "Availability" and
"Request a schedule change" controls are not built. Nothing exists behind
them — no availability record, no approver, no notification.

---

## 2026-07-28 — Parent UX accepted; payment card work deferred

**What changed**

- Fixed the new-chat search box: closing the picker reset the visible search
  field but not the filter behind it, so reopening it after searching "mar"
  still showed only that one match instead of the full contact list. The
  filter now lives with the screen instead of on the shared account
  controller, so it cannot outlive the screen or bleed into the admin user
  list.

**Why:** Found while confirming the picker as part of today's full parent
walkthrough.

**Status:** The parent experience — dashboard, timetable, invoices, messages,
booking sheets, login, and the offline states — has been visually verified end
to end and is accepted. Nothing further is scheduled for parent UX except the
payment card work below.

**Decision:** the two outstanding payment/invoicing backend items — adding
card brand and last four digits to payment records (needed for `Visa
····4242` in invoice history) and confirming the amount-due rounding rules —
are deliberately deferred to the end of the redesign rather than done now.
Tracked in `apps/mobile/V3_REDESIGN_ROADMAP.md` §7 as P00.

---

## 2026-07-27 — V3 profile, settings and account forms

**What changed**

- Rebuilt the shared profile and settings routes on the V3 navy-header and
  content-sheet system for parent, tutor and admin accounts.
- Parent profiles now show lesson tokens, expandable students, subjects and
  class enrolments. The external enrolment action remains available even when
  no students are linked. Tutor/admin profiles omit parent-only data.
- Added role-aware notification settings with per-toggle saving states,
  duplicate-write protection and retryable inline failures. Account, password,
  legal and confirmed account-deletion actions remain available.
- Rebuilt edit-profile and password forms with current-value prefilling,
  stronger validation, password visibility controls, disabled duplicate
  submissions, safe Firebase error copy and durable completion states.
- Fenced profile/settings reads by signed-in account and ignored superseded
  async work. Profile loads are scheduled after build, student class requests
  are cached per route visit, and controllers no longer notify after disposal.

**Defects fixed**

- Profile and notification loads could publish into the next signed-in
  account, and failed profile reads could leave the route spinning.
- Parent accounts with no linked children had no path to enrol a student.
- Rebuilding an expanded child refetched the same class list.
- Edit profile initially exposed blank writable fields and could overwrite
  existing data before its background read finished.
- Settings fetched parent notification data for every role and accepted
  duplicate writes for the same toggle.
- Password and profile failures exposed raw backend messages, while successful
  writes disappeared immediately in a transient snackbar.
- Account deletion attempted a second logout after the backend had removed the
  authentication record.

**Status:** S10 complete on `feat/mobile/v3-foundation`. All 385 Flutter tests
pass, including 25 new controller/view/form regressions. Focused analysis is
clean; full analysis has no errors or warnings and 57 remaining info-level
findings. The live iPhone 16 Pro route was verified through profile, student
expansion, settings, edit profile, password, read-only terms and back to
Classes, with no provider build-phase error or layout exception. No profile or
credential data was changed during the Simulator pass.

**Next steps**

- Finish the parent booking dialogs and confirmation/error surfaces in S07.
- Close the signed-out offline-state gap in S01.

---

## 2026-07-27 — V3 parent invoice payment surfaces

**What changed**

- Completed the parent payment half of S09 without changing the callable
  contract: single-invoice and pay-all intents still use the existing Stripe
  Payment Sheet and backend verification path.
- Replaced transient snackbars with V3 inline outcomes for payment received,
  user cancellation, sheet failure and an unconfirmed receipt. An unconfirmed
  invoice cannot be paid again; the parent can check the same intent again
  while PDFs remain available.
- Coalesced PDF prefetch and open requests, added an opening state and made a
  missing or invalid PDF a durable error.
- Made invoice loading retryable. `InvoiceController` now cancels its previous
  parent/admin subscription, ignores stale emissions, reports stream errors
  and cancels the active listener on disposal.
- Scoped asynchronous payment and PDF outcomes to the parent that started them,
  so a slow completion cannot appear after the signed-in account changes.
- Reused the app's existing `AuthController` in `InvoiceController` instead of
  constructing a second auth controller with its own asynchronous load.

**Defects fixed**

- Cancelling the Stripe sheet was reported as `Payment failed`, even though no
  charge was made.
- A failed verification immediately re-enabled Pay now, allowing a parent to
  create another payment while the first receipt could still be settling.
- PDF prefetch ran from `build` and did not track in-flight work, so rebuilds
  could generate or fetch the same document more than once.
- Every visit to an invoice screen added another uncancelled stream listener.
  Parent and admin listeners could then overwrite the same controller state.
- A stream error left the invoice screen loading forever.
- A payment sheet or PDF request that completed after an account change could
  have updated the next parent's screen.

**Status:** Parent payment surfaces complete on
`feat/mobile/v3-foundation`; S09 remains in progress because invoice
creation, line-item review and finalisation are still legacy. All 360 Flutter
tests pass. Focused analysis is clean; full analysis has no errors or warnings
and the same 73 existing info-level findings. The live paid-history route and a
non-persisting unpaid/pay-all/pending preview were verified on iPhone 16 Pro
without a runtime or layout exception. The Simulator was restored to the
normal signed-in app afterward.

**Next steps**

- Continue the remaining parent detail flow with S10 profile and settings.
- Complete S09 creation/review/finalisation with the admin invoice work.

---

## 2026-07-27 — V3 terms acceptance and announcement sign-off

**What changed**

- Rebuilt Terms & Conditions as a V3 reader with a navy header, current-version
  badge, white content sheet, sticky reading progress, markdown styling,
  changelog context and an explicit document-end marker. Settings uses the same
  screen in read-only mode.
- Kept acceptance behind a full-document scroll. Short documents that already
  fit now unlock correctly. The footer blocks duplicate submissions and keeps
  the user at the gate with inline feedback if Firestore rejects the write.
- Added retryable loading and cached-offline Remote Config behaviour. A missing
  or placeholder document fails visibly instead of leaving an indefinite
  spinner.
- Terms status is checked after build for every signed-in account. Acceptance
  state can no longer leak across logout/login, and a slow status response for
  the previous account cannot overwrite the current account.
- Recorded the product owner's visual acceptance of the tutor/admin
  announcement feeds, detail and editor. T04, A03 and S03 are complete in the
  mobile roadmap.

**Defects fixed**

- A terms document shorter than the viewport had a zero scroll extent, so the
  old screen left Accept disabled forever.
- `AuthWrapper` checked terms only once for the lifetime of the widget. Changing
  accounts could reuse the previous user's accepted state.
- Version comparison parsed every dot-separated token with `int.parse`, so a
  labelled or malformed version could crash the changelog panel.
- Acceptance had no in-flight or failure state. Repeated taps could submit more
  than once, and a rejected write had no durable feedback.

**Status:** Complete on `feat/mobile/v3-foundation`. All 348 Flutter tests pass,
including 19 new terms data/controller/widget/lifecycle tests. The production
web build succeeds. `flutter analyze` has no errors or warnings; 73 existing
info-level findings remain. The real Remote Config v1.0.1 document was checked
on iPhone 16 Pro from 0% to 100%, including links and the end marker, with no
runtime exception. A non-persisting gate preview confirmed the disabled
acceptance footer without changing the signed-in account's terms record.

**Next steps**

- Continue the remaining parent detail work with S09 invoice payment surfaces,
  followed by S10 profile and settings.

---

## 2026-07-27 — Defer the Classes auth refresh until after build

**What changed**

- `TimetableScreen` no longer calls `AuthController.refreshCurrentUser()` from
  `initState`. The refresh now starts in the screen's existing post-frame data
  callback.
- `refreshCurrentUser` sets its loading state and notifies synchronously before
  its first `await`. Starting it while the Classes destination's keyed subtree
  was mounting attempted to dirty the Auth Provider mid-build and raised
  Flutter's `setState() or markNeedsBuild() called during build` exception.
- Added a navigation regression test that switches into Classes with auth and
  timetable controllers that deliberately notify listeners synchronously.

**Status:** The route-transition regression test passes. All 329 Flutter tests
pass, the production web build succeeds, and `flutter analyze` reports no
errors or warnings (74 existing info-level findings remain).

---

## 2026-07-27 — Defer dashboard loads until after build

**What changed**

- Parent and tutor dashboards now schedule their initial data load after the
  first frame rather than starting it from `didChangeDependencies`.
- The previous path called `AnnouncementsController.loadAnnouncements` while
  `DashboardRouter` was still building. Its immediate loading notification
  attempted to dirty the Provider scope mid-build and raised Flutter's
  `setState() or markNeedsBuild() called during build` exception.
- Dashboard loads are coalesced so repeated dependency changes within one frame
  do not queue duplicate requests. Account-id changes still start a fresh load,
  and manual pull-to-refresh remains immediate.

**Status:** The parent and tutor regression tests pass with an announcement
controller that deliberately notifies listeners synchronously. All 328 Flutter
tests pass, the production web build succeeds, and `flutter analyze` reports no
errors or warnings (74 existing info-level findings remain).

---

## 2026-07-27 — V3 announcement detail and admin management

**What changed**

- Rebuilt announcement detail as a V3 surface with the complete linkified body,
  audience and archive state, readable date, loading/not-found/retry states,
  and safe external-link failure feedback.
- Rebuilt the admin composer for both create and edit: validated title/body,
  all four stored audiences, explicit publish/archive state, and a stable
  saving state. Admins can edit and archive/restore from the list or detail,
  and permanently delete from either route after confirmation.
- Added audit actions for announcement update, archive and restore. Local list
  state is replaced only after Firestore accepts the mutation, so failed writes
  leave the visible announcement intact.

**Three defects fixed**

- Creating an announcement with the old Archived checkbox still sent the push
  notification to its audience, even though Rules then hid the document from
  them. The shared notification path now suppresses archived creations,
  including legacy direct writes that reach the create trigger.
- Opening a notice updated the user's read ids, but the navigation badge kept
  its old copied boolean until another indicator refresh. The shell now derives
  that badge from current announcements and current read ids, scoped to the
  signed-in role, so it clears as soon as the read write succeeds.
- The old stateless detail scheduled a mark-read write after every build. A
  rebuild before the first request completed could schedule the same write
  again. Detail now makes one attempt per open and retries only after a real
  write failure.

**Contract boundary:** The admin design's aggregate `Read by X / Y` line stays
out. Current data records read announcement ids on each user but has no stored
audience denominator or aggregate receipt query. Edit and archive/restore need
no schema change: the existing fields and admin Firestore Rules already permit
them.

**Status:** Implemented on `feat/mobile/v3-foundation`. All 326 Flutter tests
pass, the production web build succeeds, and `flutter analyze` reports no
errors or warnings (74 existing info-level findings remain). All 576 Functions
unit tests pass. Focused coverage includes detail/editor hierarchy, validation,
reader/admin permissions, actions, narrow layout, large text, the audit
allowlist, and archived-notification suppression.

**Next steps**

- Inspect reader and admin states on device against real announcements.
- Deploy the Functions audit allowlist and archived-notification guard before
  releasing the mobile build that emits the new audit actions.

---

## 2026-07-27 — V3 announcement feeds

**What changed**

- Rebuilt the shared announcement feed on the V3 design. Parents and tutors
  now see unread notices first, followed by earlier notices, with audience
  badges, readable relative dates and pull-to-refresh. Opening a row still uses
  the existing detail and read-state flow.
- Added the admin variant from the reference: audience filters and separate
  published and archived groups, with create and swipe-to-delete kept
  admin-only.
- Made the role and audience rules a pure adapter rather than leaving them
  inside the widget. The screen defensively filters archived or wrong-audience
  records even if its controller cache contains a broader result.

**Three defects fixed**

- The controller previously treated any non-empty cache as suitable for every
  query. After loading one role's active feed it could refuse to load an
  admin's archived records or another role's audience. It now keys the cache
  by active/archive scope and audience.
- A failed load left the controller permanently loading because it never
  cleared the flag on an exception. The feed now distinguishes loading, empty
  and failed states and always leaves loading in a `finally` block.
- Create and delete errors were swallowed. The old screens would close the
  composer or remove a swiped row and announce success even when Firestore had
  rejected the write. The controller now reports the failure and rethrows it;
  deletion happens before the dismissible row is allowed to leave.

**Contract boundary:** The admin reference shows aggregate read counts, but the
stored contract has only each user's `readAnnouncements` ids. There is no
audience denominator or aggregate receipt query. The unsupported count is
omitted until that contract is designed. Existing Firestore fields and Rules
do support edit and archive/restore; those controls land with the V3 composer
and detail screen in the next slice.

**Status:** In progress on `feat/mobile/v3-foundation`. Format clean,
`flutter analyze` has no errors or warnings, all 309 Flutter tests pass, and
`flutter build web` succeeds. Data and widget tests cover both reader roles,
all three admin filters, published/archived grouping, unread grouping, date
degradation, loading/error/empty states, narrow layouts, row opening and
guarded deletion.

**Next steps**

- Rebuild the detail screen and admin composer, then add edit,
  archive/restore and failure-safe action feedback.
- Confirm the reader and admin feeds on device against real announcements.

---

## 2026-07-27 — Login screen on the V3 design

**What changed**

- Rebuilt the sign-in screen: the Tenacity logo and a welcome over a white
  sheet holding the form, matching the rest of the app. The brand steps aside
  when the keyboard opens so the form still fits on a short phone.
- One place now answers "did that work?" — a panel under the fields, green for
  something that succeeded and red for something that failed. Previously the
  same message appeared twice, in a pop-up and as red text.
- The password reset link is offered as soon as a valid email is entered,
  rather than needing a password too. Someone who has forgotten their password
  will not have typed one.
- Validation rules moved into one file. The email pattern had been written out
  twice — once for the field, once for the button — and either copy could have
  been changed on its own.

**Three defects fixed**

- A sent password-reset email was shown to families as a failure. The
  confirmation was being set on the controller's error field, which the screen
  paints red, so "Sent! Please check your inbox" looked like something had gone
  wrong. Success and failure now travel separately.
- Entering an email immediately drew a red "Please enter your password" under a
  field the user had not reached yet. Each field is now checked when it is left,
  not the whole form the moment anything is typed. Found by looking at the real
  screen; the tests were happy.
- A check meant to hide the logo when the keyboard opens could never have
  fired, because the widget it sat in never sees the keyboard. Caught by a test
  before it ever reached a device.

**Why:** Login is the first screen anyone sees, and it was the last one still
in the old design. A parent who had forgotten their password was also being
told, in red, that the email they had just been sent had failed.

**Status:** In progress on `feat/mobile/v3-foundation`. Format clean,
`flutter analyze` with no errors or warnings, 291 tests passing (up from 249),
`flutter build web` succeeds. Checked on device at the reference size: layout,
both feedback states, the enabling of each button, and stale messages clearing
when the form is edited.

**Worth knowing:** the screen was inspected on device without signing out,
using a throwaway entrypoint that renders it against a stub. Signing out of the
test account cannot be undone without the account owner, and a second simulator
is not a way around it — only the first device is registered with Firebase App
Check, so on any other one the app cannot read anything. This is written up in
the mobile roadmap for whoever picks this up next.

**Next steps**

- Visual acceptance by the account owner while genuinely signed out.
- The signed-out offline state: the "you're offline" overlay is still the old
  red banner, on this screen and everywhere else.

---

## 2026-07-27 — Class-browse screen on the V3 design

**What changed**

- Rebuilt the screen behind "Book a one-off class" — the last legacy screen a
  parent could still reach from a redesigned one. It now has the same navy
  header, week pager and day strip as the timetable, over classes grouped by
  day.
- Each class states what a parent can actually do with it, rather than a raw
  count: `BOOKED`, `3 SPOTS`, `WAITLIST` or `CANCELLED`, with a line beneath
  giving the detail — "One-off spot this week", "Class is full", "Opens with 2
  more students".
- Enrolment, swapping and waitlist behaviour is untouched. Every tap still
  opens the existing options dialog; eligibility, capacity and the booking
  windows are all read from where they already lived.

**Two defects fixed along the way**

- The old screen advertised one-off spots that could not be booked. It printed
  the raw capacity remaining, ignoring the rule that a one-off also needs other
  students attending and either a cancelled spot or a session within the next
  week. A parent could tap a class showing free spots and be told no. The new
  row only claims a one-off when the booking would be accepted — confirmed on
  device against a full class, where the row says "Class is full" and the
  dialog correctly greys out the one-off option.
- Tutor names were missing from the parent timetable until a manual refresh.
  Two loads were started at once in `initState`, and the one that needed the
  class list to know which tutors to look up usually won the race against the
  one that fetches it. Being a race, it appeared intermittently.

**Why:** Parents are the largest group of users, and this was the visible seam
in an otherwise redesigned experience — a family browsing for a class dropped
out of the new design and into the old one mid-task.

**Status:** In progress on `feat/mobile/v3-foundation`. Format clean,
`flutter analyze` with no errors or warnings, 249 tests passing (up from 191),
`flutter build web` succeeds. Checked on device signed in as a parent: the
class list, both pill states, the day filter, the empty week, week paging and
the back route all behave correctly, and each row's promise matches the dialog
it opens.

**Next steps**

- The booking dialogs themselves — the options sheet, child selection and
  confirmations — are still legacy Material. They are modals rather than
  screens, so they are less jarring, but they are the last old surface in the
  parent flow.
- Then the remaining parent detail flows: login, terms, announcement detail,
  profile and settings. Login should lead, being the first screen anyone sees.

---

## 2026-07-26 — Chat thread reskin and handoff notes

**What changed:**

- Brought the chat thread onto the V3 palette: a navy header carrying the same
  squircle identity as the inbox row that opens it, blue and pale-blue message
  bubbles, tokenised date separators, read receipts, typing indicator and
  composer. The typing line now names the person — "Jordan is typing…" rather
  than a bare "Typing...".
- Touched presentation only. Text, image and file sending, drafts, pending
  message states, upload progress, link handling and the offline guards are
  exactly as they were.
- Added a "Picking this up in a new session" section to
  `apps/mobile/V3_REDESIGN_ROADMAP.md` so this work can be continued by someone
  with no context: the branch, how to read the design references, the exact
  pre-commit checks, how to get a screen onto the simulator, what the test
  account can and cannot show, and the kinds of defect this work keeps finding.

**Worth knowing:** there is no reference design for the chat thread — the
design files only include the inbox — so this extends the established language
rather than matching a mockup. If a thread design is produced later it should
be revisited.

**Status:** In progress on `feat/mobile/v3-foundation`. Format clean,
`flutter analyze` with no errors or warnings, 191 tests passing.

**Next steps**

- The class-browse layout behind "Book a one-off class" is now the last legacy
  screen reachable from a redesigned parent screen.
- Then the remaining parent detail flows: login, terms, announcement detail,
  profile and settings.

---

## 2026-07-26 — Parent invoices on the V3 design

**What changed:**

- Rebuilt the parent billing screen: a navy header carrying the outstanding
  total, a plain-language due summary and the pay-all button, over unpaid
  cards with Pay now and PDF, then a short payment history with a
  "View all invoices" expander.
- Moved the payment handling into named methods without changing a line of its
  logic. The client-secret caching, in-flight guards, offline guards and Stripe
  verification are exactly as they were — this is real money, so the
  presentation was rebuilt around the existing flow rather than rewritten with
  it.
- Pay-all is now shown only when it would settle more than one invoice. With a
  single invoice it duplicated that invoice's own Pay now button.

**Two deliberate deviations from the design, both recorded in the roadmap:**

- The design sets the outstanding figure in Bricolage ExtraBold, but only Bold
  is bundled. Using ExtraBold would have silently fallen back to a system font,
  so it is set in Bold.
- Payment history omits the card — the design shows "Visa ····4242" — because
  the payment record stores no card brand or last four digits. Inventing one
  was not an option, so the line reads "Paid 20 Jun" until that contract lands.

**Why:** This completes the four parent reference screens. Parents are the
largest group of users and the app's commercial surface, which is why they were
sequenced first.

**Status:** In progress on `feat/mobile/v3-foundation`. Format clean,
`flutter analyze` with no errors or warnings, 191 tests passing (up from 174).
The header, history rows and paid states are confirmed on device. The unpaid
card, Pay now and PDF buttons are covered by tests but have not been seen with
real data, since the test account has nothing outstanding.

**Next steps**

- Visual acceptance of an account with unpaid invoices.
- The two legacy surfaces still reachable from redesigned screens: the chat
  thread, and the class-browse layout behind "Book a one-off class".
- The tutor and admin experiences.

---

## 2026-07-26 — Message inbox on the V3 design

**What changed:**

- Rebuilt the inbox against the reference design: a navy header carrying the
  unread count, a search field and a new-conversation button, over a white
  sheet of conversation rows with squircle avatars, unread emphasis and count
  badges.
- Built it once for every role rather than per role. The parent, tutor and
  admin references all show the same message list, so this covers P03 and most
  of the tutor and admin messages screens in one pass.
- Added a search field and a conversation row to the shared component library,
  and a small pure module for the inbox's ordering, naming and timestamp rules.

**Two things fixed while rewriting it:**

- The old inbox added a listener to the chat controller in `initState` and
  never removed it, so every rebuild of the screen left another one attached.
- Timestamps were always a clock time, so a message from last month read as
  though it had arrived this afternoon. They now degrade from a time, to
  "Yesterday", to a weekday, to a date — and include the year once a
  conversation is more than a year old.

Search, swipe-to-delete with its offline guard, the new-chat route and thread
navigation are unchanged. Searching no longer appears to clear unread messages:
the header counts the whole inbox rather than the filtered view.

**A third defect, found on device and affecting every screen.** Searching for
something with no matches shrank the white content sheet to the width of its
empty-state text, leaving the navy background showing down both sides. The
sheet sized itself to its content whenever that content did not expand, which
is true of every empty state in the app. It went unnoticed until now because
the dashboards fill their sheet with a scroll view, which does expand. The
sheet now always fills the space it is given, and that is regression-tested.

**Status:** In progress on `feat/mobile/v3-foundation`. Format clean,
`flutter analyze` with no errors or warnings, 174 tests passing (up from 148).
Inbox layout, search, the search-specific empty state and the new timestamps
confirmed on device. The chat thread itself is still the legacy design.

**Next steps**

- P04, invoices, completes the parent experience, and still needs the card
  brand and last4 on the payment record.
- The chat thread and the class-browse surface are the two legacy screens still
  reachable from redesigned ones.

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
