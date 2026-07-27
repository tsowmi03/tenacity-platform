import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/utils/class_session_dates.dart';

/// How a child came to be in a session.
enum ParentSessionKind {
  /// A standing enrolment on the class roster.
  confirmed,

  /// Added to this week's session only.
  oneOff,

  /// The session is not going ahead.
  cancelled,
}

/// One class in the parent's week.
@immutable
class ParentTimetableSession {
  final String classId;
  final DateTime startsAt;
  final String time;
  final String durationLabel;
  final String title;

  /// `Ella · Jordan Lee` — whose class it is and who is teaching.
  final String subtitle;

  final ParentSessionKind kind;

  /// The children of this parent attending, for the booking dialog.
  final List<String> childIds;

  const ParentTimetableSession({
    required this.classId,
    required this.startsAt,
    required this.time,
    required this.durationLabel,
    required this.title,
    required this.subtitle,
    required this.kind,
    required this.childIds,
  });

  String get statusLabel => switch (kind) {
        ParentSessionKind.confirmed => 'CONFIRMED',
        ParentSessionKind.oneOff => 'ONE-OFF',
        ParentSessionKind.cancelled => 'CANCELLED',
      };
}

/// The sessions falling on one day, under a heading like `WEDNESDAY 15`.
@immutable
class ParentTimetableDay {
  final DateTime date;
  final List<ParentTimetableSession> sessions;
  final bool isToday;

  const ParentTimetableDay({
    required this.date,
    required this.sessions,
    required this.isToday,
  });

  String get label => DateFormat('EEEE d').format(date).toUpperCase();
}

@immutable
class ParentTimetableViewData {
  /// `All`, then one per child, in the order shown by the filter.
  final List<String> filterLabels;

  /// Index into [filterLabels]; 0 is `All`.
  final int selectedFilterIndex;

  /// `Week 1 · 13 – 19 Jul`.
  final String weekTitle;

  /// `Term 3 · 3 classes`.
  final String weekSubtitle;

  final List<DateTime> weekDates;

  /// Days in the week that have at least one session, for the strip's dots.
  final Set<int> daysWithSessions;

  final DateTime? selectedDay;
  final List<ParentTimetableDay> days;

  final bool canGoToPreviousWeek;
  final bool canGoToNextWeek;

  const ParentTimetableViewData({
    required this.filterLabels,
    required this.selectedFilterIndex,
    required this.weekTitle,
    required this.weekSubtitle,
    required this.weekDates,
    required this.daysWithSessions,
    required this.selectedDay,
    required this.days,
    required this.canGoToPreviousWeek,
    required this.canGoToNextWeek,
  });

  bool get isEmpty => days.isEmpty;
}

/// Derives the parent's week from the loaded term, classes and attendance.
///
/// Pure, so every grouping and status rule is testable without Firestore.
///
/// [selectedChildId] narrows to one child; null means all of them.
/// [selectedDay] narrows to one day; null means the whole week.
ParentTimetableViewData buildParentTimetableViewData({
  required DateTime now,
  required Term? activeTerm,
  required int week,
  required List<ClassModel> classes,
  required Map<String, Attendance> attendanceByClass,
  required List<Student> children,
  required Map<String, String> tutorNamesById,
  String? selectedChildId,
  DateTime? selectedDay,
}) {
  final localNow = now.toLocal();
  final filterLabels = ['All', ...children.map((c) => c.firstName)];
  final selectedFilterIndex = selectedChildId == null
      ? 0
      : children.indexWhere((c) => c.id == selectedChildId) + 1;

  if (activeTerm == null || week <= 0) {
    return ParentTimetableViewData(
      filterLabels: filterLabels,
      selectedFilterIndex: selectedFilterIndex < 0 ? 0 : selectedFilterIndex,
      weekTitle: 'No active term',
      weekSubtitle: 'Classes appear here once a term starts',
      weekDates: const [],
      daysWithSessions: const {},
      selectedDay: null,
      days: const [],
      canGoToPreviousWeek: false,
      canGoToNextWeek: false,
    );
  }

  final weekStart = startOfTermWeek(activeTerm.startDate, week);
  final weekDates = [
    for (var i = 0; i < 7; i++) weekStart.add(Duration(days: i)),
  ];

  final visibleChildren = selectedChildId == null
      ? children
      : children.where((c) => c.id == selectedChildId).toList();
  final visibleIds = visibleChildren.map((c) => c.id).toSet();
  final namesById = {for (final c in children) c.id: c.firstName};

  // Status is judged against every child in the family, not just the ones the
  // filter is showing, so the pill always agrees with the options dialog that
  // a tap opens. The filter decides which sessions are listed, not what a
  // session is.
  final allChildIds = children.map((c) => c.id).toSet();

  final sessions = <ParentTimetableSession>[];

  for (final classModel in classes) {
    final attendance = attendanceByClass[classModel.id];

    // The week's attendance document is authoritative once it exists; before
    // that the class roster stands in.
    final roster = attendance?.attendance ?? classModel.enrolledStudents;
    final attending = roster.where(visibleIds.contains).toList(growable: false);
    if (attending.isEmpty) continue;

    final startsAt = (attendance?.date ??
            classSessionDateForWeek(
              termStartDate: activeTerm.startDate,
              classDay: classModel.dayOfWeek,
              startTime: classModel.startTime,
              weekNumber: week,
            ))
        .toLocal();

    // One-off means the family has no standing place in this class and is only
    // here for this week. This mirrors `_showParentClassOptionsDialog`
    // exactly — if the two ever diverge, a row can claim ONE-OFF while
    // offering the permanent swap and enrol actions, which is how a family
    // with one child enrolled and another visiting would have been shown.
    final isOneOff = attendance != null &&
        attendance.attendance.any(allChildIds.contains) &&
        !classModel.enrolledStudents.any(allChildIds.contains);

    final tutorNames = (attendance?.tutors ?? classModel.tutors)
        .map((id) => tutorNamesById[id] ?? '')
        .where((name) => name.isNotEmpty)
        .toList(growable: false);

    sessions.add(
      ParentTimetableSession(
        classId: classModel.id,
        startsAt: startsAt,
        time: DateFormat('h:mm').format(startsAt),
        durationLabel: durationLabelFor(
          sessionEndFor(startsAt, classModel.endTime).difference(startsAt),
        ),
        title: formatDashboardClassType(classModel.type),
        subtitle: [
          joinNames(attending.map((id) => namesById[id] ?? '').toList()),
          ...tutorNames,
        ].where((part) => part.isNotEmpty).join(' · '),
        kind: (attendance?.cancelled ?? false)
            ? ParentSessionKind.cancelled
            : isOneOff
                ? ParentSessionKind.oneOff
                : ParentSessionKind.confirmed,
        childIds: attending,
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

  final days = <ParentTimetableDay>[];
  for (final date in weekDates) {
    final forDay = visibleSessions
        .where((s) => DateUtils.isSameDay(s.startsAt, date))
        .toList(growable: false);
    if (forDay.isEmpty) continue;

    days.add(
      ParentTimetableDay(
        date: date,
        sessions: forDay,
        isToday: DateUtils.isSameDay(date, localNow),
      ),
    );
  }

  final classCount = sessions.length;

  return ParentTimetableViewData(
    filterLabels: filterLabels,
    selectedFilterIndex: selectedFilterIndex < 0 ? 0 : selectedFilterIndex,
    weekTitle: 'Week $week · ${weekRangeLabel(weekStart)}',
    weekSubtitle: 'Term ${activeTerm.termNumber} · '
        '$classCount ${classCount == 1 ? 'class' : 'classes'}',
    weekDates: weekDates,
    daysWithSessions: daysWithSessions,
    selectedDay: selectedDay,
    days: days,
    canGoToPreviousWeek: week > 1,
    canGoToNextWeek: week < activeTerm.totalWeeks,
  );
}
