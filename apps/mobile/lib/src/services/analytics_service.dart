import 'package:flutter/foundation.dart';
import 'package:posthog_flutter/posthog_flutter.dart';
import 'package:tenacity/src/config/app_environment.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/parent_model.dart';

/// Every product event the app sends (MOB-60). Only declared events can be
/// captured, so a call site cannot invent a name nobody reviewed.
///
/// Outcomes (succeeded, failed, cancelled) are a property rather than separate
/// events. Business results (enrolments, swaps, payments received) also arrive
/// from the server (TP-35); these events add what only the app sees: attempts,
/// failures and cancellations.
enum AppEvent {
  absenceReported('absence_reported'),
  swapRequested('swap_requested'),
  oneOffBooked('one_off_booked'),
  permanentEnrolmentRequested('permanent_enrolment_requested'),
  waitlistJoined('waitlist_joined'),
  chatMessageSent('chat_message_sent'),
  announcementOpened('announcement_opened'),
  invoicePaymentStarted('invoice_payment_started'),
  invoicePaymentSubmitted('invoice_payment_submitted'),
  invoicePaymentCancelled('invoice_payment_cancelled'),
  invoicePaymentFailed('invoice_payment_failed'),
  notificationOpened('notification_opened'),
  termsAccepted('terms_accepted');

  const AppEvent(this.eventName);

  final String eventName;
}

/// Product analytics through PostHog US Cloud (MOB-59, MOB-60).
///
/// Production and staging builds both send. Staging shares the production
/// project (the free plan allows one) and every event carries
/// `environment: staging`, which dashboards filter out (TP-36). Every call
/// here is safe while off, and a PostHog failure is logged rather than thrown,
/// so analytics can never take the app down.
///
/// What is sent: app lifecycle events, Flutter and native errors, a screen
/// view per bottom-navigation tab, the [AppEvent]s, session replay (unmasked,
/// approved 2026-10-15; PostHog still hides password fields), and the
/// signed-in user's UID with their name, email, role and, for parents, how
/// many students they have. Surveys, feature flags and PostHog push handling
/// are off.
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
      // Recorded only inside PostHogWidget (main.dart). Tom approved replay
      // without masking; the SDK still masks password and card fields, and
      // native screens such as Stripe's payment sheet are not captured.
      ..sessionReplay = true
      ..surveys = false
      ..preloadFeatureFlags = false
      ..sendFeatureFlagEvent = false
      // The app's own FCM handling owns push. Left on, the SDK registers the
      // token with PostHog and, on iOS, observes the notification delegate.
      ..capturePushNotificationSubscriptions = false
      ..capturePushNotificationOpened = false
      ..debug = kDebugMode;
    config.sessionReplayConfig
      ..maskAllTexts = false
      ..maskAllImages = false;
    config.errorTrackingConfig
      ..captureFlutterErrors = true
      ..capturePlatformDispatcherErrors = true
      ..captureNativeExceptions = true;

    try {
      await Posthog().setup(config);
      await _registerEnvironment();
      _enabled = true;
    } catch (error) {
      debugPrint('Analytics failed to start: $error');
    }
  }

  /// The person properties PostHog shows for [user].
  @visibleForTesting
  static Map<String, Object> personProperties(AppUser user) {
    final name = '${user.firstName} ${user.lastName}'.trim();
    return {
      if (name.isNotEmpty) 'name': name,
      if (user.firstName.isNotEmpty) 'first_name': user.firstName,
      if (user.lastName.isNotEmpty) 'last_name': user.lastName,
      if (user.email.isNotEmpty) 'email': user.email,
      'role': user.role,
      if (user is Parent) 'student_count': user.students.length,
    };
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
      // reset() clears super properties, and staging events without the tag
      // would slip past the dashboards' staging filter.
      await _guard(_registerEnvironment);
      return;
    }

    if (user.uid == _identifiedUid) return;
    _identifiedUid = user.uid;
    await _guard(
      () => Posthog().identify(
        userId: user.uid,
        userProperties: personProperties(user),
      ),
    );
  }

  /// A screen view, named after the bottom-navigation destination.
  static Future<void> screen(String name) async {
    if (!_enabled) return;
    await _guard(() => Posthog().screen(screenName: name));
  }

  /// One [AppEvent]. Null property values are dropped; never pass names,
  /// message text or other free text a person typed.
  static Future<void> capture(
    AppEvent event, [
    Map<String, Object?> properties = const {},
  ]) async {
    if (!_enabled) return;
    final cleaned = <String, Object>{
      for (final entry in properties.entries)
        if (entry.value != null) entry.key: entry.value!,
    };
    await _guard(
      () => Posthog().capture(eventName: event.eventName, properties: cleaned),
    );
  }

  static Future<void> _registerEnvironment() =>
      Posthog().register('environment', AppEnvironment.analyticsName);

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

  @visibleForTesting
  static void enableForTest() {
    _enabled = true;
  }
}
