import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:tenacity/src/models/terms_and_conditions_model.dart';

class UserTermsAcceptance {
  final bool hasAccepted;
  final String? version;

  const UserTermsAcceptance({
    required this.hasAccepted,
    required this.version,
  });
}

class TermsService {
  final FirebaseRemoteConfig _remoteConfig = FirebaseRemoteConfig.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // Get current terms from Remote Config
  Future<TermsAndConditions> getCurrentTermsAsync() async {
    try {
      await _remoteConfig.fetchAndActivate();
    } catch (error) {
      // Remote Config retains the last activated values. They are safe to use
      // offline; a first launch with only the placeholder is rejected below.
      debugPrint('Terms Remote Config refresh failed: $error');
    }
    final data = {
      'terms_version': _remoteConfig.getString('terms_version'),
      'terms_title': _remoteConfig.getString('terms_title'),
      'terms_content': _remoteConfig.getString('terms_content'),
      'terms_changelog': _remoteConfig.getString('terms_changelog'),
    };

    final content = (data['terms_content'] as String).trim();
    if (content.isEmpty || content == 'PLACEHOLDER') {
      throw StateError('No usable terms document is available');
    }

    return TermsAndConditions.fromRemoteConfig(data);
  }

  // Record user's acceptance of terms
  Future<void> recordTermsAcceptance(
    String userId,
    String version,
  ) async {
    await _firestore.collection('users').doc(userId).update({
      'termsAccepted': true,
      'acceptedTermsVersion': version,
      'acceptedTermsAt': FieldValue.serverTimestamp(),
    });
  }

  Future<UserTermsAcceptance> getUserTermsAcceptance(String userId) async {
    final userDoc = await _firestore.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return const UserTermsAcceptance(
        hasAccepted: false,
        version: null,
      );
    }

    final userData = userDoc.data() as Map<String, dynamic>;
    final acceptedVersion = userData['acceptedTermsVersion'];
    return UserTermsAcceptance(
      hasAccepted: userData['termsAccepted'] == true,
      version: acceptedVersion is String ? acceptedVersion : null,
    );
  }

  // Check if user needs to accept terms
  Future<bool> userNeedsToAcceptTerms(String userId) async {
    final currentTerms = await getCurrentTermsAsync();
    final acceptance = await getUserTermsAcceptance(userId);

    return !acceptance.hasAccepted ||
        acceptance.version != currentTerms.version;
  }
}
