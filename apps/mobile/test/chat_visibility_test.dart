import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/chat_model.dart';

/// The rule `ChatService.getUserChats` filters the inbox with. Tested on the
/// model rather than through Firestore so both ways a thread disappears are
/// pinned down.
Chat buildChat({
  Map<String, Timestamp?> deletedFor = const {},
  bool inactive = false,
}) {
  return Chat(
    id: 'chat-1',
    participants: const ['parent-1', 'tutor-1'],
    lastMessage: 'hello',
    updatedAt: Timestamp.fromDate(DateTime(2026, 8, 12)),
    unreadCounts: const {'parent-1': 0, 'tutor-1': 0},
    deletedFor: deletedFor,
    typingStatus: const {},
    inactive: inactive,
  );
}

void main() {
  group('Chat.isVisibleTo', () {
    test('an ordinary thread is visible to its participants', () {
      expect(buildChat().isVisibleTo('parent-1'), isTrue);
    });

    test('a thread the user deleted is hidden from them alone', () {
      final chat = buildChat(
        deletedFor: {'parent-1': Timestamp.fromDate(DateTime(2026, 8, 12))},
      );

      expect(chat.isVisibleTo('parent-1'), isFalse);
      expect(chat.isVisibleTo('tutor-1'), isTrue);
    });

    test('an inactive thread is hidden from everyone', () {
      // Set by the backend when a participant's account is deleted. Before
      // this existed the surviving participant saw an "Unknown User" row.
      final chat = buildChat(inactive: true);

      expect(chat.isVisibleTo('parent-1'), isFalse);
      expect(chat.isVisibleTo('tutor-1'), isFalse);
    });
  });

  group('Chat.fromFirestore', () {
    test('defaults inactive to false when the field is absent', () {
      // Every chat written before the field existed.
      final chat = Chat(
        id: 'c',
        participants: const ['a', 'b'],
        lastMessage: '',
        updatedAt: Timestamp.now(),
        unreadCounts: const {},
        deletedFor: const {},
        typingStatus: const {},
      );

      expect(chat.inactive, isFalse);
      expect(chat.isVisibleTo('a'), isTrue);
    });

    test('round-trips inactive through toFirestore', () {
      expect(buildChat(inactive: true).toFirestore()['inactive'], isTrue);
      expect(buildChat().toFirestore()['inactive'], isFalse);
    });
  });
}
