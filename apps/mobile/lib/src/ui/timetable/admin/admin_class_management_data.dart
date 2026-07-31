import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/tutor_model.dart';
import 'package:tenacity/src/models/waitlist_entry_model.dart';
import 'package:tenacity/src/models/waitlist_promotion_result_model.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';

const adminClassDays = <String>[
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const adminClassTimeSlots = <String>[
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
  '19:30',
  '20:00',
  '20:30',
  '21:00',
  '21:30',
  '22:00',
];

const adminClassTypes = <String>[
  '5-10',
  'stdmath11',
  'stdmath12',
  'advmath11',
  'advmath12',
  'ex1math11',
  'ex1math12',
  'ex2math12',
  'stdeng11',
  'stdeng12',
  'adveng11',
  'adveng12',
  'ex1eng11',
  'ex1eng12',
  'ex2eng12',
];

const adminClassCapacities = <int>[1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

enum AdminEnrolmentType { oneOff, permanent }

enum AdminTutorScope { classOnly, day }

enum AdminTutorEffective { thisWeek, permanent }

@immutable
class AdminRosterEntry {
  final Student student;
  final bool isPermanent;
  final bool isBookedThisWeek;

  const AdminRosterEntry({
    required this.student,
    required this.isPermanent,
    required this.isBookedThisWeek,
  });

  String get name {
    final value = '${student.firstName} ${student.lastName}'.trim();
    return value.isEmpty ? 'Unknown student' : value;
  }

  String get initials {
    final parts = name
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty && part != 'Unknown')
        .toList();
    if (parts.isEmpty) return '?';
    return [
      String.fromCharCode(parts.first.runes.first),
      if (parts.length > 1) String.fromCharCode(parts.last.runes.first),
    ].join().toUpperCase();
  }

  String get enrolmentLabel => isPermanent ? 'Permanent' : 'One-off';
}

/// Builds the roster the editor shows: permanent students plus this week's
/// one-off visitors. Student ids without a readable document are omitted from
/// the visible entries, but remain available in [AdminRosterSnapshot] so a
/// no-op save cannot remove them from the session.
List<AdminRosterEntry> buildAdminRosterEntries({
  required ClassModel classModel,
  required Attendance? attendance,
  required Iterable<Student> students,
}) {
  final byId = {for (final student in students) student.id: student};
  final ids = <String>{
    ...classModel.enrolledStudents,
    ...?attendance?.attendance,
  };

  final entries = [
    for (final id in ids)
      if (byId[id] != null)
        AdminRosterEntry(
          student: byId[id]!,
          isPermanent: classModel.enrolledStudents.contains(id),
          isBookedThisWeek: attendance?.attendance.contains(id) ?? false,
        ),
  ];
  entries.sort((a, b) {
    if (a.isPermanent != b.isPermanent) return a.isPermanent ? -1 : 1;
    return a.name.toLowerCase().compareTo(b.name.toLowerCase());
  });
  return entries;
}

@immutable
class AdminRosterSnapshot {
  AdminRosterSnapshot({
    required Iterable<AdminRosterEntry> entries,
    required Iterable<String> bookedStudentIds,
    required this.attendanceDocId,
  })  : entries = List.unmodifiable(entries),
        bookedStudentIds = List.unmodifiable(bookedStudentIds);

  final List<AdminRosterEntry> entries;
  final List<String> bookedStudentIds;
  final String? attendanceDocId;
}

@immutable
class AdminWeekBookingsUpdate {
  AdminWeekBookingsUpdate({
    required Iterable<String> expectedStudentIds,
    required Iterable<String> studentIds,
    required this.attendanceDocId,
  })  : expectedStudentIds = List.unmodifiable(expectedStudentIds),
        studentIds = List.unmodifiable(studentIds);

  final List<String> expectedStudentIds;
  final List<String> studentIds;
  final String? attendanceDocId;
}

AdminRosterSnapshot buildAdminRosterSnapshot({
  required ClassModel classModel,
  required Attendance? attendance,
  required Iterable<Student> students,
}) {
  return AdminRosterSnapshot(
    entries: buildAdminRosterEntries(
      classModel: classModel,
      attendance: attendance,
      students: students,
    ),
    bookedStudentIds: attendance?.attendance ?? const [],
    attendanceDocId: attendance?.id,
  );
}

@immutable
class AdminTutorChoice {
  final String id;
  final String name;

  const AdminTutorChoice({required this.id, required this.name});
}

List<AdminTutorChoice> buildAdminTutorChoices(Iterable<Tutor> tutors) {
  final choices = [
    for (final tutor in tutors)
      AdminTutorChoice(
        id: tutor.uid,
        name: _displayName(
          '${tutor.firstName} ${tutor.lastName}',
          fallback: 'Unknown tutor',
        ),
      ),
  ];
  choices.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
  return choices;
}

@immutable
class AdminTutorAssignment {
  final List<String> tutorIds;
  final AdminTutorScope scope;
  final AdminTutorEffective effective;

  const AdminTutorAssignment({
    required this.tutorIds,
    required this.scope,
    required this.effective,
  });
}

@immutable
class AdminAddClassDraft {
  final String type;
  final String dayOfWeek;
  final String startTime;
  final String endTime;
  final int capacity;
  final List<String> tutorIds;

  const AdminAddClassDraft({
    required this.type,
    required this.dayOfWeek,
    required this.startTime,
    required this.endTime,
    required this.capacity,
    required this.tutorIds,
  });

  ClassModel toClassModel({required String id}) {
    return ClassModel(
      id: id,
      type: type,
      dayOfWeek: dayOfWeek,
      startTime: startTime,
      endTime: endTime,
      capacity: capacity,
      enrolledStudents: const [],
      tutors: tutorIds,
    );
  }
}

/// Returns the first blocking add-class error.
///
/// Every field has a seeded choice. The one invalid seeded combination in the
/// legacy form was a 4:00–4:00 class, so duration is the only validation the
/// form needs before it can submit the same payload as before.
String? validateAdminAddClassDraft(AdminAddClassDraft draft) {
  int minutes(String value) {
    final parts = value.split(':');
    if (parts.length != 2) return -1;
    final hour = int.tryParse(parts[0]);
    final minute = int.tryParse(parts[1]);
    if (hour == null || minute == null) return -1;
    return hour * 60 + minute;
  }

  final start = minutes(draft.startTime);
  final end = minutes(draft.endTime);
  if (start < 0 || end < 0) return 'Choose valid start and end times.';
  if (end <= start) return 'End time must be after start time.';
  return null;
}

@immutable
class AdminWaitlistEntryData {
  final WaitlistEntry entry;
  final String studentName;
  final String parentName;

  const AdminWaitlistEntryData({
    required this.entry,
    required this.studentName,
    required this.parentName,
  });

  bool get canPromote {
    return entry.status == WaitlistStatus.active ||
        entry.status == WaitlistStatus.offered ||
        entry.status == WaitlistStatus.accepted;
  }

  String get statusLabel => switch (entry.status) {
        WaitlistStatus.active => 'Active',
        WaitlistStatus.offered => 'Offered',
        WaitlistStatus.accepted => 'Accepted',
        WaitlistStatus.declined => 'Declined',
        WaitlistStatus.expired => 'Expired',
        WaitlistStatus.cancelled => 'Cancelled',
        WaitlistStatus.promoted => 'Promoted',
      };

  String get reasonLabel => switch (entry.reason) {
        WaitlistReason.classNotOpen => 'Class not open',
        WaitlistReason.classFull => 'Class full',
      };

  String get joinedLabel => formatAdminWaitlistDate(entry.createdAt);
  String get updatedLabel => formatAdminWaitlistDate(entry.updatedAt);
}

String cleanAdminDisplayName(String name, {required String fallback}) {
  return _displayName(name, fallback: fallback);
}

String _displayName(String name, {required String fallback}) {
  final trimmed = name.trim();
  if (trimmed.isEmpty || trimmed == 'null null') return fallback;
  return trimmed;
}

String formatAdminWaitlistDate(DateTime? date) {
  if (date == null) return '-';
  return DateFormat('d MMM yyyy, h:mm a').format(date);
}

String formatAdminClassTime(String value) {
  try {
    return DateFormat('h:mm a').format(DateFormat('HH:mm').parseStrict(value));
  } catch (_) {
    return value;
  }
}

String adminClassSubtitle(ClassModel classModel) {
  return '${classModel.dayOfWeek}, '
      '${formatAdminClassTime(classModel.startTime)} · '
      '${formatDashboardClassType(classModel.type)}';
}

/// One selectable class in the dashboard's New enrol picker.
///
/// Seats are reported so an admin can see a class is full before choosing it
/// rather than after. [alreadyEnrolled] marks the classes the chosen student
/// already belongs to permanently, which the picker shows but does not offer.
@immutable
class AdminClassChoice {
  final ClassModel classModel;
  final String title;
  final String subtitle;
  final int enrolled;
  final int capacity;
  final bool alreadyEnrolled;

  const AdminClassChoice({
    required this.classModel,
    required this.title,
    required this.subtitle,
    required this.enrolled,
    required this.capacity,
    required this.alreadyEnrolled,
  });

  bool get isFull => enrolled >= capacity;

  /// Selectable unless the student is already on the permanent roster. A full
  /// class stays selectable because a one-off booking is still a valid choice
  /// for it; the enrolment call is what ultimately accepts or rejects.
  bool get isSelectable => !alreadyEnrolled;

  String get seatsLabel {
    if (alreadyEnrolled) return 'Already enrolled';
    final remaining = capacity - enrolled;
    if (remaining <= 0) return 'Full · $enrolled/$capacity';
    return '$remaining ${remaining == 1 ? 'seat' : 'seats'} · '
        '$enrolled/$capacity';
  }
}

int _adminClassDayIndex(String dayOfWeek) {
  final index = adminClassDays.indexWhere(
    (day) => day.toLowerCase() == dayOfWeek.trim().toLowerCase(),
  );
  // Unknown days sort last rather than silently colliding with Monday.
  return index == -1 ? adminClassDays.length : index;
}

/// Orders [classes] the way the admin timetable reads them — by day, then
/// start time, then class type — and annotates each with its seat count.
List<AdminClassChoice> buildAdminClassChoices({
  required Iterable<ClassModel> classes,
  String? studentId,
}) {
  final choices = classes
      .map(
        (classModel) => AdminClassChoice(
          classModel: classModel,
          title: formatDashboardClassType(classModel.type),
          subtitle: '${classModel.dayOfWeek}, '
              '${formatAdminClassTime(classModel.startTime)}',
          enrolled: classModel.enrolledStudents.length,
          capacity: classModel.capacity,
          alreadyEnrolled: studentId != null &&
              classModel.enrolledStudents.contains(studentId),
        ),
      )
      .toList();

  choices.sort((a, b) {
    final day = _adminClassDayIndex(a.classModel.dayOfWeek)
        .compareTo(_adminClassDayIndex(b.classModel.dayOfWeek));
    if (day != 0) return day;
    final time = a.classModel.startTime.compareTo(b.classModel.startTime);
    if (time != 0) return time;
    return a.title.toLowerCase().compareTo(b.title.toLowerCase());
  });

  return choices;
}

String waitlistPromotionMessage(
  WaitlistPromotionResult result,
  String studentName,
) {
  return switch (result.outcome) {
    WaitlistPromotionOutcome.promoted =>
      '$studentName promoted to permanent enrolment.',
    WaitlistPromotionOutcome.alreadyEnrolled =>
      '$studentName was already enrolled. Waitlist entry marked promoted.',
    WaitlistPromotionOutcome.classFull =>
      'Class is full. $studentName was not promoted.',
    WaitlistPromotionOutcome.notPromotable =>
      'This waitlist entry can no longer be promoted.',
  };
}
