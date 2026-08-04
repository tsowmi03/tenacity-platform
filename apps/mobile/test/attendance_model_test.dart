import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/attendance_model.dart';

Map<String, dynamic> _doc({
  Object? weekNum = _unset,
  Object? weekNumber = _unset,
}) {
  return {
    'date': Timestamp.fromDate(DateTime(2026, 7, 28, 16)),
    'termId': '2026_T3',
    'cancelled': false,
    'updatedAt': Timestamp.fromDate(DateTime(2026, 7, 20)),
    'updatedBy': 'system',
    'attendance': const ['s1'],
    'tutors': const ['t1'],
    if (weekNum != _unset) 'weekNum': weekNum,
    if (weekNumber != _unset) 'weekNumber': weekNumber,
  };
}

const Object _unset = Object();

void main() {
  group('Attendance week number', () {
    test('reads weekNum when the class-creation path wrote it', () {
      final attendance =
          Attendance.fromMap(_doc(weekNum: 3), '2026_T3_W3');

      expect(attendance.weekNumber, 3);
    });

    test('falls back to weekNumber, which the term rollover wrote instead', () {
      final attendance =
          Attendance.fromMap(_doc(weekNumber: 5), '2026_T3_W5');

      expect(attendance.weekNumber, 5);
    });

    test('falls back to the document id when neither field is usable', () {
      final attendance = Attendance.fromMap(_doc(), '2026_T3_W7');

      expect(attendance.weekNumber, 7);
    });

    test('does not treat a persisted zero as the real week', () {
      // The corruption this guards against: reading a missing weekNum as 0 and
      // writing that 0 back through toMap on the next roster edit left 148
      // production sessions claiming week 0.
      final attendance =
          Attendance.fromMap(_doc(weekNum: 0, weekNumber: 4), '2026_T3_W4');

      expect(attendance.weekNumber, 4);
    });

    test('recovers the week from the id even when both fields are zero', () {
      final attendance =
          Attendance.fromMap(_doc(weekNum: 0, weekNumber: 0), '2026_T3_W6');

      expect(attendance.weekNumber, 6);
    });

    test('round-trips without downgrading a recovered week to zero', () {
      // toMap feeds straight into update() when an admin edits a roster, so a
      // value recovered on read has to survive the write.
      final recovered =
          Attendance.fromMap(_doc(weekNumber: 9), '2026_T3_W9');

      expect(recovered.toMap()['weekNum'], 9);
    });

    test('only gives up when nothing carries a week', () {
      final attendance = Attendance.fromMap(_doc(), 'not-a-week-doc');

      expect(attendance.weekNumber, 0);
    });
  });
}
