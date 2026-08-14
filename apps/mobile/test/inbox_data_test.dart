import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/chat_model.dart';
import 'package:tenacity/src/ui/messaging/inbox_data.dart';

void main() {
  final now = DateTime(2026, 7, 26, 14, 30);

  Chat chat({
    required String id,
    String lastMessage = 'Hello there',
    DateTime? updatedAt,
    Map<String, int> unread = const {},
    List<String> participants = const ['me', 'them'],
  }) {
    return Chat(
      id: id,
      participants: participants,
      lastMessage: lastMessage,
      updatedAt: Timestamp.fromDate(updatedAt ?? now),
      unreadCounts: unread,
      deletedFor: const {},
      typingStatus: const {},
    );
  }

  group('inboxTimeLabel', () {
    test('shows a clock time for today', () {
      expect(inboxTimeLabel(DateTime(2026, 7, 26, 16, 42), now), '4:42 PM');
    });

    test('names yesterday', () {
      expect(inboxTimeLabel(DateTime(2026, 7, 25, 9), now), 'Yesterday');
    });

    test('uses the weekday within the last week', () {
      expect(inboxTimeLabel(DateTime(2026, 7, 21, 9), now), 'Tue');
    });

    test('falls back to a date beyond a week', () {
      // The previous inbox showed a clock time here, so a month-old message
      // read as though it had arrived this afternoon.
      expect(inboxTimeLabel(DateTime(2026, 7, 6, 9), now), '6 Jul');
    });

    test('includes the year for an older conversation', () {
      expect(inboxTimeLabel(DateTime(2025, 11, 3, 9), now), '3 Nov 25');
    });
  });

  group('messageTimeLabel', () {
    test('a bare time for today', () {
      expect(
        messageTimeLabel(DateTime(2026, 7, 26, 17, 52), now),
        '5:52 PM',
      );
    });

    test('carries the day once it is not today', () {
      // A read receipt from three weeks ago previously read as though it had
      // happened this afternoon.
      expect(
        messageTimeLabel(DateTime(2026, 7, 25, 17, 52), now),
        'Yesterday, 5:52 PM',
      );
      expect(
        messageTimeLabel(DateTime(2026, 7, 21, 17, 52), now),
        'Tue, 5:52 PM',
      );
      expect(
        messageTimeLabel(DateTime(2026, 7, 6, 17, 52), now),
        '6 Jul, 5:52 PM',
      );
      expect(
        messageTimeLabel(DateTime(2025, 11, 3, 17, 52), now),
        '3 Nov 25, 5:52 PM',
      );
    });

    test('a time later today is still just a time', () {
      // Clock skew between devices can put a timestamp slightly ahead.
      expect(
        messageTimeLabel(DateTime(2026, 7, 26, 23, 15), now),
        '11:15 PM',
      );
    });
  });

  group('readReceiptLabel', () {
    test('reads naturally for today and for older threads', () {
      expect(
        readReceiptLabel(DateTime(2026, 7, 26, 17, 52), now),
        'Read 5:52 PM',
      );
      expect(
        readReceiptLabel(DateTime(2026, 7, 6, 17, 52), now),
        'Read 6 Jul, 5:52 PM',
      );
    });
  });

  group('initialsFor', () {
    test('takes first and last initials', () {
      expect(initialsFor('Jordan Lee'), 'JL');
      expect(initialsFor('Sarah Anne Nguyen'), 'SN');
    });

    test('handles a single name', () {
      expect(initialsFor('Admin'), 'A');
    });

    test('copes with extra whitespace and empties', () {
      expect(initialsFor('  Jordan   Lee  '), 'JL');
      expect(initialsFor(''), '?');
      expect(initialsFor('   '), '?');
    });

    test('does not break on a non-Latin name', () {
      expect(initialsFor('陈 伟'), '陈伟');
    });
  });

  group('previewFor', () {
    test('describes an attachment rather than showing the placeholder', () {
      expect(previewFor(attachmentPlaceholder), 'Sent an attachment.');
    });

    test('explains an empty thread instead of rendering a blank line', () {
      expect(previewFor(''), 'No messages yet');
      expect(previewFor('   '), 'No messages yet');
    });

    test('passes ordinary text through', () {
      expect(previewFor('See you Thursday!'), 'See you Thursday!');
    });
  });

  group('isTeamIdentity', () {
    test('recognises the team account regardless of case', () {
      expect(isTeamIdentity('Tenacity Team'), isTrue);
      expect(isTeamIdentity('tenacity tutoring'), isTrue);
    });

    test('does not claim a person', () {
      expect(isTeamIdentity('Jordan Lee'), isFalse);
      expect(isTeamIdentity('Tenacity Nguyen'), isFalse);
    });
  });

  group('buildInboxThreads', () {
    test('orders by most recent activity', () {
      final threads = buildInboxThreads(
        chats: [
          chat(id: 'old', updatedAt: DateTime(2026, 7, 20)),
          chat(id: 'new', updatedAt: DateTime(2026, 7, 26, 12)),
          chat(id: 'mid', updatedAt: DateTime(2026, 7, 24)),
        ],
        namesByChatId: const {
          'old': 'Old Thread',
          'new': 'New Thread',
          'mid': 'Mid Thread',
        },
        currentUserId: 'me',
        now: now,
      );

      expect(threads.map((t) => t.chatId), ['new', 'mid', 'old']);
    });

    test('reads the unread count for this user only', () {
      final threads = buildInboxThreads(
        chats: [
          chat(id: 'c1', unread: const {'me': 3, 'them': 9}),
        ],
        namesByChatId: const {'c1': 'Jordan Lee'},
        currentUserId: 'me',
        now: now,
      );

      expect(threads.single.unreadCount, 3);
    });

    test('filters on the other party name, case-insensitively', () {
      final chats = [
        chat(id: 'c1'),
        chat(id: 'c2'),
      ];
      const names = {'c1': 'Jordan Lee', 'c2': 'Priya Shah'};

      expect(
        buildInboxThreads(
          chats: chats,
          namesByChatId: names,
          currentUserId: 'me',
          now: now,
          query: 'jord',
        ).map((t) => t.chatId),
        ['c1'],
      );

      expect(
        buildInboxThreads(
          chats: chats,
          namesByChatId: names,
          currentUserId: 'me',
          now: now,
          query: '   ',
        ),
        hasLength(2),
        reason: 'a whitespace-only query should not filter anything out',
      );
    });

    test('omits a thread before its participant name has resolved', () {
      final threads = buildInboxThreads(
        chats: [chat(id: 'c1')],
        namesByChatId: const {},
        currentUserId: 'me',
        now: now,
      );

      expect(threads, isEmpty);
    });

    test('renders an explicit fallback after a lookup has completed', () {
      final threads = buildInboxThreads(
        chats: [chat(id: 'c1')],
        namesByChatId: const {'c1': 'Unknown User'},
        currentUserId: 'me',
        now: now,
      );

      expect(threads.single.name, 'Unknown User');
      expect(threads.single.initials, 'UU');
    });

    test('marks the team identity so it can carry the app icon', () {
      final threads = buildInboxThreads(
        chats: [chat(id: 'c1'), chat(id: 'c2')],
        namesByChatId: const {'c1': 'Tenacity Team', 'c2': 'Jordan Lee'},
        currentUserId: 'me',
        now: now,
      );

      expect(threads.firstWhere((t) => t.chatId == 'c1').isTeam, isTrue);
      expect(threads.firstWhere((t) => t.chatId == 'c2').isTeam, isFalse);
    });
  });
}
