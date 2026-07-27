import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/utils/class_session_dates.dart';

/// Where a session sits in the tutor's day, and what it wants from them.
///
/// Ordered by how much attention it needs: [markRoll] is the only state with
/// an outstanding task.
enum TutorSessionStatus {
  /// Not going ahead.
  cancelled,

  /// The roll has been confirmed by a person.
  done,

  /// Started (or finished) with no confirmed roll. The one actionable state.
  markRoll,

  /// Later today.
  upcoming,

  /// A later day this week.
  confirmed,
}

/// One class in the tutor's week.
@immutable
class TutorSession {
  final String classId;

  /// The attendance document this session belongs to, or null before the
  /// document is generated. Marking a roll needs it.
  final String? sessionId;

  final DateTime startsAt;
  final DateTime endsAt;
  final String time;
  final String durationLabel;
  final String title;

  /// `6 students` — the roster this session is judged against.
  final String subtitle;

  final int studentCount;
  final TutorSessionStatus status;

  const TutorSession({
    required this.classId,
    required this.sessionId,
    required this.startsAt,
    required this.endsAt,
    required this.time,
    required this.durationLabel,
    required this.title,
    required this.subtitle,
    required this.studentCount,
    required this.status,
  });

  String get statusLabel => switch (status) {
        TutorSessionStatus.cancelled => 'CANCELLED',
        TutorSessionStatus.done => 'DONE',
        TutorSessionStatus.markRoll => 'MARK ROLL',
        TutorSessionStatus.upcoming => 'UPCOMING',
        TutorSessionStatus.confirmed => 'CONFIRMED',
      };

  /// Only a real session with a generated attendance document can be opened —
  /// there is nothing to save a roll against otherwise.
  bool get canOpenRoll =>
      sessionId != null && status != TutorSessionStatus.cancelled;
}

/// The sessions falling on one day, under a heading like `WEDNESDAY 15`.
@immutable
class TutorClassesDay {
  final DateTime date;
  final List<TutorSession> sessions;
  final bool isToday;

  const TutorClassesDay({
    required this.date,
    required this.sessions,
    required this.isToday,
  });

  String get label => DateFormat('EEEE d').format(date).toUpperCase();

  /// `Today · 3 classes` beside the day heading; null on other days, where the
  /// heading alone is enough.
  String? get trailingLabel {
    if (!isToday) return null;
    final count = sessions.length;
    return 'Today · $count ${count == 1 ? 'class' : 'classes'}';
  }
}

@immutable
class TutorClassesViewData {
  /// `Week 1 · 13 – 19 Jul`.
  final String weekTitle;

  /// `Term 3 · 11 classes · 11 hrs`.
  final String weekSubtitle;

  final List<DateTime> weekDates;

  /// Days in the week with at least one session, for the strip's dots.
  final Set<int> daysWithSessions;

  final DateTime? selectedDay;
  final List<TutorClassesDay> days;

  final bool canGoToPreviousWeek;
  final bool canGoToNextWeek;

  /// Set when the week could not be loaded, rather than being genuinely empty.
  final String? errorMessage;

  const TutorClassesViewData({
    required this.weekTitle,
    required this.weekSubtitle,
    required this.weekDates,
    required this.daysWithSessions,
    required this.selectedDay,
    required this.days,
    required this.canGoToPreviousWeek,
    required this.canGoToNextWeek,
    this.errorMessage,
  });

  bool get isEmpty => days.isEmpty;

  /// How many sessions in the displayed week still need a roll. Drives the
  /// count the tutor dashboard shows.
  int get rollsToMark => days
      .expand((day) => day.sessions)
      .where((session) => session.status == TutorSessionStatus.markRoll)
      .length;
}

/// Derives the tutor's week from the loaded term, classes and attendance.
///
/// Pure, so every grouping and status rule is testable without Firestore.
///
/// Only classes [tutorId] is assigned to appear. Assignment comes from the
/// week's attendance document where one exists, so a substitute covering a
/// single session sees it and the usual tutor does not.
TutorClassesViewData buildTutorClassesViewData({
  required DateTime now,
  required Term? activeTerm,
  required int week,
  required String tutorId,
  required List<ClassModel> classes,
  required Map<String, Attendance> attendanceByClass,
  DateTime? selectedDay,
  String? errorMessage,
}) {
  final localNow = now.toLocal();

  if (activeTerm == null || week <= 0) {
    return TutorClassesViewData(
      weekTitle: 'No active term',
      weekSubtitle: 'Classes appear here once a term starts',
      weekDates: const [],
      daysWithSessions: const {},
      selectedDay: null,
      days: const [],
      canGoToPreviousWeek: false,
      canGoToNextWeek: false,
      errorMessage: errorMessage,
    );
  }

  final weekStart = startOfTermWeek(activeTerm.startDate, week);
  final weekDates = [
    for (var i = 0; i < 7; i++) weekStart.add(Duration(days: i)),
  ];

  final sessions = <TutorSession>[];

  for (final classModel in classes) {
    final attendance = attendanceByClass[classModel.id];

    // The week's document is authoritative once it exists, so a cover
    // assignment for this week wins over the standing one on the class.
    final assignedTutors = attendance?.tutors ?? classModel.tutors;
    if (!assignedTutors.contains(tutorId)) continue;

    final startsAt = (attendance?.date ??
            classSessionDateForWeek(
              termStartDate: activeTerm.startDate,
              classDay: classModel.dayOfWeek,
              startTime: classModel.startTime,
              weekNumber: week,
            ))
        .toLocal();
    final endsAt = sessionEndFor(startsAt, classModel.endTime);

    // Everyone the tutor is expected to mark: the standing roster plus anyone
    // visiting this week. The roll screen counts the same set, so the list and
    // the session it opens cannot disagree about how many students there are.
    final roster = <String>{
      ...classModel.enrolledStudents,
      ...?attendance?.attendance,
    };

    sessions.add(
      TutorSession(
        classId: classModel.id,
        sessionId: attendance?.id,
        startsAt: startsAt,
        endsAt: endsAt,
        time: DateFormat('h:mm').format(startsAt),
        durationLabel: durationLabelFor(endsAt.difference(startsAt)),
        title: formatDashboardClassType(classModel.type),
        subtitle:
            '${roster.length} ${roster.length == 1 ? 'student' : 'students'}',
        studentCount: roster.length,
        status: tutorSessionStatus(
          attendance: attendance,
          startsAt: startsAt,
          now: localNow,
        ),
      ),
    );
  }

  sessions.sort((a, b) => a.startsAt.compareTo(b.startsAt));

  final daysWithSessions = sessions.map((s) => s.startsAt.weekday).toSet();

  final visibleSessions = selectedDay == null
      ? sessions
      : sessions
          .where((s) => DateUtils.isSameDay(s.startsAt, selectedDay))
          .toList(growable: false);

  final days = <TutorClassesDay>[];
  for (final date in weekDates) {
    final forDay = visibleSessions
        .where((s) => DateUtils.isSameDay(s.startsAt, date))
        .toList(growable: false);
    if (forDay.isEmpty) continue;

    days.add(
      TutorClassesDay(
        date: date,
        sessions: forDay,
        isToday: DateUtils.isSameDay(date, localNow),
      ),
    );
  }

  // Counted across the whole week, not the filtered day, so paging to a single
  // day does not appear to reduce the workload.
  final classCount = sessions.length;
  final totalMinutes = sessions.fold<int>(
    0,
    (sum, session) =>
        sum + session.endsAt.difference(session.startsAt).inMinutes,
  );

  return TutorClassesViewData(
    weekTitle: 'Week $week · ${weekRangeLabel(weekStart)}',
    weekSubtitle: 'Term ${activeTerm.termNumber} · '
        '$classCount ${classCount == 1 ? 'class' : 'classes'}'
        '${totalMinutes == 0 ? '' : ' · ${_hoursLabel(totalMinutes)}'}',
    weekDates: weekDates,
    daysWithSessions: daysWithSessions,
    selectedDay: selectedDay,
    days: days,
    canGoToPreviousWeek: week > 1,
    canGoToNextWeek: week < activeTerm.totalWeeks,
    errorMessage: errorMessage,
  );
}

/// What a session wants from the tutor right now.
///
/// A roll counts as done only when someone stamped it (see
/// [Attendance.isRollComplete]). Before the tutor-session contract this was
/// inferred from `updatedBy == 'system'`, which reported a roll as marked the
/// moment anything else touched the document — an admin adding a student, say.
TutorSessionStatus tutorSessionStatus({
  required Attendance? attendance,
  required DateTime startsAt,
  required DateTime now,
}) {
  if (attendance?.cancelled ?? false) return TutorSessionStatus.cancelled;
  if (attendance?.isRollComplete ?? false) return TutorSessionStatus.done;

  if (!startsAt.isAfter(now)) return TutorSessionStatus.markRoll;
  if (DateUtils.isSameDay(startsAt, now)) return TutorSessionStatus.upcoming;
  return TutorSessionStatus.confirmed;
}

/// `11 hrs`, `1 hr`, `1.5 hrs`, `30 min`.
String _hoursLabel(int minutes) => durationLabelFor(Duration(minutes: minutes));
