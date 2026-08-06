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
   warnings, and 3 Flutter informational findings remain separate remediation
   work. (Recounted 2026-07-29 after the final legacy-surface pass: zero errors
   or warnings; the remaining findings are two
   `use_build_context_synchronously` notices in chat and one private-test-type
   notice.)
6. **Xero double-payment on paid sync** — `xero_functions.js` explicitly
   skips the duplicate check when marking an invoice paid in Xero. Must be
   reviewed before re-enabling `XERO_PAYMENT_SYNC`; while the flag is off the
   risk is dormant. Check Xero for existing overpaid invoices.
   *Corrected 2026-08-05:* this item previously described
   `markInvoicePaidInXero` firing twice, once "directly from
   `stripe_webhooks.js`". That path could not fire — nothing imported that
   file, and it has since been deleted. Only the `onInvoiceStatusChanged`
   trigger calls it, so the double-fire described here was never real. The
   missing duplicate check is.

7. **Payments with no invoice are invisible in the app** — the `paymentLogs`
   ledger records every payment, but nothing reads it. A payment that matches
   no invoice (a Xero-only charge such as INV-409, or a one-off booking whose
   client-side invoice creation failed) exists in Firestore and cannot be seen
   by an admin. Needs `paymentLogs` readable by admins in Firestore rules, a
   model and service in the mobile app, and ledger entries merged into
   `buildAdminBillingViewData` alongside the invoice-derived ones. Roughly half
   a day. *Updated 2026-08-06:* still open, and it is why the lost $70 booking
   was invisible until a parent reported it — the ledger had the payment all
   along.

8. **One-off bookings have no server-side invoice record** — for a
   `one_off_booking` payment the backend deliberately writes no invoice
   (`payment_functions.js`), leaving `timetable_screen.dart` to create it after
   the card is charged. If the app is killed, loses connection, or the
   enrolment step fails for every student, the money is in Stripe and nothing
   is in Firestore. The `catch` only calls `debugPrint`. Three such payments
   succeeded on 2026-05-23 and should be checked. No reconciliation job exists.
   *Updated 2026-08-06:* this happened for real — a $70 booking was lost. The
   fix that day mitigates it (the app no longer abandons a booking when
   verification fails, and records the PaymentIntent id on the invoice) but does
   not close it: fulfilment still runs on the phone. The durable fix is Phase 2,
   which also brings the reconciliation sweep this item asks for. Add the 6
   August payment to the three from 23 May.

9. **Every Function carries a 200MiB entrypoint** — requiring `lib/index.js`
   takes RSS from 33MiB to 200MiB across 1,775 modules, because it
   top-level-requires `xero-node`, `pdf-parse`, `xlsx`, `sharp`, `pdfkit`,
   `mammoth` and the Anthropic SDK for all 85 functions. At the 256MiB default
   that leaves ~56MiB of working room, which is what killed
   `verifyPaymentStatus` on 6 August; 50 OOMs across six other services in the
   preceding 60 days. Four payment functions were raised to 512MiB as a
   stopgap. The real fix is lazy `require`s inside the handlers that need them,
   which would cut ~150MiB off every function and make the bumps unnecessary.
   Touches every function's startup path, so it needs its own verification pass.

10. **A crash between a token booking and its debit gives a free class** —
    `timetable_screen.dart` enrols the student, then calls `decrementTokens`
    separately. The same defect as the payment one fixed on 6 August, in token
    currency rather than dollars. A `bookOneOffWithTokens` callable doing both
    in one transaction is the fix.

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
