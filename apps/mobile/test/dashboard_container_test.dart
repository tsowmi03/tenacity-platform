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
import 'package:tenacity/src/ui/dashboard/admin/admin_dashboard.dart';
import 'package:tenacity/src/ui/dashboard/parent/parent_dashboard.dart';
import 'package:tenacity/src/ui/dashboard/parent/parent_dashboard_view.dart';
import 'package:tenacity/src/ui/dashboard/tutor/tutor_dashboard.dart';
import 'package:tenacity/src/ui/tab_visibility.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';
import 'package:tenacity/src/utils/refresh_throttle.dart';

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

/// Loads cleanly by default, and can be told to hang or fail on the next call
/// so a background refresh can be observed mid-flight.
class _ReloadableAnnouncementsController
    extends _NotifyingAnnouncementsController {
  Completer<void>? _held;
  bool _failNext = false;

  void holdNextLoad() => _held = Completer<void>();

  void releaseHeldLoad() {
    _held?.complete();
    _held = null;
  }

  void failNextLoad() => _failNext = true;

  @override
  Future<void> loadAnnouncements({
    required bool onlyActive,
    List<String>? audienceFilter,
    bool forceReload = false,
  }) {
    loadCalls++;
    notifyListeners();

    if (_failNext) {
      _failNext = false;
      return Future.error(StateError('announcements unavailable'));
    }

    final held = _held;
    if (held != null) return held.future;

    return Future.value();
  }
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

  /// Held open or failed on demand, so a dashboard reload can be caught
  /// mid-flight or made to fail. The timetable is the one read the dashboards
  /// do not wrap in a fallback, so it is what actually fails a whole load.
  Completer<void>? _held;
  bool _failNext = false;

  void holdNextLoad() => _held = Completer<void>();

  void releaseHeldLoad() {
    _held?.complete();
    _held = null;
  }

  void failNextLoad() => _failNext = true;

  Future<void> _gate() {
    if (_failNext) {
      _failNext = false;
      return Future.error(StateError('timetable unavailable'));
    }
    final held = _held;
    if (held != null) {
      _held = null;
      return held.future;
    }
    return Future.value();
  }

  @override
  Future<void> loadActiveTerm({bool silent = false}) => _gate();

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
  // Shared across pumps so re-pumping does not swap the providers underneath
  // a dashboard whose State is meant to survive.
  ChatController? chatController,
  TimetableController? timetableController,
  AuthController? authController,
  InvoiceController? invoiceController,
  FeedbackController? feedbackController,
  bool isVisible = true,
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
          value: chatController ?? _FakeChatController(),
        ),
        ChangeNotifierProvider<TimetableController>.value(
          value: timetableController ?? _FakeTimetableController(),
        ),
        if (includeParentDependencies) ...[
          ChangeNotifierProvider<AuthController>.value(
            value: authController ?? _FakeAuthController(),
          ),
          ChangeNotifierProvider<InvoiceController>.value(
            value: invoiceController ?? _FakeInvoiceController(),
          ),
          ChangeNotifierProvider<FeedbackController>.value(
            value: feedbackController ?? _FakeFeedbackController(),
          ),
        ],
      ],
      child: MaterialApp(
        theme: AppTheme.light,
        home: TabVisibility(isVisible: isVisible, child: dashboard),
      ),
    ),
  );
}

void main() {
  group('loading state', () {
    testWidgets('the tutor dashboard shows a skeleton, not a spinner',
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

      expect(find.byKey(const Key('tutor-dashboard-loading')), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);

      announcements.completeLoad();
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('tutor-dashboard-loading')), findsNothing);
    });

    testWidgets('the parent dashboard shows a skeleton, not a spinner',
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

      expect(find.byKey(const Key('parent-dashboard-loading')), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);

      announcements.completeLoad();
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('parent-dashboard-loading')), findsNothing);
    });

    testWidgets('the admin dashboard shows a skeleton, not a spinner',
        (tester) async {
      final announcements = _NotifyingAnnouncementsController();
      addTearDown(announcements.completeLoad);

      await _pumpDashboard(
        tester,
        announcements: announcements,
        // The admin dashboard reads the same three controllers the parent one
        // does, so it needs the parent provider set too.
        includeParentDependencies: true,
        dashboard: AdminDashboard(
          adminId: 'admin-1',
          adminName: 'Alex',
          onNavigate: (_) {},
        ),
      );

      expect(find.byKey(const Key('admin-dashboard-loading')), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);

      announcements.completeLoad();
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('admin-dashboard-loading')), findsNothing);
    });
  });

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

  group('returning to the Home tab', () {
    /// Pumps the parent dashboard behind a togglable [TabVisibility], holding
    /// every provider steady so only the visibility changes between pumps.
    Future<Future<void> Function({required bool isVisible})> pumpTogglable(
      WidgetTester tester,
      _ReloadableAnnouncementsController announcements,
      _FakeTimetableController timetable,
    ) async {
      final chat = _FakeChatController();
      final auth = _FakeAuthController();
      final invoice = _FakeInvoiceController();
      final feedback = _FakeFeedbackController();

      Future<void> pump({required bool isVisible}) => _pumpDashboard(
            tester,
            announcements: announcements,
            includeParentDependencies: true,
            chatController: chat,
            timetableController: timetable,
            authController: auth,
            invoiceController: invoice,
            feedbackController: feedback,
            isVisible: isVisible,
            dashboard: ParentDashboard(
              parentId: 'parent-1',
              parentName: 'Pat',
              readAnnouncementIds: const [],
              onNavigate: (_) {},
              // Zero interval so a return within the test refreshes rather
              // than being throttled out.
              refreshThrottle: RefreshThrottle(minInterval: Duration.zero),
            ),
          );

      await pump(isVisible: true);
      await tester.pumpAndSettle();
      return ({required bool isVisible}) => pump(isVisible: isVisible);
    }

    testWidgets('keeps its content while the refresh is in flight',
        (tester) async {
      final announcements = _ReloadableAnnouncementsController();
      final timetable = _FakeTimetableController();
      final pump = await pumpTogglable(tester, announcements, timetable);

      expect(find.byType(ParentDashboardView), findsOneWidget);
      expect(announcements.loadCalls, 1);

      // Away, then back — with the reload held open.
      timetable.holdNextLoad();
      await pump(isVisible: false);
      await pump(isVisible: true);
      await tester.pump();

      expect(announcements.loadCalls, 2);
      // Still showing the previous load rather than dropping to a spinner.
      // FutureBuilder carries its data across a future swap, so what this
      // guards is that the dashboard is no longer torn down and rebuilt —
      // the failure case below is what exercises `_lastData` itself.
      expect(find.byType(ParentDashboardView), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);

      timetable.releaseHeldLoad();
      await tester.pumpAndSettle();
      expect(find.byType(ParentDashboardView), findsOneWidget);
    });

    testWidgets('survives a refresh that fails', (tester) async {
      final announcements = _ReloadableAnnouncementsController();
      final timetable = _FakeTimetableController();
      final pump = await pumpTogglable(tester, announcements, timetable);

      expect(find.byType(ParentDashboardView), findsOneWidget);

      // A failed refresh must not replace a working dashboard with the
      // "Dashboard unavailable" screen — what is on screen is still valid.
      // The timetable read is the one the dashboard does not wrap in a
      // fallback, so failing it fails the whole load.
      timetable.failNextLoad();
      await pump(isVisible: false);
      await pump(isVisible: true);
      await tester.pumpAndSettle();

      expect(announcements.loadCalls, 2);
      expect(find.byType(ParentDashboardView), findsOneWidget);
      expect(find.text('Dashboard unavailable'), findsNothing);
    });

    testWidgets('shows the error screen when the very first load fails',
        (tester) async {
      // The counterpart to the test above: with nothing to fall back to, the
      // failure does have to surface.
      final announcements = _ReloadableAnnouncementsController();
      final timetable = _FakeTimetableController()..failNextLoad();

      await _pumpDashboard(
        tester,
        announcements: announcements,
        includeParentDependencies: true,
        timetableController: timetable,
        dashboard: ParentDashboard(
          parentId: 'parent-1',
          parentName: 'Pat',
          readAnnouncementIds: const [],
          onNavigate: (_) {},
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Dashboard unavailable'), findsOneWidget);
      expect(find.byType(ParentDashboardView), findsNothing);
    });

    testWidgets('does not reload while the tab is off screen', (tester) async {
      final announcements = _ReloadableAnnouncementsController();
      final timetable = _FakeTimetableController();
      final pump = await pumpTogglable(tester, announcements, timetable);

      expect(announcements.loadCalls, 1);

      await pump(isVisible: false);
      await tester.pumpAndSettle();

      expect(announcements.loadCalls, 1);
    });
  });
}
