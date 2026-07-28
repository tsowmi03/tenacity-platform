# Google Calendar timetable export

## Purpose and authority boundary

Google Calendar is a read-only display of Tenacity's current timetable.
Firestore remains the only timetable authority.

The integration has one data direction:

```text
Firestore classes and attendance -> scheduled Function -> Google Calendar
```

The Function reads Firestore and writes Google Calendar. It never writes
Calendar data, event IDs, revisions, or user edits to Firestore. There is no
Calendar webhook, polling import, or Calendar-to-Firestore code path.

## Exported scope

Every 15 minutes, `syncGoogleCalendar` reconciles the current Sydney week,
Monday 00:00 through the next Monday 00:00.

The source documents are:

- `classes/{classId}` for class type and start/end times;
- `classes/{classId}/attendance/{attendanceId}` for the dated session,
  cancellation state, scheduled students, and that week's tutor assignments;
- `users/{tutorId}` for tutor display names; and
- `integrations/googleCalendarExport` for activation and the target Calendar
  ID.

Each Calendar event contains the class type, tutor names, scheduled student
count, start/end time, and a warning that Tenacity is the editing surface.
Student names are not exported. Calendar attendees are not added, so the
export does not send invitations or create event copies in other calendars.
Cancelled sessions remain visible with a `Cancelled:` title and free-time
transparency.

## Reconciliation behavior

The Function places two private extended properties on every owned event:

- `tenacityManaged=firestore-week-v1`; and
- `tenacitySource=classes/{classId}/attendance/{attendanceId}`.

Those hidden properties form the ownership boundary. On each run, the Function:

1. creates missing events;
2. restores Firestore-controlled fields after a Calendar edit;
3. recreates an owned event deleted in Calendar;
4. removes duplicates; and
5. deletes owned events that are no longer in the current Firestore week.

It only updates or deletes events carrying the Tenacity ownership marker.
Unrelated events on the same calendar are never selected. A dedicated calendar
is still required so the runtime identity has no access to personal calendars.

## Activation prerequisites

The repository change does not activate the export or mutate production.
Activation requires a separately authorized provider window.

1. Enable the Google Calendar API and IAM Service Account Credentials API in
   `tenacity-tutoring-b8eb2`.
2. Create a dedicated Google Calendar owned by the Tenacity Google account.
3. Identify the deployed Function's runtime service-account email.
4. Grant the runtime service account `roles/iam.serviceAccountTokenCreator` on
   itself. This permits only keyless signing with its system-managed key.
5. Share only the dedicated calendar with that identity using the Calendar
   `writer` role. Share it with human viewers as `reader` if the Calendar UI
   must itself be read-only.
6. Create `integrations/googleCalendarExport` in production Firestore:

   ```text
   enabled: true
   calendarId: "<dedicated calendar ID>"
   ```

7. Deploy Functions through the guarded production workflow and its fresh
   authorization record, baseline, arming window, and post-deploy inventory
   checks.

If the config document is absent or `enabled` is not exactly `true`, the
scheduled Function logs a skipped run and makes no Calendar API request.
The Calendar ID is configuration rather than a secret. No service-account key
or Workspace user impersonation is required. The attached runtime identity
uses IAM Credentials `signJwt` with its system-managed key, exchanges that JWT
for a one-hour token carrying only the Calendar events scope, and refreshes the
token before expiry.

## Operational checks

After activation:

1. Confirm the first run reports the expected `desired`, `created`, `updated`,
   `unchanged`, and `deleted` counts.
2. Compare all events for the current Sydney week against the admin timetable.
3. Edit one mirror event in Calendar and confirm it is restored within 15
   minutes.
4. Delete one mirror event and confirm it is recreated within 15 minutes.
5. Create an unrelated event and confirm the exporter leaves it untouched.
6. Set `enabled: false` to stop all Calendar API activity without deleting
   existing mirror events.

Disabling is intentionally non-destructive. If the mirror must be removed,
delete the dedicated calendar after disabling the Firestore config.

## Local validation

From the repository root:

```bash
npm --prefix backend/firebase/functions test
npm --prefix backend/firebase/functions run smoke
node scripts/ci/check-functions-inventory.mjs
node --test scripts/ci/test/*.test.mjs
```

The unit suite uses fake Firestore and Calendar adapters. It does not call
production or require Google credentials.
