import 'package:cloud_firestore/cloud_firestore.dart';

/// How often a client that is still typing re-stamps its heartbeat.
const typingHeartbeatInterval = Duration(seconds: 3);

/// How long after the last keystroke a client stops claiming to type.
///
/// Shorter than [typingHeartbeatTtl] so the common case is an explicit stop
/// rather than an expiry — the TTL is the safety net, not the mechanism.
const typingIdleTimeout = Duration(seconds: 4);

/// How long a heartbeat stays believable.
///
/// Deliberately more than twice [typingHeartbeatInterval]: a single dropped
/// write must not make the indicator flicker off while somebody is still
/// typing. The cost of the wider window is that a client which dies without
/// writing its stop leaves the indicator up for at most this long, which is
/// the failure this whole design is trading for.
const typingHeartbeatTtl = Duration(seconds: 8);

class Chat {
  final String id;
  final List<String> participants;
  final String lastMessage;
  final Timestamp updatedAt;
  final Map<String, int> unreadCounts;
  final Map<String, Timestamp?> deletedFor;

  /// When each participant last stamped a typing heartbeat.
  ///
  /// A timestamp rather than a flag, because a flag can only be cleared by
  /// whoever set it — and MOB-27 was the catalogue of ways that never happened:
  /// leaving the screen, backgrounding the app, going offline mid-sentence. A
  /// stamp expires on its own, so a stuck indicator is unreachable rather than
  /// merely unlikely.
  final Map<String, Timestamp?> typingStatus;

  /// Set by the backend when a participant's account is deleted. The thread
  /// stays in Firestore as a record but leaves everyone's inbox, and the
  /// backend refuses further messages.
  ///
  /// Absent on every chat written before this existed, hence the default.
  final bool inactive;

  Chat({
    required this.id,
    required this.participants,
    required this.lastMessage,
    required this.updatedAt,
    required this.unreadCounts,
    required this.deletedFor,
    required this.typingStatus,
    this.inactive = false,
  });

  /// Whether this thread belongs in [userId]'s inbox.
  ///
  /// Two ways a thread drops out: the user deleted it themselves, or the
  /// backend retired it because the other participant's account was deleted.
  /// Missing the second case is what left parents with "Unknown User" rows
  /// they could open and type into.
  bool isVisibleTo(String userId) => deletedFor[userId] == null && !inactive;

  /// Whether [userId]'s heartbeat is recent enough to still mean anything.
  ///
  /// Pure and [now]-injected so the expiry boundary is testable without
  /// waiting on a clock.
  bool isTypingNow(String userId, DateTime now) {
    final heartbeat = typingStatus[userId];
    if (heartbeat == null) return false;
    final age = now.difference(heartbeat.toDate());
    // A clock skewed into the future would otherwise read as permanently
    // typing, which is the exact bug this replaced.
    if (age.isNegative) return age.abs() <= typingHeartbeatTtl;
    return age <= typingHeartbeatTtl;
  }

  /// The other participant, or null when there is nobody else on the thread.
  ///
  /// Group threads report their first other member, which is what the existing
  /// one-to-one indicator already did. Naming more than one person is a
  /// product question this ticket does not answer.
  String? otherParticipant(String userId) {
    for (final id in participants) {
      if (id != userId) return id;
    }
    return null;
  }

  // Convert Firestore document into Chat object
  factory Chat.fromFirestore(DocumentSnapshot doc) {
    Map<String, dynamic> data = doc.data() as Map<String, dynamic>;

    return Chat(
      id: doc.id,
      participants: List<String>.from(data['participants']),
      lastMessage: data['lastMessage'] ?? '',
      updatedAt: data['updatedAt'] ?? Timestamp.now(),
      unreadCounts: (data['unreadCounts'] as Map<String, dynamic>?)
              ?.map((key, value) => MapEntry(key, value as int)) ??
          {},
      deletedFor: (data['deletedFor'] as Map<String, dynamic>?)
              ?.map((key, value) => MapEntry(key, value as Timestamp?)) ??
          {},
      typingStatus: parseTypingStatus(data['typingStatus']),
      inactive: data['inactive'] == true,
    );
  }

  // Convert Chat object into a Firestore-compatible map
  Map<String, dynamic> toFirestore() {
    return {
      'participants': participants,
      'lastMessage': lastMessage,
      'updatedAt': updatedAt,
      'unreadCounts': unreadCounts,
      'deletedFor': deletedFor,
      'typingStatus': typingStatus,
      'inactive': inactive,
    };
  }
}

/// Reads a `typingStatus` map that may still hold the pre-MOB-27 booleans.
///
/// A legacy `true` becomes null — "not typing" — on purpose. Those values are
/// exactly the stuck flags this change exists to remove, and there is no
/// honest timestamp to invent for them; treating them as live would carry the
/// bug forward into the new shape. Reading them as absent means every stale
/// indicator clears itself the first time a client reads the document, with no
/// backfill.
Map<String, Timestamp?> parseTypingStatus(Object? raw) {
  if (raw is! Map) return {};

  final parsed = <String, Timestamp?>{};
  raw.forEach((key, value) {
    if (key is! String) return;
    parsed[key] = value is Timestamp ? value : null;
  });
  return parsed;
}
