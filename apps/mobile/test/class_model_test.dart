import 'package:flutter_test/flutter_test.dart';
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
