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

    group('feedback due', () {
      // One class, taught Tuesday, whose roll is fully marked with three
      // students here and one away.
      final classes = [
        _class(
          id: 'tuesday',
          day: 'Tuesday',
          start: '16:00',
          end: '17:00',
          type: '5-10',
        ),
      ];
      final markedRoll = {
        'tuesday': Attendance(
          id: '2026_T3_W1',
          date: DateTime(2026, 7, 14, 16),
          termId: '2026_T3',
          cancelled: false,
          updatedAt: DateTime(2026, 7, 14, 17),
          updatedBy: 'tutor-1',
          weekNumber: 1,
          attendance: const [
            'student-1',
            'student-2',
            'student-3',
            'student-4',
          ],
          tutors: const ['tutor-1'],
          marks: const {
            'student-1': RollMark.here,
            'student-2': RollMark.here,
            'student-3': RollMark.here,
            'student-4': RollMark.away,
          },
          rollCompletedAt: DateTime(2026, 7, 14, 17),
          rollCompletedBy: 'tutor-1',
        ),
      };

      TutorDashboardViewData build(
        Map<String, Set<String>>? feedbackStudentIdsByClass,
      ) {
        return buildTutorDashboardViewData(
          tutorId: 'tutor-1',
          tutorName: 'Jordan',
          now: DateTime(2026, 7, 15, 14),
          activeTerm: term,
          currentWeek: 1,
          classes: classes,
          attendanceByClass: markedRoll,
          unreadMessages: 0,
          latestAnnouncement: null,
          feedbackStudentIdsByClass: feedbackStudentIdsByClass,
        );
      }

      test('raises a row counting only the students still owed a note', () {
        final data = build({
          'tuesday': {'student-1'},
        });

        expect(data.attentionItems, hasLength(1));
        expect(data.attentionItems.single.title, startsWith('Feedback due'));
        expect(data.attentionItems.single.title, contains('Tue Years 5–10'));
        // student-4 was away, so three attended and two are outstanding.
        expect(data.attentionItems.single.subtitle,
            endsWith('2 of 3 still to write'));
      });

      test('an away student is never counted as owing feedback', () {
        // Every student who attended has a note; only the away one does not.
        final data = build({
          'tuesday': {'student-1', 'student-2', 'student-3'},
        });

        expect(data.attentionItems, isEmpty);
      });

      test('an absent student does not hold the roll open forever', () {
        // MOB-23's worst consequence, and the one the ticket does not name.
        // `student-3` holds a permanent place but notified an absence, so is
        // not in the week's bookings. The old union put them back on the
        // roster, where they could never be marked: the roll never counted as
        // complete, so the session sat in "Roll not marked" indefinitely and
        // the feedback prompt — which waits for a complete roll — never
        // appeared at all.
        final data = buildTutorDashboardViewData(
          tutorId: 'tutor-1',
          tutorName: 'Jordan',
          now: DateTime(2026, 7, 15, 14),
          activeTerm: term,
          currentWeek: 1,
          classes: [
            _class(
              id: 'tuesday',
              day: 'Tuesday',
              start: '16:00',
              end: '17:00',
              type: '5-10',
              enrolled: const ['student-1', 'student-2', 'student-3'],
            ),
          ],
          attendanceByClass: {
            'tuesday': Attendance(
              id: '2026_T3_W1',
              date: DateTime(2026, 7, 14, 16),
              termId: '2026_T3',
              cancelled: false,
              updatedAt: DateTime(2026, 7, 14, 17),
              updatedBy: 'tutor-1',
              weekNumber: 1,
              attendance: const ['student-1', 'student-2'],
              tutors: const ['tutor-1'],
              marks: const {
                'student-1': RollMark.here,
                'student-2': RollMark.here,
              },
              rollCompletedAt: DateTime(2026, 7, 14, 17),
              rollCompletedBy: 'tutor-1',
            ),
          },
          unreadMessages: 0,
          latestAnnouncement: null,
          feedbackStudentIdsByClass: const {},
        );

        expect(data.rollsToMark, 0);
        expect(data.attentionItems, hasLength(1));
        expect(data.attentionItems.single.title, startsWith('Feedback due'));
        expect(
          data.attentionItems.single.subtitle,
          endsWith('2 of 2 still to write'),
        );
      });

      test('an unmarked roll shows only the roll row, not feedback too', () {
        // The same class with nothing marked. Listing it twice would put one
        // class in both attention slots.
        final data = buildTutorDashboardViewData(
          tutorId: 'tutor-1',
          tutorName: 'Jordan',
          now: DateTime(2026, 7, 15, 14),
          activeTerm: term,
          currentWeek: 1,
          classes: classes,
          attendanceByClass: {
            'tuesday': _attendance(
              id: 'tuesday',
              date: DateTime(2026, 7, 14, 16),
              updatedBy: 'system',
              studentCount: 4,
            ),
          },
          unreadMessages: 0,
          latestAnnouncement: null,
          feedbackStudentIdsByClass: const {},
        );

        expect(data.attentionItems, hasLength(1));
        expect(data.attentionItems.single.title, startsWith('Roll not marked'));
      });

      test('nothing written yet owes a note for every student present', () {
        // An empty map is a successful read that found no feedback.
        final data = build(const {});

        expect(data.attentionItems, hasLength(1));
        expect(data.attentionItems.single.title, startsWith('Feedback due'));
        expect(
          data.attentionItems.single.subtitle,
          endsWith('3 of 3 still to write'),
        );
      });

      test('a failed feedback read raises no row at all', () {
        // Null is the read failing. Treating it as "nothing written" would
        // accuse a tutor of owing feedback they may already have sent.
        final data = build(null);

        expect(data.attentionItems, isEmpty);
      });
    });
  });
}

ClassModel _class({
  required String id,
  required String day,
  required String start,
  required String end,
  required String type,
  List<String> enrolled = const ['student-1', 'student-2'],
}) {
  return ClassModel(
    id: id,
    type: type,
    dayOfWeek: day,
    startTime: start,
    endTime: end,
    capacity: 8,
    enrolledStudents: enrolled,
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

    expect(edited.isRollCompleteFor(edited.attendance), isFalse);

    final stamped = _attendance(
      id: 'stamped',
      date: DateTime(2026, 7, 15, 12),
      updatedBy: 'system',
      studentCount: 4,
      rollMarked: true,
    );

    // And a roll saved unchanged still counts, which the old rule missed.
    expect(stamped.isRollCompleteFor(stamped.attendance), isTrue);
  });
}

Attendance _attendance({
  required String id,
  required DateTime date,
  required String updatedBy,
  required int studentCount,
  List<String> tutors = const ['tutor-1'],

  /// A roll counts as marked only when every student carries a mark.
  /// `updatedBy` no longer implies this — an admin editing the session used to
  /// clear the tutor's outstanding count.
  bool rollMarked = false,
}) {
  final students = List.generate(studentCount, (index) => 'student-$index');

  return Attendance(
    id: '${id}_W1',
    date: date,
    termId: '2026_T3',
    cancelled: false,
    updatedAt: date,
    updatedBy: updatedBy,
    weekNumber: 1,
    attendance: students,
    tutors: tutors,
    marks:
        rollMarked ? {for (final id in students) id: RollMark.here} : const {},
    rollCompletedAt: rollMarked ? date : null,
    rollCompletedBy: rollMarked ? 'tutor-1' : null,
  );
}
