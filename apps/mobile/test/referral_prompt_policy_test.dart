import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/helpers/referral_prompt_policy.dart';
import 'package:tenacity/src/models/feedback_model.dart';

StudentFeedback _note(
  String id, {
  StudentProgress? progress = StudentProgress.onTrack,
  DateTime? createdAt,
}) {
  return StudentFeedback(
    id: id,
    studentId: 's1',
    tutorId: 't1',
    parentIds: const ['p1'],
    feedback: 'Good work',
    subject: 'Maths',
    createdAt: createdAt ?? DateTime(2026, 10, 9, 17),
    isUnread: true,
    progress: progress,
  );
}

ReferralFeedbackState _state({
  int count = 0,
  Set<String> ids = const {},
  DateTime? countFrom,
}) {
  return ReferralFeedbackState(
    countFrom: countFrom ?? DateTime(2026, 10, 1),
    countedIds: ids,
    positiveCount: count,
  );
}

ReferralGateInput _gate({
  bool isParent = true,
  bool isOnline = true,
  bool hasOverdueInvoice = false,
  String? lastShownDay,
  bool shownThisSession = false,
  bool enabled = true,
  DateTime? now,
}) {
  return ReferralGateInput(
    isParent: isParent,
    isOnline: isOnline,
    hasOverdueInvoice: hasOverdueInvoice,
    lastShownDay: lastShownDay,
    shownThisSession: shownThisSession,
    enabled: enabled,
    now: now ?? DateTime(2026, 10, 9, 18),
  );
}

void main() {
  group('evaluateReferralGate', () {
    test('shows when every rule passes', () {
      expect(evaluateReferralGate(_gate()), ReferralGateResult.show);
    });

    test('checks the rules in order', () {
      expect(
        evaluateReferralGate(_gate(isParent: false, isOnline: false)),
        ReferralGateResult.notParent,
      );
      expect(
        evaluateReferralGate(_gate(isOnline: false, hasOverdueInvoice: true)),
        ReferralGateResult.offline,
      );
      expect(
        evaluateReferralGate(
          _gate(hasOverdueInvoice: true, lastShownDay: '2026-10-09'),
        ),
        ReferralGateResult.overdueInvoice,
      );
      expect(
        evaluateReferralGate(
          _gate(lastShownDay: '2026-10-09', shownThisSession: true),
        ),
        ReferralGateResult.alreadyShownToday,
      );
      expect(
        evaluateReferralGate(_gate(shownThisSession: true, enabled: false)),
        ReferralGateResult.alreadyShownThisSession,
      );
      expect(
        evaluateReferralGate(_gate(enabled: false)),
        ReferralGateResult.disabled,
      );
    });

    test('a prompt yesterday does not block today', () {
      expect(
        evaluateReferralGate(_gate(lastShownDay: '2026-10-08')),
        ReferralGateResult.show,
      );
    });

    test('the day turns over at local midnight', () {
      expect(referralDayKey(DateTime(2026, 10, 9, 23, 59)), '2026-10-09');
      expect(referralDayKey(DateTime(2026, 10, 10, 0, 1)), '2026-10-10');
    });
  });

  group('isNewReferralSession', () {
    final paused = DateTime(2026, 10, 9, 18);

    test('a short trip to the background keeps the session', () {
      expect(
        isNewReferralSession(
          pausedAt: paused,
          resumedAt: paused.add(const Duration(minutes: 29)),
        ),
        isFalse,
      );
    });

    test('30 minutes or more away starts a new one', () {
      expect(
        isNewReferralSession(
          pausedAt: paused,
          resumedAt: paused.add(referralSessionGap),
        ),
        isTrue,
      );
    });

    test('a resume without a recorded pause is not a new session', () {
      expect(
        isNewReferralSession(pausedAt: null, resumedAt: paused),
        isFalse,
      );
    });
  });

  group('countPositiveFeedback', () {
    test('prompts on the 1st, 3rd and 5th positive note', () {
      var state = _state();
      final prompts = <bool>[];
      for (var i = 1; i <= 6; i++) {
        final out = countPositiveFeedback(state: state, shown: [_note('n$i')]);
        prompts.add(out.promptDue);
        state = out.state;
      }
      expect(prompts, [true, false, true, false, true, false]);
      expect(state.positiveCount, 6);
    });

    test('never counts Needs support or unrated notes', () {
      final out = countPositiveFeedback(
        state: _state(),
        shown: [
          _note('a', progress: StudentProgress.needsSupport),
          _note('b', progress: null),
        ],
      );
      expect(out.promptDue, isFalse);
      expect(out.state.positiveCount, 0);
    });

    test('counts Ahead as positive', () {
      final out = countPositiveFeedback(
        state: _state(),
        shown: [_note('a', progress: StudentProgress.ahead)],
      );
      expect(out.promptDue, isTrue);
    });

    test('viewing the same note again changes nothing', () {
      final first = countPositiveFeedback(state: _state(), shown: [_note('a')]);
      final again = countPositiveFeedback(state: first.state, shown: [_note('a')]);
      expect(again.promptDue, isFalse);
      expect(again.state.positiveCount, 1);
    });

    test('ignores feedback written before counting began', () {
      final out = countPositiveFeedback(
        state: _state(countFrom: DateTime(2026, 10, 9)),
        shown: [
          _note('old', createdAt: DateTime(2026, 9, 1)),
          _note('older', createdAt: DateTime(2025, 3, 1)),
        ],
      );
      expect(out.promptDue, isFalse);
      expect(out.state.positiveCount, 0);
    });

    test('several new notes at once prompt once if they pass an odd position', () {
      // Count 1 → 3: passes the 3rd.
      final out = countPositiveFeedback(
        state: _state(count: 1, ids: {'x'}),
        shown: [_note('a'), _note('b')],
      );
      expect(out.promptDue, isTrue);
      expect(out.state.positiveCount, 3);
    });

    test('a single new note at an even position does not prompt', () {
      final out = countPositiveFeedback(
        state: _state(count: 1, ids: {'x'}),
        shown: [_note('a')],
      );
      expect(out.promptDue, isFalse);
    });

    test('remembers a bounded number of ids', () {
      final ids = {for (var i = 0; i < referralCountedIdsCap; i++) 'old$i'};
      final out = countPositiveFeedback(
        state: _state(count: ids.length, ids: ids),
        shown: [_note('new')],
      );
      expect(out.state.countedIds.length, referralCountedIdsCap);
      expect(out.state.countedIds, contains('new'));
      expect(out.state.countedIds, isNot(contains('old0')));
    });
  });

  test('the share message carries the link and the offer', () {
    final message = referralShareMessage('https://tenacitytutoring.com/r/ABC234');
    expect(message, contains('https://tenacitytutoring.com/r/ABC234'));
    expect(message, contains(r'$10/hr off for a term'));
  });
}
