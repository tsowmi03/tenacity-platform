import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/utils/class_session_dates.dart';

/// Shown for a one-off visitor whose student record could not be read — most
/// often because the student has since been deleted. Mirrors the tutor side's
/// `formerTutorDisplayName`: the booking is real and stays listed, even when
/// the name behind it no longer resolves.
const formerStudentDisplayName = 'former student';

/// One of today's sessions, as the operations console needs to see it.
@immutable
class AdminDashboardSession {
  final String classId;

  /// This week's attendance document, or null for a class with no generated
  /// session — which is the one case the roll cannot be opened from here.
  final String? attendanceDocId;

  final String title;

  /// The tutors actually assigned for this week, joined for display. Empty when
  /// nobody is assigned — shown as-is rather than hidden, because an admin
  /// needs to notice it.
  final String tutorLabel;

  final DateTime startsAt;
  final DateTime endsAt;

  /// Students marked here so far. Honest at any point in the roll, including
  /// while a tutor is still working through it.
  final int presentCount;

  /// Everyone the tutor would have seen on the roll: the standing roster plus
  /// anyone visiting that week on a one-off booking.
  final int rosterCount;

  /// Whether anyone has started marking. Distinct from [rollComplete], and the
  /// distinction is the point: a roll can now be genuinely part-marked.
  final bool rollStarted;

  final bool rollComplete;

  /// The session has finished and its roll is still incomplete — the state
  /// that genuinely needs chasing, and the only one a row should paint as a
  /// problem.
  ///
  /// A class that has not started yet also has no roll, but nothing is wrong
  /// with that. Both used to render an identical red `NO ROLL`, so at 1pm a
  /// console showed four alarming rows for classes that were hours away.
  final bool rollOutstanding;

  const AdminDashboardSession({
    required this.classId,
    required this.attendanceDocId,
    required this.title,
    required this.tutorLabel,
    required this.startsAt,
    required this.endsAt,
    required this.presentCount,
    required this.rosterCount,
    required this.rollStarted,
    required this.rollComplete,
    required this.rollOutstanding,
  });

  /// `ROLL 5/6` once anyone has marked a student, `NO ROLL` until then.
  ///
  /// The fraction used to be withheld until the roll was stamped complete: the
  /// one stored list held present students only, so an empty list could mean
  /// "nobody marked yet" or "everybody was away", and any fraction drawn from
  /// it would have been a guess presented as a fact. Marks record the two
  /// cases separately, so the count is now true mid-roll.
  String get rollLabel =>
      rollStarted ? 'ROLL $presentCount/$rosterCount' : 'NO ROLL';
}

/// A session whose roll is still outstanding after it has finished.
@immutable
class AdminDashboardRollAlert {
  final String classId;

  /// Which session's roll, which is not always this week's — an unmarked roll
  /// from an earlier week is still outstanding, and opening the class without
  /// this would land on the wrong session.
  final String attendanceDocId;

  final String title;
  final String subtitle;

  const AdminDashboardRollAlert({
    required this.classId,
    required this.attendanceDocId,
    required this.title,
    required this.subtitle,
  });
}

/// The overdue-invoice summary behind the billing attention row.
@immutable
class AdminDashboardOverdue {
  final int count;
  final double totalAmount;

  /// Days since the oldest overdue invoice fell due.
  final int oldestDays;

  const AdminDashboardOverdue({
    required this.count,
    required this.totalAmount,
    required this.oldestDays,
  });
}

/// One student visiting a class they are not enrolled in, for the drill-down
/// behind the one-off row.
///
/// Bookings are listed per booking rather than per student on purpose: a family
/// booking the same child into three sessions is three bookings, and an admin
/// wants to see that rather than one deduplicated name.
@immutable
class AdminDashboardOneOffBooking {
  final String studentId;
  final String studentName;
  final String classId;
  final String className;

  /// `Today`, `Tomorrow`, or `Wed 15 Jul` further out.
  final String dayLabel;

  /// `4:00`.
  final String timeLabel;

  const AdminDashboardOneOffBooking({
    required this.studentId,
    required this.studentName,
    required this.classId,
    required this.className,
    required this.dayLabel,
    required this.timeLabel,
  });
}

@immutable
class AdminDashboardViewData {
  final String adminName;
  final String greeting;

  /// `Wednesday — 14 classes, 62 students expected.`
  final String subtitle;

  final int classesToday;

  /// Everything an admin has to act on: outstanding rolls, overdue invoices,
  /// and any check that could not be run. One-off bookings are excluded on
  /// purpose — nothing approves them, so they are information rather than work
  /// (see §7 of the redesign roadmap) and they live in their own section.
  ///
  /// Kept in step with [hasAttentionItems]: this is zero exactly when the
  /// NEEDS ACTION section has nothing to show. The two used to disagree,
  /// because one-off bookings opened the section without counting towards the
  /// metric — so a console with nothing wrong read `0 need action` above a
  /// populated NEEDS ACTION list.
  final int needsActionCount;

  final double outstandingAmount;
  final String outstandingLabel;

  /// Sessions running at the moment the dashboard was built.
  final List<AdminDashboardSession> happeningNow;

  /// `HAPPENING NOW · 4:30`, or `TODAY` when nothing is running.
  final String happeningNowLabel;

  /// Today's sessions, shown when nothing is currently running so the section
  /// is never empty on a day that has classes.
  final List<AdminDashboardSession> todaysSessions;

  final List<AdminDashboardRollAlert> outstandingRolls;

  /// How many rolls are outstanding in total, which can exceed
  /// [outstandingRolls] — a dashboard lists only the first few.
  ///
  /// Carried so the view can say so. Without it the `need action` metric and
  /// the list beneath it disagree with no explanation: eight outstanding rolls
  /// showed three rows, and the other five were unreachable from here.
  final int outstandingRollTotal;

  /// One-off bookings in the displayed week, for information only.
  final List<AdminDashboardOneOffBooking> oneOffBookings;

  final AdminDashboardOverdue? overdueInvoices;

  /// True when the invoice read failed, so nothing here can be said about
  /// billing.
  ///
  /// Carried rather than swallowed because the alternative is a console that
  /// reports `0 need action` when what it means is that it could not check —
  /// the one case where a reassuring number is worse than no number.
  final bool billingUnavailable;

  /// True when the attendance read failed, so nothing here can be said about
  /// rolls. Same reasoning as [billingUnavailable].
  final bool rollsUnavailable;

  const AdminDashboardViewData({
    required this.adminName,
    required this.greeting,
    required this.subtitle,
    required this.classesToday,
    required this.needsActionCount,
    required this.outstandingAmount,
    required this.outstandingLabel,
    required this.happeningNow,
    required this.happeningNowLabel,
    required this.todaysSessions,
    required this.outstandingRolls,
    required this.outstandingRollTotal,
    required this.oneOffBookings,
    required this.overdueInvoices,
    this.billingUnavailable = false,
    this.rollsUnavailable = false,
  });

  /// True when more rolls are outstanding than the list shows.
  bool get hasMoreOutstandingRolls =>
      outstandingRollTotal > outstandingRolls.length;

  /// How many outstanding rolls are not listed.
  int get hiddenOutstandingRolls =>
      outstandingRollTotal - outstandingRolls.length;

  /// Whether the NEEDS ACTION section has anything to show. True exactly when
  /// [needsActionCount] is non-zero — see the note on that field.
  bool get hasAttentionItems =>
      outstandingRolls.isNotEmpty ||
      overdueInvoices != null ||
      billingUnavailable ||
      rollsUnavailable;

  /// Whether the informational section below NEEDS ACTION has anything to
  /// show. Kept separate because these items are not work: they used to sit
  /// under the NEEDS ACTION heading carrying the subtitle `no action needed`,
  /// which asked the reader to believe two contradictory things at once.
  bool get hasInfoItems => oneOffBookings.isNotEmpty;

  /// The sessions the HAPPENING NOW section shows: what is running, or failing
  /// that the rest of today.
  List<AdminDashboardSession> get sessionsInFocus =>
      happeningNow.isNotEmpty ? happeningNow : todaysSessions;
}

/// Builds everything the admin dashboard shows from data already loaded by the
/// controllers.
///
/// Pure, so every rule here is testable without Firestore. [now] is passed in
/// rather than read, because "today", "running now" and "overdue" all depend on
/// it and tests need to pin it.
AdminDashboardViewData buildAdminDashboardViewData({
  required String adminName,
  required DateTime now,
  required Term? activeTerm,
  required int currentWeek,
  required List<ClassModel> classes,
  required Map<String, Attendance> attendanceByClass,
  required Map<String, String> tutorNamesById,
  required List<Invoice> invoices,

  /// Sessions from earlier weeks of the same term whose rolls are still
  /// unmarked, keyed by class id. Only outstanding rolls are drawn from these
  /// — today's list and the running sessions are always this week's.
  Map<String, List<Attendance>> earlierWeeksAttendance = const {},

  /// Names for the one-off visitors, so the drill-down can say who booked.
  /// Ids without an entry fall back to [formerStudentDisplayName].
  Map<String, String> studentNamesById = const {},
  bool billingUnavailable = false,
  bool rollsUnavailable = false,
}) {
  final localNow = now.toLocal();
  final sessions = <_AdminSessionCandidate>[];

  if (activeTerm != null && currentWeek > 0) {
    for (final classModel in classes) {
      final attendance = attendanceByClass[classModel.id];
      if (attendance?.cancelled ?? false) continue;

      final startsAt = (attendance?.date ??
              classSessionDateForWeek(
                termStartDate: activeTerm.startDate,
                classDay: classModel.dayOfWeek,
                startTime: classModel.startTime,
                weekNumber: currentWeek,
              ))
          .toLocal();

      sessions.add(
        _AdminSessionCandidate(
          classModel: classModel,
          attendance: attendance,
          startsAt: startsAt,
          endsAt: sessionEndFor(startsAt, classModel.endTime),
        ),
      );
    }
  }

  sessions.sort((a, b) => a.startsAt.compareTo(b.startsAt));

  final todays = sessions
      .where((session) => DateUtils.isSameDay(session.startsAt, localNow))
      .toList(growable: false);

  final running = todays
      .where((session) =>
          !session.startsAt.isAfter(localNow) &&
          session.endsAt.isAfter(localNow))
      .toList(growable: false);

  // Rolls left unmarked in earlier weeks of the same term. Without them the
  // list emptied itself every Monday: a session nobody marked simply stopped
  // being asked about, and the `need action` count dropped with it, so the
  // longer a roll went unmarked the less likely anyone was to see it.
  final classesById = {
    for (final classModel in classes) classModel.id: classModel
  };
  final earlierSessions = <_AdminSessionCandidate>[];
  for (final entry in earlierWeeksAttendance.entries) {
    final classModel = classesById[entry.key];
    if (classModel == null) continue;

    for (final attendance in entry.value) {
      if (attendance.cancelled) continue;

      // The stored date is the session itself, so no week arithmetic is
      // needed here the way it is for a class with no document yet.
      final startsAt = attendance.date.toLocal();
      earlierSessions.add(
        _AdminSessionCandidate(
          classModel: classModel,
          attendance: attendance,
          startsAt: startsAt,
          endsAt: sessionEndFor(startsAt, classModel.endTime),
        ),
      );
    }
  }

  // A roll is only outstanding once the session has actually finished — an
  // in-progress class has not had a chance to be marked.
  final outstandingRolls = [...earlierSessions, ...sessions]
      .where((session) =>
          session.attendance != null &&
          !session.endsAt.isAfter(localNow) &&
          !session.attendance!.isRollCompleteFor(_rosterFor(session)))
      .toList()
    // Oldest first: the roll that has been outstanding longest is the one an
    // admin should chase, and it is also the one the `take` below would
    // otherwise drop.
    ..sort((a, b) => a.startsAt.compareTo(b.startsAt));

  final oneOffBookings = <AdminDashboardOneOffBooking>[];
  for (final session in sessions) {
    final attendance = session.attendance;
    if (attendance == null) continue;

    final roster = session.classModel.enrolledStudents.toSet();
    for (final studentId in attendance.attendance) {
      if (roster.contains(studentId)) continue;

      oneOffBookings.add(
        AdminDashboardOneOffBooking(
          studentId: studentId,
          studentName: studentNamesById[studentId] ?? formerStudentDisplayName,
          classId: session.classModel.id,
          className: formatDashboardClassType(session.classModel.type),
          dayLabel: relativeDayLabel(session.startsAt, localNow),
          timeLabel: DateFormat('h:mm').format(session.startsAt),
        ),
      );
    }
  }

  final overdue = _overdueFrom(invoices, localNow);
  final outstandingAmount = invoices
      .where((invoice) => invoice.status != InvoiceStatus.paid)
      .fold<double>(0, (total, invoice) => total + invoice.amountDue);

  final studentsExpected = todays.fold<int>(
    0,
    (total, session) => total + _rosterFor(session).length,
  );

  return AdminDashboardViewData(
    adminName: adminName,
    greeting: dashboardGreeting(localNow.hour),
    subtitle: _subtitleFor(localNow, todays.length, studentsExpected),
    classesToday: todays.length,
    needsActionCount: outstandingRolls.length +
        (overdue?.count ?? 0) +
        (billingUnavailable ? 1 : 0) +
        (rollsUnavailable ? 1 : 0),
    outstandingAmount: outstandingAmount,
    outstandingLabel: formatCurrencyShort(outstandingAmount),
    happeningNow: running
        .map((session) => _toSession(session, tutorNamesById, localNow))
        .toList(growable: false),
    happeningNowLabel: running.isEmpty
        ? 'TODAY'
        : 'HAPPENING NOW · ${DateFormat('h:mm').format(localNow)}',
    todaysSessions: todays
        .map((session) => _toSession(session, tutorNamesById, localNow))
        .toList(growable: false),
    outstandingRolls: outstandingRolls
        .take(3)
        .map((session) => AdminDashboardRollAlert(
              classId: session.classModel.id,
              attendanceDocId: session.attendance!.id,
              title: 'Roll not marked — '
                  '${formatDashboardClassType(session.classModel.type)}',
              subtitle: [
                relativeDayLabel(session.startsAt, localNow),
                DateFormat('h:mm').format(session.startsAt),
                _tutorLabelFor(session, tutorNamesById),
              ].where((part) => part.isNotEmpty).join(' · '),
            ))
        .toList(growable: false),
    outstandingRollTotal: outstandingRolls.length,
    oneOffBookings: List.unmodifiable(oneOffBookings),
    overdueInvoices: overdue,
    billingUnavailable: billingUnavailable,
    rollsUnavailable: rollsUnavailable,
  );
}

String _subtitleFor(DateTime now, int classCount, int studentCount) {
  final day = DateFormat('EEEE').format(now);
  if (classCount == 0) return '$day — no classes scheduled.';

  final classes = classCount == 1 ? '1 class' : '$classCount classes';
  final students = studentCount == 1 ? '1 student' : '$studentCount students';
  return '$day — $classes, $students expected.';
}

AdminDashboardOverdue? _overdueFrom(List<Invoice> invoices, DateTime now) {
  final today = DateTime(now.year, now.month, now.day);
  final overdue = invoices.where((invoice) {
    if (invoice.status == InvoiceStatus.paid) return false;
    final due = invoice.dueDate.toLocal();
    return DateTime(due.year, due.month, due.day).isBefore(today);
  }).toList(growable: false);

  if (overdue.isEmpty) return null;

  final oldest = overdue.map((invoice) {
    final due = invoice.dueDate.toLocal();
    return today.difference(DateTime(due.year, due.month, due.day)).inDays;
  }).reduce((a, b) => a > b ? a : b);

  return AdminDashboardOverdue(
    count: overdue.length,
    totalAmount:
        overdue.fold<double>(0, (total, invoice) => total + invoice.amountDue),
    oldestDays: oldest,
  );
}

/// Everyone on the roll: the standing roster plus anyone marked present who is
/// not on it. Using the union means a one-off visitor cannot push the present
/// count above the total and produce `ROLL 7/6`.
Set<String> _rosterFor(_AdminSessionCandidate candidate) {
  return candidate.classModel.rosterFor(candidate.attendance);
}

String _tutorLabelFor(
  _AdminSessionCandidate candidate,
  Map<String, String> tutorNamesById,
) {
  final assigned = candidate.attendance?.tutors ?? candidate.classModel.tutors;
  final names = assigned
      .map((id) => tutorNamesById[id] ?? '')
      .where((name) => name.isNotEmpty)
      .toList(growable: false);

  return joinNames(names);
}

AdminDashboardSession _toSession(
  _AdminSessionCandidate candidate,
  Map<String, String> tutorNamesById,
  DateTime now,
) {
  final attendance = candidate.attendance;
  final roster = _rosterFor(candidate);
  final rollComplete = attendance?.isRollCompleteFor(roster) ?? false;

  return AdminDashboardSession(
    classId: candidate.classModel.id,
    attendanceDocId: attendance?.id,
    title: formatDashboardClassType(candidate.classModel.type),
    tutorLabel: _tutorLabelFor(candidate, tutorNamesById),
    startsAt: candidate.startsAt,
    endsAt: candidate.endsAt,
    presentCount: attendance?.hereCountFor(roster) ?? 0,
    rosterCount: roster.length,
    rollStarted: attendance?.hasRoll ?? false,
    rollComplete: rollComplete,
    // Deliberately the same test the outstanding-roll list uses, so a row and
    // the NEEDS ACTION entry for the same session can never disagree.
    rollOutstanding: !rollComplete && !candidate.endsAt.isAfter(now),
  );
}

class _AdminSessionCandidate {
  final ClassModel classModel;
  final Attendance? attendance;
  final DateTime startsAt;
  final DateTime endsAt;

  const _AdminSessionCandidate({
    required this.classModel,
    required this.attendance,
    required this.startsAt,
    required this.endsAt,
  });
}
