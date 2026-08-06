import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/invoice_draft_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/services/audit_service.dart';
import 'package:tenacity/src/services/invoice_service.dart';

class _RecordingInvoiceService implements InvoiceService {
  final List<String> createRequestIds = [];
  final Set<String> completedRequestIds = {};
  Object? createError;

  @override
  Future<InvoiceCreationResult> createInvoice({
    required String createRequestId,
    required String parentId,
    required String parentName,
    required String parentEmail,
    required List<Map<String, dynamic>> lineItems,
    required int weeks,
    required double amountDue,
    required DateTime dueDate,
    List<String> studentIds = const [],
    double? amountDueComputed,
    double? amountDueOverride,
    String? adminNotes,
    String? createdByAdminId,
    String? invoiceNumber,
    String? stripePaymentIntentId,
  }) async {
    createRequestIds.add(createRequestId);
    final error = createError;
    if (error != null) throw error;
    return InvoiceCreationResult(
      invoiceId: 'invoice-1',
      invoiceNumber: '42',
      created: completedRequestIds.add(createRequestId),
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _RecordingAuditService implements AuditService {
  final List<String?> requestIds = [];

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
    requestIds.add(requestId);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeAuthController extends ChangeNotifier implements AuthController {
  @override
  AppUser? get currentUser => null;

  @override
  Future<Student?> fetchStudentData(String uid) async => _student();

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

InvoiceDraft _draft({String? createRequestId}) {
  return InvoiceDraft(
    parentId: 'parent-1',
    parentName: 'Pat Parent',
    parentEmail: 'pat@example.com',
    lineItems: [
      {
        'description': 'Ella Parent (session 1)',
        'quantity': 1,
        'unitAmount': 60.0,
        'lineTotal': 60.0,
      },
    ],
    weeks: 1,
    dueDate: DateTime(2026, 8, 5),
    computedTotal: 60,
    studentIds: const ['student-1'],
    createRequestId: createRequestId,
  );
}

Student _student() => Student(
      id: 'student-1',
      firstName: 'Ella',
      lastName: 'Parent',
      parents: const ['parent-1'],
      grade: 'Year 6',
      subjects: const ['English'],
    );

void main() {
  test('draft edits retain one create request id', () {
    final first = _draft();
    final edited = first.copyWith(adminNotes: 'Updated before retry');
    final separateDraft = _draft();

    expect(first.createRequestId, isNotEmpty);
    expect(edited.createRequestId, first.createRequestId);
    expect(separateDraft.createRequestId, isNot(first.createRequestId));
  });

  test('create callable payload carries the stable request id', () {
    final payload = buildCreateInvoiceRequest(
      createRequestId: 'request-123',
      parentId: 'parent-1',
      parentName: 'Pat Parent',
      parentEmail: 'pat@example.com',
      lineItems: const [
        {
          'description': 'English',
          'quantity': 1,
          'unitAmount': 60,
          'lineTotal': 60,
        },
      ],
      weeks: 1,
      amountDue: 60,
      dueDate: DateTime.utc(2026, 8, 5),
    );

    expect(payload['createRequestId'], 'request-123');
    expect(
      payload['dueDate'],
      DateTime.utc(2026, 8, 5).millisecondsSinceEpoch,
    );
  });

  test('draft retries forward one request id and only audit the creation',
      () async {
    final service = _RecordingInvoiceService();
    final audit = _RecordingAuditService();
    final controller = InvoiceController(
      invoiceService: service,
      authController: _FakeAuthController(),
      auditService: audit,
    );
    addTearDown(controller.dispose);
    final draft = _draft(createRequestId: 'stable-request');

    final firstId = await controller.createInvoiceFromDraft(draft);
    final retryId = await controller.createInvoiceFromDraft(draft);

    expect(firstId, 'invoice-1');
    expect(retryId, firstId);
    expect(service.createRequestIds, [
      'stable-request',
      'stable-request',
    ]);
    expect(audit.requestIds, ['stable-request']);
  });

  test('immediate create rethrows invoice service failures', () async {
    final failure = StateError('callable unavailable');
    final service = _RecordingInvoiceService()..createError = failure;
    final controller = InvoiceController(
      invoiceService: service,
      authController: _FakeAuthController(),
      auditService: _RecordingAuditService(),
    );
    addTearDown(controller.dispose);

    await expectLater(
      controller.createInvoice(
        parentId: 'parent-1',
        parentName: 'Pat Parent',
        parentEmail: 'pat@example.com',
        students: [_student()],
        sessionsPerStudent: const [1],
        weeks: 1,
        dueDate: DateTime(2026, 8, 5),
      ),
      throwsA(same(failure)),
    );
    expect(controller.isLoading, isFalse);
  });
}
