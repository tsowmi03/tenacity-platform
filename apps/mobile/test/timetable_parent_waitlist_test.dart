import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/permanent_enrollment_result_model.dart';
import 'package:tenacity/src/models/waitlist_entry_model.dart';
import 'package:tenacity/src/services/audit_service.dart';
import 'package:tenacity/src/services/timetable_service.dart';

/// Parents may only read their own waitlist entries (firestore.rules), so a
/// parent action must never refresh a class's whole waitlist: the denied read
/// made a successful permanent enrolment report as failed and skip its
/// invoice.
void main() {
  test('a parent enrolment succeeds without reading the class waitlist',
      () async {
    final service = _ParentOnlyTimetableService();
    final controller = TimetableController(
      service: service,
      auditService: _NoopAuditService(),
    );

    final result = await controller.enrollStudentPermanentForParent(
      classId: 'class-1',
      studentId: 'student-1',
      parentId: 'parent-1',
    );

    expect(result?.enrolled, isTrue);
    expect(controller.errorMessage, isNull);
    expect(service.classWaitlistReads, 0);
    expect(service.parentWaitlistReads, 1);
  });
}

class _ParentOnlyTimetableService implements TimetableService {
  int classWaitlistReads = 0;
  int parentWaitlistReads = 0;

  @override
  Future<PermanentEnrollmentResult> enrollStudentPermanentForParent({
    required String classId,
    required String studentId,
    required String parentId,
  }) async =>
      const PermanentEnrollmentResult.enrolled(
        classState: ClassEnrollmentState.open,
      );

  @override
  Future<List<ClassModel>> fetchAllClasses(
          {bool requireServer = false}) async =>
      const [];

  @override
  Future<List<WaitlistEntry>> fetchWaitlistEntriesForClass({
    required String classId,
    WaitlistStatus? status,
  }) async {
    classWaitlistReads++;
    throw Exception('permission-denied');
  }

  @override
  Future<List<WaitlistEntry>> fetchWaitlistEntriesForParent({
    required String parentId,
    WaitlistStatus? status,
  }) async {
    parentWaitlistReads++;
    return const [];
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _NoopAuditService implements AuditService {
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}
