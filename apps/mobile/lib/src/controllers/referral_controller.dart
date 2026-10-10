import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/helpers/referral_prompt_policy.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/services/referral_service.dart';
import 'package:tenacity/src/ui/components/app_bottom_sheet.dart';
import 'package:tenacity/src/ui/referrals/referral_widgets.dart';

/// The controller provided above [context], or null where there is none.
///
/// Screens report referral moments through this rather than `context.read`, so
/// a screen pumped on its own (as most widget tests do) works without the
/// feature wired up.
ReferralController? maybeReferralController(BuildContext context) {
  try {
    return Provider.of<ReferralController>(context, listen: false);
  } on ProviderNotFoundException {
    return null;
  }
}

/// Puts text on the clipboard. Injectable so tests can see what was copied.
typedef ReferralClipboard = Future<void> Function(String text);

Future<void> _platformClipboard(String text) =>
    Clipboard.setData(ClipboardData(text: text));

/// How long the card says "Link copied" before going back to its call to
/// action.
const referralCopiedFeedback = Duration(seconds: 2);

/// Runs the refer-a-friend prompts (MOB-51): counts positive feedback, decides
/// with [evaluateReferralGate] whether a trigger may show the sheet, and copies
/// the parent's link.
///
/// Screens only report what happened ([trigger], [noteFeedbackShown],
/// [feedbackScreenClosed]); none of them decide whether to ask. The sheet is
/// shown on [navigatorKey], so a trigger can fire from a screen that has just
/// closed.
class ReferralController extends ChangeNotifier with WidgetsBindingObserver {
  ReferralController({
    required ReferralService service,
    required ReferralPromptStore store,
    required GlobalKey<NavigatorState> navigatorKey,
    required bool Function() isEnabled,
    required Future<bool> Function(String parentId) hasOverdueInvoice,
    DateTime Function()? clock,
    ReferralClipboard? clipboard,
  })  : _service = service,
        _store = store,
        _navigatorKey = navigatorKey,
        _isEnabled = isEnabled,
        _hasOverdueInvoice = hasOverdueInvoice,
        _clock = clock ?? DateTime.now,
        _clipboard = clipboard ?? _platformClipboard;

  final ReferralService _service;
  final ReferralPromptStore _store;
  final GlobalKey<NavigatorState> _navigatorKey;
  final bool Function() _isEnabled;
  final Future<bool> Function(String parentId) _hasOverdueInvoice;
  final DateTime Function() _clock;
  final ReferralClipboard _clipboard;

  AppUser? _user;
  bool _isOnline = true;
  bool _shownThisSession = false;
  bool _feedbackPromptDue = false;
  bool _promptInFlight = false;
  DateTime? _pausedAt;
  bool _isCopying = false;
  bool _justCopied = false;
  Timer? _copiedTimer;
  bool _observing = false;

  /// True while the link is still being fetched for a copy. Rare: the link is
  /// warmed at sign-in and kept on the device.
  bool get isCopying => _isCopying;

  /// True for a moment after a copy, so the card can say so.
  bool get justCopied => _justCopied;

  bool get _isParent => _user?.role == 'parent';

  /// Called from the provider whenever who is signed in or connectivity
  /// changes. Signing in as someone else starts a fresh session.
  void update({required AppUser? user, required bool isOnline}) {
    if (!_observing) {
      WidgetsBinding.instance.addObserver(this);
      _observing = true;
    }
    final changedUser = user?.uid != _user?.uid;
    if (changedUser) {
      _shownThisSession = false;
      _feedbackPromptDue = false;
    }
    _user = user;
    _isOnline = isOnline;
    if (changedUser && _isParent && user != null) {
      // Starts the feedback counter now if it has never run for this parent,
      // so a note written after today counts the first time it is opened.
      unawaited(_store.feedbackState(user.uid, _clock()).then((_) {},
          onError: (Object error) {
        debugPrint('[ReferralController] counter start failed: $error');
      }));
      // Warms the link so "Copy my link" never waits on the network. A
      // failure here is retried by the tap itself.
      unawaited(
          _service.linkFor(user.uid).then((_) {}, onError: (Object error) {
        debugPrint('[ReferralController] link warm-up failed: $error');
      }));
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) {
      _pausedAt = _clock();
    } else if (state == AppLifecycleState.resumed) {
      if (isNewReferralSession(pausedAt: _pausedAt, resumedAt: _clock())) {
        _shownThisSession = false;
      }
      _pausedAt = null;
    }
  }

  /// Records feedback notes on screen. A due prompt waits for
  /// [feedbackScreenClosed], so it never covers the note being read.
  Future<void> noteFeedbackShown(Iterable<StudentFeedback> shown) async {
    final uid = _user?.uid;
    if (!_isParent || uid == null) return;
    try {
      final state = await _store.feedbackState(uid, _clock());
      final counted = countPositiveFeedback(state: state, shown: shown);
      if (!identical(counted.state, state)) {
        await _store.saveFeedbackState(uid, counted.state);
      }
      if (counted.promptDue) _feedbackPromptDue = true;
    } catch (error) {
      debugPrint('[ReferralController] feedback count failed: $error');
    }
  }

  /// The parent has left the feedback screen.
  void feedbackScreenClosed() {
    if (!_feedbackPromptDue) return;
    _feedbackPromptDue = false;
    unawaited(trigger(ReferralTrigger.positiveFeedback));
  }

  /// A good moment happened. Shows the sheet if [evaluateReferralGate] allows,
  /// after [delay] so it lands after the screen's own confirmation.
  Future<ReferralGateResult> trigger(
    ReferralTrigger trigger, {
    Duration delay = Duration.zero,
  }) async {
    if (delay > Duration.zero) await Future<void>.delayed(delay);
    final uid = _user?.uid;
    if (_promptInFlight) return ReferralGateResult.alreadyShownThisSession;

    ReferralGateInput input({required bool overdue, String? lastShownDay}) =>
        ReferralGateInput(
          isParent: _isParent,
          isOnline: _isOnline,
          hasOverdueInvoice: overdue,
          lastShownDay: lastShownDay,
          shownThisSession: _shownThisSession,
          enabled: _isEnabled(),
          now: _clock(),
        );

    // The cheap rules first, so the invoice query only runs when it matters.
    var result = evaluateReferralGate(input(overdue: false));
    if (result != ReferralGateResult.show || uid == null) return result;

    _promptInFlight = true;
    try {
      final lastShownDay = await _store.lastShownDay(uid);
      bool overdue;
      try {
        overdue = await _hasOverdueInvoice(uid);
      } catch (error) {
        // Unknown is treated as overdue: missing a prompt costs nothing.
        debugPrint('[ReferralController] overdue check failed: $error');
        overdue = true;
      }
      result = evaluateReferralGate(
        input(overdue: overdue, lastShownDay: lastShownDay),
      );
      if (result != ReferralGateResult.show) return result;

      final context = _navigatorKey.currentContext;
      if (context == null || !context.mounted) {
        return ReferralGateResult.alreadyShownThisSession;
      }

      // Recorded before the sheet opens, so a second trigger while it is up
      // cannot raise another.
      _shownThisSession = true;
      await _store.setLastShownDay(uid, referralDayKey(_clock()));
      if (!context.mounted) return result;

      final copy = await showAppBottomSheet<bool>(
        context: context,
        builder: (sheetContext) => ReferralSheet(
          onCopy: () => Navigator.of(sheetContext).pop(true),
          onNotNow: () => Navigator.of(sheetContext).pop(false),
        ),
      );
      if (copy == true) {
        final copyContext = _navigatorKey.currentContext;
        if (copyContext != null && copyContext.mounted) {
          await copyLink(copyContext);
        }
      }
      return result;
    } finally {
      _promptInFlight = false;
    }
  }

  /// Copies the parent's link, with a line about the offer, to the clipboard.
  /// Used by the pop-up, the dashboard card and the Profile row.
  ///
  /// [confirm] shows a "Link copied" snackbar. The dashboard card turns it
  /// off because its own button already says so; a failure is always shown.
  Future<void> copyLink(BuildContext context, {bool confirm = true}) async {
    final uid = _user?.uid;
    if (uid == null || _isCopying) return;
    final messenger = ScaffoldMessenger.maybeOf(context);

    // Only shown when the warm-up hasn't landed yet; a cached link copies in
    // the same frame.
    final cached = _service.cachedLinkFor(uid);
    if (cached == null) {
      _isCopying = true;
      notifyListeners();
    }
    try {
      final link = cached ?? await _service.linkFor(uid);
      await _clipboard(referralShareMessage(link));
      HapticFeedback.selectionClick();
      _justCopied = true;
      _copiedTimer?.cancel();
      _copiedTimer = Timer(referralCopiedFeedback, () {
        _justCopied = false;
        notifyListeners();
      });
      if (!confirm) return;
      messenger
        ?..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text('Link copied. Paste it into a message to a friend.'),
          ),
        );
    } catch (error) {
      debugPrint('[ReferralController] copy failed: $error');
      messenger?.showSnackBar(
        const SnackBar(
          content: Text("Couldn't get your referral link. Please try again."),
        ),
      );
    } finally {
      _isCopying = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _copiedTimer?.cancel();
    if (_observing) WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}
