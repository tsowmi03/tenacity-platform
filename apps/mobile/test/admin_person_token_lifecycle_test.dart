import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/services/auth_service.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';
import 'package:tenacity/src/ui/users/admin/admin_person_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('a pending token write blocks a second edit', (tester) async {
    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final timetable = _FakeTimetableController();
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<TimetableController>.value(
            value: timetable,
          ),
          ChangeNotifierProvider<InvoiceController>.value(
            value: _FakeInvoiceController(),
          ),
          ChangeNotifierProvider<ConnectivityController>.value(
            value: _FakeConnectivityController(),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          home: AdminPersonScreen(
            user: _parent(),
            authService: _FakeAuthService(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Edit'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('admin-lesson-tokens-field')),
      '9',
    );
    await tester.tap(find.byKey(const Key('sheet-confirm')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();

    expect(timetable.setCalls, 1);
    expect(find.text('Edit'), findsNothing);
    expect(find.byType(AdminLessonTokensSheet), findsNothing);
    expect(
      tester.widget<IconButton>(find.byKey(const Key('detail-back'))).onPressed,
      isNull,
    );

    timetable.writeGate.complete();
    await tester.pumpAndSettle();

    expect(find.text('Edit'), findsOneWidget);
    expect(find.text('9'), findsOneWidget);
    expect(
      tester.widget<IconButton>(find.byKey(const Key('detail-back'))).onPressed,
      isNotNull,
    );
  });
}

class _FakeAuthService implements AuthService {
  @override
  Future<List<Student>> fetchStudentsForParent(String parentId) async =>
      const [];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeTimetableController extends ChangeNotifier
    implements TimetableController {
  final writeGate = Completer<void>();
  int setCalls = 0;

  @override
  List<ClassModel> get allClasses => const [];

  @override
  Future<void> setLessonTokens(String parentId, int count) async {
    setCalls++;
    await writeGate.future;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeInvoiceController extends ChangeNotifier
    implements InvoiceController {
  @override
  List<Invoice> get invoices => const [];

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

Parent _parent() => Parent(
      uid: 'p1',
      firstName: 'Pat',
      lastName: 'Parent',
      email: 'pat@example.com',
      fcmTokens: const [],
      students: const [],
      phone: '',
      unreadChats: const {},
      activeChats: const [],
      lessonTokens: 4,
    );
