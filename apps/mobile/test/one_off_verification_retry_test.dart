import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/services/audit_service.dart';
import 'package:tenacity/src/services/invoice_service.dart';
import 'package:tenacity/src/services/payment_verification_result.dart';

/// Retrying a failed verification.
///
/// The 2026-08-06 crash was a cold start: the container died on the first call
/// and a second would have found a warm one. The retry is the cheapest part of
/// the fix, and the one that would most likely have saved that booking on its
/// own.

class _ScriptedInvoiceService implements InvoiceService {
  _ScriptedInvoiceService(this.script);

  /// One result per call, in order. The last is repeated if asked for again.
  final List<PaymentVerificationResult> script;
  int calls = 0;

  @override
  Future<PaymentVerificationResult> verifyPaymentStatus(
      String clientSecret) async {
    final index = calls < script.length ? calls : script.length - 1;
    calls++;
    return script[index];
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _StubAuthController extends ChangeNotifier implements AuthController {
  @override
  AppUser? get currentUser => null;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _StubAuditService implements AuditService {
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
  }) {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

const _unavailable = PaymentVerificationResult.unavailable('internal');
const _succeeded = PaymentVerificationResult.succeeded('succeeded');
const _pending = PaymentVerificationResult.pending('processing');
const _declined = PaymentVerificationResult.notSucceeded('canceled');

void main() {
  late List<Duration> slept;

  Future<void> recordSleep(Duration delay) async => slept.add(delay);

  setUp(() => slept = []);

  InvoiceController controllerFor(_ScriptedInvoiceService service) {
    return InvoiceController(
      invoiceService: service,
      authController: _StubAuthController(),
      auditService: _StubAuditService(),
    );
  }

  test('stops at the first success without sleeping', () async {
    final service = _ScriptedInvoiceService([_succeeded]);

    final result = await controllerFor(service)
        .verifyPaymentWithRetries('pi_1_secret_x', sleep: recordSleep);

    expect(result.isSucceeded, isTrue);
    expect(service.calls, 1);
    expect(slept, isEmpty);
  });

  test('stops at a definite failure rather than retrying it', () async {
    final service = _ScriptedInvoiceService([_declined]);

    final result = await controllerFor(service)
        .verifyPaymentWithRetries('pi_1_secret_x', sleep: recordSleep);

    expect(result.outcome, PaymentVerificationOutcome.notSucceeded);
    expect(service.calls, 1);
  });

  test('recovers when a cold start fails and the retry lands', () async {
    // Exactly the shape of the incident.
    final service = _ScriptedInvoiceService([_unavailable, _succeeded]);

    final result = await controllerFor(service).verifyPaymentWithRetries(
      'pi_1_secret_x',
      backoff: const [Duration(seconds: 1), Duration(seconds: 2)],
      sleep: recordSleep,
    );

    expect(result.isSucceeded, isTrue);
    expect(service.calls, 2);
    expect(slept, [const Duration(seconds: 1)]);
  });

  test('retries a pending payment too', () async {
    final service = _ScriptedInvoiceService([_pending, _succeeded]);

    final result = await controllerFor(service).verifyPaymentWithRetries(
      'pi_1_secret_x',
      backoff: const [Duration(seconds: 1)],
      sleep: recordSleep,
    );

    expect(result.isSucceeded, isTrue);
    expect(service.calls, 2);
  });

  test('gives up after the backoff and reports what it last saw', () async {
    final service = _ScriptedInvoiceService([_unavailable]);

    final result = await controllerFor(service).verifyPaymentWithRetries(
      'pi_1_secret_x',
      backoff: const [Duration(seconds: 1), Duration(seconds: 2)],
      sleep: recordSleep,
    );

    expect(result.outcome, PaymentVerificationOutcome.unavailable);
    expect(service.calls, 3, reason: 'one attempt plus one per backoff step');
    expect(slept, const [Duration(seconds: 1), Duration(seconds: 2)]);
  });

  test('never converts an unreachable server into a failed payment', () async {
    final service = _ScriptedInvoiceService([_unavailable]);

    final result = await controllerFor(service).verifyPaymentWithRetries(
      'pi_1_secret_x',
      backoff: const [Duration(seconds: 1)],
      sleep: recordSleep,
    );

    expect(result.outcome, isNot(PaymentVerificationOutcome.notSucceeded));
  });

  test('the shipped backoff gives four chances over fifteen seconds', () async {
    final service = _ScriptedInvoiceService([_unavailable]);

    await controllerFor(service)
        .verifyPaymentWithRetries('pi_1_secret_x', sleep: recordSleep);

    expect(service.calls, oneOffVerifyBackoff.length + 1);
    expect(
      slept.fold(Duration.zero, (sum, d) => sum + d),
      const Duration(seconds: 15),
    );
  });
}
