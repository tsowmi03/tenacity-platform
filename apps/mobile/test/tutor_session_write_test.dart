import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/services/tutor_session_service.dart';
import 'package:tenacity/src/ui/classes/tutor/class_roll_data.dart';

RollStudent _student({
  required String id,
  required RollAttendance attendance,
}) {
  return RollStudent(
    studentId: id,
    name: 'Student $id',
    initials: 'S',
    yearLabel: 'Year 9',
    attendance: attendance,
    parentIds: const ['p1'],
  );
}

final _now = DateTime(2026, 7, 20, 17, 30);

void main() {
  group('roll update', () {
    test('writes one field path per mark, so co-tutors merge', () {
      // The defect this replaced: the whole document was written, so whichever
      // tutor saved second replaced the other's marks entirely.
      final update = rollUpdateFor(
        marks: const {'s1': RollMark.here, 's2': RollMark.away},
        markRollComplete: false,
        completedBy: 'tutor-1',
        now: _now,
      );

      expect(update['marks.s1'], 'here');
      expect(update['marks.s2'], 'away');
      expect(update.keys.where((k) => k.startsWith('marks')), hasLength(2));
    });

    test('never writes the booking list', () {
      // Marking a student away used to remove them from `attendance`, which
      // freed their seat for the week and told admins they had been removed
      // from the class. The booking stands; the mark is the record.
      final update = rollUpdateFor(
        marks: const {'s1': RollMark.away, 's2': RollMark.away},
        markRollComplete: true,
        completedBy: 'tutor-1',
        now: _now,
      );

      expect(update.containsKey('attendance'), isFalse);
    });

    test('a partial save stamps nothing and clears nothing', () {
      // Clearing would revoke a co-tutor's completion: they may have finished
      // the roll between this tutor loading it and saving.
      final update = rollUpdateFor(
        marks: const {'s1': RollMark.here},
        markRollComplete: false,
        completedBy: 'tutor-1',
        now: _now,
      );

      expect(update.containsKey('rollCompletedAt'), isFalse);
      expect(update.containsKey('rollCompletedBy'), isFalse);
      expect(update['updatedBy'], 'tutor-1');
    });

    test('a completing save stamps who and when', () {
      final update = rollUpdateFor(
        marks: const {'s2': RollMark.here},
        markRollComplete: true,
        completedBy: 'tutor-2',
        now: _now,
      );

      expect(update['rollCompletedAt'], Timestamp.fromDate(_now));
      expect(update['rollCompletedBy'], 'tutor-2');
    });

    test('a save with nothing marked still records the touch', () {
      final update = rollUpdateFor(
        marks: const {},
        markRollComplete: false,
        completedBy: 'tutor-1',
        now: _now,
      );

      expect(update.keys.toSet(), {'updatedAt', 'updatedBy'});
    });
  });

  group('feedback edit', () {
    test('writes the body, the status and nothing else about the note', () {
      // An edit corrects what was said. Who said it, which lesson it came out
      // of and when it was written are what the note *was*.
      final update = feedbackEditFor(
        feedback: '  Great work today.  ',
        progress: StudentProgress.ahead,
      );

      expect(update['feedback'], 'Great work today.');
      expect(update['progress'], 'ahead');
      expect(update.keys.toSet(), {'feedback', 'progress', 'editedAt'});
    });

    test('removes the status rather than writing a null', () {
      // The rules constrain which keys a feedback document may carry, and a
      // note with no status legitimately has no key at all.
      final update =
          feedbackEditFor(feedback: 'Solid session.', progress: null);

      expect(update['progress'], isA<FieldValue>());
      expect(update['progress'], FieldValue.delete());
    });

    test('never marks the note unread again', () {
      // The backend notifies on creation only. Resurfacing an edited note in
      // the family's badge count would promise an alert that never comes.
      final update = feedbackEditFor(
        feedback: 'Solid session.',
        progress: StudentProgress.onTrack,
      );

      expect(update.containsKey('isUnread'), isFalse);
      expect(update.containsKey('createdAt'), isFalse);
      expect(update.containsKey('tutorId'), isFalse);
    });

    test('stamps the edit from the server, not the phone', () {
      // A device clock running behind would otherwise date a correction before
      // the note it corrects.
      final update =
          feedbackEditFor(feedback: 'Solid session.', progress: null);

      expect(update['editedAt'], FieldValue.serverTimestamp());
    });
  });

  group('feedback id', () {
    test('is the same for one student in one session', () {
      // Two tutors writing about the same student now overwrite rather than
      // sending the family two notes about the same lesson.
      expect(
        sessionFeedbackId(sessionId: 'T3_W1', studentId: 's1'),
        sessionFeedbackId(sessionId: 'T3_W1', studentId: 's1'),
      );
    });

    test('separates students and sessions', () {
      final ids = {
        sessionFeedbackId(sessionId: 'T3_W1', studentId: 's1'),
        sessionFeedbackId(sessionId: 'T3_W1', studentId: 's2'),
        sessionFeedbackId(sessionId: 'T3_W2', studentId: 's1'),
      };

      expect(ids, hasLength(3));
    });
  });

  group('marks to write', () {
    test('sends only what this tutor changed', () {
      // s2 was already marked by the co-tutor and left alone here. Re-sending
      // it would overwrite whatever they have done since this screen loaded.
      final marks = marksToWrite(
        students: [
          _student(id: 's1', attendance: RollAttendance.here),
          _student(id: 's2', attendance: RollAttendance.here),
        ],
        stored: const {'s2': RollMark.here},
      );

      expect(marks, {'s1': RollMark.here});
    });

    test('sends a mark that changed', () {
      final marks = marksToWrite(
        students: [_student(id: 's1', attendance: RollAttendance.away)],
        stored: const {'s1': RollMark.here},
      );

      expect(marks, {'s1': RollMark.away});
    });

    test('sends nothing for an unmarked student', () {
      // There is no way to un-mark someone, so an unmarked student is one the
      // tutor has not reached — not one they cleared.
      final marks = marksToWrite(
        students: [
          _student(id: 's1', attendance: RollAttendance.unmarked),
          _student(id: 's2', attendance: RollAttendance.unmarked),
        ],
        stored: const {},
      );

      expect(marks, isEmpty);
    });
  });
}
