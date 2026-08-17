import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/utils/class_session_dates.dart';

/// How the day's classes are grouped.
///
/// The reference design offers `Rooms | Tutors`. Rooms are excluded from V3
/// because Tenacity operates one room (§11), so the room half is replaced by
/// the time ledger the rest of the screen already draws, leaving a choice
/// between "when is everything on" and "who is teaching what".
enum AdminClassesGrouping { time, tutor }

/// What a session is doing right now, for the pill on its row.
///
/// One pill carries two dimensions — where the session sits in the day, and
/// whether its roll is done — so the order here is the priority order.
enum AdminSessionStatus {
  /// Not going ahead.
  cancelled,

  /// Running, with its roll confirmed.
  running,

  /// Started or finished with no confirmed roll.
  noRoll,

  /// Finished with its roll confirmed.
  done,

  /// Later, and at capacity.
  full,

  /// Later, with room left.
  seats,
}

/// One class on the admin's day.
@immutable
class AdminSession {
  final String classId;

  /// The attendance document for this week, or null before it is generated.
  /// The admin options dialog needs it to edit students or cancel the session.
  final String? sessionId;

  final DateTime startsAt;
  final DateTime endsAt;

  /// `4:30 PM` — also the time-group heading this session falls under.
  final String timeLabel;

  final String title;

  /// The tutors assigned for this week, joined. Empty when none are.
  final String tutorLabel;

  /// Everyone expected: the standing roster plus anyone visiting this week.
  final int rosterCount;
  final int capacity;

  /// The same people by name, ordered as the enrolments sheet orders them:
  /// the standing roster first, then this week's visitors, each alphabetical.
  ///
  /// May be shorter than [rosterCount]. The count comes from the roster ids,
  /// while a name needs a student document that reads and parses — the
  /// enrolments sheet already drops the ones that do not. [seatsLabel] stays
  /// the authority on how full a session is.
  final List<String> studentNames;

  final AdminSessionStatus status;

  /// Whether this session is running at the moment the day was built.
  ///
  /// Carried per session rather than per group because the tutor grouping has
  /// no time slots to mark: without it, a `NO ROLL` class that is on right now
  /// and one that finished this morning look identical, since that one status
  /// covers both.
  final bool isLiveNow;

  const AdminSession({
    required this.classId,
    required this.sessionId,
    required this.startsAt,
    required this.endsAt,
    required this.timeLabel,
    required this.title,
    required this.tutorLabel,
    required this.rosterCount,
    required this.capacity,
    required this.status,
    this.studentNames = const [],
    this.isLiveNow = false,
  });

  int get seatsLeft {
    final left = capacity - rosterCount;
    return left < 0 ? 0 : left;
  }

  /// `6/8 seats`.
  ///
  /// Room is excluded from V3, so the subtitle the reference splits between
  /// room and seats carries the tutor and the seats together. With two tutors
  /// assigned — common at Tenacity — the long form `6 of 8 seats` pushed the
  /// row past its ellipsis and cut the word `seats` in half. The compact form
  /// matches how the roll pill already reads (`ROLL 5/6`).
  String get seatsLabel => '$rosterCount/$capacity seats';

  String get statusLabel => switch (status) {
        AdminSessionStatus.cancelled => 'CANCELLED',
        AdminSessionStatus.running => 'RUNNING',
        AdminSessionStatus.noRoll => 'NO ROLL',
        AdminSessionStatus.done => 'DONE',
        AdminSessionStatus.full => 'FULL',
        AdminSessionStatus.seats =>
          seatsLeft == 1 ? '1 SEAT' : '$seatsLeft SEATS',
      };
}

/// A heading and the sessions beneath it — a time slot, or a tutor.
@immutable
class AdminClassesGroup {
  /// `4:30 PM`, or `Jordan Lee`.
  final String label;

  final List<AdminSession> sessions;

  /// True for the time group containing the current moment, which the design
  /// marks with `Now`.
  final bool isNow;

  const AdminClassesGroup({
    required this.label,
    required this.sessions,
    this.isNow = false,
  });
}

@immutable
class AdminClassesViewData {
  /// `Week 1 · 13 – 19 Jul`.
  final String weekTitle;

  /// `Term 3 · 14 classes`, counted across the whole week.
  final String weekSubtitle;

  /// Monday to Sunday of the loaded week, for the day strip.
  final List<DateTime> weekDates;

  /// Days in the week with at least one session, for the strip's dots.
  final Set<int> daysWithSessions;

  /// `Wednesday 15 Jul`. Not shown in the header — the strip already names the
  /// day — but it is how the empty state says which day it means.
  final String dayLabel;

  /// `14 classes · 62 students` for the selected day. The reference also counts
  /// rooms, which V3 excludes.
  final String daySummary;

  final DateTime selectedDate;
  final AdminClassesGrouping grouping;
  final List<AdminClassesGroup> groups;

  final bool canGoToPreviousWeek;
  final bool canGoToNextWeek;

  /// Set when the week could not be loaded, rather than the day being empty.
  final String? errorMessage;

  const AdminClassesViewData({
    required this.weekTitle,
    required this.weekSubtitle,
    required this.weekDates,
    required this.daysWithSessions,
    required this.dayLabel,
    required this.daySummary,
    required this.selectedDate,
    required this.grouping,
    required this.groups,
    required this.canGoToPreviousWeek,
    required this.canGoToNextWeek,
    this.errorMessage,
  });

  bool get isEmpty => groups.isEmpty;

  int get classCount =>
      groups.fold<int>(0, (total, group) => total + group.sessions.length);
}

/// Derives the admin's week, and the day showing within it, from the loaded
/// term, classes and attendance.
///
/// Pure, so every grouping, capacity and status rule is testable without
/// Firestore. [attendanceByClass] holds one week's documents, so [selectedDate]
/// must fall in the loaded [week] — the container keeps the two in step.
///
/// The whole week is built even though only one day is listed: the strip needs
/// to know which days have classes, and the header counts the week.
///
/// No cover state is produced. A class with nobody assigned simply carries no
/// tutor name; the reference's red `no tutor … Assign` row is excluded because
/// no absence, request, approver or notification exists behind it (§7, §11).
AdminClassesViewData buildAdminClassesViewData({
  required DateTime now,
  required Term? activeTerm,
  required int week,
  required DateTime selectedDate,
  required List<ClassModel> classes,
  required Map<String, Attendance> attendanceByClass,
  required Map<String, String> tutorNamesById,
  Map<String, String> studentNamesById = const {},
  AdminClassesGrouping grouping = AdminClassesGrouping.time,
  String? errorMessage,
}) {
  final localNow = now.toLocal();
  final day = DateUtils.dateOnly(selectedDate);

  if (activeTerm == null || week <= 0) {
    return AdminClassesViewData(
      weekTitle: 'No active term',
      weekSubtitle: 'Classes appear here once a term starts',
      weekDates: const [],
      daysWithSessions: const {},
      dayLabel: '',
      daySummary: '',
      selectedDate: day,
      grouping: grouping,
      groups: const [],
      canGoToPreviousWeek: false,
      canGoToNextWeek: false,
      errorMessage: errorMessage,
    );
  }

  final weekStart = startOfTermWeek(activeTerm.startDate, week);
  final weekDates = [
    for (var i = 0; i < 7; i++) weekStart.add(Duration(days: i)),
  ];

  final sessions = <AdminSession>[];

  for (final classModel in classes) {
    final attendance = attendanceByClass[classModel.id];

    final startsAt = (attendance?.date ??
            classSessionDateForWeek(
              termStartDate: activeTerm.startDate,
              classDay: classModel.dayOfWeek,
              startTime: classModel.startTime,
              weekNumber: week,
            ))
        .toLocal();

    final endsAt = sessionEndFor(startsAt, classModel.endTime);

    // The week's document wins where it exists, so a substitute assigned for
    // this week shows instead of the standing tutor.
    final assignedTutors = attendance?.tutors ?? classModel.tutors;
    final tutorNames = assignedTutors
        .map((id) => tutorNamesById[id] ?? '')
        .where((name) => name.isNotEmpty)
        .toList(growable: false);

    final roster = classModel.rosterFor(attendance);

    sessions.add(
      AdminSession(
        classId: classModel.id,
        sessionId: attendance?.id,
        startsAt: startsAt,
        endsAt: endsAt,
        timeLabel: DateFormat('h:mm a').format(startsAt),
        title: formatDashboardClassType(classModel.type),
        tutorLabel: joinNames(tutorNames),
        rosterCount: roster.length,
        capacity: classModel.capacity,
        studentNames: _rosterNames(
          roster: roster,
          permanentIds: classModel.enrolledStudents,
          studentNamesById: studentNamesById,
        ),
        status: adminSessionStatus(
          attendance: attendance,
          startsAt: startsAt,
          endsAt: endsAt,
          now: localNow,
          roster: roster,
          capacity: classModel.capacity,
        ),
        isLiveNow: !(attendance?.cancelled ?? false) &&
            !startsAt.isAfter(localNow) &&
            endsAt.isAfter(localNow),
      ),
    );
  }

  sessions.sort((a, b) => a.startsAt.compareTo(b.startsAt));

  final daysWithSessions = sessions.map((s) => s.startsAt.weekday).toSet();

  // Only the selected day is listed. The rest of the week is kept above, for
  // the strip's dots and the week count in the header.
  final daySessions = sessions
      .where((session) => DateUtils.isSameDay(session.startsAt, day))
      .toList(growable: false);

  final studentTotal =
      daySessions.fold<int>(0, (total, session) => total + session.rosterCount);
  final weekClassCount = sessions.length;

  return AdminClassesViewData(
    weekTitle: 'Week $week · ${weekRangeLabel(weekStart)}',
    weekSubtitle: 'Term ${activeTerm.termNumber} · '
        '$weekClassCount ${weekClassCount == 1 ? 'class' : 'classes'}',
    weekDates: weekDates,
    daysWithSessions: daysWithSessions,
    dayLabel: DateFormat('EEEE d MMM').format(day),
    daySummary: _daySummary(daySessions.length, studentTotal),
    selectedDate: day,
    grouping: grouping,
    groups: grouping == AdminClassesGrouping.time
        ? _byTime(daySessions)
        : _byTutor(daySessions),
    canGoToPreviousWeek: week > 1,
    canGoToNextWeek: week < activeTerm.totalWeeks,
    errorMessage: errorMessage,
  );
}

String _daySummary(int classCount, int studentCount) {
  if (classCount == 0) return 'No classes scheduled';
  final classes = classCount == 1 ? '1 class' : '$classCount classes';
  final students = studentCount == 1 ? '1 student' : '$studentCount students';
  return '$classes · $students';
}

/// The roster by name, standing students first and visitors after, each
/// alphabetical — the order `buildAdminRosterEntries` already uses, so the row
/// and the enrolments sheet cannot disagree about who comes first.
///
/// An id with no readable name is dropped rather than shown as a placeholder.
/// The seats count is derived from the ids, so it still reports the student.
List<String> _rosterNames({
  required Set<String> roster,
  required List<String> permanentIds,
  required Map<String, String> studentNamesById,
}) {
  if (roster.isEmpty || studentNamesById.isEmpty) return const [];

  final permanent = permanentIds.toSet();
  final standing = <String>[];
  final visiting = <String>[];

  for (final id in roster) {
    final name = studentNamesById[id]?.trim() ?? '';
    if (name.isEmpty) continue;
    (permanent.contains(id) ? standing : visiting).add(name);
  }

  int byName(String a, String b) => a.toLowerCase().compareTo(b.toLowerCase());
  standing.sort(byName);
  visiting.sort(byName);

  return [...standing, ...visiting];
}

List<AdminClassesGroup> _byTime(List<AdminSession> sessions) {
  final groups = <String, List<AdminSession>>{};
  for (final session in sessions) {
    groups.putIfAbsent(session.timeLabel, () => []).add(session);
  }

  return [
    for (final entry in groups.entries)
      AdminClassesGroup(
        label: entry.key,
        sessions: entry.value,
        // The slot containing the current moment, which the design marks `Now`.
        isNow: entry.value.any((session) => session.isLiveNow),
      ),
  ];
}

/// Groups by tutor, listing a co-taught class under each of its tutors so
/// "what is Jordan teaching today" is answerable at a glance.
///
/// Classes with nobody assigned fall under `Unassigned`. That is a neutral
/// bucket, not a cover alert: it carries no accent, no count and no action,
/// and exists only because a tutor-grouped view has to put them somewhere —
/// dropping them would hide real classes.
List<AdminClassesGroup> _byTutor(List<AdminSession> sessions) {
  final groups = <String, List<AdminSession>>{};

  for (final session in sessions) {
    if (session.tutorLabel.isEmpty) {
      groups.putIfAbsent('Unassigned', () => []).add(session);
      continue;
    }

    for (final name in session.tutorLabel.split(RegExp(r' & |, '))) {
      final trimmed = name.trim();
      if (trimmed.isEmpty) continue;
      groups.putIfAbsent(trimmed, () => []).add(session);
    }
  }

  final labels = groups.keys.toList()
    ..sort((a, b) {
      // Unassigned sorts last; it is the least interesting bucket, not an alert
      // that belongs at the top.
      if (a == 'Unassigned') return 1;
      if (b == 'Unassigned') return -1;
      return a.compareTo(b);
    });

  return [
    for (final label in labels)
      AdminClassesGroup(label: label, sessions: groups[label]!),
  ];
}

/// What a session's pill says.
///
/// A roll counts as done only when every student in [roster] carries a mark
/// (see [Attendance.isRollCompleteFor]). A half-marked roll — one tutor
/// through their share of the class, the other yet to start — reads as `NO
/// ROLL`, because it still needs someone.
AdminSessionStatus adminSessionStatus({
  required Attendance? attendance,
  required DateTime startsAt,
  required DateTime endsAt,
  required DateTime now,
  required Set<String> roster,
  required int capacity,
}) {
  if (attendance?.cancelled ?? false) return AdminSessionStatus.cancelled;

  final rosterCount = roster.length;
  final hasStarted = !startsAt.isAfter(now);
  final rollDone = attendance?.isRollCompleteFor(roster) ?? false;

  if (hasStarted) {
    if (!rollDone) return AdminSessionStatus.noRoll;
    return endsAt.isAfter(now)
        ? AdminSessionStatus.running
        : AdminSessionStatus.done;
  }

  return rosterCount >= capacity
      ? AdminSessionStatus.full
      : AdminSessionStatus.seats;
}
