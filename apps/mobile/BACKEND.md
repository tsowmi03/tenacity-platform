# Backend ownership

Live Firebase Cloud Functions and Firestore rules for Tenacity are owned by the
portal repo:

`../tenacity-web-portal`

Do not deploy backend code from this Flutter repo. This repo only contains the
Flutter app, Firebase app configuration, and hosting configuration.

## Canonical backend paths

- Cloud Functions source: `../tenacity-web-portal/backend/functions`
- Firestore rules: `../tenacity-web-portal/firestore.rules`

## Deploy commands

Run backend deploys from `/Users/thomassowmi/Development/tenacity-web-portal`:

```bash
firebase deploy --only functions --project tenacity-tutoring-b8eb2
firebase deploy --only firestore:rules --project tenacity-tutoring-b8eb2
```

The Flutter app still calls deployed Firebase callable Functions by name. Those
callables are live Firebase services; their source and deployment are managed in
the portal repo.
