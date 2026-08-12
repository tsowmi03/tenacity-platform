# Mobile staging environment

- Purpose: run the Flutter app against a separate Firebase project full of
  synthetic data, so full user flows can be rehearsed before anything ships.
- Firebase project: `tenacity-tutoring-staging` (reused — see the caveat below)
- Status: repository work landed; provider provisioning outstanding.
- Checked: 12 August 2026

This runbook covers the mobile staging environment only. For the rules and
index deploy rehearsal that the same project was originally built for, see
[`firebase-staging-rehearsal.md`](firebase-staging-rehearsal.md).

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
- `apps/mobile/ios/Flutter/{Debug,Release,Profile}-{prod,staging}.xcconfig` —
  written but **not yet referenced by the Xcode project** (see below).

## Outstanding — provider provisioning

All of the following needs owner authorization. `firebase-staging-rehearsal.md`
states that changing IAM, federation, or environment policy requires new
explicit authority.

1. Enable the Cloud Functions, Cloud Run, Cloud Build, Artifact Registry,
   Secret Manager and Identity Toolkit APIs.
2. Register three client apps: iOS and Android on
   `com.tenacityTutoring.tenacity.staging`, plus Web so CI's `flutter build web`
   keeps resolving.
3. Enable Email/Password sign-in. Leave every other provider off.
4. Upload the APNs auth key so FCM push works for the staging bundle id.
5. Register App Check. Use **App Attest** for iOS; use the **Debug** provider
   for Android, because a staging Android build is never distributed through
   Play and Play Integrity cannot succeed for it. Leave enforcement **off** —
   nothing server-side calls `enforceAppCheck`.
6. Create a third federated identity `tenacity-staging-functions@…` with
   functions-deploy roles, Secret Manager accessor and Service Account User,
   bound to the `environment:tenacity-staging` principal set. The existing
   rules and indexes identities must not be widened.
7. Raise the AUD 10/month budget before the first Functions deploy. Cloud Build
   and Artifact Registry alone will exceed it. Budgets alert; they do not cap.
8. Secret Manager: `STRIPE_KEY` (`sk_test_…`), `STRIPE_WEBHOOK_SECRET` (from a
   new Stripe **test-mode** webhook endpoint pointed at the staging
   `stripeWebhook` URL), `SENDGRID_API_KEY`.
9. Set `STAGING_EMAIL_SINK` in `.env.tenacity-tutoring-staging` to an address
   you actually read. Until it is set, staging drops outbound mail entirely.

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

## Outstanding — Xcode project

The xcconfig files exist but nothing references them yet. `project.pbxproj` has
to be edited in Xcode, not by hand:

1. Duplicate the three build configurations into six: `Debug-prod`,
   `Release-prod`, `Profile-prod`, `Debug-staging`, `Release-staging`,
   `Profile-staging`, each pointing at the matching xcconfig.
2. Add a `staging` scheme (and rename the existing one to `prod`) bound to the
   matching configurations, then delete the unflavored `Runner` scheme so
   nobody builds it by accident.
3. Move `ios/Runner/GoogleService-Info.plist` to `ios/config/prod/`, remove it
   from Copy Bundle Resources, and add a Run Script phase **before** Copy
   Bundle Resources:
   ```sh
   cp "${SRCROOT}/config/${FLAVOR}/GoogleService-Info.plist" \
      "${BUILT_PRODUCTS_DIR}/${PRODUCT_NAME}.app/GoogleService-Info.plist"
   ```
   The plist is deliberately still at `ios/Runner/` in the repository: moving
   it before the copy phase exists would break every iOS build.
4. Set `CFBundleDisplayName` to `$(APP_DISPLAY_NAME)` in `Runner/Info.plist`.
5. Create `Runner-staging.entitlements` from the existing one, but **drop** the
   `com.apple.developer.in-app-payments` array unless a staging Apple Pay
   merchant id is registered — an entitlement naming an unregistered merchant
   fails provisioning-profile generation.

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
