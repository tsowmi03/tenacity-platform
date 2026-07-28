import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/utils/class_session_dates.dart';

/// One of today's sessions, as the operations console needs to see it.
@immutable
class AdminDashboardSession {
  final String classId;
  final String title;

  /// The tutors actually assigned for this week, joined for display. Empty when
  /// nobody is assigned — shown as-is rather than hidden, because an admin
  /// needs to notice it.
  final String tutorLabel;

  final DateTime startsAt;
  final DateTime endsAt;

  /// Students marked present. Only meaningful when [rollComplete] — see
  /// [rollLabel].
  final int presentCount;

  /// Everyone the tutor would have seen on the roll: the standing roster plus
  /// anyone marked present who is not on it (a one-off visitor).
  final int rosterCount;

  final bool rollComplete;

  const AdminDashboardSession({
    required this.classId,
    required this.title,
    required this.tutorLabel,
    required this.startsAt,
    required this.endsAt,
    required this.presentCount,
    required this.rosterCount,
    required this.rollComplete,
  });

  /// `ROLL 5/6` once the roll is confirmed, `NO ROLL` until then.
  ///
  /// The fraction is deliberately withheld while the roll is outstanding. The
  /// stored attendance list holds present students only, so before the roll is
  /// stamped complete a session where nobody has been marked and one where
  /// everybody was away are indistinguishable — any fraction drawn from it
  /// would be a guess presented as a fact.
  String get rollLabel =>
      rollComplete ? 'ROLL $presentCount/$rosterCount' : 'NO ROLL';
}

/// A session whose roll is still outstanding after it has finished.
@immutable
class AdminDashboardRollAlert {
  final String classId;
  final String title;
  final String subtitle;

  const AdminDashboardRollAlert({
    required this.classId,
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

@immutable
class AdminDashboardViewData {
  final String adminName;
  final String greeting;

  /// `Wednesday — 14 classes, 62 students expected.`
  final String subtitle;

  final int classesToday;

  /// Outstanding rolls plus overdue invoices — the things an admin has to act
  /// on. One-off bookings are excluded on purpose: nothing approves them, so
  /// they are information rather than work. See §7 of the redesign roadmap.
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
  final int oneOffBookingsThisWeek;

  final AdminDashboardOverdue? overdueInvoices;

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
    required this.oneOffBookingsThisWeek,
    required this.overdueInvoices,
  });

  /// True when more rolls are outstanding than the list shows.
  bool get hasMoreOutstandingRolls =>
      outstandingRollTotal > outstandingRolls.length;

  /// How many outstanding rolls are not listed.
  int get hiddenOutstandingRolls =>
      outstandingRollTotal - outstandingRolls.length;

  bool get hasAttentionItems =>
      outstandingRolls.isNotEmpty ||
      overdueInvoices != null ||
      oneOffBookingsThisWeek > 0;

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

  // A roll is only outstanding once the session has actually finished — an
  // in-progress class has not had a chance to be marked.
  final outstandingRolls = sessions
      .where((session) =>
          session.attendance != null &&
          !session.endsAt.isAfter(localNow) &&
          !session.attendance!.isRollComplete)
      .toList(growable: false);

  final oneOffBookings = sessions.fold<int>(0, (total, session) {
    final attendance = session.attendance;
    if (attendance == null) return total;

    final roster = session.classModel.enrolledStudents.toSet();
    return total +
        attendance.attendance.where((id) => !roster.contains(id)).length;
  });

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
    needsActionCount: outstandingRolls.length + (overdue?.count ?? 0),
    outstandingAmount: outstandingAmount,
    outstandingLabel: formatCurrencyShort(outstandingAmount),
    happeningNow: running
        .map((session) => _toSession(session, tutorNamesById))
        .toList(growable: false),
    happeningNowLabel: running.isEmpty
        ? 'TODAY'
        : 'HAPPENING NOW · ${DateFormat('h:mm').format(localNow)}',
    todaysSessions: todays
        .map((session) => _toSession(session, tutorNamesById))
        .toList(growable: false),
    outstandingRolls: outstandingRolls
        .take(3)
        .map((session) => AdminDashboardRollAlert(
              classId: session.classModel.id,
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
    oneOffBookingsThisWeek: oneOffBookings,
    overdueInvoices: overdue,
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
  return {
    ...candidate.classModel.enrolledStudents,
    ...?candidate.attendance?.attendance,
  };
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
) {
  final attendance = candidate.attendance;

  return AdminDashboardSession(
    classId: candidate.classModel.id,
    title: formatDashboardClassType(candidate.classModel.type),
    tutorLabel: _tutorLabelFor(candidate, tutorNamesById),
    startsAt: candidate.startsAt,
    endsAt: candidate.endsAt,
    presentCount: attendance?.attendance.length ?? 0,
    rosterCount: _rosterFor(candidate).length,
    rollComplete: attendance?.isRollComplete ?? false,
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
