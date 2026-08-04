import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
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

  @override
  Future<Set<String>> getEligibleSubjects(BuildContext context) async =>
      const {};

  @override
  Future<void> loadActiveTerm({bool silent = false}) async {
    notifyListeners();
  }

  @override
  Future<void> loadAllClasses({bool silent = false}) async {
    notifyListeners();
  }

  @override
  Future<void> loadAttendanceForWeek({bool silent = false}) async {
    notifyListeners();
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
}
