import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/services/audit_service.dart';
import 'package:tenacity/src/services/timetable_service.dart';

void main() {
  group('checked tutor updates', () {
    test('controller forwards the expected session snapshot', () async {
      final service = _FakeTimetableService();
      final controller = _controller(service);

      await controller.updateSessionTutorsChecked(
        attendanceDocId: 'T3_W2',
        expectedTutorIdsByClass: const {
          'c1': ['t1'],
          'c2': ['t2'],
        },
        tutorIds: const ['t3'],
        updatedBy: 'admin-1',
      );

      expect(service.sessionAttendanceDocId, 'T3_W2');
      expect(service.sessionExpected, {
        'c1': ['t1'],
        'c2': ['t2'],
      });
      expect(service.sessionReplacement, ['t3']);
      expect(controller.errorMessage, isNull);
      expect(controller.isLoading, isFalse);
    });

    test('controller exposes and rethrows a tutor conflict', () async {
      final service = _FakeTimetableService()
        ..sessionError = const TutorAssignmentConflictException(['c1']);
      final controller = _controller(service);

      await expectLater(
        controller.updateSessionTutorsChecked(
          attendanceDocId: 'T3_W2',
          expectedTutorIdsByClass: const {
            'c1': ['t1'],
          },
          tutorIds: const ['t2'],
          updatedBy: 'admin-1',
        ),
        throwsA(isA<TutorAssignmentConflictException>()),
      );

      expect(controller.errorMessage, contains('Someone else changed'));
      expect(controller.errorMessage, contains('Reload before saving'));
      expect(controller.isLoading, isFalse);
    });

    test('standing update forwards the date boundary', () async {
      final service = _FakeTimetableService();
      final controller = _controller(service);
      final boundary = DateTime(2026, 7, 27);

      await controller.updateStandingTutorsChecked(
        expectedTutorIdsByClass: const {
          'c1': ['t1'],
        },
        tutorIds: const ['t2'],
        fromDate: boundary,
        updatedBy: 'admin-1',
      );

      expect(service.standingFromDate, boundary);
      expect(service.standingExpected, {
        'c1': ['t1'],
      });
      expect(controller.isLoading, isFalse);
    });
  });

  group('checked session bookings', () {
    test('controller forwards the expected roster and replacement', () async {
      final service = _FakeTimetableService();
      final controller = _controller(service);

      await controller.updateSessionBookingsChecked(
        classId: 'c1',
        attendanceDocId: 'T3_W2',
        expectedStudentIds: const ['s1', 's2'],
        studentIds: const ['s2'],
        updatedBy: 'admin-1',
      );

      expect(service.bookingExpected, ['s1', 's2']);
      expect(service.bookingReplacement, ['s2']);
      expect(controller.errorMessage, isNull);
    });

    test('controller exposes and rethrows a booking conflict', () async {
      final service = _FakeTimetableService()
        ..bookingError = const SessionBookingsConflictException('c1');
      final controller = _controller(service);

      await expectLater(
        controller.updateSessionBookingsChecked(
          classId: 'c1',
          attendanceDocId: 'T3_W2',
          expectedStudentIds: const ['s1'],
          studentIds: const ['s2'],
          updatedBy: 'admin-1',
        ),
        throwsA(isA<SessionBookingsConflictException>()),
      );

      expect(controller.errorMessage, contains('Someone else changed'));
      expect(controller.errorMessage, contains('Reload before saving'));
      expect(controller.isLoading, isFalse);
    });

    test('successful replacement records a booking-specific audit', () async {
      final service = _FakeTimetableService();
      final audit = _FakeAuditService();
      final controller = _controller(service, auditService: audit)
        ..allClasses = [_class()];

      await controller.updateSessionBookingsChecked(
        classId: 'c1',
        attendanceDocId: 'T3_W2',
        expectedStudentIds: const ['s1', 's2'],
        studentIds: const ['s2', 's3'],
        updatedBy: 'admin-1',
      );

      expect(audit.action, 'attendance.bookings_update');
      expect(audit.before, {
        'attendance': ['s1', 's2'],
      });
      expect(audit.after, {
        'attendance': ['s2', 's3'],
      });
    });
  });

  group('authoritative class creation', () {
    test('controller requests one atomic class and active-term write',
        () async {
      final service = _FakeTimetableService();
      final controller = _controller(service)
        ..activeTerm = _term()
        ..currentWeek = 2;

      await controller.createNewClass(_class());

      expect(service.createdClass?.id, 'c1');
      expect(service.createdClassTermIds, ['T3']);
      expect(
        service.createdClassAttendanceFromDate,
        DateTime(2026, 7, 27),
      );
      expect(controller.errorMessage, isNull);
      expect(controller.isLoading, isFalse);
    });

    test('callable failure propagates without a second client-side phase',
        () async {
      final service = _FakeTimetableService()
        ..createClassError = StateError('atomic write rejected');
      final controller = _controller(service)..activeTerm = _term();

      await expectLater(
        controller.createNewClass(_class()),
        throwsA(isA<StateError>()),
      );

      expect(service.createdClass?.id, 'c1');
      expect(service.createdClassTermIds, ['T3']);
      expect(controller.errorMessage, contains('add this class'));
      expect(controller.isLoading, isFalse);
    });

    test('request payload uses the callable schema', () {
      final attendanceFromDate = DateTime(2026, 7, 27);
      final request = adminCreateClassRequest(
        classModel: _class(),
        termIds: const ['T3'],
        attendanceFromDate: attendanceFromDate,
      );

      expect(request, {
        'id': 'c1',
        'type': '5-10',
        'day': 'Monday',
        'startTime': '16:00',
        'endTime': '17:00',
        'capacity': 6,
        'tutors': ['t1'],
        'enrolledStudents': <String>[],
        'termIds': ['T3'],
        'generateAttendance': true,
        'attendanceFromDate': attendanceFromDate.toUtc().toIso8601String(),
      });
    });

    test('retry reconciliation requires identical creation values', () {
      final requested = _class();

      expect(hasSameClassCreationValues(requested, requested), isTrue);
      expect(
        hasSameClassCreationValues(
          requested.copyWith(capacity: 7),
          requested,
        ),
        isFalse,
      );
      expect(
        hasSameClassCreationValues(
          requested.copyWith(tutors: const ['t2']),
          requested,
        ),
        isFalse,
      );
    });

    test('delete failure propagates instead of returning false success',
        () async {
      final service = _FakeTimetableService()
        ..deleteError = StateError('denied');
      final controller = _controller(service);

      await expectLater(
        controller.deleteClass('c1'),
        throwsA(isA<StateError>()),
      );

      expect(controller.errorMessage, contains('delete this class'));
      expect(controller.isLoading, isFalse);
    });
  });

  group('session cancellation', () {
    test('returns the committed state without relying on a later refresh',
        () async {
      final service = _FakeTimetableService()
        ..fetchedAttendance = _attendance(cancelled: false);
      final controller = _controller(service)..allClasses = [_class()];

      final cancelled = await controller.toggleSessionCancelled(
        classId: 'c1',
        attendanceDocId: 'T3_W2',
        updatedBy: 'admin-1',
      );

      expect(cancelled, isTrue);
      expect(service.setCancelledValue, isTrue);
      expect(controller.attendanceByClass['c1']?.cancelled, isTrue);
      expect(controller.errorMessage, isNull);
    });

    test('rejected write propagates instead of reporting success', () async {
      final service = _FakeTimetableService()
        ..fetchedAttendance = _attendance(cancelled: false)
        ..sessionCancellationError = StateError('denied');
      final controller = _controller(service)..allClasses = [_class()];

      await expectLater(
        controller.toggleSessionCancelled(
          classId: 'c1',
          attendanceDocId: 'T3_W2',
          updatedBy: 'admin-1',
        ),
        throwsA(isA<StateError>()),
      );

      expect(controller.errorMessage,
          contains('change whether this session runs'));
      expect(controller.isLoading, isFalse);
    });
  });

  group('admin enrolment write failures', () {
    test('permanent enrolment failure propagates', () async {
      final service = _FakeTimetableService()
        ..permanentEnrollError = StateError('denied');
      final controller = _controller(service)..allClasses = [_class()];

      await expectLater(
        controller.enrollStudentPermanent(
          classId: 'c1',
          studentId: 's1',
        ),
        throwsA(isA<StateError>()),
      );

      expect(controller.errorMessage, contains('enrol this student'));
      expect(controller.isLoading, isFalse);
    });

    test('already-enrolled outcome is explicit without another write',
        () async {
      final service = _FakeTimetableService();
      final controller = _controller(service)
        ..allClasses = [
          _class().copyWith(enrolledStudents: const ['s1']),
        ];

      final outcome = await controller.enrollStudentPermanent(
        classId: 'c1',
        studentId: 's1',
      );

      expect(outcome, AdminPermanentEnrollmentOutcome.alreadyEnrolled);
      expect(service.permanentEnrollCalls, 0);
      expect(controller.isLoading, isFalse);
    });

    test('permanent unenrolment failure propagates', () async {
      final service = _FakeTimetableService()
        ..permanentUnenrollError = StateError('denied');
      final controller = _controller(service)..allClasses = [_class()];

      await expectLater(
        controller.unenrollStudentPermanent(
          classId: 'c1',
          studentId: 's1',
        ),
        throwsA(isA<StateError>()),
      );

      expect(
        controller.errorMessage,
        contains('unenrol this student'),
      );
      expect(controller.isLoading, isFalse);
    });

    test('one-week cancellation failure propagates', () async {
      final service = _FakeTimetableService()
        ..cancelStudentError = StateError('denied');
      final controller = _controller(service)..allClasses = [_class()];

      await expectLater(
        controller.cancelStudentForWeek(
          classId: 'c1',
          studentId: 's1',
          attendanceDocId: 'T3_W2',
        ),
        throwsA(isA<StateError>()),
      );

      expect(controller.errorMessage, contains('cancel this class'));
      expect(controller.isLoading, isFalse);
    });
  });

  group('parent booking write failures', () {
    test('one-week reschedule failure propagates to the booking sheet',
        () async {
      final service = _FakeTimetableService()
        ..rescheduleError = StateError('reschedule denied');
      final controller = _controller(service);

      await expectLater(
        controller.rescheduleToDifferentClass(
          oldClassId: 'c1',
          oldAttendanceDocId: 'T3_W2',
          newClassId: 'c2',
          newAttendanceDocId: 'T3_W2',
          studentId: 's1',
        ),
        throwsA(isA<StateError>()),
      );

      expect(controller.errorMessage, contains('reschedule this student'));
      expect(controller.isLoading, isFalse);
    });

    test('permanent swap second-phase failure propagates', () async {
      final service = _FakeTimetableService()
        ..permanentEnrollError = StateError('new class denied');
      final controller = _controller(service);

      await expectLater(
        controller.swapPermanentEnrollment(
          oldClassId: 'c1',
          newClassId: 'c2',
          studentId: 's1',
        ),
        throwsA(isA<StateError>()),
      );

      expect(controller.errorMessage, contains('swap this enrolment'));
      expect(controller.isLoading, isFalse);
    });

    test('a swap takes the new place before giving up the old one', () async {
      // A full class can refuse the enrolment now. Giving up the old place
      // first would leave the student in neither class (MOB-38).
      final service = _FakeTimetableService();
      final controller = _controller(service);

      await controller.swapPermanentEnrollment(
        oldClassId: 'c1',
        newClassId: 'c2',
        studentId: 's1',
      );

      expect(service.permanentCallOrder, ['enrol:c2', 'unenrol:c1']);
    });

    test('a refused swap never touches the old class', () async {
      final service = _FakeTimetableService()
        ..permanentEnrollError = StateError('new class full');
      final controller = _controller(service);

      await expectLater(
        controller.swapPermanentEnrollment(
          oldClassId: 'c1',
          newClassId: 'c2',
          studentId: 's1',
        ),
        throwsA(isA<StateError>()),
      );

      expect(
        service.permanentCallOrder,
        ['enrol:c2'],
        reason: 'the student must keep their existing place when refused',
      );
    });

    test('weeks the new class could not take are kept in the old one',
        () async {
      final service = _FakeTimetableService()
        ..permanentEnrollSkippedWeeks = const ['2026_T2_W3', '2026_T2_W4'];
      final controller = _controller(service);

      final kept = await controller.swapPermanentEnrollment(
        oldClassId: 'c1',
        newClassId: 'c2',
        studentId: 's1',
      );

      expect(service.lastUnenrollKeepSessionIds, ['2026_T2_W3', '2026_T2_W4']);
      expect(
        kept,
        ['2026_T2_W3', '2026_T2_W4'],
        reason: 'the caller needs these to tell the family',
      );
    });

    test('a swap that took every week keeps nothing back', () async {
      final service = _FakeTimetableService();
      final controller = _controller(service);

      final kept = await controller.swapPermanentEnrollment(
        oldClassId: 'c1',
        newClassId: 'c2',
        studentId: 's1',
      );

      expect(kept, isEmpty);
      expect(service.lastUnenrollKeepSessionIds, isEmpty);
    });

    test('absence failure propagates instead of reporting no token', () async {
      final service = _FakeTimetableService()
        ..notifyAbsenceError = StateError('absence denied');
      final controller = _controller(service);

      await expectLater(
        controller.notifyAbsence(
          classId: 'c1',
          studentId: 's1',
          attendanceDocId: 'T3_W2',
          parentId: 'p1',
        ),
        throwsA(isA<StateError>()),
      );

      expect(controller.errorMessage, contains('record this absence'));
      expect(controller.isLoading, isFalse);
    });
  });
}

TimetableController _controller(
  _FakeTimetableService service, {
  _FakeAuditService? auditService,
}) {
  return TimetableController(
    service: service,
    auditService: auditService ?? _FakeAuditService(),
  );
}

class _FakeAuditService implements AuditService {
  String? action;
  Map<String, Object?>? before;
  Map<String, Object?>? after;

  @override
  void record({
    required String action,
    required String targetType,
    required String targetId,
    String? targetName,
    Map<String, Object?>? payloadSummary,
    Map<String, Object?>? before,
    Map<String, Object?>? after,
    String? requestId,
  }) {
    this.action = action;
    this.before = before;
    this.after = after;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeTimetableService implements TimetableService {
  Object? sessionError;
  Object? standingError;
  Object? bookingError;
  Object? createClassError;
  Object? deleteError;
  Object? permanentEnrollError;
  Object? permanentUnenrollError;
  Object? cancelStudentError;
  Object? sessionCancellationError;
  Object? rescheduleError;
  Object? notifyAbsenceError;
  Attendance? fetchedAttendance;
  bool? setCancelledValue;

  String? sessionAttendanceDocId;
  Map<String, List<String>>? sessionExpected;
  List<String>? sessionReplacement;
  Map<String, List<String>>? standingExpected;
  DateTime? standingFromDate;
  List<String>? bookingExpected;
  List<String>? bookingReplacement;
  ClassModel? createdClass;
  List<String>? createdClassTermIds;
  DateTime? createdClassAttendanceFromDate;
  int permanentEnrollCalls = 0;

  @override
  Future<void> updateSessionTutorsChecked({
    required String attendanceDocId,
    required Map<String, List<String>> expectedTutorIdsByClass,
    required List<String> tutorIds,
    required String updatedBy,
  }) async {
    if (sessionError case final error?) throw error;
    sessionAttendanceDocId = attendanceDocId;
    sessionExpected = expectedTutorIdsByClass;
    sessionReplacement = tutorIds;
  }

  @override
  Future<void> updateStandingTutorsChecked({
    required Map<String, List<String>> expectedTutorIdsByClass,
    required List<String> tutorIds,
    required DateTime fromDate,
    required String updatedBy,
  }) async {
    if (standingError case final error?) throw error;
    standingExpected = expectedTutorIdsByClass;
    standingFromDate = fromDate;
  }

  @override
  Future<void> updateSessionBookingsChecked({
    required String classId,
    required String attendanceDocId,
    required List<String> expectedStudentIds,
    required List<String> studentIds,
    required String updatedBy,
  }) async {
    if (bookingError case final error?) throw error;
    bookingExpected = expectedStudentIds;
    bookingReplacement = studentIds;
  }

  @override
  Future<void> createClassWithAttendance({
    required ClassModel classModel,
    required List<String> termIds,
    DateTime? attendanceFromDate,
  }) async {
    createdClass = classModel;
    createdClassTermIds = termIds;
    createdClassAttendanceFromDate = attendanceFromDate;
    if (createClassError case final error?) throw error;
  }

  @override
  Future<void> deleteClass(String classId) async {
    if (deleteError case final error?) throw error;
  }

  @override
  Future<List<ClassModel>> fetchAllClasses() async => const [];

  /// Weeks the next [enrollStudentPermanent] reports it could not take.
  List<String> permanentEnrollSkippedWeeks = const [];

  /// What the last [unenrollStudentPermanent] was told to leave alone.
  List<String>? lastUnenrollKeepSessionIds;

  /// The order the two halves of a swap ran in, so a test can assert the new
  /// place is taken before the old one is given up.
  final List<String> permanentCallOrder = [];

  @override
  Future<List<String>> enrollStudentPermanent({
    required String classId,
    required String studentId,
  }) async {
    permanentEnrollCalls++;
    permanentCallOrder.add('enrol:$classId');
    if (permanentEnrollError case final error?) throw error;
    return permanentEnrollSkippedWeeks;
  }

  @override
  Future<void> unenrollStudentPermanent({
    required String classId,
    required String studentId,
    List<String> keepSessionIds = const [],
  }) async {
    permanentCallOrder.add('unenrol:$classId');
    lastUnenrollKeepSessionIds = keepSessionIds;
    if (permanentUnenrollError case final error?) throw error;
  }

  @override
  Future<void> cancelStudentForWeek({
    required String classId,
    required String studentId,
    required String attendanceDocId,
  }) async {
    if (cancelStudentError case final error?) throw error;
  }

  @override
  Future<Attendance?> fetchAttendanceDoc({
    required String classId,
    required String attendanceDocId,
  }) async {
    return fetchedAttendance;
  }

  @override
  Future<void> setSessionCancelled({
    required String classId,
    required String attendanceDocId,
    required bool cancelled,
    required String updatedBy,
  }) async {
    if (sessionCancellationError case final error?) throw error;
    setCancelledValue = cancelled;
  }

  @override
  Future<void> rescheduleToDifferentClass({
    required String oldClassId,
    required String oldAttendanceDocId,
    required String newClassId,
    required String newAttendanceDocId,
    required String studentId,
  }) async {
    if (rescheduleError case final error?) throw error;
  }

  @override
  Future<bool> notifyStudentAbsence({
    required String classId,
    required String studentId,
    required String attendanceDocId,
    required String parentId,
  }) async {
    if (notifyAbsenceError case final error?) throw error;
    return false;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

ClassModel _class() => const ClassModel(
      id: 'c1',
      type: '5-10',
      dayOfWeek: 'Monday',
      startTime: '16:00',
      endTime: '17:00',
      capacity: 6,
      enrolledStudents: [],
      tutors: ['t1'],
    );

Term _term() => Term(
      id: 'T3',
      year: '2026',
      termNumber: 3,
      startDate: DateTime(2026, 7, 20),
      endDate: DateTime(2026, 9, 25),
      totalWeeks: 10,
      isActive: true,
    );

Attendance _attendance({required bool cancelled}) => Attendance(
      id: 'T3_W2',
      date: DateTime(2026, 7, 27, 16),
      termId: 'T3',
      cancelled: cancelled,
      updatedAt: DateTime(2026, 7, 20),
      updatedBy: 'system',
      weekNumber: 2,
      attendance: const ['s1'],
      tutors: const ['t1'],
    );
