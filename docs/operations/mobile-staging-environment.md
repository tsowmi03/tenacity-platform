# Mobile staging environment

- Purpose: run the Flutter app against a separate Firebase project full of
  synthetic data, so full user flows can be rehearsed before anything ships.
- Firebase project: `tenacity-tutoring-staging` (reused — see the caveat below)
- Status: **running, with stale rules.** Verified on the iPhone 16 Pro Max
  simulator on 12 Aug 2026 — signed in as a seeded parent and confirmed Week 5
  of Term 3, four classes, invoice 7 and the seeded feedback.
- Cloud Functions **are** deployed: all 33 of the mobile set, `sendChatMessage`
  last deployed 12 Aug 2026 13:27 UTC. An earlier version of this page said
  they were not, which was already wrong when it was written.
- Firestore rules are **six weeks behind the repository** — see the caveat
  below. This is the live problem with staging, not Functions.
- Checked: 1 September 2026

This runbook covers the mobile staging environment only. For the rules and
index deploy rehearsal that the same project was originally built for, see
[`firebase-staging-rehearsal.md`](firebase-staging-rehearsal.md).

## Rules on staging are stale, and fail silently

The deployed Firestore ruleset was created on **22 July 2026** and has not
moved since. The repository's rules are 14,012 bytes; the deployed ones are
8,457.

The consequence is not a visible error. `onlyChangedKeys` rejects an update if
*any* key in it is missing from the allowlist, so a client writing a field the
deployed rules do not know about has its whole write denied — no crash, nothing
in the logs, the feature simply does not work.

Two known instances as at 1 September 2026:

| Field | Landed in | Effect on staging |
|---|---|---|
| `typingHeartbeats` | MOB-27, 25 Aug 2026 | Typing indicators have not worked since |
| `lastReadAt` | MOB-41, 1 Sep 2026 | Unread counts will not clear and read receipts will not update |

Deploy rules before testing anything in chat on staging, and before drawing any
conclusion from what you see there. Rules go out through the
`Rehearse Firebase rules in staging` workflow.

The drift itself — that nothing notices when staging's rules fall behind — is
tracked as TP-19.

How this was checked, so it can be repeated:

```bash
gcloud auth login
TOKEN=$(gcloud auth print-access-token)
curl -s -H "Authorization: Bearer $TOKEN" \
  -H "X-Goog-User-Project: tenacity-tutoring-staging" \
  "https://firebaserules.googleapis.com/v1/projects/tenacity-tutoring-staging/releases/cloud.firestore"
```

Then fetch the named ruleset and compare its source against
`backend/firebase/rules/firestore.rules`. `scripts/firebase/firebase-rules-state.mjs
capture` does the same thing properly, but needs the deploy service account
rather than user credentials.

## What "staging" now means

`tenacity-tutoring-staging` was provisioned as a deliberately inert target for
rehearsing privileged deploys: no client app, Cloud Functions API disabled, no
Auth users, no data, AUD 10/month budget, and two least-privilege federated
identities explicitly forbidden from deploying Functions.

Reusing it for app testing reverses most of that. The rules and index rehearsal
workflows continue to work unchanged, but the project is no longer inert, and
the phrase "staging" now covers two different activities. Anyone reading the
rehearsal runbook should read this one too.

## Decisions

| Decision | Choice | Consequence |
|---|---|---|
| Firebase project | Reuse `tenacity-tutoring-staging` | One less project to govern; the rehearsal target is no longer inert |
| Backend scope | Mobile-facing subset (33 of 87 functions) | No schedulers, no admin portal, no Xero, no AI resources |
| Data | Synthetic seed script | No real customer data ever enters staging |
| Distribution | Separate bundle id `com.tenacityTutoring.tenacity.staging` | Installs alongside production; cannot be submitted by accident |

## Repository state — done

- `backend/firebase/functions/scripts/seedStaging.js` and `scripts/seed/*` —
  synthetic seed with a hardcoded production deny guard.
- `backend/firebase/functions/test/integration/seedStaging.emulator.test.js` —
  21 assertions including seed → reset → seed idempotency.
- `backend/firebase/functions/src/email/sendGuard.js` — outbound-mail guard,
  wired into all four SendGrid call sites.
- `backend/firebase/inventory/staging-functions.json` +
  `scripts/firebase/staging-functions-only.mjs` — the 33-function deploy set.
- `backend/firebase/functions/.env.tenacity-tutoring-staging` — staging params.
- `apps/mobile/lib/src/config/app_environment.dart` — compile-time environment
  selector, flavor/env mismatch assertion, Stripe key mode assertion.
- `apps/mobile/android/app/build.gradle` — `prod` and `staging` product
  flavors; `google-services.json` moved to `src/prod/`.
- `apps/mobile/ios/Flutter/{Debug,Release,Profile}-{prod,staging}.xcconfig` and
  the six matching Xcode build configurations, two schemes and the plist copy
  phase — applied by `apps/mobile/ios/add_flavors.rb`.

## Running it

```bash
cd apps/mobile
flutter run --flavor staging --dart-define=TENACITY_ENV=staging   # staging
flutter run --flavor prod    --dart-define=TENACITY_ENV=prod      # production
```

Both arguments are required and must agree. `AppEnvironment.assertFlavorMatchesEnvironment`
crashes the app in debug builds if they drift, which is what stops a staging
binary from talking to production.

Sign in with any seeded account, password `StagingPass123!`. An orange STAGING
ribbon sits at the top-left on every screen.

## Provisioning — done (12 Aug 2026)

- APIs enabled on `tenacity-tutoring-staging`.
- Three client apps registered:

  | Platform | App id | Identifier |
  |---|---|---|
  | Android | `1:354428033510:android:84d24b7890917cea3a9e27` | `com.tenacityTutoring.tenacity.staging` |
  | iOS | `1:354428033510:ios:8cdad4b21c7b7adc3a9e27` | `com.tenacityTutoring.tenacity.staging` |
  | Web | `1:354428033510:web:7c2058becabc6fae3a9e27` | — |

- Email/Password sign-in enabled.
- Remote Config template published (version 1), including real `terms_content`.
- Synthetic data seeded: 109 documents, 8 accounts.

## Outstanding — provider provisioning

Needs owner authorization. `firebase-staging-rehearsal.md` states that changing
IAM, federation, or environment policy requires new explicit authority.

1. ~~**Functions-deploy identity.**~~ **Done.** Functions were deployed on
   12 Aug 2026, so the identity exists. Booking, chat, waitlist and payment
   flows are no longer blocked by it. Whether items 2 and 4 below were also
   completed has not been verified — the deploy succeeding suggests any secrets
   it needed were in place, but that is inference, not evidence.
2. **Secrets.** `STRIPE_KEY` (`sk_test_…`), `STRIPE_WEBHOOK_SECRET` (from a new
   Stripe **test-mode** webhook endpoint pointed at the staging `stripeWebhook`
   URL), `SENDGRID_API_KEY`.
3. **`STAGING_EMAIL_SINK`** in `.env.tenacity-tutoring-staging`. Until it is
   set, staging drops outbound mail entirely — silently, by design, but it
   looks identical to a broken notification pipeline.
4. **Raise the AUD 10/month budget** before the first Functions deploy. Cloud
   Build and Artifact Registry alone will exceed it. Budgets alert; they do not
   cap. Not needed while only Firestore and Auth are in use.

### Deferred deliberately

- **APNs auth key** — only needed to test push notifications.
- **App Check** — nothing server-side calls `enforceAppCheck`, and enforcement
  is off, so registering it changes nothing today. When it is wanted, use App
  Attest for iOS and the **Debug** provider for Android, since a staging
  Android build is never distributed through Play and Play Integrity cannot
  attest it.

### Staging Remote Config template

Manage this through the CLI, **not** by adding a `remoteconfig` key to
`firebase.json` — `scripts/ci/validate-firebase-config.mjs` asserts an exact
manifest and would reject it.

```bash
firebase remoteconfig:get --project tenacity-tutoring-b8eb2 -o /tmp/rc-prod.json
# edit, then
firebase deploy --only remoteconfig --project staging
```

| Key | Staging value |
|---|---|
| `terms_version` | `1.0.0-staging` |
| `terms_title` | `Tenacity Tutoring T&Cs (Staging)` |
| `terms_content` | **real text — must not be empty or `PLACEHOLDER`** |
| `terms_changelog` | `[]` |
| `one_off_class_price` | `70` |
| `stripe_publishable_key` | `pk_test_…` |

`terms_content` is load-bearing: `lib/src/services/terms_service.dart:37`
throws `StateError` when it is empty or literally `PLACEHOLDER`, which blocks
the T&C gate on first launch and makes staging unusable.

## Xcode project — done

`apps/mobile/ios/add_flavors.rb` applied the project changes through the
`xcodeproj` gem (idempotent, safe to re-run):

- six build configurations, `Debug/Release/Profile` × `prod/staging`, with
  per-flavor bundle identifiers; the original three are kept so an unflavored
  build still works;
- `prod` and `staging` shared schemes — Flutter matches `--flavor` against the
  scheme name, and the error when one is missing is
  "The Xcode project does not define custom schemes";
- a `Copy Firebase config for flavor` build phase that copies
  `ios/config/<flavor>/GoogleService-Info.plist` into the bundle, replacing the
  single hardcoded plist that used to sit in Copy Bundle Resources.

### Why the plist copy is mandatory on iOS

`--dart-define` alone cannot point iOS at another Firebase project. The
`firebase_core` iOS plugin configures the `[DEFAULT]` app from the **bundled
plist** during plugin registration, before any Dart runs. Calling
`Firebase.initializeApp` with a different project then throws
`[core/duplicate-app]`, `main()` dies before `runApp`, and the app shows a
blank screen. On iOS the bundled plist decides the environment; the Dart
options only have to agree with it.

Android is different — there the `google-services.json` under
`src/<flavor>/` is resolved at build time by the Gradle plugin.

### Still to do for a device build

Create `Runner-staging.entitlements` from the existing one, but **drop** the
`com.apple.developer.in-app-payments` array unless a staging Apple Pay merchant
id is registered — an entitlement naming an unregistered merchant fails
provisioning-profile generation. Not needed for the simulator.

## Running the seed

```bash
cd backend/firebase/functions

# dry run — the default, writes nothing
npm run seed:staging -- --projectId=tenacity-tutoring-staging

# commit
npm run seed:staging -- --projectId=tenacity-tutoring-staging --commit --yes

# wipe previously seeded data, then reseed
npm run seed:staging -- --projectId=tenacity-tutoring-staging --reset --commit --yes
```

`--projectId` is required and is never inferred. The other scripts in that
directory fall back to `.firebaserc`, whose default project is **production**;
the seed guard deliberately does not.

`--termsVersion` must match `terms_version` in the target project's Remote
Config template (both are `1.0.0-staging` today). A mismatch leaves every
"accepted" account stranded on a T&C screen it cannot get through, because the
app gates on `!accepted || userAcceptedVersion != currentTerms.version`.

Two things that only fail against a real project, never in the emulator, so
keep them in mind when changing the seed:

- The emulator does not enforce index requirements. A collection-group query
  on `seed.tag` needs an explicit `COLLECTION_GROUP_ASC` exemption that the
  real project does not have, which is why `reset.js` walks subcollections via
  their seeded parents instead.
- `counters/invoices` is never rewound by `--reset`, so invoice numbers keep
  climbing across reseeds (7–12 on the second run, and so on). That is
  correct — rewinding a monotonic allocator produces duplicates.

Seeded accounts share one password (default `StagingPass123!`) and use the
reserved `.invalid` TLD, so a stray SendGrid send cannot reach a real person:
`admin@staging.tenacity.invalid`, `tutor1..3@…`, `parent1..4@…`. Override with
`--emailTemplate='you+{key}@gmail.com'` if you need deliverable addresses.

What gets created: three terms (one active, in week 5 of 10), 8 users, 6
students including one shared-custody case, 5 classes covering all three
enrolment states, 50 attendance docs (marked past weeks, one partially marked,
one cancelled, an unmarked current week, future bookings, and a one-off), 6
invoices across unpaid/paid/overdue, 3 chats, 3 announcements, 4 feedback
entries, a waitlist entry, and 2 enrolments.

## Deploying functions

```bash
node scripts/firebase/staging-functions-only.mjs --verify   # names are real exports
node scripts/firebase/staging-functions-only.mjs | xargs firebase deploy --project staging --only
```

The 33-function set excludes all six schedulers, so there is no Cloud Scheduler
job to pause and `syncGoogleCalendar` — which asserts the production delegated
user and calendar id — never runs.

**Verify before the first real deploy:** whether the Firebase CLI requires
*all* module-level `defineSecret` declarations to resolve, or only those bound
to deployed functions. If the former, staging also needs placeholder `XERO_*`,
`ANTHROPIC_API_KEY` and `EMAIL_BLAST_UNSUBSCRIBE_SECRET` entries. Test with a
dry run.

## Known gaps in staging

| Gap | Reason |
|---|---|
| Invoice PDF download | `getInvoicePdf` needs Xero credentials and a tenant |
| Admin portal | Its callables are outside the deployed subset |
| AI resource generation | Excluded to avoid Anthropic spend |
| Apple Pay | Merchant id is registered against the production App ID only |
| Scheduled jobs | Not deployed |
| `Term.isActive` | Pre-existing bug: `term_model.dart` reads `data['status'] == true` while the backend writes `status` as a string, so it is always false. Unrelated to staging, but seeded data makes it visible. |

## Related production defects found during this work

Neither is caused by the staging work; both were found while verifying config.

1. **Phantom Firebase app ids.** `firebase apps:list` shows the production
   project has exactly one Android app (`…android:9687c859…`) and one iOS app
   (`…ios:48ad56f6…`), and no macOS app. `lib/firebase_options.dart` carries
   `…android:db66400b…` and `…ios:4276aa2d…`, neither of which exists.
   `main.dart` passes those options explicitly, so they win over the correct
   native config files at runtime. App Check and FCM installation registration
   are per-app-id. Being fixed in a separate PR.
2. **Two live Stripe keys from different accounts.** Remote Config serves
   `pk_live_51Svtsi…`, matching the former `main.dart` default. The
   `AndroidManifest.xml` meta-data carried `pk_live_51NGMmN…` with a "Replace
   with your actual key" comment. The manifest value is now a per-flavor
   `manifestPlaceholders` entry, production unchanged, pending confirmation
   against the Stripe dashboard.
