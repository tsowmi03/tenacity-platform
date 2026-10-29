import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/ui/feedback/feedback_history_data.dart';

final _now = DateTime(2026, 7, 28, 12);

StudentFeedback _feedback({
  String id = 'f1',
  String tutorId = 't1',
  String subject = 'Year 9 Maths',
  String body = 'Solid work today.',
  DateTime? createdAt,
  bool isUnread = false,
  StudentProgress? progress,
  DateTime? editedAt,
  Map<String, FeedbackResponse> parentResponses = const {},
}) {
  return StudentFeedback(
    id: id,
    studentId: 's1',
    tutorId: tutorId,
    parentIds: const ['p1'],
    feedback: body,
    subject: subject,
    createdAt: createdAt ?? _now,
    isUnread: isUnread,
    progress: progress,
    editedAt: editedAt,
    parentResponses: parentResponses,
  );
}

FeedbackHistoryData _build({
  List<StudentFeedback>? feedback,
  Map<String, String> tutorNames = const {'t1': 'Jordan Lee'},
  String? respondingParentId,
}) {
  return buildFeedbackHistory(
    feedback: feedback ?? [_feedback()],
    tutorNamesById: tutorNames,
    now: _now,
    respondingParentId: respondingParentId,
  );
}

void main() {
  group('ordering', () {
    test('newest first', () {
      final data = _build(
        feedback: [
          _feedback(id: 'old', createdAt: DateTime(2026, 5, 1)),
          _feedback(id: 'new', createdAt: DateTime(2026, 7, 1)),
          _feedback(id: 'middle', createdAt: DateTime(2026, 6, 1)),
        ],
      );

      expect(data.notes.map((n) => n.id), ['new', 'middle', 'old']);
    });

    test('an empty history reports itself', () {
      final data = _build(feedback: const []);
      expect(data.isEmpty, isTrue);
      expect(data.unreadIds, isEmpty);
    });
  });

  group('attribution', () {
    test('names the tutor and the class', () {
      expect(_build().notes.single.attribution, 'Jordan Lee · Year 9 Maths');
    });

    test('falls back for an unresolved author', () {
      // Covers the window before the name lookup returns; a raw uid must
      // never reach a family.
      final data = _build(tutorNames: const {});
      expect(data.notes.single.tutorName, formerTutorDisplayName);
    });

    test('drops an empty subject rather than leaving a dangling separator', () {
      final data = _build(feedback: [_feedback(subject: '')]);
      expect(data.notes.single.attribution, 'Jordan Lee');
    });
  });

  group('unread', () {
    test('collects the ids to mark read', () {
      final data = _build(
        feedback: [
          _feedback(id: 'a', isUnread: true),
          _feedback(id: 'b'),
          _feedback(id: 'c', isUnread: true),
        ],
      );

      expect(data.unreadIds, ['a', 'c']);
      expect(data.notes.where((n) => n.isUnread).length, 2);
    });
  });

  group('progress', () {
    test('carries a status when the record has one', () {
      final data = _build(
        feedback: [_feedback(progress: StudentProgress.needsSupport)],
      );
      expect(data.notes.single.progress, StudentProgress.needsSupport);
    });

    test('is absent on records written before the contract', () {
      expect(_build().notes.single.progress, isNull);
    });
  });

  group('edited notes', () {
    test('are marked, since no second notification is sent', () {
      // Without the marker a family who had already read the note would see
      // different words with nothing to say anything had moved.
      final data = _build(
        feedback: [_feedback(editedAt: DateTime(2026, 7, 28, 11))],
      );

      expect(data.notes.single.isEdited, isTrue);
    });

    test('an untouched note is not marked', () {
      expect(_build().notes.single.isEdited, isFalse);
    });

    test('keep the date of the lesson they are about', () {
      // Re-dating a note to its correction would move it away from the day the
      // family is looking for.
      final data = _build(
        feedback: [
          _feedback(
            createdAt: DateTime(2026, 7, 27, 17),
            editedAt: DateTime(2026, 7, 28, 11),
          ),
        ],
      );

      expect(data.notes.single.dateLabel, 'Yesterday');
    });
  });

  group('feedbackDateLabel', () {
    test('names today and yesterday', () {
      expect(feedbackDateLabel(DateTime(2026, 7, 28, 9), _now), 'Today');
      expect(feedbackDateLabel(DateTime(2026, 7, 27, 9), _now), 'Yesterday');
    });

    test('uses a weekday and date within the year', () {
      expect(feedbackDateLabel(DateTime(2026, 6, 25, 9), _now), 'Thu 25 Jun');
    });

    test('carries the year for an older note', () {
      expect(feedbackDateLabel(DateTime(2025, 11, 3, 9), _now), '3 Nov 2025');
    });
  });

  group('parent responses (MOB-52)', () {
    FeedbackResponse response(
      String parentId, {
      FeedbackResponseType type = FeedbackResponseType.thanks,
      String text = '',
      String parentName = 'Pat Lee',
      DateTime? respondedAt,
    }) =>
        FeedbackResponse(
          parentId: parentId,
          type: type,
          text: text,
          parentName: parentName,
          respondedAt: respondedAt,
        );

    test('a parent may respond to a note they have not responded to', () {
      final data = _build(respondingParentId: 'p1');
      expect(data.notes.single.canRespond, isTrue);
    });

    test('a parent who has responded may not respond again', () {
      final data = _build(
        respondingParentId: 'p1',
        feedback: [
          _feedback(parentResponses: {'p1': response('p1', respondedAt: _now)}),
        ],
      );
      expect(data.notes.single.canRespond, isFalse);
    });

    test('the other parent can still respond', () {
      final data = _build(
        respondingParentId: 'p2',
        feedback: [
          _feedback(parentResponses: {'p1': response('p1', respondedAt: _now)}),
        ],
      );
      expect(data.notes.single.canRespond, isTrue);
    });

    test('staff never get the response buttons', () {
      expect(_build().notes.single.canRespond, isFalse);
    });

    test('responses are oldest first, with an unconfirmed one last', () {
      final data = _build(
        feedback: [
          _feedback(parentResponses: {
            'pending': response('pending', parentName: 'Sam'),
            'later': response(
              'later',
              parentName: 'Quinn',
              type: FeedbackResponseType.question,
              text: 'Fractions at home?',
              respondedAt: _now,
            ),
            'earlier': response(
              'earlier',
              parentName: 'Pat',
              respondedAt: _now.subtract(const Duration(days: 1)),
            ),
          }),
        ],
      );

      final responses = data.notes.single.responses;
      expect(responses.map((r) => r.parentName), ['Pat', 'Quinn', 'Sam']);
      expect(responses.map((r) => r.dateLabel),
          ['Yesterday', 'Today', 'Just now']);
      expect(responses[1].text, 'Fractions at home?');
      expect(responses[1].type, FeedbackResponseType.question);
    });

    test('a response with no stored name is attributed to "Parent"', () {
      final data = _build(
        feedback: [
          _feedback(parentResponses: {
            'p1': response('p1', parentName: '', respondedAt: _now),
          }),
        ],
      );
      expect(data.notes.single.responses.single.parentName, 'Parent');
    });

    test('an unknown response type is dropped rather than guessed at', () {
      expect(FeedbackResponse.fromMap('p1', {'type': 'complaint'}), isNull);
      expect(FeedbackResponse.fromMap('p1', 'not a map'), isNull);
    });
  });
}
