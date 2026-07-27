import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/tutor_model.dart';
import 'package:tenacity/src/ui/profile/profile_view.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

Parent _parent({int tokens = 4}) => Parent(
      uid: 'parent-1',
      firstName: 'Pat',
      lastName: 'Parent',
      email: 'pat@example.com',
      fcmTokens: const [],
      students: const ['student-1'],
      phone: '0400 000 000',
      unreadChats: const {},
      activeChats: const [],
      lessonTokens: tokens,
    );

Tutor _tutor() => Tutor(
      uid: 'tutor-1',
      role: 'tutor',
      firstName: 'Terry',
      lastName: 'Tutor',
      email: 'terry@example.com',
      fcmTokens: const [],
      phone: '',
      unreadChats: const {},
      activeChats: const [],
    );

Student _student() => Student(
      id: 'student-1',
      firstName: 'Ella',
      lastName: 'Parent',
      parents: const ['parent-1'],
      grade: 'Year 9',
      subjects: const ['advmath11'],
    );

Future<void> _pumpProfile(
  WidgetTester tester, {
  bool tutor = false,
  List<Student>? students,
  bool loading = false,
  String? error,
  Size size = const Size(402, 874),
  double textScale = 1,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
        child: ProfileView(
          user: tutor ? _tutor() : _parent(),
          children: students ?? [_student()],
          isLoading: loading,
          isSigningOut: false,
          loadError: error,
          loadClasses: (_) async => const [
            ClassModel(
              id: 'class-1',
              type: 'Maths',
              dayOfWeek: 'Tuesday',
              startTime: '16:30',
              endTime: '17:30',
              capacity: 8,
              enrolledStudents: [],
              tutors: [],
            ),
          ],
          onBack: () {},
          onOpenSettings: () {},
          onEnrolStudent: () {},
          onSignOut: () {},
          onRetry: () {},
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets('parent sees tokens, students, classes and enrolment action',
      (tester) async {
    await _pumpProfile(tester);

    expect(find.text('Pat Parent'), findsOneWidget);
    expect(find.text('pat@example.com'), findsOneWidget);
    expect(find.byKey(const Key('profile-tokens')), findsOneWidget);
    expect(find.text('4'), findsOneWidget);
    expect(find.text('Ella Parent'), findsOneWidget);
    expect(find.byKey(const Key('profile-enrol-student')), findsOneWidget);

    await tester.tap(find.text('Ella Parent'));
    await tester.pumpAndSettle();
    expect(find.text('Year 11 Advanced Maths'), findsOneWidget);
    expect(find.text('Maths · Tuesday 4:30 pm'), findsOneWidget);
  });

  testWidgets('parent with no linked students can still enrol one',
      (tester) async {
    await _pumpProfile(tester, students: const []);

    expect(
      find.text('No students are linked to this account yet.'),
      findsOneWidget,
    );
    expect(find.byKey(const Key('profile-enrol-student')), findsOneWidget);
  });

  testWidgets('non-parent profile omits parent-only data', (tester) async {
    await _pumpProfile(tester, tutor: true, students: const []);

    expect(find.text('Terry Tutor'), findsOneWidget);
    expect(find.byKey(const Key('profile-tokens')), findsNothing);
    expect(find.byKey(const Key('profile-enrol-student')), findsNothing);
    expect(find.byKey(const Key('profile-sign-out')), findsOneWidget);
  });

  testWidgets('renders retryable load failure', (tester) async {
    await _pumpProfile(
      tester,
      error: 'Your profile could not be loaded.',
    );

    expect(find.text('Profile unavailable'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('fits narrow and large-text layouts', (tester) async {
    await _pumpProfile(
      tester,
      size: const Size(320, 640),
      textScale: 1.3,
    );

    expect(tester.takeException(), isNull);
  });
}
