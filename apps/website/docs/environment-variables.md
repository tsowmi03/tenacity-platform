# Environment variables

Create an untracked `apps/website/.env.local` for local development. Never
commit values, and do not copy production credentials into a local write-test
environment during the migration.

## Required names

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id_here
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id_here
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_turnstile_site_key_here
SENDGRID_API_KEY=your_sendgrid_api_key_here
SENDER_EMAIL=your_sender_email_here
RECIEVER_EMAIL=your_recipient_email_here
TURNSTILE_SECRET_KEY=your_turnstile_secret_key_here
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
EMAIL_BLAST_UNSUBSCRIBE_SECRET=your_shared_unsubscribe_secret_here
```

`RECIEVER_EMAIL` preserves the spelling used by the current source. Do not
rename it as part of local configuration.

`EMAIL_BLAST_UNSUBSCRIBE_SECRET` verifies the unsubscribe links in the weekly
parent email, which are minted by the `sendParentEmailBlast` Cloud Function.
The same value must be set here and in the Function's Secret Manager entry of
the same name, or every unsubscribe link is rejected. It is only used to sign
and verify a user ID; rotating it invalidates links already sitting in parent
inboxes.

## Client and server boundaries

The seven `NEXT_PUBLIC_*` names are exposed to browser code. All other names
are server-only and must not use that prefix. Firebase client configuration is
not a substitute for Firestore rules, Turnstile validation, or server-side
authorization.

For an approved non-production project, obtain the Firebase client values from
its web-app configuration. Keep SendGrid, Turnstile, and service-account values
outside Git.

For local server credentials, `GOOGLE_APPLICATION_CREDENTIALS` may reference an
absolute path instead of embedding service-account JSON:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

## Common issues

If the app does not start:

- verify every required name used by the exercised path is present;
- confirm the Firebase project ID is the intended non-production project;
- check that multiline service-account JSON remains valid JSON; and
- keep `.env.local` untracked.

## Deployment hold

Production values remain in the existing Vercel project owned by the original
website repository. Do not add, copy, or change them from this monorepo before
the reviewed cutover. Read the [Vercel deployment controls](./deployment.md).
