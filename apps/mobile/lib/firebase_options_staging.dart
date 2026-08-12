// PLACEHOLDER — not yet generated.
//
// The staging Firebase project (`tenacity-tutoring-staging`) has no client app
// registered yet, so there is nothing for FlutterFire to generate from. Until
// that provisioning happens this file fails loudly rather than silently
// resolving to production configuration.
//
// To generate the real file, once the staging iOS/Android/Web apps exist:
//
//   cd apps/mobile
//   flutterfire configure \
//     --project=tenacity-tutoring-staging \
//     --out=lib/firebase_options_staging.dart \
//     --android-package-name=com.tenacityTutoring.tenacity.staging \
//     --ios-bundle-id=com.tenacityTutoring.tenacity.staging \
//     --android-out=android/app/src/staging/google-services.json \
//     --ios-out=ios/config/staging/GoogleService-Info.plist \
//     --ios-build-config=Debug-staging \
//     --platforms=android,ios,web
//
// See docs/operations/mobile-staging-environment.md.

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;

class DefaultFirebaseOptions {
  const DefaultFirebaseOptions._();

  static FirebaseOptions get currentPlatform {
    throw UnsupportedError(
      'Staging Firebase options have not been generated yet. '
      'Register the staging client apps, then run the flutterfire configure '
      'command documented at the top of lib/firebase_options_staging.dart.',
    );
  }
}
