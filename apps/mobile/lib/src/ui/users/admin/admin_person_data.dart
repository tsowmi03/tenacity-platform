import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/ui/messaging/inbox_data.dart';

/// What kind of account is being shown, which decides what the record offers.
enum AdminPersonKind { parent, tutor, admin }

/// One of a parent's children on the admin record.
@immutable
class AdminPersonStudent {
  final String id;
  final String name;
  final String initials;

  /// `Year 9`, or empty when the record has no grade.
  final String yearLabel;

  /// The classes this student is enrolled in, for the expanded detail.
  final List<AdminPersonEnrolment> enrolments;

  const AdminPersonStudent({
    required this.id,
    required this.name,
    required this.initials,
    required this.yearLabel,
    required this.enrolments,
  });

  /// `Year 9 · 2 classes`, or just the year when they have none.
  String get subtitle {
    final count = enrolments.length;
    final classes = count == 1 ? '1 class' : '$count classes';
    return [
      if (yearLabel.isNotEmpty) yearLabel,
      if (count > 0) classes,
    ].join(' · ');
  }
}

/// A class a student is enrolled in, and the handle needed to unenrol them.
@immutable
class AdminPersonEnrolment {
  final String classId;
  final String title;

  /// `Wed 4:00 PM`.
  final String whenLabel;

  const AdminPersonEnrolment({
    required this.classId,
    required this.title,
    required this.whenLabel,
  });
}

/// An invoice on the admin record.
@immutable
class AdminPersonInvoice {
  final String id;
  final String reference;
  final String amountLabel;

  /// `Due 12 Jul`, or `Paid 3 Jul` once settled.
  final String dateLabel;

  final InvoiceStatus status;

  /// True when unpaid and past its due date, which the stored status alone does
  /// not always reflect.
  final bool isOverdue;

  const AdminPersonInvoice({
    required this.id,
    required this.reference,
    required this.amountLabel,
    required this.dateLabel,
    required this.status,
    required this.isOverdue,
  });

  String get statusLabel {
    if (status == InvoiceStatus.paid) return 'PAID';
    return isOverdue ? 'OVERDUE' : 'UNPAID';
  }
}

@immutable
class AdminPersonViewData {
  final String name;
  final String initials;
  final AdminPersonKind kind;

  /// `Parent`, `Tutor`, `Admin`.
  final String roleLabel;

  final String email;
  final String phone;

  /// Null for anyone who is not a parent — only families hold lesson tokens.
  final int? lessonTokens;

  final List<AdminPersonStudent> students;
  final List<AdminPersonInvoice> invoices;

  final bool isLoadingStudents;

  const AdminPersonViewData({
    required this.name,
    required this.initials,
    required this.kind,
    required this.roleLabel,
    required this.email,
    required this.phone,
    required this.lessonTokens,
    required this.students,
    required this.invoices,
    this.isLoadingStudents = false,
  });

  bool get isParent => kind == AdminPersonKind.parent;

  /// Only families have tokens to edit.
  bool get canEditTokens => isParent;

  /// `Remove parent & students` reads differently from `Remove tutor`, because
  /// removing a parent takes their children with them.
  String get removeLabel => isParent
      ? 'Remove parent & students'
      : 'Remove ${roleLabel.toLowerCase()}';

  /// What the confirmation has to warn about before the account goes.
  String get removeWarning => isParent
      ? 'This permanently deletes this parent and every student linked to them, '
          'along with their enrolments. It cannot be undone.'
      : 'This permanently deletes this account. It cannot be undone.';

  bool get hasOverdueInvoice => invoices.any((invoice) => invoice.isOverdue);
}

/// Builds the admin record for one person.
///
/// Pure, so every label and derivation is testable without Firestore. The
/// mutations this record offers — editing tokens, unenrolling a student,
/// removing an account — stay in the screen, which calls the same services the
/// legacy screen did.
AdminPersonViewData buildAdminPersonViewData({
  required AppUser user,
  required List<Student> students,
  required List<ClassModel> classes,
  required List<Invoice> invoices,
  required DateTime now,
  bool isLoadingStudents = false,
}) {
  final today = DateTime(now.year, now.month, now.day);
  final name = '${user.firstName} ${user.lastName}'.trim();

  final kind = switch (user.role) {
    'parent' => AdminPersonKind.parent,
    'admin' => AdminPersonKind.admin,
    _ => AdminPersonKind.tutor,
  };

  final classesById = {for (final c in classes) c.id: c};

  final studentRows = [
    for (final student in students)
      AdminPersonStudent(
        id: student.id,
        name: '${student.firstName} ${student.lastName}'.trim(),
        initials: initialsFor('${student.firstName} ${student.lastName}'),
        yearLabel: _yearLabel(student.grade),
        enrolments: [
          for (final classModel in classes)
            if (classModel.enrolledStudents.contains(student.id))
              AdminPersonEnrolment(
                classId: classModel.id,
                title: formatDashboardClassType(classModel.type),
                whenLabel: _whenLabel(classesById[classModel.id]!),
              ),
        ],
      ),
  ]..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

  // Only this person's invoices, newest first. The controller holds whatever
  // was last loaded, so filtering by parent id here keeps another family's
  // billing off this record.
  final invoiceRows = invoices
      .where((invoice) => invoice.parentId == user.uid)
      .toList(growable: false)
    ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

  return AdminPersonViewData(
    name: name,
    initials: initialsFor(name),
    kind: kind,
    roleLabel: _roleLabel(kind),
    email: user.email,
    phone: user.phone,
    lessonTokens: user is Parent ? user.lessonTokens : null,
    students: studentRows,
    invoices: invoiceRows
        .map((invoice) => _toInvoice(invoice, today))
        .toList(growable: false),
    isLoadingStudents: isLoadingStudents,
  );
}

String _roleLabel(AdminPersonKind kind) => switch (kind) {
      AdminPersonKind.parent => 'Parent',
      AdminPersonKind.tutor => 'Tutor',
      AdminPersonKind.admin => 'Admin',
    };

String _yearLabel(String grade) {
  final trimmed = grade.trim();
  if (trimmed.isEmpty) return '';
  return trimmed.toLowerCase().startsWith('year') ? trimmed : 'Year $trimmed';
}

String _whenLabel(ClassModel classModel) {
  final day = classModel.dayOfWeek.trim();
  final shortDay = day.length >= 3 ? day.substring(0, 3) : day;
  return '$shortDay ${_time(classModel.startTime)}'.trim();
}

String _time(String hhmm) {
  final parts = hhmm.split(':');
  if (parts.length != 2) return hhmm;
  final hour = int.tryParse(parts[0]);
  final minute = int.tryParse(parts[1]);
  if (hour == null || minute == null) return hhmm;
  return DateFormat('h:mm a').format(DateTime(2026, 1, 1, hour, minute));
}

AdminPersonInvoice _toInvoice(Invoice invoice, DateTime today) {
  final due = invoice.dueDate.toLocal();
  final dueDay = DateTime(due.year, due.month, due.day);
  final isPaid = invoice.status == InvoiceStatus.paid;
  final paidAt = invoice.paidAt?.toLocal();

  return AdminPersonInvoice(
    id: invoice.id,
    reference: invoice.invoiceNumber?.trim().isNotEmpty == true
        ? invoice.invoiceNumber!.trim()
        : invoice.id,
    amountLabel: formatCurrency(invoice.amountDue),
    dateLabel: isPaid && paidAt != null
        ? 'Paid ${DateFormat('d MMM').format(paidAt)}'
        : 'Due ${DateFormat('d MMM').format(dueDay)}',
    status: invoice.status,
    isOverdue: !isPaid && dueDay.isBefore(today),
  );
}
