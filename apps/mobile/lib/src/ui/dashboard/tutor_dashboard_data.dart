import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/announcement_model.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/term_model.dart';
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
        final endsAt = _sessionEnd(startsAt, classModel.endTime);

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

    // Generated attendance documents are owned by `system`. This is the best
    // currently available signal that a tutor has not confirmed the roll.
    return attendance.updatedBy == 'system';
  }).toList();
  final upcoming =
      sessions.where((session) => session.endsAt.isAfter(localNow)).toList();

  return TutorDashboardViewData(
    tutorName: tutorName,
    greeting: _greeting(localNow.hour),
    classesToday: todaysSessions.length,
    rollsToMark: rollsToMark.length,
    unreadMessages: unreadMessages,
    nextClass: upcoming.isEmpty ? null : _toDashboardSession(upcoming.first),
    attentionItems: rollsToMark
        .take(2)
        .map((session) => TutorDashboardAttentionItem(
              classId: session.classModel.id,
              title:
                  'Roll not marked — ${DateFormat('EEE').format(session.startsAt)} ${formatDashboardClassType(session.classModel.type)}',
              subtitle:
                  '${_relativeDay(session.startsAt, localNow)} · ${_studentCount(session)} students',
            ))
        .toList(growable: false),
    latestAnnouncement: latestAnnouncement == null
        ? null
        : TutorDashboardAnnouncement(
            title: latestAnnouncement.title,
            body: latestAnnouncement.body,
            ageLabel: _relativeAge(latestAnnouncement.createdAt, localNow),
            audienceLabel:
                latestAnnouncement.audience == 'all' ? 'ALL' : 'STAFF',
          ),
  );
}

String _greeting(int hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

TutorDashboardSession _toDashboardSession(
  _DashboardSessionCandidate candidate,
) {
  final duration = candidate.endsAt.difference(candidate.startsAt);
  return TutorDashboardSession(
    classId: candidate.classModel.id,
    title: formatDashboardClassType(candidate.classModel.type),
    startsAt: candidate.startsAt,
    durationLabel: _durationLabel(duration),
    studentCount: _studentCount(candidate),
  );
}

int _studentCount(_DashboardSessionCandidate candidate) {
  return candidate.attendance?.attendance.length ??
      candidate.classModel.enrolledStudents.length;
}

DateTime _sessionEnd(DateTime startsAt, String endTime) {
  final parts = endTime.split(':');
  if (parts.length != 2) return startsAt.add(const Duration(hours: 1));

  final hour = int.tryParse(parts[0]);
  final minute = int.tryParse(parts[1]);
  if (hour == null || minute == null) {
    return startsAt.add(const Duration(hours: 1));
  }

  return DateTime(
    startsAt.year,
    startsAt.month,
    startsAt.day,
    hour,
    minute,
  );
}

String _durationLabel(Duration duration) {
  final minutes = duration.inMinutes;
  if (minutes <= 0) return '1 hr';
  if (minutes == 60) return '1 hr';
  if (minutes % 60 == 0) return '${minutes ~/ 60} hrs';
  if (minutes > 60) {
    final hours = (minutes / 60).toStringAsFixed(1);
    return '$hours hrs';
  }
  return '$minutes min';
}

String _relativeDay(DateTime date, DateTime now) {
  final day = DateTime(date.year, date.month, date.day);
  final today = DateTime(now.year, now.month, now.day);
  final difference = today.difference(day).inDays;
  if (difference == 0) return 'Today';
  if (difference == 1) return 'Yesterday';
  return DateFormat('EEE d MMM').format(date);
}

String _relativeAge(DateTime date, DateTime now) {
  final difference = now.difference(date.toLocal());
  if (difference.isNegative || difference.inHours < 1) return 'just now';
  if (difference.inHours < 24) return '${difference.inHours}h ago';
  if (difference.inDays == 1) return 'yesterday';
  if (difference.inDays < 7) return '${difference.inDays}d ago';
  return DateFormat('d MMM').format(date.toLocal());
}

String formatDashboardClassType(String rawType) {
  const labels = {
    '5-10': 'Years 5–10',
    'stdmath11': 'Year 11 Standard Maths',
    'stdmath12': 'Year 12 Standard Maths',
    'advmath11': 'Year 11 Advanced Maths',
    'advmath12': 'Year 12 Advanced Maths',
    'ex1math11': 'Year 11 Maths Extension 1',
    'ex1math12': 'Year 12 Maths Extension 1',
    'ex2math12': 'Year 12 Maths Extension 2',
    'stdeng11': 'Year 11 Standard English',
    'stdeng12': 'Year 12 Standard English',
    'adveng11': 'Year 11 Advanced English',
    'adveng12': 'Year 12 Advanced English',
    'ex1eng11': 'Year 11 English Extension 1',
    'ex1eng12': 'Year 12 English Extension 1',
    'ex2eng12': 'Year 12 English Extension 2',
  };
  final normalized = rawType.trim().toLowerCase();
  if (normalized.isEmpty) return 'Tutoring class';
  return labels[normalized] ?? rawType.trim();
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
