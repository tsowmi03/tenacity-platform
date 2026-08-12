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

    // TODO(staging): once the staging client apps are registered and
    // `flutterfire configure` has generated the real file, replace this with
    //   expect(staging...projectId, 'tenacity-tutoring-staging');
    //   expect(staging...projectId, isNot(prod...projectId));
    // That assertion is what catches a bad regeneration pointing staging at
    // production, so it must not be dropped.
    test('staging options fail loudly until they are generated', () {
      expect(
        () => staging.DefaultFirebaseOptions.currentPlatform,
        throwsUnsupportedError,
      );
    });
  });
}
