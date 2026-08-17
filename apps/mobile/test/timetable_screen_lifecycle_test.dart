import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/models/admin_model.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';
import 'package:tenacity/src/ui/timetable_screen.dart';

class _NotifyingAuthController extends ChangeNotifier
    implements AuthController {
  final Parent _parent = Parent(
    uid: 'parent-1',
    firstName: 'Pat',
    lastName: 'Parent',
    email: 'pat@example.com',
    fcmTokens: const [],
    students: const [],
    phone: '',
    unreadChats: const {},
    activeChats: const [],
  );

  int refreshCalls = 0;

  @override
  Parent get currentUser => _parent;

  @override
  Future<void> refreshCurrentUser() async {
    refreshCalls++;

    // This mirrors the real controller's immediate loading notification. It
    // must happen after the Classes subtree has finished building.
    notifyListeners();
  }

  @override
  Future<List<Student>> fetchStudentsForParent(String parentId) async =>
      const [];

  @override
  Future<Map<String, String>> fetchTutorNamesByIds(
    List<String> tutorIds,
  ) async =>
      const {};

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// An admin, whose student read can be made to fail.
class _AdminAuthController extends ChangeNotifier implements AuthController {
  final Admin _admin = Admin(
    uid: 'admin-1',
    firstName: 'Alex',
    lastName: 'Admin',
    email: 'alex@example.com',
    fcmTokens: const [],
    phone: '',
    unreadChats: const {},
    activeChats: const [],
  );

  /// Makes [fetchAllStudents] throw, standing in for a transient Firestore
  /// error or a single malformed student document.
  bool studentsFail = false;

  @override
  Admin get currentUser => _admin;

  @override
  Future<void> refreshCurrentUser() async {}

  @override
  Future<Map<String, String>> fetchTutorNamesByIds(
    List<String> tutorIds,
  ) async =>
      const {'t1': 'Jordan Lee'};

  @override
  Future<List<Student>> fetchAllStudents() async {
    if (studentsFail) throw StateError('students unavailable');
    return const [];
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _NotifyingTimetableController extends ChangeNotifier
    implements TimetableController {
  @override
  bool isLoading = false;

  @override
  String? errorMessage;

  @override
  Term? activeTerm;

  @override
  List<ClassModel> allClasses = const [];

  @override
  Map<String, Attendance> attendanceByClass = const {};

  @override
  int currentWeek = 1;

  @override
  String? loadedAttendanceDocId;

  /// Held open so the browse screen's loading window can be observed.
  Completer<Set<String>>? eligibleGate;

  @override
  Future<Set<String>> getEligibleSubjects(BuildContext context) =>
      eligibleGate?.future ?? Future.value(const {});

  @override
  Future<bool> loadActiveTerm({bool silent = false}) async {
    notifyListeners();
    return true;
  }

  @override
  Future<bool> loadAllClasses({bool silent = false}) async {
    notifyListeners();
    return true;
  }

  @override
  Future<bool> loadAttendanceForWeek({bool silent = false}) async {
    notifyListeners();
    return true;
  }

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
  void clearError() {
    errorMessage = null;
    notifyListeners();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _ClassesTransitionHost extends StatefulWidget {
  const _ClassesTransitionHost();

  @override
  State<_ClassesTransitionHost> createState() => _ClassesTransitionHostState();
}

class _ClassesTransitionHostState extends State<_ClassesTransitionHost> {
  bool _showClasses = false;

  @override
  Widget build(BuildContext context) {
    if (_showClasses) {
      return const KeyedSubtree(
        key: Key('classes-subtree'),
        child: TimetableScreen(),
      );
    }

    return Scaffold(
      body: Center(
        child: FilledButton(
          key: const Key('open-classes'),
          onPressed: () => setState(() => _showClasses = true),
          child: const Text('Classes'),
        ),
      ),
    );
  }
}

void main() {
  testWidgets('switching to Classes defers AuthController notifications',
      (tester) async {
    final authController = _NotifyingAuthController();
    final timetableController = _NotifyingTimetableController();
    addTearDown(authController.dispose);
    addTearDown(timetableController.dispose);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthController>.value(value: authController),
          ChangeNotifierProvider<TimetableController>.value(
            value: timetableController,
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          home: const _ClassesTransitionHost(),
        ),
      ),
    );

    await tester.tap(find.byKey(const Key('open-classes')));
    await tester.pump();

    expect(find.byKey(const Key('classes-subtree')), findsOneWidget);
    expect(authController.refreshCalls, 1);
    expect(tester.takeException(), isNull);

    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('shows a skeleton, not a spinner, before the term arrives',
      (tester) async {
    final authController = _NotifyingAuthController();
    final timetableController = _NotifyingTimetableController()
      ..isLoading = true;
    addTearDown(authController.dispose);
    addTearDown(timetableController.dispose);

    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthController>.value(value: authController),
          ChangeNotifierProvider<TimetableController>.value(
            value: timetableController,
          ),
        ],
        child: const MaterialApp(home: TimetableScreen()),
      ),
    );
    await tester.pump();

    expect(find.byKey(const Key('timetable-loading')), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);

    // An active term is what the screen blocks on.
    timetableController
      ..isLoading = false
      ..activeTerm = Term(
        id: 'term-1',
        year: '2026',
        termNumber: 3,
        startDate: DateTime(2026, 7, 20),
        endDate: DateTime(2026, 9, 25),
        totalWeeks: 10,
        isActive: true,
      );
    timetableController.notifyListeners();
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('timetable-loading')), findsNothing);
  });

  testWidgets('a failed student read still leaves the admin rows their tutor',
      (tester) async {
    // The roster and the tutor names are separately best-effort. Sharing one
    // try meant a failed student read discarded tutor names that had already
    // arrived, blanking the tutor on every row.
    final authController = _AdminAuthController()..studentsFail = true;
    final timetableController = _NotifyingTimetableController()
      ..activeTerm = Term(
        id: 'term-1',
        year: '2026',
        termNumber: 3,
        // Week 1 runs Mon 20 – Sun 26 Jul 2026, which is behind us, so the
        // timetable opens on the Monday rather than on today.
        startDate: DateTime(2026, 7, 20),
        endDate: DateTime(2026, 9, 25),
        totalWeeks: 10,
        isActive: true,
      )
      ..allClasses = [
        ClassModel(
          id: 'c1',
          type: '5-10',
          dayOfWeek: 'Monday',
          startTime: '16:00',
          endTime: '17:00',
          capacity: 8,
          enrolledStudents: const [],
          tutors: const ['t1'],
        ),
      ];
    addTearDown(authController.dispose);
    addTearDown(timetableController.dispose);

    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthController>.value(value: authController),
          ChangeNotifierProvider<TimetableController>.value(
            value: timetableController,
          ),
        ],
        child: const MaterialApp(home: TimetableScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.textContaining('Jordan Lee'), findsOneWidget);
  });

  testWidgets('browse waits on eligible subjects behind a skeleton',
      (tester) async {
    final eligibleGate = Completer<Set<String>>();
    final authController = _NotifyingAuthController();
    final timetableController = _NotifyingTimetableController()
      ..eligibleGate = eligibleGate
      ..activeTerm = Term(
        id: 'term-1',
        year: '2026',
        termNumber: 3,
        startDate: DateTime(2026, 7, 20),
        endDate: DateTime(2026, 9, 25),
        totalWeeks: 10,
        isActive: true,
      );
    addTearDown(authController.dispose);
    addTearDown(timetableController.dispose);

    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthController>.value(value: authController),
          ChangeNotifierProvider<TimetableController>.value(
            value: timetableController,
          ),
        ],
        child: const MaterialApp(home: TimetableScreen(browseOnly: true)),
      ),
    );
    await tester.pump();

    expect(find.byKey(const Key('parent-browse-loading')), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);

    eligibleGate.complete(const {'Maths'});
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('parent-browse-loading')), findsNothing);
  });
}
