import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/announcement_controller.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/feedback_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/models/announcement_model.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/ui/dashboard/parent/parent_dashboard.dart';
import 'package:tenacity/src/ui/dashboard/tutor/tutor_dashboard.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

class _NotifyingAnnouncementsController extends ChangeNotifier
    implements AnnouncementsController {
  final _loadGate = Completer<void>();
  int loadCalls = 0;

  @override
  List<Announcement> get announcements => const [];

  @override
  Future<void> loadAnnouncements({
    required bool onlyActive,
    List<String>? audienceFilter,
    bool forceReload = false,
  }) {
    loadCalls++;

    // This mirrors the real controller's immediate loading notification. If a
    // dashboard starts the request from its build lifecycle, Provider throws.
    notifyListeners();
    return _loadGate.future;
  }

  void completeLoad() {
    if (!_loadGate.isCompleted) _loadGate.complete();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeChatController extends ChangeNotifier implements ChatController {
  @override
  Future<int> getUnreadCount() async => 0;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeTimetableController extends ChangeNotifier
    implements TimetableController {
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
  Future<void> loadActiveTerm({bool silent = false}) async {}

  @override
  Future<void> loadAllClasses({bool silent = false}) async {}

  @override
  Future<void> loadAttendanceForWeek({bool silent = false}) async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeAuthController extends ChangeNotifier implements AuthController {
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

class _FakeInvoiceController extends ChangeNotifier
    implements InvoiceController {
  @override
  Future<List<Invoice>> fetchInvoicesForParent(String parentId) async =>
      const [];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeFeedbackController extends ChangeNotifier
    implements FeedbackController {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Future<void> _pumpDashboard(
  WidgetTester tester, {
  required Widget dashboard,
  required _NotifyingAnnouncementsController announcements,
  bool includeParentDependencies = false,
}) async {
  tester.view.physicalSize = const Size(402, 874);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AnnouncementsController>.value(
          value: announcements,
        ),
        ChangeNotifierProvider<ChatController>.value(
          value: _FakeChatController(),
        ),
        ChangeNotifierProvider<TimetableController>.value(
          value: _FakeTimetableController(),
        ),
        if (includeParentDependencies) ...[
          ChangeNotifierProvider<AuthController>.value(
            value: _FakeAuthController(),
          ),
          ChangeNotifierProvider<InvoiceController>.value(
            value: _FakeInvoiceController(),
          ),
          ChangeNotifierProvider<FeedbackController>.value(
            value: _FakeFeedbackController(),
          ),
        ],
      ],
      child: MaterialApp(theme: AppTheme.light, home: dashboard),
    ),
  );
}

void main() {
  testWidgets(
      'tutor dashboard defers controller notifications until post-frame',
      (tester) async {
    final announcements = _NotifyingAnnouncementsController();
    addTearDown(announcements.completeLoad);

    await _pumpDashboard(
      tester,
      announcements: announcements,
      dashboard: TutorDashboard(
        tutorId: 'tutor-1',
        tutorName: 'Taylor',
        onNavigate: (_) {},
      ),
    );

    expect(tester.takeException(), isNull);
    expect(announcements.loadCalls, 1);

    announcements.completeLoad();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'parent dashboard defers controller notifications until post-frame',
      (tester) async {
    final announcements = _NotifyingAnnouncementsController();
    addTearDown(announcements.completeLoad);

    await _pumpDashboard(
      tester,
      announcements: announcements,
      includeParentDependencies: true,
      dashboard: ParentDashboard(
        parentId: 'parent-1',
        parentName: 'Pat',
        readAnnouncementIds: const [],
        onNavigate: (_) {},
      ),
    );

    expect(tester.takeException(), isNull);
    expect(announcements.loadCalls, 1);

    announcements.completeLoad();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
