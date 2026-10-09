import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
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

/// Shows a share sheet. Injectable so tests can see what would be shared.
typedef ReferralShareSheet = Future<void> Function(
  String text,
  Rect? origin,
);

Future<void> _platformShare(String text, Rect? origin) async {
  await SharePlus.instance.share(
    ShareParams(text: text, sharePositionOrigin: origin),
  );
}

/// Runs the refer-a-friend prompts (MOB-51): counts positive feedback, decides
/// with [evaluateReferralGate] whether a trigger may show the sheet, and shares
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
    ReferralShareSheet? shareSheet,
  })  : _service = service,
        _store = store,
        _navigatorKey = navigatorKey,
        _isEnabled = isEnabled,
        _hasOverdueInvoice = hasOverdueInvoice,
        _clock = clock ?? DateTime.now,
        _shareSheet = shareSheet ?? _platformShare;

  final ReferralService _service;
  final ReferralPromptStore _store;
  final GlobalKey<NavigatorState> _navigatorKey;
  final bool Function() _isEnabled;
  final Future<bool> Function(String parentId) _hasOverdueInvoice;
  final DateTime Function() _clock;
  final ReferralShareSheet _shareSheet;

  AppUser? _user;
  bool _isOnline = true;
  bool _shownThisSession = false;
  bool _feedbackPromptDue = false;
  bool _promptInFlight = false;
  DateTime? _pausedAt;
  bool _isSharing = false;
  bool _observing = false;

  /// True while the link is being fetched for a share.
  bool get isSharing => _isSharing;

  bool get _isParent => _user?.role == 'parent';

  /// Called from the provider whenever who is signed in or connectivity
  /// changes. Signing in as someone else starts a fresh session.
  void update({required AppUser? user, required bool isOnline}) {
    if (!_observing) {
      WidgetsBinding.instance.addObserver(this);
      _observing = true;
    }
    if (user?.uid != _user?.uid) {
      _shownThisSession = false;
      _feedbackPromptDue = false;
    }
    _user = user;
    _isOnline = isOnline;
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

      final share = await showAppBottomSheet<bool>(
        context: context,
        builder: (sheetContext) => ReferralSheet(
          onShare: () => Navigator.of(sheetContext).pop(true),
          onNotNow: () => Navigator.of(sheetContext).pop(false),
        ),
      );
      if (share == true) {
        final shareContext = _navigatorKey.currentContext;
        if (shareContext != null && shareContext.mounted) {
          await this.share(shareContext);
        }
      }
      return result;
    } finally {
      _promptInFlight = false;
    }
  }

  /// Opens the share sheet with the parent's link. Used by the pop-up, the
  /// dashboard card and the Profile row.
  Future<void> share(BuildContext context) async {
    final uid = _user?.uid;
    if (uid == null || _isSharing) return;
    final messenger = ScaffoldMessenger.maybeOf(context);
    final box = context.findRenderObject() as RenderBox?;
    final origin = box != null && box.hasSize
        ? box.localToGlobal(Offset.zero) & box.size
        : null;

    _isSharing = true;
    notifyListeners();
    try {
      final link = await _service.linkFor(uid);
      await _shareSheet(referralShareMessage(link), origin);
    } catch (error) {
      debugPrint('[ReferralController] share failed: $error');
      messenger?.showSnackBar(
        const SnackBar(
          content: Text("Couldn't get your referral link. Please try again."),
        ),
      );
    } finally {
      _isSharing = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    if (_observing) WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}
