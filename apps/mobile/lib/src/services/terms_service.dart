import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:tenacity/src/models/terms_and_conditions_model.dart';

class TermsService {
  final FirebaseRemoteConfig _remoteConfig = FirebaseRemoteConfig.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // Get current terms from Remote Config
  TermsAndConditions getCurrentTerms() {
    final data = {
      'terms_version': _remoteConfig.getString('terms_version'),
      'terms_title': _remoteConfig.getString('terms_title'),
      'terms_content': _remoteConfig.getString('terms_content'),
      'terms_changelog': _remoteConfig.getString('terms_changelog'),
    };

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

  // Check if user needs to accept terms
  Future<bool> userNeedsToAcceptTerms(String userId) async {
    final currentTerms = getCurrentTerms();
    final userDoc = await _firestore.collection('users').doc(userId).get();

    if (!userDoc.exists) return true;

    final userData = userDoc.data() as Map<String, dynamic>;
    final bool hasAccepted = userData['termsAccepted'] == true;
    final String? acceptedVersion = userData['acceptedTermsVersion'];

    return !hasAccepted || acceptedVersion != currentTerms.version;
  }
}
