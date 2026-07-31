import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/controllers/terms_controller.dart';
import 'package:tenacity/src/models/terms_and_conditions_model.dart';
import 'package:tenacity/src/services/audit_service.dart';
import 'package:tenacity/src/services/terms_service.dart';

TermsAndConditions _terms({String version = '2.0'}) => TermsAndConditions(
      version: version,
      title: 'Terms & conditions',
      content: '# Terms\n\nPlease read these terms.',
      changelog: const [],
    );

class _FakeTermsService implements TermsService {
  TermsAndConditions terms = _terms();
  UserTermsAcceptance acceptance = const UserTermsAcceptance(
    hasAccepted: false,
    version: null,
  );
  Object? loadError;
  Object? statusError;
  Object? acceptError;
  Completer<void>? acceptanceRequest;
  int acceptanceWrites = 0;

  @override
  Future<TermsAndConditions> getCurrentTermsAsync() async {
    if (loadError != null) throw loadError!;
    return terms;
  }

  @override
  Future<UserTermsAcceptance> getUserTermsAcceptance(String userId) async {
    if (statusError != null) throw statusError!;
    return acceptance;
  }

  @override
  Future<void> recordTermsAcceptance(String userId, String version) async {
    acceptanceWrites++;
    if (acceptError != null) throw acceptError!;
    await acceptanceRequest?.future;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeAuditService implements AuditService {
  final actions = <String>[];

  @override
  void record({
    required String action,
    required String targetType,
    required String targetId,
    String? targetName,
    Map<String, Object?>? payloadSummary,
    Map<String, Object?>? before,
    Map<String, Object?>? after,
    String? requestId,
  }) {
    actions.add(action);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _RacingTermsService extends _FakeTermsService {
  final statusRequests = <String, Completer<UserTermsAcceptance>>{};

  @override
  Future<UserTermsAcceptance> getUserTermsAcceptance(String userId) {
    final request = Completer<UserTermsAcceptance>();
    statusRequests[userId] = request;
    return request.future;
  }
}

void main() {
  test('loads the current document and clears loading state', () async {
    final service = _FakeTermsService();
    final controller = TermsController(
      termsService: service,
      auditService: _FakeAuditService(),
    );

    await controller.loadTerms();

    expect(controller.currentTerms?.version, '2.0');
    expect(controller.isLoadingTerms, isFalse);
    expect(controller.loadErrorMessage, isNull);
  });

  test('exposes a retryable error when no terms can be loaded', () async {
    final service = _FakeTermsService()..loadError = Exception('offline');
    final controller = TermsController(
      termsService: service,
      auditService: _FakeAuditService(),
    );

    await controller.loadTerms();

    expect(controller.currentTerms, isNull);
    expect(controller.isLoadingTerms, isFalse);
    expect(
      controller.loadErrorMessage,
      'Check your connection and try again.',
    );

    await controller.checkUserTermsStatus('user-1');
    expect(
      controller.loadErrorMessage,
      'Check your connection and try again.',
    );
  });

  test('checks each user fail-closed if the status lookup fails', () async {
    final service = _FakeTermsService()
      ..acceptance = const UserTermsAcceptance(
        hasAccepted: true,
        version: '2.0',
      );
    final controller = TermsController(
      termsService: service,
      auditService: _FakeAuditService(),
    );
    await controller.loadTerms();
    await controller.checkUserTermsStatus('user-1');
    expect(controller.needsToAcceptTerms, isFalse);

    service.statusError = Exception('offline');
    await controller.checkUserTermsStatus('user-2');

    expect(controller.needsToAcceptTerms, isTrue);
    expect(controller.userAcceptedVersion, isNull);
    expect(controller.isCheckingStatus, isFalse);
  });

  test('an older account lookup cannot overwrite the current account',
      () async {
    final service = _RacingTermsService();
    final controller = TermsController(
      termsService: service,
      auditService: _FakeAuditService(),
    );
    await controller.loadTerms();

    final firstCheck = controller.checkUserTermsStatus('user-1');
    final secondCheck = controller.checkUserTermsStatus('user-2');
    service.statusRequests['user-2']!.complete(
      const UserTermsAcceptance(hasAccepted: false, version: null),
    );
    await secondCheck;
    service.statusRequests['user-1']!.complete(
      const UserTermsAcceptance(hasAccepted: true, version: '2.0'),
    );
    await firstCheck;

    expect(controller.needsToAcceptTerms, isTrue);
    expect(controller.userAcceptedVersion, isNull);
    expect(controller.isCheckingStatus, isFalse);
  });

  test('records acceptance and updates the local gate only after the write',
      () async {
    final service = _FakeTermsService();
    final audit = _FakeAuditService();
    final pendingWrite = Completer<void>();
    service.acceptanceRequest = pendingWrite;
    final controller = TermsController(
      termsService: service,
      auditService: audit,
    );
    await controller.loadTerms();

    final acceptance = controller.acceptTerms('user-1', 'Pat Parent');

    expect(service.acceptanceWrites, 1);
    expect(controller.needsToAcceptTerms, isTrue);
    expect(controller.isAccepting, isTrue);
    expect(audit.actions, isEmpty);

    pendingWrite.complete();
    await acceptance;

    expect(service.acceptanceWrites, 1);
    expect(controller.needsToAcceptTerms, isFalse);
    expect(controller.userAcceptedVersion, '2.0');
    expect(controller.isAccepting, isFalse);
    expect(audit.actions, ['terms.accept']);
  });

  test('a failed acceptance leaves the gate closed and can be retried',
      () async {
    final service = _FakeTermsService()..acceptError = Exception('denied');
    final controller = TermsController(
      termsService: service,
      auditService: _FakeAuditService(),
    );
    await controller.loadTerms();

    await expectLater(
      controller.acceptTerms('user-1', 'Pat Parent'),
      throwsException,
    );

    expect(controller.needsToAcceptTerms, isTrue);
    expect(controller.isAccepting, isFalse);
    expect(
      controller.actionErrorMessage,
      'Your acceptance could not be saved. Please try again.',
    );

    await controller.checkUserTermsStatus('user-2');
    expect(controller.actionErrorMessage, isNull);
  });
}
