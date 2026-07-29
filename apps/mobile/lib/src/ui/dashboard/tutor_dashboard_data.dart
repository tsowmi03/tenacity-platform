import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/announcement_model.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/utils/class_session_dates.dart';

@immutable
class TutorDashboardSession {
  final String classId;
  final String title;
  final DateTime startsAt;
  final String durationLabel;
  final int studentCount;

  const TutorDashboardSession({
    required this.classId,
    required this.title,
    required this.startsAt,
    required this.durationLabel,
    required this.studentCount,
  });
}

@immutable
class TutorDashboardAttentionItem {
  final String classId;
  final String title;
  final String subtitle;

  const TutorDashboardAttentionItem({
    required this.classId,
    required this.title,
    required this.subtitle,
  });
}

@immutable
class TutorDashboardAnnouncement {
  final String title;
  final String body;
  final String ageLabel;
  final String audienceLabel;

  const TutorDashboardAnnouncement({
    required this.title,
    required this.body,
    required this.ageLabel,
    required this.audienceLabel,
  });
}

@immutable
class TutorDashboardViewData {
  final String tutorName;
  final String greeting;
  final int classesToday;
  final int rollsToMark;
  final int unreadMessages;
  final TutorDashboardSession? nextClass;
  final List<TutorDashboardAttentionItem> attentionItems;
  final TutorDashboardAnnouncement? latestAnnouncement;

  const TutorDashboardViewData({
    required this.tutorName,
    required this.greeting,
    required this.classesToday,
    required this.rollsToMark,
    required this.unreadMessages,
    required this.nextClass,
    required this.attentionItems,
    required this.latestAnnouncement,
  });
}

TutorDashboardViewData buildTutorDashboardViewData({
  required String tutorId,
  required String tutorName,
  required DateTime now,
  required Term? activeTerm,
  required int currentWeek,
  required List<ClassModel> classes,
  required Map<String, Attendance> attendanceByClass,
  required int unreadMessages,
  required Announcement? latestAnnouncement,

  /// Which students already have feedback, keyed by class.
  ///
  /// Null means the read did not succeed, which is not the same as an empty
  /// map: empty means nothing has been written yet and every present student
  /// is owed a note, whereas null means we do not know and must not claim
  /// feedback is outstanding.
  Map<String, Set<String>>? feedbackStudentIdsByClass,
}) {
  final localNow = now.toLocal();
  final sessions = <_DashboardSessionCandidate>[];

  if (activeTerm != null && currentWeek > 0) {
    for (final classModel in classes) {
      for (var week = currentWeek; week <= activeTerm.totalWeeks; week++) {
        final attendance =
            week == currentWeek ? attendanceByClass[classModel.id] : null;
        final assignedTutorIds =
            attendance == null ? classModel.tutors : attendance.tutors;

        if (!assignedTutorIds.contains(tutorId) ||
            (attendance?.cancelled ?? false)) {
          continue;
        }

        final startsAt = (attendance?.date ??
                classSessionDateForWeek(
                  termStartDate: activeTerm.startDate,
                  classDay: classModel.dayOfWeek,
                  startTime: classModel.startTime,
                  weekNumber: week,
                ))
            .toLocal();
        final endsAt = sessionEndFor(startsAt, classModel.endTime);

        sessions.add(
          _DashboardSessionCandidate(
            classModel: classModel,
            attendance: attendance,
            startsAt: startsAt,
            endsAt: endsAt,
          ),
        );
      }
    }
  }

  sessions.sort((a, b) => a.startsAt.compareTo(b.startsAt));

  final todaysSessions = sessions
      .where((session) => DateUtils.isSameDay(session.startsAt, localNow))
      .toList();
  final rollsToMark = sessions.where((session) {
    final attendance = session.attendance;
    if (attendance == null || session.startsAt.isAfter(localNow)) return false;

    // Derived from the marks covering the roster, so a roll half-marked by a
    // co-tutor still counts as outstanding. This used to read
    // `updatedBy == 'system'`, which cleared the count as soon as anyone else
    // touched the document — an admin adding a student marked the roll done on
    // the tutor's behalf.
    return !attendance
        .isRollCompleteFor(session.classModel.rosterFor(attendance));
  }).toList();
  final upcoming =
      sessions.where((session) => session.endsAt.isAfter(localNow)).toList();

  // Feedback is only "due" once the roll is finished. Before that the session
  // already shows as an unmarked roll, and listing it twice would just crowd
  // the same class into both attention slots.
  final feedbackDue = feedbackStudentIdsByClass == null
      ? const <_DashboardSessionCandidate>[]
      : sessions.where((session) {
          final attendance = session.attendance;
          if (attendance == null || session.startsAt.isAfter(localNow)) {
            return false;
          }
          final roster = session.classModel.rosterFor(attendance);
          if (!attendance.isRollCompleteFor(roster)) return false;

          final written = feedbackStudentIdsByClass[session.classModel.id] ??
              const <String>{};
          // Only students who actually attended are owed a note.
          return roster.any((studentId) =>
              attendance.marks[studentId] == RollMark.here &&
              !written.contains(studentId));
        }).toList();

  final attentionItems = <TutorDashboardAttentionItem>[
    for (final session in rollsToMark)
      TutorDashboardAttentionItem(
        classId: session.classModel.id,
        title:
            'Roll not marked — ${DateFormat('EEE').format(session.startsAt)} ${formatDashboardClassType(session.classModel.type)}',
        subtitle:
            '${relativeDayLabel(session.startsAt, localNow)} · ${_studentCount(session)} students',
      ),
    for (final session in feedbackDue)
      TutorDashboardAttentionItem(
        classId: session.classModel.id,
        title:
            'Feedback due — ${DateFormat('EEE').format(session.startsAt)} ${formatDashboardClassType(session.classModel.type)}',
        subtitle:
            '${relativeDayLabel(session.startsAt, localNow)} · ${_feedbackOutstanding(session, feedbackStudentIdsByClass)} of ${session.attendance!.hereCountFor(session.classModel.rosterFor(session.attendance!))} still to write',
      ),
  ];

  return TutorDashboardViewData(
    tutorName: tutorName,
    greeting: dashboardGreeting(localNow.hour),
    classesToday: todaysSessions.length,
    rollsToMark: rollsToMark.length,
    unreadMessages: unreadMessages,
    nextClass: upcoming.isEmpty ? null : _toDashboardSession(upcoming.first),
    // Unmarked rolls come first: they block the feedback they precede.
    attentionItems: attentionItems.take(2).toList(growable: false),
    latestAnnouncement: latestAnnouncement == null
        ? null
        : TutorDashboardAnnouncement(
            title: latestAnnouncement.title,
            body: latestAnnouncement.body,
            ageLabel: relativeAgeLabel(latestAnnouncement.createdAt, localNow),
            audienceLabel:
                latestAnnouncement.audience == 'all' ? 'ALL' : 'STAFF',
          ),
  );
}

TutorDashboardSession _toDashboardSession(
  _DashboardSessionCandidate candidate,
) {
  final duration = candidate.endsAt.difference(candidate.startsAt);
  return TutorDashboardSession(
    classId: candidate.classModel.id,
    title: formatDashboardClassType(candidate.classModel.type),
    startsAt: candidate.startsAt,
    durationLabel: durationLabelFor(duration),
    studentCount: _studentCount(candidate),
  );
}

/// How many present students still owe a feedback note for this session.
int _feedbackOutstanding(
  _DashboardSessionCandidate candidate,
  Map<String, Set<String>>? feedbackStudentIdsByClass,
) {
  final attendance = candidate.attendance;
  if (attendance == null) return 0;
  final written =
      feedbackStudentIdsByClass?[candidate.classModel.id] ?? const <String>{};
  return candidate.classModel
      .rosterFor(attendance)
      .where((studentId) =>
          attendance.marks[studentId] == RollMark.here &&
          !written.contains(studentId))
      .length;
}

int _studentCount(_DashboardSessionCandidate candidate) {
  return candidate.attendance?.attendance.length ??
      candidate.classModel.enrolledStudents.length;
}

class _DashboardSessionCandidate {
  final ClassModel classModel;
  final Attendance? attendance;
  final DateTime startsAt;
  final DateTime endsAt;

  const _DashboardSessionCandidate({
    required this.classModel,
    required this.attendance,
    required this.startsAt,
    required this.endsAt,
  });
}
