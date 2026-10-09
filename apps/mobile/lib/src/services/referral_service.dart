import 'package:cloud_functions/cloud_functions.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tenacity/src/helpers/referral_prompt_policy.dart';

/// Fetches a parent's referral link from `getReferralLink` (TP-33).
///
/// The link never changes once issued, so it is kept for the rest of the app
/// session after the first fetch.
class ReferralService {
  ReferralService({FirebaseFunctions? functions})
      : _functions = functions;

  final FirebaseFunctions? _functions;
  final Map<String, String> _links = {};

  Future<String> linkFor(String uid) async {
    final cached = _links[uid];
    if (cached != null) return cached;
    final functions = _functions ?? FirebaseFunctions.instance;
    final result = await functions.httpsCallable('getReferralLink').call();
    final data = Map<String, dynamic>.from(result.data as Map);
    final link = data['link'] as String;
    _links[uid] = link;
    return link;
  }
}

/// What the referral prompts remember on this device, per parent.
///
/// Device-local on purpose: it decides only how often *this* app asks, and a
/// parent with two devices being asked on each is harmless. Keyed by uid
/// because a shared family tablet can have more than one parent signed in
/// over time.
class ReferralPromptStore {
  ReferralPromptStore({Future<SharedPreferences> Function()? prefs})
      : _prefs = prefs ?? SharedPreferences.getInstance;

  final Future<SharedPreferences> Function() _prefs;

  String _key(String uid, String name) => 'referral.$uid.$name';

  Future<String?> lastShownDay(String uid) async =>
      (await _prefs()).getString(_key(uid, 'lastShownDay'));

  Future<void> setLastShownDay(String uid, String day) async =>
      (await _prefs()).setString(_key(uid, 'lastShownDay'), day);

  /// The feedback counter, starting it at [now] the first time it is read for
  /// [uid] so feedback from before this feature never counts.
  Future<ReferralFeedbackState> feedbackState(String uid, DateTime now) async {
    final prefs = await _prefs();
    final countFromKey = _key(uid, 'countFrom');
    var countFromMs = prefs.getInt(countFromKey);
    if (countFromMs == null) {
      countFromMs = now.millisecondsSinceEpoch;
      await prefs.setInt(countFromKey, countFromMs);
    }
    return ReferralFeedbackState(
      countFrom: DateTime.fromMillisecondsSinceEpoch(countFromMs),
      countedIds:
          (prefs.getStringList(_key(uid, 'countedIds')) ?? const []).toSet(),
      positiveCount: prefs.getInt(_key(uid, 'positiveCount')) ?? 0,
    );
  }

  Future<void> saveFeedbackState(
    String uid,
    ReferralFeedbackState state,
  ) async {
    final prefs = await _prefs();
    await prefs.setStringList(
      _key(uid, 'countedIds'),
      state.countedIds.toList(),
    );
    await prefs.setInt(_key(uid, 'positiveCount'), state.positiveCount);
  }
}
