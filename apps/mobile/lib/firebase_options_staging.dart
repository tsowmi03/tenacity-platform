// File generated for the STAGING Firebase project.
//
// Values were taken from the registrations in `tenacity-tutoring-staging` and
// cross-checked against the platform config files that FlutterFire produced:
//   android/app/src/staging/google-services.json
//   ios/config/staging/GoogleService-Info.plist
//
// To regenerate:
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
// There is no macOS/Windows/Linux registration in the staging project, so
// those platforms throw rather than silently reusing another platform's app
// id — the exact defect that exists in the production options file today.
//
// ignore_for_file: type=lint
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  const DefaultFirebaseOptions._();

  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not configured for $defaultTargetPlatform '
          'in the staging project. Register an app for that platform in '
          'tenacity-tutoring-staging and regenerate this file.',
        );
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyB5KYVia15zK2mjHsnZx-ErHvd0bbzTblc',
    appId: '1:354428033510:web:7c2058becabc6fae3a9e27',
    messagingSenderId: '354428033510',
    projectId: 'tenacity-tutoring-staging',
    authDomain: 'tenacity-tutoring-staging.firebaseapp.com',
    storageBucket: 'tenacity-tutoring-staging.firebasestorage.app',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyCDHTCjR4K4m7gu0vpYuNeCOhrWw2f-Lbk',
    appId: '1:354428033510:android:84d24b7890917cea3a9e27',
    messagingSenderId: '354428033510',
    projectId: 'tenacity-tutoring-staging',
    storageBucket: 'tenacity-tutoring-staging.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyBhgjDUMsvAf0offRLVcmg12aSUbfV1g6E',
    appId: '1:354428033510:ios:8cdad4b21c7b7adc3a9e27',
    messagingSenderId: '354428033510',
    projectId: 'tenacity-tutoring-staging',
    storageBucket: 'tenacity-tutoring-staging.firebasestorage.app',
    iosBundleId: 'com.tenacityTutoring.tenacity.staging',
  );
}
