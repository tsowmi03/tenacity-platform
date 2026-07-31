import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/invoice_draft_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/admin_create_invoice_screen.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

class _FakeAuthController extends ChangeNotifier implements AuthController {
  int parentLoads = 0;
  int studentLoads = 0;

  @override
  Future<List<AppUser>> fetchAllParents() async {
    parentLoads++;
    return [_parent()];
  }

  @override
  Future<List<Student>> fetchStudentsForParent(String parentId) async {
    studentLoads++;
    return [_student()];
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeInvoiceController extends ChangeNotifier
    implements InvoiceController {
  int buildCalls = 0;
  int createCalls = 0;
  List<Student>? students;
  List<int>? sessions;
  int? weeks;
  Completer<void>? buildGate;

  @override
  Future<InvoiceDraft> buildInvoiceDraft({
    required String parentId,
    required String parentName,
    required String parentEmail,
    required List<Student> students,
    required List<int> sessionsPerStudent,
    required int weeks,
    required DateTime dueDate,
    int tokensUsed = 0,
    bool isOneOff = false,
  }) async {
    buildCalls++;
    this.students = students;
    sessions = sessionsPerStudent;
    this.weeks = weeks;
    await buildGate?.future;
    return InvoiceDraft(
      parentId: parentId,
      parentName: parentName,
      parentEmail: parentEmail,
      lineItems: [
        {
          'studentName': 'Ella Parent',
          'description': 'Ella Parent (session 1)',
          'quantity': weeks,
          'unitAmount': 60.0,
          'lineTotal': weeks * 60.0,
        },
      ],
      weeks: weeks,
      dueDate: dueDate,
      computedTotal: weeks * 60.0,
      studentIds: students.map((student) => student.id).toList(),
      createdByAdminId: 'admin-1',
    );
  }

  @override
  Future<String> createInvoiceFromDraft(
    InvoiceDraft draft, {
    String? stripePaymentIntentId,
  }) async {
    createCalls++;
    return 'invoice-1';
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

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('selects a parent and student then builds the review draft',
      (tester) async {
    final auth = _FakeAuthController();
    final invoices = _FakeInvoiceController();
    await _pumpCreate(
      tester,
      authController: auth,
      invoiceController: invoices,
    );

    expect(find.text('New invoice'), findsOneWidget);
    expect(find.text('Start typing to find a parent'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('admin-create-invoice-parent-search')),
      'Pat',
    );
    await tester.pump();
    await tester.tap(
      find.byKey(const Key('admin-create-invoice-parent-parent-1')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Pat Parent'), findsOneWidget);
    expect(find.text('Ella Parent'), findsOneWidget);

    await tester.tap(find.text('Ella Parent'));
    await tester.pump();
    expect(
      find.byKey(const Key('admin-create-invoice-sessions-student-1')),
      findsOneWidget,
    );

    await tester.enterText(
      find.byKey(const Key('admin-create-invoice-weeks')),
      '3',
    );
    await tester.tap(
      find.byKey(const Key('admin-create-invoice-review')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Review invoice'), findsOneWidget);
    expect(invoices.buildCalls, 1);
    expect(invoices.students?.map((student) => student.id), ['student-1']);
    expect(invoices.sessions, [1]);
    expect(invoices.weeks, 3);
  });

  testWidgets('invalid billing values stop before draft construction',
      (tester) async {
    final invoices = _FakeInvoiceController();
    await _pumpCreate(
      tester,
      authController: _FakeAuthController(),
      invoiceController: invoices,
    );

    await tester.tap(
      find.byKey(const Key('admin-create-invoice-review')),
    );
    await tester.pump();
    expect(find.text('Please select a parent.'), findsOneWidget);
    expect(invoices.buildCalls, 0);
  });

  testWidgets('empty weeks are rejected instead of becoming one week',
      (tester) async {
    final invoices = _FakeInvoiceController();
    await _pumpCreate(
      tester,
      authController: _FakeAuthController(),
      invoiceController: invoices,
    );
    await _selectParentAndStudent(tester);

    await tester.enterText(
      find.byKey(const Key('admin-create-invoice-weeks')),
      '',
    );
    await tester.tap(find.byKey(const Key('admin-create-invoice-review')));
    await tester.pump();

    expect(find.text('Please enter a valid number of weeks.'), findsOneWidget);
    expect(invoices.buildCalls, 0);
  });

  testWidgets('non-numeric session count is rejected', (tester) async {
    final invoices = _FakeInvoiceController();
    await _pumpCreate(
      tester,
      authController: _FakeAuthController(),
      invoiceController: invoices,
    );
    await _selectParentAndStudent(tester);

    await tester.enterText(
      find.byKey(const Key('admin-create-invoice-sessions-student-1')),
      'not a number',
    );
    await tester.tap(find.byKey(const Key('admin-create-invoice-review')));
    await tester.pump();

    expect(
      find.text('Please enter a valid session count for Ella.'),
      findsOneWidget,
    );
    expect(invoices.buildCalls, 0);
  });

  testWidgets('due date uses the V3 sheet and applies or cancels explicitly',
      (tester) async {
    await _pumpCreate(
      tester,
      authController: _FakeAuthController(),
      invoiceController: _FakeInvoiceController(),
    );

    final dueDate = find.byKey(const Key('admin-create-invoice-due-date'));
    await tester.dragUntilVisible(
      dueDate,
      find.byKey(const Key('admin-create-invoice-scroll')),
      const Offset(0, -160),
    );
    await tester.tap(dueDate);
    await tester.pumpAndSettle();

    expect(find.text('Choose due date'), findsOneWidget);
    expect(find.byType(CalendarDatePicker), findsOneWidget);
    expect(find.byType(DatePickerDialog), findsNothing);

    final picker = tester.widget<CalendarDatePicker>(
      find.byKey(const Key('admin-create-invoice-date-calendar')),
    );
    expect(picker.lastDate.difference(picker.firstDate).inDays, 1460);
    final applied = picker.initialDate!.add(const Duration(days: 2));
    picker.onDateChanged(applied);
    await tester.pump();
    await tester.tap(find.byKey(const Key('sheet-confirm')));
    await tester.pumpAndSettle();

    final appliedLabel = DateFormat('d MMM yyyy').format(applied);
    expect(find.text(appliedLabel), findsOneWidget);

    await tester.tap(dueDate);
    await tester.pumpAndSettle();
    final reopened = tester.widget<CalendarDatePicker>(
      find.byKey(const Key('admin-create-invoice-date-calendar')),
    );
    reopened.onDateChanged(applied.add(const Duration(days: 4)));
    await tester.pump();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    expect(find.text(appliedLabel), findsOneWidget);
  });

  testWidgets('successful finalisation closes the whole wizard',
      (tester) async {
    final auth = _FakeAuthController();
    final invoices = _FakeInvoiceController();
    await _pumpRoutedCreate(
      tester,
      authController: auth,
      invoiceController: invoices,
    );

    await tester.enterText(
      find.byKey(const Key('admin-create-invoice-parent-search')),
      'Pat',
    );
    await tester.pump();
    await tester.tap(
      find.byKey(const Key('admin-create-invoice-parent-parent-1')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ella Parent'));
    await tester.pump();
    await tester.tap(
      find.byKey(const Key('admin-create-invoice-review')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const Key('admin-review-invoice-create')),
    );
    await tester.pumpAndSettle();

    expect(invoices.createCalls, 1);
    expect(find.text('Open create wizard'), findsOneWidget);
    expect(find.text('New invoice'), findsNothing);
    expect(find.text('Review invoice'), findsNothing);
  });

  testWidgets('draft preparation blocks header and system back',
      (tester) async {
    final invoices = _FakeInvoiceController()..buildGate = Completer<void>();
    await _pumpRoutedCreate(
      tester,
      authController: _FakeAuthController(),
      invoiceController: invoices,
    );
    await _selectParentAndStudent(tester);

    await tester.tap(find.byKey(const Key('admin-create-invoice-review')));
    await tester.pump();

    expect(invoices.buildCalls, 1);
    expect(
      tester.widget<IconButton>(find.byKey(const Key('detail-back'))).onPressed,
      isNull,
    );
    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(find.text('New invoice'), findsOneWidget);

    invoices.buildGate!.complete();
    await tester.pumpAndSettle();
    expect(find.text('Review invoice'), findsOneWidget);
  });

  testWidgets('create form fits the narrow large-text layout', (tester) async {
    await _pumpCreate(
      tester,
      authController: _FakeAuthController(),
      invoiceController: _FakeInvoiceController(),
      size: const Size(320, 700),
      textScale: 1.3,
    );

    expect(find.text('New invoice'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

Future<void> _selectParentAndStudent(WidgetTester tester) async {
  await tester.enterText(
    find.byKey(const Key('admin-create-invoice-parent-search')),
    'Pat',
  );
  await tester.pump();
  await tester.tap(
    find.byKey(const Key('admin-create-invoice-parent-parent-1')),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text('Ella Parent'));
  await tester.pump();
}

Future<void> _pumpCreate(
  WidgetTester tester, {
  required _FakeAuthController authController,
  required _FakeInvoiceController invoiceController,
  Size size = const Size(402, 874),
  double textScale = 1,
}) async {
  await _setViewport(tester, size);
  await tester.pumpWidget(
    _providers(
      authController: authController,
      invoiceController: invoiceController,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(textScale),
          ),
          child: child!,
        ),
        home: const AdminCreateInvoiceScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _pumpRoutedCreate(
  WidgetTester tester, {
  required _FakeAuthController authController,
  required _FakeInvoiceController invoiceController,
}) async {
  await _setViewport(tester, const Size(402, 874));
  await tester.pumpWidget(
    _providers(
      authController: authController,
      invoiceController: invoiceController,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: FilledButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const AdminCreateInvoiceScreen(),
                  ),
                ),
                child: const Text('Open create wizard'),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  await tester.tap(find.text('Open create wizard'));
  await tester.pumpAndSettle();
}

Widget _providers({
  required _FakeAuthController authController,
  required _FakeInvoiceController invoiceController,
  required Widget child,
}) {
  return MultiProvider(
    providers: [
      ChangeNotifierProvider<AuthController>.value(value: authController),
      ChangeNotifierProvider<InvoiceController>.value(
        value: invoiceController,
      ),
      ChangeNotifierProvider<ConnectivityController>.value(
        value: _FakeConnectivityController(),
      ),
    ],
    child: child,
  );
}

Future<void> _setViewport(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Parent _parent() => Parent(
      uid: 'parent-1',
      firstName: 'Pat',
      lastName: 'Parent',
      email: 'pat@example.com',
      fcmTokens: const [],
      students: const ['student-1'],
      phone: '0400 000 000',
      unreadChats: const {},
      activeChats: const [],
    );

Student _student() => Student(
      id: 'student-1',
      firstName: 'Ella',
      lastName: 'Parent',
      parents: const ['parent-1'],
      grade: 'Year 6',
      subjects: const ['English'],
      primaryParentId: 'parent-1',
    );
