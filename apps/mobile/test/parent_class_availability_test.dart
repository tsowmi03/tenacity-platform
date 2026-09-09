import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/helpers/parent_class_availability.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';

void main() {
  group('ParentClassAvailability', () {
    test('disables one-off when a permanent spot exists but session is full',
        () {
      final availability = ParentClassAvailability.forClass(
        classInfo: _classModel(
          capacity: 3,
          enrolledStudents: ['studentA', 'studentB'],
        ),
        attendance: _attendance(['studentA', 'studentB', 'temporaryStudent']),
        weeksAhead: 0,
        sameDayCutoffPassed: false,
      );

      expect(availability.permanentSpots, 1);
      expect(availability.oneOffSpots, 0);
      expect(availability.canBookOneOff, isFalse);
    });

    test(
        'keeps one-off disabled for a permanently full class with no session spot',
        () {
      final availability = ParentClassAvailability.forClass(
        classInfo: _classModel(
          capacity: 2,
          enrolledStudents: ['studentA', 'studentB'],
        ),
        attendance: _attendance(['studentA', 'studentB']),
        weeksAhead: 0,
        sameDayCutoffPassed: false,
      );

      expect(availability.permanentSpots, 0);
      expect(availability.oneOffSpots, 0);
      expect(availability.canBookOneOff, isFalse);
    });

    test('enables one-off when a cancelled session spot is available', () {
      final availability = ParentClassAvailability.forClass(
        classInfo: _classModel(
          capacity: 2,
          enrolledStudents: ['studentA', 'studentB'],
        ),
        attendance: _attendance(['studentA']),
        weeksAhead: 0,
        sameDayCutoffPassed: false,
      );

      expect(availability.permanentSpots, 0);
      expect(availability.oneOffSpots, 1);
      expect(availability.cancelledSpots, 1);
      expect(availability.canBookOneOff, isTrue);
    });

    test('closes that same spot once today has passed 9am', () {
      // The seat is still there; the day's staffing has been settled around
      // it (MOB-48).
      final availability = ParentClassAvailability.forClass(
        classInfo: _classModel(
          capacity: 2,
          enrolledStudents: ['studentA', 'studentB'],
        ),
        attendance: _attendance(['studentA']),
        weeksAhead: 0,
        sameDayCutoffPassed: true,
      );

      expect(availability.oneOffSpots, 1);
      expect(availability.canBookOneOff, isFalse);
      expect(availability.closedBySameDayCutoff, isTrue);
      expect(availability.oneOffDisabledHint, contains('close at 9am'));
    });

    test('does not blame the cutoff for a session that is full anyway', () {
      // "Bookings for today have closed" invites a phone call. A full session
      // is not one a phone call can get a child into, so it must give the
      // reason that is actually true.
      final availability = ParentClassAvailability.forClass(
        classInfo: _classModel(
          capacity: 2,
          enrolledStudents: ['studentA', 'studentB'],
        ),
        attendance: _attendance(['studentA', 'studentB']),
        weeksAhead: 0,
        sameDayCutoffPassed: true,
      );

      expect(availability.closedBySameDayCutoff, isFalse);
      expect(availability.oneOffDisabledHint, contains('already full'));
    });
  });
}

ClassModel _classModel({
  required int capacity,
  required List<String> enrolledStudents,
}) {
  return ClassModel(
    id: 'classA',
    type: 'Maths',
    dayOfWeek: 'Monday',
    startTime: '16:00',
    endTime: '17:00',
    capacity: capacity,
    enrolledStudents: enrolledStudents,
    tutors: const [],
  );
}

Attendance _attendance(List<String> studentIds) {
  return Attendance(
    id: 'termA_W1',
    date: DateTime(2026, 5, 4),
    termId: 'termA',
    cancelled: false,
    updatedAt: DateTime(2026, 5, 1),
    updatedBy: 'adminA',
    weekNumber: 1,
    attendance: studentIds,
    tutors: const [],
  );
}
