import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/announcement_model.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/utils/class_session_dates.dart';

/// A class one of the parent's children is booked into.
@immutable
class ParentDashboardSession {
  final String classId;
  final String title;

  /// The children attending this session, e.g. `Ella` or `Ella & Max`.
  final String studentsLabel;

  final DateTime startsAt;
  final String durationLabel;

  const ParentDashboardSession({
    required this.classId,
    required this.title,
    required this.studentsLabel,
    required this.startsAt,
    required this.durationLabel,
  });
}

/// The invoice the parent most needs to act on.
@immutable
class ParentDashboardInvoice {
  final String invoiceId;

  /// `INV-0231`, or the document id when no invoice number was assigned.
  final String reference;

  final double amountDue;
  final DateTime dueDate;
  final bool isOverdue;

  /// The children the invoice covers, for the row's subtitle.
  final String studentsLabel;

  const ParentDashboardInvoice({
    required this.invoiceId,
    required this.reference,
    required this.amountDue,
    required this.dueDate,
    required this.isOverdue,
    required this.studentsLabel,
  });
}

@immutable
class ParentDashboardAnnouncement {
  final String id;
  final String title;
  final String ageLabel;

  const ParentDashboardAnnouncement({
    required this.id,
    required this.title,
    required this.ageLabel,
  });
}

/// The most recent progress note, shown as a pull quote.
@immutable
class ParentDashboardFeedback {
  final String studentId;
  final String quote;

  /// `Jordan Lee · Year 9 Maths`, or just the subject when the tutor who wrote
  /// it can no longer be resolved.
  final String attribution;

  const ParentDashboardFeedback({
    required this.studentId,
    required this.quote,
    required this.attribution,
  });
}

@immutable
class ParentDashboardViewData {
  final String parentName;
  final String greeting;
  final String subtitle;

  final int classesThisWeek;
  final int unreadMessages;
  final double amountDue;

  /// Compact form for the header metric, e.g. `$180`.
  final String amountDueLabel;

  /// The caption under the amount, e.g. `due Friday` or `nothing due`.
  final String amountDueCaption;

  final List<ParentDashboardSession> todaysSessions;
  final ParentDashboardSession? nextSession;
  final ParentDashboardInvoice? unpaidInvoice;
  final ParentDashboardAnnouncement? unreadAnnouncement;
  final ParentDashboardFeedback? latestFeedback;

  const ParentDashboardViewData({
    required this.parentName,
    required this.greeting,
    required this.subtitle,
    required this.classesThisWeek,
    required this.unreadMessages,
    required this.amountDue,
    required this.amountDueLabel,
    required this.amountDueCaption,
    required this.todaysSessions,
    required this.nextSession,
    required this.unpaidInvoice,
    required this.unreadAnnouncement,
    required this.latestFeedback,
  });

  /// True when nothing needs the parent's attention, so the section can be
  /// omitted rather than rendered empty.
  bool get hasAttentionItems =>
      unpaidInvoice != null || unreadAnnouncement != null;
}

/// Derives everything the parent dashboard renders.
///
/// Pure, so the whole screen can be tested without Firestore. The caller loads
/// the term, classes, attendance, invoices, feedback and announcements; this
/// decides what they mean for one family.
///
/// [readAnnouncementIds] drives the unread announcement row — the same read
/// state that the Announcements tab badge uses, so the two never disagree.
ParentDashboardViewData buildParentDashboardViewData({
  required String parentName,
  required DateTime now,
  required Term? activeTerm,
  required int currentWeek,
  required List<ClassModel> classes,
  required Map<String, Attendance> attendanceByClass,
  required List<Student> children,
  required int unreadMessages,
  required List<Invoice> invoices,
  required List<Announcement> announcements,
  required List<String> readAnnouncementIds,
  required StudentFeedback? latestFeedback,
  required Map<String, String> tutorNamesById,
}) {
  final localNow = now.toLocal();
  final childIds = children.map((child) => child.id).toSet();
  final childNamesById = {
    for (final child in children) child.id: child.firstName,
  };

  final sessions = _sessionsForChildren(
    now: localNow,
    activeTerm: activeTerm,
    currentWeek: currentWeek,
    classes: classes,
    attendanceByClass: attendanceByClass,
    childIds: childIds,
    childNamesById: childNamesById,
  );

  final todaysSessions = sessions
      .where((session) => DateUtils.isSameDay(session.startsAt, localNow))
      .toList(growable: false);

  final upcoming =
      sessions.where((session) => session.startsAt.isAfter(localNow)).toList();

  final outstanding = invoices
      .where((invoice) => invoice.status != InvoiceStatus.paid)
      .toList()
    ..sort((a, b) => a.dueDate.compareTo(b.dueDate));
  final amountDue = outstanding.fold<double>(
    0,
    (total, invoice) => total + invoice.amountDue,
  );

  final unreadAnnouncement = announcements
      .where((announcement) => !readAnnouncementIds.contains(announcement.id))
      .firstOrNull;

  return ParentDashboardViewData(
    parentName: parentName,
    greeting: dashboardGreeting(localNow.hour),
    subtitle: _subtitle(activeTerm, todaysSessions.length),
    classesThisWeek: sessions
        .where((session) => _isInCurrentWeek(session.startsAt, localNow))
        .length,
    unreadMessages: unreadMessages,
    amountDue: amountDue,
    amountDueLabel: amountDue <= 0 ? r'$0' : formatCurrencyShort(amountDue),
    amountDueCaption: _amountDueCaption(outstanding, localNow),
    todaysSessions: todaysSessions,
    nextSession: upcoming.isEmpty ? null : upcoming.first,
    unpaidInvoice: outstanding.isEmpty
        ? null
        : _toDashboardInvoice(outstanding.first, childNamesById, localNow),
    unreadAnnouncement: unreadAnnouncement == null
        ? null
        : ParentDashboardAnnouncement(
            id: unreadAnnouncement.id,
            title: unreadAnnouncement.title,
            ageLabel: relativeAgeLabel(unreadAnnouncement.createdAt, localNow),
          ),
    latestFeedback: latestFeedback == null
        ? null
        : ParentDashboardFeedback(
            studentId: latestFeedback.studentId,
            quote: latestFeedback.feedback.trim(),
            attribution: _feedbackAttribution(latestFeedback, tutorNamesById),
          ),
  );
}

/// Every session in the rest of the term that at least one child is booked
/// into, earliest first.
///
/// A child counts as booked when the week's attendance document lists them,
/// falling back to the class's permanent roster for weeks that have no
/// attendance document yet. Cancelled sessions are excluded — a family should
/// not be told to turn up to a class that is not running.
List<ParentDashboardSession> _sessionsForChildren({
  required DateTime now,
  required Term? activeTerm,
  required int currentWeek,
  required List<ClassModel> classes,
  required Map<String, Attendance> attendanceByClass,
  required Set<String> childIds,
  required Map<String, String> childNamesById,
}) {
  if (activeTerm == null || currentWeek <= 0 || childIds.isEmpty) {
    return const [];
  }

  final sessions = <ParentDashboardSession>[];

  for (final classModel in classes) {
    for (var week = currentWeek; week <= activeTerm.totalWeeks; week++) {
      final attendance =
          week == currentWeek ? attendanceByClass[classModel.id] : null;
      if (attendance?.cancelled ?? false) continue;

      final roster = attendance?.attendance ?? classModel.enrolledStudents;
      final attending = roster.where(childIds.contains).toList(growable: false);
      if (attending.isEmpty) continue;

      final startsAt = (attendance?.date ??
              classSessionDateForWeek(
                termStartDate: activeTerm.startDate,
                classDay: classModel.dayOfWeek,
                startTime: classModel.startTime,
                weekNumber: week,
              ))
          .toLocal();

      sessions.add(
        ParentDashboardSession(
          classId: classModel.id,
          title: formatDashboardClassType(classModel.type),
          studentsLabel: joinNames(
            attending
                .map((id) => childNamesById[id] ?? '')
                .toList(growable: false),
          ),
          startsAt: startsAt,
          durationLabel: durationLabelFor(
            sessionEndFor(startsAt, classModel.endTime).difference(startsAt),
          ),
        ),
      );
    }
  }

  sessions.sort((a, b) => a.startsAt.compareTo(b.startsAt));
  return sessions;
}

/// Monday-to-Sunday containing [now].
bool _isInCurrentWeek(DateTime date, DateTime now) {
  final startOfWeek = DateTime(now.year, now.month, now.day)
      .subtract(Duration(days: now.weekday - DateTime.monday));
  final endOfWeek = startOfWeek.add(const Duration(days: 7));
  return !date.isBefore(startOfWeek) && date.isBefore(endOfWeek);
}

String _subtitle(Term? activeTerm, int classesToday) {
  if (activeTerm == null) return 'No term is running right now.';
  if (classesToday == 0) return 'No classes today.';
  if (classesToday == 1) return "One class today — here's the detail.";
  return "$classesToday classes today — here's the detail.";
}

String _amountDueCaption(List<Invoice> outstanding, DateTime now) {
  if (outstanding.isEmpty) return 'nothing due';

  final soonest = outstanding.first.dueDate.toLocal();
  final dueDay = DateTime(soonest.year, soonest.month, soonest.day);
  final today = DateTime(now.year, now.month, now.day);
  final days = dueDay.difference(today).inDays;

  if (days < 0) return 'overdue';
  if (days == 0) return 'due today';
  if (days == 1) return 'due tomorrow';
  if (days < 7) return 'due ${DateFormat('EEEE').format(soonest)}';
  return 'due ${DateFormat('d MMM').format(soonest)}';
}

ParentDashboardInvoice _toDashboardInvoice(
  Invoice invoice,
  Map<String, String> childNamesById,
  DateTime now,
) {
  final dueDate = invoice.dueDate.toLocal();
  return ParentDashboardInvoice(
    invoiceId: invoice.id,
    reference: invoice.invoiceNumber?.trim().isNotEmpty == true
        ? invoice.invoiceNumber!.trim()
        : invoice.id,
    amountDue: invoice.amountDue,
    dueDate: dueDate,
    isOverdue: invoice.status == InvoiceStatus.overdue ||
        dueDate.isBefore(DateTime(now.year, now.month, now.day)),
    studentsLabel: joinNames(
      invoice.studentIds
          .map((id) => childNamesById[id] ?? '')
          .toList(growable: false),
    ),
  );
}

/// `Jordan Lee · Year 9 Maths`.
///
/// The feedback document has no class reference, so the subject it was filed
/// under stands in for the class. See the feedback-to-class gate in
/// `V3_REDESIGN_ROADMAP.md` §7 — if a class reference is added later, prefer it
/// over the subject here.
String _feedbackAttribution(
  StudentFeedback feedback,
  Map<String, String> tutorNamesById,
) {
  final tutorName = tutorNamesById[feedback.tutorId]?.trim();
  final subject = feedback.subject.trim();

  if (tutorName == null || tutorName.isEmpty) return subject;
  if (subject.isEmpty) return tutorName;
  return '$tutorName · $subject';
}
