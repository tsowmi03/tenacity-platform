# Pending Firestore rules deployment

- Raised: 28 July 2026
- Status: **outstanding — blocks the V3 mobile release**
- Source: `backend/firebase/rules/firestore.rules`

## What must happen

`backend/firebase/rules/firestore.rules` has changed in the working tree and
those changes are **not deployed**. The mobile V3 tutor build writes feedback
documents that the currently deployed rules reject.

**The rules must be deployed before, or at the same time as, the mobile build
that writes them.** Shipping the app first breaks every roll submission a
tutor makes.

## Why the order matters

`validFeedbackCreate()` constrains a feedback document with
`request.resource.data.keys().hasOnly([...])`. Any key not on that list causes
the whole create to be denied.

The tutor-session contract adds three keys to feedback documents:

| Key | Purpose |
| --- | --- |
| `classId` | The class the feedback came out of |
| `sessionId` | The attendance document id, so feedback matches its roll |
| `progress` | `ahead` \| `onTrack` \| `needsSupport` |

Against the deployed rules those keys are not on the allow-list, so a tutor
saving a roll gets `permission-denied` for every student they wrote about. The
roll's completion stamp is written last precisely so this failure leaves the
session marked incomplete rather than half-done — but the tutor still cannot
finish their work.

The matching client change is in `apps/mobile`:
`TutorSessionService.submitSession` and `FeedbackService.addFeedback`.

## What is safe

- The new keys are **optional** in the updated rules. Existing clients that do
  not send them keep working unchanged, so deploying the rules early is safe
  and carries no client dependency.
- Attendance needed no rules change: `rollCompletedAt` and `rollCompletedBy`
  are covered by the existing `allow create, update, delete: if isStaff()` on
  `classes/{classId}/attendance/{attendanceId}`.

Because the rules are backward-compatible, **deploy the rules first** and the
app afterwards. There is no window in which the rules deployment alone breaks
anything.

## Verification

The updated rules are covered by `apps/admin-portal/test/firestoreRules.test.mjs`:

- `allows session-linked feedback from a marked roll`
- `rejects malformed session links and progress values`

Run against the emulator:

```bash
cd apps/admin-portal && npm run test:rules
```

## Source baseline

`backend/firebase/inventory/source-baseline.json` still records the **previously
reviewed** hash for `firestore.rules`. That mismatch is deliberate: it is the
signal that source and deployed rules have diverged. Re-capture the hash as
part of the deployment, not before it.

Current source hash:

```
7abb2680c67cc7b8cc721f9f57de3977f5d4715e36a155185b6702b126642022
```

## Closing this note

Delete this file once the rules are deployed and the source baseline is
re-captured, and record the deployment in `log.md` under Operational notes.
