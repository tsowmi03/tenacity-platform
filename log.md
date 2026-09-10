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
| 2026-09-10 | [Tutors hear about a shift an hour after the admins do (MOB-50)](#2026-09-10--tutors-hear-about-a-shift-an-hour-after-the-admins-do-mob-50) |
| 2026-09-10 | [Queued messages stay visible in the inbox and chat (MOB-49)](#2026-09-10--queued-messages-stay-visible-in-the-inbox-and-chat-mob-49) |
| 2026-09-09 | [Mobile 3.1.0 (build 515) prepared for release](#2026-09-09--mobile-310-build-515-prepared-for-release) |
| 2026-09-09 | [Bookings for a class running today close at 9am (MOB-48)](#2026-09-09--bookings-for-a-class-running-today-close-at-9am-mob-48) |
| 2026-09-08 | [Overstaffed classes say so on the admin timetable (MOB-8)](#2026-09-08--overstaffed-classes-say-so-on-the-admin-timetable-mob-8) |
| 2026-09-08 | [Staging could not load the admin timetable at all](#2026-09-08--staging-could-not-load-the-admin-timetable-at-all) |
| 2026-09-07 | [Failures stopped blaming the user's wifi (MOB-26)](#2026-09-07--failures-stopped-blaming-the-users-wifi-mob-26) |
| 2026-09-06 | [MOB-39 and TP-22 merged; a stale start-week could still be accepted](#2026-09-06--mob-39-and-tp-22-merged-a-stale-start-week-could-still-be-accepted) |
| 2026-09-03 | [Permanent enrolment was two megabytes over its memory limit](#2026-09-03--permanent-enrolment-was-two-megabytes-over-its-memory-limit) |
| 2026-09-02 | [Staging seeds a class holding both of one parent's children](#2026-09-02--staging-seeds-a-class-holding-both-of-one-parents-children) |
| 2026-09-02 | [A run script for the app's flavour, and no picker with one option (MOB-39)](#2026-09-02--a-run-script-for-the-apps-flavour-and-no-picker-with-one-option-mob-39) |
| 2026-09-02 | [Parents choose when a permanent class swap starts (MOB-39)](#2026-09-02--parents-choose-when-a-permanent-class-swap-starts-mob-39) |
| 2026-09-02 | [Permanent swaps could put five students in a room built for four (MOB-38)](#2026-09-02--permanent-swaps-could-put-five-students-in-a-room-built-for-four-mob-38) |
| 2026-09-02 | [Chat attachments had no storage rule at all (TP-21)](#2026-09-02--chat-attachments-had-no-storage-rule-at-all-tp-21) |
| 2026-09-01 | [Staging rules drift is now noticed, not remembered (TP-19)](#2026-09-01--staging-rules-drift-is-now-noticed-not-remembered-tp-19) |
| 2026-09-01 | [Photos and files survive leaving the conversation (MOB-37)](#2026-09-01--photos-and-files-survive-leaving-the-conversation-mob-37) |
| 2026-09-01 | [Chat notifications behave the same on iPhone and Android (MOB-46)](#2026-09-01--chat-notifications-behave-the-same-on-iphone-and-android-mob-46) |
| 2026-09-01 | [Security rules are now tested against what the app writes (TP-18)](#2026-09-01--security-rules-are-now-tested-against-what-the-app-writes-tp-18) |
| 2026-09-01 | [Opening a conversation no longer downloads all of it (MOB-41/42/43)](#2026-09-01--opening-a-conversation-no-longer-downloads-all-of-it-mob-414243) |
| 2026-09-01 | [A sent message no longer depends on the screen that sent it (MOB-36)](#2026-09-01--a-sent-message-no-longer-depends-on-the-screen-that-sent-it-mob-36) |
| 2026-09-01 | [Messages read on screen stayed unread (MOB-40)](#2026-09-01--messages-read-on-screen-stayed-unread-mob-40) |
| 2026-08-31 | [Generated questions and passages no longer credit themselves (RES-28)](#2026-08-31--generated-questions-and-passages-no-longer-credit-themselves-res-28) |
| 2026-08-30 | [English resources can carry sourced visual stimuli (RES-22)](#2026-08-30--english-resources-can-carry-sourced-visual-stimuli-res-22) |
| 2026-08-28 | [The Functions deploy redeployed all 91 Functions every time (TP-17)](#2026-08-28--the-functions-deploy-redeployed-all-91-functions-every-time-tp-17) |
| 2026-08-28 | [Errors showed users raw Dart stack traces (MOB-32/33/34/35)](#2026-08-28--errors-showed-users-raw-dart-stack-traces-mob-32333435) |
| 2026-08-27 | [Sent messages appeared twice for a second (MOB-31)](#2026-08-27--sent-messages-appeared-twice-for-a-second-mob-31) |
| 2026-08-26 | [Firestore index deploys blocked by a new Google API field (TP-15)](#2026-08-26--firestore-index-deploys-blocked-by-a-new-google-api-field-tp-15) |
| 2026-08-26 | [The Functions deploy counted its batches from a literal](#2026-08-26--the-functions-deploy-counted-its-batches-from-a-literal) |
| 2026-08-26 | [Tutors can revise a generated resource instead of starting again (RES-23)](#2026-08-26--tutors-can-revise-a-generated-resource-instead-of-starting-again-res-23) |
| 2026-08-26 | [Mobile release 3.0.2 (build 514)](#2026-08-26--mobile-release-302-build-514) |
| 2026-08-26 | [Booting the app flashed the terms and conditions screen (MOB-29)](#2026-08-26--booting-the-app-flashed-the-terms-and-conditions-screen-mob-29) |
| 2026-08-25 | [The typing indicator in messages was stuck on, or missing (MOB-27)](#2026-08-25--the-typing-indicator-in-messages-was-stuck-on-or-missing-mob-27) |
| 2026-08-25 | [Notification hardening is fully deployed](#2026-08-25--notification-hardening-is-fully-deployed) |
| 2026-08-23 | [Notifications can now be sent by naming what happened](#2026-08-23--notifications-can-now-be-sent-by-naming-what-happened) |
| 2026-08-23 | [Unenrolling a student no longer sends admins twenty notifications](#2026-08-23--unenrolling-a-student-no-longer-sends-admins-twenty-notifications) |
| 2026-08-23 | [Every notification is now recorded, and dead devices are cleaned up](#2026-08-23--every-notification-is-now-recorded-and-dead-devices-are-cleaned-up) |
| 2026-08-22 | [Deleted the dead duplicate notification code](#2026-08-22--deleted-the-dead-duplicate-notification-code) |
| 2026-08-21 | [Stopped a class swap firing twenty admin notifications](#2026-08-21--stopped-a-class-swap-firing-twenty-admin-notifications) |
| 2026-08-20 | [Chat messages could revert to the compose box or send twice (MOB-21)](#2026-08-20--chat-messages-could-revert-to-the-compose-box-or-send-twice-mob-21) |
| 2026-08-20 | [Booklets dropped multiple-choice options and collapsed dot points (RES-16)](#2026-08-20--booklets-dropped-multiple-choice-options-and-collapsed-dot-points-res-16) |
| 2026-08-20 | [Portal Hosting smoke test had no room for propagation lag](#2026-08-20--portal-hosting-smoke-test-had-no-room-for-propagation-lag) |
| 2026-08-20 | [Every toast on the weekly update page was throwing instead of showing](#2026-08-20--every-toast-on-the-weekly-update-page-was-throwing-instead-of-showing) |
| 2026-08-20 | [The weekly update is edited in its own preview](#2026-08-20--the-weekly-update-is-edited-in-its-own-preview) |
| 2026-08-20 | [The weekly parent email is built from blocks](#2026-08-20--the-weekly-parent-email-is-built-from-blocks) |
| 2026-08-19 | [Admin portal installs as a mobile web app](#2026-08-19--admin-portal-installs-as-a-mobile-web-app) |
| 2026-08-19 | [Notified absences now reach the tutor and admin screens](#2026-08-19--notified-absences-now-reach-the-tutor-and-admin-screens) |
| 2026-08-18 | [Mobile release 3.0.1 (build 513)](#2026-08-18--mobile-release-301-build-513) |
| 2026-08-18 | [Resource history rows no longer squash the heading](#2026-08-18--resource-history-rows-no-longer-squash-the-heading) |
| 2026-08-18 | [Tutors can edit a past resource before generating it again](#2026-08-18--tutors-can-edit-a-past-resource-before-generating-it-again) |
| 2026-08-18 | [Tutors can correct feedback after sending it](#2026-08-18--tutors-can-correct-feedback-after-sending-it) |
| 2026-08-18 | [Messages vanished after leaving the inbox and coming back](#2026-08-18--messages-vanished-after-leaving-the-inbox-and-coming-back) |
| 2026-08-17 | [What the admin console calls "needs action"](#2026-08-17--what-the-admin-console-calls-needs-action) |
| 2026-08-17 | [Admin timetable gained a week view and its class lists](#2026-08-17--admin-timetable-gained-a-week-view-and-its-class-lists) |
| 2026-08-17 | [Loading screens now show the shape of what is coming](#2026-08-17--loading-screens-now-show-the-shape-of-what-is-coming) |
| 2026-08-16 | [The messages screen no longer calls everyone "Unknown"](#2026-08-16--the-messages-screen-no-longer-calls-everyone-unknown) |
| 2026-08-15 | [Maths resources are now generated against a fixed schema too](#2026-08-15--maths-resources-are-now-generated-against-a-fixed-schema-too) |
| 2026-08-15 | [Resources no longer invent their own reading texts](#2026-08-15--resources-no-longer-invent-their-own-reading-texts) |
| 2026-08-15 | [English resources are now generated against a fixed schema](#2026-08-15--english-resources-are-now-generated-against-a-fixed-schema) |
| 2026-08-14 | [Teaching resources now generated by a stronger AI model](#2026-08-14--teaching-resources-now-generated-by-a-stronger-ai-model) |
| 2026-08-14 | [Teaching resources moved to their own portal](#2026-08-14--teaching-resources-moved-to-their-own-portal) |
| 2026-08-13 | [Parents could not send messages](#2026-08-13--parents-could-not-send-messages) |
| 2026-08-13 | [Chats with deleted accounts no longer haunt the inbox](#2026-08-13--chats-with-deleted-accounts-no-longer-haunt-the-inbox) |
| 2026-08-12 | [A staging environment for the mobile app](#2026-08-12--a-staging-environment-for-the-mobile-app) |
| 2026-08-11 | [Branded the weekly parent email and gave it a preview](#2026-08-11--branded-the-weekly-parent-email-and-gave-it-a-preview) |
| 2026-08-10 | [Weekly parent email](#2026-08-10--weekly-parent-email) |
| 2026-08-06 | [One-off bookings no longer depend on the phone](#2026-08-06--one-off-bookings-no-longer-depend-on-the-phone) |
| 2026-08-06 | [A paid one-off booking was lost when verification crashed](#2026-08-06--a-paid-one-off-booking-was-lost-when-verification-crashed) |
| 2026-08-05 | [Xero-paid invoices were never recorded as paid](#2026-08-05--xero-paid-invoices-were-never-recorded-as-paid) |
| 2026-08-05 | [Rules deployment pipeline could not ship a real content change](#2026-08-05--rules-deployment-pipeline-could-not-ship-a-real-content-change) |
| 2026-08-04 | [Admin parent feedback results page](#2026-08-04--admin-parent-feedback-results-page) |
| 2026-08-04 | [Parent feedback survey](#2026-08-04--parent-feedback-survey) |
| 2026-08-04 | [Instant tab switching in the mobile app](#2026-08-04--instant-tab-switching-in-the-mobile-app) |
| 2026-08-04 | [Attendance sessions were recording the wrong week](#2026-08-04--attendance-sessions-were-recording-the-wrong-week) |
| 2026-08-03 | [Year 11 information sheet download](#2026-08-03--year-11-information-sheet-download) |
| 2026-07-31 | [Year 11 interest admin screen](#2026-07-31--year-11-interest-admin-screen) |
| 2026-07-31 | [Year 11 class interest form](#2026-07-31--year-11-class-interest-form) |
| 2026-07-29 | [Firestore rules deployed; New enrol picker and feedback-due row](#2026-07-29--firestore-rules-deployed-new-enrol-picker-and-feedback-due-row) |
| 2026-07-29 | [Admin V3 screens visually accepted](#2026-07-29--admin-v3-screens-visually-accepted) |
| 2026-07-29 | [Last reachable legacy mobile flows moved to V3](#2026-07-29--last-reachable-legacy-mobile-flows-moved-to-v3) |
| 2026-07-29 | [Deleted the dead legacy code left by the redesign](#2026-07-29--deleted-the-dead-legacy-code-left-by-the-redesign) |
| 2026-07-29 | [Two tutors can now mark one roll](#2026-07-29--two-tutors-can-now-mark-one-roll) |
| 2026-07-28 | [Admins now use the proper roll screen](#2026-07-28--admins-now-use-the-proper-roll-screen) |
| 2026-07-28 | [Removing a student made clearer and shorter](#2026-07-28--removing-a-student-made-clearer-and-shorter) |
| 2026-07-28 | [Class actions rebuilt; two dangerous ones fixed](#2026-07-28--class-actions-rebuilt-two-dangerous-ones-fixed) |
| 2026-07-28 | [First real admin run-through; four fixes](#2026-07-28--first-real-admin-run-through-four-fixes) |
| 2026-07-28 | [Admin account screen rebuilt](#2026-07-28--admin-account-screen-rebuilt) |
| 2026-07-28 | [Admin billing console; all screens now redesigned](#2026-07-28--admin-billing-console-all-screens-now-redesigned) |
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
| 2026-07-28 | [One-way Google Calendar timetable export](#2026-07-28--one-way-google-calendar-timetable-export) |
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

## 2026-09-10 — Tutors hear about a shift an hour after the admins do (MOB-50)

**What changed**
- The daily reminder sweep was split in two. Parents still get their lesson
  reminder at 9am Sydney, and admins still get the overstaffed-class summary
  at 9am. Tutors now get their shift reminder at 10am.
- The 10am sweep re-reads the day's attendance documents rather than reusing
  what the 9am pass saw, so a tutor stood down in between is told the current
  roster rather than the one from an hour earlier.
- New scheduled Function `dailyTutorShiftReminder`, registered in the
  production deploy inventory and excluded from staging alongside every other
  scheduler.

**Why:** The 9am overstaffed summary tells an admin which classes are carrying
more tutors than they need. Sending the tutors their shift reminder at the
same moment meant the admin was always acting after the fact — the tutor had
already been told to come in. The hour is the window to re-roster before
anyone is notified.

The gap also covers a booking taken just before the cutoff. A payment started
at 8:58 still completes, deliberately, so the roster can gain a student a few
moments after 9am — after a sweep that ran at 9:00:00 had already read it.

**Status:** In progress — merged to `main`, not yet deployed to production.

**Next steps**
- Deploy Functions to production. Two things differ from a routine deploy.
  `dailyTutorShiftReminder` is created rather than updated — the pre-deploy
  inventory comparison tolerates a Function that has never deployed and the
  post-batch one does not, so a failed creation fails the run. And because the
  production inventory file counts as a global dependency, the planner
  resolves this commit to `mode=all`: all 92 Functions in 10 batches, not a
  scoped subset.

**Notes**

The 9am export keeps the name `dailyLessonAndShiftReminder` even though it no
longer sends the shift half. Deploys are scoped to `--only functions:<name>`
and never delete a Function that has been renamed away, so renaming it would
have left the old copy live and still sending tutor reminders at 9am — the
exact behaviour this change removes. Correcting the name needs a manual
delete of the old Function first.

---

## 2026-09-10 — Queued messages stay visible in the inbox and chat (MOB-49)

- The inbox now observes the account's outbox: queued text and attachments
  update the preview, activity time, and conversation order immediately.
- Successful sends retain a display copy until the message snapshot arrives,
  so leaving and reopening the thread during that gap does not hide the message.
  Inbox previews also survive confirmation arriving before the inbox snapshot.
- The conversation history now belongs to the signed-in session rather than a
  chat route. A swipe back and reopen preserves loaded live and older pages
  while Firestore reconnects, rejects late callbacks after account changes or
  deletion, and offers an in-thread retry after a refresh error.
- Rapid consecutive sends keep the latest queued preview even when the earlier
  message receives a later server timestamp. Retries, account isolation, unread
  counts, participant-name loading, and hidden conversations remain covered.
- Self-review completed. Validation from `apps/mobile`: `flutter test --reporter
  expanded` **1,310 passed**; `flutter analyze --no-fatal-infos` passed with the
  existing informational lint in `test/widget_test.dart:54`; `dart format
  --output=none --set-exit-if-changed lib test` clean; `flutter build web` passed.
  Root `git diff --check` passed.

**Status:** Implemented locally, uncommitted on
`fix/mob-49-pending-message-visibility`. Jira In Progress. Mobile client only;
no backend, stored schema, permissions, or deployment changes.
**Next:** Release through the normal mobile pipeline.

---

## 2026-09-09 — Mobile 3.1.0 (build 515) prepared for release

**What changed**
- Bumped the mobile app from `3.0.2+514` to `3.1.0+515` in
  `apps/mobile/pubspec.yaml`. Both platforms read their version from that one
  line — Android through `flutter.versionCode`/`versionName`, iOS through
  `$(FLUTTER_BUILD_NAME)`/`$(FLUTTER_BUILD_NUMBER)` — so nothing else needed
  editing.

**Why:** A minor rather than a patch bump. Fifteen merges have landed since
3.0.2 and several change what a parent can do, rather than fixing what was
already there: choosing when a permanent class swap starts (MOB-39), the
durable chat outbox and paged history (MOB-36/37/40/41/42/43), the overstaffed
class indicator (MOB-8), and the 9am same-day booking cutoff (MOB-48).

**Status:** In progress — the version is bumped in the repository only. No
iOS archive or Android bundle has been built for 3.1.0, and nothing has been
uploaded to App Store Connect or Play.

**Next steps**
- Build and upload the iOS archive. Note from the 3.0.2 release: export via
  Xcode Organizer rather than `flutter build ipa`, which fails
  non-interactively because the distribution certificate lives in the
  data-protection keychain.
- Build and upload the Android bundle — still outstanding for 3.0.2 as well,
  so 3.1.0 would be the first Android upload since 3.0.1.

---
## 2026-09-09 — Bookings for a class running today close at 9am (MOB-48)

**What changed**
- Parents can no longer book a one-off place in a class running the same day
  once it is past 9am. Before 9am, today's classes can still be booked as
  before, and classes from tomorrow onwards are unaffected.
- Covers all three ways a family could take a place today: paying by card,
  spending lesson tokens, and moving into a class for a single week.
- Admins are deliberately exempt. An admin can still add a student to a class
  running today, which is how a family who rings up gets a place.
- The class stays on screen with the reason attached — "Bookings for today
  have closed" on the row, and a fuller sentence on the option itself —
  rather than disappearing or failing after the parent has committed.
- Enforced on the server as well as in the app: the payment path refuses
  before a Stripe PaymentIntent exists, so nobody is charged for a booking
  that will be turned down.
- Staging's seeded timetable gained five later sessions — Tuesday 5:30,
  Wednesday 5:00 and 6:00, Friday 4:00 and 5:30. Friday previously had no
  classes at all, and the whole timetable emptied out by mid-afternoon, so
  a rule about "a class running later today" could only be seen before
  3:30pm on a Wednesday.

**Why:** Staffing for the day is settled in the morning. A booking arriving
mid-afternoon lands after the roster it affects has already been decided.

**Status:** Live. Merged in
[#178](https://github.com/tsowmi03/tenacity-platform/pull/178) and deployed to
production on 9 September 2026 from `5f767411`
([run 34321386829](https://github.com/tsowmi03/tenacity-platform/actions/runs/34321386829),
`functions=true`, 30 of 91 Functions affected).

The deploy was dispatched deliberately *before* the follow-up commit landed.
The planner classifies `git diff HEAD^ HEAD`, so had this entry reached `main`
first, an `auto` dispatch would have reported Functions as skipped and shipped
nothing — the trap already recorded against MOB-39. An automated review on
#179 caught that it was about to happen again.

The same deploy shipped MOB-8's Functions half, which had been held since
8 September until a mobile release carried the `OVERSTAFFED` badge. That hold
was released deliberately: admins now receive the 9am overstaffed-class summary
before 3.1.0 reaches their phones, and will see a notification about a badge
their installed app does not draw until they update.

**Notes**

A payment taken before the cutoff still completes. The Stripe webhook and the
reconciliation sweep deliberately do not repeat the check: by the time they
run the money has moved, and refusing there would mean refunding a parent who
did nothing wrong.

The app compares against the device's clock rather than Sydney's, like every
other date it handles. For a phone set outside Sydney the greyed-out option
will use that phone's 9am; the server, which computes 9am in Sydney, is what
makes the rule true regardless. MOB-47 corrects the app's timezone handling
across every screen and will bring the two into line.

## 2026-09-08 — Overstaffed classes say so on the admin timetable (MOB-8)

**What changed**

- A session on the admin timetable now carries a red `OVERSTAFFED` badge when
  two students or fewer are expected *and* two or more tutors are assigned to
  it, so an admin can see at a glance which classes have a tutor to spare.
- Both halves matter. A quiet class already down to one tutor is correctly
  staffed and carries nothing — the badge marks a mismatch to fix, not a
  requirement to read. A quiet class with nobody assigned carries nothing
  either: it is not overstaffed, and an unstaffed class on the day is a larger
  problem than this badge reports.
- The student count is the week's own attendance list, not the standing
  enrolment: a class of eight with six absences is a one-tutor session on the
  day, and the day is when the allocation is made. The tutor count is the
  assigned ids rather than the names on the row, because a tutor whose record
  failed to load is still a tutor standing in the room.
- Cancelled sessions never carry the badge, and it drops off once a session has
  finished — there is nobody left to stand down, and leaving it on would make
  yesterday look undecided.
- The badge sits beside the existing status pill rather than replacing it.
  Folding it into that pill would have hidden `NO ROLL` and `FULL` on exactly
  the classes an admin was being asked to look at.
- Admins also get one push a morning naming the day's overstaffed classes — "2
  classes today only need one tutor: 4:30 pm (2 tutors, 2 students), …". It is
  a single summary rather than one notification per class, and it rides on the
  existing 9am Sydney sweep that already sends the day's tutor and parent
  reminders, so no new scheduled function was deployed.
- The summary is sent last in that sweep and swallows its own failures. The
  reminders have already gone out by then, and a throw would retry the whole
  schedule and send them all again.

**Why:** Tenacity staffs most classes with two tutors. Nobody could tell which
of the day's classes had thinned out enough to release one, so a second tutor
stayed rostered on sessions that did not need them.

**Status:** Merged to `main` as 43e7840 (#175). **Not deployed to production**
— deliberately held so both halves land together. The Functions half (the 9am
summary) is ready to dispatch from this repository; the `OVERSTAFFED` badge is
mobile, and mobile ships from `tsowmi03/Tenacity` to the app stores, not from
here. Deploying the backend alone would push admins a notification about a
timetable that has no badge on it yet.

1278 mobile tests and 1156 Functions unit tests pass, `flutter analyze` clean.
Verified on the staging build in the iOS simulator.

An automated review on the PR caught a real defect before merge: the sweep
normalised a missing or malformed `attendance` array to `[]` before calling the
predicate, so an unreadable document arrived as a genuine count of zero — and
an empty class with two tutors is exactly what this reports. A broken document
would have told an admin to stand a tutor down. Counts now come from the raw
fields through `countIfReadable`, so the unknown case stays unknown.

**Next steps**

- Deploy the Functions surface to production once a mobile release carrying the
  badge is ready, so the push and the badge arrive together. One dispatch of
  `production-deploy.yml` at 43e7840; the orchestrator resolves this commit to
  the Functions surface alone.
- The badge and the sweep each hold their own copy of the two-student ceiling —
  `oneTutorRosterCeiling` in the mobile timetable and `ONE_TUTOR_ROSTER_CEILING`
  in the Functions module. A test on each side pins the number so a one-sided
  change fails loudly, but they still have to be edited together.
- The push's `data.type` is `overstaffed_sessions`, which the app does not route
  on tap yet. It joins the other admin-facing types already in that position;
  closing that gap is its own piece of work.

---

## 2026-09-08 — Staging could not load the admin timetable at all

**What changed**

- Deployed the declared Firestore indexes to staging. The `attendance`
  collection-group index on `termId` + `weekNum` was declared in
  `backend/firebase/indexes/firestore.indexes.json` but had never reached the
  staging project, so every admin timetable load there failed with
  `failed-precondition` and the screen showed "We couldn't load the timetable".
- Nothing else moved: staging went from four attendance indexes to five, and
  the deploy was a straight `firebase deploy --only firestore:indexes`.

**Why:** Found while verifying MOB-8 on a staging build. The admin timetable
had been unusable on staging for anyone, not just for the feature under test.

**Status:** Live on staging. Production was not touched and has not been
checked for the same drift.

**Next steps**

- Add an index-drift check alongside the existing rules-drift check
  (`scripts/firebase/firebase-rules-drift.mjs`, from TP-19). Index state
  tooling already exists in `scripts/firebase/firestore-index-state.mjs`; there
  is just nothing running a comparison. Check production for the same drift as
  part of that work.

---

## 2026-09-07 — Failures stopped blaming the user's wifi (MOB-26)

**What changed**

- Twenty-four places in the app told the user to check their connection
  whenever anything went wrong, without ever checking whether the connection
  was the problem. A parent whose session had expired, and a tutor opening a
  class they were not assigned to, were both sent to look at their wifi. These
  now say what actually happened — offline, no permission, or an unknown
  failure — using the error presenter added in MOB-32.
- The three dashboards were the most visible: parent, tutor and admin all
  showed a cloud-off icon over "Check your connection and try again" for every
  possible failure. The icon asserted the same wrong thing the sentence did, so
  it changed too.
- A payment that timed out was reported as "Payment could not be started. Your
  invoices are unchanged." Neither half is something we can see when the call
  never came back — a charge may have gone through. It now says the status is
  unconfirmed and asks the user to give it a moment, and only promises nothing
  was charged where Stripe told us the payment never started.
- Failing to promote someone off a waitlist replaced the whole sheet with
  "Waitlist could not be loaded", which had not happened. The promotion failure
  is now reported above the list, and the list stays.
- Two sheets held the caught exception itself in their state. Nothing rendered
  it, but it sat one line of code away from being shown; they now hold the
  presented sentence instead.
- Read back every sentence the app can now produce and fixed three that did
  not survive it. Two collided with their own trailing "right now" ("update
  the bookings for this week right now"); a third gave the same tutor list two
  different names depending on which sheet asked for it.
- Announcement writes were reported twice — once by the screen, once by the
  list — and the list's copy sat under "Announcements could not be loaded",
  which a failed create had not made true. The controller now records load
  failures only, and each screen presents its own write failure.
- Presenting inside a `FutureBuilder` logged the same failure once per
  rebuild — a keystroke in the search field above a failed student picker was
  enough — and would have filed a crash report per frame once there is a
  reporter to file to. The six builder sites now present through a small cache
  that keeps one failure to one log entry, while a genuine second failure is
  still recorded.
- Added a test that reads every Dart source in the app and fails if a caught
  error is interpolated into anything but a log line. It carries its own
  proof — a fixture it must flag, and one it must not — so it cannot quietly
  pass by scanning nothing.

**Why:** MOB-32 built the error presenter and MOB-34 applied it to six places.
The rest of the app kept its hand-written messages, so the app had two standards
at once: some failures explained themselves honestly and the rest guessed at a
cause. The guess was wrong often enough to send people to fix a connection that
worked. The new test is what stops this being a fourth ticket on the same
subject.

**Status:** In review — branch `mob-26-no-raw-client-errors`, 1259 tests pass,
`flutter analyze` clean.

**Next steps**

- Messages left unchanged where they were already specific and true: the
  Firebase auth-code mappings on the password and profile screens. Worth a
  look if the wording ever needs to be consistent rather than accurate.

---

## 2026-09-06 — MOB-39 and TP-22 merged; a stale start-week could still be accepted

**What changed**

- `enrollStudentPermanent` now rejects a start week whose session has already
  begun, comparing the attendance document's stored start instant against now
  rather than the Sydney calendar date. Scoped to enrolments that name a start
  week, so admin and waitlist paths keep their existing behaviour.
- [MOB-39](https://tenacitytutoring.atlassian.net/browse/MOB-39) merged as
  [PR #170](https://github.com/tsowmi03/tenacity-platform/pull/170) and
  [TP-22](https://tenacitytutoring.atlassian.net/browse/TP-22) as
  [PR #171](https://github.com/tsowmi03/tenacity-platform/pull/171), both to
  `main`. TP-22 also deployed to production — see that entry below.

**Why:** review on #170 found that the start-week picker only lists sessions
still ahead at the moment it is opened, but a family can sit on the sheet: pick
the 5pm class at 4:59, confirm at 5:10, and the choice made is stale. Every
other check in this feature decides by Sydney calendar date, which cannot tell
a session that began minutes ago from one later the same day — so the server
accepted it anyway, and the student would have been added to a roll for a
class that had already run. That is the same shape of bug MOB-39 exists to
fix: the screen promising one thing and the server doing another.

A second review finding — session dates are computed in the device's
timezone while terms are generated in Australia/Sydney, so a device west of
Sydney can see every week shift by seven days — was not fixed here. It is
app-wide and predates this ticket (the parent timetable, dashboard, admin
classes and tutor classes share the same arithmetic), so patching it inside
one sheet would make that sheet disagree with the screen it opens from.
Deferred to [MOB-47](https://tenacitytutoring.atlassian.net/browse/MOB-47)
with Thomas's agreement. The dangerous outcome — a child added to a roll for a
class that has already run — is blocked by the fix above regardless of what
the device's clock believes, since the guard compares stored instants rather
than any calendar date.

**Status:** Live. Confirmed against deployed staging functions directly: a
start week aged to an hour in the past returns `HTTP 400 FAILED_PRECONDITION`
before any write, and the following week returns `HTTP 200` normally. 1140
backend unit tests and 170 emulator tests pass.

---

## 2026-09-03 — Permanent enrolment was two megabytes over its memory limit

**What changed**

- `enrollStudentPermanent` now asks for 512MiB instead of running on the
  256MiB default, matching `enrollStudentOneOff`, which has always set it.
- The start-week check reads only the `date` field rather than going through
  `futureSessionsFor`. It runs moments before the attendance fan-out reads the
  same subcollection in full, and needs neither the attendance arrays nor the
  document references that the fan-out does.

**Why:** testing MOB-39 against staging turned up a 500 from
`enrollStudentPermanent`: `Memory limit of 256 MiB exceeded with 258 MiB used`,
on the request path. Not a logic error — the function had been sitting just
under a limit it never declared, and the code added since has crossed it.

This is not a staging misconfiguration. Production is on 256MiB too, verified
on the function and on the Cloud Run service behind it, across every revision
back to 24 August. Staging only differs in running newer code: production last
deployed on 31 August, before MOB-38. The next production Functions deploy
would have carried this whether or not MOB-39 merged, because MOB-38 is already
on main — permanent enrolment and every permanent swap returning 500.

Fifteen production functions already run at 512MiB and four at 2GiB, so the
raise follows an established pattern rather than setting a precedent. The
lighter read is worth having on its own and is not offered as the fix.

**Status:** Merged and deployed. Split out to its own branch and shipped as
[PR #171](https://github.com/tsowmi03/tenacity-platform/pull/171) rather than
riding in on MOB-39 — it fixes a production risk MOB-38 already introduced, and
did not need to wait for a feature review. 1136 unit and 170 emulator tests
pass.

Confirmed on staging on 3 September: `enrollStudentPermanent` reports 512MiB,
the 500 is gone, and a two-child deferred swap returns `startWeek=7`,
`firstAttendanceDate=2026-09-17` and `keptWeeks=["2026_T3_W6"]`. The attendance
that swap wrote is the whole feature in one table — week six in the class they
are leaving, week seven onward in the one they are joining, past weeks
untouched, and in every week they are in exactly one class, never both and
never neither.

Deployed to production on 6 September. The first dispatch failed in the
pre-deploy dry-run stage with `Failed to list functions for
tenacity-tutoring-b8eb2` — a transient Cloud Functions API error, not a code
problem: the deploy record and the workflow's own step order confirmed nothing
had reached the real deploy step, so production was untouched. A second
dispatch of the identical SHA deployed all 91 functions with zero failures.
`enrollStudentPermanent` confirmed live at 512MiB (`updateTime` matches the
deploy log to the second).

**Next steps**

- `unenrollStudentPermanent` is the nearest thing to the same edge: still on
  256MiB, and it reads the attendance subcollection three times over. It has
  not failed, so it is not being raised blind, but it is where to look next.

---

## 2026-09-02 — Staging seeds a class holding both of one parent's children

**What changed**

- `seed-class-4` (Wednesday English) now holds both of parent-1's children,
  Sam and Sana. Every seeded class previously held at most one of them.
- Added `seed-class-6` (Thursday English, two of six seats taken) as somewhere
  a two-child swap can actually go. The only other English class is
  deliberately full, so without it the flow stopped at an empty class picker.

**Why:** Any flow that acts on a selection of children could not be driven by
hand on staging — the child picker with more than one option, and the MOB-38
rule that a swap needs a free seat per child. Both were reachable only from
tests, which is how the redundant single-child picker survived to be noticed
in use rather than in review.

**Status:** Merged (#170), 6 September. Verified against the emulator: class 4
holds both children across all ten attendance weeks, and class 6 has four free
seats. Re-seeded to staging and used there to drive the real multi-child picker
and the two-child deferred swap end to end.

**Next steps**

- Re-seed the staging project so the new layout is actually there:
  `node scripts/seedStaging.js --projectId=tenacity-tutoring-staging --commit --yes`
  from `backend/firebase/functions`. Needs current application-default
  credentials.

---

## 2026-09-02 — A run script for the app's flavour, and no picker with one option (MOB-39)

**What changed**

- Added `apps/mobile/scripts/run.sh`. It takes one argument — `staging` or
  `prod` — and sets `--flavor` and `--dart-define=TENACITY_ENV` from it, so the
  two cannot disagree. There is deliberately no default: which Firebase project
  you are about to write to is not a thing to guess on someone's behalf.
- The child picker is skipped when there is only one child to pick. A family
  with a single child in a class was asked "Who is this for?" over a list they
  could only answer one way, and the answer was on the tile they had just
  tapped. Every sheet after it names the child before anything is committed, so
  nothing is lost by not asking.
- That rule now lives in one place and covers every path into the picker. A
  narrower version already existed for one-off and permanent enrolments, but
  swaps returned before reaching it, which is where it was noticed.

**Why:** `AppEnvironment.assertFlavorMatchesEnvironment` told anyone who hit a
flavour mismatch to "use apps/mobile/scripts/run.sh" — a script that had never
existed, so the error pointed at nothing and the flags had to be worked out
from the docs. The picker was found while testing MOB-39 on staging.

**Status:** Merged (#170), 6 September. 1251 Flutter tests pass. Both changes
were confirmed on the staging build running in the simulator.

---

## 2026-09-02 — Parents choose when a permanent class swap starts (MOB-39)

**What changed**

- A permanent swap now asks which week it should start from, listing the new
  class's remaining sessions by date. The first is the next session, which is
  where every swap started before and still starts unless the family says
  otherwise.
- The confirmation names the date — "every week from Thu 17 Sep" — instead of
  "for the rest of the term", which was equally true of a swap starting on
  Thursday and one starting in a month.
- A swap that starts later keeps the child in the class they are leaving until
  then, and the confirmation says so. Weeks kept for that reason are no longer
  reported afterwards as weeks the new class "was already full", which would
  have been false and would have buried the weeks that genuinely were.
- Weeks that have already run are not offered. A session earlier the same day
  counted as future to the backend, so an immediate swap could put a child on
  the roll of a class that had already finished; naming the week explicitly is
  what stops that.
- Admins are told the start date when a swap is deferred. The spot it frees in
  the class being left is not free for those weeks, and promoting somebody off
  the waitlist into it would seat them in a full room.
- The weeks a child stays put are still worked out on the server, and the start
  week is still not one of the inputs. The rule now asks what the destination
  class actually holds that week, which covers both a full week and one the
  swap has not reached yet — and means the two halves of a swap cannot disagree
  and drop a child from both classes.
- A start week past the class's last session is refused before anything is
  written. Without that check it would enrol a student permanently while
  seating them in no week at all, which reads downstream as "keep every week in
  the class you are leaving" — the MOB-38 exploit by another road.

**Why:** Parents kept expecting a permanent swap to take effect from the week
they were looking at. It never did — the displayed week was not sent anywhere,
and the change always applied from the next session — so the result depended on
the day it was tapped. A parent moving Monday to Thursday who swapped on
Tuesday had already attended Monday and was added to that Thursday: two
sessions in one week, with nothing on screen explaining it. There was no way to
ask for a later start at all.

**Status:** Merged (#170) and live, 6 September. 1140 backend unit tests, 170
emulator tests and 1251 Flutter tests pass. Review on the PR found a second gap
after this entry was written — see the next entry — which is fixed and
deployed to both staging and production.

**Next steps**

- A deferred swap releases the old class's permanent spot immediately, so the
  class-level "spots remaining" number is optimistic until the switch. Per-week
  capacity stays correct — occupancy is read from each week's attendance, so a
  promoted student is skipped for the weeks that are full — and admins are now
  told the start date. Making the number itself honest would need the swap to
  be applied by a scheduled job when the week arrives; worth doing only if
  waitlist promotions start landing on weeks they cannot use.
- Plain permanent enrolments (not swaps) still always start at the next
  session. The backend takes a start week on any permanent enrolment, so
  offering the same choice there is a UI change only, roughly half a day.

---

## 2026-09-02 — Permanent swaps could put five students in a room built for four (MOB-38)

**What changed**

- Permanent capacity now accounts for one-off visitors. It was
  `capacity - enrolledStudents.length`, and a visitor holds a real seat for one
  week without ever appearing in `enrolledStudents` — so a class could read as
  having room while a particular week had none.
- Enrolling a student permanently no longer overfills weeks that are already
  full. The fan-out over future sessions skips those and reports them; the
  student joins from the first week with room. The paid visitor keeps the seat
  they bought.
- `enrollStudentPermanent` checks capacity at all. It never did, and the parent
  swap flow calls it, so a family could add children to a class with no spots
  left. Admins are exempt, so a deliberate overfill is still possible.
- Swapping two children now needs two seats. The class picker offered anything
  not already full, then the caller looped over every selected child, so one
  free spot admitted both.
- A swap takes the new place before giving up the old one. That order matters
  now that a full class can refuse: the old way would have left a child in
  neither class. A refused swap leaves them where they were.
- A swap keeps the child in the class they are leaving for any week the new
  class was too full to take, so moving never costs a session they already had.
  This works because attendance documents are keyed `{termId}_W{weekNum}` — the
  same week has the same id in every class.
- Admins are notified which weeks an enrolment could not take, on all three
  permanent paths: parent enrolment, direct enrolment and waitlist promotion.
  Families are told at the end of a swap where their child stays and for how
  long.
- Which weeks a swap keeps is worked out on the server from the destination
  class, not taken from the caller. Review caught that the unenrol endpoint is
  reachable by any parent for their own child, and session ids are guessable —
  so a supplied list would have let somebody free their permanent spot for the
  waitlist while staying booked into every remaining week.
- An admin overfilling a class on purpose now gets the student onto every roll.
  The session-level skip applied to admins too, which put the student on the
  class list and on no roll, quietly undoing the override.

**Why:** A family permanently swapped two children into a class holding two
permanent students and one one-off visitor. Capacity was four; that week ran
with five. Three separate gaps had to line up for it, and each is closed here.

**Status:** Merged — PR #169. 1128 backend unit tests, 167 emulator tests and
1224 Flutter tests passed. The emulator test for the skip was confirmed to fail
without the fix.

**Next steps**

- The parent-facing warning appears after the swap, not before it. The client
  only holds attendance for the displayed week, so a full pre-flight list of
  affected weeks would need the backend to answer a dry-run question. Worth
  doing if families find the after-the-fact message surprising.

---

## 2026-09-02 — Chat attachments had no storage rule at all (TP-21)

**What changed**

- Attachments now upload under the sender's own uid —
  `chatImages/{uid}/{messageId}.jpg` and `chatFiles/{uid}/…` — mirroring the
  convention the resources bucket already uses. The storage rules grant exactly
  that: a signed-in user may write under their own prefix and nobody else's.
- The rules keep accepting the un-prefixed paths the released build writes, so
  deploying them does not stop attachments working for anyone who has not
  updated yet. Both blocks are marked for deletion once that build is retired.
- Invoice PDFs can be opened again. They had no rule either, so every attempt to
  view one — in the app or the admin portal, both of which go through
  `getDownloadURL()`, which these rules govern — was denied alongside the chat
  attachments. A parent may read their own invoice's PDF and staff may read any;
  the rule reads the invoice document to decide, because a financial record
  should not be readable by anyone signed in who knows an id. Writes stay
  closed, since only the Functions put PDFs there and the Admin SDK does not
  consult these rules.
- Storage rules tests cover the new paths: writing under your own prefix, under
  somebody else's, anonymously, reading an attachment somebody else sent, the
  legacy paths, and each invoice-PDF case. Removing the new rules fails three of
  the five attachment tests.
- Compressing an image now falls back to sending the original when the
  compressor throws, not only when it returns nothing. The comment above it
  already claimed that was the behaviour.

**Why:** Sending a photo on staging failed with
`[firebase_storage/unauthorized]`. The rules file has never had an entry for the
paths chat attachments use — it has not been touched since the July extraction —
so every attachment write fell through to the closing deny.

**This is not a staging problem. Sending a photo or a file in chat has been
broken in production since about 23 May 2026.** The deployed production Storage
ruleset was read directly from the Rules API and is byte-identical to the
repository's: the same closing deny, no chat paths. Staging is identical again.
Neither environment has drifted — the rules are consistent everywhere and
consistently wrong.

The bucket dates it. The newest object under `chatImages/` in production is from
19 May 2026 and the newest under `chatFiles/` from 20 May; there are 76 chat
images in total and nothing at all after those dates. The first restrictive
Storage ruleset — `resources/` paths plus a catch-all deny, no chat paths — was
created on 23 May. Before it, production was still running Firebase's default
template, `allow read, write: if true` on every path, which is why attachments
had worked until then: nothing was checking. Tightening that ruleset silently
took chat attachments with it, and for three months nobody saw an error, because
this failure has no user-visible symptom beyond the send not completing.

**Reads are not scoped to the conversation.** Any signed-in user can read any
attachment. The path carries no chat id to check against, and the app shares
attachments as `getDownloadURL()` links, which carry their own token and are
served without consulting these rules at all — so scoping reads properly means
changing both the path and the way attachments are fetched. Worth doing, and
deliberately not done here.

**Also fixed before merge**, from the automated review: granting `write` on the
legacy paths would have let any signed-in user replace or delete somebody else's
attachment, since those paths carry no uid and the path is not secret — it sits
inside the download URL shared in the conversation. Narrowing the grant to
`create`, as suggested, does not close that: re-uploading over an existing
object is evaluated as a create, because every upload writes a new generation.
Requiring `resource == null` is what refuses it, and a test now asserts the
overwrite case so the distinction is not lost later.

**Status:** Live in production, merged in #166. Both rule surfaces were deployed
together — Storage, and the Firestore `lastReadAt` watermark that had been
sitting undeployed as TP-20 — because the pipeline deploys the rules surface as
a unit. Verified against the Rules API: production now matches the repository
byte for byte on both, and the drift check passes for production. 1209 mobile
tests and 46 rules tests passing.

Chat attachments and invoice PDFs work again for everyone on the current
release, without waiting for an app release: the legacy blocks permit exactly
the un-prefixed paths that build already writes.

**Next steps**

- Staging still has the old rules and its drift check still fails. It needs the
  same deploy through the rehearsal workflow.
- The deploy also closed TP-20, since the Firestore surface could not be left
  behind. Worth confirming the read watermark now behaves in production before
  the next mobile release.

**What else 23 May broke.** The whole bucket was surveyed and every Storage path
the clients touch was run against the ruleset actually deployed to production.
Two features broke, not one:

| Path | State | Verdict |
|---|---|---|
| `chatImages/`, `chatFiles/` | Last upload 19–20 May | Broken — sending and viewing |
| `invoices-pdfs/` | 185 objects, still being written | Broken to read — 30 written since 23 May that nobody could open |
| `resources/` | 255 objects, active to 1 Sep | Fine — explicitly permitted |
| `invoices/` | One object from Feb 2025 | Dormant, not a live path |

The invoice PDFs kept being generated the whole time, because the Functions
write them with the Admin SDK, which does not consult these rules. Only opening
one was denied. That is why the bucket looks healthy and the feature is not:
a prefix can be broken for reads and leave no trace at all.

**Correction to the TP-19 entry below:** it records that staging has never had
Storage rules released. Staging has had them since 22 July 2026 — the release
and its ruleset are both readable from the Rules API. The TP-19 next step built
on that premise, and the ticket needs the same correction.

---

## 2026-09-01 — Staging rules drift is now noticed, not remembered (TP-19)

**What changed**

- A new check compares the security rules actually deployed to staging and to
  production against the ones in the repository. It runs every morning, on
  every merge to `main` that touches rules, and on demand. When they differ it
  fails, and the run summary names the surface, the deployed ruleset, and both
  source hashes.
- The check only reads. It asks for a read-only token, never loads the Firebase
  CLI, and cannot deploy anything — which is why, unlike the rehearsal
  workflows, it is not switched off between rehearsal windows. Those are the
  weeks drift went unnoticed.
- It compares using the same code the production deploy uses to prove what it
  deployed, so the check and the deploy cannot disagree about what "matches"
  means.
- That comparison could previously only be made for both surfaces at once,
  which was useless here: staging has never had Storage rules released, and the
  missing surface aborted the comparison before it could say anything about
  Firestore. It can now be asked about one surface at a time. A partial answer
  is still refused everywhere a deploy or rollback needs the complete one.

**Why:** Rules drift is silent. A client writing a field the deployed rules do
not know about has its whole write rejected — no crash, nothing in the logs, the
feature simply does not work. Staging's rules sat six weeks behind, typing
indicators were broken there for a week, and nobody noticed because nothing was
watching.

**Status:** In progress — on `tp-19-staging-drift-detection`, 225 CI tests
passing, not yet merged. The live path is unproven: there are no credentials on
this machine to impersonate the deploy identities, so the first real run will be
the one that happens on merge.

**Next steps**

- Staging's Storage rules have never been released at all, so the staging job
  will keep failing on that surface until they are deployed there once.
- The check reports drift but cannot fix it, and there is still no in-band
  operation that brings a drifted staging project current — the rehearsal
  workflow serves an empty project or an already-current one, and nothing else.
  That is the rest of TP-19.
- Failures reach whoever reads GitHub's notifications. Somebody about to test on
  staging does not necessarily read those, which was the second thing TP-19
  asked for.

---

## 2026-09-01 — Photos and files survive leaving the conversation (MOB-37)

**What changed**

- Sending a photo or a file no longer depends on staying in the conversation.
  The file is copied somewhere the app owns and queued, and the upload happens
  in the queue, so swiping away mid-upload no longer loses it.
- Attachments can now be sent without a connection. They wait and go when one
  comes back, the same as text messages already did.
- A photo that failed partway through is never uploaded twice. If the app is
  killed after the upload but before the message is sent, it sends the copy
  already uploaded — which is also how uploads stop accumulating with nothing
  pointing at them.
- The copy the app keeps is deleted once the message is confirmed.

**Why:** Uploading belonged to the chat screen, so it died with the screen. A
photo abandoned that way was lost, and its half-finished upload stayed in
storage with no message referring to it. File attachments had the same problem
and were included, since it is one mechanism and fixing only half would have
left the same bug next door.

**Also:** a fix from the previous piece of work — a caption never being sent
without the photo it belongs to — now has a test. It could not be tested before
because uploading was tangled into the screen.

**Fixed before merge**, from the automated review: signing out while a photo was
uploading could have sent it under the next person's name, and a file still
waiting to upload could not be opened by tapping it.

**Status:** Merged in #162. Live on `main`; not yet in a released build.

---

## 2026-09-01 — Chat notifications behave the same on iPhone and Android (MOB-46)

**What changed**

- A message arriving while the app is open no longer raises a notification on
  either platform. The inbox badge and unread counts still update immediately,
  as they always have.
- Notifications while the app is closed or in the background are untouched, as
  is tapping one to open the conversation.
- Nothing changes for announcements, lesson and shift reminders, feedback or
  waitlist notifications. This is about chat only.

**Why:** The two platforms did different things and nobody had chosen that.
Android popped up a notification for a message that arrived while you were
using the app; iPhone showed nothing at all, because the code that builds those
notifications only ever built the Android half. Rather than switch iPhone on to
match, we settled on the quieter behaviour iPhone already had.

**Worth knowing:** this is a visible change for Android users, who will stop
seeing those pop-ups. If we ever want them back, it should come with a setting
to turn chat notifications off — there isn't one today, so the only way to
silence them is to silence the whole app.

**Status:** In progress — on `fix/mob-46-foreground-notification-parity`, 1200
mobile tests passing, not yet merged.

---

## 2026-09-01 — Security rules are now tested against what the app writes (TP-18)

**What changed**

- The database security rules are now checked whenever the mobile app changes,
  not only when the rules themselves are edited.
- Added cases covering the writes the app actually makes to a conversation: a
  participant can record their own read position, and cannot move anybody
  else's, or claim somebody else is typing. A write of a field nobody has
  allowed is rejected.

**Why:** The read-position work added a new field the app writes, but the rules
did not permit it. In production that would have meant unread counts never
clearing and read receipts never updating — no crash, nothing in the logs, the
feature simply not working. It was caught by an automated reviewer rather than
by any check we own, and the check that could have caught it does not run on a
change to the app alone, which is exactly the shape this kind of mistake takes.

**Verified:** temporarily removing the rule makes the new test fail, so it
catches the original mistake rather than merely describing the fix.

**Status:** In progress — on `feat/tp-18-firestore-rules-tests`, 35 rules tests
passing against the emulator, not yet merged.

**Next steps**

- The rules suite still describes the rules rather than the app, so it can only
  catch a known write regressing, not a new one arriving unpermitted. Closing
  that properly would mean generating the cases from the client's write shapes
  — worth considering if this class of bug recurs, but a much larger change
  than this.

---

## 2026-09-01 — Opening a conversation no longer downloads all of it (MOB-41/42/43)

**What changed**

- Opening a conversation now loads the most recent messages and fetches older
  ones as you scroll back, instead of downloading and watching every message
  the conversation has ever held.
- Marking a conversation read is now a single write, however long it is. It
  used to read every message and then write to each unread one — which also
  meant a conversation with enough unread messages could fail to open at all,
  because the underlying write batch has a hard limit of 500 operations.
- Read receipts now come from one "read up to here" marker on the conversation
  rather than a stamp on every message.
- Messages written in the same instant now have one defined order rather than
  an arbitrary one, and loading older messages can no longer skip a group of
  them that share a timestamp.

**Why:** Both costs grew with the length of a conversation, so the busiest
threads were the slowest and most expensive to open, and the ones closest to
failing outright.

**Compatibility:** Unread counts are written exactly as before, and the older
per-message read stamps are still written for anyone on the previous release —
but only for the messages on screen, not the whole conversation. A conversation
that has no marker yet falls back to the old stamps, so nobody loses read
receipts during a rollout.

**Status:** Merged in #158. Live on `main`; not yet in a released build.

**Before this ships:** the updated database rules must be deployed before or
alongside the app. The app now writes a "read up to here" marker that the
current rules do not permit, so an app released ahead of them would fail to
clear unread counts or update read receipts at all.

**Next steps**

- Nothing outstanding in the app. The ordering change needed no new database
  index in the end: it matches the ordering the database already applies by
  default.
- A gap this work exposed is tracked separately as TP-18: no test in the
  repository can catch a client write that the security rules would reject,
  which is how the rules gap above reached review in the first place.

---

## 2026-09-01 — A sent message no longer depends on the screen that sent it (MOB-36)

**What changed**

- Tapping send now writes the message to disk before anything touches the
  network, and hands it to a queue that outlives the chat screen. Swiping out
  of a conversation mid-send, or the phone dying, can no longer lose the
  message or produce a second copy of it.
- The reported bug is gone: sending, swiping away, coming back and sending
  again used to post the message twice, because the saved draft still held the
  text and a second send invented a new id the server could not recognise.
- Messages compose offline now. They are accepted, shown as queued, and sent on
  reconnect, instead of being refused with "you need to be online".
- The queue sends one message at a time per conversation so messages arrive in
  the order they were typed, retries with a widening delay, and keeps retrying
  across app restarts until the server confirms.
- A conversation that cannot send no longer holds up the others behind it.
- Drafts went back to meaning only "text typed but never sent". Three pieces of
  bookkeeping that existed to work around the old design were deleted outright.

**Why:** A message the user has sent should not be able to disappear because
they navigated away. The previous design kept in-flight sends in screen state
and reused the draft to hold the text, so disposing the screen lost the record
while leaving the text behind — which is exactly how one message became two.

**Status:** Merged in #156. Live on `main`; not yet in a released build.

**Also fixed before merge**, from four findings raised by the automated review
on the pull request — all four were real, and none had been spotted while
writing the code:

- Queued messages are tied to the account that queued them. The queue is one
  store shared by everyone who signs in on a device, and the server takes the
  sender from whoever is calling — so one person's unsent message could have
  gone out under the next person's name after a sign-out.
- Whether a conversation counts as open now follows what is actually on screen.
  A thread sitting underneath another screen went on hiding its own
  notifications, and a thread revealed by closing the screen above it never
  started again.
- A caption can no longer be sent without the photo it belongs to. Leaving the
  screen mid-upload used to send the words on their own.
- A storage write that the device refuses is no longer treated as a success,
  which had let the composer clear text that was never actually saved.

**Next steps**

- Images still send inline and are still lost if the screen goes away
  mid-upload. Extending the queue to cover them needs the picked file copied
  into app storage first, tracked as MOB-37.
- The caption fix has no test: reaching that path needs the upload service
  injectable, which the image send does not support yet. Worth doing as part of
  MOB-37, roughly an hour on top of that work.

---

## 2026-09-01 — Messages read on screen stayed unread (MOB-40)

**What changed**

- The app now knows which conversation the user is looking at. Nothing tracked
  that before, and three separate problems turned out to share it as their
  cause.
- A message that arrives while you are reading a thread is now marked read
  straight away. Previously reading only happened on the way into a thread, so
  a message that landed while you sat there kept the inbox badge lit until you
  left the thread and came back.
- For the same reason, the sender is now shown "Read" while you are looking at
  their message, instead of being told it was only delivered.
- A message arriving in the thread you already have open no longer raises a
  notification banner announcing something that is on your screen.
- Backgrounding the app gives up the claim, so a message arriving then still
  notifies and stays unread. Coming back marks whatever arrived while you were
  away as read, rather than waiting for the next time you open the thread.

**Why:** Comparing our chat against how established messaging clients work
turned up one structural absence rather than a list of missing features. Every
mature client treats the open conversation as explicit state and hangs
notification suppression and read-on-arrival off it. We had no equivalent
anywhere, and each of the three symptoms had previously looked like an
unrelated bug.

**Status:** Merged in #156. Live on `main`; not yet in a released build.

**Next steps**

- Decide whether iOS should show in-app notifications for messages in *other*
  threads. It currently shows none at all while the app is foregrounded, so the
  banner half of this fix is Android-only in practice. Needs a product call
  before it is worth building; roughly half a day once decided.

---

## 2026-08-31 — Generated questions and passages no longer credit themselves (RES-28)

**What changed**

- Maths scenarios and word problems are no longer tagged with a line saying who
  wrote them. The instruction that produced those tags told the AI to credit
  anything it wrote to "Tenacity Resources" as the author, and applied to every
  subject. Maths resources have nowhere to record an author, so the credit
  ended up inside the question itself.
- The rule now says the opposite: text the AI writes carries no author, and it
  must never write a credit, byline or source line into a question, scenario,
  heading or explanation.
- An English passage the AI wrote is now captioned "Original passage" instead
  of being credited to Tenacity Resources. A genuine public-domain text is
  unaffected and still shows its real author and source, which was always the
  point of the caption.
- A passage that names a source but no author now shows only the source. It
  used to claim an author it did not have.

**Why:** The credit read as a brand stamp on the AI's own work, which is not
what it was for. It was there to keep the AI from inventing fake authors for
text it wrote, and a passage with no author already says that on its own
without printing the business name on every maths word problem.

**Status:** Live. Deployed to production on 2026-08-31 (commit `22a6b74`).
Applies to resources generated from here on; documents already generated keep
their existing wording, since each one is built and stored once at generation
time.

---

## 2026-08-30 — English resources can carry sourced visual stimuli (RES-22)

**What changed**

- English resources can now include images in their stimulus booklet, not just
  reading texts. The stimulus planner decides per resource whether it wants
  texts, images, or a mix, and for what purpose: a visual literacy text the
  student analyses, or a photograph they write from.
- Images are sourced from Wikimedia Commons the same way texts are sourced from
  Gutenberg and Wikisource. The model says what kind of image to look for; the
  backend searches, filters and downloads the actual bytes. The model never
  describes, names or invents a picture.
- Only commercially usable images are accepted, decided in code from the
  licence metadata rather than by the model — Tenacity charges for tutoring, so
  NonCommercial and NoDerivatives material is unusable. Trademarked and
  otherwise restricted files are skipped, as is anything under 800px, which
  would be too coarse for a student to analyse.
- Every image is printed with its creator, date, licence and a Commons URL.
- A resource cannot fill its booklet from one scanned series: each sourced
  image records a near-duplicate key that the next lookup excludes.
- A locale ("Australian") is treated as a preference, not a requirement. If a
  region-qualified search finds nothing usable the same search runs without it,
  because an international poster is a better resource than no poster.
- Fixed a pre-existing bug found while building this: citation URLs were being
  run through the maths parser, which read the "/" in a URL path as a fraction.
  Every sourced resource was shipping a broken link —
  `https://en.wikisource.org/wiki/Ozymandias` rendered as
  `https://en.wikisource./Ozymandias`.

**Why:** `visual literacy` was already a listed English skill, so a tutor could
ask for it and get a resource with nothing visual in it. Image-prompted creative
writing had the same gap.

**Status:** Live — merged as `533fb42` ([#150](https://github.com/tsowmi03/tenacity-platform/pull/150))
and deployed to production Functions on 2026-08-31 (deploy record
[#151](https://github.com/tsowmi03/tenacity-platform/issues/151)).

**Next steps**
- Generate an English practice paper, worksheet and diagnostic test through the
  portal and check the planner asks for visuals where it should, and leaves them
  out of straight comprehension and poetry work. The generation call could not be
  exercised before release: its key is in Secret Manager and resource generation
  is excluded from the staging deploy set, so production is the first place the
  new planner prompt and schema meet a real model call. If planning fails against
  the new schema, sourcing fails closed and affected English resources ship with
  no stimulus at all rather than the previous sourced text.

---

## 2026-08-28 — The Functions deploy redeployed all 91 Functions every time (TP-17)

**What changed**

- Measured where deployment time actually goes. It is almost entirely the
  Functions deploy: a median of 22 minutes against 1.6 for indexes, 3.7 for
  rules, 5 for hosting and 0.2 for the website. Pull request validation was
  never the problem — it finishes in seven minutes at worst.
- Found the cause. The deploy redeploys all 91 managed Functions on every
  dispatch, in ten sequential batches of ten at about 2.1 minutes each. The
  batch selectors were built from the inventory alone and never consulted the
  commit, so a one-line change to one Function cost the same 22 minutes as
  changing all of them.
- Added a resolver that works out which Functions a commit actually needs.
  Rather than parsing the source for `require` calls, it loads the entry point
  the way the inventory check already does and reads Node's own resolved module
  graph: each Function is matched to the module that defines it by object
  identity, and that module's dependencies are the files it is affected by.
- Made every uncertain case widen rather than narrow. The dangerous direction
  here is deploying too little, which would ship nothing and report success.
  Environment files, the manifests, the entry point and the inventory itself
  all force a full deploy, and so does any changed file under the Functions
  directory that the graph cannot account for — a new folder, a rename, a
  module reached in a way the graph did not see.
- That rule was not theoretical. Two earlier commits changed only
  `.env.tenacity-tutoring-b8eb2`, which no module graph can see but which
  changes the runtime configuration of all 91. Without the rule the resolver
  would have deployed nothing at all for them.
- Checked it against every commit that has touched the Functions directory.
  Half of them fit in a single batch, the median commit needs 26 of the 91, and
  a quarter still need all of them. On that history the average deploy would
  fall from 21 minutes to about 8.
- Added a check on the one assumption the scoping rests on. Reading the module
  graph only sees the imports that run when the entry point loads, so a require
  written inside a handler would be invisible to it — and the Function needing
  it would be skipped while its dependency changed underneath. The check reads
  every relative require literal out of the source and asserts each one is an
  edge the loaded graph saw. It currently covers 456 edges across 158 files
  with none missing, and it runs on pull requests, not in the deploy window.
  Injecting a deferred require makes it fail, so it is known to work.

**Why:** Deploying took long enough to discourage deploying, and the cost bore
no relation to the size of the change.

**Status:** In progress. The resolver, the graph check and their tests are on
`tp-17-scope-function-deploys` and the whole CI suite passes. Nothing about how
production deploys yet: the Functions workflow only records the scoped set it
would have used, and cannot fail a deploy while doing it.

Worth knowing for anyone reading the shadow output: it is observation, not
verification. A full deploy reports success for every Function and rewrites
every live inventory record whether or not the source changed, so nothing in
the deploy's own output can say which Functions genuinely needed deploying.
What the shadow runs give is the batch counts — real evidence of the saving
before the deploy changes. The correctness question is answered by the require
graph check at pull request time instead.

**Next steps**

- Let the shadow runs gather batch counts on two or three real deploys, then
  switch the batch loop onto the scoped selectors and restate the inventory
  guard as "everything deployed or proven unchanged".
- Six files under the Functions directory are not reachable from the entry
  point, among them three backfill scripts under `lib/scripts/` and
  `src/resources/diagramPolicy.js`. Changing any of them currently forces a
  full deploy, which is safe but wasteful. Worth confirming whether they are
  dead and deleting them, or moving them where the scoping expects scripts.
- Move the preflight checks out of the production deploy window. Ten of the
  last twenty-one deploys failed, mostly on inventory, dependency and dry-run
  steps that are knowable at pull request time but only run after the
  environment gate has been cleared, so each failure costs a full re-dispatch.

---

## 2026-08-28 — Errors showed users raw Dart stack traces (MOB-32/33/34/35)

**What changed**

- Added a shared error presenter. It turns a caught error into a sentence the
  user can act on, and logs the original where a developer will see it. It
  sorts the error into one of a few cases — offline, no permission, ambiguous,
  or unrecognised — and builds the message around a short phrase naming what
  was being attempted, so the user is told which action failed.
- Applied it to all 46 places across the app that were showing the error
  itself: the chat screen (sending a message or file, opening an image or
  file), the timetable, the booking and enrolment flows, and the admin person
  screen.
- The worst of these was the timetable. A tutor or admin opening their
  timetable while offline, or hitting a permissions error, got the raw
  Firestore error where the timetable should have been — on an ordinary screen
  open, on the two most-used screens in the app.
- A send or save that fails with a code meaning "the app stopped waiting" is no
  longer called a failure. The write may well have gone through, so the app no
  longer claims otherwise and no longer colours the notice red.
- In chat that waiting now has an end. A message whose fate is unknown is left
  alone for fifteen seconds; if the server's copy has not arrived by then it is
  marked "Not delivered" with a retry, and the retry re-sends under the same id
  so a message that did get through is not posted twice. The text is kept in
  the saved draft throughout, and only discarded once the message is confirmed
  — so a send that quietly failed can no longer take the message with it.
- Our own errors can now carry their own wording. The two editing-conflict
  errors needed it: they have to tell the user to reload, where the general
  wording would have said "try again" and had them overwrite the very change
  they had collided with.
- Fixed two related leaks found on the way. Fetching an invoice PDF wrapped
  whatever went wrong in a new error carrying the original's text, which is
  what fed the invoice message on the admin person screen. And the tutor
  assignment error carried its cause inside its own text, so a Firebase failure
  nested a whole stack trace within it.
- Wording follows the offline notice the app already shows elsewhere, so the
  same situation does not get two different sentences depending on which check
  happened to catch it.

**Why:** A failed message send put the error and its entire Dart stack trace on
screen — frames from Flutter's platform channels and the Firebase packages,
shown to parents, in release builds. Firebase errors append their stack trace
when converted to text, and the code was pasting that straight into what the
user read. Looking for the same mistake elsewhere found it in 42 more places.

**Status:** Merged to `main` on 28 August via PR #147. Not yet in anyone's
hands: the mobile app ships through a store release, so this reaches families
with the next build. Mobile suite (1159 tests) passed. Automated review on the
PR found two things worth having: that suppressing the message was only half
an answer, since an ambiguous send that never committed had no way to ever
resolve — which is what the fifteen-second window above now fixes — and that a
failed *read* was being described as though it might still be in flight, when
a read that had worked would simply have returned the data. Waiting is only an
open question for something that could have been written.

**Next steps**

- Still wants a look on a device, before the next release rather than before
  the merge, which it did not get. These are 46 messages that only appear when
  something goes wrong, so the suite proves the exception is gone but not that
  every sentence reads well in place. The timetable is where a user is most
  likely to meet one; turning the network off is enough to see it.
- The undelivered-message window is fifteen seconds, chosen because a committed
  write comes back through the thread's snapshot in well under a second. If
  real conditions turn out to be slower, that constant is the thing to revisit
  — too short and a slow success gets accused of failing.

---

## 2026-08-27 — Sent messages appeared twice for a second (MOB-31)

**What changed**

- The app now picks a message's id itself and sends it with the message, so the
  copy it shows immediately and the copy that comes back from the server are
  recognised as one message instead of two.
- The chat screen decides what to show by comparing the two lists on every
  frame, rather than deleting its own copy when the send finishes. It gives the
  same answer however many times the server re-sends the same thread.
- `sendChatMessage` accepts that id and writes the message at it. A send that
  is retried after it already committed now lands on the same document and
  returns quietly, instead of writing a second message and sending a second
  push notification. Builds already on phones don't send an id and still work
  unchanged.
- The chat screen no longer rebuilds its connection to the thread every time
  anything on the screen changes. It was doing so on every keystroke, every
  send, and every background update, and the thread blanked out for a frame
  each time.
- Sent photos are pre-loaded before the server's copy of the message arrives,
  so the photo no longer blinks back to a grey placeholder at the moment the
  send lands.

**Why:** Sending a message showed it twice for about a second before one copy
disappeared. The app added its own copy straight away, but the server's copy
reached the thread as soon as it was saved — while the send call was still
sending push notifications and had not yet returned — so both were on screen
for that whole window.

**Status:** Merged to `main` on 28 August. Mobile suite (1139 tests) and
backend suites (1023 unit, 161 emulator) all passed.

---

## 2026-08-26 — Firestore index deploys blocked by a new Google API field (TP-15)

**What changed**
- Allowed `enhancedTextSearchQueryMode` through the strict key check in
  `scripts/firebase/firestore-index-state.mjs`. Google began returning it on
  the Admin API's database resource partway through 26 August, and the check
  rejects anything it does not recognise, so every index deploy failed at
  "Capture live indexes before deployment".
- The key is allowed **without** asserting a value. It is absent from the
  published v1, v1beta1 and v1beta2 discovery documents and from the REST
  reference, so it is rolling out ahead of its own schema. Pinning a value
  would reintroduce the same breakage the next time Google changed it.
- Added a test for the half that matters: an unrelated new field must still be
  rejected. The tripwire is still armed.

**Why:** The allowlist is deliberate — it fails closed so a person reviews a new
API field before index deploys carry on. It worked as intended; it just needed
the review.

**Status:** Live. Deployed 2026-08-26; the previously failing step passed and
the full index deploy completed green.

Production reports `ENHANCED_QUERY_MODE_ENABLED` on a STANDARD-edition
database. Worth noting the enum prefix is `ENHANCED_QUERY_MODE_`, not the field
name — a guessed constraint would have been wrong, which is the argument for
tolerating rather than pinning. Each deploy re-records the value in its evidence
snapshot, so it can be pinned later if it starts to matter.

**Next steps**
- If the field reaches the published schema and turns out to affect index
  behaviour on STANDARD databases, pin it the way `databaseEdition` is pinned.
  Until then there is nothing to act on.

---

## 2026-08-26 — The Functions deploy counted its batches from a literal

**What changed**
- The production Functions deploy asserted `[[ "${#selectors[@]}" -eq 9 ]]` on
  the number of deployment batches. Functions deploy ten at a time, and the
  inventory held exactly 90, so the literal was right until the 91st was added.
  The count is now derived from the manifest, the way the unit test already
  derived it.
- The check that literal was standing in for — every managed Function selected
  exactly once, none dropped, none invented — is now made directly, by diffing
  the generated selectors against the policy. Unlike a count, that does not go
  stale.
- A test fails if the literal form comes back.
- Corrected the endpoint counts in the deployment doc. They read 87 managed and
  91 live against a real 90 and 94, stale by three Functions. Now 91 and 95,
  with a note that the manifest is the authority, since the sentence has now
  drifted twice.

**Why:** The assertion sits after the environment gate and before the dry run,
so adding the 91st Function failed a production deploy on a number nobody had a
reason to remember. Nothing deployed, which is the right way to fail, but the
window was spent.

**Status:** Live. Merged as part of the RES-23 deployment and exercised by the
Functions deploy that followed — step 8 derived ten batches and passed.

---

## 2026-08-26 — Tutors can revise a generated resource instead of starting again (RES-23)

**What changed**
- Finished resources now offer **Revise**. The tutor writes the change they
  want in plain English — "replace Q3 with a harder one on quadratics", "drop
  the diagram in Q5" — and gets the same document back with only that change
  made. Everything they were happy with is kept.
- Revise is offered from the history row, the generation details panel, and
  the preview window. The preview is the one that matters most: reading the
  document is where a tutor notices what is wrong with it.
- A revision is a new generation, not an edit in place. The original keeps its
  own .docx and stays downloadable, and the revision goes through the queue
  like any other job.
- The model is given the original's reference files as well as the document, so
  an instruction like "take Q3 from the same past paper" has the source to work
  from.
- History now lists one entry per resource rather than one per generation. A
  resource and everything derived from it — revisions, and regenerations from
  edited inputs — collapse into a version stack showing the newest, with the
  earlier ones one click away and labelled by how each was produced.
- Every revision is checked against the document it started from, question by
  question. What changed is recorded on the job, and a revision that moved more
  than one question says so, so a silent rewrite of a question the tutor liked
  does not go unnoticed.
- The "reuse an existing resource" suggestions now offer one version per
  resource, rather than filling up with three near-identical revisions of the
  same worksheet.

**Also fixed:** an admin using **Edit** or **Regenerate** on another tutor's
resource was refused outright whenever that resource had a reference file
attached. Both actions replay the original's files by storage path, and the
server rejected any path outside the caller's own uploads folder — so the
failure only appeared when a file was involved, which is why it went unnoticed.
A replayed generation now names the job it came from, and the server reads the
reference files off that job after checking the caller may use it. The strict
check still applies to files a tutor attaches directly, so nobody can reach
another user's uploads by guessing a path.

**Why:** [RES-23](https://tenacitytutoring.atlassian.net/browse/RES-23). Retry,
Regenerate and Edit all throw away the whole resource and roll the dice again.
When a worksheet came back with one bad question, there was no way to fix that
question without risking everything else.

**Status:** Live. `submitResourceRevision` deployed to `us-central1` and the
portal build serving Revise is live on resources.tenacitytutoring.com, in that
order, so the button never existed without the callable behind it. Backend and
portal test suites pass (1019 and 114).

Deploying it took four dispatches. The first hit a hard-coded batch count in
the Functions workflow, fixed in its own entry; the second was a no-op because the
orchestrator resolves surfaces from the last commit alone and that commit was
the fix; the third hit an npm registry timeout. The fourth, dispatched per
surface rather than through the orchestrator, worked.

**Next steps**
- Watch the first revisions for how often the "changed more than you asked"
  warning fires. It triggers above one changed question, which is a guess at
  where a targeted instruction stops being targeted — the threshold may want
  tuning once there is real usage to look at.

---

## 2026-08-26 — Mobile release 3.0.2 (build 514)

**What changed**
- Bumped the mobile app from `3.0.1+513` to `3.0.2+514` in `apps/mobile/pubspec.yaml`.
  Both platforms read their version from this one line, so nothing else needed editing.
- Built the production iOS archive at `build/ios/archive/Runner.xcarchive`,
  confirmed carrying 3.0.2 / build 514.
- Plain `flutter build ipa` failed at export again, with the same "No signing
  certificate 'iOS Distribution' found" / "No Accounts" seen on the 3.0.1
  release. That entry framed the App Store Connect API key as the fix; it
  isn't — it's a workaround needed only because `xcodebuild` was run
  non-interactively. The distribution certificate and a valid App Store
  provisioning profile both exist and are current to 2027, just not visible
  to a non-interactive process, since Xcode keeps them in the data-protection
  keychain. Exported and uploaded via Xcode Organizer instead, which runs in
  the logged-in GUI session and reaches that keychain directly.

**Why:** Ships the fixes landed since 3.0.1 — the typing indicator sticking
on or never appearing (MOB-27) and the terms-and-conditions screen flashing
past on the way to the dashboard (MOB-29).

**Status:** iOS build 514 uploaded to App Store Connect via Xcode Organizer,
for TestFlight. Android bundle for this release has not been built.

**Next steps**
- Build and upload the Android production bundle for 3.0.2, a few minutes.

---

## 2026-08-26 — Booting the app flashed the terms and conditions screen (MOB-29)

**What changed**

- Opening the app no longer shows the terms and conditions screen on the way
  to the dashboard. Users who had already accepted the current terms were
  being shown the acceptance screen for as long as it took the app to work
  out that they had — usually a moment, sometimes long enough to read.
- The app now shows a plain Tenacity loading screen while it works out where
  to send you, and only ever shows a real screen once it knows which one
  applies.
- Reopening the app when you are already signed in no longer shows the login
  screen first. Restoring a saved session takes a moment, and during that
  moment the app could not tell "still checking" apart from "signed out".
- The rule the app uses to choose between the login screen, the terms gate
  and the dashboard is now a single named decision with its own tests, rather
  than a chain of conditions inside the screen that renders them.
- A failed session restore no longer leaves the app stuck. The error was
  previously uncaught, which left the loading flags set with nothing left to
  finish them.
- The terms document now starts loading from a place that always runs. It was
  being started from a callback that reads a navigator context, which is
  empty on the frame that callback fires; when that happened the terms never
  loaded and the gate had nothing to open on.

**Why:** The screen that asks you to accept the terms was doubling as the
app's loading screen, so every returning user was shown a legal gate they did
not need before landing on their dashboard. Two separate windows produced it:
one while the app read whether this user had accepted, and one after that
answer arrived but before the current terms document had loaded — because
"which version is current?" being unknown reads the same as "you are out of
date" to the comparison the gate makes. Both are cases of acting on a
question that has not been answered yet, which is why the flash came and went
depending on how quick the network was that morning.

**Status:** Merged to `main`. Ships with the next mobile release; no
deployment of its own, as nothing outside the app changed.

**Next steps**

- MOB-30: the acceptance check re-reads `users/{uid}`, which the session
  restore has just read, and that document already carries the acceptance
  fields. Removing the second read would take a round trip out of every cold
  start. Left out of this fix deliberately — it changes where a legal gate gets
  its answer, which warrants its own review rather than riding along with a
  rendering fix.

---

## 2026-08-25 — The typing indicator in messages was stuck on, or missing (MOB-27)

**What changed**

- "… is typing…" now means somebody is actually typing, and clears itself
  about eight seconds after the last keystroke whether or not their phone
  ever says so. Previously it meant "has text in the compose box", and only
  the sender's device could ever turn it off.
- Leaving a chat, backgrounding the app, or closing it now clears the
  indicator for the other person. None of these did before: the chat screen
  had no teardown code at all, so a half-written message left the other
  participant seeing "is typing…" indefinitely.
- The indicator now appears in chats opened from a push notification or from
  a person's profile. It only ever worked in chats opened from the inbox,
  and failed silently everywhere else.
- Restoring a saved draft no longer breaks the indicator for that chat. It
  used to put the screen and the server permanently out of step, after which
  the other person was never told anything about that conversation again.
- Typing while offline no longer leaves the indicator stuck on once the
  connection returns.
- A participant can no longer make somebody else appear to be typing.
- The heartbeat lives in a new field rather than replacing the old flag's
  type. Both app versions read the same chat documents during a rollout, and
  the previous release treats that field as strictly on/off — a timestamp in
  it would have blanked the whole inbox on any phone that had not updated
  yet, not merely broken the indicator. The old flag is still written for one
  release so those phones keep working.

**Why:** The feature was unreliable in both directions — stuck on when it
should have been off, absent when it should have been on — and the two
complaints turned out to have different causes. The underlying design made
stuck state easy to reach: a plain on/off flag can only be cleared by the
device that set it, so every way of leaving a chat without tidying up was a
way to strand it. It is now a timestamp that expires on its own, which makes
the whole class of problem unreachable rather than merely less likely.

**Status:** Merged to `main` in #132 on 2026-08-25; the branch has been
deleted. Not yet released — the rules note below still applies.

**Next steps**

- Verify on two real devices before merging — the automated tests cover the
  timing rules and the screen's teardown, but not a genuine round trip
  through Firestore.
- Deploy the Firestore rules before releasing the app, not after. The new
  field is rejected by the current rules, so a client that ships first cannot
  write a heartbeat at all.
- Once the previous release is out of circulation, delete the legacy
  `typingStatus` field and the writes that feed it. Small, but it will not
  happen on its own — worth its own ticket.
- The tightened Firestore rule is syntax-checked only. The repo has no
  harness for testing rule behaviour, so nothing asserts that a participant
  is actually blocked from writing another participant's key.
- Nothing guards the service's raw write map against a timestamp being put
  back into the legacy field. `ChatService` builds it untyped and talks to
  `FirebaseFirestore.instance` directly, so covering it needs either a
  Firestore fake or making the service injectable.

---

## 2026-08-25 — Notification hardening is fully deployed

**What changed**
- The production Functions deploy for #118, #119, #120 and #121 (the
  notification ledger, dead-device pruning, event layer, and mobile
  unenrol fan-out fix) completed successfully on 2026-08-24.
- The `notifications` composite index — blocked on its first deploy attempt
  because the indexes pipeline had no mechanism to let a genuinely new index
  through, fixed in #123 — deployed to production on 2026-08-25.
- Closed the `notifications` entry in
  `backend/firebase/inventory/pending-index-deployment-exceptions.json` back
  to empty now that the index is confirmed live, matching the pattern #53 set
  for Functions.

**Why:** The three notification PRs merged on 2026-08-23 but the entries
below still read "in progress, not yet merged" — the actual production
deploy had failed once (at Indexes, before #123) and needed a second,
successful dispatch. This entry closes that gap and corrects those statuses.

**Status:** Live. Functions and the new index are both confirmed deployed to
`tenacity-tutoring-b8eb2`.

---

## 2026-08-23 — Notifications can now be sent by naming what happened

**What changed**
- Added a small event layer: code that changes something says *what happened*
  (`student.unenrolled`, `student.enrolled`) and one dispatcher turns that into
  exactly one notification. Until now every notification was inferred by
  watching for database changes, which is why one action could produce twenty
  alerts — a change-watcher cannot tell one person's decision from the twenty
  records it touches.
- Used it for the first real case: admins now get **one deliberate
  notification when a student is unenrolled**. Previously they got that news
  only as a side effect of the bug fixed in the entry above, so removing the
  bug would otherwise have left them with nothing.
- Deleted the last 566 lines of dead notification code — the two abandoned
  files from the original event experiment. Their notification wording was
  kept; their duplicate, uncached copies of shared helpers were not. That
  completes the 2,784 lines removed over these three changes.
- Dispatch happens in the same function that made the change, rather than
  through a Pub/Sub queue as the abandoned experiment did. The queue would have
  meant a new dependency, a topic to create, two more deployed functions and —
  since there is no local emulator for it — a part of the system with no test
  coverage, in exchange for decoupling nothing here needs.

**Why:** Backlog item 20, and the notification gap left by the unenrol fix.

**Status:** Merged and live. 945 unit tests and 156 emulator tests passed
pre-merge; deployed to production Functions on 2026-08-24.

**Next steps**
- **The change-watching alerts have not been switched off yet.** The plan was
  to retire the two attendance and enrolment watchers in this change, but doing
  so turned out to reach further than expected: nothing else reads the
  suppression markers those watchers depend on, so retiring them orphans that
  whole mechanism across five files and invalidates ten existing tests written
  against it. Left running and unchanged rather than half-removed. See backlog
  item 20 for what finishing it involves.

## 2026-08-23 — Unenrolling a student no longer sends admins twenty notifications

**What changed**
- Fully unenrolling a student from the mobile app sent admins one "Student
  Absent" push for every remaining week of every class the student was in —
  around twenty for a single action. Removed the cause: after asking the
  backend to unenrol the student from a class, the app then looped over that
  same class's future sessions and removed the student again itself.
- That second pass was redundant. The backend call it had just awaited already
  clears the student from every future session, and marks each of those writes
  as one bulk change so the admin alert fires once rather than per week. The
  app's own pass carried no such marking, so every write looked like a
  separate absence.

**Why:** This is the same defect as the class-swap storm fixed on 21 August, on
a path that fix could not reach — it lives in the app rather than the backend,
so no server-side change could have covered it. Found while auditing what still
depended on the admin alert before restructuring it.

**Status:** Merged. Reaches users only with the next app release, since mobile
ships by manual build. Full mobile suite passes (1,086 tests), analyzer clean.

**Next steps**
- No automated regression test. `AuthService` builds its own Firestore handle
  as a field rather than receiving one, and the mobile test setup has no
  Firestore fake, so this path cannot be driven from a test without either
  adding a fake dependency or making the service injectable. Worth doing when
  something else touches that service; roughly half a day.
- Admins now get no notification at all when a student is unenrolled, because
  the twenty were accidental and there was never an intentional one. A single
  deliberate alert is part of the event-layer work in backlog item 20.

## 2026-08-23 — Every notification is now recorded, and dead devices are cleaned up

**What changed**
- Added a `notifications` collection in the database. Every push the system
  sends now writes a row saying who it was for, what it said, where tapping it
  should go, and how many of that person's devices actually received it. Until
  now a push was completely untraceable once handed to Google: nothing recorded
  that it was sent, and nothing could show a parent what they were told last
  week.
- Routed all fourteen notification senders through one shared send path, so
  sending and recording cannot drift apart. Previously each one hand-rolled the
  same call and threw the result away.
- **Dead device tokens are now removed.** When Google reports that a device is
  no longer registered — the app was uninstalled, or the token was rotated —
  that device is deleted from the user's record. Before, dead tokens
  accumulated forever, every later notification re-attempted them, and the
  failure counts never returned to zero, which made a real delivery problem
  indistinguishable from years of accumulated litter. Only permanent errors
  prune; a temporary outage leaves devices alone.
- **Finished the error isolation started in August.** The two admin attendance
  triggers already sent each notification inside its own error boundary. Every
  other sender — announcements, chat, feedback, all three invoice paths, the
  daily reminders, waitlist, permanent-spot, and the payment reconciliation
  alert — now does too, so one bad device can no longer fail a whole handler
  and cause a retry that re-sends what already went out.
- Records survive retries. Each row's identity is derived from the action that
  caused it, so a platform retry updates its own row rather than adding a
  duplicate — including the case where one action legitimately sends several
  different notifications to the same person.
- Rules let a recipient read their own notifications and mark them read, and
  let admins read all. No client can create, delete, or rewrite one; the
  record is what the server actually sent. Added the one database index an
  inbox will need, and a six-month expiry field on every row so retention can
  be switched on later without a backfill.

**Why:** Backlog items 20 and 21. Two related gaps: notifications were
fire-and-forget with no record, and the error-isolation work done for the
August fan-out fix only covered two of the fourteen senders. Both needed
touching every sender, so they were done together. This is also the groundwork
for a notifications inbox in the app and portals.

**Status:** Merged and live. Deployed to production Functions on 2026-08-24;
the `notifications` composite index (blocked by the indexes-pipeline gap
fixed in #123) deployed to production on 2026-08-25. No user-visible change
yet; nothing reads the new collection. 937 unit tests and 156 emulator tests
pass (up from 921 and 151), 31 rules tests pass.

**Next steps**
- Apply the Firestore TTL policy on `notifications.expiresAt`. It is a console
  or `gcloud` operation the deploy pipeline only compares against, so it has
  to be done out of band and recorded in `docs/operations`. Minutes.
- Six of the eight notification domains still infer intent from a database
  diff rather than being told what happened; backlog item 20 covers moving
  attendance and enrolment across first.

---

## 2026-08-22 — Deleted the dead duplicate notification code

**What changed**
- Deleted six unreachable notification files from the Cloud Functions package
  (2,218 lines): the five pre-split superset modules left behind by an earlier
  refactor, plus `lib/notifications.js` — 1,114 lines that nothing has loaded
  since the split, because the entry point requires the `notifications/`
  directory and Node resolves that to the directory, never to the sibling file.
- Between them they redefined eleven currently deployed triggers under the same
  export names as the live versions. Nothing imported them, so they were inert
  — but a single added line in the barrel file would have silently replaced
  live notification handlers with stale copies.
- Deleted the 36 remaining `.js.map` files and the now-dangling
  `//# sourceMappingURL=` comment at the foot of each source file. These were
  left over from a TypeScript build that no longer exists; they pointed at
  `.ts` files that are not in the repository and had not been regenerated
  since the Phase 2 import. The same cleanup was already done for
  `stripe_webhooks.js.map` when that module was retired.
- Corrected three documentation pointers that named the dead
  `invoice_notifications.js` instead of the live `invoices.js` — two in the
  mobile V3 redesign roadmap, one in a Dart source comment. The roadmap entry
  records a product constraint about how the next reminder date is derived, so
  anyone following it would have read the wrong file.

**Why:** The duplicate tree was a standing hazard rather than a live bug, and
it made the notification layer roughly twice as large as it actually is when
read cold. Clearing it first means the event-driven work that follows starts
from a package where every file on disk is a file that runs.

**Status:** In progress — branch `chore/remove-dead-notification-code`, not yet
merged. Pure deletion, no behaviour change: the Functions entry point exports
the same 92 names before and after, the inventory check still reports 89
managed endpoints, and the full suites pass (921 unit, 151 emulator).

**Next steps**
- Two follow-ups from the same audit, in order: a durable `notifications`
  record plus the per-recipient hardening the August fan-out fix did not cover,
  then moving attendance and enrolment notifications onto explicit business
  events. Both are tracked in Open items / backlog.

---

## 2026-08-21 — Stopped a class swap firing twenty admin notifications

**What changed**
- Moving a student to a different class permanently sent admins roughly twenty
  push notifications instead of one. The swap writes to every remaining week's
  attendance record, and each of those writes independently triggered the
  admin notification handler. The existing suppression marker was extended with
  a `bulk_attendance_sync` type so a loop that touches many weeks for one human
  action declares itself and no longer re-triggers per week.
- Covered every path with the same shape, not just the swap: permanent
  enrol and unenrol, waitlist promotion, enrolment acceptance, student
  deletion, and the admin portal's roster overwrite.
- Hardened the two admin notification handlers. Admin device tokens are now
  fetched once and cached briefly, with concurrent lookups sharing a single
  query rather than each re-reading every admin's tokens. Each notification is
  sent inside its own error boundary, so one bad device token can no longer
  fail the whole handler — which previously caused the platform to retry it and
  re-send every notification that had already gone out.
- Added regression coverage asserting exactly one notification per logical
  action, and that an ordinary single change still notifies.

**Why:** [PR #111](https://github.com/tsowmi03/tenacity-platform/pull/111). A
routine admin action buried admins in duplicate alerts, which trains people to
ignore notifications generally.

**Status:** Merged and deployed. Recorded here after the fact — the work
merged on 21 August without a log entry, and was visible only inside the
backlog items it generated.

---

## 2026-08-20 — Chat messages could revert to the compose box or send twice (MOB-21)

**What changed**
- Backend: `sendChatMessage` (Cloud Function) commits the message in a
  Firestore transaction, then calls `sendChatMessageNotification` to push FCM
  alerts. That notification step has two Firestore reads (the sender's
  display name, recipient token lookup) that weren't wrapped in try/catch,
  and nothing in `sendChatMessage` caught around the call either — so a
  transient read failure there threw the whole callable back to the client as
  a failure, even though the message had already been durably written.
  Wrapped the notification call in its own catch so a failure there can never
  surface as a send failure.
- Client (Flutter): the send button had no `_isSending`-based disabled state
  (unlike the neighbouring "+" attachment button), and `_sendMessages()`
  didn't set `_isSending = true` until after an `await` on the connectivity
  check — a real async gap a double-tap could land in. Moved the flag-set
  ahead of that await and disabled the button while a send is in flight.
- Added a widget test that double-taps send while a message is in flight and
  asserts only one `sendMessage` call goes out; confirmed it fails against
  the pre-fix code.

**Why:** [MOB-21](https://tenacitytutoring.atlassian.net/browse/MOB-21) — a
tutor reported a message flashing onto the screen then reverting back into
the compose box unsent, and occasional double-sends. Both symptoms traced to
one root cause on the client (any exception is treated as "unsent, restore
the text") meeting a backend path that could throw *after* the message was
already saved.

**Status:** Merged via [PR #109](https://github.com/tsowmi03/tenacity-platform/pull/109).
Not yet deployed to production.

## 2026-08-20 — Booklets dropped multiple-choice options and collapsed dot points (RES-16)

**What changed**
- Maths multiple-choice was structurally impossible outside diagnostic tests.
  When [AWP-15](#2026-08-15--maths-resources-are-now-generated-against-a-fixed-schema-too)
  constrained resource generation to a JSON schema, `type`/`options` were only
  added to `diagnosticTestSchema()`; the shared `questionSchema()` used by
  worksheet, practice-paper, mixed-review, and topic-booklet questions had
  neither field, so the model could never emit MC options for those types.
  Added the same fields to `questionSchema()` and `questionPartSchemaFor()`
  (and mirrored them into the prompt text), reusing the existing
  `diagnosticTypeEnum` logic as a shared `questionTypeEnum()`.
- That alone wasn't enough for worksheets specifically: `builder/worksheet.js`
  had its own copy of `renderQuestion()` that predated the shared one in
  `builder/common.js` and never called `multipleChoiceOptions()` at all, so
  even a question that did carry `options` would render with no lettered
  choices. Deleted the duplicate and pointed worksheet builds at the shared
  `renderQuestion`.
- English dot points were a separate rendering bug, not a schema gap. A
  question stem or annotation-task instruction is one string field; when the
  model wrote an intro line followed by `- point one\n- point two`,
  `renderStemBlocks()` always ran the *entire* first text block through
  `makeQuestionParagraph()`, which joins on newlines and never checks for
  list markers — so the dot points rendered as one run-on line with literal
  dashes instead of bullets. `annotationTask.js` had the same problem in a
  more direct form, calling `makeQuestionParagraph()` on the raw instruction
  text with no list-aware path at all. Added `renderLeadParagraph()` (shared
  from `builder/common.js`) that keeps the first line on the numbered/labelled
  paragraph but runs every line after it through the same `parseListMarker`
  check `makeParagraphs()` already uses, and pointed both call sites at it.
- A third occurrence of the same defect turned up while running mock JSON
  through the worksheet builder to inspect the fix directly: every
  answers/marking-guide table (`makeAnswerTable`, `makeMarkingGuide`,
  `makeQuestionMarkingGuide`, and anything else going through the shared
  `makeTable()`) split a cell's text on newlines correctly but rendered each
  line with a plain `paragraph()`, so a marking guide's `suggestedResponse`
  with embedded dot points kept its literal `- ` markers instead of becoming
  bullets. `makeTable()`'s cell-building loop now checks `parseListMarker()`
  per line the same way `makeParagraphs()` does.
- Added a schema-level test asserting non-diagnostic question types accept
  `options` the same way diagnostic tests do, a worksheet DOCX render test
  asserting MC options actually appear as `A. / B.` lines, and an English
  formatting render test asserting embedded dot points in a stem, task
  instruction, and marking-guide table cell all render as bullets rather than
  a literal dashed run-on line.

**Why:** [RES-16](https://tenacitytutoring.atlassian.net/browse/RES-16) —
English resources don't handle dot points well, maths resources don't handle
multiple choice.

**Status:** Live. Merged via [PR #105](https://github.com/tsowmi03/tenacity-platform/pull/105)
and deployed to production Functions (`58060889f253a5270ef6f16eb5b90ebc461e2520`).

## 2026-08-20 — Portal Hosting smoke test had no room for propagation lag

**What changed**
- The production deploy of [PR #101](https://github.com/tsowmi03/tenacity-platform/pull/101)
  (blocks + inline preview editing) shipped Functions cleanly but failed on
  Admin Hosting: `firebase hosting:channel:deploy` returned success, and the
  very next `curl --fail` against that channel's preview URL got a 404 on one
  of the three smoke paths. Re-running the same request by hand moments later
  returned 200 on all three — the channel's edge network had not finished
  propagating yet, and the smoke test made exactly one attempt with no room
  for that.
- Because the smoke test runs before promotion, this failed closed: the job
  stopped there and production Admin Hosting was never touched, still serving
  the pre-merge build. No live impact, just a deploy that did not finish.
- Both smoke-test steps in `firebase-hosting-production.yml` — the preview
  channel check before promotion and the live-origin check after it — now
  retry up to five times, five seconds apart, before failing the job. The
  live check gets the same treatment on the theory that the custom domain's
  own DNS/CDN layer can lag the same way.
- Deployed the pending Admin Hosting surface on its own once this landed,
  targeting the original `bce1c2e` commit directly via
  `firebase-hosting-production.yml`'s standalone dispatch, rather than
  re-running the orchestrator (which would have redeployed Functions
  unnecessarily).

**Why:** A transient one-shot smoke test turns an infra hiccup into a failed
production deploy that then needs a human to notice, diagnose and re-dispatch
by hand — exactly what happened here.

**Status:** Merged. Not fixed elsewhere: `firebase-hosting-rollback-production.yml`
and `vercel-production.yml` have the same unguarded `curl --fail` shape and
were left alone, out of scope for this incident.

## 2026-08-20 — Every toast on the weekly update page was throwing instead of showing

**What changed**
- `WeeklyUpdateComposePage` called `toast.push(tone, title, message)` at every
  save, send, test-send and delete. `useToast()` has never exposed a `push`
  method — only `success` / `error` / `warn` / `info` / `persistent` — so each
  of those calls threw `toast.push is not a function` instead of notifying
  anything. Saving, sending a test, sending for real and deleting a draft have
  had no success or failure toast since the page shipped in
  [PR #61](https://github.com/tsowmi03/tenacity-platform/pull/61).
- Fixed by calling the right method on each path, including the one call that
  picked its tone at runtime (test-send reports success or a warning depending
  on the result).
- Added tests against the real `ToastProvider` — not a mock — for save, a
  failed save, test-send and delete, specifically so a regression throws again
  rather than passing silently.

**Why:** Found because CI failed on unrelated work: two new tests for
[inline preview editing](#2026-08-20--the-weekly-update-is-edited-in-its-own-preview)
clicked Save draft and triggered `handleSave`, which is when this first threw
inside a test. Nothing before that had exercised save, send or delete against
the real provider — the existing tests either mocked the API layer without
asserting a toast, or never reached these handlers at all.

**Status:** Merged. No user-facing behaviour changed apart from the toasts now
appearing; the underlying save/send/delete calls were already succeeding, they
just never confirmed or explained failure.

## 2026-08-20 — The weekly update is edited in its own preview

**What changed**
- Copy in the weekly-update preview is now editable where it sits. Click a
  paragraph, heading, button label, link label or signature and type; the edit
  lands in the same draft state the fields below write to, so the field updates
  as you type and Save sends what you are looking at.
- No second renderer was added, which was the thing worth avoiding. The renderer
  tags editable regions with `data-tw-block` / `data-tw-field` / `data-tw-kind`
  under an `annotate` flag that only the preview callable passes, and the
  composer reaches into the frame and makes those regions editable. The preview
  and the send are the same render differing by attributes only — asserted by
  stripping the attributes and comparing the two renders string-for-string, and
  by asserting a real send carries no `data-tw-` at all.
- The frame gained `sandbox="allow-same-origin"`, which is what lets the portal
  reach in. `allow-scripts` stays off, so nothing inside the frame can act on
  the relaxed origin; forms, popups and top-level navigation stay off too.
- Typing deliberately does not re-render. The browser is already showing the new
  text, so a round-trip would only throw the caret away. Structural changes —
  add, reorder, remove — still go through the block list and a refresh.
- Reading an edit back out is `richTextFromDom`, the inverse of the renderer's
  rich-text layer. It is pinned to the renderer by a fixture file both test
  suites read from opposite directions: the Functions suite asserts source
  renders to that HTML, the portal suite asserts that HTML reads back as that
  source. Changing one side alone fails in the other.
- Paste is forced to plain text and drops are refused, because most pasted markup
  has no representation in the stored model — it would be dropped on the next
  read, so the paste would appear to work and then undo itself. Where a browser
  nests marks (bolding a selection that already holds a link), the outermost one
  wins; `[**x**](url)` would otherwise read back as a link labelled `**x**`.
- Announcement title and body render in the preview but are owned by the
  announcement, so they are marked borrowed rather than made editable, and say
  why on hover instead of accepting an edit that would vanish.
- Two things surfaced while wiring this up. The banner headline was editable in
  the preview but `masthead.title` was not in the save whitelist, so the edit
  would have been dropped at the last step with nothing on screen to say so; it
  is now stored, and the composer gained a Banner headline field so an override
  can be cleared to follow the subject again. Separately, the email leaves out a
  block with nothing in it, so a block could sit in the list and be absent from
  the preview — the preview now names which ones and why.

**Why:** The preview was the one place showing the email as parents get it, and
the only place you could not change it. Every edit meant finding the matching
field in a list below and holding the mapping in your head.

**Status:** Merged. 901 Functions tests and 249 portal tests pass, including the
round-trip fixtures, the annotation contract, the mapping from an edited region
to a draft field, and an inline edit reaching the save payload as Markdown.

**Not verified in a browser yet:** jsdom does not parse `srcdoc` — it hands back
an empty document — so the tests write the markup into the frame and dispatch the
load event themselves. Everything either side of that is real, but the browser
behaviour this depends on is not covered: that `contentEditable` works inside a
frame sandboxed with `allow-same-origin` and no `allow-scripts`, and that
listeners attached from the parent document fire for edits inside it. Worth ten
minutes in Chrome and Safari before this is relied on. The production build was
not run to completion either, for the same `vite-plugin-pwa` service-worker
reason as the previous entry; the app bundle itself builds.

## 2026-08-20 — The weekly parent email is built from blocks

**What changed**
- The draft's three fixed slots (`intro`, `announcementIds`, `sections`, always
  rendered in that order) are replaced by an ordered `blocks` array. Nine block
  types: text in three styles, announcement, heading, callout in three tones,
  button, link list, signature, divider and spacer. Each block can be moved,
  duplicated or removed, so a note can now sit after an announcement.
- Bodies take a Markdown subset — `**bold**`, `*italic*`, `[label](url)` and
  `- bullets`. Until now a weekly email could not contain a clickable link at
  all, which is a strange gap in a parent comms channel.
- The copy that was hardcoded in the renderer is now editable: the masthead
  label, both group headings, and the whole closing panel including an optional
  button. Clearing every closing-panel field drops the panel.
- Added a real preview-text field. It used to be derived from the first thing
  with copy in it, and it is the highest-leverage line in the inbox.
- Bodies are stored as the Markdown source, not a parsed tree: a bullet list is
  an array of items each holding an array of spans, and Firestore rejects nested
  arrays. Parsing happens at render time, which is also why plain text — every
  existing draft and every announcement body — renders unchanged.
- URLs are restricted to `http`, `https` and `mailto` in the composer and again
  in the renderer. A rejected URL renders unlinked rather than vanishing, so the
  mistake shows up in the preview, and the send is blocked with a message naming
  the block.
- Pre-block drafts convert to blocks on read, not by a backfill, and a test
  asserts the converted blocks render byte-identically to the old layout — an
  update that has already been sent has to read back as the email that went out.
  Saving is what writes `blocks` and retires `intro` and `sections`;
  `announcementIds` stays as a derived mirror because the reporting views and
  digest helpers key off it.

**Why:** The email was customisable only in the sense that you could type into
three boxes. Order was fixed, half the wording was in code, and there was no way
to add a link, a button or anything that was not an announcement.

**Two behaviour changes on existing content:** an announcement body with lines
starting `- ` now renders as a real bullet list instead of literal hyphens, and
the plain-text part of a converted draft gains the "In this week's update"
heading line the HTML always had.

**Status:** Merged. 885 Functions tests and 210 portal tests pass, including new
coverage for the rich-text parser, every block renderer, the legacy parity, URL
rejection and the composer's reorder/add/remove. No Firestore rules change was
needed — `parentEmailBlasts` is admin-only with no field whitelist. The
production build was not run: it fails in the `vite-plugin-pwa` service-worker
step under a sandboxed shell, unrelated to this work.

**Next steps:** Editing directly in the preview. That needs the renderer
extracted into a module both the Vite app and the Functions runtime import, so
the browser can render as you type, plus a fixture test asserting the client and
server renders are identical so they cannot drift. The block model, rich-text
layer and URL validation are already shared-ready.

## 2026-08-19 — Admin portal installs as a mobile web app

**What changed**
- The admin portal can now be added to a phone's home screen and launches
  full-screen with its own icon, no browser chrome. Added a web manifest, a
  service worker (via `vite-plugin-pwa`), the icon set generated from the
  existing favicon, and the iOS/Android meta tags.
- The service worker asks before updating rather than reloading on its own. A
  deploy that landed mid-form would otherwise have discarded a half-written
  invoice, so a waiting update now surfaces as a toast with a Reload action.
- Added a bottom tab bar on phone-sized screens — Dashboard, Enrolments,
  People, Classes, and a More button that opens the existing navigation
  drawer. The topbar hamburger was removed; More replaces it. The bar is a
  grid row rather than a floating element, so page content ends above it
  instead of scrolling underneath.
- Data tables now render as cards below 760px instead of scrolling sideways.
  This is one change in the shared `Table` component, so all 14 live list
  screens get it. Columns can be annotated `mobile: "title" | "subtitle" |
  "meta" | "hide"`; unannotated tables fall back to sensible defaults, and
  sorting becomes a select above the list.
- Form controls are 44px tall and 16px on mobile. The 16px matters: below it,
  iOS Safari zooms the whole page every time a field is focused.
- Collapsed the page-specific grids that never got a mobile breakpoint, and
  fixed a pre-existing bug where tables in a `.card-body.flush` overhung their
  card border by 16px each side.
- Added `Cache-Control: no-cache` for `/sw.js` and `/manifest.webmanifest` in
  `firebase.json`. Firebase's default hour-long cache on a service worker is
  the classic way to strand users on a stale build.

**Why:** The portal was usable from a phone only in the sense that it loaded.
Every list screen scrolled sideways, every tap on a text field zoomed the page,
and navigation meant reaching for a hamburger in the top corner.

**Status:** In progress — branch `feat/admin-portal-mobile-pwa`, not yet
merged. Full vitest suite passes (178 tests, 10 of them new coverage for the
card rendering) and the production build emits the manifest, service worker
and icons. Verified in the browser at 320px and 375px: no horizontal scroll,
cards render, the tab bar clears the content, the drawer opens from More, and
`/terms.html` and `/reset_password.html` still serve their own pages through
an active service worker — including the password-reset link with its query
string, which the deploy smoke test does not cover.

**Next steps**
- Verify on a real iPhone via `firebase hosting:channel:deploy mobile-preview
  --only admin-portal`. Installability, the status bar under the notch, the
  home-indicator gap and iOS focus-zoom can only be confirmed on device, and
  service workers need real HTTPS. ~30 minutes.

---

## 2026-08-19 — Notified absences now reach the tutor and admin screens

**What changed**

- When a parent notified an absence, the child was removed from that week's
  bookings but every tutor and admin screen added them straight back. One
  shared helper decided who was expected at a session, and it merged the
  permanent class list over the week's bookings, so removals had no effect.
  It now uses the week's bookings when they exist, falling back to the
  permanent list only for a week that has not been generated yet.
- This fixes seven screens at once, not just the roll the bug was reported
  against: the tutor's class list count and roll pill, the admin's class list
  and dashboard counts, and the roll screen itself for both roles.
- Two knock-on effects went with it. A session could never count as fully
  marked, because the absent child could not be marked, so it sat in "needs
  action" forever — and the tutor's "feedback due" prompt, which only appears
  once a roll is complete, never appeared at all for that class.
- The admin's class list also read a class as FULL when an absence had freed
  a seat, while the parent's own booking screen correctly offered it.
- The admin "Edit students" sheet now labels a permanently enrolled child who
  is not booked this week as "Permanent · Not this week", rather than showing
  them identically to everyone attending.

**Why:** MOB-23. A parent was told their absence had been recorded, the lesson
token was awarded, and then the tutor's roll still listed the child as though
nothing had happened.

**Status:** In progress — implemented on `MOB-23-absence-roster`, full mobile
suite green (1084 tests), not yet reviewed or merged.

**Next steps**

- Two pre-existing backend problems found while tracing this, each worth its
  own ticket: the class-update propagation path overwrites a week's bookings
  with the permanent list, wiping recorded absences and one-off visitors; and
  the admin portal's Edit-class screen can leave the two lists diverged on
  purpose via its propagation toggle.

---

## 2026-08-18 — Mobile release 3.0.1 (build 513)

**What changed**
- Bumped the mobile app from `3.0.0+512` to `3.0.1+513` in `apps/mobile/pubspec.yaml`.
  Both platforms read their version from this one line, so nothing else needed editing.
- Built the production Android release bundle
  (`build/app/outputs/bundle/prodRelease/app-prod-release.aab`, 60MB).
- Built the production iOS archive at `build/ios/archive/Runner.xcarchive`,
  confirmed carrying 3.0.1 / build 513.
- Exported and uploaded the iOS build to App Store Connect. Plain
  `flutter build ipa` failed at export ("No signing certificate 'iOS
  Distribution' found", "No Accounts") because the distribution signing
  assets are Xcode-managed and live in the data-protection keychain, which a
  non-interactive `xcodebuild` can't reach — the certificate and provisioning
  profile are otherwise fine. Worked around it with an App Store Connect API
  key (`~/.appstoreconnect/private_keys/`) and
  `xcodebuild -exportArchive -allowProvisioningUpdates
  -authenticationKeyPath/-authenticationKeyID/-authenticationKeyIssuerID`,
  with `destination: upload` in the export options plist so export and
  upload happen in one step. (Correction, 2026-08-26: on the 3.0.2 release
  this was mistaken for evidence the certificate itself was missing — it
  wasn't. Xcode Organizer, run interactively, reaches the same keychain
  without needing the API key at all; see that entry.)

**Why:** Ships the work landed since 3.0.0 — tutors correcting sent feedback
(MOB-19), the chat controller surviving auth notifications (MOB-20), tutors
editing a past resource before regenerating it (AWP-18), and the resource
history heading fix.

**Status:** iOS build 513 uploaded to App Store Connect and processing.
Android bundle is built but **not yet uploaded** to Play Console. Apple also
warned on upload that this app's `MinimumOSVersion` (12.0) needs to reach iOS
13.0 later this year and iOS 15.0 by Spring 2027, or future uploads will be
rejected — not blocking yet, but worth scheduling.

**Next steps**
- Upload `build/app/outputs/bundle/prodRelease/app-prod-release.aab` to Play
  Console (production or a testing track), a few minutes.
- Raise `IPHONEOS_DEPLOYMENT_TARGET` before the iOS 13.0 cutoff later this
  year.

---

## 2026-08-18 — Resource history rows no longer squash the heading

**What changed**
- History and live-queue rows in the resource generator are now stacked: the
  student name and resource type get the full width of the row, the status
  badge sits at the top right, and the actions moved to their own line
  underneath.
- Trimmed the visible action set. **Details** and the primary action (.docx,
  Retry, or Stop) keep their labels; Preview, Edit, Regenerate, and Delete are
  now icon buttons with tooltips. All four are still available with full labels
  from the generation details panel.
- Dropped the old rule that only stacked these rows below a 760px window. It
  never fired in practice, because the queue sits in a column that is narrow
  long before the browser window is.

**Why:** A ready history row carried a badge plus six buttons, and the action
cluster was not allowed to shrink — so the text absorbed all of the lost width
and student names wrapped one word per line.

**Status:** In progress. On `fix/resource-history-row-layout`, not yet merged.
All 90 resource-portal tests pass unchanged, since the icon buttons kept the
same accessible names as the labelled ones they replaced.

---

## 2026-08-18 — Tutors can edit a past resource before generating it again

**What changed**
- Resource history rows now offer **Edit** alongside Retry and Regenerate. It
  loads that resource's inputs back into the builder — student, year, subject,
  resource type, answer mode, marks setting, prompt, and the reference files
  it was generated from — so anything can be changed before submitting.
- The same action is available from the generation details panel, which closes
  as the draft is loaded.
- The builder says where a loaded draft came from and offers "Start fresh" to
  drop it. Submitting creates a new generation; the original resource is never
  touched, and jobs already staged are left alone.
- Reference files carry over by their existing storage location, so editing a
  resource does not mean re-uploading its source material.
- The student field now shows the name recorded on the job when that student is
  no longer on the tutor's roster, instead of appearing blank.
- Editing is limited to the tutor who created the resource, or an admin — the
  same rule that already governs Retry and Regenerate.

**Why:** AWP-18. History only offered Retry (re-run the same job as-is) and
Regenerate (a new run with identical inputs). When a resource came back wrong
because the prompt or the answer mode was wrong, there was no way to correct it
short of rebuilding the whole request by hand.

**Status:** Merged and deployed to production.

---

## 2026-08-18 — Tutors can correct feedback after sending it

**What changed**
- Feedback on the roll stays editable after it has been saved. Until now the
  box turned into read-only text the moment the note went to the family, so a
  typo or a wrong name was permanent.
- The progress marker is editable for the same reason: a mis-tapped pill was
  just as stuck as a typo, and both are entered in the same breath.
- A correction updates the note the family already has rather than sending a
  second one. They keep one note per lesson, in its original place in the
  history, and get no second alert about a fixed typo.
- Families are told when a note has been changed. Their copy now reads
  `Edited · Yesterday` instead of silently showing different words to someone
  who had already read it.
- Feedback that has been sent cannot be emptied. Clearing the box and saving is
  refused with an explanation, rather than quietly keeping the old text and
  leaving the tutor thinking they had deleted something.
- Marking a student away no longer wipes a note the family already has. It
  still discards an unsent draft, which is what that behaviour was for.
- Fixed a pre-existing font error on the same screen, found while testing this.
  An empty feedback box asked for an upright serif the app does not carry — only
  the italic one is bundled, and runtime downloading is off — so marking a
  student present logged a font failure and dropped the box to the default
  typeface. The box now uses the italic serif that feedback is shown in
  everywhere else. It styles typed text only, so nothing looks different.

**Why:** MOB-19. Tutors write feedback in the minutes after a lesson and had no
way to fix anything afterwards — the only options were to leave the mistake or
ask an admin to go into the database.

**Status:** In progress on `feat/mob-19-edit-feedback-after-saving`, not merged.
1077 mobile tests pass (up from 1063), the analyzer is clean and the formatter
finds nothing. Not yet checked on a device against real data.

**Next steps**
- Try it on the phone before merging: edit a note on a real session, confirm the
  family's copy changes in place, shows `Edited`, and that no push arrives.
  Half an hour.

---

## 2026-08-18 — Messages vanished after leaving the inbox and coming back

**What changed**
- The chat controller is now kept for as long as the user is signed in, rather
  than being rebuilt from scratch every time the auth controller announced a
  change. Rebuilding it threw away the loaded conversations and the Firestore
  subscription, so an inbox that was already on screen came back empty.
- The controller is only reset when the signed-in user actually changes.
  Signing out now also stops it listening, which it never used to do.
- Loading the chat list no longer leaves the previous listener attached. Every
  reload used to add another one for the lifetime of the app.
- A failure on the chat stream is now handled: the inbox stops loading and says
  so, instead of the error escaping and the list spinning indefinitely.
- Regression tests cover the reported path — inbox loaded, something unrelated
  updates the signed-in user, conversations still there — plus the listener and
  sign-out behaviour.

**Why:** MOB-20. Anything that touched the user record while the app was open —
opening an announcement marks it read, and a token refresh rewrites the user —
emptied the inbox. It looked like a navigation bug because the tab shell keeps
visited screens alive (see the 2026-08-04 entry below), so the inbox never
reloaded itself on the way back and had nothing left to show.

**Status:** Merged. Ships with the next mobile release.

---

## 2026-08-17 — What the admin console calls "needs action"

**What changed**
- One-off bookings moved out of `NEEDS ACTION` into their own `FOR INFORMATION`
  section. They used to sit under the action heading carrying the subtitle
  `Already booked · no action needed`, directly under a metric reading
  `0 need action` — three things on one screen disagreeing about whether there
  was anything to do.
- The `need action` number and the list beneath it are now the same thing by
  construction: the count is non-zero exactly when the section has rows.
- The one-off row opens a list of who booked, into which class, and when. It
  used to drop the admin on the timetable to work that out for themselves.
  Repeat bookings by the same student are listed separately, on purpose.
- A finished session with no roll is still shown in red, but a class that has
  not started yet is not. At 1pm the console was painting four classes due at
  4, 5, 6 and 7pm as failures.
- `Open` on an outstanding roll now takes the admin to that day of the
  timetable, rather than switching to the Classes tab on whichever day it
  happened to be showing. Tapping a session row opens that session's roll
  screen directly.
- A failed invoice or attendance read now says so and offers a retry, instead
  of being swallowed and rendering as `0 need action`.

**Why:** Reviewing a live admin screen, the header said nothing needed doing
while the section below it listed an item, and that item's own subtitle said no
action was needed. Pulling that thread found the rest: rules that disagreed with
the colours drawn from them, rows that pointed nowhere in particular, and reads
whose failure was indistinguishable from good news.

Outstanding rolls stay scoped to the displayed week. An unmarked roll from a
previous week is still not chased, which is a deliberate choice rather than an
oversight — chasing them meant reading every session of the term to date on
each dashboard load.

Two follow-on gaps surfaced by an automated PR review before merge, both in the
same "don't claim success we don't have" vein as the read-failure fix above:
`loadActiveTerm`/`loadAllClasses` now report success or failure like
`loadAttendanceForWeek` already did, so a failed term lookup is no longer
indistinguishable from a genuinely termless period; and a superseded
attendance load (two refreshes racing) now defers to whatever the request
that replaced it actually reported, instead of unconditionally claiming
success for data it never saw.

**Status:** Merged to `main` via [#85](https://github.com/tsowmi03/tenacity-platform/pull/85)
(MOB-17). Full mobile suite passes (1048 tests). Not yet checked on a device
as a real admin.

**Next steps**
- Visual acceptance on device, as with the other V3 admin screens.

---

## 2026-08-17 — Admin timetable gained a week view and its class lists

**What changed**
- The admin timetable header now carries the same week pager and Monday-to-
  Sunday day strip that parents and tutors already had. It names the week —
  `Week 1 · 13 – 19 Jul` — which it never did before, and marks the days that
  have classes so the shape of the week is visible without paging through it.
- The arrows now move a week at a time rather than a day. The day is chosen
  from the strip instead.
- A class row can be opened to list the students in it, without leaving the
  timetable. Standing students come first, then anyone visiting that week, each
  alphabetical — the same order the enrolments editor uses.
- Tapping the row itself still opens the class options it always did. Looking
  at who is in a class and changing it are separate taps.
- Each student is listed with their year and subject, not just their name. The
  same detail was added to the enrolments editor and to the picker used to add
  a student to a class — that picker previously showed a bare `9` for a Year 9
  student and named no subject at all.

**Why:** Seeing who was in a class meant tapping the row, choosing Enrolments,
and waiting for a fetch per student — a long way round for a question an admin
asks constantly. The week number was not shown anywhere on the screen, and
paging a day at a time made it slow to look across a week. Names on their own
also do not answer much in the `Years 5–10` classes, which are most of them: one
room holds six year groups doing either maths or english.

**Status:** Merged to `main`. Full mobile suite passes (1026 tests). Not yet
checked on a device as a real admin.

**Next steps**
- Visual acceptance on device, as with the other V3 admin screens.

---

## 2026-08-17 — Loading screens now show the shape of what is coming

**What changed**
- Ten screens showed a spinner in the middle of an otherwise blank screen while
  their first load ran: all three dashboards, the home shell, the timetable
  (both the main view and the one-off browse), admin billing, announcement
  detail, and a chat thread. Each now draws the outline of the screen it is
  about to become — the navy header, the tiles, the rows — in flat grey
  placeholder blocks.
- The placeholders reuse the existing skeleton block that the invoices and
  messages screens already use, so the whole app now loads the same way.
- Added a set of shared skeleton layouts, one per screen shape: dashboard,
  timetable, billing, list, article and message thread. A screen picks the one
  matching its shape rather than describing its placeholders inline.
- Placeholders on the navy header needed their own colour — the existing one is
  a pale grey meant for the white sheet and read as a dark smudge up there.

**Why:** A centred spinner tells you something is happening but not what, and
the entire layout jumps into place when the data lands. Drawing the shape up
front means the screen only fills in, it does not rearrange.

**Status:** Merged to `main`. Spinners inside buttons — save, pay, sign out,
send — are unchanged; they mark an action in flight, not a screen loading.

**Next steps**
- The admin person screen dims itself behind a spinner while a save or delete
  runs. That is an action overlay rather than a loading state, so it was left
  alone, but it is the last centred spinner of its kind.

---

## 2026-08-16 — The messages screen no longer calls everyone "Unknown"

**What changed**
- Opening Messages briefly showed every conversation as "Unknown" before the
  real names arrived. A chat record stores participant ids, not names, so each
  name is a separate lookup — and until it came back the screen filled in
  "Unknown" as a placeholder. The inbox now shows a skeleton outline of the
  conversation rows while those lookups run, and only draws a row once it
  knows who it belongs to.
- "Unknown User" is still shown, but now only when it is true: the lookup
  failed, came back empty, or the conversation genuinely has no other
  participant. A failed lookup is also logged rather than silently swallowed.
- The unread count in the header is now read straight from the chat records.
  It was previously derived from the rendered rows, which meant it dropped to
  zero while names were loading, and searching the inbox appeared to clear
  unread messages.
- Name lookups are no longer fired twice for the same conversation, and names
  belonging to conversations that have since been deleted are discarded rather
  than written back to a screen that no longer lists them.

**Why:** Parents opening Messages saw a screen that looked like it had lost
track of who they were talking to. The names were only ever a few hundred
milliseconds away, so the fix is to say nothing until they arrive rather than
to guess.

**Status:** Merged to `main`. The skeleton matches the pattern already used by
the invoices screen.

---

## 2026-08-15 — Maths resources are now generated against a fixed schema too

**What changed**

- Maths resources now get the same guarantee English ones got: the AI's response
  is well-formed and in exactly the shape the document builder expects.
- Maths questions can carry a diagram, of which there are 41 kinds, and the AI
  service will not accept a description that large. So diagrams are now written
  in two stages: the resource is written first, with each question naming the
  kind of diagram it needs, and the diagrams themselves are built straight
  afterwards — one request per kind of diagram used, all running at once.
- 38 of the 41 diagram kinds are covered. The remaining three have shapes the
  service cannot be told about, so they are built the way they always were.
- A resource that needs no diagrams — most algebra and surds worksheets — costs
  no more than it did before, because the diagram stage simply does not run.
- Worked solutions are now enforced rather than requested: when a tutor asks for
  working, every answer must carry it.
- Fixed a diagram labelling problem found while testing: the AI was labelling a
  measured side with its own measurement ("80 cm" on a side already 80 long),
  which hides the number and overflowed the drawing. Labels are now for unknowns
  the student has to find.

**Why:** Completes the work started on English resources. Maths is where the
old repair path was most expensive, because a maths resource is the longest and
most structured thing we generate.

**Status:** Live in production since 2026-08-16 (commit 6ed86ae, deploy run
31931374731). 853 tests pass, plus the Functions emulator suite in CI. Verified
against the live service before release: all 41 diagram kinds checked one by
one, and every maths resource type generated end to end into a finished Word
document with its diagrams drawn.

- Generating every maths resource type end to end turned up three faults, all
  now fixed: topic booklet practice questions were coming back with no answers
  at all (only the quiz was answered); the booklet sometimes grew an extra
  sub-topic that was itself a quiz, duplicating the real one; and worked
  solutions were being requested but not required, so the working could come
  back empty. The last of those was hidden by the answer-checking step, which
  used to rewrite answers wholesale and quietly filled the working back in.
- The answer-checking step now returns only the corrections it wants to make,
  rather than rewriting every answer. Rewriting was discarding the labels that
  say which question an answer belongs to.

**Next steps**

- Generation time is worth watching. A worksheet with four kinds of diagram
  takes about 65 seconds against a nine-minute ceiling, and the heaviest case
  seen — a topic booklet — about 235 seconds. Diagram requests run in parallel,
  which took the worksheet down from 260 seconds.

---

## 2026-08-15 — Resources no longer invent their own reading texts

**What changed**

- English resources that present reading texts now only do so when the system has
  actually found real public-domain texts for them. Previously, if it decided a
  resource needed no reading texts — or found none — the AI was still invited to
  supply some, and would write its own, credited to "Tenacity Resources".
- Topic booklets no longer carry a reading stimulus at all. A booklet is teaching
  material rather than a comprehension task, and it already shows textual
  evidence through each sub-topic's model analysis (quote, technique, effect).
  This also removes a text-finding step from every booklet, so booklets are a
  little faster and cheaper.

**Why:** Tutors want teaching resources built on genuine texts, not AI-written
imitations of them. The system already had a step that decides whether a resource
needs reading texts and finds real ones — but its answer was never passed on to
the step that writes the resource, so a "no texts needed" verdict still ended up
producing invented ones. Two booklets generated during this work each came back
with two AI-written extracts nobody asked for.

**Status:** Live in production since 2026-08-16 (commit 6ed86ae). Verified
against the live service before release: a punctuation worksheet that needs no
reading text now produces none at all, and a topic booklet comes back with no
stimulus.

---

## 2026-08-15 — English resources are now generated against a fixed schema

**What changed**

- English teaching resources are now generated against a declared JSON schema, so
  the AI's response is guaranteed to be well-formed JSON in the exact shape the
  document builder expects. Previously we asked for JSON in the prompt and then
  cleaned up whatever came back.
- All nine resource types are covered. Eight are generated in a single request.
- The topic booklet needed a different approach: it is the largest of the nine,
  and the AI service refuses to enforce a shape that big. It is now written in
  two requests — the teaching content first, then the end-of-topic quiz and
  marking guide, which are given the finished content so the quiz covers what the
  booklet actually taught. The two halves are merged into one document, identical
  in structure to before. Booklets take roughly a minute longer as a result.
- Unknown fields are now rejected outright rather than silently ignored.
- The mark-scheme checking pass is constrained the same way.
- Removed three fields from the sample resources used in testing
  (`responseLines`, `workingLines`, `instructions`) that nothing has read for
  some time, and filled in fields the samples were missing. Confirmed the
  rendered documents are byte-for-byte identical either way.

**Why:** Resource generation carried a repair path for responses that were not
valid JSON — stripping code fences, a second more aggressive extractor, and a
follow-up call asking the AI to fix its own output. Each of those steps spends
money on a response that may still be thrown away. A declared schema removes that
failure entirely for English resources.

**Status:** Live in production since 2026-08-16 (commit 6ed86ae). Sample
documents render unchanged, and all nine types were checked against the live API
before release — four of them generated end to end into finished Word documents,
including a topic booklet through the new two-request path.

**Next steps**

- Maths resources are unchanged and still take the old path. Doing the same for
  maths turns out not to be possible the way the ticket assumed: maths questions
  can carry a diagram, of which there are 41 shapes, and the AI service will only
  accept about one of those shapes at a time — not 41. Measured directly against
  the service rather than estimated. Constraining maths would need a different
  approach, most likely writing the resource first and filling in its diagrams in
  a second step, which is a larger change than this ticket covers and should be
  costed on its own.
- Watch booklet generation time after release. A booklet now takes around three
  minutes against a nine-minute ceiling, so there is room, but it is the slowest
  resource we produce.
- Two supporting AI calls that pick public-domain reading texts are also
  unchanged: they run on Claude Sonnet 4.6, which does not support this feature.
  Moving them to a supported model is a small, separate decision.

---

## 2026-08-14 — Teaching resources now generated by a stronger AI model

**What changed**

- All nine teaching resource types are now generated by Claude Opus 5 instead of
  Claude Sonnet 4.6, with "thinking" switched on so the model reasons through a
  resource before writing it.
- The output size limit went from 24,000 tokens to 96,000, and the mark-scheme
  checking step from 8,000 to 32,000. We are only billed for what is actually
  produced, so a higher limit costs nothing on a normal resource but removes the
  case where a long one was cut off halfway.
- Added a `RESOURCE_LLM_MODEL` setting so the model can be changed or rolled back
  by editing the function environment — no code change and no redeploy.
- A resource queued before this change now picks up the new model when retried,
  instead of retrying on the model that had already failed.
- Fixed prompt caching, which was switched off by an exact match on the old model
  name and would have stayed off after any model change.
- If the AI ever declines a request, tutors now see a message saying so and what
  to do, rather than a confusing internal error.
- Worker memory raised from 1GiB to 2GiB. Cloud Functions ties CPU to memory, so
  this shortens the document-building stage and leaves more of the fixed 9-minute
  budget for the model.
- Removed a stale "sonnet" label attached to each resource type in the portal; it
  was unused and would have been wrong.
- Told the model to honour the tutor's stated quantities. Asked for an
  8-question practice paper, the new model produced 25 — a real Year 10 paper is
  about that long, and it silently scaled the resource to match. The old model
  produced 8. Verified fixed against the live API.
- Preview PDFs are no longer built while the tutor waits. Converting a document
  means calling an external service that is allowed up to 60 seconds, and that
  was happening inside the same fixed 9-minute budget as generation itself. A
  resource is now finished — and downloadable — as soon as the Word document is
  ready, and the preview is produced straight afterwards in its own run. If the
  converter is slow or down, the resource is unaffected; it simply has no
  preview, which is what happened before too.

**Why:** The resource generator carried a lot of machinery to work around the old
model — repairing invalid JSON, and a separate pass to strip the model's own
second-guessing out of worked solutions. Those are the failure modes a stronger
model with reasoning enabled largely removes, and reliability matters more here
than the roughly 1.7× cost per resource.

**Status:** Live in production since 2026-08-14. 821 tests pass, verified end to
end against the live API before release, and the deployed functions confirmed
afterwards.

A Year 10 maths practice paper with worked solutions (the heaviest path, since it
also triggers the mark-scheme checking pass) took **108 seconds** against the
9-minute limit: 79s to write the resource and 29s to check the answers, leaving
over 7 minutes spare. Resource generation is not close to the ceiling.

**To roll back:** set `RESOURCE_LLM_MODEL` to `claude-sonnet-4-6` in the function
environment. It is deployed empty, which means "use the model in the code", so
setting it reverts generation without a redeploy or a code change.

**Next steps**

- Generate one resource of each type in production and check the output reads
  well. The timings and the request path are already proven; this is a quality
  read-through, not a technical check. An hour.

---

## 2026-08-14 — Teaching resources moved to their own portal

**What changed**
- Created `apps/resource-portal`, a standalone application served at
  `resources.tenacitytutoring.com`. Tutors and admins sign in there to generate
  teaching resources.
- Removed the resource generator from the admin portal entirely: no route, no
  navigation item, no student resource-history panel, and no host detection.
  `/resources` on the admin domain now renders the admin 404, which is new —
  unknown admin paths previously fell through to the dashboard.
- Made portal admission explicit on both sides. The admin portal accepts only
  an `admin` role claim; the resource portal accepts `admin` or `tutor`.
  Anyone else is signed out before any protected screen renders, and the login
  page explains why rather than silently looping.
- Turned the production Hosting deploy into one implementation serving two
  surfaces, rather than a second copy of a 330-line protected workflow. The
  same is true of the Hosting rollback. The orchestrator now deploys the
  resource portal before the admin portal.
- Moved the committed exemplar PDFs into the new application and repointed the
  backend script that regenerates them.

**Why:** [AWP-8](https://tenacitytutoring.atlassian.net/browse/AWP-8) asked for
a resource portal genuinely separate from the admin portal. The first attempt
(#70) shipped a single host-aware bundle: one build, one Hosting site, tutors
redirected inside the admin application. That met the URL requirement but not
the separation one — the admin bundle still shipped to tutors, and the two
surfaces could not be deployed or rolled back independently.

**Status:** In progress — implemented and merged to a branch, not yet deployed.
Production still runs the pre-AWP-8 admin portal on both surfaces: the #70
frontend never went live (CI correctly refused to auto-deploy a frontend
alongside a backend change) and its Functions deploy failed on a Cloud Build
flake, so `deleteResourceJob`'s admin-only check is not live either.

**Next steps**
- Create the `tenacity-resources-b8eb2` Hosting site, attach
  `resources.tenacitytutoring.com`, and add **both** that domain and
  `tenacity-resources-b8eb2.web.app` to Firebase Auth's authorised domains.
  Only the project's default site is authorised automatically.
- Set `FIREBASE_RESOURCE_HOSTING_SITE` and `FIREBASE_RESOURCE_HOSTING_TARGET`
  in the protected production environment.
- Confirm which origin the Firebase Auth email action handler points at. A
  tutor who cannot reset their password has no way into the resource portal.
- Retry the Functions deploy against the new `main` SHA before any frontend
  deploy.

---

## 2026-08-13 — Parents could not send messages

**What changed**
- Gave four Cloud Functions more memory: sending a chat message, the chat
  notification trigger, the Xero invoice-paid trigger, and the calendar sync.

**Why:** A parent reported that sending a message failed with an unhelpful
internal error. The function was not broken — it was running out of memory and
being killed, which reaches the app as a generic failure with nothing useful
attached. Three other functions were dying the same way. The invoice one
matters quietly: while it was failing, invoices paid in the app may not have
been marked paid in Xero.

This is the known problem where every function loads the code for all the
others and starts 200MiB heavy, leaving too little room to work in. Four
payment functions were given more memory for the same reason on 6 August. This
is that same patch applied to four more, and it is the first time the problem
has reached something a parent touches.

**Status:** Live in production, deployed 13 August 2026. Verified afterwards
that all four are running with the new limit and the failures stopped.

**Next steps**
- Do the real fix rather than raising memory a function at a time — load each
  function's dependencies only when it needs them. It is the last remaining
  cause here, and it will keep surfacing in whichever function is next to grow.
  Tracked in the backlog.
- Check whether any invoices paid recently are unpaid in Xero, covering the
  period the trigger was being killed.

---

## 2026-08-13 — Chats with deleted accounts no longer haunt the inbox

**What changed**
- Deleting a user now cleans up their conversations, through **both** ways an
  account can be removed. Previously nothing did, so every account ever deleted
  left its threads behind: the other person kept seeing the conversation in
  their inbox, labelled "Unknown User", and could still open it and send
  messages that went nowhere.
- The app's own "remove person" and "delete my account" buttons never went
  near the admin deletion function this was first built into — they use an
  older, separate path. Fixing only that function would have left every
  deletion made through the app still creating orphans. The cleanup now also
  runs in the shared function those two flows call.
- That shared function also had no permission check of any kind: it accepted
  any user id from any caller and destroyed that person's sign-in. It now
  requires you to be an admin, or to be deleting yourself.
- What happens to a thread depends on whose it was. A group conversation
  simply loses the member. A one-to-one conversation with a real person is
  retired — hidden from everyone but kept on disk, so the record of what was
  said to a family survives. A one-to-one conversation with an internal test
  account is deleted outright, messages included.
- The server now refuses new messages into a retired conversation, so an older
  copy of the app already on someone's phone cannot post into one.
- A one-off script cleared the conversations already orphaned by past
  deletions. It is dry-run by default, must be pointed at a project
  explicitly, and stops if it finds no users at all — which would mean it was
  aimed at the wrong place. It hides threads rather than destroying them
  unless explicitly told otherwise, and re-running it does nothing.
- Retiring a conversation also clears its unread count, so nobody is left with
  a message badge they have no way to clear.

**Why:** Parents reported confusion from conversations with accounts that no
longer exist. The accounts in question were created for testing before there
was a staging environment to test in — the wider question of whether test
accounts should exist in production at all is tracked separately.

The script hides rather than deletes because the production dry run showed why
that matters. Of the twelve departed accounts, only one had any record of why
it was removed, and it turned out to be the business's own
`admin@tenacitytutoring.com` identity — the branded "Tenacity Tutoring" account
parents saw in their inbox — not a test account. One of its threads was a real
parent's conversation with the business. Destroying these by default would have
taken that with it. Its removal was since confirmed as deliberate.

**Status:** The one-off cleanup is live in production, applied 13 August 2026:
twenty orphaned threads are now hidden from every inbox with all 188 of their
messages intact; forty-nine active conversations were untouched. One
unreachable document — no fields at all, readable by nobody — was deliberately
left in place. Verified afterwards by reading the data back.

The code that stops new orphans appearing is merged but only partly deployed:
the admin deletion function went out on 13 August, and the fix to the path the
app actually uses is still waiting on a deploy. Tests: 800 backend unit, 146
emulator integration, 967 Flutter, all passing.

An automated reviewer caught the second path on the pull request, after the
first fix had already been reported as complete and deployed. Worth recording,
because the mistake was not in the code: the function was tested, deployed and
verified in isolation, and nobody checked which function the app's delete
buttons actually call. They call a different one.

An internal-account tier (TP-12) was built to make the "delete outright" path
reachable, then deliberately reverted the same day — see the entry below.
There is currently no way to mark an account internal, so every deletion takes
the conservative retire path regardless of who the account belonged to.

**Next steps**
- Deploy the Functions surface so the fix to the app's own deletion path goes
  live. Until then, deleting someone through the app still leaves orphans.
- Consider putting both app deletion flows onto the admin deletion function
  rather than the older one. That would also give them the checks the older
  path lacks: confirming the email before destroying an account, refusing a
  parent who still has students, and a server-side audit record. Half a day,
  and it touches live delete screens, so it wants its own change.

---

## 2026-08-12 — A staging environment for the mobile app

**What changed**
- The Flutter app can now be built for one of two environments. A
  `--dart-define=TENACITY_ENV` selects the Firebase project at compile time,
  Android gained `prod` and `staging` product flavors, and a staging build
  carries its own application id so it installs alongside the real app.
- A seed script builds a whole fake tutoring school in the staging project —
  terms, classes, tutors, parents, students, attendance with marked and
  unmarked rolls, invoices in mixed states, chats, announcements, feedback and
  a waitlist. It refuses to run against production, and can wipe and rebuild
  only the data it created.
- Outbound email from any non-production project is now redirected to a single
  sink address, with the intended recipients kept in a header. If no sink is
  configured it drops the mail rather than sending it.
- Only the 33 functions the mobile app actually needs will be deployed to
  staging. That leaves out all six scheduled jobs, so staging cannot send
  reminder emails or write to the real Google Calendar.
- Removed a hardcoded live Stripe key that any build fell back to whenever
  Remote Config was unavailable.

**Why:** Testing a new version of the app meant pointing it at live families'
data and the live Stripe account. There was no other option — the app had no
concept of environments at all.

**Status:** In progress. The repository work is done and verified: 776 backend
unit tests, 21 new seed integration tests, 959 Flutter tests, `flutter build
web`, and a real `assembleProdDebug` APK all pass. The staging Firebase project
still needs provisioning, and the Xcode project still needs its build
configurations, both of which need owner authorization.

**Next steps**
- Provision the staging project per
  [`docs/operations/mobile-staging-environment.md`](docs/operations/mobile-staging-environment.md):
  client apps, Auth, App Check, APNs key, secrets, budget, a functions-deploy
  identity. Roughly half a day.
- Wire the six iOS build configurations and the staging scheme in Xcode. An
  hour or two, and it must be done in Xcode rather than by hand.

---

## 2026-08-11 — Branded the weekly parent email and gave it a preview

**What changed**

- The weekly parent update now looks like it comes from Tenacity. Navy header
  band with the logo, brand-coloured headings, and a footer carrying the
  contact address and phone number alongside the unsubscribe link.
- Fixed two layout faults that only show up in a real mail client. The 600px
  width was set on a `div`, which Outlook ignores — it rendered edge to edge
  there. And a fixed-width table would not have fixed it: measured on a 375px
  phone, that markup forces a 624px page, so a parent has to pinch and zoom.
  The layout is now fluid up to 600px, with Outlook getting its fixed width
  from a conditional "ghost table". Re-measured at 375px: nothing overflows.
- Added the hidden preview line that email clients show next to the subject in
  the inbox list. It was previously showing "TENACITY TUTORING" on every send;
  it now shows the opening of the update.
- The header image is styled so that when a mail client blocks images — which
  many do by default — the alt text still reads as Tenacity on the navy band.
- Admins can now see the email while composing it, at the bottom of the compose
  page. Sent updates deliberately get no preview: announcements can be edited
  or archived afterwards, so re-rendering one would show something that is not
  what went out.
- The logo is served from the website at `/email/logo-horizontal-white.png`.
  Note for anyone touching these assets: the logo filenames in the website's
  public folder do not match their contents — the file called "Horizontal" is
  the stacked lockup, and the one called "Vertical ... White" is the horizontal
  white one used here.

**Why:** The update went out as plain text with a grey wordmark — it did not
look like it came from the business, and there was no way to see it before
sending short of mailing yourself a test.

**Status:** In progress — three branches, none merged or deployed. Nothing is
live yet.

**Next steps**

- Merge and deploy in order: website (logo asset) first, then backend, then
  portal. The portal's preview calls a Function that must already exist, and
  the pipeline will not auto-deploy a frontend in a merge that also touches the
  backend.
- Send yourself a test once the first two are live and check it in Gmail, Apple
  Mail and Outlook, in light and dark mode and with images blocked. The unit
  tests cover the markup; they cannot cover how a client renders it.

---

## 2026-08-10 — Weekly parent email

**What changed**

- Admins can compose and send a weekly update email to parents from the portal,
  at `/weekly-update`. A draft holds a subject, an intro, any announcements
  picked from a recent-window list, and freeform extra sections.
- Drafts are stored in a new admin-only `parentEmailBlasts` collection and read
  and written directly by the portal. Only sending goes through a Cloud
  Function, because sending is the part with side effects.
- `sendParentEmailBlast` claims the draft inside a transaction before doing any
  work, so a double-click cannot mail the list twice. A draft already `sending`
  or `sent` is refused.
- Recipients are parents who have not opted out and have a usable address,
  deduplicated by address so a family sharing one inbox is mailed once. Each
  parent gets their own request rather than one batched SendGrid call, so
  recipients never see each other, the unsubscribe link can be per-account, and
  one bad address cannot fail the whole send.
- Announcements written for tutors, or archived after the draft was saved, are
  dropped at send time rather than trusting what was selected earlier. What
  actually went out is snapshotted onto the blast, because announcements can be
  edited later and a sent email cannot.
- A test send delivers the same rendered email to up to five named addresses
  and deliberately leaves the draft alone, so the real send still has to be
  triggered on purpose.
- Parents get a working unsubscribe: a visible link to a confirmation page on
  the website, plus a one-click `List-Unsubscribe` header target for inbox
  providers. Both carry an HMAC-signed token, so a parent following a link from
  their inbox does not need to be signed in. The page applies the opt-out only
  on an explicit click, so link scanners cannot unsubscribe someone. Mistakes
  are recoverable — the same page offers resubscribe.

**Why:** There was no way to tell parents anything as a group. Announcements
existed in the app but relied on parents opening it.

**Status:** In progress — merged to a branch and awaiting review, not deployed.
Nothing is live.

**Next steps**

- Provision `EMAIL_BLAST_UNSUBSCRIBE_SECRET` in Firebase Secret Manager and the
  Vercel project with the same value, before the Functions deploy. The Function
  binds it via `defineSecret`, so the deploy fails if it does not exist, and a
  mismatch between the two makes every unsubscribe link reject.
- Deploy four surfaces in order — rules, Functions, admin Hosting, website —
  each through its own gated workflow window.

---

## 2026-08-06 — One-off bookings no longer depend on the phone

**What changed**

- A one-off PaymentIntent now carries what it is for: the class, the week and
  the students, in its Stripe metadata. It previously recorded only the parent
  and the amount, which is why the booking lost earlier that day could not be
  reconstructed from anything we hold.
- `handlePaymentSuccess` completes the booking itself. The webhook enrols the
  students and raises the paid invoice; the app no longer writes either. That
  deletion is the fix — everything else supports it.
- `verifyPaymentStatus` runs the same fulfilment as a fast path, so a parent
  still gets an immediate confirmation instead of waiting on webhook delivery,
  and both callers now run identical code.
- Fulfilment is idempotent by construction. A claim in `oneOffFulfilments`
  decides who does the work, with a 60-second lease so a process that dies
  mid-way cannot wedge a booking forever. Enrolment uses `arrayUnion` behind a
  shared capacity check, and the invoice reuses the existing
  `createInvoiceOnce` de-duplication with `requesterId` pinned to the parent on
  every path — the webhook using `"stripe"` and the client using the parent's
  uid would have produced two invoices for one payment on every booking.
- The parent-facing enrolment callable, the webhook and the sweep now share one
  capacity check, so no two paths can disagree about whether a seat is free.
- A session that fills up between starting a payment and the card clearing is
  refunded automatically and an alert raised. A partial fit enrols who fits and
  refunds the difference. A refund that fails, or a class whose date has already
  passed, is left for a human and never retried into a loop.
- New nightly `reconcileOneOffPayments` (03:00 Sydney) finds paid one-offs that
  nothing completed, and either completes them or alerts. Payments from app
  builds without booking context can only be alerted on — which is what surfaces
  the three from 23 May and the $70 from this morning. Alerts go to admin
  devices by push, not just to the logs: a sweep whose findings land only in
  Cloud Logging reproduces the very problem it exists to solve.
- The sweep reads the fulfilment claims as well as the ledger, so a payment
  whose fulfilment crashed before its ledger entry was written is still
  reachable. The webhook also records the payment *before* attempting the
  booking, for the same reason.
- A refund checks Stripe for one that already exists rather than relying on the
  idempotency key alone, which Stripe keeps for only about 24 hours — long
  enough for a nightly sweep to fall outside it and refund twice.
- `createPaymentIntent` now prices a booking from `config/pricing` rather than
  trusting the client. It previously accepted whatever `amount` the app sent on
  the one-off path, checking only that it was a positive number, so a modified
  client could book a $70 class for 50c.
- Every student in a booking must be one of the paying parent's own children,
  checked before the PaymentIntent is created and again during fulfilment. This
  was a hole opened by moving enrolment server-side: fulfilment enrols as the
  system, so it bypassed the parent check the old client-driven callable did.
  Without it a parent could pay to enrol another family's child — student ids
  are visible on attendance rosters — and receive an invoice carrying that
  child's name.
- `verifyPaymentStatus` still writes the payment ledger for a one-off when the
  webhook has not, rather than skipping it unconditionally. The ledger is the
  only record the payment happened, and the nightly sweep reads nothing else.
- The app reads the server's fulfilment state rather than counting enrolled
  students. A booking still completing, or one already refunded, both come back
  with no enrolled students; treating that as zero bookings told the parent
  their booking had failed and to contact support.
- Seats can be held while a parent is at the card sheet, so another family
  cannot take them mid-payment. **Off by default** — a hold outliving an
  abandoned payment costs someone else a booking, so enabling it is a deliberate
  trade, made by setting `config/pricing.holdSeatsDuringPayment`.

**Why:** The morning's fix stopped the app throwing away a booking it had paid
for, but the booking was still written by the phone in the seconds after the
card cleared. Anything that interrupted the app in that window — a crash, a lost
connection, the app being killed — still took the money and left nothing behind.
This moves the work to the server, where a failed attempt is retried rather than
lost.

**Status:** Merged, not yet deployed. 715 backend unit tests, 102 emulator
tests, 942 mobile tests. The fulfilment routine has real integration coverage
against Firestore, including the webhook and app racing each other, webhook
redelivery, partial fits, refunds and the legacy path.

Backward compatible in both directions, which the rollout depends on: a payment
with no booking context takes exactly the old path, so app builds already in the
wild keep working unchanged for as long as they are in use. Deploy the backend
first; the app can follow at its own pace.

**Next steps**

- Create `config/pricing` in Firestore with `oneOffClassCents` before deploying,
  or every one-off payment will be refused. This is the one manual step.
- Keep `holdSeatsDuringPayment` off until there is evidence sessions actually
  fill during payment; the refund path already handles it correctly.

---

## 2026-08-06 — A paid one-off booking was lost when verification crashed

**What changed**

- `verifyPaymentStatus` no longer repeats work the Stripe webhook has already
  done. A new pure `shouldRunVerifyFallback` in `src/payments/paymentLedger.js`
  decides: a one-off booking settles no invoice, so the fallback can never
  achieve anything; an invoice payment already recorded as matched is finished.
  Everything else still runs it, because an invoice left unpaid by a webhook
  that never arrived is exactly what the fallback is for.
- `verifyPaymentStatus` also retrieves the PaymentIntent once instead of twice,
  passing the expanded charge through to the settlement handler.
- Raised `createPaymentIntent`, `verifyPaymentStatus`, `stripeWebhook` and
  `enrollStudentOneOff` from the 256MiB default to 512MiB. `enrollStudentOneOff`
  had no runtime options at all.
- The app no longer treats "we could not reach the server" as "the payment
  failed". `InvoiceService.verifyPaymentStatus` returns a four-state
  `PaymentVerificationResult` (succeeded / pending / notSucceeded /
  unavailable) instead of a bool that swallowed every error, and
  `InvoiceController.verifyPaymentWithRetries` gives a struggling server four
  chances over fifteen seconds.
- A one-off booking now goes ahead unless the server says outright that the
  payment did not succeed. The judgement and all its wording moved into a pure
  `one_off_payment_decision.dart`, so both can be tested; the branch used to
  live inline in a 2,400-line widget where none of it could be.
- Every message a parent can see after their card has been charged now warns
  against paying twice, and is a dialog rather than a snack bar. The old copy
  said "Payment verification failed. Please try again."
- A one-off invoice whose payment could not be confirmed says so in
  `adminNotes`, which is admin-only. Confirmed ones are left alone: the invoice
  already records `stripePaymentIntentId` and reads as paid.
- The invoice screen can now tell a declined card from an unreachable server,
  which it could not before.

**Why:** On 6 August a parent paid $70 for a one-off class, saw an error, and
got no booking. Three defects lined up. `verifyPaymentStatus` cold-started, read
the intent, then re-ran the whole settlement handler — a second expanded Stripe
retrieve — and died: `Memory limit of 256 MiB exceeded with 260 MiB used`, HTTP
500. Requiring `lib/index.js` alone takes RSS to 200MiB across 1,775 modules,
because every function loads the entrypoint's `xero-node`, `pdf-parse`, `xlsx`,
`sharp`, `pdfkit`, `mammoth` and Anthropic SDK, so all 85 functions had about
56MiB of working room. The app read that 500 as a failed payment and returned
before the enrolment step, then told the parent to try again — for a class they
had already paid for. The webhook had recorded the payment correctly four
seconds earlier; nothing else in the system knew a booking had been intended.

**Status:** Merged, not yet deployed. 667 backend unit tests and 945 mobile
tests pass; the Functions inventory check passes unmodified, which is the proof
the memory change is metadata-neutral. Deploy the backend first — it is the half
that stops the recurrence, and it ships in hours rather than through app review.

Note the deliberate trade: the app now books a class when it cannot confirm the
payment, on the grounds that the Stripe sheet closing without throwing is
already the SDK's success signal. A booking granted without confirmed payment
leaves an attendance record and an invoice that can both be reconciled against
Stripe; a payment taken without a booking leaves nothing. Until the Phase 2
sweep exists, the `adminNotes` marker is the only detection, so Stripe one-off
payments should be diffed against one-off invoices weekly.

A third defect was reported during this work — that one-off invoices are never
marked paid — and it was wrong. `src/invoices/invoiceSchemas.js` and
`invoiceFactory.js` do drop `stripePaymentIntentId`, but they serve
`adminCreateInvoice`, the admin portal's manual path, where an invoice
correctly starts unpaid. The callable the app calls is
`lib/notifications/invoices.js`, which reads the field and sets `status: "paid"`
and `paidAt` from it. Nothing is wrong, and no parent has been wrongly chased.

**Next steps**

- Phase 2, in a separate change: carry the booking context (class, students,
  attendance week) in the PaymentIntent metadata so `handlePaymentSuccess` can
  complete the enrolment and the invoice server-side, and the booking stops
  depending on the phone staying alive. Roughly two days, including a
  reconciliation sweep that would close open items 7 and 8.
- The 6 August payment itself is still unresolved: $70 in Stripe, no invoice, no
  booking. The class and child are not recoverable from our systems — the
  `invoice.pay_start` audit entry records only parent, amount and currency — so
  the family has to be asked.

---

## 2026-08-05 — Xero-paid invoices were never recorded as paid

**What changed**

- `handlePaymentSuccess` now recognises payments that originate from Xero's
  Stripe Connect app, not just ones the mobile app started. Xero writes the
  human invoice number (`"Invoice number": "INV-406"`) instead of the
  `invoiceIds` the app writes, so the handler matches back to Firestore
  through `invoices.invoiceNumber`. Live data stores that bare (`"406"`);
  both forms are queried.
- A Xero payment settles its invoice only when exactly one invoice carries
  that number, the amount paid equals the amount due, and the invoice is not
  already settled by a different payment. Anything else is recorded and left
  for a human — clearing a $700 balance off a $50 part-payment is a mistake
  that surfaces nowhere until the money is chased.
- Revived the `paymentLogs` ledger. Every payment now gets an entry keyed on
  its PaymentIntent id, whether or not an invoice was matched, including
  failures and one-off bookings. Previously the only `paymentLogs` writes
  lived in `lib/stripe_webhooks.js`, which nothing imports.
- `paidAt` is taken from the Stripe charge rather than `new Date()`, so a
  replayed event stamps the date the parent paid.
- Deleted `lib/stripe_webhooks.js`. It has been unreachable since
  `payment_functions.js` took over `stripeWebhook`; `lib/index.js` never
  required it. Open item 4 below described a double-payment bug "directly
  from `stripe_webhooks.js`" that could not fire, and is corrected.
- New `src/payments/paymentLedger.js` holds the classification and matching
  rules as pure functions, with 36 unit tests in
  `test/unit/payments/paymentLedger.test.js`.

**Why:** Six payments succeeded in Stripe during Term 3; the app showed two.
Four parents had paid by clicking "Pay now" on a Xero-emailed invoice rather
than through the app. The webhook received all four and discarded each one at
`No invoice IDs found in payment intent metadata`, leaving $3,270 recorded
nowhere but the Cloud Functions log. Nothing was wrong with the endpoint —
every delivery succeeded — and nothing outside those log lines would ever have
shown the money was missing, which is what the ledger now fixes.

**Status:** Live. `stripeWebhook` and `verifyPaymentStatus` deployed
2026-08-05 (revision `stripewebhook-00052-buw`); 659 unit tests pass. The four
affected payments were repaired by resending their Stripe events through the
deployed handler, so the repair exercised the real production path rather than
a one-off script. INV-406, INV-403 and INV-389 are now `paid`, each stamped
with its actual charge time on 31 July rather than the replay date, and each
carrying an `invoice.pay_complete` audit entry with `actorRole: system`.
INV-409 recorded in the ledger as `unmatched`, as intended — it is a one-off
payment with deliberately no invoice. The admin billing console now shows
$4,600 for the term, up from $1,400.

**Notes**

- `paymentLogs` was not empty: five legacy $0.50 entries exist with
  auto-generated ids and no `source`, left over from when `stripe_webhooks.js`
  was still wired up. Harmless, and distinguishable from new entries, which are
  keyed on the PaymentIntent id.
- Idempotency of a repeated resend is proven by construction and unit tests
  (ledger documents are keyed on the PaymentIntent id, and
  `settledByAnotherPayment` returns false for the same payment) but was not
  exercised live — the Stripe CLI key issued by `stripe login` has read access
  only and cannot resend events, so the replay was done from the dashboard.
- A Xero charge with a blank `billing_details.name` stores `stripePayerName`
  as `""` rather than null, because the fallback uses `??`. Cosmetic; INV-403
  is the one affected record. Switch to `||` on the next deploy of this file.

---

## 2026-08-05 — Rules deployment pipeline could not ship a real content change

**What changed**

- `firebase-rules-production.yml`'s pre-deploy check asserted that live
  production already equals the rules file at the commit being deployed —
  true only for a no-op redeploy. Every genuine rules change failed there,
  before the dry run or the actual deploy ever ran.
- Added a required `expected_content_change` boolean dispatch input. Left
  `false`, behavior is unchanged. Set `true`, the pre-deploy equality
  assertion is skipped and the comparison is recorded instead
  (`contentMatches` per surface in the uploaded evidence) rather than
  silently dropped.
- Post-deploy verification is untouched and still unconditionally strict —
  after a real deploy, live content must exactly equal what was pushed, no
  exceptions.

**Why:** Deploying [PR 41](https://github.com/tsowmi03/tenacity-platform/pull/41)'s
`parentSurveyResponses` rule hit this directly — the pipeline had only ever
been exercised as a true no-op (the Phase 4 cutover rehearsal), so this had
never been caught. The rules had to be shipped by hand outside the audited
pipeline instead; recorded in
[issue 42](https://github.com/tsowmi03/tenacity-platform/issues/42).

**Status:** Live. Merged as `bc7d8f9`
([PR 44](https://github.com/tsowmi03/tenacity-platform/pull/44)). Verified by
replaying the actual failed run's production snapshot through the real CLI:
fails identically without the new flag, succeeds with it, and post-deploy
verification against the content that's now actually live still requires
exact equality with no flags at all.

---

## 2026-08-04 — Admin parent feedback results page

**What changed**

- Added `/parent-feedback` to the admin portal: a single page for reading the
  survey results, under Communications in the sidebar and restricted to the
  admin role.
- Headline figures across the top — response count, average satisfaction, net
  promoter score and app usefulness — over whichever responses match the
  current year-group and subject filters, so every number on the page always
  describes the same set.
- A ranked table of the seven rated statements, worst first, with a colour-coded
  score bar, how many parents scored each one at 3 or below, and how many said
  "not sure". This is the part that answers "what do we fix next".
- Distribution bars for overall satisfaction, promoter/passive/detractor split,
  app usage, and the reasons parents give for never opening the app.
- A "parents waiting for a reply" table listing everyone who asked to be
  contacted, with their score and a mailto link.
- Every free-text answer as a scannable card, filterable by which question it
  answered and searchable by content. Clicking any card — or any follow-up row
  — opens the full response.
- Responses can be archived and restored, which takes a test submission or a
  duplicate out of the summary without deleting what a parent wrote.
- CSV export of the filtered responses, matching the Year 11 interest page.
- Added a Firestore rule for `parentSurveyResponses`: admins can read and set
  only `archived`, nobody can create or delete from a client. The collection
  previously had no rule at all, so the portal could not have read it.

**Why:** The survey was writing to Firestore and emailing a copy of each
response, but there was no way to see the shape of the results — which
statement scores worst, whether one year group is unhappier than another, or
what parents actually wrote. Reading them one email at a time does not answer
any of that.

**Status:** Live. Merged as
`100cf349e73a28d7cd3c62e9818e32443b2cca81` ([PR 41](https://github.com/tsowmi03/tenacity-platform/pull/41))
and deployed 5 August 2026 — Firestore rules, then admin Hosting, per cutover
record [issue 42](https://github.com/tsowmi03/tenacity-platform/issues/42). The
deployed bundle was confirmed to contain the page. The page itself was reviewed
against generated sample data rather than real responses, since the portal
points at production.

**Next steps**

- The survey question wording is duplicated in
  `apps/admin-portal/src/backend/parentSurvey.js` and
  `apps/website/src/lib/parentFeedback.ts`. If the survey changes, both need
  editing, and `SURVEY_VERSION` should be bumped on both sides.

---

## 2026-08-04 — Parent feedback survey

**What changed**

- Added a five-step parent feedback survey at `/parent-feedback` (noindex),
  posting to `/api/parent-feedback`, which validates the response, writes it to
  the `parentSurveyResponses` Firestore collection and sends an admin email.
  Responses are anonymous unless the parent asks to be contacted.
- Reworked the survey around an overall-satisfaction question, a single
  app-usefulness rating and a single "main reason" for parents who do not use
  the app, replacing the longer priorities and per-feature app sections.
- Fixed a bug where a double-click on "Continue" advanced a step and then
  immediately validated the step the parent had just landed on, so the red
  "Please check your answers" box appeared on a page they had not filled in
  yet. Step navigation now ignores a second activation for 700ms after a step
  change, which also stops a double-click on "Back" from skipping a step.
- Validation errors are now derived from the live answers, so the error box
  disappears as each problem is fixed instead of waiting for another
  "Continue". Submission failures render as their own message rather than being
  mixed into the validation list.
- Fixed the question boxes on the rating steps: their text was being painted
  into the gap a `<legend>` cuts in its `<fieldset>` border, so every box had a
  broken outline. Floating the legend puts the question inside the box.
- Added keyboard focus rings to every choice, rating and scale control. The
  real inputs are visually hidden, so keyboard users previously had no
  indication of where they were.
- Responsive fixes: year-group and five-point scales now switch to their
  stacked layouts at 820px rather than 620px, where they were squeezing five
  columns of wrapped sentences; rating captions are hidden once they would
  ellipsise into nonsense; the two written questions stack full width so their
  boxes align; the 0-10 recommendation key names its own endpoints so it still
  reads correctly when the scale wraps onto two rows on a phone.
- After each step the page now scrolls to the progress bar rather than the very
  top, so parents are not sent back past the page introduction every time.
- API: `Number()` was turning `null`, `""`, `false` and `[]` into `0`, which is
  a valid point on the 0-10 recommendation scale, so a malformed payload could
  be stored as a genuine score of zero. Only real numbers and numeric strings
  are accepted now.

**Why:** We want an honest read on lessons, communication and the app before
next term, and specific criticism is more useful than a star rating. The survey
has to be short and work properly on a phone, since that is where most parents
will open the link.

Automated review of the pull request also flagged that the endpoint was
unauthenticated: any client could skip the form, omit the honeypot field and
post valid payloads repeatedly, each one writing a document and sending an
email. It now requires a verified Cloudflare Turnstile token before the write,
reusing the pattern already used by `/api/register` — the shared verification
helper was extracted to `apps/website/src/lib/turnstile.ts` rather than
duplicated.

**Status:** Live. Merged as
`100cf349e73a28d7cd3c62e9818e32443b2cca81` ([PR 41](https://github.com/tsowmi03/tenacity-platform/pull/41))
and deployed to Vercel production 5 August 2026, per cutover record
[issue 42](https://github.com/tsowmi03/tenacity-platform/issues/42).

Verified against production after deploy: the page renders and carries
`noindex`; the Turnstile site key is present in the deployed bundle; and a
POST carrying a valid payload with a deliberately invalid Turnstile token
returns 403 rather than 500, which confirms the server-side secret is
configured and that verification gates the Firestore write.

**Next steps**

- Confirm one real end-to-end submission — a genuine response stored in
  Firestore and the admin notification email arriving — before sending the link
  to parents. The probe above deliberately stops short of writing.

---

## 2026-08-04 — Instant tab switching in the mobile app

**What changed**

- The bottom-bar tabs now keep their state. The shell used to swap the body
  widget on every tap, which threw away the outgoing screen and rebuilt the
  incoming one from scratch; visited tabs now live in an `IndexedStack` and
  are built lazily the first time they are opened.
- Screens refresh silently when the user returns to a tab, throttled to 30
  seconds, via a new `TabVisibility` widget and `TabVisibilityAware` mixin.
- The Classes screen no longer covers itself with a spinner while reloading
  data it already has. It only blocks on a genuinely cold start; week paging
  keeps its spinner, because the header moves to the new week immediately.
- The parent, tutor and admin dashboards keep their last good data on screen
  during a background refresh, and a refresh that fails no longer replaces a
  working dashboard with the "Dashboard unavailable" screen.
- A week's attendance is now one collection-group query keyed on
  `termId + weekNum` instead of one document read per class, and the week is
  swapped in only once it has loaded rather than cleared up front.
- Added the Firestore rule that collection-group attendance reads actually
  need (`match /{path=**}/attendance/{id}`), plus a `termId + weekNum`
  collection-group index. Both are deployed.
- Trimmed some incidental work: the eligible-subjects lookup now runs only
  for the browse screen that uses it, and the term and class loads run
  concurrently.

**Why:** Moving between screens showed a loading spinner for about a second
even though the controllers are app-level and still held the data — the shell
was discarding the screen that was showing it.

Two unrelated bugs surfaced while doing this. The collection-group query in
`fetchUpcomingClassForParent` had been failing with permission-denied in
production for as long as it had existed, because a path-scoped rule does not
cover a collection-group query; its error was swallowed and reported to
parents as "No upcoming class". And `setState(() => _future = ...)` in the
dashboards' pull-to-refresh returns a Future, which trips a `setState`
assertion in debug builds. Both are fixed here. A third and more serious one
became its own entry — see the attendance week-number split below.

**Status:** Merged pending review on branch `perf/keep-tab-state-alive`.
Verified on the simulator against production: tab switches are instant, scroll
position and the selected day survive a round trip, and the timetable loads
real data. 913 mobile tests, 623 functions tests and 21 Firestore rules tests
pass.

---

## 2026-08-04 — Attendance sessions were recording the wrong week

**What changed**

- `rolloverTermData` now writes `weekNum` on the attendance documents it
  generates. It wrote `weekNumber`, while the class-creation callable
  (`src/classes/attendanceFactory.js`) wrote `weekNum` — the app and the
  backend's own date-propagation code only read `weekNum`.
- Backfilled 614 production attendance documents with a correct `weekNum`,
  via `scripts/backfillAttendanceWeekNum.js` (`npm run
  dryrun:attendance-week-num` to preview). Every one was recoverable from the
  `weekNumber` the rollover had written; none needed guessing. `weekNumber`
  was left in place, because the admin portal still reads it.
- `Attendance.fromMap` no longer defaults a missing week to `0`. It reads
  either field name and falls back to parsing the document id, which is
  `{termId}_W{week}` under every write path.

**Why:** Two write paths had disagreed on the field name since the attendance
model was introduced, and nothing surfaced it. Of 894 production documents,
466 carried only `weekNumber` — scattered through the current and next term,
not confined to old data, because the split reproduced on every term rollover.

The damage compounded quietly. The mobile model read the missing field as week
`0`, and `toMap()` wrote that `0` straight back on the next admin roster edit,
so 148 documents had ended up *permanently storing* week 0. Separately,
`attendanceGeneration.js` throws `failed-precondition` when `weekNum` is not an
integer, so the admin "propagate class dates" flow had been failing on exactly
these documents.

Found by the pre-flight check written for the timetable work above, which was
expected to return zero.

**Status:** Data repaired and verified — all 894 documents now carry a valid
`weekNum`, confirmed by a re-run of the check. The mobile and script changes
are on `perf/keep-tab-state-alive`.

**Next steps**

- Deploy the `rolloverTermData` function change. Until it ships, the next term
  rollover will reintroduce the split. Not urgent — the function only acts at
  a term boundary — but it must land before the current term ends.

---

## 2026-08-03 — Year 11 information sheet download

**What changed**

- Added the Year 11 parent information sheet to the website as a static asset
  at `apps/website/public/Year-11-Information-Sheet.pdf`, served from
  `/Year-11-Information-Sheet.pdf`.
- Linked it from the bottom of the "How classes run" card on
  `/year-11-interest`, as an outline button below the fees, so it sits away
  from the primary "Register interest" action.
- Added an `.info-sheet-btn` class that goes full width and centres its label
  below 620px. The label is too long to stay on one line on a phone, so
  without this it wrapped ragged against the button's left edge.

**Why:** The sheet is the document handed out to parents, and it points back to
`tenacitytutoring.com/year-11-interest`. Parents who arrive at the page from
somewhere else had no way to get the sheet itself to keep, print or forward.

Hosting it on the site rather than Google Drive keeps the URL on our own
domain, avoids Drive's sharing-permission and sign-in failure modes, and
matches how `T&Cs.pdf` is already served.

**Status:** In progress - built and verified locally on branch
`year-11-info-sheet`, not yet merged or deployed.

**Next steps**

- The sheet duplicates the fees and class structure already written into the
  page. If either changes, the PDF has to be re-exported and re-copied into
  `public/` as well — there is no shared source.

---

## 2026-07-31 — Year 11 interest admin screen

**What changed**

- Added a `Year 11 interest` screen to the admin portal at `/year-11-interest`,
  under Operations, so the form's submissions no longer have to be read in the
  Firestore console.
- Led with a demand summary: student counts per course, plus how many schools
  each count spans, and a separate English-by-school breakdown. English groups
  are formed per school, so a combined English total does not tell you whether
  any one school has a viable class.
- Listed the registrations with search, course and school filters, sibling
  submissions flagged as one family, and a detail view showing the parent's
  notes and contact details.
- Added a New / Contacted / Archived workflow so admins can track who has been
  called. Status changes are written straight to Firestore rather than through
  a callable Cloud Function, which keeps this off the Functions inventory.
- Locked the collection down in `firestore.rules`: only admins can read it,
  admins may only change `status`, `archived` and `statusUpdatedAt`, and no
  client can create or delete. The public form writes through the admin SDK,
  which bypasses rules. Tutors, parents and anonymous visitors cannot read it.
- Added a client-side CSV export of the current filtered view.

**Why:** The interest form exists to decide which Year 11 classes to open, and
that decision needs demand aggregated by course and school - not a raw document
dump. Reading it in the Firestore console also meant no way to track which
families had already been contacted.

**Status:** In progress - built and verified locally on branch
`feat/website/year-11-interest-form`, not yet merged or deployed.

**Next steps**

- Deploy the updated Firestore rules before the screen is usable in production;
  until then the portal cannot read the collection.
- `apps/admin-portal/src/backend/year11Courses.js` duplicates the label maps in
  `apps/website/src/lib/year11Courses.ts`. The two apps share no package, so if
  a course, day or year option changes, both files need the change.

---

## 2026-07-31 — Year 11 class interest form

**What changed:**

- Added a public page at `/year-11-interest` where parents can register
  interest in the new Year 11 Maths and English classes. The page carries the
  content from the Year 11 parent information sheet: how classes run, the
  two-tutor model, and the Year 11 fees.
- Captured, per child, the school, current year, whether the student already
  attends Tenacity, the courses wanted, preferred class days and free-text
  notes, plus one set of parent contact details. Up to three children can be
  submitted together.
- Modelled Maths and English identically: Standard cannot be combined with
  Advanced or Extension 1 within a subject, but Advanced and Extension 1 can be
  selected together, since Extension 1 is a separate one-unit course layered on
  top. The rule lives in one shared helper used by both the form and the API,
  so a direct API call cannot submit a combination the form prevents.
- Offered Monday to Friday as preferred days, matching the intended senior
  class hours (Monday to Thursday from 7pm, Friday from 5pm).
- Added `POST /api/year11-interest`, which validates every field against a
  fixed list of allowed course, day and year codes, writes one document per
  child to a new `year11Interest` Firestore collection, and emails the Tenacity
  inbox. The form is deliberately unprotected by a CAPTCHA — it is a
  low-traffic page and the friction was not judged worthwhile.
- Pulled the SendGrid notification email into a shared helper so the new route
  and the existing `/api/send-notification` route use one code path; the
  notification subject line is now caller-supplied, defaulting to the previous
  wording.

**Why:** The Year 11 classes cannot be timetabled until we know each student's
subject, course level and school. Interest is deliberately kept separate from
the existing `enrolments` collection, because a class is only opened once there
is enough committed demand — an expression of interest is not an enrolment.

**Status:** In progress — built and verified locally on branch
`feat/website/year-11-interest-form`, not yet merged or deployed.

**Next steps**

- Submit one real test registration against the Vercel deployment to confirm
  the Firestore write and the notification email. Firebase and SendGrid
  credentials are not available locally, so the write itself is still
  unverified.
- Link the page from the site navigation or a homepage banner once it is live;
  right now it is only reachable by direct URL.
- Watch for spam. The form has no CAPTCHA, so if junk submissions appear, the
  cheapest fixes are a honeypot field or a per-IP rate limit before
  reconsidering Turnstile.

---

## 2026-07-29 — Firestore rules deployed; New enrol picker and feedback-due row

**What changed**

- Deployed the pending `firestore.rules` change to production
  (`tenacity-tutoring-b8eb2`). This was the release blocker: the deployed
  `validFeedbackCreate()` used `hasOnly()`, so it rejected the `classId`,
  `sessionId` and `progress` keys the tutor roll writes, and every roll
  submission would have failed once the V3 build shipped.
- Re-captured `backend/firebase/inventory/source-baseline.json` against the
  deployed hash, and deleted `docs/operations/pending-rules-deployment.md`,
  which existed only to track this.
- **New enrol** on the admin dashboard now opens a picker instead of routing to
  the Classes tab: student, then class, then enrolment type. The class list is
  annotated against the chosen student, so a class they already belong to is
  shown greyed rather than failing at the write, and remaining seats are
  visible before the choice rather than after.
- Both enrolment entry points — the class-side flow and the dashboard's — now
  share one write. The offline guard, already-enrolled handling and
  post-write reload cannot drift apart between them.
- **Feedback due** now appears on the tutor dashboard. It costs one query per
  week: every class shares that week's attendance document id, so a single
  `sessionId` lookup covers them all.

**Why:** The rules deployment was the one item that would have broken
production. The other two were the last non-cosmetic gaps in A01 and T01.

**Status:** Rules are live and verified. The rest is complete on
`feat/mobile/v3-foundation`, not yet merged. 884 mobile tests pass (15 new),
analysis has no errors or warnings, formatting is clean, and the production web
build succeeds. The 18-test rules suite was run against the emulator before
deploying.

**Design notes**

- Feedback is only "due" once the roll is complete. Before that the session
  already shows as an unmarked roll, and listing it twice would put one class
  in both attention slots.
- Only students marked `here` are counted; an away student is owed nothing.
- The feedback read distinguishes "nothing written yet" from "read failed". An
  empty result means every present student is owed a note; a failure raises no
  row at all, rather than accusing a tutor of owing feedback they may have
  already sent.

---

## 2026-07-29 — Admin V3 screens visually accepted

**What changed**

- Product owner visually verified all six admin reference screens (A01
  dashboard, A02 classes, A04 users, A05 messages, A06 invoices — A03 was
  already accepted) plus the S05, S08 and S09 flows underneath them, inside
  the complete `HomeScreen` shell with bottom navigation in frame.

**Why:** These were the last items blocking Phase 4 sign-off; everything else
in the admin experience was implemented and tested but unconfirmed visually.

**Status:** Accepted. `V3_REDESIGN_ROADMAP.md` updated: A02, A04, A05, S05 and
S08 move to `[x]`; A01 and A06/S09 stay `[-]` for reasons unrelated to
visuals — A01 still needs the direct New enrol picker, and A06/S09 still need
a live invoice PDF smoke test.

**Next steps**
- Deploy the release-blocking Firestore rules change before any build that
  depends on the new feedback keys. *(Done 29 Jul 2026.)*
- Run the live invoice PDF smoke test. *(Done 29 Jul 2026.)*
- Build the New enrol → existing-student picker for A01. *(Done 29 Jul 2026.)*

---

## 2026-07-29 — Last reachable legacy mobile flows moved to V3

**What changed**

- Rebuilt the remaining admin class workflow on V3 sheets: class options,
  roster and weekly bookings, student enrolment, tutor assignment, waitlist
  promotion, feedback, cancellation, and class creation.
- Rebuilt the remaining admin billing workflow on V3 surfaces: invoice console
  and detail, search/filter/sort and bulk actions, due-date selection,
  creation, review, line-item editing, and finalisation.
- Replaced direct confirmation dialogs across announcements, inbox, class
  roll, settings, people, classes, and invoices with one shared V3
  confirmation sheet. The chat attachment chooser now uses the same V3
  sheet and quick actions instead of the last Cupertino action sheet.
- Removed the unused pre-redesign student-search helper and its
  `multi_select_flutter` dependency.
- Hardened the writes behind the new surfaces. Class creation is one backend
  transaction with a stable client id. Invoice creation and feedback reuse
  stable request ids after ambiguous responses. Swap, absence, waitlist,
  person, settings, roll, and invoice actions now lock their full route while
  pending and refresh after ambiguous or partial results.

**Why:** The role-level screens were already redesigned, but an admin could
still cross into the old interface while managing a class or creating an
invoice. Direct Material and Cupertino dialogs also remained in shared flows.
Those were the last reachable visual seams from the pre-redesign app.

**Status:** Complete on `feat/mobile/v3-foundation`, not yet merged. A source
scan finds no Material or Cupertino dialog or action sheet anywhere in
`lib/src` — no `showDialog`, `AlertDialog`, `CupertinoActionSheet` or date/time
picker dialog remains — and the only `showModalBottomSheet` call is the one
inside the shared `AppBottomSheet` helper. (Ordinary page navigation still uses
`MaterialPageRoute`, and two `PopupMenuButton` menus are deliberate V3
affordances in the new admin console and roster.) All 869 mobile tests, 589
backend unit tests, and 84 backend emulator tests pass. Formatting is clean,
analysis has no errors or warnings (3 existing information findings), and the
production web build succeeds.

**Next steps**

- Product-owner visual acceptance of the completed admin flows and a live
  invoice PDF smoke test. These are acceptance checks, not remaining legacy
  code.

---

## 2026-07-29 — Deleted the dead legacy code left by the redesign

**What changed**
- Audited the mobile app for anything left over from the pre-redesign
  interface, then deleted everything that no user could actually reach —
  15 files and about 2,850 lines.
- The old dashboard, the old user list and user detail screen, and the old
  class timetable layout are gone. Each had been kept as a safety net for a
  user whose account type the app did not recognise, but such an account never
  reaches those screens: the app shows it a "contact support" page first. The
  net could not catch anything.
- Payslips are gone — two screens and all their supporting code. The feature
  had no way in from anywhere in the app and no server support behind it,
  though it was still being set up in memory on every app launch.
- Also removed: a developer log viewer with no entry point, an empty file
  checked into a stray folder, and five small unused helpers.
- Updated the redesign roadmap to match, including correcting its claim that
  these screens were still reachable.

**Why:** The redesign has replaced every screen the three account types
actually use, but the old versions were still sitting in the codebase behind
guards that could never fire. Keeping them made the app look less finished
than it is, made the class timetable file nearly twice the size it needed to
be, and left a reader unsure which version was the real one.

**Status:** Complete on the `feat/mobile/v3-foundation` branch, not yet merged.
No behaviour changed: the test suite is 762 tests before and after, and none
of them referenced any deleted code — which is itself the evidence none of it
was reachable. Formatting, analysis and the web build all pass.

**Next steps**
- The two reachable admin clusters named here were completed later on
  29 Jul 2026; see **Last reachable legacy mobile flows moved to V3** above.

---

## 2026-07-29 — Two tutors can now mark one roll

**What changed**

- Most classes are taught by two tutors. They can now each work through their
  half of the class on their own phone, and both sets of marks are kept. Until
  now, whoever saved second wiped the other one's work.
- Marking a student **Away** no longer removes them from the class for that
  week. It used to free their seat, so a parent could book a spot that was not
  really free, and it sent admins a "student removed from class" alert every
  time — neither of which had anything to do with the tutor marking a roll.
- The roll count is now honest while a roll is being marked. It used to show
  "NO ROLL" until the whole class was finished, because the app could not tell
  a roll nobody had started from one where everybody was away. It can now, so a
  half-marked roll reads "ROLL 3/6".
- Two tutors writing feedback about the same student in the same lesson now
  overwrite each other rather than sending the family two separate notes.
- The attendance report was reading the same list, so once absent students
  stopped being removed from it every session would have looked fully attended.
  It now reads the roll properly, and still reads older sessions the old way.
- A one-off script is ready to fill in the roll for sessions that were marked
  before this change. It has not been run yet.

**Why:** All three problems had one cause. A single list on the session was
being used to mean two different things — who is booked in, and who turned up —
so recording the second destroyed the first.

**Status:** Built on `feat/mobile/roll-marks`, not merged. 762 mobile tests and
586 backend tests pass, and the full check passes. Tried on the phone against
real data: marked one student, saved, reopened the roll from scratch and marked
a second — both were still there, and the class still showed 4/4 seats after
the away mark. Two students on the Monday 5:00 Years 5–10 session are now
marked (Elijah here, Ethan away) as a result of that test; the roll is still
listed as needing attention, so it can be corrected when it is marked properly.

**Next steps**

- Run the backfill for already-marked sessions: `npm run dryrun:roll-marks`
  first, then `npm run backfill:roll-marks`. Blocked on local Google
  credentials having expired — needs `gcloud auth application-default login`.
- Decide whether the roll should offer a "mark everyone here" button. Opening a
  roll used to show every student as present by default; it now starts blank,
  which is what makes the counts true but costs a tap per student when the
  whole class turns up.

---

## 2026-07-28 — Admins now use the proper roll screen

**What changed**

- Marking attendance as an admin now opens the same screen tutors use — the one
  drawn in the redesign, with Here/Away, a progress marker and a feedback box
  per student. Admins had still been getting the old dialog.
- The old dialog was doing two different jobs at once: marking the roll, and
  adding or removing students from the class. The redesign treats those
  separately, so the menu now does too — "Mark the roll" and "Enrolments".
- If a class has no session for that week yet, or the week has been cancelled,
  "Mark the roll" is greyed out and says why, rather than looking available.

**Why:** A correction. The redesign already had a screen for marking a roll, and
it was already built for tutors. The previous two entries improved the old admin
dialog when the right answer was to stop using it for this job.

**Status:** Built on `feat/mobile/v3-foundation`, not merged. 745 tests pass
(up from 741) and the full check passes. Checked on the phone: an admin now
opens the proper roll screen, with saving correctly unavailable until the roll
is filled in. Nothing was saved.

**Next steps**

- Still on the old design: adding and removing students from a class, assigning
  tutors, the waitlist, and adding a class.

---

## 2026-07-28 — Removing a student made clearer and shorter

**What changed**

- Removing a student from a class used to be: tap an unlabelled red bin, pick
  the only option offered, then confirm. The middle step was pointless — it
  never had more than one real choice — and the only red text on it was
  "Cancel", so the way out looked more dangerous than the removal.
- It is now one step. The button says what it does, and the confirmation states
  whether the student is being taken off the class from now on, or just for this
  week — which are very different things and previously read almost the same.

**Why:** Found by opening the screen as an admin. Two unlabelled icons sat next
to each student's name with no way to tell what either would do.

**Status:** Built on `feat/mobile/v3-foundation`, not merged. 741 tests pass
(up from 738) and the full check passes. Checked on the phone up to the
confirmation, then backed out without changing anything.

**Next steps**

- The rest of that screen is still on the old design: the attendance
  checkboxes, "Add Student", and the feedback box. So are the tutor,
  waitlist and add-class screens.

---

## 2026-07-28 — Class actions rebuilt; two dangerous ones fixed

**What changed**

- Rebuilt the menu that opens when an admin taps a class. It used to be five
  plain lines of text; each option now says what it will actually do.
- **Fixed a genuinely dangerous pair of buttons.** The menu had "Cancel This
  Session" and, directly beneath it, "Cancel Class" — same red, same first word.
  The first drops one week and can be undone. The second *permanently deletes
  the whole class and unenrols every student in it*, and the only hint was the
  word "(delete)" in the confirmation. Afterwards it said "Class cancelled",
  which is not what happened.
  - It is now "Delete this class", it tells you how many students it will
    unenrol, and it says "Class deleted" when it is done.
- **Fixed the weekly cancellation having no confirmation at all.** It went ahead
  the instant it was tapped, so one mis-tap cancelled that week's class for
  every family booked in. It now asks first, and says plainly that other weeks
  are unaffected.
- The two actions are now clearly different: cancelling a week is amber and
  reversible, deleting a class is red with a bin icon and warns it cannot be
  undone.

**Why:** These were the most damaging buttons in the admin app, sitting side by
side, nearly identically labelled, with the safer one guarded and the
destructive one not.

**Status:** Built on `feat/mobile/v3-foundation`, not merged. 738 tests pass
(up from 726) and the full check passes. Checked on the phone as far as the
confirmation, then backed out without changing anything.

**Next steps**

- Four screens behind this menu are still on the old design: editing students
  and attendance, assigning tutors, the waitlist, and adding a class.

---

## 2026-07-28 — First real admin run-through; four fixes

**What changed**

Went through the four new admin screens signed in as a real admin, on real
data, for the first time. Everything so far had been checked one screen at a
time against made-up examples. Four things were wrong, and all four could only
have shown up this way:

- **The dashboard said "8 need action" but listed three.** The list is capped,
  which is right for a dashboard, but it said nothing about the other five and
  there was no way to reach them. It now ends with "5 more rolls outstanding",
  which opens the timetable.
- **On the class timetable, class rows were cut off mid-word** when two tutors
  were assigned — which is normal here. The seat count is now written more
  compactly, and the line wraps instead of truncating when it still does not fit.
- **A family on the billing screen was listed as "I family".** Their name is
  recorded as "Monica I", and the screen was taking the last word as a surname.
  It now shows the name as recorded when the last word is just an initial.
- **Invoice numbers were showing as bare numbers** — "350" sitting next to
  "$700.00", which reads like a second amount. They now show as "INV-350".

**Why:** Every one of these is a case real records produce and invented examples
do not: a busy day, two tutors on a class, a name recorded with an initial, and
invoice numbers stored without a prefix.

**Status:** Fixed and tested on `feat/mobile/v3-foundation`, not merged. 726
tests pass (up from 719) and the full check passes. Still awaiting sign-off.

**Next steps**

- The tutor dashboard has the same "count says more than the list shows"
  problem. It is tracked separately rather than changed while the admin screens
  are under review.

---

## 2026-07-28 — Admin account screen rebuilt

**What changed**

- Rebuilt the screen an admin sees when they tap a person: contact details, the
  family's lesson credits with an edit button, their children (tap to see which
  classes each is in, and to remove them), the family's invoices, and the
  account-deletion actions.
- **Nothing about what these actions do changed.** Editing credits, removing a
  student, deleting an account and opening an invoice PDF all go through exactly
  the same code as before, still refuse to run with no connection, and still ask
  for confirmation first.
- The warning before deleting an account is now written for the case at hand.
  Deleting a parent says plainly that it also deletes their children; deleting a
  tutor no longer mentions students at all.
- Only this family's invoices are shown. The screen previously drew from a list
  that could still be holding a different family's billing.
- Fixed a layout fault spotted on the phone: every invoice row had an empty gap
  down its left side, left by a component that reserves space for a time.

**Why:** This screen sits directly behind the new admin people directory, so
tapping someone dropped straight from the new design onto the old one.

**Status:** Built on `feat/mobile/v3-foundation`, not merged. 719 tests pass
(up from 707), and the full check passes. Seen on a phone but not signed off.

**Next steps**

- Sign it off along with the four admin screens.
- The class-editing forms and invoice creation/review are the last screens still
  on the old design.

---

## 2026-07-28 — Admin billing console; all screens now redesigned

**What changed**

- Rebuilt the admin billing screen: total outstanding at the top, filters for
  all/overdue/unpaid/paid, a list of overdue families and a list of recent
  payments. Overdue invoices are graded — red once a family is more than a week
  late, amber before that.
- **Replaced the "send reminders" buttons with something true.** The design had
  a button to chase all overdue families, a chase button on each row, and a
  count of how many reminders each family had received. Reminders already go out
  automatically, nothing is recorded when one is sent, and there is no way to
  send one by hand — so all three were dropped. Each overdue row now says when
  the next automatic reminder is due, which is something the app can actually
  work out. Tests pin this to the real schedule, so if the reminder timing ever
  changes they fail first.
- The existing full invoice list — searching, sorting, selecting several at
  once, bulk actions — is untouched and reached through "View all invoices".
  Only the summary screen in front of it is new.
- Fixed a rendering fault caught on the phone: the coloured edge on each overdue
  card was built in a way Flutter refuses to draw at all, which would have
  crashed the screen.

**Why:** This was the last screen in the redesign. With it done, every screen
in the app — for families, tutors and admins — is on the new design.

**Status:** Built on `feat/mobile/v3-foundation`, not merged. 707 tests pass
(up from 677), and the full check passes. Seen on a phone but not signed off.

**Next steps**

- Sign off the four admin screens together. None of them has been seen with the
  row of tabs at the bottom of the screen, so that is worth checking in one go.
- Some deeper screens are still on the old design: the account detail screen,
  the class-editing forms, and invoice creation and review. They are the
  remaining work.

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
  tutor saves fails. *(Deployed 29 Jul 2026 — see that day's rules-deployment
  entry.)*
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

## 2026-07-28 — One-way Google Calendar timetable export

**What changed:**

- Added a scheduled Firebase Function that reconciles this Sydney week's
  Firestore attendance sessions into a dedicated Google Calendar every 15
  minutes.
- Kept the authority boundary one-way: the Function reads Firestore and writes
  Calendar, with no Calendar-to-Firestore writes, webhook, import, or stored
  Calendar state.
- Added private ownership metadata so the exporter can restore edits, recreate
  deleted mirror events, remove duplicates, and delete stale mirror events
  without touching unrelated Calendar events.
- Exported class type, weekly tutor assignments, scheduled student count,
  cancellation state, and class times. Student names and Calendar attendees
  are excluded.
- Added a Firestore activation document, keyless IAM-signed Calendar OAuth,
  unit coverage, an activation/operations runbook, and strict Function
  inventory controls.

**Why:** Staff need Google Calendar as a convenient display of Tenacity's
timetable while Firestore remains the only editing surface and source of
truth.

**Status:** Initial deployment completed; activation remains disabled while the
keyless Calendar OAuth fix is reviewed and deployed.

**Next steps:**

- Enable IAM Service Account Credentials, grant the runtime identity
  self-signing permission, deploy the keyless OAuth fix through the guarded
  workflow, and repeat the first-run verification in
  `docs/integrations/google-calendar-export.md`.

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

1. **MOB-8's badge is not in a released app yet** — the 9am overstaffed-class
   summary was deployed on 9 September 2026 alongside MOB-48, releasing the hold
   deliberately rather than waiting. Until 3.1.0 (build 515) reaches admins,
   that notification points at a badge their installed app does not draw.
   Closed by shipping the mobile release.

2. **Version stacks only group what history has loaded** — resource history
   reads the 50 most recent jobs, so a resource revised over a long period can
   have older versions outside that window. Those versions are not grouped, and
   the version numbers shown count only what is loaded. The stack says so when
   it cannot see its own original. Fixing it properly means querying by
   `lineageRootId` and adding the composite index for it. Roughly half a day.

3. **The installed admin portal cannot start offline** — the service worker
   caches the app shell, so it launches instantly, but `AuthProvider` forces a
   token refresh (`getIdTokenResult(true)`) on every auth state change. With no
   connection that call hangs and the app falls through to the login page
   rather than saying it is offline. No screen reads from cache either, by
   design. Making a cold offline launch graceful is its own piece of work.
   Roughly 1–2 days.

4. **Resource generation has a hard 9-minute ceiling** — tracked as AWP-16.
   Generation runs in an event-driven Cloud Function, which Google caps at 540
   seconds, and that cannot be raised while the function is triggered by a
   Firestore write. Pressure on the budget has since been reduced: PDF conversion
   was moved out of it (2026-08-14) and document building measures at 1–5ms, so
   the remaining time is nearly all the AI itself. Only worth acting on if
   measurement shows generation approaching the limit. Several days.

5. **Teaching resources still hand-repair the AI's JSON** — tracked as AWP-15. The generator asks
   the model for JSON as free text and then patches what comes back: stripping
   code fences, repairing LaTeX backslashes, and re-prompting the model when the
   result still will not parse. Current models can be constrained to a schema so
   the response is valid by construction, which would delete most of that
   machinery and remove a whole class of failure. Larger than a model swap and
   deliberately left out of the model upgrade. Roughly 2–3 days.

6. **Test accounts in production** — mostly resolved 2026-08-13. An audit of
   every live account found no tutor or admin test account left — the ones
   parents could actually see and message are gone, most of them already swept
   up by the same day's chat cleanup. One test account remains
   (`test@tenacitytutoring.com`, parent role): kept deliberately as a working
   smoke-test rig with real Stripe history, and invisible to other parents
   under the existing parent-to-parent rule either way. An internal-account
   tier (TP-12) was built to formalise hiding and restricting accounts like it,
   then reverted the same day — not worth the app-adoption risk of the
   Firestore rule it needed for a problem that turned out to already be this
   narrow. Revisit only if a live prod test tutor/admin account becomes
   necessary again before MOB-13 (staging Cloud Functions) lands.
7. **`purgeOldInvoices` dry run never terminates** — the dry-run branch of
   `purgeOldInvoicesImpl` re-runs an unchanged query instead of advancing a
   cursor, so any dataset with more than one page of matching invoices loops
   forever. Only the real-delete path makes progress. An hour, plus a test.
8. **Production template federation migration** — the six inert production
   templates still describe key-based credentials; the org key-creation ban
   means they must move to workload identity federation (production-scoped
   binding) before production activation.
9. **Vercel rebind** — point only project `tenacity-tutoring-tqi9` at
   `apps/website`; leave the duplicate `tenacity-tutoring` project untouched.
10. **Phase 4 no-op cutover, then Phase 5 shared contracts** — after all
   activation gates close.
11. **Rotate legacy credentials** — the old `tenacity-tutoring-2` Function
   metadata exposed plaintext Stripe test and SendGrid credentials; rotate
   both (separate from migration work).
12. **Phantom Firebase app ids in the mobile app** — `firebase apps:list` shows
   production has one Android app (`…android:9687c859…`) and one iOS app
   (`…ios:48ad56f6…`), and no macOS app. `lib/firebase_options.dart` names
   `…android:db66400b…` and `…ios:4276aa2d…`, neither of which exists, and
   `main.dart` passes those options explicitly so they win over the correct
   native config files. App Check and FCM registration are per-app-id. Fix is a
   `flutterfire configure` regeneration in its own PR; expect iOS FCM tokens to
   be reissued. Half a day including a TestFlight sanity check.
13. **Two live Stripe keys from different accounts** — Remote Config serves
   `pk_live_51Svtsi…`; `AndroidManifest.xml` carried `pk_live_51NGMmN…` with a
   leftover "Replace with your actual key" comment. The manifest value is now
   a per-flavor placeholder with production unchanged, but which key is correct
   still needs confirming against the Stripe dashboard. An hour.
14. **`Term.isActive` is always false** — `term_model.dart` reads
   `data['status'] == true` while the backend writes `status` as a string
   (`"active"`). One-line fix, but it changes production behaviour, so it wants
   its own change and a check of every call site.
15. **Inherited advisories** — dependency advisories, two website Hooks
   warnings, and 3 Flutter informational findings remain separate remediation
   work. (Recounted 2026-07-29 after the final legacy-surface pass: zero errors
   or warnings; the remaining findings are two
   `use_build_context_synchronously` notices in chat and one private-test-type
   notice.)
16. **Xero double-payment on paid sync** — `xero_functions.js` explicitly
   skips the duplicate check when marking an invoice paid in Xero. Must be
   reviewed before re-enabling `XERO_PAYMENT_SYNC`; while the flag is off the
   risk is dormant. Check Xero for existing overpaid invoices.
   *Corrected 2026-08-05:* this item previously described
   `markInvoicePaidInXero` firing twice, once "directly from
   `stripe_webhooks.js`". That path could not fire — nothing imported that
   file, and it has since been deleted. Only the `onInvoiceStatusChanged`
   trigger calls it, so the double-fire described here was never real. The
   missing duplicate check is.

17. **Payments with no invoice are invisible in the app** — the `paymentLogs`
   ledger records every payment, but nothing reads it. A payment that matches
   no invoice (a Xero-only charge such as INV-409, or a one-off booking whose
   client-side invoice creation failed) exists in Firestore and cannot be seen
   by an admin. Needs `paymentLogs` readable by admins in Firestore rules, a
   model and service in the mobile app, and ledger entries merged into
   `buildAdminBillingViewData` alongside the invoice-derived ones. Roughly half
   a day. *Updated 2026-08-06:* still open, and it is why the lost $70 booking
   was invisible until a parent reported it — the ledger had the payment all
   along.

18. **One-off bookings have no server-side invoice record** — for a
   `one_off_booking` payment the backend deliberately writes no invoice
   (`payment_functions.js`), leaving `timetable_screen.dart` to create it after
   the card is charged. If the app is killed, loses connection, or the
   enrolment step fails for every student, the money is in Stripe and nothing
   is in Firestore. The `catch` only calls `debugPrint`. Three such payments
   succeeded on 2026-05-23 and should be checked. No reconciliation job exists.
   *Closed 2026-08-06:* the backend now completes a one-off booking itself from
   the PaymentIntent, and `reconcileOneOffPayments` sweeps nightly for any it
   missed. The three payments from 23 May and the one from 6 August predate the
   booking context, so the sweep will alert on them rather than complete them —
   they still need a human, but they will no longer be invisible.

19. **Every Function carries a 200MiB entrypoint** — requiring `lib/index.js`
   takes RSS from 33MiB to 200MiB across 1,775 modules, because it
   top-level-requires `xero-node`, `pdf-parse`, `xlsx`, `sharp`, `pdfkit`,
   `mammoth` and the Anthropic SDK for all 85 functions. At the 256MiB default
   that leaves ~56MiB of working room, which is what killed
   `verifyPaymentStatus` on 6 August; 50 OOMs across six other services in the
   preceding 60 days. Four payment functions were raised to 512MiB as a
   stopgap, and on 13 August four more — `sendChatMessage`, `onMessageReceived`,
   `onInvoiceStatusChanged` and `syncGoogleCalendar` — after the first
   parent-visible failure: a parent could not send a message, and the invoice
   trigger was dying silently while Xero went unsynced. Eight functions are now
   individually bumped, which is the argument for stopping the whack-a-mole.
   The real fix is lazy `require`s inside the handlers that need them, which
   would cut ~150MiB off every function and make the bumps unnecessary.
   Touches every function's startup path, so it needs its own verification pass.

20. **A crash between a token booking and its debit gives a free class** —
    `timetable_screen.dart` enrols the student, then calls `decrementTokens`
    separately. The same defect as the payment one fixed on 6 August, in token
    currency rather than dollars. A `bookOneOffWithTokens` callable doing both
    in one transaction is the fix.

21. **Welcome and enrolment emails still look plain** — those two go out from
    SendGrid dynamic templates set up in the SendGrid dashboard, so the
    branding done for the weekly update on 2026-08-11 did not reach them. A
    parent now gets a designed weekly update and an unstyled welcome from the
    same business. Either restyle the two templates in the dashboard to match,
    or move them into code alongside the weekly-update renderer. Template IDs
    are in `backend/firebase/functions/lib/email_functions.js`.

22. **Notifications are still trigger-driven, not event-driven** — PR #111
    (2026-08-21) stopped the class-swap notification storm with a
    `bulk_attendance_sync` guard on multi-document attendance writes, but the
    underlying model is unchanged: every push still infers intent from a
    Firestore document diff. `lib/events/event_publisher.js` and
    `lib/events/event_handler.js` already sketch the right shape — publish one
    named business event per user action (`student.swapped`, `student.enrolled`,
    etc.) and let a single handler send exactly one notification — but neither
    file is wired into `lib/index.js` and both date to the Phase 2 extraction.
    Add a Firestore `notifications` collection as a durable record so dropped
    pushes are not silently lost and the admin and resource portals have
    something to build an inbox on. Note the sketch routes events through
    Pub/Sub, which is more infrastructure than this needs: the dependency is
    not installed, the topic does not exist, and there is no Pub/Sub emulator,
    so that path would have no test coverage. Every mutation already runs
    through a callable that knows the intent, so the dispatch should be
    in-process. Those two files are the last of the dead notification code
    cleared on 2026-08-22, and come out as part of this item, which replaces
    them. Several days.

23. **Firestore TTL policy for `notifications.expiresAt`** — every row written
    since 2026-08-23 carries a six-month expiry field, but the policy that
    acts on it is not applied. The deploy pipeline compares TTL policies and
    never sets them, so this is a console or `gcloud` operation done out of
    band and recorded in `docs/operations`. Until it is, the collection grows
    without bound. Minutes.

24. **No in-band way to deploy drifted staging rules** — the rehearsal workflow
    has a scenario for a project that has never been deployed to and one for a
    project already current, and nothing for one that has fallen behind, which
    is the only state that actually needs a deploy. The 1 Sep 2026 deploy went
    around it from a laptop for exactly this reason. Part of TP-19; probably a
    fourth scenario with the same evidence and gating. Roughly half a day.

25. **Storage rules have never been released to staging** — the
    `cloud.storage/…firebasestorage.app` release returns 404, so the drift
    check fails on that surface every run until it is deployed once. Nothing
    has needed Storage on staging until now; attachment uploads (MOB-37) do.
    Minutes, plus deciding whether it goes through the rehearsal workflow.

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

---

## Operational notes

- **2026-07-29 — Firestore rules deployed to production.**
  `backend/firebase/rules/firestore.rules` released to
  `tenacity-tutoring-b8eb2` (rules only; no functions, indexes or hosting).
  Source hash `7abb2680…42022`, matching the re-captured
  `backend/firebase/inventory/source-baseline.json`. The 18-test rules suite
  (`apps/admin-portal`, `npm run test:rules`) passed against the emulator
  beforehand. The change is backward-compatible — the new feedback keys are
  optional — so no client dependency was created by deploying ahead of the app.
  Deployed from this monorepo rather than `tsowmi03/tenacity-web-portal`; see
  the deployment-ownership note in `backend/firebase/README.md`.
