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

  testWidgets('feedback the family already has stays editable', (tester) async {
    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final sessionService = _FakeTutorSessionService(
      sent: [_sentFeedback(body: 'Grate work today.')],
    );
    await _pumpRoll(
      tester,
      classInfo: _class(),
      timetable: _FakeTimetableController(
        attendanceByClass: {'c1': _attendance()},
      ),
      sessionService: sessionService,
    );

    await tester.tap(find.byKey(const Key('roll-here-s1')));
    await tester.pump();

    // The note is marked as gone out, so the tutor knows they are correcting
    // something rather than writing it fresh.
    expect(find.byKey(const Key('roll-feedback-sent-notice')), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('roll-feedback-s1')),
      'Great work today.',
    );
    await tester.pump();
    await tester.tap(find.byKey(const Key('class-roll-save')));
    await tester.pumpAndSettle();

    // Corrected in place. Sending it again would give the family a second note
    // about one lesson, which is what the read-only field used to prevent.
    expect(sessionService.lastFeedback, isEmpty);
    expect(sessionService.lastEdits, hasLength(1));
    expect(sessionService.lastEdits.single.id, 'T3_W2_s1');
    expect(sessionService.lastEdits.single.feedback, 'Great work today.');
    expect(find.text('Roll saved and feedback updated.'), findsOneWidget);
  });

  testWidgets('a sent note cannot be emptied by saving', (tester) async {
    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final sessionService = _FakeTutorSessionService(
      sent: [_sentFeedback(body: 'Great work today.')],
    );
    await _pumpRoll(
      tester,
      classInfo: _class(),
      timetable: _FakeTimetableController(
        attendanceByClass: {'c1': _attendance()},
      ),
      sessionService: sessionService,
    );

    await tester.tap(find.byKey(const Key('roll-here-s1')));
    await tester.pump();
    await tester.enterText(find.byKey(const Key('roll-feedback-s1')), '   ');
    await tester.pump();
    await tester.tap(find.byKey(const Key('class-roll-save')));
    await tester.pumpAndSettle();

    // Nothing is written at all: the roll and the correction go together, so a
    // refused edit does not leave the marks saved and the note ambiguous.
    expect(sessionService.submitCalls, 0);
    expect(
      find.textContaining('cannot be left empty'),
      findsOneWidget,
    );
  });

  testWidgets('an empty feedback field asks only for the bundled serif',
      (tester) async {
    // `Newsreader-Italic` is the one serif the app carries, and `main.dart`
    // turns off runtime fetching. An empty field used to ask for the upright
    // variant, which google_fonts could not load: marking a student here
    // printed a font error and dropped the field back to the default face.
    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await _pumpRoll(
      tester,
      classInfo: _class(),
      timetable: _FakeTimetableController(
        attendanceByClass: {'c1': _attendance()},
      ),
      sessionService: _FakeTutorSessionService(),
    );

    await tester.tap(find.byKey(const Key('roll-here-s1')));
    await tester.pumpAndSettle();

    final field = tester.widget<TextField>(
      find.byKey(const Key('roll-feedback-s1')),
    );
    expect(field.controller?.text, isEmpty);
    expect(field.style?.fontStyle, FontStyle.italic);
  });

  testWidgets('the sent notice and its field fit a narrow phone',
      (tester) async {
    // The notice sits on one line above the field; at 320px with large text it
    // still has to fit the card.
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await _pumpRoll(
      tester,
      classInfo: _class(),
      timetable: _FakeTimetableController(
        attendanceByClass: {'c1': _attendance()},
      ),
      sessionService: _FakeTutorSessionService(
        sent: [_sentFeedback(body: 'Great work today.')],
      ),
      textScale: 1.3,
    );

    await tester.tap(find.byKey(const Key('roll-here-s1')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('roll-feedback-sent-notice')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('marking a student away leaves their sent note alone',
      (tester) async {
    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final sessionService = _FakeTutorSessionService(
      sent: [_sentFeedback(body: 'Great work today.')],
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

    // Marking someone away after the fact does not retract what the family was
    // already told, and must not read as the tutor emptying the note.
    expect(sessionService.lastEdits, isEmpty);
    expect(sessionService.lastFeedback, isEmpty);
  });
}

Future<void> _pumpRoll(
  WidgetTester tester, {
  required ClassModel classInfo,
  required _FakeTimetableController timetable,
  required _FakeTutorSessionService sessionService,
  double textScale = 1,
}) async {
  final roll = ClassRollScreen(
    classInfo: classInfo,
    attendanceDocId: 'T3_W2',
    sessionService: sessionService,
  );

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
        home: textScale == 1
            ? roll
            : MediaQuery(
                data: MediaQueryData(
                  textScaler: TextScaler.linear(textScale),
                ),
                child: roll,
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
  _FakeTutorSessionService({
    bool pending = false,
    this.submitError,
    this.sent = const [],
  }) : submitGate = pending ? Completer<void>() : null;

  final Completer<void>? submitGate;
  final Object? submitError;

  /// Feedback already written against this session when the screen loads.
  final List<StudentFeedback> sent;

  int submitCalls = 0;
  List<StudentFeedback> lastFeedback = const [];
  List<StudentFeedback> lastEdits = const [];

  @override
  Future<List<StudentFeedback>> feedbackForSession({
    required String classId,
    required String sessionId,
  }) async =>
      sent;

  @override
  Future<void> submitSession({
    required String classId,
    required String sessionId,
    required Map<String, RollMark> marks,
    required List<StudentFeedback> feedback,
    required bool markRollComplete,
    required String completedBy,
    List<StudentFeedback> edits = const [],
  }) async {
    submitCalls++;
    lastFeedback = feedback;
    lastEdits = edits;
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

/// Feedback already written against this session, as storage would return it.
StudentFeedback _sentFeedback({required String body}) => StudentFeedback(
      id: 'T3_W2_s1',
      studentId: 's1',
      tutorId: 't1',
      parentIds: const ['p1'],
      feedback: body,
      subject: 'Years 5–10',
      createdAt: DateTime.now(),
      isUnread: true,
      classId: 'c1',
      sessionId: 'T3_W2',
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
