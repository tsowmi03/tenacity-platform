import 'package:flutter/foundation.dart';
import 'package:posthog_flutter/posthog_flutter.dart';
import 'package:tenacity/src/config/app_environment.dart';
import 'package:tenacity/src/models/app_user_model.dart';

/// Product analytics through PostHog US Cloud (MOB-59).
///
/// Off unless this build has a project token: production builds carry one,
/// staging builds don't (see [AppEnvironment.posthogProjectToken]). Every call
/// here is safe while off, and a PostHog failure is logged rather than thrown,
/// so analytics can never take the app down.
///
/// What is sent: app lifecycle events, Flutter and native errors, a screen
/// view per bottom-navigation tab, and the signed-in user's UID with their
/// email and role as person properties (approved 2026-10-14). Session replay,
/// surveys, feature flags and PostHog push handling are all off.
class Analytics {
  const Analytics._();

  static bool _enabled = false;
  static String? _identifiedUid;

  static bool get isEnabled => _enabled;

  /// Starts PostHog. Call once, after `FlutterError.onError` is set, so the
  /// SDK's error capture wraps the app's own handler instead of replacing it.
  static Future<void> init({
    String? projectToken = AppEnvironment.posthogProjectToken,
    String host = AppEnvironment.posthogHost,
  }) async {
    if (_enabled) return;
    if (projectToken == null || projectToken.isEmpty) {
      debugPrint('Analytics off: this build has no PostHog project token.');
      return;
    }

    final config = PostHogConfig(projectToken)
      ..host = host
      ..captureApplicationLifecycleEvents = true
      ..personProfiles = PostHogPersonProfiles.identifiedOnly
      ..sessionReplay = false
      ..surveys = false
      ..preloadFeatureFlags = false
      ..sendFeatureFlagEvent = false
      // The app's own FCM handling owns push. Left on, the SDK registers the
      // token with PostHog and, on iOS, observes the notification delegate.
      ..capturePushNotificationSubscriptions = false
      ..capturePushNotificationOpened = false
      ..debug = kDebugMode;
    config.errorTrackingConfig
      ..captureFlutterErrors = true
      ..capturePlatformDispatcherErrors = true
      ..captureNativeExceptions = true;

    try {
      await Posthog().setup(config);
      await Posthog().register('environment', AppEnvironment.current.name);
      _enabled = true;
    } catch (error) {
      debugPrint('Analytics failed to start: $error');
    }
  }

  /// Keeps PostHog's identity in step with who is signed in.
  ///
  /// [isRestoringSession] guards the window at launch where the user is
  /// signed in but not yet loaded, which must not read as a sign-out.
  static Future<void> syncUser(
    AppUser? user, {
    required bool isRestoringSession,
  }) async {
    if (!_enabled || isRestoringSession) return;

    if (user == null) {
      if (_identifiedUid == null) return;
      _identifiedUid = null;
      await _guard(() => Posthog().reset());
      return;
    }

    if (user.uid == _identifiedUid) return;
    _identifiedUid = user.uid;
    await _guard(
      () => Posthog().identify(
        userId: user.uid,
        userProperties: {
          if (user.email.isNotEmpty) 'email': user.email,
          'role': user.role,
        },
      ),
    );
  }

  /// A screen view, named after the bottom-navigation destination.
  static Future<void> screen(String name) async {
    if (!_enabled) return;
    await _guard(() => Posthog().screen(screenName: name));
  }

  static Future<void> _guard(Future<void> Function() run) async {
    try {
      await run();
    } catch (error) {
      debugPrint('Analytics call failed: $error');
    }
  }

  @visibleForTesting
  static void resetForTest() {
    _enabled = false;
    _identifiedUid = null;
  }
}
