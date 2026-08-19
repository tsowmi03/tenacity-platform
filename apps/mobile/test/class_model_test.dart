import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';

void main() {
  group('ClassModel enrollmentState', () {
    test('is pending when below the minimum students to open', () {
      final classModel = _classModel(enrolledStudents: ['studentA']);

      expect(classModel.enrollmentState, ClassEnrollmentState.pending);
      expect(classModel.canAcceptParentPermanentEnrollment, isFalse);
      expect(classModel.permanentSpotsRemaining, 3);
    });

    test('is open when minimum students are enrolled and capacity remains', () {
      final classModel =
          _classModel(enrolledStudents: ['studentA', 'studentB']);

      expect(classModel.enrollmentState, ClassEnrollmentState.open);
      expect(classModel.canAcceptParentPermanentEnrollment, isTrue);
      expect(classModel.permanentSpotsRemaining, 2);
    });

    test('is full when no permanent spots remain', () {
      final classModel = _classModel(
        capacity: 2,
        enrolledStudents: ['studentA', 'studentB'],
      );

      expect(classModel.enrollmentState, ClassEnrollmentState.full);
      expect(classModel.canAcceptParentPermanentEnrollment, isFalse);
      expect(classModel.permanentSpotsRemaining, 0);
    });

    test('uses the Firestore minimum students field when present', () {
      final classModel = ClassModel.fromMap(
        {
          'type': 'Maths',
          'day': 'Monday',
          'startTime': '16:00',
          'endTime': '17:00',
          'capacity': 5,
          'minStudentsToOpen': 3,
          'enrolledStudents': ['studentA', 'studentB'],
          'tutors': <String>[],
        },
        'classA',
      );

      expect(classModel.minimumStudentsToOpen, 3);
      expect(classModel.enrollmentState, ClassEnrollmentState.pending);
    });

    test('serializes the minimum students field', () {
      final classModel = _classModel().copyWith(minimumStudentsToOpen: 3);

      expect(classModel.toMap()['minStudentsToOpen'], 3);
    });
  });

  group('ClassModel rosterFor', () {
    test('drops a permanent student who is not booked this week', () {
      // What a notified absence looks like in storage: the backend removes the
      // student from the week's booking list and deliberately leaves the
      // permanent roster alone. Unioning the two put them straight back, so
      // the absence had no visible effect on any tutor or admin screen.
      final classModel = _classModel(enrolledStudents: ['s1', 's2']);

      final roster = classModel.rosterFor(_attendance(booked: const ['s1']));

      expect(roster, {'s1'});
    });

    test('keeps a one-off visitor who holds no permanent place', () {
      final classModel = _classModel(enrolledStudents: ['s1']);

      final roster =
          classModel.rosterFor(_attendance(booked: const ['s1', 'visitor']));

      expect(roster, {'s1', 'visitor'});
    });

    test('falls back to the permanent roster when the week has no document',
        () {
      // A week whose attendance documents have not been generated yet. There
      // is no booking list to defer to, so the standing roster is the best
      // answer available.
      final classModel = _classModel(enrolledStudents: ['s1', 's2']);

      expect(classModel.rosterFor(null), {'s1', 's2'});
    });

    test('is empty when everyone booked has cancelled', () {
      final classModel = _classModel(enrolledStudents: ['s1', 's2']);

      expect(classModel.rosterFor(_attendance(booked: const [])), isEmpty);
    });
  });
}

Attendance _attendance({required List<String> booked}) {
  return Attendance(
    id: 'T3_W2',
    date: DateTime(2026, 7, 20, 16),
    termId: 'T3',
    cancelled: false,
    updatedAt: DateTime(2026, 7, 20),
    updatedBy: 'system',
    weekNumber: 2,
    attendance: booked,
    tutors: const [],
  );
}

ClassModel _classModel({
  int capacity = 4,
  List<String> enrolledStudents = const [],
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
