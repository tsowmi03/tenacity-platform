import 'package:cloud_functions/cloud_functions.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tenacity/src/helpers/referral_prompt_policy.dart';

/// A parent's referral link from `getReferralLink` (TP-33).
///
/// The link never changes once issued, so it is fetched once and kept on the
/// device. `ReferralController` warms it when a parent signs in, so a tap on
/// "Copy my link" never waits on the network: the first call can take several
/// seconds while the function starts cold and issues the code.
class ReferralService {
  ReferralService({
    FirebaseFunctions? functions,
    Future<SharedPreferences> Function()? prefs,
    Future<String> Function()? fetchLink,
  })  : _functions = functions,
        _prefs = prefs ?? SharedPreferences.getInstance,
        _fetchLink = fetchLink;

  final FirebaseFunctions? _functions;
  final Future<SharedPreferences> Function() _prefs;
  final Future<String> Function()? _fetchLink;
  final Map<String, String> _links = {};
  final Map<String, Future<String>> _inFlight = {};

  String _key(String uid) => 'referral.$uid.link';

  /// The link if it is already in memory, without waiting for anything.
  String? cachedLinkFor(String uid) => _links[uid];

  /// The link from memory, then the device, then the network. Concurrent
  /// callers share one request.
  Future<String> linkFor(String uid) {
    final cached = _links[uid];
    if (cached != null) return Future.value(cached);
    return _inFlight[uid] ??= _load(uid).whenComplete(() {
      _inFlight.remove(uid);
    });
  }

  Future<String> _load(String uid) async {
    final prefs = await _prefs();
    final stored = prefs.getString(_key(uid));
    if (stored != null && stored.isNotEmpty) {
      return _links[uid] = stored;
    }
    final link = await (_fetchLink ?? _callFunction)();
    await prefs.setString(_key(uid), link);
    return _links[uid] = link;
  }

  Future<String> _callFunction() async {
    final functions = _functions ?? FirebaseFunctions.instance;
    final result = await functions.httpsCallable('getReferralLink').call();
    final data = Map<String, dynamic>.from(result.data as Map);
    return data['link'] as String;
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
  ///
  /// `ReferralController` reads it as soon as a parent signs in, not when they
  /// first open a note: started then, the very note being opened (written
  /// earlier) would fall before the start and never count.
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
