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
import 'package:tenacity/src/ui/timetable/parent/booking_sheets.dart';
import 'package:tenacity/src/ui/timetable_screen.dart';

/// The parent booking flow as a family meets it, from the class tile inward.
///
/// These drive the real screen rather than the sheets on their own, because
/// what is being checked is which steps the flow asks for — a question that
/// only exists between the sheets.

final _termStart = DateTime(2026, 8, 24);

Term _term() => Term(
      id: '2026_T3',
      year: '2026',
      termNumber: 3,
      startDate: _termStart,
      endDate: _termStart.add(const Duration(days: 7 * 10)),
      totalWeeks: 10,
      isActive: true,
    );

ClassModel _class({
  required String id,
  required String day,
  String startTime = '16:00',
  List<String> enrolledStudents = const [],
}) {
  return ClassModel(
    id: id,
    type: 'stdmath11',
    dayOfWeek: day,
    startTime: startTime,
    endTime: '17:00',
    capacity: 6,
    minimumStudentsToOpen: 2,
    enrolledStudents: enrolledStudents,
    tutors: const ['tutor-1'],
  );
}

Attendance _attendance({
  required String classId,
  required List<String> attending,
  required int week,
}) {
  return Attendance(
    id: '2026_T3_W$week',
    date: _termStart.add(Duration(days: 7 * (week - 1))),
    termId: '2026_T3',
    cancelled: false,
    updatedAt: _termStart,
    updatedBy: 'system',
    weekNumber: week,
    attendance: attending,
    tutors: const ['tutor-1'],
  );
}

Student _student(String id, String firstName) => Student(
      id: id,
      firstName: firstName,
      lastName: 'Example',
      parents: const ['parent-1'],
      grade: '11',
      subjects: const ['maths'],
    );

class _FakeAuthController extends ChangeNotifier implements AuthController {
  _FakeAuthController(this.students);

  final List<Student> students;

  @override
  Parent get currentUser => Parent(
        uid: 'parent-1',
        firstName: 'Pat',
        lastName: 'Parent',
        email: 'pat@example.com',
        fcmTokens: const [],
        students: [for (final student in students) student.id],
        phone: '',
        unreadChats: const {},
        activeChats: const [],
        lessonTokens: 0,
      );

  @override
  Future<void> refreshCurrentUser() async {}

  @override
  Future<List<Student>> fetchStudentsForParent(String parentId) async =>
      students;

  @override
  Future<Student?> fetchStudentData(String studentId) async =>
      students.where((student) => student.id == studentId).firstOrNull;

  @override
  Future<Map<String, String>> fetchTutorNamesByIds(
    List<String> tutorIds,
  ) async =>
      const {'tutor-1': 'Tara Tutor'};

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeTimetableController extends ChangeNotifier
    implements TimetableController {
  _FakeTimetableController({
    required this.allClasses,
    required this.attendanceByClass,
  });

  @override
  bool isLoading = false;

  @override
  String? errorMessage;

  @override
  Term? activeTerm = _term();

  @override
  List<ClassModel> allClasses;

  @override
  Map<String, Attendance> attendanceByClass;

  @override
  int currentWeek = 2;

  @override
  String? loadedAttendanceDocId = '2026_T3_W2';

  @override
  Future<bool> loadActiveTerm({bool silent = false}) async => true;

  @override
  Future<bool> loadAllClasses({bool silent = false}) async => true;

  @override
  Future<bool> loadAttendanceForWeek({bool silent = false}) async => true;

  @override
  Future<Set<String>> getEligibleSubjects(BuildContext context) async =>
      const {};

  @override
  DateTime? takeRequestedAdminDate() => null;

  @override
  void clearError() {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Future<void> _pumpTimetable(
  WidgetTester tester, {
  required List<Student> students,
  required List<String> enrolledInMonday,
}) async {
  tester.view.physicalSize = const Size(402, 874);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final auth = _FakeAuthController(students);
  final timetable = _FakeTimetableController(
    allClasses: [
      _class(id: 'monday', day: 'Monday', enrolledStudents: enrolledInMonday),
      _class(id: 'thursday', day: 'Thursday'),
    ],
    attendanceByClass: {
      'monday': _attendance(
        classId: 'monday',
        attending: enrolledInMonday,
        week: 2,
      ),
      'thursday': _attendance(
        classId: 'thursday',
        attending: const [],
        week: 2,
      ),
    },
  );
  addTearDown(auth.dispose);
  addTearDown(timetable.dispose);

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthController>.value(value: auth),
        ChangeNotifierProvider<TimetableController>.value(value: timetable),
      ],
      child: MaterialApp(
        theme: AppTheme.light,
        home: const TimetableScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a swap for an only child does not ask which child it is for',
      (tester) async {
    // "Who is this for?" over a list of one is a question with a single
    // answer, and that answer was on the tile the family just tapped.
    await _pumpTimetable(
      tester,
      students: [_student('sam', 'Sam')],
      enrolledInMonday: const ['sam'],
    );

    await tester.tap(find.text('Year 11 Standard Maths'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Swap permanently'));
    await tester.pumpAndSettle();

    expect(find.text('Who is this for?'), findsNothing);
    expect(find.text('Move to'), findsOneWidget);
  });

  testWidgets('a swap still asks when there is more than one child',
      (tester) async {
    await _pumpTimetable(
      tester,
      students: [_student('sam', 'Sam'), _student('sana', 'Sana')],
      enrolledInMonday: const ['sam', 'sana'],
    );

    await tester.tap(find.text('Year 11 Standard Maths'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Swap permanently'));
    await tester.pumpAndSettle();

    expect(find.text('Who is this for?'), findsOneWidget);
    // Scoped to the sheet: both names also appear in the header's child
    // filter, so a bare text finder proves nothing about the picker.
    final inSheet = find.descendant(
      of: find.byType(BookingChildSelectionSheet),
      matching: find.text('Sam'),
    );
    expect(inSheet, findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(BookingChildSelectionSheet),
        matching: find.text('Sana'),
      ),
      findsOneWidget,
    );
  });
}
