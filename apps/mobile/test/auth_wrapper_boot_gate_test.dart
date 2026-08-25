import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/auth_wrapper.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/terms_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/terms_and_conditions_model.dart';
import 'package:tenacity/src/services/audit_service.dart';
import 'package:tenacity/src/services/terms_service.dart';
import 'package:tenacity/src/ui/login_screen.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

Parent _parent(String userId) => Parent(
      uid: userId,
      firstName: 'Pat',
      lastName: 'Parent',
      email: '$userId@example.com',
      fcmTokens: const [],
      students: const [],
      phone: '',
      unreadChats: const {},
      activeChats: const [],
    );

TermsAndConditions _terms(String version) => TermsAndConditions(
      version: version,
      title: 'Terms & conditions',
      content: '# Terms\n\nRead this document.',
      changelog: const [],
    );

class _BootAuthController extends ChangeNotifier implements AuthController {
  AppUser? _currentUser;
  bool _isRestoringSession;

  _BootAuthController({AppUser? user, bool isRestoringSession = false})
      : _currentUser = user,
        _isRestoringSession = isRestoringSession;

  @override
  AppUser? get currentUser => _currentUser;

  @override
  bool get isRestoringSession => _isRestoringSession;

  // What LoginScreen reads while it builds.
  @override
  bool get isLoading => false;

  @override
  String? get errorMessage => null;

  @override
  String? get statusMessage => null;

  @override
  void clearMessages() {}

  void finishRestore(AppUser? user) {
    _currentUser = user;
    _isRestoringSession = false;
    notifyListeners();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Terms service whose reads are held open, so a test can inspect what boot
/// renders while it is still waiting on the network.
class _PendingTermsService implements TermsService {
  final acceptance = Completer<UserTermsAcceptance>();
  final terms = Completer<TermsAndConditions>();

  @override
  Future<TermsAndConditions> getCurrentTermsAsync() => terms.future;

  @override
  Future<UserTermsAcceptance> getUserTermsAcceptance(String userId) =>
      acceptance.future;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _NoopAuditService implements AuditService {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// The terms gate must never be the thing a booting user is looking at before
/// the app knows whether they owe an acceptance.
void _expectNoTermsGate() {
  expect(find.text('Terms & conditions'), findsNothing);
  expect(
      find.text('Please review the full document to continue'), findsNothing);
  expect(find.text('Accept & continue'), findsNothing);
}

void main() {
  late _BootAuthController authController;
  late _PendingTermsService termsService;
  late TermsController termsController;

  void createControllers({AppUser? user, bool isRestoringSession = false}) {
    authController = _BootAuthController(
      user: user,
      isRestoringSession: isRestoringSession,
    );
    termsService = _PendingTermsService();
    termsController = TermsController(
      termsService: termsService,
      auditService: _NoopAuditService(),
    );
    addTearDown(authController.dispose);
    addTearDown(termsController.dispose);
  }

  Future<void> pumpBoot(WidgetTester tester) async {
    unawaited(termsController.loadTerms());
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthController>.value(value: authController),
          ChangeNotifierProvider<TermsController>.value(value: termsController),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          home: const AuthWrapper(),
        ),
      ),
    );
  }

  testWidgets('holds the splash while the persisted session is being restored',
      (tester) async {
    createControllers(isRestoringSession: true);
    await pumpBoot(tester);

    expect(find.byKey(const Key('app-boot-splash')), findsOneWidget);
    expect(find.byType(LoginScreen), findsNothing);
    _expectNoTermsGate();
  });

  testWidgets('shows the login screen once the restore finds nobody signed in',
      (tester) async {
    createControllers(isRestoringSession: true);
    await pumpBoot(tester);

    authController.finishRestore(null);
    await tester.pump();

    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.byKey(const Key('app-boot-splash')), findsNothing);
  });

  testWidgets('holds the splash while the acceptance read is in flight',
      (tester) async {
    createControllers(user: _parent('user-1'));
    await pumpBoot(tester);
    await tester.pump();

    expect(find.byKey(const Key('app-boot-splash')), findsOneWidget);
    _expectNoTermsGate();
  });

  testWidgets('holds the splash while the terms document is still loading',
      (tester) async {
    createControllers(user: _parent('user-1'));
    await pumpBoot(tester);

    // The acceptance read lands first, and says this user has accepted the
    // very version that is still on the wire. Until it arrives the gate cannot
    // compare them, and must not guess.
    termsService.acceptance
        .complete(const UserTermsAcceptance(hasAccepted: true, version: '2.0'));
    await tester.pump();
    await tester.pump();

    expect(find.byKey(const Key('app-boot-splash')), findsOneWidget);
    _expectNoTermsGate();
  });

  testWidgets('still gates a user who has not accepted the current version',
      (tester) async {
    createControllers(user: _parent('user-1'));
    await pumpBoot(tester);

    termsService.acceptance
        .complete(const UserTermsAcceptance(hasAccepted: true, version: '1.0'));
    termsService.terms.complete(_terms('2.0'));
    await tester.pumpAndSettle();

    expect(find.text('Accept & continue'), findsOneWidget);
  });

  testWidgets('surfaces a failed terms load instead of splashing forever',
      (tester) async {
    createControllers(user: _parent('user-1'));
    await pumpBoot(tester);

    termsService.acceptance
        .complete(const UserTermsAcceptance(hasAccepted: true, version: '2.0'));
    termsService.terms.completeError(StateError('no terms'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('app-boot-splash')), findsNothing);
    expect(find.text('Terms could not be loaded'), findsOneWidget);
  });
}
