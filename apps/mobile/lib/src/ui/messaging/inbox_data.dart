import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/chat_model.dart';
import 'package:tenacity/src/services/chat_outbox.dart';

/// One conversation, ready to render.
@immutable
class InboxThread {
  final String chatId;
  final String name;
  final String preview;
  final String timeLabel;
  final int unreadCount;
  final String initials;

  /// True for the Tenacity team identity, which shows the app icon in place of
  /// initials.
  final bool isTeam;

  const InboxThread({
    required this.chatId,
    required this.name,
    required this.preview,
    required this.timeLabel,
    required this.unreadCount,
    required this.initials,
    required this.isTeam,
  });
}

/// Placeholder the chat service writes when a message carries a file rather
/// than text.
const attachmentPlaceholder = '[Attachment]';

/// Builds the inbox rows for [currentUserId].
///
/// Pure, so the naming, ordering and timestamp rules are testable without
/// Firestore. [namesByChatId] is resolved by the caller, which has to look each
/// participant up. Chats without a resolved entry are omitted so a loading
/// lookup is not presented as a real `Unknown` identity.
///
/// [query] filters on the other party's name, matching the existing behaviour.
List<InboxThread> buildInboxThreads({
  required List<Chat> chats,
  required Map<String, String> namesByChatId,
  required String currentUserId,
  required DateTime now,
  String query = '',
  List<OutboxEntry> outgoing = const [],
  Set<String> pendingMessageIds = const {},
}) {
  final trimmedQuery = query.trim().toLowerCase();
  final latestOutgoing = <String, OutboxEntry>{};
  for (final entry in outgoing) {
    if (entry.senderId != currentUserId) continue;
    final previous = latestOutgoing[entry.chatId];
    if (previous == null || !previous.createdAt.isAfter(entry.createdAt)) {
      latestOutgoing[entry.chatId] = entry;
    }
  }
  final activityTimes = <String, DateTime>{};

  final threads = <InboxThread>[];
  for (final chat in chats) {
    if (!chat.isVisibleTo(currentUserId)) continue;
    final name = namesByChatId[chat.id];
    if (name == null) continue;
    if (trimmedQuery.isNotEmpty && !name.toLowerCase().contains(trimmedQuery)) {
      continue;
    }

    final local = latestOutgoing[chat.id];
    final serverTime = chat.updatedAt.toDate();
    // A previous send can receive a server timestamp later than the next
    // message's local creation time. That must not hide the still-queued one.
    final useLocal = local != null &&
        (pendingMessageIds.contains(local.id) ||
            local.createdAt.isAfter(serverTime));
    final activityTime = useLocal && local.createdAt.isAfter(serverTime)
        ? local.createdAt
        : serverTime;
    activityTimes[chat.id] = activityTime;
    final preview = useLocal
        ? (local.text.trim().isNotEmpty ? local.text : attachmentPlaceholder)
        : chat.lastMessage;

    threads.add(
      InboxThread(
        chatId: chat.id,
        name: name,
        preview: previewFor(preview),
        timeLabel: inboxTimeLabel(activityTime, now),
        unreadCount: chat.unreadCounts[currentUserId] ?? 0,
        initials: initialsFor(name),
        isTeam: isTeamIdentity(name),
      ),
    );
  }

  // Most recently active first, so a reply moves its thread to the top.
  threads.sort((a, b) {
    final order = activityTimes[b.chatId]!.compareTo(activityTimes[a.chatId]!);
    return order != 0 ? order : a.chatId.compareTo(b.chatId);
  });

  return threads;
}

/// `Sent an attachment.` reads better in a list than the raw placeholder, and
/// an empty thread should not render as a blank line.
String previewFor(String lastMessage) {
  if (lastMessage == attachmentPlaceholder) return 'Sent an attachment.';
  if (lastMessage.trim().isEmpty) return 'No messages yet';
  return lastMessage;
}

/// Time for today, weekday within the last week, then an absolute date.
///
/// The previous inbox showed a clock time for every thread, so a message from
/// last month read as though it had arrived this afternoon.
String inboxTimeLabel(DateTime updatedAt, DateTime now) {
  final local = updatedAt.toLocal();
  final today = DateTime(now.year, now.month, now.day);
  final thatDay = DateTime(local.year, local.month, local.day);
  final daysAgo = today.difference(thatDay).inDays;

  if (daysAgo <= 0) return DateFormat('h:mm a').format(local);
  if (daysAgo == 1) return 'Yesterday';
  if (daysAgo < 7) return DateFormat('EEE').format(local);
  if (local.year == now.year) return DateFormat('d MMM').format(local);
  return DateFormat('d MMM yy').format(local);
}

/// When a message was sent or read, for use inside a thread.
///
/// A bare clock time is only unambiguous for today. Anything older carries the
/// day as well, degrading the same way [inboxTimeLabel] does — otherwise a
/// receipt from three weeks ago reads as though it happened this afternoon.
///
///   today      `5:52 PM`
///   yesterday  `Yesterday, 5:52 PM`
///   this week  `Tue, 5:52 PM`
///   older      `6 Jul, 5:52 PM`
String messageTimeLabel(DateTime timestamp, DateTime now) {
  final local = timestamp.toLocal();
  final time = DateFormat('h:mm a').format(local);

  final today = DateTime(now.year, now.month, now.day);
  final thatDay = DateTime(local.year, local.month, local.day);
  if (!today.isAfter(thatDay)) return time;

  return '${inboxTimeLabel(timestamp, now)}, $time';
}

/// `Read 5:52 PM`, or `Read 6 Jul, 5:52 PM` for an older thread.
String readReceiptLabel(DateTime readAt, DateTime now) =>
    'Read ${messageTimeLabel(readAt, now)}';

/// Up to two initials, so `Jordan Lee` reads as `JL` and `Admin` as `A`.
String initialsFor(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.characters.first.toUpperCase();
  return (parts.first.characters.first + parts.last.characters.first)
      .toUpperCase();
}

/// The Tenacity team account, which the design gives the app icon rather than
/// initials.
bool isTeamIdentity(String name) {
  final normalized = name.trim().toLowerCase();
  return normalized == 'tenacity team' || normalized == 'tenacity tutoring';
}
