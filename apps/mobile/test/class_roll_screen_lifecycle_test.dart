import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/tutor_model.dart';
import 'package:tenacity/src/services/tutor_session_service.dart';
import 'package:tenacity/src/ui/classes/tutor/class_roll_screen.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

void main() {
  testWidgets('header and system back stay blocked during a pending save',
      (tester) async {
    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final classInfo = _class();
    final timetable = _FakeTimetableController(
      attendanceByClass: {'c1': _attendance()},
    );
    final sessionService = _FakeTutorSessionService(pending: true);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthController>.value(
            value: _FakeAuthController(),
          ),
          ChangeNotifierProvider<TimetableController>.value(
            value: timetable,
          ),
          ChangeNotifierProvider<ConnectivityController>.value(
            value: _FakeConnectivityController(),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: FilledButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => ClassRollScreen(
                        classInfo: classInfo,
                        attendanceDocId: 'T3_W2',
                        sessionService: sessionService,
                      ),
                    ),
                  ),
                  child: const Text('Open roll'),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open roll'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('roll-away-s1')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('class-roll-save')));
    await tester.pump();

    expect(sessionService.submitCalls, 1);
    await tester.tap(find.byKey(const Key('detail-back')));
    await tester.pump();
    await tester.binding.handlePopRoute();
    await tester.pump();

    expect(find.byType(ClassRollScreen), findsOneWidget);
    expect(find.text('Open roll'), findsNothing);

    sessionService.submitGate!.complete();
    await tester.pumpAndSettle();
    expect(find.byType(ClassRollScreen), findsOneWidget);
  });

  testWidgets('an ambiguous failed save cannot resend feedback without reopen',
      (tester) async {
    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final sessionService = _FakeTutorSessionService(
      submitError: StateError('attendance write failed after feedback'),
    );
    await _pumpRoll(
      tester,
      classInfo: _class(),
      timetable: _FakeTimetableController(
        attendanceByClass: {'c1': _attendance()},
      ),
      sessionService: sessionService,
    );

    await tester.tap(find.byKey(const Key('roll-away-s1')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('class-roll-save')));
    await tester.pumpAndSettle();

    expect(sessionService.submitCalls, 1);
    expect(
      find.textContaining('Reopen the roll before retrying.'),
      findsOneWidget,
    );
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('class-roll-save')))
          .onPressed,
      isNull,
    );
  });
}

Future<void> _pumpRoll(
  WidgetTester tester, {
  required ClassModel classInfo,
  required _FakeTimetableController timetable,
  required _FakeTutorSessionService sessionService,
}) async {
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthController>.value(
          value: _FakeAuthController(),
        ),
        ChangeNotifierProvider<TimetableController>.value(
          value: timetable,
        ),
        ChangeNotifierProvider<ConnectivityController>.value(
          value: _FakeConnectivityController(),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.light,
        home: ClassRollScreen(
          classInfo: classInfo,
          attendanceDocId: 'T3_W2',
          sessionService: sessionService,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

class _FakeAuthController extends ChangeNotifier implements AuthController {
  @override
  AppUser? get currentUser => Tutor(
        uid: 't1',
        role: 'tutor',
        firstName: 'Taylor',
        lastName: 'Tutor',
        email: 'taylor@example.com',
        fcmTokens: const [],
        phone: '',
        unreadChats: const {},
        activeChats: const [],
      );

  @override
  Future<Student?> fetchStudentData(String studentId) async => Student(
        id: studentId,
        firstName: 'Ava',
        lastName: 'Student',
        parents: const ['p1'],
        grade: 'Year 8',
        subjects: const ['maths'],
      );

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeTimetableController extends ChangeNotifier
    implements TimetableController {
  _FakeTimetableController({required this.attendanceByClass});

  @override
  Map<String, Attendance> attendanceByClass;

  @override
  Future<bool> loadAttendanceForWeek({bool silent = false}) async => true;

  DateTime? requestedAdminDate;

  @override
  void requestAdminDate(DateTime date) => requestedAdminDate = date;

  @override
  DateTime? takeRequestedAdminDate() {
    final date = requestedAdminDate;
    requestedAdminDate = null;
    return date;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeConnectivityController extends ChangeNotifier
    implements ConnectivityController {
  @override
  bool get isOnline => true;

  @override
  bool get isOffline => false;

  @override
  Future<bool> refreshAndCheckOnline() async => true;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeTutorSessionService implements TutorSessionService {
  _FakeTutorSessionService({bool pending = false, this.submitError})
      : submitGate = pending ? Completer<void>() : null;

  final Completer<void>? submitGate;
  final Object? submitError;
  int submitCalls = 0;

  @override
  Future<List<StudentFeedback>> feedbackForSession({
    required String classId,
    required String sessionId,
  }) async =>
      const [];

  @override
  Future<void> submitSession({
    required String classId,
    required String sessionId,
    required Map<String, RollMark> marks,
    required List<StudentFeedback> feedback,
    required bool markRollComplete,
    required String completedBy,
  }) async {
    submitCalls++;
    final error = submitError;
    if (error != null) throw error;
    await submitGate?.future;
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
      enrolledStudents: ['s1'],
      tutors: ['t1'],
    );

Attendance _attendance() => Attendance(
      id: 'T3_W2',
      date: DateTime.now(),
      termId: 'T3',
      cancelled: false,
      updatedAt: DateTime.now(),
      updatedBy: 'system',
      weekNumber: 2,
      attendance: const ['s1'],
      tutors: const ['t1'],
    );
