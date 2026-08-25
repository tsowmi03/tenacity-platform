import 'package:flutter/material.dart';
import 'package:tenacity/src/models/terms_and_conditions_model.dart';
import 'package:tenacity/src/services/audit_service.dart';
import 'package:tenacity/src/services/terms_service.dart';

class TermsController extends ChangeNotifier {
  final TermsService _termsService;
  final AuditService _auditService;
  TermsAndConditions? _currentTerms;
  bool _isLoadingTerms = false;
  bool _isCheckingStatus = false;
  bool _isAccepting = false;
  String? _loadErrorMessage;
  String? _actionErrorMessage;
  String? _userAcceptedVersion;
  bool _hasUserAccepted = false;
  int _statusCheckGeneration = 0;

  TermsController({
    required TermsService termsService,
    AuditService? auditService,
  })  : _termsService = termsService,
        _auditService = auditService ?? AuditService();

  TermsAndConditions? get currentTerms => _currentTerms;
  bool get isLoading => _isLoadingTerms || _isCheckingStatus;
  bool get isLoadingTerms => _isLoadingTerms;
  bool get isCheckingStatus => _isCheckingStatus;
  bool get isAccepting => _isAccepting;
  String? get loadErrorMessage => _loadErrorMessage;
  String? get actionErrorMessage => _actionErrorMessage;
  String? get userAcceptedVersion => _userAcceptedVersion;
  bool get needsToAcceptTerms =>
      !_hasUserAccepted || (_userAcceptedVersion != _currentTerms?.version);

  /// Whether the gate can yet say if this user owes us an acceptance.
  ///
  /// [needsToAcceptTerms] compares the accepted version against the current
  /// one, so while the current document is still loading it answers `true`
  /// even for a user who has already accepted it. That answer is not wrong so
  /// much as premature, and acting on it during boot is what put a terms
  /// screen in front of returning users (MOB-29). A load that failed does
  /// resolve the gate: we still cannot name the current version, so the gate
  /// stays closed and the terms screen shows its error and a retry.
  bool get isGateResolved => _currentTerms != null || _loadErrorMessage != null;

  Future<void> loadTerms() async {
    if (_isLoadingTerms) return;

    _isLoadingTerms = true;
    _loadErrorMessage = null;
    notifyListeners();

    try {
      _currentTerms = await _termsService.getCurrentTermsAsync();
    } catch (error) {
      _loadErrorMessage = 'Check your connection and try again.';
      debugPrint('Error loading terms: $error');
    } finally {
      _isLoadingTerms = false;
      notifyListeners();
    }
  }

  Future<void> checkUserTermsStatus(String userId) async {
    final generation = ++_statusCheckGeneration;
    _isCheckingStatus = true;
    _actionErrorMessage = null;
    // Fail closed while switching accounts. Acceptance state belongs to one
    // user and must never be reused for the next signed-in user.
    _hasUserAccepted = false;
    _userAcceptedVersion = null;
    notifyListeners();

    try {
      final acceptance = await _termsService.getUserTermsAcceptance(userId);
      if (generation != _statusCheckGeneration) return;
      _hasUserAccepted = acceptance.hasAccepted;
      _userAcceptedVersion = acceptance.version;
    } catch (e) {
      debugPrint('Error checking terms status: $e');
    } finally {
      if (generation == _statusCheckGeneration) {
        _isCheckingStatus = false;
        notifyListeners();
      }
    }
  }

  Future<void> acceptTerms(String userId, String displayName) async {
    if (_currentTerms == null || _isAccepting) return;

    final previousAccepted = _hasUserAccepted;
    final previousVersion = _userAcceptedVersion;
    final version = _currentTerms!.version;
    _isAccepting = true;
    _actionErrorMessage = null;
    notifyListeners();

    try {
      await _termsService.recordTermsAcceptance(userId, version);
      _auditService.record(
        action: 'terms.accept',
        targetType: 'user',
        targetId: userId,
        targetName: displayName,
        payloadSummary: {
          'termsVersion': version,
        },
        before: {
          'termsAccepted': previousAccepted,
          'acceptedTermsVersion': previousVersion,
        },
        after: {
          'termsAccepted': true,
          'acceptedTermsVersion': version,
        },
      );

      _hasUserAccepted = true;
      _userAcceptedVersion = version;
    } catch (error) {
      _actionErrorMessage =
          'Your acceptance could not be saved. Please try again.';
      debugPrint('Error accepting terms: $error');
      rethrow;
    } finally {
      _isAccepting = false;
      notifyListeners();
    }
  }
}
