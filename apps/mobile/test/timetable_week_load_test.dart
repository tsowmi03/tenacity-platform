import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/services/audit_service.dart';
import 'package:tenacity/src/services/timetable_service.dart';

void main() {
  group('loadAttendanceForWeek', () {
    test('asks for the whole week in one query, not one read per class',
        () async {
      final service = _FakeTimetableService()
        ..weekAttendance = {
          'c1': _attendance(id: 'T3_W2', classLabel: 'c1'),
          'c2': _attendance(id: 'T3_W2', classLabel: 'c2'),
        };
      final controller = _controller(service)
        ..activeTerm = _term()
        ..currentWeek = 2
        ..allClasses = [_class('c1'), _class('c2')];

      await controller.loadAttendanceForWeek();

      expect(service.weekQueries, [
        const _WeekQuery(termId: 'T3', weekNumber: 2),
      ]);
      // The per-class fetch is still there for callers that need one session,
      // but the week load no longer uses it.
      expect(service.perClassFetches, isEmpty);
      expect(controller.attendanceByClass.keys, unorderedEquals(['c1', 'c2']));
      expect(controller.loadedAttendanceDocId, 'T3_W2');
    });

    test('drops sessions whose class is no longer on the books', () async {
      // A collection-group query returns attendance under deleted classes too,
      // which the old per-class fetch could not.
      final service = _FakeTimetableService()
        ..weekAttendance = {
          'c1': _attendance(id: 'T3_W2', classLabel: 'c1'),
          'deleted-class': _attendance(id: 'T3_W2', classLabel: 'gone'),
        };
      final controller = _controller(service)
        ..activeTerm = _term()
        ..currentWeek = 2
        ..allClasses = [_class('c1')];

      await controller.loadAttendanceForWeek();

      expect(controller.attendanceByClass.keys, ['c1']);
    });

    test('keeps the previous week on screen until the new one arrives',
        () async {
      final gate = Completer<Map<String, Attendance>>();
      final service = _FakeTimetableService()..weekGate = gate;
      final controller = _controller(service)
        ..activeTerm = _term()
        ..currentWeek = 2
        ..allClasses = [_class('c1')]
        ..attendanceByClass = {
          'c1': _attendance(id: 'T3_W1', classLabel: 'c1')
        };

      final pending = controller.loadAttendanceForWeek(silent: true);

      // Mid-flight: the old week is still there. Clearing up front used to
      // blank the timetable for the duration of every silent refresh.
      expect(controller.attendanceByClass['c1']?.id, 'T3_W1');

      gate.complete({'c1': _attendance(id: 'T3_W2', classLabel: 'c1')});
      await pending;

      expect(controller.attendanceByClass['c1']?.id, 'T3_W2');
    });

    test('a silent load leaves isLoading alone', () async {
      final service = _FakeTimetableService()..weekAttendance = const {};
      final controller = _controller(service)
        ..activeTerm = _term()
        ..currentWeek = 2;

      var sawLoading = false;
      controller.addListener(() {
        if (controller.isLoading) sawLoading = true;
      });

      await controller.loadAttendanceForWeek(silent: true);

      expect(sawLoading, isFalse);
      expect(controller.isLoading, isFalse);
    });

    test('a silent failure reports itself so the retry surface can show it',
        () async {
      final service = _FakeTimetableService()
        ..weekError = StateError('permission denied');
      final controller = _controller(service)
        ..activeTerm = _term()
        ..currentWeek = 2;

      await controller.loadAttendanceForWeek(silent: true);

      expect(controller.errorMessage, contains('Failed to load attendance'));
      expect(controller.isLoading, isFalse);
    });

    test('a silent load does not erase an error it did not set', () async {
      // Silent refreshes run inside other operations' finally blocks, so
      // clearing here would wipe the conflict those operations just recorded.
      final service = _FakeTimetableService()..weekAttendance = const {};
      final controller = _controller(service)
        ..activeTerm = _term()
        ..currentWeek = 2
        ..errorMessage = 'The roster changed while you were editing it.';

      await controller.loadAttendanceForWeek(silent: true);

      expect(controller.errorMessage, contains('changed'));
    });

    test('clearError drops it, for a screen reloading on purpose', () {
      final controller = _controller(_FakeTimetableService())
        ..errorMessage = 'Failed to load classes';

      controller.clearError();

      expect(controller.errorMessage, isNull);
    });

    test('a stale response cannot overwrite a newer week — the paging race',
        () async {
      // The scenario: a silent background refresh for week 2 is in flight
      // (it does not block the screen, by design), and the user pages to
      // week 3 before it resolves. Both calls capture the week they were
      // started for; only the response for the week actually on screen may
      // be committed, regardless of which network call finishes first.
      final service = _FakeTimetableService()
        ..gateWeek(2)
        ..respondToWeek(3, {'c1': _attendance(id: 'T3_W3', classLabel: 'c1')});
      final controller = _controller(service)
        ..activeTerm = _term()
        ..currentWeek = 2
        ..allClasses = [_class('c1')];

      // The background refresh for week 2 starts, and hangs at the gate.
      final staleLoad = controller.loadAttendanceForWeek(silent: true);

      // The user pages forward before it resolves.
      controller.currentWeek = 3;
      await controller.loadAttendanceForWeek(silent: true);

      expect(controller.attendanceByClass['c1']?.id, 'T3_W3');
      expect(controller.loadedAttendanceDocId, 'T3_W3');

      // The stale week-2 response now arrives, after week 3 has already
      // committed. It must not be allowed to overwrite it.
      service.releaseWeek(2, {
        'c1': _attendance(id: 'T3_W2', classLabel: 'c1'),
      });
      await staleLoad;

      expect(controller.attendanceByClass['c1']?.id, 'T3_W3');
      expect(controller.loadedAttendanceDocId, 'T3_W3');
    });

    test('a stale failure does not stamp an error over the current week',
        () async {
      final service = _FakeTimetableService()
        ..gateWeek(2)
        ..respondToWeek(3, {'c1': _attendance(id: 'T3_W3', classLabel: 'c1')});
      final controller = _controller(service)
        ..activeTerm = _term()
        ..currentWeek = 2
        ..allClasses = [_class('c1')];

      final staleLoad = controller.loadAttendanceForWeek(silent: true);
      controller.currentWeek = 3;
      await controller.loadAttendanceForWeek(silent: true);

      expect(controller.errorMessage, isNull);

      service.failWeek(2, StateError('the old request timed out'));
      await staleLoad;

      expect(controller.attendanceByClass['c1']?.id, 'T3_W3');
      expect(controller.errorMessage, isNull);
    });
  });
}

TimetableController _controller(_FakeTimetableService service) {
  return TimetableController(service: service, auditService: _FakeAudit());
}

class _WeekQuery {
  final String termId;
  final int weekNumber;

  const _WeekQuery({required this.termId, required this.weekNumber});

  @override
  bool operator ==(Object other) =>
      other is _WeekQuery &&
      other.termId == termId &&
      other.weekNumber == weekNumber;

  @override
  int get hashCode => Object.hash(termId, weekNumber);

  @override
  String toString() => '_WeekQuery($termId, W$weekNumber)';
}

class _FakeTimetableService implements TimetableService {
  Map<String, Attendance> weekAttendance = const {};
  Object? weekError;
  Completer<Map<String, Attendance>>? weekGate;

  /// Per-week gates, for tests that need two different weeks' requests in
  /// flight at once — [weekGate] alone can only hold one call open at a time.
  final Map<int, Completer<Map<String, Attendance>>> _gatesByWeek = {};
  final Map<int, Map<String, Attendance>> _responsesByWeek = {};

  final List<_WeekQuery> weekQueries = [];
  final List<String> perClassFetches = [];

  /// Holds the response for [week] open until [releaseWeek] or [failWeek].
  void gateWeek(int week) {
    _gatesByWeek[week] = Completer<Map<String, Attendance>>();
  }

  void releaseWeek(int week, Map<String, Attendance> attendance) {
    _gatesByWeek[week]!.complete(attendance);
  }

  void failWeek(int week, Object error) {
    _gatesByWeek[week]!.completeError(error);
  }

  /// Resolves immediately for [week], independent of the shared
  /// [weekAttendance]/[weekGate] fields the other tests use.
  void respondToWeek(int week, Map<String, Attendance> attendance) {
    _responsesByWeek[week] = attendance;
  }

  @override
  Future<Map<String, Attendance>> fetchAttendanceForWeek({
    required String termId,
    required int weekNumber,
  }) async {
    weekQueries.add(_WeekQuery(termId: termId, weekNumber: weekNumber));

    final gate = _gatesByWeek[weekNumber];
    if (gate != null) return gate.future;

    final response = _responsesByWeek[weekNumber];
    if (response != null) return response;

    if (weekError != null) throw weekError!;
    final sharedGate = weekGate;
    if (sharedGate != null) return sharedGate.future;
    return weekAttendance;
  }

  @override
  Future<Attendance?> fetchAttendanceDoc({
    required String classId,
    required String attendanceDocId,
  }) async {
    perClassFetches.add(classId);
    return null;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeAudit implements AuditService {
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
  }) {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

ClassModel _class(String id) => ClassModel(
      id: id,
      type: '5-10',
      dayOfWeek: 'Monday',
      startTime: '16:00',
      endTime: '17:00',
      capacity: 6,
      enrolledStudents: const [],
      tutors: const ['t1'],
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

Attendance _attendance({required String id, required String classLabel}) =>
    Attendance(
      id: id,
      date: DateTime(2026, 7, 27, 16),
      termId: 'T3',
      cancelled: false,
      updatedAt: DateTime(2026, 7, 20),
      updatedBy: 'system',
      weekNumber: 2,
      attendance: [classLabel],
      tutors: const ['t1'],
    );
