# Staging flavor Android config

`google-services.json` for the staging Firebase project belongs here.

It is intentionally absent until the staging Android app is registered. The
Google Services Gradle plugin fails the build with an explicit "File
google-services.json is missing" error listing this directory, which is the
behaviour we want: a staging build must never fall back to the production
Firebase project.

That fallback is exactly why `google-services.json` no longer sits at
`android/app/google-services.json` — that path resolves for *every* flavor.
The production copy now lives in `android/app/src/prod/`.

To generate this file:

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
