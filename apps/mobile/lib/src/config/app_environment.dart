import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/services.dart' show appFlavor;

// TODO(staging): once the Phase 0 config reconciliation lands, this import
// becomes `firebase_options_prod.dart` and `firebase_options.dart` is deleted,
// so an unqualified `flutterfire configure` cannot silently overwrite the live
// configuration.
import 'package:tenacity/firebase_options.dart' as prod;
import 'package:tenacity/firebase_options_staging.dart' as staging;

/// Which backend this binary talks to.
enum TenacityEnv { prod, staging }

/// Compile-time environment selection.
///
/// The value comes from `--dart-define=TENACITY_ENV=...` rather than from
/// [appFlavor], because `flutter build web` and `flutter test` have no flavor
/// and must still resolve deterministically. [assertFlavorMatchesEnvironment]
/// covers the case where the two disagree on a native build.
class AppEnvironment {
  const AppEnvironment._();

  static const String _raw =
      String.fromEnvironment('TENACITY_ENV', defaultValue: 'prod');

  static final TenacityEnv current = _parse(_raw);

  static TenacityEnv _parse(String value) {
    switch (value) {
      case 'prod':
        return TenacityEnv.prod;
      case 'staging':
        return TenacityEnv.staging;
      default:
        // Deliberately fatal. A typo in --dart-define must not silently fall
        // back to prod and ship a build pointed at real customer data.
        throw StateError(
          'Unknown TENACITY_ENV "$value". Expected "prod" or "staging".',
        );
    }
  }

  static bool get isProduction => current == TenacityEnv.prod;

  static bool get isStaging => current == TenacityEnv.staging;

  static FirebaseOptions get firebaseOptions => switch (current) {
        TenacityEnv.prod => prod.DefaultFirebaseOptions.currentPlatform,
        TenacityEnv.staging => staging.DefaultFirebaseOptions.currentPlatform,
      };

  /// Label for the persistent staging ribbon; null in production.
  static String? get bannerLabel => isStaging ? 'STAGING' : null;

  /// Apple Pay merchant id is registered against the production App ID only,
  /// so Apple Pay is unavailable under the staging bundle id.
  static String? get appleMerchantIdentifier =>
      isProduction ? 'merchant.com.tenacitytutoring.tenacity' : null;

  /// Guards against a Remote Config template carrying the wrong Stripe mode.
  static String get expectedStripeKeyPrefix =>
      isProduction ? 'pk_live_' : 'pk_test_';

  /// Fails fast when `--flavor` and `--dart-define=TENACITY_ENV` disagree.
  ///
  /// This is the control that turns "staging binary silently writing to
  /// production" into an immediate, obvious crash. [appFlavor] is null on web
  /// and in tests, where there is no flavor to check.
  static void assertFlavorMatchesEnvironment() {
    assert(() {
      final flavor = appFlavor;
      if (flavor != null && flavor != current.name) {
        throw StateError(
          'Build mismatch: --flavor "$flavor" but TENACITY_ENV "${current.name}". '
          'Use apps/mobile/scripts/run.sh so the two cannot drift.',
        );
      }
      return true;
    }());
  }

  /// Warns when the Remote Config Stripe key does not match the environment.
  ///
  /// A staging build holding a `pk_live_` key is invisible until someone is
  /// actually charged, so it is worth an explicit check.
  static void assertStripeKeyMatchesEnvironment(String publishableKey) {
    assert(() {
      if (publishableKey.isEmpty) return true;
      if (!publishableKey.startsWith(expectedStripeKeyPrefix)) {
        throw StateError(
          'Stripe key mismatch: ${current.name} expected a key starting with '
          '"$expectedStripeKeyPrefix" but Remote Config supplied '
          '"${publishableKey.substring(0, publishableKey.length.clamp(0, 8))}...". '
          'Check the Remote Config template for this project.',
        );
      }
      return true;
    }());
  }
}
