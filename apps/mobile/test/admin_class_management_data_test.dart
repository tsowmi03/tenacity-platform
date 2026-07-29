import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/services/timetable_service.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_class_management_data.dart';

void main() {
  group('roster', () {
    test('combines permanent and one-off students without duplicates', () {
      final entries = buildAdminRosterEntries(
        classModel: _class(enrolled: const ['s2', 's1']),
        attendance: _attendance(students: const ['s1', 's3']),
        students: [
          _student('s1', 'Alex'),
          _student('s2', 'Bailey'),
          _student('s3', 'Casey'),
        ],
      );

      expect(entries.map((entry) => entry.student.id), ['s1', 's2', 's3']);
      expect(entries[0].isPermanent, isTrue);
      expect(entries[0].isBookedThisWeek, isTrue);
      expect(entries[1].isPermanent, isTrue);
      expect(entries[1].isBookedThisWeek, isFalse);
      expect(entries[2].enrolmentLabel, 'One-off');
    });

    test('snapshot preserves booked ids without a readable student document',
        () {
      final snapshot = buildAdminRosterSnapshot(
        classModel: _class(enrolled: const ['s1']),
        attendance: _attendance(students: const ['s1', 'missing-student']),
        students: [_student('s1', 'Alex')],
      );

      expect(snapshot.entries.map((entry) => entry.student.id), ['s1']);
      expect(snapshot.bookedStudentIds, ['s1', 'missing-student']);
    });
  });

  group('add class validation', () {
    test('rejects the seeded zero-length class', () {
      expect(
        validateAdminAddClassDraft(_draft(start: '16:00', end: '16:00')),
        'End time must be after start time.',
      );
    });

    test('rejects an end before the start', () {
      expect(
        validateAdminAddClassDraft(_draft(start: '17:00', end: '16:30')),
        'End time must be after start time.',
      );
    });

    test('accepts a positive duration and preserves the payload', () {
      final draft = _draft(start: '16:00', end: '17:30');
      expect(validateAdminAddClassDraft(draft), isNull);

      final classModel = draft.toClassModel(id: 'c-new');
      expect(classModel.id, 'c-new');
      expect(classModel.capacity, 6);
      expect(classModel.tutors, ['t1']);
    });
  });

  group('checked write helpers', () {
    test('tutor comparisons ignore order but reject a changed assignment', () {
      expect(
        sameTutorAssignment(const ['t1', 't2'], const ['t2', 't1']),
        isTrue,
      );
      expect(
        sameTutorAssignment(const ['t1', 't2'], const ['t1', 't3']),
        isFalse,
      );
    });

    test('tutor update is field-narrow and carries audit metadata', () {
      final now = Timestamp.fromDate(DateTime(2026, 7, 29, 12));
      final update = tutorAssignmentUpdate(
        tutorIds: const ['t2'],
        updatedBy: 'admin-1',
        updatedAt: now,
      );

      expect(update.keys.toSet(), {'tutors', 'updatedAt', 'updatedBy'});
      expect(update['tutors'], ['t2']);
      expect(update.containsKey('capacity'), isFalse);
      expect(update.containsKey('enrolledStudents'), isFalse);
      expect(update.containsKey('attendance'), isFalse);
      expect(update.containsKey('marks'), isFalse);
    });

    test('booking comparison is unordered and write touches no other fields',
        () {
      expect(sameIdSet(const ['s1', 's2'], const ['s2', 's1']), isTrue);
      expect(sameIdSet(const ['s1'], const ['s1', 's2']), isFalse);

      final update = sessionBookingsUpdate(
        studentIds: const ['s2'],
        updatedBy: 'admin-1',
        updatedAt: Timestamp.fromDate(DateTime(2026, 7, 29, 12)),
      );
      expect(update.keys.toSet(), {'attendance', 'updatedAt', 'updatedBy'});
      expect(update.containsKey('cancelled'), isFalse);
      expect(update.containsKey('tutors'), isFalse);
      expect(update.containsKey('marks'), isFalse);
    });

    test('attendance propagation uses the stored date across term ids', () {
      final boundary = DateTime.utc(2026, 7, 20);

      expect(
        attendanceIsOnOrAfter(
          Timestamp.fromDate(DateTime.utc(2026, 7, 19, 23, 59)),
          boundary,
        ),
        isFalse,
      );
      expect(
        attendanceIsOnOrAfter(
          Timestamp.fromDate(DateTime.utc(2026, 7, 20)),
          boundary,
        ),
        isTrue,
      );
      expect(
        attendanceIsOnOrAfter(
          Timestamp.fromDate(DateTime.utc(2027, 2, 1)),
          boundary,
        ),
        isTrue,
      );
      expect(attendanceIsOnOrAfter(null, boundary), isFalse);
    });

    test('session generation retries only create missing documents', () {
      expect(
        missingGeneratedAttendanceIds(
          plannedIds: const ['T3_W1', 'T3_W2', 'T3_W3'],
          existingIds: const ['T3_W1', 'T3_W3', 'other'],
        ),
        ['T3_W2'],
      );
    });
  });
}

AdminAddClassDraft _draft({
  required String start,
  required String end,
}) {
  return AdminAddClassDraft(
    type: '5-10',
    dayOfWeek: 'Monday',
    startTime: start,
    endTime: end,
    capacity: 6,
    tutorIds: const ['t1'],
  );
}

ClassModel _class({required List<String> enrolled}) => ClassModel(
      id: 'c1',
      type: '5-10',
      dayOfWeek: 'Monday',
      startTime: '16:00',
      endTime: '17:00',
      capacity: 6,
      enrolledStudents: enrolled,
      tutors: const ['t1'],
    );

Attendance _attendance({required List<String> students}) => Attendance(
      id: 'T3_W1',
      date: DateTime(2026, 7, 27, 16),
      termId: 'T3',
      cancelled: false,
      updatedAt: DateTime(2026, 7, 20),
      updatedBy: 'system',
      weekNumber: 1,
      attendance: students,
      tutors: const ['t1'],
    );

Student _student(String id, String firstName) => Student(
      id: id,
      firstName: firstName,
      lastName: 'Student',
      parents: const ['p1'],
      grade: 'Year 8',
      subjects: const ['maths'],
    );
