import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/ui/messaging/inbox_data.dart';

/// Whether the tutor has said if a student turned up.
///
/// [unmarked] is a real state, not a default to be papered over. It is now
/// stored honestly — a student with no entry in the session's marks map — but
/// it used to be a guess, because the one list on the document could not tell
/// "nobody has marked this yet" from "everybody was away".
enum RollAttendance { unmarked, here, away }

/// One student on the roll, with whatever the tutor has entered so far.
@immutable
class RollStudent {
  final String studentId;
  final String name;
  final String initials;

  /// `Year 9`, or empty when the student record has no grade.
  final String yearLabel;

  final RollAttendance attendance;
  final StudentProgress? progress;
  final String feedback;

  /// True once feedback for this student has been written against this
  /// session. Re-submitting must not send a second copy to the family.
  final bool feedbackAlreadySent;

  /// Parents to attribute the feedback to, taken from the student record.
  final List<String> parentIds;

  const RollStudent({
    required this.studentId,
    required this.name,
    required this.initials,
    required this.yearLabel,
    required this.attendance,
    required this.parentIds,
    this.progress,
    this.feedback = '',
    this.feedbackAlreadySent = false,
  });

  bool get isHere => attendance == RollAttendance.here;
  bool get isAway => attendance == RollAttendance.away;
  bool get isUnmarked => attendance == RollAttendance.unmarked;

  bool get hasFeedback => feedback.trim().isNotEmpty;

  /// Feedback is expected of present students only. An absent student has
  /// nothing to report on, and an unmarked one is not yet a question.
  bool get needsFeedback => isHere && !hasFeedback && !feedbackAlreadySent;

  /// Done, for the `N of M complete` counter: marked away, or marked here with
  /// something written about them.
  bool get isComplete =>
      isAway || (isHere && (hasFeedback || feedbackAlreadySent));

  RollStudent copyWith({
    RollAttendance? attendance,
    StudentProgress? progress,
    String? feedback,
    bool clearProgress = false,
  }) {
    return RollStudent(
      studentId: studentId,
      name: name,
      initials: initials,
      yearLabel: yearLabel,
      attendance: attendance ?? this.attendance,
      progress: clearProgress ? null : (progress ?? this.progress),
      feedback: feedback ?? this.feedback,
      feedbackAlreadySent: feedbackAlreadySent,
      parentIds: parentIds,
    );
  }
}

/// Where the session sits relative to now, for the header badge.
enum RollSessionState { beforeStart, inSession, finished, cancelled }

@immutable
class ClassRollViewData {
  final String classTitle;

  /// `Wed 4:30 – 5:30 · 6 students`.
  final String whenLabel;

  final RollSessionState sessionState;
  final List<RollStudent> students;

  /// Set when the roster could not be loaded.
  final String? errorMessage;

  const ClassRollViewData({
    required this.classTitle,
    required this.whenLabel,
    required this.sessionState,
    required this.students,
    this.errorMessage,
  });

  String get statusLabel => switch (sessionState) {
        RollSessionState.beforeStart => 'UPCOMING',
        RollSessionState.inSession => 'IN SESSION',
        RollSessionState.finished => 'FINISHED',
        RollSessionState.cancelled => 'CANCELLED',
      };

  int get completeCount => students.where((s) => s.isComplete).length;

  /// `3 of 6 complete`.
  String get progressLabel => '$completeCount of ${students.length} complete';

  /// Every student has been marked here or away. This is what allows the roll
  /// itself to be stamped complete — feedback is tracked separately, because
  /// it is legitimately written after the session while the roll is not.
  bool get isAttendanceComplete =>
      students.isNotEmpty && students.every((s) => !s.isUnmarked);

  List<RollStudent> get awaitingFeedback =>
      students.where((s) => s.needsFeedback).toList(growable: false);

  int get unmarkedCount => students.where((s) => s.isUnmarked).length;

  /// What is still outstanding, or null when nothing is.
  ///
  /// Shown as guidance rather than as a block: a tutor marking the roll at the
  /// start of class must be able to save before anyone has been written about.
  String? get outstandingLabel {
    final unmarked = unmarkedCount;
    final awaiting = awaitingFeedback.length;
    if (unmarked == 0 && awaiting == 0) return null;

    final parts = <String>[
      if (unmarked > 0) '$unmarked still to mark',
      if (awaiting > 0) '$awaiting awaiting feedback',
    ];
    return parts.join(' · ');
  }
}

/// Builds the roll from the class, its roster and any feedback already written
/// against this session.
///
/// Pure, so the completion and attribution rules are testable without
/// Firestore.
///
/// [marks] is what the session has recorded so far — possibly written by a
/// co-tutor marking the other half of the class from their own phone. A
/// student missing from it is genuinely unmarked, so no flag is needed to
/// interpret their absence.
ClassRollViewData buildClassRollViewData({
  required ClassModel classInfo,
  required List<Student> roster,
  required Map<String, RollMark> marks,
  required List<StudentFeedback> sessionFeedback,
  required DateTime sessionStart,
  required DateTime sessionEnd,
  required DateTime now,
  required bool cancelled,
  String? errorMessage,
}) {
  final feedbackByStudent = {
    for (final entry in sessionFeedback) entry.studentId: entry,
  };

  final students = <RollStudent>[];
  for (final student in roster) {
    final existing = feedbackByStudent[student.id];

    students.add(
      RollStudent(
        studentId: student.id,
        name: '${student.firstName} ${student.lastName}'.trim(),
        initials: initialsFor('${student.firstName} ${student.lastName}'),
        yearLabel: yearLabelFor(student.grade),
        attendance: switch (marks[student.id]) {
          RollMark.here => RollAttendance.here,
          RollMark.away => RollAttendance.away,
          null => RollAttendance.unmarked,
        },
        progress: existing?.progress,
        feedback: existing?.feedback ?? '',
        feedbackAlreadySent: existing != null,
        parentIds: student.parents,
      ),
    );
  }

  students.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

  return ClassRollViewData(
    classTitle: formatDashboardClassType(classInfo.type),
    whenLabel: _whenLabel(
      sessionStart: sessionStart,
      sessionEnd: sessionEnd,
      studentCount: students.length,
    ),
    sessionState: rollSessionState(
      sessionStart: sessionStart,
      sessionEnd: sessionEnd,
      now: now,
      cancelled: cancelled,
    ),
    students: students,
    errorMessage: errorMessage,
  );
}

/// The marks to send for a save: those the tutor actually changed.
///
/// Deliberately not every student on screen. [stored] may hold a co-tutor's
/// marks — most classes are taught by two — and re-sending them would overwrite
/// anything they changed since this screen loaded. Unmarked students contribute
/// nothing: there is no way to un-mark someone, so a missing key is only ever
/// "not yet reached", never "deliberately cleared".
Map<String, RollMark> marksToWrite({
  required List<RollStudent> students,
  required Map<String, RollMark> stored,
}) {
  final marks = <String, RollMark>{};

  for (final student in students) {
    final mark = switch (student.attendance) {
      RollAttendance.here => RollMark.here,
      RollAttendance.away => RollMark.away,
      RollAttendance.unmarked => null,
    };

    if (mark != null && stored[student.studentId] != mark) {
      marks[student.studentId] = mark;
    }
  }

  return marks;
}

/// The corrections to send for a save: sent notes the tutor actually changed.
///
/// Returned as the stored record with the tutor's text and status laid over it,
/// so the caller keeps the document id that addresses it.
///
/// Deliberately not every sent note. Re-writing an untouched one would stamp it
/// edited and tell the family it changed when nobody touched it. An emptied
/// note *is* returned rather than dropped — silently keeping the old text would
/// leave the tutor believing they had deleted something they had not, so the
/// caller rejects it instead.
///
/// [sent] is what storage held when the screen loaded. A student with no record
/// there has nothing to correct: their note is new, and belongs in the create
/// path where the family is notified about it.
List<StudentFeedback> feedbackEditsToWrite({
  required List<RollStudent> students,
  required List<StudentFeedback> sent,
}) {
  final sentByStudent = {for (final entry in sent) entry.studentId: entry};
  final edits = <StudentFeedback>[];

  for (final student in students) {
    // An absent student's note stands as written. Marking someone away after
    // the fact does not retract what was already sent about the lesson.
    if (!student.isHere) continue;

    final stored = sentByStudent[student.studentId];
    if (stored == null) continue;

    final feedback = student.feedback.trim();
    final unchanged = feedback == stored.feedback.trim() &&
        student.progress == stored.progress;
    if (unchanged) continue;

    edits.add(
      stored.copyWith(
        feedback: feedback,
        progress: student.progress,
        clearProgress: student.progress == null,
      ),
    );
  }

  return edits;
}

RollSessionState rollSessionState({
  required DateTime sessionStart,
  required DateTime sessionEnd,
  required DateTime now,
  required bool cancelled,
}) {
  if (cancelled) return RollSessionState.cancelled;
  if (now.isBefore(sessionStart)) return RollSessionState.beforeStart;
  if (now.isBefore(sessionEnd)) return RollSessionState.inSession;
  return RollSessionState.finished;
}

/// `Wed 4:30 – 5:30 · 6 students`.
String _whenLabel({
  required DateTime sessionStart,
  required DateTime sessionEnd,
  required int studentCount,
}) {
  final day = DateFormat('EEE').format(sessionStart);
  final start = DateFormat('h:mm').format(sessionStart);
  final end = DateFormat('h:mm').format(sessionEnd);
  final students =
      '$studentCount ${studentCount == 1 ? 'student' : 'students'}';
  return '$day $start – $end · $students';
}

/// The subject recorded against feedback written from a roll.
///
/// The feedback record has always carried a free-text `subject`, which the
/// parent dashboard attributes with. Sourcing it from the class keeps that
/// attribution accurate now that feedback can come from a session.
String feedbackSubjectFor(ClassModel classInfo) =>
    formatDashboardClassType(classInfo.type);
