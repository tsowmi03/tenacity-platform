import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

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

  /// Legacy on/off typing flags, still written for one release.
  ///
  /// Superseded by [typingHeartbeats] and read by nothing in this app. It is
  /// kept, and kept a `bool`, purely so clients on the previous release keep
  /// working during rollout: their `Chat.fromFirestore` casts every value in
  /// this map to `bool`, and a `Timestamp` here would throw inside the
  /// snapshot mapping for the *whole* inbox — blanking it, not just the
  /// indicator. Delete this field, and the writes that feed it, once the old
  /// release is out of circulation.
  final Map<String, bool> typingStatus;

  /// When each participant last stamped a typing heartbeat.
  ///
  /// A timestamp rather than a flag, because a flag can only be cleared by
  /// whoever set it — and MOB-27 was the catalogue of ways that never happened:
  /// leaving the screen, backgrounding the app, going offline mid-sentence. A
  /// stamp expires on its own, so a stuck indicator is unreachable rather than
  /// merely unlikely.
  ///
  /// A new field rather than a new type for the old one, because both releases
  /// read this document at once during a rollout and neither can be taught
  /// about the other after the fact.
  final Map<String, Timestamp?> typingHeartbeats;

  /// How far each participant has read this thread.
  ///
  /// The point of a watermark rather than a flag on every message: marking a
  /// thread read is one write regardless of how long the thread is, and the
  /// sender's "Read" indicator is a comparison against a field on a document
  /// they are already watching. The `readBy` map on each message is still
  /// written for clients on the previous release, but bounded to the page on
  /// screen rather than the whole conversation (MOB-41).
  ///
  /// Absent on every chat written before this existed, hence the default. An
  /// absent watermark reads as "has read nothing", which is the safe direction:
  /// it under-claims rather than marking somebody's unread messages as seen.
  final Map<String, Timestamp?> lastReadAt;

  /// Set by the backend when a participant's account is deleted. The thread
  /// stays in Firestore as a record but leaves everyone's inbox, and the
  /// backend refuses further messages.
  ///
  /// Absent on every chat written before this existed, hence the default.
  final bool inactive;

  /// A group conversation, created by the `createGroupChat` callable (MOB-54).
  ///
  /// An explicit flag rather than inferred from the participant count: a group
  /// that loses members down to two is still a group, and must never be
  /// mistaken for the one-to-one thread between those two people.
  ///
  /// Absent on every chat written before groups existed, hence the default.
  final bool isGroup;

  /// Each group member's name, as the group stores it.
  ///
  /// On the chat rather than looked up, because a parent cannot read another
  /// parent's user document — and in a group they still need to know who
  /// said what. Empty for one-to-one threads, which resolve the other person
  /// the way they always have.
  final Map<String, ChatMemberName> participantNames;

  /// Who started the group. Null for one-to-one threads.
  final String? createdBy;

  Chat({
    required this.id,
    required this.participants,
    required this.lastMessage,
    required this.updatedAt,
    required this.unreadCounts,
    required this.deletedFor,
    required this.typingStatus,
    this.typingHeartbeats = const {},
    this.lastReadAt = const {},
    this.inactive = false,
    this.isGroup = false,
    this.participantNames = const {},
    this.createdBy,
  });

  /// Whether [userId] has read everything up to [messageTime].
  ///
  /// Used for the sender's read indicator. False when there is no watermark at
  /// all, so a thread written before this field existed shows "Delivered"
  /// rather than claiming a read that was never recorded.
  bool hasReadUpTo(String userId, Timestamp messageTime) {
    final watermark = lastReadAt[userId];
    if (watermark == null) return false;
    return watermark.compareTo(messageTime) >= 0;
  }

  /// Whether this thread belongs in [userId]'s inbox.
  ///
  /// Two ways a thread drops out: the user deleted it themselves, or the
  /// backend retired it because the other participant's account was deleted.
  /// Missing the second case is what left parents with "Unknown User" rows
  /// they could open and type into.
  ///
  /// A group nobody has written in yet stays out of everyone's inbox but its
  /// creator's, as in iMessage: the others hear about it with its first
  /// message rather than finding an empty conversation.
  bool isVisibleTo(String userId) {
    if (deletedFor[userId] != null || inactive) return false;
    if (isGroup && lastMessage.isEmpty && createdBy != userId) return false;
    return true;
  }

  /// Everyone on the thread except [userId], in the order the thread lists them.
  List<String> otherParticipants(String userId) =>
      participants.where((id) => id != userId).toList();

  /// What [uid] is called above their messages and in the typing line.
  String memberFirstName(String uid) =>
      participantNames[uid]?.shortName ?? 'Unknown';

  /// [uid]'s full name, for their initials.
  String memberFullName(String uid) =>
      participantNames[uid]?.fullName ?? 'Unknown';

  /// The group's label as [viewerId] sees it: everyone else, by first name.
  ///
  ///   one other     `Sarah`
  ///   two others    `Sarah & Tom`
  ///   three others  `Sarah, Tom & Ana`
  ///   four or more  `Sarah, Tom & 2 others`
  ///
  /// Mirrors `groupLabel` in the functions package (src/chats/groupChat.js),
  /// which titles the push. The two must agree, or a notification and the
  /// thread it opens name the same group differently.
  String groupLabel(String viewerId) => formatGroupLabel(
        otherParticipants(viewerId).map(memberFirstName).toList(),
      );

  /// Everyone other than [userId] whose typing heartbeat is live at [now],
  /// in the order the thread lists them.
  List<String> typingParticipants(String userId, DateTime now) =>
      otherParticipants(userId).where((id) => isTypingNow(id, now)).toList();

  /// Whether [userId]'s heartbeat is recent enough to still mean anything.
  ///
  /// Pure and [now]-injected so the expiry boundary is testable without
  /// waiting on a clock.
  bool isTypingNow(String userId, DateTime now) {
    // Deliberately does not fall back to [typingStatus]. A client on the old
    // release can still strand a `true` there, and honouring it would put the
    // permanently-stuck indicator this ticket exists to remove back on screen.
    // During rollout an old client's typing therefore shows as nothing, which
    // is the honest reading of a signal that cannot be aged out.
    final heartbeat = typingHeartbeats[userId];
    if (heartbeat == null) return false;
    final age = now.difference(heartbeat.toDate());
    // A clock skewed into the future would otherwise read as permanently
    // typing, which is the exact bug this replaced.
    if (age.isNegative) return age.abs() <= typingHeartbeatTtl;
    return age <= typingHeartbeatTtl;
  }

  /// The other participant, or null when there is nobody else on the thread.
  ///
  /// Only meaningful for a one-to-one thread. Group screens use
  /// [otherParticipants] and [typingParticipants] instead.
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
      typingStatus: parseLegacyTypingStatus(data['typingStatus']),
      typingHeartbeats: parseTypingHeartbeats(data['typingHeartbeats']),
      lastReadAt: parseReadWatermarks(data['lastReadAt']),
      inactive: data['inactive'] == true,
      isGroup: data['isGroup'] == true,
      participantNames: parseParticipantNames(data['participantNames']),
      createdBy:
          data['createdBy'] is String ? data['createdBy'] as String : null,
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
      'typingHeartbeats': typingHeartbeats,
      'lastReadAt': lastReadAt,
      'inactive': inactive,
      // Groups are only ever written by the server. Leaving these off a
      // one-to-one thread keeps its document exactly the shape it always was,
      // and the create rule refuses a client-written `isGroup: true` anyway.
      if (isGroup) ...{
        'isGroup': true,
        'participantNames': {
          for (final entry in participantNames.entries)
            entry.key: entry.value.toFirestore(),
        },
        if (createdBy != null) 'createdBy': createdBy,
      },
    };
  }
}

/// A group label from the first names of everyone but the viewer, in order.
///
/// Separate from [Chat.groupLabel] so the picker can label a group it has only
/// just asked the server for, before the chat document has arrived.
String formatGroupLabel(List<String> others) => switch (others.length) {
      0 => 'Just you',
      1 => others[0],
      2 => '${others[0]} & ${others[1]}',
      3 => '${others[0]}, ${others[1]} & ${others[2]}',
      _ => '${others[0]}, ${others[1]} & ${others.length - 2} others',
    };

/// One member's name as a group stores it.
@immutable
class ChatMemberName {
  final String firstName;
  final String lastName;

  const ChatMemberName({required this.firstName, required this.lastName});

  /// The first name, or the last when there is no first. Never blank.
  String get shortName {
    if (firstName.isNotEmpty) return firstName;
    if (lastName.isNotEmpty) return lastName;
    return 'Unknown';
  }

  String get fullName {
    final full = '$firstName $lastName'.trim();
    return full.isEmpty ? 'Unknown' : full;
  }

  Map<String, String> toFirestore() =>
      {'firstName': firstName, 'lastName': lastName};
}

/// Reads a group's roster of names, ignoring anything malformed.
///
/// Tolerant for the same reason as the other maps here: this runs inside the
/// mapping of the whole inbox snapshot, so one bad entry must cost a name, not
/// every conversation on screen.
Map<String, ChatMemberName> parseParticipantNames(Object? raw) {
  if (raw is! Map) return {};
  final names = <String, ChatMemberName>{};
  raw.forEach((key, value) {
    if (key is! String || value is! Map) return;
    String field(String name) {
      final v = value[name];
      return v is String ? v.trim() : '';
    }

    names[key] = ChatMemberName(
      firstName: field('firstName'),
      lastName: field('lastName'),
    );
  });
  return names;
}

/// Reads the read watermarks, ignoring anything that is not a timestamp.
///
/// Tolerant for the same reason as the typing maps: this is parsed inside the
/// mapping of the whole inbox snapshot, so one malformed value must cost an
/// indicator rather than every conversation on screen. A server timestamp is
/// briefly null locally between the write and the server's acknowledgement,
/// which is a normal value here and not a malformed one.
Map<String, Timestamp?> parseReadWatermarks(Object? raw) {
  if (raw is! Map) return {};
  final watermarks = <String, Timestamp?>{};
  raw.forEach((key, value) {
    if (key is! String) return;
    if (value is Timestamp) watermarks[key] = value;
  });
  return watermarks;
}

/// Reads the legacy boolean typing flags, ignoring anything that is not a bool.
///
/// Tolerant rather than strict on purpose: this app no longer acts on these
/// values, so a malformed one must not be allowed to throw and take the whole
/// inbox snapshot down with it — which is precisely the failure the old
/// client's `value as bool` cast produces.
Map<String, bool> parseLegacyTypingStatus(Object? raw) {
  if (raw is! Map) return {};

  final parsed = <String, bool>{};
  raw.forEach((key, value) {
    if (key is String && value is bool) parsed[key] = value;
  });
  return parsed;
}

/// Reads the typing heartbeats, ignoring anything that is not a timestamp.
Map<String, Timestamp?> parseTypingHeartbeats(Object? raw) {
  if (raw is! Map) return {};

  final parsed = <String, Timestamp?>{};
  raw.forEach((key, value) {
    if (key is! String) return;
    parsed[key] = value is Timestamp ? value : null;
  });
  return parsed;
}
