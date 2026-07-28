import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/announcement_model.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/ui/dashboard/tutor_dashboard_data.dart';

void main() {
  group('roll completion', _rollStatusRegression);

  group('buildTutorDashboardViewData', () {
    final term = Term(
      id: '2026_T3',
      year: '2026',
      termNumber: 3,
      startDate: DateTime(2026, 7, 13),
      endDate: DateTime(2026, 9, 18),
      totalWeeks: 10,
      isActive: true,
    );

    test('derives tutor metrics, next class and unmarked rolls', () {
      final now = DateTime(2026, 7, 15, 14);
      final classes = [
        _class(
          id: 'tuesday',
          day: 'Tuesday',
          start: '16:00',
          end: '17:00',
          type: '5-10',
        ),
        _class(
          id: 'wednesday-past',
          day: 'Wednesday',
          start: '12:00',
          end: '13:00',
          type: 'stdeng11',
        ),
        _class(
          id: 'wednesday-next',
          day: 'Wednesday',
          start: '16:30',
          end: '17:30',
          type: 'stdmath11',
        ),
        _class(
          id: 'overridden-away',
          day: 'Wednesday',
          start: '18:00',
          end: '19:00',
          type: 'advmath11',
        ),
      ];
      final attendance = {
        'tuesday': _attendance(
          id: 'tuesday',
          date: DateTime(2026, 7, 14, 16),
          updatedBy: 'system',
          studentCount: 5,
        ),
        'wednesday-past': _attendance(
          id: 'wednesday-past',
          date: DateTime(2026, 7, 15, 12),
          updatedBy: 'tutor-1',
          studentCount: 4,
          rollMarked: true,
        ),
        'wednesday-next': _attendance(
          id: 'wednesday-next',
          date: DateTime(2026, 7, 15, 16, 30),
          updatedBy: 'system',
          studentCount: 6,
        ),
        'overridden-away': _attendance(
          id: 'overridden-away',
          date: DateTime(2026, 7, 15, 18),
          updatedBy: 'system',
          studentCount: 3,
          tutors: const ['tutor-2'],
        ),
      };

      final data = buildTutorDashboardViewData(
        tutorId: 'tutor-1',
        tutorName: 'Jordan',
        now: now,
        activeTerm: term,
        currentWeek: 1,
        classes: classes,
        attendanceByClass: attendance,
        unreadMessages: 4,
        latestAnnouncement: Announcement(
          id: 'announcement-1',
          title: 'Term update',
          body: 'No classes on Friday.',
          createdAt: now.subtract(const Duration(days: 1)),
          archived: false,
          audience: 'tutor',
        ),
      );

      expect(data.greeting, 'Good afternoon');
      expect(data.classesToday, 2);
      expect(data.rollsToMark, 1);
      expect(data.unreadMessages, 4);
      expect(data.nextClass?.classId, 'wednesday-next');
      expect(data.nextClass?.title, 'Year 11 Standard Maths');
      expect(data.nextClass?.studentCount, 6);
      expect(data.nextClass?.durationLabel, '1 hr');
      expect(data.attentionItems, hasLength(1));
      expect(data.attentionItems.single.title, contains('Tue Years 5–10'));
      expect(data.attentionItems.single.subtitle, 'Yesterday · 5 students');
      expect(data.latestAnnouncement?.audienceLabel, 'STAFF');
      expect(data.latestAnnouncement?.ageLabel, 'yesterday');
    });

    test('returns useful empty state data without an active term', () {
      final data = buildTutorDashboardViewData(
        tutorId: 'tutor-1',
        tutorName: 'Jordan',
        now: DateTime(2026, 7, 15, 9),
        activeTerm: null,
        currentWeek: 1,
        classes: const [],
        attendanceByClass: const {},
        unreadMessages: 2,
        latestAnnouncement: null,
      );

      expect(data.greeting, 'Good morning');
      expect(data.classesToday, 0);
      expect(data.rollsToMark, 0);
      expect(data.nextClass, isNull);
      expect(data.attentionItems, isEmpty);
      expect(data.unreadMessages, 2);
    });
  });
}

ClassModel _class({
  required String id,
  required String day,
  required String start,
  required String end,
  required String type,
}) {
  return ClassModel(
    id: id,
    type: type,
    dayOfWeek: day,
    startTime: start,
    endTime: end,
    capacity: 8,
    enrolledStudents: const ['student-1', 'student-2'],
    tutors: const ['tutor-1'],
  );
}

void _rollStatusRegression() {
  test('an admin edit does not clear the tutor\'s outstanding roll', () {
    // The old rule read `updatedBy == 'system'`, so an admin adding a student
    // to a session marked the roll done on the tutor's behalf and the count
    // silently dropped.
    final edited = _attendance(
      id: 'edited',
      date: DateTime(2026, 7, 15, 12),
      updatedBy: 'admin-1',
      studentCount: 4,
    );

    expect(edited.isRollComplete, isFalse);

    final stamped = _attendance(
      id: 'stamped',
      date: DateTime(2026, 7, 15, 12),
      updatedBy: 'system',
      studentCount: 4,
      rollMarked: true,
    );

    // And a roll saved unchanged still counts, which the old rule missed.
    expect(stamped.isRollComplete, isTrue);
  });
}

Attendance _attendance({
  required String id,
  required DateTime date,
  required String updatedBy,
  required int studentCount,
  List<String> tutors = const ['tutor-1'],

  /// A roll counts as marked only when someone stamped it. `updatedBy` no
  /// longer implies this — an admin editing the session used to clear the
  /// tutor's outstanding count.
  bool rollMarked = false,
}) {
  return Attendance(
    id: '${id}_W1',
    date: date,
    termId: '2026_T3',
    cancelled: false,
    updatedAt: date,
    updatedBy: updatedBy,
    weekNumber: 1,
    attendance: List.generate(studentCount, (index) => 'student-$index'),
    tutors: tutors,
    rollCompletedAt: rollMarked ? date : null,
    rollCompletedBy: rollMarked ? 'tutor-1' : null,
  );
}
