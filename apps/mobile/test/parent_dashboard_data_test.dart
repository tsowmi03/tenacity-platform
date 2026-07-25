import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/announcement_model.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/ui/dashboard/parent/parent_dashboard_data.dart';

void main() {
  // Term 3 begins Monday 13 July 2026.
  final term = Term(
    id: '2026_T3',
    year: '2026',
    termNumber: 3,
    startDate: DateTime(2026, 7, 13),
    endDate: DateTime(2026, 9, 18),
    totalWeeks: 10,
    isActive: true,
  );

  final ella = Student(
    id: 'ella',
    firstName: 'Ella',
    lastName: 'Nguyen',
    parents: const ['parent-1'],
    grade: '9',
    subjects: const ['Maths'],
  );
  final max = Student(
    id: 'max',
    firstName: 'Max',
    lastName: 'Nguyen',
    parents: const ['parent-1'],
    grade: '5',
    subjects: const ['English'],
  );

  ParentDashboardViewData build({
    DateTime? now,
    // Defaults to the term above; set [withoutTerm] to test the between-terms
    // case, since a null default here would be indistinguishable from "unset".
    bool withoutTerm = false,
    int currentWeek = 1,
    List<ClassModel> classes = const [],
    Map<String, Attendance> attendance = const {},
    List<Student> children = const [],
    int unreadMessages = 0,
    List<Invoice> invoices = const [],
    List<Announcement> announcements = const [],
    List<String> readAnnouncementIds = const [],
    StudentFeedback? latestFeedback,
    Map<String, String> tutorNames = const {},
  }) {
    return buildParentDashboardViewData(
      parentName: 'Sarah',
      now: now ?? DateTime(2026, 7, 15, 14),
      activeTerm: withoutTerm ? null : term,
      currentWeek: currentWeek,
      classes: classes,
      attendanceByClass: attendance,
      children: children,
      unreadMessages: unreadMessages,
      invoices: invoices,
      announcements: announcements,
      readAnnouncementIds: readAnnouncementIds,
      latestFeedback: latestFeedback,
      tutorNamesById: tutorNames,
    );
  }

  group('sessions', () {
    test("counts only the children's own classes", () {
      final data = build(
        children: [ella],
        classes: [
          _class(id: 'ella-wed', day: 'Wednesday', students: const ['ella']),
          _class(
            id: 'someone-else',
            day: 'Wednesday',
            students: const ['other-child'],
          ),
        ],
      );

      expect(data.todaysSessions, hasLength(1));
      expect(data.todaysSessions.single.classId, 'ella-wed');
    });

    test('names every child attending a session', () {
      final data = build(
        children: [ella, max],
        classes: [
          _class(
            id: 'shared',
            day: 'Wednesday',
            students: const ['ella', 'max'],
          ),
        ],
      );

      expect(data.todaysSessions.single.studentsLabel, 'Ella & Max');
    });

    test('prefers the week attendance roster over the permanent one', () {
      // Max was added to this week's session only; Ella is enrolled but marked
      // absent for the week, so she should not appear.
      final data = build(
        children: [ella, max],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: const ['ella']),
        ],
        attendance: {
          'wed': _attendance(
            id: 'wed',
            date: DateTime(2026, 7, 15, 16),
            students: const ['max'],
          ),
        },
      );

      expect(data.todaysSessions.single.studentsLabel, 'Max');
    });

    test('excludes a cancelled session without cancelling the term', () {
      final data = build(
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: const ['ella']),
        ],
        attendance: {
          'wed': _attendance(
            id: 'wed',
            date: DateTime(2026, 7, 15, 16),
            students: const ['ella'],
            cancelled: true,
          ),
        },
      );

      // Today's class is off, but the same class in later weeks still runs —
      // a one-week cancellation is not a withdrawal.
      expect(data.todaysSessions, isEmpty);
      expect(data.nextSession, isNotNull);
      expect(data.nextSession!.startsAt.day, isNot(15));
      expect(data.classesThisWeek, 0);
    });

    test('counts classes for the current Monday-to-Sunday week only', () {
      // Saturday 18 July is still week 1; the following Wednesday is not.
      final data = build(
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: const ['ella']),
          _class(id: 'sat', day: 'Saturday', students: const ['ella']),
        ],
      );

      // Wednesday and Saturday this week, plus the same two in each of the
      // nine remaining term weeks.
      expect(data.classesThisWeek, 2);
      expect(data.todaysSessions, hasLength(1));
    });

    test('next session is the soonest still to come', () {
      final data = build(
        now: DateTime(2026, 7, 15, 17, 30),
        children: [ella],
        classes: [
          _class(
            id: 'earlier',
            day: 'Wednesday',
            start: '16:00',
            end: '17:00',
            students: const ['ella'],
          ),
          _class(
            id: 'later',
            day: 'Wednesday',
            start: '18:00',
            end: '19:00',
            students: const ['ella'],
          ),
        ],
      );

      expect(data.nextSession?.classId, 'later');
    });

    test('returns nothing when there is no active term', () {
      final data = build(
        withoutTerm: true,
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: const ['ella']),
        ],
      );

      expect(data.todaysSessions, isEmpty);
      expect(data.classesThisWeek, 0);
      expect(data.subtitle, 'No term is running right now.');
    });

    test('a family with no children has no sessions', () {
      final data = build(
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: const ['ella']),
        ],
      );

      expect(data.todaysSessions, isEmpty);
      expect(data.classesThisWeek, 0);
    });
  });

  group('billing', () {
    test('sums every unpaid invoice and surfaces the soonest due', () {
      final data = build(
        children: [ella, max],
        invoices: [
          _invoice(
            id: 'later',
            number: 'INV-0240',
            amount: 120,
            due: DateTime(2026, 8, 1),
          ),
          _invoice(
            id: 'sooner',
            number: 'INV-0231',
            amount: 180,
            due: DateTime(2026, 7, 17),
            students: const ['ella', 'max'],
          ),
          _invoice(
            id: 'settled',
            number: 'INV-0224',
            amount: 240,
            due: DateTime(2026, 6, 20),
            status: InvoiceStatus.paid,
          ),
        ],
      );

      expect(data.amountDue, 300);
      expect(data.amountDueLabel, r'$300');
      expect(data.unpaidInvoice?.reference, 'INV-0231');
      expect(data.unpaidInvoice?.studentsLabel, 'Ella & Max');
    });

    test('describes when payment is due', () {
      String captionFor(DateTime due) => build(
            invoices: [_invoice(id: 'i', amount: 100, due: due)],
          ).amountDueCaption;

      expect(captionFor(DateTime(2026, 7, 15)), 'due today');
      expect(captionFor(DateTime(2026, 7, 16)), 'due tomorrow');
      expect(captionFor(DateTime(2026, 7, 17)), 'due Friday');
      expect(captionFor(DateTime(2026, 8, 20)), 'due 20 Aug');
      expect(captionFor(DateTime(2026, 7, 10)), 'overdue');
    });

    test('a settled account shows nothing owing', () {
      final data = build(
        invoices: [
          _invoice(
            id: 'paid',
            amount: 240,
            due: DateTime(2026, 6, 20),
            status: InvoiceStatus.paid,
          ),
        ],
      );

      expect(data.amountDue, 0);
      expect(data.amountDueLabel, r'$0');
      expect(data.amountDueCaption, 'nothing due');
      expect(data.unpaidInvoice, isNull);
      expect(data.hasAttentionItems, isFalse);
    });

    test('marks an invoice overdue by its due date, not only its status', () {
      final data = build(
        invoices: [
          _invoice(
            id: 'stale',
            amount: 100,
            due: DateTime(2026, 7, 10),
            status: InvoiceStatus.unpaid,
          ),
        ],
      );

      expect(data.unpaidInvoice?.isOverdue, isTrue);
    });

    test('falls back to the document id when there is no invoice number', () {
      final data = build(
        invoices: [
          _invoice(id: 'raw-doc-id', amount: 50, due: DateTime(2026, 7, 20)),
        ],
      );

      expect(data.unpaidInvoice?.reference, 'raw-doc-id');
    });

    test('shows cents when the balance is not a round amount', () {
      final data = build(
        invoices: [
          _invoice(id: 'i', amount: 180.5, due: DateTime(2026, 7, 20)),
        ],
      );

      expect(data.amountDueLabel, r'$180.50');
    });
  });

  group('announcements', () {
    final holiday = _announcement(
      id: 'a1',
      title: 'Holiday timetable published',
      createdAt: DateTime(2026, 7, 14, 9),
    );

    test('surfaces the first unread announcement', () {
      final data = build(announcements: [holiday]);

      expect(data.unreadAnnouncement?.title, 'Holiday timetable published');
      expect(data.unreadAnnouncement?.ageLabel, 'yesterday');
    });

    test('stays quiet once the announcement has been read', () {
      final data = build(
        announcements: [holiday],
        readAnnouncementIds: const ['a1'],
      );

      expect(data.unreadAnnouncement, isNull);
      expect(data.hasAttentionItems, isFalse);
    });
  });

  group('feedback', () {
    test('attributes a note to its tutor and subject', () {
      final data = build(
        latestFeedback: _feedback(
          quote: 'Ella showed great progress with quadratics this week.',
          tutorId: 'tutor-1',
          subject: 'Year 9 Maths',
        ),
        tutorNames: const {'tutor-1': 'Jordan Lee'},
      );

      expect(
        data.latestFeedback?.quote,
        'Ella showed great progress with quadratics this week.',
      );
      expect(data.latestFeedback?.attribution, 'Jordan Lee · Year 9 Maths');
    });

    test('falls back to the subject when the tutor cannot be resolved', () {
      final data = build(
        latestFeedback: _feedback(tutorId: 'gone', subject: 'Year 9 Maths'),
      );

      expect(data.latestFeedback?.attribution, 'Year 9 Maths');
    });

    test('falls back to the tutor when no subject was recorded', () {
      final data = build(
        latestFeedback: _feedback(tutorId: 'tutor-1', subject: '   '),
        tutorNames: const {'tutor-1': 'Jordan Lee'},
      );

      expect(data.latestFeedback?.attribution, 'Jordan Lee');
    });
  });

  group('greeting and subtitle', () {
    test('greets by time of day', () {
      expect(build(now: DateTime(2026, 7, 15, 9)).greeting, 'Good morning');
      expect(build(now: DateTime(2026, 7, 15, 14)).greeting, 'Good afternoon');
      expect(build(now: DateTime(2026, 7, 15, 20)).greeting, 'Good evening');
    });

    test('summarises the day', () {
      expect(build(children: [ella]).subtitle, 'No classes today.');

      final oneClass = build(
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: const ['ella']),
        ],
      );
      expect(oneClass.subtitle, "One class today — here's the detail.");

      final twoClasses = build(
        children: [ella],
        classes: [
          _class(
            id: 'wed-1',
            day: 'Wednesday',
            start: '16:00',
            end: '17:00',
            students: const ['ella'],
          ),
          _class(
            id: 'wed-2',
            day: 'Wednesday',
            start: '18:00',
            end: '19:00',
            students: const ['ella'],
          ),
        ],
      );
      expect(twoClasses.subtitle, "2 classes today — here's the detail.");
    });
  });
}

ClassModel _class({
  required String id,
  required String day,
  String start = '16:00',
  String end = '17:00',
  String type = 'stdmath11',
  List<String> students = const [],
}) {
  return ClassModel(
    id: id,
    type: type,
    dayOfWeek: day,
    startTime: start,
    endTime: end,
    capacity: 8,
    enrolledStudents: students,
    tutors: const ['tutor-1'],
  );
}

Attendance _attendance({
  required String id,
  required DateTime date,
  List<String> students = const [],
  bool cancelled = false,
}) {
  return Attendance(
    id: id,
    date: date,
    termId: '2026_T3',
    cancelled: cancelled,
    updatedAt: date,
    updatedBy: 'system',
    weekNumber: 1,
    attendance: students,
    tutors: const ['tutor-1'],
  );
}

Invoice _invoice({
  required String id,
  required double amount,
  required DateTime due,
  String? number,
  InvoiceStatus status = InvoiceStatus.unpaid,
  List<String> students = const [],
}) {
  return Invoice(
    id: id,
    parentId: 'parent-1',
    parentName: 'Sarah Nguyen',
    parentEmail: 'sarah@example.com',
    lineItems: const [],
    weeks: 2,
    amountDue: amount,
    status: status,
    dueDate: due,
    createdAt: due.subtract(const Duration(days: 14)),
    studentIds: students,
    payments: const [],
    invoiceNumber: number,
  );
}

Announcement _announcement({
  required String id,
  required String title,
  required DateTime createdAt,
}) {
  return Announcement(
    id: id,
    title: title,
    body: 'Body text',
    createdAt: createdAt,
    audience: 'all',
    archived: false,
  );
}

StudentFeedback _feedback({
  String quote = 'Great work this week.',
  required String tutorId,
  required String subject,
}) {
  return StudentFeedback(
    id: 'f1',
    studentId: 'ella',
    tutorId: tutorId,
    parentIds: const ['parent-1'],
    feedback: quote,
    subject: subject,
    createdAt: DateTime(2026, 7, 14),
    isUnread: true,
  );
}
