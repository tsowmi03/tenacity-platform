import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/firebase_options.dart' as prod;
import 'package:tenacity/firebase_options_staging.dart' as staging;
import 'package:tenacity/src/config/app_environment.dart';

void main() {
  group('AppEnvironment', () {
    test('defaults to production when TENACITY_ENV is not defined', () {
      // `flutter test` passes no --dart-define, so this exercises the default.
      expect(AppEnvironment.current, TenacityEnv.prod);
      expect(AppEnvironment.isProduction, isTrue);
      expect(AppEnvironment.isStaging, isFalse);
    });

    test('shows no banner in production', () {
      expect(AppEnvironment.bannerLabel, isNull);
    });

    test('expects a live Stripe key in production', () {
      expect(AppEnvironment.expectedStripeKeyPrefix, 'pk_live_');
    });

    test('exposes the Apple Pay merchant id in production', () {
      expect(
        AppEnvironment.appleMerchantIdentifier,
        'merchant.com.tenacitytutoring.tenacity',
      );
    });
  });

  group('Firebase options', () {
    test('production options target the production project', () {
      expect(
        prod.DefaultFirebaseOptions.currentPlatform.projectId,
        'tenacity-tutoring-b8eb2',
      );
    });

    test('staging options target the staging project on every platform', () {
      for (final options in [
        staging.DefaultFirebaseOptions.android,
        staging.DefaultFirebaseOptions.ios,
        staging.DefaultFirebaseOptions.web,
      ]) {
        expect(options.projectId, 'tenacity-tutoring-staging');
        expect(options.messagingSenderId, '354428033510');
      }
    });

    // This is the assertion that catches a bad regeneration pointing staging
    // at production. It must not be dropped.
    test('staging and production are never the same project', () {
      expect(
        staging.DefaultFirebaseOptions.android.projectId,
        isNot(prod.DefaultFirebaseOptions.android.projectId),
      );
      expect(
        staging.DefaultFirebaseOptions.android.appId,
        isNot(prod.DefaultFirebaseOptions.android.appId),
      );
      expect(
        staging.DefaultFirebaseOptions.ios.appId,
        isNot(prod.DefaultFirebaseOptions.ios.appId),
      );
    });

    test('the staging iOS app uses the staging bundle id', () {
      expect(
        staging.DefaultFirebaseOptions.ios.iosBundleId,
        'com.tenacityTutoring.tenacity.staging',
      );
    });

    test('unregistered platforms throw rather than reusing another app id', () {
      // The production options file gives macOS an app id that does not exist
      // in the project; staging must not repeat that.
      debugDefaultTargetPlatformOverride = TargetPlatform.macOS;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);
      expect(
        () => staging.DefaultFirebaseOptions.currentPlatform,
        throwsUnsupportedError,
      );
    });
  });
}
