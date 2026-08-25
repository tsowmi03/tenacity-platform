import 'dart:async';

import 'package:clock/clock.dart';

import 'package:tenacity/src/models/chat_model.dart';

/// Decides when this user counts as typing, and how often to say so.
///
/// Kept apart from the widget because it is the whole of MOB-27's fix and is
/// worth testing on its own: the screen only forwards keystrokes and lifecycle
/// events, and every rule about throttling, going idle and stopping lives here.
///
/// The contract is deliberately one-directional. Nothing asks this class
/// whether the user is typing — it only reports transitions outward — so the
/// screen cannot drift out of step with Firestore the way the old local
/// `_isTyping` flag did.
class TypingReporter {
  TypingReporter({
    required this.report,
    this.now = _systemClock,
    this.heartbeatInterval = typingHeartbeatInterval,
    this.idleTimeout = typingIdleTimeout,
  });

  /// Writes the heartbeat (`true`) or clears it (`false`).
  final Future<void> Function(bool isTyping) report;

  /// Injected so tests can pin the throttle window without sleeping.
  final DateTime Function() now;

  final Duration heartbeatInterval;
  final Duration idleTimeout;

  static DateTime _systemClock() => clock.now();

  Timer? _idle;
  DateTime? _lastReportedAt;
  bool _isTyping = false;

  /// Whether a heartbeat is currently being maintained. Exposed for tests.
  bool get isTyping => _isTyping;

  /// Call on every keystroke, with the composer's full current contents.
  void onTextChanged(String text) {
    // Trimmed, and trimmed in exactly one place. Three call sites used to
    // decide this independently — two of them without trimming — so a composer
    // holding only spaces meant different things depending on how it got that
    // way.
    if (text.trim().isEmpty) {
      stop();
      return;
    }

    final at = now();
    final due = _lastReportedAt == null ||
        at.difference(_lastReportedAt!) >= heartbeatInterval;

    if (!_isTyping || due) {
      _isTyping = true;
      _lastReportedAt = at;
      _fire(true);
    }

    // Each keystroke pushes the deadline out. Typing that simply stops — the
    // user puts the phone down mid-sentence — is the case the old code could
    // not represent at all.
    _idle?.cancel();
    _idle = Timer(idleTimeout, stop);
  }

  /// Stops announcing, and says so once if we were.
  void stop() {
    _idle?.cancel();
    _idle = null;
    if (!_isTyping) return;
    _isTyping = false;
    _lastReportedAt = null;
    _fire(false);
  }

  void dispose() {
    stop();
    _idle?.cancel();
    _idle = null;
  }

  void _fire(bool isTyping) {
    // Unawaited on purpose: a dropped heartbeat costs the reader nothing that
    // its expiry window does not already cover, and nobody should be shown an
    // error because a keystroke failed to replicate. The controller logs.
    unawaited(report(isTyping));
  }
}
