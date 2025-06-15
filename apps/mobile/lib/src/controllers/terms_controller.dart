import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:tenacity/src/models/terms_and_conditions_model.dart';
import 'package:tenacity/src/services/terms_service.dart';

class TermsController extends ChangeNotifier {
  final TermsService _termsService;
  TermsAndConditions? _currentTerms;
  bool _isLoading = false;
  String? _userAcceptedVersion;
  bool _hasUserAccepted = false;

  TermsController({required TermsService termsService})
      : _termsService = termsService {
    _loadTerms();
  }

  TermsAndConditions? get currentTerms => _currentTerms;
  bool get isLoading => _isLoading;
  bool get needsToAcceptTerms =>
      !_hasUserAccepted || (_userAcceptedVersion != _currentTerms?.version);

  void _loadTerms() {
    _currentTerms = _termsService.getCurrentTerms();
    notifyListeners();
  }

  Future<void> checkUserTermsStatus(String userId) async {
    _isLoading = true;
    notifyListeners();

    try {
      final userDoc = await FirebaseFirestore.instance
          .collection('users')
          .doc(userId)
          .get();

      if (userDoc.exists) {
        final userData = userDoc.data() as Map<String, dynamic>;
        _hasUserAccepted = userData['termsAccepted'] == true;
        _userAcceptedVersion = userData['acceptedTermsVersion'];
      } else {
        _hasUserAccepted = false;
        _userAcceptedVersion = null;
      }
    } catch (e) {
      debugPrint('Error checking terms status: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> acceptTerms(String userId) async {
    if (_currentTerms == null) return;

    await _termsService.recordTermsAcceptance(
      userId,
      _currentTerms!.version,
    );

    _hasUserAccepted = true;
    _userAcceptedVersion = _currentTerms!.version;
    notifyListeners();
  }
}
