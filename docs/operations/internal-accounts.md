# Internal accounts

- Purpose: let a small number of real production accounts exist for
  post-release smoke testing, without any parent being able to find or message
  them and without them touching real business data.
- Status: **built, not yet deployed.** No account is marked internal, and the
  rules change has not shipped.
- Checked: 13 August 2026

## Why they exist at all

Accounts created for testing before the staging environment existed were
indistinguishable from real ones. Parents reported messaging them by accident.
`tenacity-tutoring-staging` now covers ordinary testing, so the synthetic
accounts in production should go (TP-13).

What staging cannot cover is verifying *production* after a release — the real
Stripe keys, push delivery from the production Firebase project. That is the
only reason this tier exists. Keep the number of internal accounts as close to
zero as the testing actually requires.

## How it works

`users/{uid}.visibility` is `"standard"` or `"internal"`. `buildUserDoc` always
writes it, so no account created through the portal can be missing it.

`syncUserRoleClaim` mirrors it into an `internal` custom claim. Everything that
enforces the tier reads the **claim**, not the document:

- Firestore rules gate on it, which costs no extra read and cannot be escaped
  by editing one's own user document.
- `refuseInternalAccount` in `payments/paymentSecurity.js` rejects every
  payment callable — it is the single gate `payment_functions.js` and
  `xero_functions.js` already pass through.

The claim only appears when true, so a standard account's token is unchanged
from before this existed.

### What an internal account cannot do

Denied writes on `chats`, `students`, `feedback`, `enrolments` and
`waitlistEntries`, and refused by the payment callables. It can still sign in,
read, and update its own profile — otherwise it could not smoke-test anything.

### What parents cannot do

The `users` read rule denies non-staff any account that is not
`visibility == 'standard'`, so a parent cannot read the document, cannot see it
in a contact list, and therefore cannot open a conversation with it. Chat
creation is denied in the other direction too.

## The rule and the query must agree

This is the part that will bite whoever changes it next.

`fetchAllTutors` and `fetchAllParents` carry
`where('visibility', isEqualTo: 'standard')`. That clause is **load-bearing and
must not be removed**. For a `list`, Firestore decides access from the query's
constraints rather than by inspecting each document, and fails the whole query
if it cannot prove every match is readable — it does not filter denied
documents out. Drop the clause and parents get an *empty* contact list, not a
larger one.

The matching rule uses strict equality:

```
function isDiscoverable(data) {
  return data.visibility == 'standard';
}
```

It cannot be softened to tolerate a missing field. Writing
`!('visibility' in data) || data.visibility == 'standard'` disables the whole
protection: Firestore cannot reason about field existence when proving a query
safe, so the disjunction becomes unprovable, the query is permitted wholesale,
and internal accounts come back in the results. This was verified in the
emulator, and `firestoreRules.test.mjs` pins both halves.

The cost of strictness is that an account without the field is invisible to
non-staff — hence the ordering below.

## Deploy order

The backfill is a hard prerequisite, not a tidy-up.

1. **Backfill.** `node scripts/backfillUserVisibility.js --projectId=tenacity-tutoring-b8eb2`
   to review, then `--commit --yes`. Every user gains `visibility: "standard"`.
2. **Rules and indexes.** Deploy `firestore.rules` and the new
   `users(role, visibility)` composite index. The rule and the query now agree.
3. **App build.** Ship the build carrying the `visibility` filter.
4. **Mark the accounts.** `--setInternal=uid1,uid2 --commit --yes`.

Between 2 and 3 an older app build queries without the constraint and is
denied, losing its contact list until it updates. Ship 3 promptly, or accept
that window.

Step 4 takes effect on the account's next token refresh, since the claim is
mirrored asynchronously. Sign the account out, or expect up to an hour of
stale-token grace during which it still behaves as standard.

## Reversing it

Set `visibility` back to `"standard"` and force a token refresh. Nothing is
destroyed by marking an account internal.
