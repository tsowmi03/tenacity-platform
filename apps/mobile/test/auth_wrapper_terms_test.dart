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

class _SwitchableAuthController extends ChangeNotifier
    implements AuthController {
  AppUser? _currentUser;

  _SwitchableAuthController(this._currentUser);

  @override
  AppUser? get currentUser => _currentUser;

  @override
  bool get isRestoringSession => false;

  void switchTo(AppUser user) {
    _currentUser = user;
    notifyListeners();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _RecordingTermsService implements TermsService {
  final checkedUserIds = <String>[];

  @override
  Future<TermsAndConditions> getCurrentTermsAsync() async {
    return TermsAndConditions(
      version: '2.0',
      title: 'Terms & conditions',
      content: '# Terms\n\nRead this document.',
      changelog: const [],
    );
  }

  @override
  Future<UserTermsAcceptance> getUserTermsAcceptance(String userId) async {
    checkedUserIds.add(userId);
    return const UserTermsAcceptance(hasAccepted: false, version: null);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _NoopAuditService implements AuditService {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  testWidgets('checks terms again when the signed-in account changes',
      (tester) async {
    final authController = _SwitchableAuthController(_parent('user-1'));
    final termsService = _RecordingTermsService();
    final termsController = TermsController(
      termsService: termsService,
      auditService: _NoopAuditService(),
    );
    addTearDown(authController.dispose);
    addTearDown(termsController.dispose);
    await termsController.loadTerms();

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
    // Boot shows nothing that commits to a destination until it knows which
    // one applies — the terms gate included (MOB-29).
    expect(find.byKey(const Key('app-boot-splash')), findsOneWidget);
    await tester.pump();
    await tester.pump();

    expect(termsService.checkedUserIds, ['user-1']);
    expect(find.text('Accept & continue'), findsOneWidget);

    authController.switchTo(_parent('user-2'));
    await tester.pump();
    await tester.pump();
    await tester.pump();

    expect(termsService.checkedUserIds, ['user-1', 'user-2']);
    expect(find.text('Accept & continue'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
