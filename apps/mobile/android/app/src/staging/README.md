# Staging flavor Android config

`google-services.json` for the staging Firebase project belongs here. It is
generated from the registered staging Android app and contains Firebase app
identifiers rather than private credentials.

That fallback is exactly why `google-services.json` no longer sits at
`android/app/google-services.json` — that path resolves for *every* flavor.
The production copy now lives in `android/app/src/prod/`.

To regenerate this file:

```bash
cd apps/mobile
flutterfire configure \
  --project=tenacity-tutoring-staging \
  --out=lib/firebase_options_staging.dart \
  --android-package-name=com.tenacityTutoring.tenacity.staging \
  --ios-bundle-id=com.tenacityTutoring.tenacity.staging \
  --android-out=android/app/src/staging/google-services.json \
  --ios-out=ios/config/staging/GoogleService-Info.plist \
  --ios-build-config=Debug-staging \
  --platforms=android,ios,web
```

See [`docs/operations/mobile-staging-environment.md`](../../../../../docs/operations/mobile-staging-environment.md).
