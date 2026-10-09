import 'package:flutter/foundation.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/models/invoice_model.dart';

/// When the app asks a parent to refer a friend (MOB-51).
///
/// Pure, like `one_off_payment_decision.dart`: every rule about *whether* to
/// prompt lives here and is tested without Firestore, Remote Config or a
/// signed-in parent. The controller only gathers the facts and acts on the
/// answer.
///
/// Modelled on Prospa: prompt after routine positive moments, counted rather
/// than timed, one at a time, with an always-on entry point (the dashboard
/// card and the Profile row) that ignores all of this.

/// The moments that can raise a referral prompt.
enum ReferralTrigger {
  /// A new positive feedback note was shown (see [countPositiveFeedback]).
  positiveFeedback,

  /// A term invoice payment was confirmed in the app.
  invoicePaid,

  /// A one-off class was booked and paid for by card.
  oneOffPaid,

  /// A one-off class was booked with lesson tokens.
  oneOffTokens,

  /// A student was enrolled permanently into a class.
  permanentEnrolment,
}

/// Why a prompt was or was not shown, in the order the rules are checked.
enum ReferralGateResult {
  show,
  notParent,
  offline,
  overdueInvoice,
  alreadyShownToday,
  alreadyShownThisSession,
  disabled,
}

/// The facts the gate needs, gathered by the controller at the moment a
/// trigger fires.
@immutable
class ReferralGateInput {
  final bool isParent;
  final bool isOnline;
  final bool hasOverdueInvoice;

  /// The local calendar day a prompt was last shown, as `yyyy-MM-dd`, or null
  /// if never.
  final String? lastShownDay;

  final bool shownThisSession;
  final bool enabled;
  final DateTime now;

  const ReferralGateInput({
    required this.isParent,
    required this.isOnline,
    required this.hasOverdueInvoice,
    required this.lastShownDay,
    required this.shownThisSession,
    required this.enabled,
    required this.now,
  });
}

/// The local calendar day of [time] as `yyyy-MM-dd`, the form stored as
/// `lastShownDay`.
String referralDayKey(DateTime time) {
  final local = time.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${local.year}-${two(local.month)}-${two(local.day)}';
}

/// Whether a trigger that just fired may show the referral sheet.
///
/// A prompt that fails any rule is dropped, not saved for later: queuing them
/// would bunch several asks together the moment the rule cleared.
ReferralGateResult evaluateReferralGate(ReferralGateInput input) {
  if (!input.isParent) return ReferralGateResult.notParent;
  // The link has to be fetched before it can be shared.
  if (!input.isOnline) return ReferralGateResult.offline;
  // Never ask for a favour next to a bill that is already late.
  if (input.hasOverdueInvoice) return ReferralGateResult.overdueInvoice;
  if (input.lastShownDay == referralDayKey(input.now)) {
    return ReferralGateResult.alreadyShownToday;
  }
  if (input.shownThisSession) return ReferralGateResult.alreadyShownThisSession;
  if (!input.enabled) return ReferralGateResult.disabled;
  return ReferralGateResult.show;
}

/// Whether any of [invoices] is unpaid past its due date, by the same
/// calendar-day rule the parent invoices screen uses to say "OVERDUE".
bool hasOverdueInvoice(Iterable<Invoice> invoices, DateTime now) {
  final today = DateTime(now.year, now.month, now.day);
  return invoices.any((invoice) {
    if (invoice.status == InvoiceStatus.paid) return false;
    final due = invoice.dueDate.toLocal();
    return DateTime(due.year, due.month, due.day).isBefore(today);
  });
}

/// A session is an app launch, or a return to the app after at least this
/// long in the background.
const referralSessionGap = Duration(minutes: 30);

/// Whether coming back to the foreground at [resumedAt], having gone to the
/// background at [pausedAt], starts a new session.
bool isNewReferralSession({
  required DateTime? pausedAt,
  required DateTime resumedAt,
}) {
  if (pausedAt == null) return false;
  return resumedAt.difference(pausedAt) >= referralSessionGap;
}

/// What the feedback counter has recorded on this device.
@immutable
class ReferralFeedbackState {
  /// Only feedback written after this counts. Set the first time the feature
  /// runs for a parent on a device, so a long-standing family's history never
  /// floods the counter, while a new family's first note still counts.
  final DateTime countFrom;

  /// Positive notes already counted, so viewing one again changes nothing.
  final Set<String> countedIds;

  /// How many positive notes have been counted.
  final int positiveCount;

  const ReferralFeedbackState({
    required this.countFrom,
    required this.countedIds,
    required this.positiveCount,
  });
}

/// The result of counting the feedback on screen.
@immutable
class ReferralFeedbackCount {
  final ReferralFeedbackState state;

  /// Whether a prompt is due: the count passed the 1st, 3rd, 5th… positive
  /// note during this visit. At most one, however many notes were new.
  final bool promptDue;

  const ReferralFeedbackCount({required this.state, required this.promptDue});
}

/// Cap on remembered ids. About a year of weekly notes for several children;
/// anything older is long past [ReferralFeedbackState.countFrom] mattering.
const referralCountedIdsCap = 300;

bool isPositiveFeedback(StudentFeedback feedback) =>
    feedback.progress == StudentProgress.ahead ||
    feedback.progress == StudentProgress.onTrack;

/// Counts newly shown positive notes. "Needs support" and unrated notes never
/// count and never prompt.
ReferralFeedbackCount countPositiveFeedback({
  required ReferralFeedbackState state,
  required Iterable<StudentFeedback> shown,
}) {
  final fresh = shown
      .where(isPositiveFeedback)
      .where((f) => !f.createdAt.isBefore(state.countFrom))
      .where((f) => !state.countedIds.contains(f.id))
      .map((f) => f.id)
      .toSet();
  if (fresh.isEmpty) {
    return ReferralFeedbackCount(state: state, promptDue: false);
  }

  final before = state.positiveCount;
  final after = before + fresh.length;
  // Odd positions prompt: 1st, 3rd, 5th… Did this visit reach one?
  var promptDue = false;
  for (var position = before + 1; position <= after; position++) {
    if (position.isOdd) {
      promptDue = true;
      break;
    }
  }

  final ids = [...state.countedIds, ...fresh];
  final kept = ids.length > referralCountedIdsCap
      ? ids.sublist(ids.length - referralCountedIdsCap)
      : ids;

  return ReferralFeedbackCount(
    state: ReferralFeedbackState(
      countFrom: state.countFrom,
      countedIds: kept.toSet(),
      positiveCount: after,
    ),
    promptDue: promptDue,
  );
}

/// The text shared alongside the link.
String referralShareMessage(String link) =>
    'We love Tenacity Tutoring for our kids. Enrol through my link and we '
    'both get \$10/hr off for a term: $link';
