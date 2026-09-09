import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/helpers/parent_class_availability.dart';
import 'package:tenacity/src/helpers/same_day_booking_cutoff.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/utils/class_session_dates.dart';

/// What a family can do with a class they are looking at.
///
/// These mirror the options `_showParentClassOptionsDialog` will actually
/// offer. If the two ever diverge a row can promise something the dialog then
/// refuses, which is the defect this enum exists to prevent.
enum ParentBrowseAvailability {
  /// The session is not going ahead, so nothing can be booked into it.
  cancelled,

  /// One of this family's children already attends this session.
  booked,

  /// Ongoing enrolment is open — the dialog will offer "Enrol permanent".
  open,

  /// Ongoing enrolment is closed, either because the class is full or because
  /// it has not reached its minimum size, so the dialog offers the waitlist.
  waitlist,
}

/// One bookable class in the week being browsed.
@immutable
class ParentBrowseClass {
  final String classId;
  final DateTime startsAt;
  final String time;
  final String durationLabel;
  final String title;

  /// Availability notes and the tutors, e.g.
  /// `One-off spot this week · Class is full · Jordan Lee`.
  final String subtitle;

  final ParentBrowseAvailability availability;

  /// Ongoing places left, only meaningful when [availability] is
  /// [ParentBrowseAvailability.open].
  final int spotsRemaining;

  /// This family's children already in the session, for the options dialog.
  final List<String> childIds;

  const ParentBrowseClass({
    required this.classId,
    required this.startsAt,
    required this.time,
    required this.durationLabel,
    required this.title,
    required this.subtitle,
    required this.availability,
    required this.spotsRemaining,
    required this.childIds,
  });

  bool get isBooked => availability == ParentBrowseAvailability.booked;

  String get statusLabel => switch (availability) {
        ParentBrowseAvailability.cancelled => 'CANCELLED',
        ParentBrowseAvailability.booked => 'BOOKED',
        ParentBrowseAvailability.open =>
          spotsRemaining == 1 ? '1 SPOT' : '$spotsRemaining SPOTS',
        ParentBrowseAvailability.waitlist => 'WAITLIST',
      };
}

/// The classes falling on one day, under a heading like `WEDNESDAY 15`.
@immutable
class ParentBrowseDay {
  final DateTime date;
  final List<ParentBrowseClass> classes;
  final bool isToday;

  const ParentBrowseDay({
    required this.date,
    required this.classes,
    required this.isToday,
  });

  String get label => DateFormat('EEEE d').format(date).toUpperCase();
}

@immutable
class ParentBrowseViewData {
  /// `Week 1 · 13 – 19 Jul`.
  final String weekTitle;

  /// `Term 3 · 6 classes available`.
  final String weekSubtitle;

  final List<DateTime> weekDates;

  /// Days in the week with at least one class, for the strip's dots.
  final Set<int> daysWithClasses;

  final DateTime? selectedDay;
  final List<ParentBrowseDay> days;

  final bool canGoToPreviousWeek;
  final bool canGoToNextWeek;

  /// Shown while the term has not started: bookings are open before lessons
  /// are. Null once the term is under way.
  final String? preTermNotice;

  /// Set when the family's eligible subjects could not be loaded. The week is
  /// then unknowable rather than empty, and the two must not look alike — an
  /// empty list would tell a parent there is nothing to book when in fact we
  /// simply could not find out.
  final String? errorMessage;

  const ParentBrowseViewData({
    required this.weekTitle,
    required this.weekSubtitle,
    required this.weekDates,
    required this.daysWithClasses,
    required this.selectedDay,
    required this.days,
    required this.canGoToPreviousWeek,
    required this.canGoToNextWeek,
    this.preTermNotice,
    this.errorMessage,
  });

  bool get isEmpty => days.isEmpty;
}

/// Derives the browse week from the loaded term, classes and attendance.
///
/// Pure, so every availability and grouping rule is testable without Firestore.
///
/// [classes] must already be narrowed to the subjects the family is eligible
/// for — that rule lives on `TimetableController.isEligibleClass` and is not
/// duplicated here. Sessions that have already started are dropped, because
/// nothing can be booked into them.
///
/// [selectedDay] narrows to one day; null means the whole week.
ParentBrowseViewData buildParentBrowseViewData({
  required DateTime now,
  required Term? activeTerm,
  required int week,
  required List<ClassModel> classes,
  required Map<String, Attendance> attendanceByClass,
  required List<Student> children,
  required Map<String, String> tutorNamesById,
  DateTime? selectedDay,
  String? errorMessage,
}) {
  final localNow = now.toLocal();

  if (activeTerm == null || week <= 0) {
    return ParentBrowseViewData(
      weekTitle: 'No active term',
      weekSubtitle: 'Classes open for booking once a term starts',
      weekDates: const [],
      daysWithClasses: const {},
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

  final childIds = children.map((c) => c.id).toSet();
  final namesById = {for (final c in children) c.id: c.firstName};

  // How far the week on screen is from the week containing today. The one-off
  // rules depend on it, so it is derived here rather than read off a
  // controller.
  final weeksAhead = week - _weekContaining(localNow, activeTerm);

  final browsable = <ParentBrowseClass>[];

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

    // A class that has already started cannot be booked, and the legacy browse
    // surface hid it for exactly that reason.
    if (startsAt.isBefore(localNow)) continue;

    final attending = (attendance?.attendance ?? const <String>[])
        .where(childIds.contains)
        .toList(growable: false);

    final availability = ParentClassAvailability.forClass(
      classInfo: classModel,
      attendance: attendance,
      weeksAhead: weeksAhead,
      sameDayCutoffPassed: sameDayBookingClosed(
        now: localNow,
        sessionStartsAt: startsAt,
      ),
    );

    final tutorNames = (attendance?.tutors ?? classModel.tutors)
        .map((id) => tutorNamesById[id] ?? '')
        .where((name) => name.isNotEmpty)
        .toList(growable: false);

    final isCancelled = attendance?.cancelled ?? false;
    final isBooked = attending.isNotEmpty;

    final state = isCancelled
        ? ParentBrowseAvailability.cancelled
        : isBooked
            ? ParentBrowseAvailability.booked
            : classModel.canAcceptParentPermanentEnrollment
                ? ParentBrowseAvailability.open
                : ParentBrowseAvailability.waitlist;

    browsable.add(
      ParentBrowseClass(
        classId: classModel.id,
        startsAt: startsAt,
        time: DateFormat('h:mm').format(startsAt),
        durationLabel: durationLabelFor(
          sessionEndFor(startsAt, classModel.endTime).difference(startsAt),
        ),
        title: formatDashboardClassType(classModel.type),
        subtitle: [
          ..._notesFor(
            state: state,
            classModel: classModel,
            availability: availability,
            attendingNames: attending.map((id) => namesById[id] ?? '').toList(),
          ),
          ...tutorNames,
        ].where((part) => part.isNotEmpty).join(' · '),
        availability: state,
        spotsRemaining: classModel.permanentSpotsRemaining,
        childIds: attending,
      ),
    );
  }

  browsable.sort((a, b) => a.startsAt.compareTo(b.startsAt));

  final daysWithClasses = browsable.map((c) => c.startsAt.weekday).toSet();

  final visible = selectedDay == null
      ? browsable
      : browsable
          .where((c) => DateUtils.isSameDay(c.startsAt, selectedDay))
          .toList(growable: false);

  final days = <ParentBrowseDay>[];
  for (final date in weekDates) {
    final forDay = visible
        .where((c) => DateUtils.isSameDay(c.startsAt, date))
        .toList(growable: false);
    if (forDay.isEmpty) continue;

    days.add(
      ParentBrowseDay(
        date: date,
        classes: forDay,
        isToday: DateUtils.isSameDay(date, localNow),
      ),
    );
  }

  final count = browsable.length;
  final termStart = activeTerm.startDate;

  return ParentBrowseViewData(
    weekTitle: 'Week $week · ${weekRangeLabel(weekStart)}',
    weekSubtitle: 'Term ${activeTerm.termNumber} · '
        '$count ${count == 1 ? 'class' : 'classes'} available',
    weekDates: weekDates,
    daysWithClasses: daysWithClasses,
    selectedDay: selectedDay,
    days: days,
    canGoToPreviousWeek: week > 1,
    canGoToNextWeek: week < activeTerm.totalWeeks,
    preTermNotice: localNow.isBefore(termStart)
        ? 'Term ${activeTerm.termNumber} starts on '
            '${DateFormat('d MMMM').format(termStart)}. Bookings are open now, '
            'but lessons begin then.'
        : null,
    errorMessage: errorMessage,
  );
}

/// The grey detail beneath a class: what the family can do with it, in the same
/// terms the options dialog will use.
List<String> _notesFor({
  required ParentBrowseAvailability state,
  required ClassModel classModel,
  required ParentClassAvailability availability,
  required List<String> attendingNames,
}) {
  if (state == ParentBrowseAvailability.cancelled) {
    return const ['This session is cancelled'];
  }

  if (state == ParentBrowseAvailability.booked) {
    return [joinNames(attendingNames)];
  }

  final notes = <String>[];

  // Only claimed when the booking would actually be accepted. The legacy
  // surface advertised a raw one-off count even where the rules forbade using
  // it, so a parent could tap a class showing free spots and be told no.
  if (availability.canBookOneOff) {
    notes.add('One-off spot this week');
  } else if (availability.closedBySameDayCutoff) {
    // Said on the row as well as in the dialog: a class that is quietly
    // unbookable otherwise looks identical to one nobody has taken up.
    notes.add(sameDayBookingCutoffNote);
  }

  if (state == ParentBrowseAvailability.waitlist) {
    if (classModel.permanentSpotsRemaining <= 0) {
      notes.add('Class is full');
    } else {
      final shortfall = classModel.minimumStudentsToOpen -
          classModel.permanentEnrollmentCount;
      notes.add(
        'Opens with $shortfall more ${shortfall == 1 ? 'student' : 'students'}',
      );
    }
  }

  return notes;
}

/// The term week containing [now], clamped into the term. Mirrors the rule the
/// options dialog uses to decide whether a swap or one-off is close enough.
int _weekContaining(DateTime now, Term term) {
  if (now.isBefore(term.startDate)) return 1;
  return ((now.difference(term.startDate).inDays ~/ 7) + 1)
      .clamp(1, term.totalWeeks);
}
