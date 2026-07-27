import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/services/audit_service.dart';
import 'package:tenacity/src/services/invoice_service.dart';

class _FakeInvoiceService implements InvoiceService {
  final Map<String, StreamController<List<Invoice>>> parentStreams = {};
  final allInvoicesStream = StreamController<List<Invoice>>.broadcast();

  @override
  Stream<List<Invoice>> streamInvoicesByParent(String parentId) {
    return parentStreams
        .putIfAbsent(
          parentId,
          () => StreamController<List<Invoice>>.broadcast(),
        )
        .stream;
  }

  @override
  Stream<List<Invoice>> streamAllInvoices() => allInvoicesStream.stream;

  Future<void> close() async {
    for (final stream in parentStreams.values) {
      await stream.close();
    }
    await allInvoicesStream.close();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeAuthController extends ChangeNotifier implements AuthController {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeAuditService implements AuditService {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Invoice _invoice(String id) {
  return Invoice(
    id: id,
    parentId: 'parent-1',
    parentName: 'Pat Parent',
    parentEmail: 'pat@example.com',
    lineItems: const [],
    weeks: 1,
    amountDue: 70,
    status: InvoiceStatus.unpaid,
    dueDate: DateTime(2026, 8, 1),
    createdAt: DateTime(2026, 7, 1),
  );
}

void main() {
  late _FakeInvoiceService service;
  late InvoiceController controller;

  setUp(() {
    service = _FakeInvoiceService();
    controller = InvoiceController(
      invoiceService: service,
      authController: _FakeAuthController(),
      auditService: _FakeAuditService(),
    );
  });

  tearDown(() async {
    controller.dispose();
    await service.close();
  });

  test('replaces the previous parent listener and ignores stale data',
      () async {
    controller.listenToInvoicesForParent('parent-a');
    expect(controller.isLoading, isTrue);
    expect(controller.invoiceLoadError, isNull);

    service.parentStreams['parent-a']!.add([_invoice('a')]);
    await Future<void>.delayed(Duration.zero);
    expect(controller.invoices.single.id, 'a');
    expect(controller.isLoading, isFalse);

    controller.listenToInvoicesForParent('parent-b');
    await Future<void>.delayed(Duration.zero);
    expect(service.parentStreams['parent-a']!.hasListener, isFalse);
    expect(controller.invoices, isEmpty);
    expect(controller.isLoading, isTrue);

    service.parentStreams['parent-a']!.add([_invoice('stale')]);
    service.parentStreams['parent-b']!.add([_invoice('b')]);
    await Future<void>.delayed(Duration.zero);

    expect(controller.invoices.single.id, 'b');
    expect(controller.isLoading, isFalse);
  });

  test('surfaces stream errors and leaves loading state', () async {
    controller.listenToInvoicesForParent('parent-a');
    service.parentStreams['parent-a']!.addError(StateError('offline'));
    await Future<void>.delayed(Duration.zero);

    expect(controller.isLoading, isFalse);
    expect(controller.invoices, isEmpty);
    expect(
      controller.invoiceLoadError,
      'Invoices could not be loaded. Check your connection and try again.',
    );
  });

  test('admin listening replaces an active parent listener', () async {
    controller.listenToInvoicesForParent('parent-a');
    controller.listenToAllInvoices();
    await Future<void>.delayed(Duration.zero);

    expect(service.parentStreams['parent-a']!.hasListener, isFalse);
    expect(service.allInvoicesStream.hasListener, isTrue);
    expect(controller.invoicesStream, isNull);
    expect(controller.allInvoicesStream, isNotNull);

    service.allInvoicesStream.add([_invoice('admin')]);
    await Future<void>.delayed(Duration.zero);
    expect(controller.invoices.single.id, 'admin');
  });
}
